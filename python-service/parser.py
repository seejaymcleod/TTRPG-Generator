import sys
import json
import argparse
from docling.document_converter import DocumentConverter

def main():
    parser = argparse.ArgumentParser(description='Convert PDF to Markdown using Docling')
    parser.add_argument('filepath', help='Path to the PDF file')
    args = parser.parse_args()

    try:
        print(f"Starting Docling conversion for: {args.filepath}", file=sys.stderr, flush=True)
        converter = DocumentConverter()
        result = converter.convert(args.filepath)
        print("Docling conversion finished. Exporting markdown...", file=sys.stderr, flush=True)
        markdown_text = result.document.export_to_markdown()
        
        # Output clean text to stdout for Node.js to capture
        print(markdown_text, flush=True)
    except Exception as e:
        # Print error to stderr so Node.js knows something went wrong
        print(f"Error converting document: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
