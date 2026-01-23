import os
import sys
import json
import argparse
import time
from typing import Dict, Any, List
from schema_manager import SchemaManager
from scribe import OllamaScribe, GeminiScribe

class SmartExtractor:
    def __init__(self, job_dir: str, game: str, content_type: str, scribe, project_root: str):
        self.job_dir = job_dir
        self.game = game
        self.content_type = content_type
        self.scribe = scribe
        
        # Managers
        game_content_dir = os.path.join(project_root, "_Content", game)
        self.schema_mgr = SchemaManager(game_content_dir, game)
        
        self.strict_schema = self.schema_mgr.get_strict_schema(content_type)
        # Load the input schema to get the "Instructions" text
        self.input_schema = self._load_input_schema(game_content_dir)
        
        # Paths
        self.pages_dir = os.path.join(job_dir, "Pages")
        self.results_path = os.path.join(job_dir, "results_smart.json")

    def _load_input_schema(self, game_dir):
        path = os.path.join(game_dir, f"{self.game}_InputSchema.yaml")
        # Reuse SchemaManager's yaml loader if possible, or just raw load
        # For now, we rely on what SchemaManager exposes, or we assume specific structure
        # Let's check if schema_mgr has it. It usually parses it. 
        # We'll just read the 'instructions' from the type definition via SchemaManager if possible.
        # Actually SchemaManager methods focus on validation schema. Let's rely on specific instructions passed to scribe.
        return {}

    def _get_type_instructions(self):
        # Hardcoded fallback or smart lookup
        # In a real V5, SchemaManager would expose verify_rules properly.
        # For now, we inject the "Rock Solid" rules we just edited into the YAML.
        return "Extract standard monster stat block. IGNORE independent bold headers that lack stats (e.g. Group Headers). A Monster MUST have AC and HP lines."

    def _split_into_blocks(self, text: str) -> List[str]:
        """
        Split dense page text into potential monster blocks.
        Heuristic: Look for ALL CAPS headers that are followed closely by 'AC' and 'HP'.
        """
        lines = text.split('\n')
        blocks = []
        current_block = []
        
        # Simple finite state machine
        # We want to break BEFORE a new Header IF that header looks like a monster start
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line: continue
            
            # Check if this line is a potential Header
            # Criteria: ALL CAPS, length > 2
            is_header = line.isupper() and len(line) > 2 and not line.startswith("AC ")
            
            # Check context: Does a Stat Line follow within 1-7 lines?
            # Stat Line = starts with "AC" or contains "HP "
            has_stat_context = False
            if is_header:
                for j in range(1, 8):
                    if i + j < len(lines):
                        check = lines[i+j].upper().strip()
                        if check.startswith("AC ") or " HP " in check or check.startswith("HP "):
                            has_stat_context = True
                            break
            
            if is_header and has_stat_context:
                # This is a Split Point!
                if current_block:
                    blocks.append("\n".join(current_block))
                    current_block = []
            
            current_block.append(line)
            
        if current_block:
            blocks.append("\n".join(current_block))
            
        return blocks if blocks else [text]

    def _scout_page(self, text: str) -> bool:
        """
        Fast Heuristic to skip pages that definitely don't have monsters.
        Checks for presence of 'AC ', 'HP ', AND 'MV ' (Movement) before engaging LLM.
        """
        if not text: return False
        t_up = text.upper()
        
        # Negative Keywords (Skip Spells/Classes)
        negatives = ["DURATION:", "RANGE:", "TIER 1", "TIER 2", "CLASS FEATURES"]
        # Spells often have "Duration:" or "Tier". If found, be very skeptical.
        # But some monster pages might mention spells.
        # The key discriminator for a ShadowDark monster is "MV" (Movement). 
        # Spells don't have MV. Items don't have MV.
        
        has_ac = "AC " in t_up or "\nAC" in t_up
        has_hp = "HP " in t_up or "\nHP" in t_up
        has_mv = "MV " in t_up or "MV (" in t_up or "\nMV" in t_up
        
        # Must have ALL three for a high-confidence monster page
        return has_ac and has_hp and has_mv

    def run(self):
        print(f"--- Smart Extraction (V7 - Strict & Integrated): {self.game} / {self.content_type} ---")
        
        import re
        # S +4, D +2, C +2, I -2, W +1, Ch -2
        stat_pattern = re.compile(r"(?:S|STR)[\s:]*([+-]?\d+).*?(?:D|DEX)[\s:]*([+-]?\d+).*?(?:C|CON)[\s:]*([+-]?\d+).*?(?:I|INT)[\s:]*([+-]?\d+).*?(?:W|WIS)[\s:]*([+-]?\d+).*?(?:Ch|CHA)[\s:]*([+-]?\d+)", re.IGNORECASE)
        
        # Blocklist for known non-monsters that look like monsters
        blocklist = ["TOXIN", "BARKSKIN", "TREESHAPE", "BASILISK HATCHLING", "MONSTER 1", "ANIMA"]

        page_files = sorted([f for f in os.listdir(self.pages_dir) if f.endswith(".json")])
        all_items = []
        
        for i, filename in enumerate(page_files):
            # Process all pages
            path = os.path.join(self.pages_dir, filename)
            with open(path, 'r', encoding='utf-8') as f:
                page_data = json.load(f)
            text = page_data.get("text", "")

            # 0. SCOUT (Optimization)
            if not self._scout_page(text):
                print(f"[{i+1}/{len(page_files)}] Skipping {filename} (No AC/HP/MV detected).")
                continue

            print(f"[{i+1}/{len(page_files)}] Analyzing {filename}...", end="", flush=True)
            
            # 1. SPLIT
            blocks = self._split_into_blocks(text)
            print(f" (Split into {len(blocks)} blocks)...")
            
            for b_idx, block_text in enumerate(blocks):
                # 2. EXTRACT per block
                extraction_schema = {
                    "type": "object",
                    "properties": {
                        "items": { "type": "array", "items": self.strict_schema }
                    },
                    "required": ["items"]
                }
                
                instructions = self._get_type_instructions()
                
                result = self.scribe.process_segment(
                    block_text, 
                    extraction_schema, 
                    {
                        "context_type": f"{self.game} {self.content_type}",
                        "instructions": instructions + " Extract exactly one entity if present. CRITICAL: If no Stat Block (AC/HP) exists, return [].",
                        "strict_headers": True 
                    }
                )
                
                # Handle error responses
                if isinstance(result, list) and result and "error" in result[0]:
                    print(f"   Block {b_idx+1}: ERROR {result[0]['error']}")
                    items = []
                else:
                    items = result.get("items", []) if isinstance(result, dict) else result
                
                if items:
                    # Enrich and Filter
                    valid = []
                    for item in items:
                        name = item.get("name", "Unknown")
                        
                        # Filter A: Blocklist
                        if name.upper() in blocklist or "MONSTER" in name.upper():
                             print(f"(Dropped {name} - Blocklist)")
                             continue
                        
                        # Filter B: AC Check
                        props = item.get("properties", {})
                        ac = props.get("ac")
                        if not ac:
                            print(f"(Dropped {name} - No AC)")
                            continue
                            
                        # Repair Stats: Look for 'stats_line' (Schema v1.2)
                        # It might be in 'attributes' or 'properties' depending on how Scribe flattened it.
                        # We check all likely places.
                        attributes = item.get("attributes", {})
                        stats_line = props.get("stats_line") or attributes.get("stats_line")
                        
                        # Also check if it's mixed into description
                        desc = item.get("description", "") or ""
                        flavor = props.get("flavor", "") or ""
                        full_text = f"{stats_line} {desc} {flavor}"
                        
                        match = stat_pattern.search(full_text)
                        if match:
                            if "stats" not in props: props["stats"] = {}
                            props["stats"]["str"] = match.group(1)
                            props["stats"]["dex"] = match.group(2)
                            props["stats"]["con"] = match.group(3)
                            props["stats"]["int"] = match.group(4)
                            props["stats"]["wis"] = match.group(5)
                            props["stats"]["cha"] = match.group(6)
                            # print(f"(Parsed stats for {name}: {match.group(1)}/{match.group(2)}...)")
                        else:
                            # If we still fail to extract stats, warn but keep (might be partial extract)
                            # print(f"(Warning: No stats found for {name})")
                            pass
                        
                        valid.append(item)

                    if valid:
                         print(f"   Block {b_idx+1}: Found {[x['name'] for x in valid]}")
                         all_items.extend(valid)
                    else:
                         print(f"   Block {b_idx+1}: (Filtered invalid)")
                else:
                    print(f"   Block {b_idx+1}: -")

        # Save to STAGING (User request)
        output_file = os.path.join(self.job_dir, f"{self.game}_{self.content_type}_Final.yaml")
        if all_items:
            import yaml
            with open(output_file, 'w', encoding='utf-8') as f:
                yaml.dump(all_items, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
            print(f"Saved {len(all_items)} clean items to {output_file}")
        else:
             print("No items found.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smart Content Extractor (V6)")
    parser.add_argument('--job-dir', required=True, help="Path to job directory (e.g. _Forge/Staging/CS4_v1)")
    parser.add_argument('--game', required=True, help="Game System (e.g. ShadowDark)")
    parser.add_argument('--type', required=True, help="Content Type (e.g. Monster)")
    parser.add_argument('--provider', choices=['ollama', 'gemini'], default='ollama', help="LLM Provider")
    parser.add_argument('--model', default='llama3.2:latest', help="Model Name (e.g. llama3.2:latest, gemini-2.0-flash)")
    parser.add_argument('--api-key', default=None, help="API Key for Gemini (or set GEMINI_API_KEY env var)")
    
    args = parser.parse_args()
    
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    
    if args.provider == 'gemini':
        scribe = GeminiScribe(api_key=args.api_key, preferred_model=args.model)
    else:
        scribe = OllamaScribe(model=args.model)
    
    extractor = SmartExtractor(args.job_dir, args.game, args.type, scribe, project_root)
    extractor.run()
