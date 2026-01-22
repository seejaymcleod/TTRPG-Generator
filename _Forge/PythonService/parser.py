import sys
import os
import json
import argparse
import fitz  # PyMuPDF

def main():
    parser = argparse.ArgumentParser(description='Convert PDF to Markdown chunks using PyMuPDF')
    parser.add_argument('filepath', help='Path to the PDF file')
    parser.add_argument('--output-dir', help='Directory to save page chunks', required=True)
    args = parser.parse_args()

    try:
        print(f"Starting PyMuPDF conversion for: {args.filepath}", file=sys.stderr, flush=True)
        
        # Ensure output directory exists
        os.makedirs(args.output_dir, exist_ok=True)
        
        # Open PDF with PyMuPDF
        doc = fitz.open(args.filepath)
        
        manifest = {
            "source": args.filepath,
            "total_pages": len(doc),
            "pages": []
        }

        # Process each page
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Extract text with formatting preserved
            text = page.get_text("text")
            
            # Also try to extract any tables as structured text
            # PyMuPDF can extract text blocks which helps with table parsing
            blocks = page.get_text("blocks")
            
            # Build a cleaner text representation
            page_text = text.strip()
            
            # Save page as JSON
            filename = f"page_{page_num + 1:03d}.json"
            filepath = os.path.join(args.output_dir, filename)
            
            page_data = {
                "page": page_num + 1,
                "text": page_text,
                "block_count": len(blocks)
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(page_data, f, ensure_ascii=False, indent=2)
            
            manifest["pages"].append(filename)
            print(f"Processed page {page_num + 1}/{len(doc)}", file=sys.stderr)

        doc.close()

        # Save manifest
        manifest_path = os.path.join(args.output_dir, "manifest.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        print(json.dumps({"status": "success", "manifest": manifest_path}), flush=True)

    except Exception as e:
        print(f"Error converting document: {str(e)}", file=sys.stderr)
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
