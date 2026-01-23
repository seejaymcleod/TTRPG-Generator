import yaml
import json
import os
import sys

class SchemaManager:
    def __init__(self, game_dir, game_name):
        self.game_dir = game_dir
        self.game_name = game_name
        self.input_schema = self._load_yaml(f"{game_name}_InputSchema.yaml")
        self.content_schema = self._load_yaml(f"{game_name}_ContentSchema.yaml")

    def _load_yaml(self, filename):
        path = os.path.join(self.game_dir, filename)
        if not os.path.exists(path):
            # Fallback or empty if not strictly required, but for now strict
            return {}
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

    def get_detection_keywords(self, entity_type):
        """
        Derive keywords for 'Scouting' based on Input Schema (extraction_rules).
        """
        if 'extraction_rules' not in self.input_schema:
            return []
        
        rules = self.input_schema['extraction_rules']
        # Check types first
        if 'types' in rules and entity_type in rules['types']:
             # Parse 'detection' string if it exists, or just use type name
             # In SolKesh/SD, detection string is human readable, e.g. "Contains 'AC'..."
             # We might need a more structured keyword list in the future.
             # For now, let's hardcode a mapping or heuristics based on the "fields"
             pass

        # Heuristic: Check 'sections' in Input Schema
        keywords = []
        if 'sections' in rules:
             # Gather keys from field definitions
             for section_name, section_def in rules['sections'].items():
                 if 'fields' in section_def:
                     for k, v in section_def['fields'].items():
                         # Extract obvious keywords from pattern like "AC {value}"
                         parts = v.split('{')[0].strip()
                         if len(parts) > 1 and parts.isupper():
                             keywords.append(parts)
        
        # Fallback to hardcoded list if empty (Refine this later)
        if not keywords:
            if entity_type == "Monster": return ["AC", "HP", "ATK", "MV"]
            if entity_type == "Spell": return ["Tier", "Duration", "Range"]
        
        return list(set(keywords))

    def get_negative_keywords(self, entity_type):
        """
        Return keywords that strongly suggest this page is NOT the target type.
        """
        if entity_type == "Monster":
            # Spells have tiers/duration. Classes have "Features".
            return ["Duration:", "Range:", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5", "Class Features"]
        return []

    def get_strict_schema(self, entity_type):
        """
        Get Strict JSON Schema for LLM Validation from Content Schema.
        """
        if 'definitions' not in self.content_schema or entity_type not in self.content_schema['definitions']:
             raise ValueError(f"Entity type '{entity_type}' not found in Content Schema.")
        
        return self.content_schema['definitions'][entity_type]

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('game_dir')
    parser.add_argument('game_name')
    parser.add_argument('type')
    args = parser.parse_args()

    mgr = SchemaManager(args.game_dir, args.game_name)
    print("KEYWORDS:", mgr.get_detection_keywords(args.type))
    print("SCHEMA:", json.dumps(mgr.get_strict_schema(args.type), indent=2))
