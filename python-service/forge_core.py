import json
import os
from typing import Dict, Any, Type, List, Optional
from pydantic import BaseModel, create_model, Field
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

class DynamicModelFactory:
    """
    Task 1.1: The Schema Builder
    Creates Pydantic models on the fly based on Scout findings.
    """
    @staticmethod
    def create_model_from_schema(model_name: str, schema: Dict[str, Any]) -> Type[BaseModel]:
        """
        Creates a Pydantic model dynamically from a simplified schema dictionary.
        
        Schema format expected:
        {
            "field_name": {
                "type": "str" | "int" | "float" | "bool" | "list" | "dict",
                "description": "Field description",
                "default": optional_default_value
            }
        }
        """
        fields = {}
        for field_name, field_info in schema.items():
            field_type_str = field_info.get("type", "str")
            description = field_info.get("description", "")
            # Handle default value: if not present, assume required (Ellipsis)
            default_value = field_info.get("default", ...)

            # Map string types to actual Python types
            type_mapping = {
                "str": str,
                "int": int,
                "float": float,
                "bool": bool,
                "list": List[Any],
                "dict": Dict[str, Any]
            }
            
            field_type = type_mapping.get(field_type_str, str)
            
            fields[field_name] = (field_type, Field(default=default_value, description=description))
        
        return create_model(model_name, **fields)

class Scout:
    """
    Task 1.2: The Scout
    Analyzes text and taxonomy to find patterns and map jargon.
    """
    
    @staticmethod
    def generate_scout_prompt(text_sample: str, taxonomy: str) -> str:
        """
        Generates the system instruction for the LLM to act as a Pattern Matcher.
        """
        return f"""
You are the Scout. Your job is to analyze a sample of RPG text and map it to a specific Taxonomy.
You must NOT generate content. You must only identify PATTERNS and MAPPINGS.

## THE GOAL
Return a JSON map that links the System-Specific Jargon in the text to the Grand Taxonomy keys.

## TAXONOMY
{taxonomy}

## TEXT SAMPLE
{text_sample}

## OUTPUT FORMAT
Return a JSON object where mapped fields are shown. 
Example:
{{
  "mappings": [
    {{
      "taxonomy_key": "Actor.Speed",
      "document_label": "Mv",
      "data_type": "int",
      "confidence": "high",
      "reasoning": "Mv appears next to physical stats and likely stands for Move"
    }},
    {{
      "taxonomy_key": "Actor.Defense.Armor_Class",
      "document_label": "AC",
      "data_type": "int",
      "confidence": "high",
      "reasoning": "Standard RPG term for Armor Class"
    }}
  ],
  "suggested_template_name": "Monster_Basic",
  "identified_system": "ShadowDark"
}}

Only return the JSON.
"""

    def scan(self, text_chunk: str, taxonomy_content: str, api_key: str = None) -> str:
        """
        Sends the text + taxonomy to the AI to get the mapping.
        """
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError("API Key is required for Scout to function. Set GEMINI_API_KEY env var.")
            
        genai.configure(api_key=key)
        
        # Use a model that is good at structured output. Flash is fast.
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = self.generate_scout_prompt(text_chunk, taxonomy_content)
        
        try:
            response = model.generate_content(
                prompt, 
                generation_config={"response_mime_type": "application/json"}
            )
            return response.text
        except Exception as e:
            return json.dumps({"error": str(e)})

if __name__ == "__main__":
    # Test execution
    print("Forge Core Module Loaded.")
