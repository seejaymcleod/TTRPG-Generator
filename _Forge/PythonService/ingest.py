import json
import argparse
import sys
from docling.document_converter import DocumentConverter
from docling.datamodel.document import DoclingDocument, SectionHeaderItem, TextItem

def format_item(item):
    if isinstance(item, SectionHeaderItem):
        return {"type": "header", "text": item.text, "level": 0, "page": item.prov[0].page_no if item.prov else 0}
    elif isinstance(item, TextItem):
        return {"type": "text", "text": item.text, "page": item.prov[0].page_no if item.prov else 0}
    return None

def ingest(filepath, output_path):
    print(f"Ingesting {filepath}...", file=sys.stderr)
    converter = DocumentConverter()
    result = converter.convert(filepath)
    doc: DoclingDocument = result.document
    
    # Export to markdown for simple use
    md = doc.export_to_markdown()
    
    # Also build a structured simplified JSON
    # This is useful for slicing by headers later without re-parsing
    structure = []
    
    for item, level in doc.iterate_items():
        data = format_item(item)
        if data:
            if data["type"] == "header":
                data["level"] = level
            structure.append(data)
            
    output = {
        "markdown": md,
        "structure": structure
    }
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
        
    print(f"Ingestion complete. Saved to {output_path}", file=sys.stderr)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('filepath', help='Path to PDF')
    parser.add_argument('output', help='Path to output JSON')
    args = parser.parse_args()
    
    ingest(args.filepath, args.output)
