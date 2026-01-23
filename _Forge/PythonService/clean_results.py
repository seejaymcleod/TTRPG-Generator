import yaml
import os

INPUT_FILE = "_Forge/Import/CS4_v1_Result/shadowdark_Monster_V6.yaml"
OUTPUT_FILE = "_Forge/Import/CS4_v1_Result/shadowdark_Monster_FINAL.yaml"

def clean():
    if not os.path.exists(INPUT_FILE):
        print("Input file not found.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    print(f"Loaded {len(data)} items.")
    
    clean_items = []
    seen_names = set()
    
    # Blocklist of known traits extracted as monsters
    blocklist = ["Toxin", "Basilisk Hatchling", "Barkskin", "Treeshape", "TREESHAPE"]

    import re
    # S +4, D +2, C +2, I -2, W +1, Ch -2
    stat_pattern = re.compile(r"(?:S|STR)[\s:]*([+-]?\d+).*?(?:D|DEX)[\s:]*([+-]?\d+).*?(?:C|CON)[\s:]*([+-]?\d+).*?(?:I|INT)[\s:]*([+-]?\d+).*?(?:W|WIS)[\s:]*([+-]?\d+).*?(?:Ch|CHA)[\s:]*([+-]?\d+)", re.IGNORECASE)

    for item in data:
        name = item.get("name", "Unknown")
        
        # Filter 1: Blocklist
        if name in blocklist or name.upper() in blocklist:
            print(f"dropping {name} (Blocklist)")
            continue
            
        # Filter 2: Null Stats (Spells often have null stats in this schema)
        # REPAIR: Try to parse stats from Description if missing
        description = item.get("description", "") or ""
        # Sometimes description is in properties['flavor']
        flavor = item.get("properties", {}).get("flavor", "") or ""
        
        full_text = f"{description} {flavor}"
        
        match = stat_pattern.search(full_text)
        if match:
            # We found stats!
            print(f"Repairing Stats for {name}: {match.groups()}")
            if "properties" not in item: item["properties"] = {}
            if "stats" not in item["properties"]: item["properties"]["stats"] = {}
            
            item["properties"]["stats"]["str"] = match.group(1)
            item["properties"]["stats"]["dex"] = match.group(2)
            item["properties"]["stats"]["con"] = match.group(3)
            item["properties"]["stats"]["int"] = match.group(4)
            item["properties"]["stats"]["wis"] = match.group(5)
            item["properties"]["stats"]["cha"] = match.group(6)
        
        stats = item.get("properties", {}).get("stats", {})
        # If stats is still None/Empty, check AC
        ac = item.get("properties", {}).get("ac")
        if not ac:
             print(f"dropping {name} (No AC/Stats)")
             continue
        
        # Filter 3: Source "Core Rulebook" (Hallucinations)
        source = item.get("source", "")
        if "Core Rulebook" in str(source):
             print(f"dropping {name} (Core Rulebook hallucination)")
             continue

        clean_items.append(item)
             
        # Filter 4: Deduplicate by Name (optional, but good for Javelina)
        # Actually Javelina has "Diseased" variant. Keep both?
        # Let's keep duplicate names if they look distinct.
        # But "Skandrill" and "Skandrill, Rex" are distinct.
        
        clean_items.append(item)

    print(f"Retained {len(clean_items)} valid monsters.")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        yaml.dump(clean_items, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
    
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    clean()
