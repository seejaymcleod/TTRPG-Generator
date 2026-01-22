import os
import sys
import json
import subprocess
import argparse
import time
from scribe import OllamaScribe, GeminiScribe

# Configuration
PYTHON_EXE = sys.executable
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
STAGING_DIR = os.path.join(PROJECT_ROOT, "_Forge", "Staging")

# Map Games to Template Configs
GAME_CONFIG = {
    "shadowdark": {
        "template_path": os.path.join(PROJECT_ROOT, "_Content", "ShadowDark", "ShadowDark_Templates.yaml"),
        "format": "shadowdark"
    },
    "solkesh": {
        "template_path": os.path.join(PROJECT_ROOT, "_Content", "SolKesh", "SolKesh_ContentSchema.yaml"),
        "format": "solkesh"
    },
    "knave": {
        "template_path": os.path.join(PROJECT_ROOT, "_Content", "Knave", "Knave_Templates.yaml"),
        "format": "shadowdark" # Knave usually follows similar structure, guessing for now. 
        # TODO: Verify Knave format if it differs.
    }
}

def ensure_staging_exists():
    if not os.path.exists(STAGING_DIR):
        os.makedirs(STAGING_DIR)

def run_parser(pdf_path, job_id):
    """Run parser.py to chunk PDF"""
    output_dir = os.path.join(STAGING_DIR, job_id)
    manifest_path = os.path.join(output_dir, "manifest.json")
    
    if os.path.exists(manifest_path):
        print(f"Set '{job_id}' already parsed. Skipping parser.")
        return manifest_path

    print(f"--- Parsing PDF for {job_id} ---")
    cmd = [PYTHON_EXE, os.path.join(BASE_DIR, "parser.py"), pdf_path, "--output-dir", output_dir]
    subprocess.check_call(cmd)
    
    if not os.path.exists(manifest_path):
        raise Exception("Parser finished but manifest.json not found.")
        
    return manifest_path

def generate_schema(game, content_type):
    """Run transform_schema.py to get JSON Schema"""
    config = GAME_CONFIG.get(game.lower())
    if not config:
        raise ValueError(f"Unknown game: {game}")
        
    print(f"--- Generating Schema for {game} > {content_type} ---")
    cmd = [
        PYTHON_EXE, 
        os.path.join(BASE_DIR, "transform_schema.py"),
        "--template", config["template_path"],
        "--type", content_type,
        "--format", config["format"]
    ]
    
    result = subprocess.check_output(cmd, text=True)
    return json.loads(result)

def extract_content(manifest_path, schema, scribe, content_type):
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    
    all_items = []
    output_dir = os.path.dirname(manifest_path)
    total = len(manifest["pages"])
    
    print(f"--- Extracting {content_type} from {total} pages ---")
    
    for i, page_file in enumerate(manifest["pages"]):
        page_path = os.path.join(output_dir, page_file)
        with open(page_path, 'r', encoding='utf-8') as f:
            page_data = json.load(f)
            
        text = page_data.get("text", "")
        if len(text) < 100: continue
            
        print(f"Page {i+1}/{total}...", end="", flush=True)
        
        # Constraints could be dynamic later
        constraints = {"context_type": "Adventure"} 
        
        try:
            results = scribe.process_segment(text, schema, constraints)
            count = 0
            if isinstance(results, list):
                for item in results:
                    # Basic validation - check for required fields from schema if possible
                    # For now just trust the scribe output
                    all_items.append(item)
                    count += 1
            print(f" Found {count}.")
        except Exception as e:
            print(f" Error: {e}")
            
    return all_items

def main():
    parser = argparse.ArgumentParser(description='Forge Content Extractor')
    parser.add_argument("--game", required=True, help="Game name (shadowdark, solkesh, knave)")
    parser.add_argument("--type", required=True, help="Content Type (Monster, Spell, Item)")
    parser.add_argument("--pdf", required=True, help="Path to source PDF")
    
    parser.add_argument("--provider", default="ollama", choices=["ollama", "gemini"])
    parser.add_argument("--model", default="llama3.2:latest")
    parser.add_argument("--api-key", default=None)
    
    args = parser.parse_args()
    
    # 1. Setup Scribe
    scribe = None
    if args.provider == 'ollama':
        scribe = OllamaScribe(model=args.model)
    else:
        scribe = GeminiScribe(api_key=args.api_key, preferred_model=args.model)

    # 2. Generate Schema
    try:
        schema = generate_schema(args.game, args.type)
    except Exception as e:
        print(f"Failed to generate schema: {e}")
        sys.exit(1)
        
    # 3. Parse PDF
    ensure_staging_exists()
    job_id = f"{args.game}_{os.path.basename(args.pdf).replace('.pdf', '')}"
    
    try:
        manifest_path = run_parser(args.pdf, job_id)
    except Exception as e:
        print(f"Failed to parse PDF: {e}")
        sys.exit(1)
        
    # 4. Extract
    items = extract_content(manifest_path, schema, scribe, args.type)
    
    # 5. Save Output
    output_filename = f"{args.game}_{args.type}_Extracted.json"
    output_path = os.path.join(PROJECT_ROOT, "_Forge", "Import", output_filename)
    
    # Ensure Import dir exists
    if not os.path.exists(os.path.dirname(output_path)):
        os.makedirs(os.path.dirname(output_path))
        
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(items, f, indent=2)
        
    print(f"\n✅ Extraction Complete.")
    print(f"Found {len(items)} items.")
    print(f"Saved to: {output_path}")

if __name__ == "__main__":
    main()
