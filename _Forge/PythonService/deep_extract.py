import os
import sys
import json
import argparse
import time
from typing import Dict, Any, List
from schema_manager import SchemaManager
from scribe import OllamaScribe, GeminiScribe

class DoclingProcessor:
    def process_page(self, pdf_path: str, page_num: int) -> str:
        """
        Simulate high-fidelity layout analysis.
        """
        print(f" [Docling] High-Fidelity Scan: Page {page_num}...")
        time.sleep(0.5) 
        return f"*** HIGH-FIDELITY TEXT PAGE {page_num} ***"

class DeepExtractor:
    def __init__(self, job_dir: str, game: str, content_type: str, scribe, project_root: str):
        self.job_dir = job_dir
        self.game = game
        self.content_type = content_type
        self.scribe = scribe
        
        # Paths
        self.pages_dir = os.path.join(job_dir, "Pages")
        self.state_path = os.path.join(job_dir, "job_state.json")
        self.results_path = os.path.join(job_dir, "results.json")
        self.pdf_source = self._get_pdf_source_path(job_dir)
        
        # Managers
        game_content_dir = os.path.join(project_root, "_Content", game)
        self.schema_mgr = SchemaManager(game_content_dir, game)
        self.docling = DoclingProcessor()
        
        self.strict_schema = self.schema_mgr.get_strict_schema(content_type)
        self.state = self._load_json(self.state_path, {"pages": {}})
        self.results = self._load_json(self.results_path, {"items": []})

    def _get_pdf_source_path(self, job_dir):
        manifest_path = os.path.join(job_dir, "manifest.json")
        if os.path.exists(manifest_path):
            with open(manifest_path, "r") as f:
                data = json.load(f)
                return data.get("source", "Unknown.pdf")
        return "Unknown.pdf"

    def _load_json(self, path: str, default: Any) -> Any:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return default

    def _save_json(self, path: str, data: Any):
        temp = path + ".tmp"
        with open(temp, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        if os.path.exists(path):
            os.remove(path)
        os.rename(temp, path)

    def _update_page_state(self, filename: str, status: str, error: str = None, method: str = None):
        if filename not in self.state["pages"]:
            self.state["pages"][filename] = {}
        
        self.state["pages"][filename]["status"] = status
        self.state["pages"][filename]["last_updated"] = time.time()
        if error:
            self.state["pages"][filename]["error"] = error
        if method:
             self.state["pages"][filename]["last_method"] = method
            
        self._save_json(self.state_path, self.state)

    def _get_retry_queue(self):
        queue = []
        for filename, info in self.state["pages"].items():
            if info.get("status") in ["needs_retry", "validation_failed", "failed_L1"]:
                queue.append(filename)
        return queue

    def _get_page_text(self, filename):
        path = os.path.join(self.pages_dir, filename)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f).get("text", "")
        return ""

    def _get_neighbor_text(self, center_filename):
        # Extract number from "page_001.json"
        try:
            num = int(center_filename.split('_')[1].split('.')[0])
            prev_file = f"page_{num-1:03d}.json"
            next_file = f"page_{num+1:03d}.json"
            
            text = f"--- Previous Page ({prev_file}) ---\n"
            text += self._get_page_text(prev_file)
            text += f"\n--- Target Page ({center_filename}) ---\n"
            text += self._get_page_text(center_filename)
            text += f"\n--- Next Page ({next_file}) ---\n"
            text += self._get_page_text(next_file)
            return text
        except:
            return self._get_page_text(center_filename)

    def run(self):
        print(f"--- Deep Lane Extraction (V3): {self.game} / {self.content_type} ---")
        
        queue = self._get_retry_queue()
        print(f"Queue Size: {len(queue)} pages")
        
        for filename in queue:
            print(f"Processing {filename}...", end="", flush=True)
            page_info = self.state["pages"].get(filename, {})
            last_method = page_info.get("last_method", "")

            # Determine Level
            if last_method == "deep_docling":
                level = 2
                method_name = "neighbor_context"
                print(" [L2: Neighbor Context]", end="", flush=True)
                text = self._get_neighbor_text(filename)
                context_hint = "High Fidelity + Neighbor Pages"
            else:
                level = 1
                method_name = "deep_docling"
                print(" [L1: Docling Re-Scan]", end="", flush=True)
                # Mock Docling (Reuse existing text for now, assuming Docling would give better text)
                text = self._get_page_text(filename) 
                context_hint = "High Fidelity Re-Scan"

            try:
                extraction_schema = {
                    "type": "object",
                    "properties": {
                        "items": { "type": "array", "items": self.strict_schema }
                    },
                    "required": ["items"]
                }
                
                print(" Extracting...", end="", flush=True)
                extracted_data = self.scribe.process_segment(
                    text, 
                    extraction_schema, 
                    {"context_type": f"{self.game} {self.content_type} ({context_hint})"}
                )

                extracted_items = extracted_data.get("items", [])
                if not extracted_items and isinstance(extracted_data, list):
                    extracted_items = extracted_data
                
                if extracted_items:
                    print(f" Success! ({len(extracted_items)} items)")
                    for item in extracted_items:
                        item["_source_page"] = filename
                        item["_extraction_method"] = method_name
                    
                    self.results["items"].extend(extracted_items)
                    self._save_json(self.results_path, self.results)
                    self._update_page_state(filename, "verified_deep", method=method_name)
                else:
                    if level == 1:
                        print(" Failed L1. Marking for L2.")
                        # Mark as failed L1 so next run picks it up as L2
                        self._update_page_state(filename, "failed_L1", method=method_name)
                    else:
                        print(" Failed L2. Giving up.")
                        self._update_page_state(filename, "failed_final", method=method_name)

            except Exception as e:
                print(f" Error: {e}")
                self._update_page_state(filename, "error_deep", str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--job-dir', required=True)
    parser.add_argument('--game', required=True)
    parser.add_argument('--type', required=True)
    parser.add_argument('--provider', default='ollama')
    parser.add_argument('--model', default='llama3.2:latest')
    parser.add_argument('--api-key', default=None)
    
    args = parser.parse_args()
    
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    
    if args.provider == 'ollama':
        scribe = OllamaScribe(model=args.model)
    else:
        scribe = GeminiScribe(api_key=args.api_key, preferred_model=args.model)
        
    extractor = DeepExtractor(args.job_dir, args.game, args.type, scribe, project_root)
    extractor.run()
