import os
import sys
import json
import yaml
import argparse

def main():
    parser = argparse.ArgumentParser(description='Export results to clean YAML')
    parser.add_argument('--job-dir', required=True)
    parser.add_argument('--game', required=True)
    parser.add_argument('--type', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()

    results_path = os.path.join(args.job_dir, "results.json")
    if not os.path.exists(results_path):
        print(f"No results found at {results_path}")
        return

    with open(results_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    clean_items = []
    for item in data.get("items", []):
        # Filter internal keys
        clean = {k: v for k, v in item.items() if not k.startswith("_")}
        
        # Optional: Remove empty keys if strictness allows, but for now keep schema shape
        # Actually, for YAML readability, removing completely empty structures is nice
        # but the schema enforces them. Let's keep them for consistency.
        
        clean_items.append(clean)

    os.makedirs(args.output_dir, exist_ok=True)
    output_filename = f"{args.game.lower().replace(' ', '')}_{args.type}_Built.yaml"
    output_path = os.path.join(args.output_dir, output_filename)

    with open(output_path, 'w', encoding='utf-8') as f:
        yaml.dump(clean_items, f, sort_keys=False, default_flow_style=False, allow_unicode=True)

    print(f"Exported {len(clean_items)} items to {output_path}")

if __name__ == "__main__":
    main()
