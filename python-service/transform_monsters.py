#!/usr/bin/env python3
"""
Transform extracted monster JSON to proper YAML content format for TTRPG-Generator.
"""
import json
import yaml
import sys
import os

def transform_monster(m, source="Cursed Scroll 1"):
    """Transform raw monster to YAML content format."""
    name = m.get("name", "Unknown").title()
    
    # Generate ID
    name_slug = "".join(c if c.isalnum() else "_" for c in name.lower())
    entity_id = f"sd_monster_{name_slug}"
    
    # Build stats object
    stats = m.get("stats", {})
    
    # Build abilities list
    abilities = []
    for ab in m.get("abilities", []):
        abilities.append({
            "name": ab.get("name", ""),
            "desc": ab.get("desc", "")
        })
    
    # Build actions
    actions = []
    if m.get("attack"):
        actions.append({
            "name": "Attack",
            "desc": m.get("attack")
        })
    
    result = {
        "id": entity_id,
        "name": name,
        "type": "Monster",
        "game": "ShadowDark",
        "source": source,
        "properties": {
            "ac": str(m.get("ac", "")),
            "hp": str(m.get("hp", "")),
            "mv": m.get("mv", ""),
            "level": str(m.get("level", "")),
            "alignment": m.get("alignment", "N"),
            "stats": {
                "str": stats.get("str", "+0"),
                "dex": stats.get("dex", "+0"),
                "con": stats.get("con", "+0"),
                "int": stats.get("int", "+0"),
                "wis": stats.get("wis", "+0"),
                "cha": stats.get("cha", "+0"),
            },
            "flavor": m.get("flavor", "")
        },
        "abilities": abilities,
        "actions": actions,
        "description": m.get("flavor", "")
    }
    
    return result

def main():
    if len(sys.argv) < 2:
        print("Usage: transform_monsters.py <input.json> [output.yaml]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    with open(input_file, 'r') as f:
        monsters = json.load(f)
    
    transformed = [transform_monster(m) for m in monsters]
    
    if output_file:
        with open(output_file, 'w') as f:
            yaml.dump(transformed, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
        print(f"Saved {len(transformed)} monsters to {output_file}")
    else:
        print(yaml.dump(transformed, sort_keys=False, default_flow_style=False, allow_unicode=True))

if __name__ == "__main__":
    main()
