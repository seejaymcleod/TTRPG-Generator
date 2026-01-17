
import os
import sys
from pathlib import Path

# Try to import docling, install if not present is handled by AGENT, but we check here.
try:
    from docling.document_converter import DocumentConverter
except ImportError:
    print("Error: docling is not installed. Please run 'pip install docling'.")
    sys.exit(1)

def convert_pdfs(import_dir: str, output_dir: str):
    converter = DocumentConverter()
    
    # Ensure output dir exists
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Find PDFs
    pdf_files = list(Path(import_dir).glob("*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {import_dir}")
        return

    print(f"Found {len(pdf_files)} PDFs in {import_dir}")

    for pdf_path in pdf_files:
        print(f"Processing: {pdf_path.name}...")
        try:
            # Convert
            result = converter.convert(pdf_path)
            markdown_text = result.document.export_to_markdown()
            
            # Save
            output_filename = f"{pdf_path.stem}.md"
            output_path = Path(output_dir) / output_filename
            
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(markdown_text)
                
            print(f"  Saved to: {output_path}")
            
        except Exception as e:
            print(f"  Failed to convert {pdf_path.name}: {e}")

if __name__ == "__main__":
    # Define paths relative to CWD
    BASE_DIR = os.getcwd()
    IMPORT_DIR = os.path.join(BASE_DIR, "import")
    OUTPUT_DIR = os.path.join(IMPORT_DIR, "raw_data")
    
    print("Starting Docling Conversion...")
    convert_pdfs(IMPORT_DIR, OUTPUT_DIR)
    print("Batch Processing Complete.")
