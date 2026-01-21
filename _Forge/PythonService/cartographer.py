import sys
import json
import argparse
import os
from typing import List, Dict, Any
from docling.document_converter import DocumentConverter
from docling.datamodel.document import DoclingDocument, SectionHeaderItem, TextItem
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

class Cartographer:
    """
    Phase 2: The Cartographer (Generic Navigation)
    Handles extracting the structure of the document (headings) and classifying sections.
    """
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    def classify_section(self, header_text: str, first_100_words: str) -> str:
        """
        Task 2.2: The "Cluster" Classifier
        Tags a section with a Taxonomy Category.
        """
        if not self.api_key:
            return "Unknown (No API Key)"
            
        model = genai.GenerativeModel('gemini-2.0-flash')
        prompt = f"""
You are a TTRPG Book Librarian. Classify the following book section into ONE of these Main Taxonomy Categories:
- Core Rules (Mechanics, Dice, Turn order)
- Character Options (Classes, Races, Feats, Backgrounds)
- Equipment (Weapons, Armor, Gear, Shops)
- Magic (Spells, Rituals, Powers)
- Bestiary (Monsters, NPCs, Stats)
- Gamemastering (Tables, World Info, Adventures)
- Other (Frontmatter, Index, Art)

Header: "{header_text}"
Sample Text: "{first_100_words}"

Return ONLY the Category Name.
"""
        try:
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            return f"Error: {str(e)}"

    def map_document(self, filepath: str) -> List[Dict[str, Any]]:
        """
        Task 2.1: Heading-Based Segmentation
        Segments document by headers and runs classifier.
        """
        try:
            converter = DocumentConverter()
            result = converter.convert(filepath)
            doc: DoclingDocument = result.document
        except Exception as e:
            print(f"Error converting document: {e}", file=sys.stderr)
            return []

        sections = []
        current_section = {
            "header": "Introduction/Preamble",
            "level": 0,
            "content": [],
            "start_page": 1
        }

        # Iterate through items to build sections
        # Docling structure is hierarchical but we can iterate sequentially for simple slicing
        for item, level in doc.iterate_items():
            if isinstance(item, SectionHeaderItem):
                # Save previous section
                if current_section["content"]:
                    current_section["preview"] = " ".join(current_section["content"][:20]) # First 20 words roughly
                    sections.append(current_section)
                
                # Start new section
                # Note: 'level' in iterate_items relates to the hierarchy depth
                text = item.text.strip()
                # Get page number if available (docling often provides provenance)
                page_no = item.prov[0].page_no if item.prov else 0
                
                current_section = {
                    "header": text,
                    "level": level,
                    "content": [],
                    "start_page": page_no
                }
            elif isinstance(item, TextItem):
                current_section["content"].append(item.text)
        
        # Append final section
        if current_section["content"]:
            current_section["preview"] = " ".join(current_section["content"][:20])
            sections.append(current_section)

        # Post-process: Classify content
        # We use a summarized version of content for classification to save tokens
        for sec in sections:
            full_text_start = " ".join(sec["content"][:100]) # First roughly 100 logical text blocks
            sec["category"] = self.classify_section(sec["header"], full_text_start)
            # Remove full content to allow for a lightweight map, OR keep it if we want to extract later
            # For "Map" phase, we probably just want metadata
            sec.pop("content") 
            
        return sections

def main():
    parser = argparse.ArgumentParser(description='Map a PDF document structure and classify sections.')
    parser.add_argument('filepath', help='Path to the PDF file')
    args = parser.parse_args()

    cartographer = Cartographer()
    sections = cartographer.map_document(args.filepath)
    
    print(json.dumps(sections, indent=2))

if __name__ == "__main__":
    main()
