import argparse
import json
import os
import sys
import time
import re
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Default models to try in order (if user doesn't specify one)
DEFAULT_FALLBACK_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.5-flash', 
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash'
]

def log_debug(msg: str):
    """Output debug message to stderr for Node.js to capture"""
    print(f"[Scribe] {msg}", file=sys.stderr, flush=True)

class Scribe:
    """
    Phase 3: The Scribe
    Extracts structured data from mapped content using templates.
    """
    def __init__(self, api_key=None, preferred_model=None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.preferred_model = preferred_model
        if self.api_key:
            genai.configure(api_key=self.api_key)
        log_debug(f"Initialized with model preference: {preferred_model or 'auto-fallback'}")

    def _generate_with_retry(self, prompt: str, max_retries=3, initial_delay=5.0) -> str:
        """
        Call Gemini with retry logic and model fallback, similar to LLMClient.ts
        """
        # If user specified a model, try that first before fallbacks
        if self.preferred_model:
            models_to_try = [self.preferred_model] + [m for m in DEFAULT_FALLBACK_MODELS if m != self.preferred_model]
        else:
            models_to_try = DEFAULT_FALLBACK_MODELS
            
        log_debug(f"Model priority: {', '.join(models_to_try[:3])}...")
        
        for model_name in models_to_try:
            log_debug(f"Trying model: {model_name}")
            for attempt in range(max_retries):
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(
                        prompt, 
                        generation_config={"response_mime_type": "application/json"}
                    )
                    log_debug(f"Success with {model_name}")
                    return response.text
                except Exception as e:
                    error_str = str(e)
                    
                    # Check for rate limit (429)
                    if "429" in error_str or "quota" in error_str.lower():
                        # Try to parse delay from message
                        delay = initial_delay * (2 ** attempt)
                        match = re.search(r'retry in (\d+(?:\.\d+)?)', error_str, re.IGNORECASE)
                        if match:
                            delay = float(match.group(1)) + 1.0  # Add buffer
                        
                        log_debug(f"Rate limited on {model_name}. Retry {attempt+1}/{max_retries} in {delay:.1f}s...")
                        time.sleep(delay)
                        continue
                    
                    # Check for model not found (404)
                    if "404" in error_str or "not found" in error_str.lower():
                        log_debug(f"Model {model_name} not found, trying next...")
                        break  # Try next model
                    
                    # Other error, log and re-raise
                    log_debug(f"Error with {model_name}: {error_str[:100]}")
                    raise e
            
            # If we exhausted retries for this model, try next
            log_debug(f"Exhausted retries for {model_name}, trying next model...")
        
        raise Exception("All Gemini models failed after retries")

    def process_segment(self, text_segment: str, template: dict, constraints: dict = None) -> list:
        if not self.api_key:
            log_debug("ERROR: No API Key available")
            return [{"error": "No API Key"}]

        # Clean schema text for prompt
        schema_json = json.dumps(template, indent=2)
        text_preview = text_segment[:200].replace('\n', ' ') + "..." if len(text_segment) > 200 else text_segment
        log_debug(f"Processing segment ({len(text_segment)} chars): {text_preview}")
        
        # Apply Logic for Constraints (Task 3.2)
        system_instructions = """
You are the Scribe, a precise data extraction engine.
Your goal is to extract entities from the text that match the provided JSON Schema.
"""

        constraint_text = ""
        if constraints:
            # Handle generic stop-words or negative constraints
            if constraints.get("strict_headers", False):
                constraint_text += "- IGNORE entities that do not have a clear bold header or statblock structure.\n"
            if constraints.get("ignore_inline", False):
                constraint_text += "- DO NOT extract items mentioned in passing within flavor text or paragraphs.\n"
            
            # Application of specific Contexts
            context = constraints.get("context_type", "")
            if context == "Adventure":
                 constraint_text += "- This is an ADVENTURE section. Only extract unique Items/Monsters fully detailed here. Ignore standard equipment lists.\n"
            
            # Custom negative constraints
            if "stop_words" in constraints:
                constraint_text += f"- IGNORE sections containing these words: {', '.join(constraints['stop_words'])}\n"

        prompt = f"""
{system_instructions}

## TARGET SCHEMA
{schema_json}

## CONSTRAINTS & RULES
{constraint_text}
- Return a JSON ARRAY of objects.
- If no valid entities are found, return [].
- Do NOT hallucinate fields not in the schema.

## INPUT TEXT
{text_segment}
"""
        try:
            log_debug("Sending extraction request to Gemini...")
            response_text = self._generate_with_retry(prompt)
            result = json.loads(response_text)
            log_debug(f"Extracted {len(result) if isinstance(result, list) else 1} entries")
            return result
        except Exception as e:
            log_debug(f"Extraction failed: {str(e)[:200]}")
            return [{"error": str(e)}]

def main():
    parser = argparse.ArgumentParser(description='Scribe: Extract structured TTRPG data from text')
    parser.add_argument('--text', help='Path to text file containing segment', required=True)
    parser.add_argument('--template', help='Path to JSON Schema template', required=True)
    parser.add_argument('--constraints', help='JSON string of constraints', default='{}')
    parser.add_argument('--model', help='Preferred Gemini model (e.g., gemini-2.5-pro)', default=None)
    parser.add_argument('--api-key', dest='api_key', help='Gemini API key (overrides env var)', default=None)
    args = parser.parse_args()
    
    log_debug(f"Starting extraction with model={args.model or 'auto'}")

    text_content = ""
    try:
        with open(args.text, 'r') as f:
            text_content = f.read()
        log_debug(f"Loaded text file: {len(text_content)} chars")
    except Exception as e:
        log_debug(f"Error reading text file: {e}")
        print(json.dumps([{"error": f"Error reading text file: {e}"}]))
        sys.exit(1)
        
    try:
        with open(args.template, 'r') as f:
            template = json.load(f)
        log_debug(f"Loaded template with {len(template.get('items', {}).get('properties', {}))} fields")
    except Exception as e:
        log_debug(f"Error reading template file: {e}")
        print(json.dumps([{"error": f"Error reading template file: {e}"}]))
        sys.exit(1)
        
    try:
        constraints = json.loads(args.constraints)
    except:
        constraints = {}
    
    scribe = Scribe(api_key=args.api_key, preferred_model=args.model)
    result = scribe.process_segment(text_content, template, constraints)
    
    log_debug(f"Extraction complete. Returning {len(result) if isinstance(result, list) else 1} entries")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()

