import os
import sys
import json
import argparse
import time
from scribe import OllamaScribe, GeminiScribe

def classify_pages(job_dir, scribe):
    print(f"--- Classifying Pages in {job_dir} ---")
    
    pages_dir = os.path.join(job_dir, "Pages")
    if not os.path.exists(pages_dir):
        print("Pages directory not found.")
        return

    manifest_path = os.path.join(job_dir, "manifest.json")
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    classification_path = os.path.join(job_dir, "classification.json")
    classifications = []
    
    # Resume support
    processed_files = set()
    if os.path.exists(classification_path):
        with open(classification_path, 'r', encoding='utf-8') as f:
            classifications = json.load(f)
            processed_files = {c["file"] for c in classifications}
            print(f"Resuming classification ({len(processed_files)} pages already done)...")

    # Schema for classification
    schema = {
        "type": "object",
        "properties": {
            "page_type": {
                "type": "string", 
                "enum": ["Monster", "Spell", "Item", "Rules", "Lore", "Map", "TOC", "Other"],
                "description": "Primary content type of the page"
            },
            "summary": {
                "type": "string",
                "description": "One sentence summary of the page content"
            },
            "confidence": {
                "type": "integer",
                "description": "Confidence score 1-10"
            }
        },
        "required": ["page_type", "summary"]
    }

    pages = manifest.get("pages", [])
    total = len(pages)

    for i, page_file in enumerate(pages):
        # Handle manifest format variations
        filename = page_file if isinstance(page_file, str) else page_file["file"]
        
        if filename in processed_files:
            continue

        page_path = os.path.join(pages_dir, filename)
        if not os.path.exists(page_path):
            continue

        print(f"Classifying {i+1}/{total} ({filename})...", end="", flush=True)

        with open(page_path, 'r', encoding='utf-8') as f:
            page_data = json.load(f)
            
        text = page_data.get("text", "")
        if len(text) < 50:
            print(" Skipped (Empty)")
            classifications.append({
                "file": filename,
                "page_type": "Other",
                "summary": "Empty or image-only page",
                "confidence": 10
            })
            continue

        try:
            # We treat the classification prompt as a "segment" extraction
            result = scribe.process_segment(
                text[:2000], # Limit context to first 2000 chars for speed/cost
                schema,
                {"context_type": "Classification"}
            )
            
            # Scribe returns a list of items usually, but we want the first object
            if isinstance(result, list) and len(result) > 0:
                info = result[0]
            elif isinstance(result, dict):
                info = result
            else:
                info = {"page_type": "Unknown", "summary": "Failed to parse result"}

            info["file"] = filename
            classifications.append(info)
            summary = info.get('summary') or ""
            print(f" -> {info.get('page_type')}: {summary[:40]}...")

            # Atomic Save
            temp_path = classification_path + ".tmp"
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(classifications, f, indent=2)
            os.replace(temp_path, classification_path)

        except Exception as e:
            print(f" Error: {e}")

    print(f"\n✅ Classification Complete. Saved to {classification_path}")
    return classifications

def main():
    parser = argparse.ArgumentParser(description='Phase 1.5: Page Classification')
    parser.add_argument('--job-dir', required=True)
    parser.add_argument('--provider', default='ollama')
    parser.add_argument('--model', default='llama3.2:latest')
    parser.add_argument('--api-key', default=None)
    
    args = parser.parse_args()
    
    if args.provider == 'ollama':
        scribe = OllamaScribe(model=args.model)
    else:
        scribe = GeminiScribe(api_key=args.api_key, preferred_model=args.model)

    classify_pages(args.job_dir, scribe)

if __name__ == "__main__":
    main()
