import os
import sys
import json
import subprocess
import argparse
from scribe import OllamaScribe
from transform_monsters import transform_monster
import yaml
import time

# Configuration
PYTHON_EXE = sys.executable
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))

JOBS = [
    {
        "name": "CursedScroll6",
        "pdf": os.path.join(PROJECT_ROOT, "_Forge", "Import", "Cursed Scroll 6 - City of Masks V1-1.pdf"),
        "source_name": "Cursed Scroll 6"
    },
    {
        "name": "SolKesh",
        "pdf": os.path.join(PROJECT_ROOT, "_Forge", "Import", "SolKesh_Bestiary.pdf"),
        "source_name": "SolKesh Bestiary"
    }
]

TEMPLATE_PATH = os.path.join(BASE_DIR, "Templates", "monster_schema.json")

def run_parser(pdf_path, output_dir):
    print(f"--- Parsing {pdf_path} ---")
    cmd = [PYTHON_EXE, os.path.join(BASE_DIR, "parser.py"), pdf_path, "--output-dir", output_dir]
    subprocess.check_call(cmd)

def extract_from_pages(manifest_path, scribe):
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    
    with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        template = json.load(f)
        
    all_monsters = []
    output_dir = os.path.dirname(manifest_path)
    
    total = len(manifest["pages"])
    print(f"--- Extracting from {total} pages ---")
    
    for i, page_file in enumerate(manifest["pages"]):
        page_path = os.path.join(output_dir, page_file)
        with open(page_path, 'r', encoding='utf-8') as f:
            page_data = json.load(f)
            
        text = page_data.get("text", "")
        # Skip empty or very short pages
        if len(text) < 100:
            print(f"Skipping page {i+1} (too short)")
            continue
            
        print(f"Processing page {i+1}/{total}...", end="", flush=True)
        
        # Constraints: Only extract if it looks like a monster stat block
        constraints = {"context_type": "Adventure"}
        
        try:
            results = scribe.process_segment(text, template, constraints)
            count = 0
            if isinstance(results, list):
                for m in results:
                    if "name" in m and "ac" in m: # Basic validation
                        all_monsters.append(m)
                        count += 1
            print(f" Found {count} monsters.")
        except Exception as e:
            print(f" Error: {e}")
            
    return all_monsters

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="llama3")
    args = parser.parse_args()
    
    scribe = OllamaScribe(model=args.model)
    
    for job in JOBS:
        print(f"\n=== STARTING JOB: {job['name']} ===")
        staging_dir = os.path.join(PROJECT_ROOT, "temp_staging", job["name"])
        
        # 1. Parse PDF
        try:
            run_parser(job["pdf"], staging_dir)
        except Exception as e:
            print(f"Parsing failed for {job['name']}: {e}")
            continue
            
        # 2. Extract
        manifest_path = os.path.join(staging_dir, "manifest.json")
        if not os.path.exists(manifest_path):
            print("Manifest not found, skipping.")
            continue
            
        raw_monsters = extract_from_pages(manifest_path, scribe)
        
        # Save raw extraction
        raw_output = os.path.join(staging_dir, "monsters_raw.json")
        with open(raw_output, 'w', encoding='utf-8') as f:
            json.dump(raw_monsters, f, indent=2)
            
        # 3. Transform
        print(f"--- Transforming {len(raw_monsters)} monsters ---")
        final_monsters = []
        for m in raw_monsters:
            try:
                final_monsters.append(transform_monster(m, source=job["source_name"]))
            except Exception as e:
                print(f"Failed to transform monster {m.get('name', '???')}: {e}")
                
        # Save final YAML
        output_yaml = os.path.join(PROJECT_ROOT, "_Forge", "Import", f"{job['name']}_Monsters.yaml")
        with open(output_yaml, 'w', encoding='utf-8') as f:
            yaml.dump(final_monsters, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
            
        print(f"✅ Saved {len(final_monsters)} monsters to {output_yaml}")

if __name__ == "__main__":
    main()
