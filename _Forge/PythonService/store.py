import yaml
import json
import argparse
import os
import sys

class Store:
    def load_yaml(self, filepath):
        if not os.path.exists(filepath):
            return []
        try:
            with open(filepath, 'r') as f:
                return yaml.safe_load(f) or []
        except Exception as e:
            print(f"Error loading YAML {filepath}: {e}", file=sys.stderr)
            return []

    def save_yaml(self, data, filepath):
        try:
            with open(filepath, 'w') as f:
                # Custom Dumper to handle block style for long strings if needed, 
                # but default is usually fine.
                yaml.dump(data, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
        except Exception as e:
            print(f"Error saving YAML {filepath}: {e}", file=sys.stderr)

    def merge_data(self, existing_data, new_data):
        # Task 4.2: Asset Deduplication
        # Strategy: Use 'name' and 'source' as unique keys? Or 'id'?
        # If ID exists, overwrite.
        
        # Helper to ensure ID exists
        for item in new_data:
            if 'id' not in item:
                source_slug = item.get("source", "unknown").lower().replace(" ", "_")
                # Basic sanitization for ID
                name_slug = "".join(c if c.isalnum() else "_" for c in item.get("name", "unnamed").lower())
                type_slug = item.get('type','entity').lower()
                item['id'] = f"{source_slug}_{type_slug}_{name_slug}"
        
        # Create map of existing IDs
        existing_map = {item.get('id'): i for i, item in enumerate(existing_data) if 'id' in item}
        
        merged_count = 0
        added_count = 0
        
        for item in new_data:
            item_id = item.get('id')
            if item_id in existing_map:
                # Update existing
                idx = existing_map[item_id]
                existing_data[idx] = item
                merged_count += 1
            else:
                # Add new
                existing_data.append(item)
                existing_map[item_id] = len(existing_data) - 1
                added_count += 1
                
        return existing_data, merged_count, added_count

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', help='Path to new JSON data')
    parser.add_argument('--target', help='Path to target YAML file')
    args = parser.parse_args()
    
    if not args.input or not args.target:
        print("Error: --input and --target are required")
        sys.exit(1)
    
    store = Store()
    existing = store.load_yaml(args.target)
    
    try:
        with open(args.input, 'r') as f:
            new_data = json.load(f)
    except Exception as e:
        print(f"Error reading input JSON: {e}")
        sys.exit(1)
        
    if not isinstance(new_data, list):
        print("Error: Input JSON must be a list of objects")
        sys.exit(1)
        
    merged, merged_count, added_count = store.merge_data(existing, new_data)
    store.save_yaml(merged, args.target)
    
    result = {
        "status": "success",
        "merged": merged_count,
        "added": added_count,
        "total": len(merged)
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
