import os
import sys
import json
import argparse
import time
from scribe import OllamaScribe, GeminiScribe
from schema_manager import SchemaManager

# Configuration
PAGE_FILE = "_Forge/Staging/CS4_v1/Pages/page_060.json"
GAME = "ShadowDark"
TYPE = "Monster"
OUTPUT_DIR = "_Forge/Staging/CS4_v1/Benchmark"

MODELS = [
    {"provider": "ollama", "model": "llama3.2:latest"},
    # We will try to detect if Gemini is viable
    {"provider": "gemini", "model": "gemini-2.0-flash"},
    {"provider": "gemini", "model": "gemini-1.5-flash"},
]

def run_benchmark():
    print(f"--- Benchmarking Extraction on {PAGE_FILE} ---")
    
    # Setup
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    schema_mgr = SchemaManager(os.path.join(project_root, "_Content", GAME), GAME)
    strict_schema = schema_mgr.get_strict_schema(TYPE)
    
    # Load Text
    with open(PAGE_FILE, 'r', encoding='utf-8') as f:
        page_data = json.load(f)
    text = page_data.get("text", "")
    
    # Wrap Schema (V4 style)
    extraction_schema = {
        "type": "object",
        "properties": {
            "items": { "type": "array", "items": strict_schema }
        },
        "required": ["items"]
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    summary = []

    for config in MODELS:
        provider = config["provider"]
        model_name = config["model"]
        print(f"\n[Testing {provider.upper()} : {model_name}]")
        
        try:
            if provider == "ollama":
                scribe = OllamaScribe(model=model_name)
            else:
                # Check for API Key validity implicitly
                if not os.getenv("GEMINI_API_KEY"):
                    print("  Skipping (No GEMINI_API_KEY found)")
                    continue
                scribe = GeminiScribe(preferred_model=model_name)
            
            start_time = time.time()
            result = scribe.process_segment(
                text, 
                extraction_schema, 
                {"context_type": f"{GAME} {TYPE} (Strict. No duplicates. Do not extract headers as monsters.)"}
            )
            duration = time.time() - start_time
            
            # Extract items
            items = result.get("items", []) if isinstance(result, dict) else result
            
            # Save
            filename = f"results_{provider}_{model_name.replace(':', '_')}.json"
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({"model": model_name, "duration": duration, "items": items}, f, indent=2)
                
            print(f"  Success: {len(items)} items in {duration:.2f}s")
            summary.append({
                "model": model_name,
                "count": len(items),
                "duration": duration,
                "names": [i.get("name") for i in items]
            })

        except Exception as e:
            print(f"  Failed: {e}")

    # Print Summary
    print("\n--- Summary ---")
    for s in summary:
        print(f"Model: {s['model']:<20} | Items: {s['count']} | Time: {s['duration']:.2f}s")
        print(f"  Found: {s['names']}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv() # Load env for Gemini
    run_benchmark()
