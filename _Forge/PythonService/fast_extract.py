import os
import sys
import json
import argparse
import time
from typing import Dict, Any, List
from schema_manager import SchemaManager
from scribe import OllamaScribe, GeminiScribe

class FastExtractor:
    def __init__(self, job_dir: str, game: str, content_type: str, scribe, project_root: str):
        self.job_dir = job_dir
        self.game = game
        self.content_type = content_type
        self.scribe = scribe
        
        # Paths
        self.pages_dir = os.path.join(job_dir, "Pages")
        self.state_path = os.path.join(job_dir, "job_state.json")
        self.results_path = os.path.join(job_dir, "results.json") # We still emit results for the UI/Builder
        
        # Setup Schema Manager
        game_content_dir = os.path.join(project_root, "_Content", game)
        self.schema_mgr = SchemaManager(game_content_dir, game)
        
        # Load Resources
        self.keywords = self.schema_mgr.get_detection_keywords(content_type)
        self.negative_keywords = self.schema_mgr.get_negative_keywords(content_type)
        self.strict_schema = self.schema_mgr.get_strict_schema(content_type)
        
        # Load State
        self.state = self._load_json(self.state_path, {"pages": {}})
        self.results = self._load_json(self.results_path, {"items": []})

    def _load_json(self, path: str, default: Any) -> Any:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return default

    def _save_json(self, path: str, data: Any):
        temp = path + ".tmp"
        with open(temp, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        if os.path.exists(path):
            os.remove(path)
        os.rename(temp, path)

    def _update_page_state(self, filename: str, status: str, error: str = None):
        if filename not in self.state["pages"]:
            self.state["pages"][filename] = {}
        
        self.state["pages"][filename]["status"] = status
        self.state["pages"][filename]["last_updated"] = time.time()
        if error:
            self.state["pages"][filename]["error"] = error
        elif "error" in self.state["pages"][filename]:
            del self.state["pages"][filename]["error"]
            
        self._save_json(self.state_path, self.state)

    def _scout_page(self, text: str) -> bool:
        """
        Strict heuristic: 
        1. must NOT contain negative keywords.
        2. must contain ESSENTIAL positive keywords (AC + HP for monsters).
        """
        if not text or len(text) < 50:
            return False
        
        text_upper = text.upper()

        # 1. Negative Check
        for neg in self.negative_keywords:
            if neg.upper() in text_upper:
                # Early exit: This is likely a Spell or Class page
                # print(f" [Skipped: has {neg}]", end="") 
                return False

        # 2. Positive Check
        # For Monster, we really want AC and HP.
        hits = 0
        essentials = ["AC", "HP"]
        for kw in essentials:
            if kw in text_upper: # AC is short, but usually distinct with space. 
                 # Safety: check boundaries? " AC "
                 if f" {kw} " in f" {text_upper} " or f"\n{kw} " in text_upper:
                     hits += 1
        
        if hits >= 2: return True
        
        return False

    def _validate_item(self, item: Dict) -> bool:
        """
        Basic validation against the strict schema required fields.
        """
        required = self.strict_schema.get("required", [])
        for req in required:
            if req not in item:
                return False
        return True

    def run(self):
        print(f"--- Fast Lane Extraction: {self.game} / {self.content_type} ---")
        print(f"Keywords: {self.keywords}")
        
        # List pages from disk to be safe
        page_files = sorted([f for f in os.listdir(self.pages_dir) if f.endswith(".json")])
        total = len(page_files)
        
        for i, filename in enumerate(page_files):
            # Check existing state
            current_state = self.state["pages"].get(filename, {}).get("status")
            if current_state in ["verified", "ignored"]:
                continue 

            print(f"[{i+1}/{total}] Processing {filename}...", end="", flush=True)
            
            # Load content
            page_path = os.path.join(self.pages_dir, filename)
            with open(page_path, 'r', encoding='utf-8') as f:
                page_data = json.load(f)
            text = page_data.get("text", "")
            
            # 1. SCOUT
            if not self._scout_page(text):
                print(" Skipped (No keywords)")
                self._update_page_state(filename, "ignored")
                continue
            
            # 2. EXTRACT
            print(" Extracting...", end="", flush=True)
            try:
                # Wrap strict schema in an object for stability (LLMs prefer objects over root arrays)
                extraction_schema = {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": self.strict_schema
                        }
                    },
                    "required": ["items"]
                }
                
                extracted_data = self.scribe.process_segment(
                    text, 
                    extraction_schema, 
                    {"context_type": f"{self.game} {self.content_type} (Only exact matches. Return empty keys if not found, or empty list if no entity exists.)"}
                )
                print(f"DEBUG RAW: {extracted_data}")
                
                if not extracted_data:
                     print(" Empty result.")
                     self._update_page_state(filename, "empty")
                     continue

                # Unwrap
                extracted_items = extracted_data.get("items", [])
                if not extracted_items and isinstance(extracted_data, list):
                     # Fallback if LLM ignored wrapper
                     extracted_items = extracted_data
                
                if not extracted_items:
                    print(" Empty result.")
                    self._update_page_state(filename, "empty")
                    continue
                    
                if isinstance(extracted_items, dict):
                    extracted_items = [extracted_items]
                
                # 3. VALIDATE
                valid_items = []
                for item in extracted_items:
                    if self._validate_item(item):
                        item["_source_page"] = filename
                        valid_items.append(item)
                    else:
                        print(f" [Invalid Item: Missing keys]", end="")
                
                if valid_items:
                    print(f" Success! ({len(valid_items)} items)")
                    self.results["items"].extend(valid_items)
                    self._save_json(self.results_path, self.results)
                    self._update_page_state(filename, "verified")
                else:
                    print(" Failed validation.")
                    # This is where we flag for Deep Loop
                    self._update_page_state(filename, "needs_retry", "Validation failed")

            except Exception as e:
                print(f" Error: {e}")
                self._update_page_state(filename, "needs_retry", str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--job-dir', required=True)
    parser.add_argument('--game', required=True)
    parser.add_argument('--type', required=True)
    parser.add_argument('--provider', default='ollama')
    parser.add_argument('--model', default='llama3.2:latest')
    parser.add_argument('--api-key', default=None)
    
    args = parser.parse_args()
    
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    
    if args.provider == 'ollama':
        scribe = OllamaScribe(model=args.model)
    else:
        scribe = GeminiScribe(api_key=args.api_key, preferred_model=args.model)
        
    extractor = FastExtractor(args.job_dir, args.game, args.type, scribe, project_root)
    extractor.run()
