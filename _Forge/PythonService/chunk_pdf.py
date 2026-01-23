import sys
import os
import json
import argparse
import fitz  # PyMuPDF
import time

def load_state(job_dir):
    state_path = os.path.join(job_dir, "job_state.json")
    if os.path.exists(state_path):
        with open(state_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"job_id": os.path.basename(job_dir), "pipeline_status": {}, "pages": {}}

def save_state(job_dir, state):
    state_path = os.path.join(job_dir, "job_state.json")
    temp = state_path + ".tmp"
    with open(temp, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2)
    if os.path.exists(state_path):
        os.remove(state_path)
    os.rename(temp, state_path)

def main():
    parser = argparse.ArgumentParser(description='Phase 1: Chunk PDF into pages')
    parser.add_argument('filepath', help='Path to the PDF file')
    parser.add_argument('--job-dir', help='Root directory for the job', required=True)
    args = parser.parse_args()

    try:
        print(f"Chunking: {args.filepath}", file=sys.stderr, flush=True)
        
        # Check State
        state = load_state(args.job_dir)
        if state.get("pipeline_status", {}).get("chunking") == "complete":
             print("Chunking already complete. Skipping.", file=sys.stderr)
             print(json.dumps({"status": "skipped", "reason": "already_complete"}), flush=True)
             return

        pages_dir = os.path.join(args.job_dir, "Pages")
        os.makedirs(pages_dir, exist_ok=True)
        
        doc = fitz.open(args.filepath)
        
        # Simple manifest - just list of page files
        manifest = {
            "source": os.path.basename(args.filepath),
            "total_pages": len(doc),
            "pages": []
        }

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text").strip()
            
            page_data = {
                "page": page_num + 1,
                "text": text
            }
            
            filename = f"page_{page_num + 1:03d}.json"
            filepath = os.path.join(pages_dir, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(page_data, f, ensure_ascii=False, indent=2)
            
            manifest["pages"].append(filename)
            print(f"Page {page_num + 1}/{len(doc)}", file=sys.stderr)

        doc.close()

        # Update Manifest
        manifest_path = os.path.join(args.job_dir, "manifest.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        # Update State
        if "pipeline_status" not in state:
            state["pipeline_status"] = {}
        state["pipeline_status"]["chunking"] = "complete"
        save_state(args.job_dir, state)

        print(json.dumps({"status": "success", "pages": len(manifest["pages"])}), flush=True)

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
