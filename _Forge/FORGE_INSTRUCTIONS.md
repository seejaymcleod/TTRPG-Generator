# The Forge: Next-Gen Extraction Workflow

This document outlines the new "Rosetta Stone" workflow for extracting TTRPG content using Python-based AI tools.

## ✅ Status: INTEGRATED
The Python Scribe pipeline is now integrated into the Node.js application via the `/api/forge/extract-scribe` endpoint.

## Prerequisites

1.  **Python Environment**: Ensure you have a Python 3.9+ environment (`.venv` in root).
2.  **Dependencies**: Install the required packages.
    ```bash
    .venv/bin/python -m pip install -r python-service/requirements.txt
    ```
3.  **API Key**: Run the setup script to add your Gemini API key to `.env`:
    ```bash
    node scripts/setup_gemini_key.js
    ```
    (This decrypts the key from your user profile and adds it to `.env`)

## API Integration

### POST `/api/forge/extract-scribe`

Use the Python Scribe pipeline for enhanced extraction with retry logic and model fallback.

**Request Body:**
```json
{
  "text": "Raw document text...",
  "type": "monster",  // or "item", "spell"
  "game": "ShadowDark",
  "source": "Cursed Scroll 1",
  "taskId": "optional-for-cancellation"
}
```

**Response:**
```json
{
  "cards": [/* Array of extracted content cards */],
  "count": 14,
  "message": "Extracted 14 monster(s) using Python Scribe pipeline"
}
```

**Supported Types:**
- `monster` / `npc` - Extracts AC, HP, Level, Stats, Abilities, Actions
- `spell` - Extracts Tier, Class, Duration, Range, Description
- `item` - Extracts Category, Cost, Benefit, Flavor, Curse

## CLI Workflow (Standalone)

### Phase 1: Ingest
Convert a PDF into structured JSON.

```bash
.venv/bin/python python-service/ingest.py "path/to/source.pdf" "output.json"
```

### Phase 2: Extract Markdown
```bash
.venv/bin/python -c "import json; print(json.load(open('output.json'))['markdown'])" > source.txt
```

### Phase 3: The Scribe
Extract structured data using a JSON Schema template.

```bash
.venv/bin/python python-service/scribe.py \
  --text "source.txt" \
  --template "template.json"
```

### Phase 4: Save to YAML
```bash
.venv/bin/python python-service/store.py \
  --input "extracted.json" \
  --target "_Content/Game/Content.yaml"
```

## Forge Core Components

| File | Purpose |
| ---- | ------- |
| `python-service/forge_core.py` | Scout (Pattern Matcher) + DynamicModelFactory |
| `python-service/ingest.py` | PDF → Structured JSON (Docling) |
| `python-service/cartographer.py` | Document section classification (WIP) |
| `python-service/scribe.py` | Template-based extraction with retry logic |
| `python-service/store.py` | YAML merge and deduplication |
| `python-service/transform_monsters.py` | JSON → YAML card format |

## ForgeService.ts Methods

| Method | Description |
| ------ | ----------- |
| `extractWithPythonScribe()` | Main entry point for Python pipeline integration |
| `generateScribeTemplate()` | Creates JSON Schema based on content type |
| `transformScribeOutput()` | Converts raw JSON to YAML card format |

## Notes

- **Rate Limiting**: The Scribe has built-in retry logic with exponential backoff.
- **Model Fallback**: `gemini-2.0-flash` → `gemini-2.5-flash` → `gemini-2.0-flash-lite` → `gemini-1.5-flash`
- **API Key**: Stored in `.env` as `GEMINI_API_KEY`, decrypted from user profile.
