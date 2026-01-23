import json
import os
import yaml

# Configuration
JOB_DIR = "_Forge/Staging/CS4_v1"
INPUT_FILE = os.path.join(JOB_DIR, "results_smart.json")
OUTPUT_DIR = "_Forge/Import/CS4_v1_Result"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "shadowdark_Monster_V6.yaml")

def main():
    print(f"Exporting from {INPUT_FILE}...")
    
    if not os.path.exists(INPUT_FILE):
        print("Error: Input file (results_smart.json) NOT FOUND.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    items = data.get("items", [])
    print(f"Loaded {len(items)} items.")
    
    # Transform to YAML (list of objects)
    # Ensure structure matches TTRPG-Generator expectations (cards)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        yaml.dump(items, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
        
    print(f"Success! Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
