import argparse
import json
import os
import sys
import time
import re
import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Default models
DEFAULT_GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash'
]

def log_debug(msg: str):
    print(f"[Scribe] {msg}", file=sys.stderr, flush=True)

class Scribe:
    def process_segment(self, text_segment: str, template: dict, constraints: dict = None) -> list:
        raise NotImplementedError

class GeminiScribe(Scribe):
    def __init__(self, api_key=None, preferred_model=None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.preferred_model = preferred_model
        if self.api_key:
            genai.configure(api_key=self.api_key)
        
    def _generate_with_retry(self, prompt: str, max_retries=3, initial_delay=5.0) -> str:
        models_to_try = [self.preferred_model] + [m for m in DEFAULT_GEMINI_MODELS if m != self.preferred_model] if self.preferred_model else DEFAULT_GEMINI_MODELS
        
        for model_name in models_to_try:
            log_debug(f"Trying Gemini model: {model_name}")
            for attempt in range(max_retries):
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(
                        prompt, 
                        generation_config={"response_mime_type": "application/json"}
                    )
                    return response.text
                except Exception as e:
                    if "429" in str(e):
                        time.sleep(initial_delay * (2 ** attempt))
                        continue
                    break 
        raise Exception("All Gemini models failed")

    def process_segment(self, text_segment: str, template: dict, constraints: dict = None) -> list:
        if not self.api_key:
            return [{"error": "No API Key for Gemini"}]

        schema_json = json.dumps(template, indent=2)
        prompt = self._build_prompt(text_segment, schema_json, constraints)
        
        try:
            response_text = self._generate_with_retry(prompt)
            return json.loads(response_text)
        except Exception as e:
            return [{"error": str(e)}]

    def _build_prompt(self, text, schema, constraints):
        return f"""You are a data extraction engine. Extract entities that match the JSON Schema.
TARGET SCHEMA: {schema}
INPUT TEXT: {text}
Return a JSON ARRAY."""

class OllamaScribe(Scribe):
    def __init__(self, model="llama3", url="http://localhost:11434"):
        self.model = model
        self.url = url

    def process_segment(self, text_segment: str, template: dict, constraints: dict = None) -> list:
        schema_json = json.dumps(template, indent=2)
        constraint_text = ""
        if constraints:
            if constraints.get("strict_headers"): constraint_text += "- IGNORE entities without bold headers.\n"
            if constraints.get("context_type") == "Adventure": constraint_text += "- Only extract unique Items/Monsters.\n"

        prompt = f"""
You are a precise data extraction engine. 
Your goal is to extract entities from the text that match the provided JSON Schema.

## TARGET SCHEMA
{schema_json}

## CONSTRAINTS
{constraint_text}
- Return a JSON ARRAY of objects.
- If no valid entities are found, return [].
- Do NOT hallucinate fields.
- RESPOND WITH VALID JSON ONLY. NO MARKDOWN.

## INPUT TEXT
{text_segment}
"""
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }
        
        try:
            log_debug(f"Sending request to Ollama ({self.model})...")
            start = time.time()
            response = requests.post(f"{self.url}/api/generate", json=payload)
            response.raise_for_status()
            duration = time.time() - start
            log_debug(f"Ollama responded in {duration:.1f}s")
            
            result_text = response.json().get("response", "")
            return json.loads(result_text)
        except Exception as e:
            log_debug(f"Ollama Extraction failed: {e}")
            return [{"error": str(e)}]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', required=True)
    parser.add_argument('--template', required=True)
    parser.add_argument('--constraints', default='{}')
    parser.add_argument('--provider', choices=['gemini', 'ollama'], default='gemini')
    parser.add_argument('--model', default=None)
    parser.add_argument('--api-key', dest='api_key', default=None)
    parser.add_argument('--ollama-url', default="http://localhost:11434")
    args = parser.parse_args()
    
    try:
        with open(args.text, 'r', encoding='utf-8') as f: text_content = f.read()
        with open(args.template, 'r', encoding='utf-8') as f: template = json.load(f)
        constraints = json.loads(args.constraints)
    except Exception as e:
        print(json.dumps([{"error": f"File error: {e}"}]))
        sys.exit(1)
    
    scribe = None
    if args.provider == 'ollama':
        model = args.model or "llama3"
        scribe = OllamaScribe(model=model, url=args.ollama_url)
    else:
        scribe = GeminiScribe(api_key=args.api_key, preferred_model=args.model)
        
    result = scribe.process_segment(text_content, template, constraints)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
