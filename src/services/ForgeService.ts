import { LLMClient } from './LLMClient';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
const pdf = require('pdf-parse');

export class ForgeService {
    private llm: LLMClient;

    constructor() {
        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        this.llm = new LLMClient(ollamaHost);
    }

    async extractText(fileBuffer: Buffer): Promise<string> {
        // Try Python Docling first
        try {
            return await this.extractWithDocling(fileBuffer);
        } catch (error) {
            console.warn("Docling failed or not installed, falling back to pdf-parse:", error);
            // Fallback to pdf-parse
            try {
                const data = await pdf(fileBuffer);
                return data.text;
            } catch (pdfError) {
                console.error("Critical: Both Docling and pdf-parse failed.", pdfError);
                throw new Error("Failed to parse PDF.");
            }
        }
    }

    private async extractWithDocling(fileBuffer: Buffer): Promise<string> {
        // 1. Write buffer to temp file
        const tempPath = path.resolve(process.cwd(), `temp_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, fileBuffer);

        return new Promise((resolve, reject) => {
            const pythonScript = path.resolve(process.cwd(), 'python-service/parser.py');
            const venvPython = path.resolve(process.cwd(), '.venv/bin/python');
            const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

            console.log(`[Forge] Spawning Docling: ${pythonCmd} ${pythonScript}`);

            const pythonProcess = spawn(pythonCmd, [pythonScript, tempPath]);

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                if (code !== 0) {
                    reject(new Error(`Docling process exited with code ${code}: ${errorOutput}`));
                } else {
                    resolve(output);
                }
            });

            pythonProcess.on('error', (err) => {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                reject(err);
            });
        });
    }

    /**
     * Load the template file for a specific game.
     */
    private loadTemplateForGame(game: string): string {
        if (!game) return '';

        const templatePath = path.resolve(process.cwd(), '_Content', game, `${game}_Templates.yaml`);

        if (fs.existsSync(templatePath)) {
            console.log(`[Forge] Loading template: ${templatePath}`);
            return fs.readFileSync(templatePath, 'utf-8');
        }

        console.log(`[Forge] No template found for game: ${game}`);
        return '';
    }

    /**
     * Clean up raw text before AI processing.
     * Removes common PDF artifacts and irrelevant content.
     */
    private cleanupRawText(rawText: string, contentType: string): string {
        let cleaned = rawText
            // Remove form feeds
            .replace(/\f/g, '\n')
            // Remove standalone page numbers
            .replace(/^\s*\d+\s*$/gm, '')
            // Remove table of contents dot leaders
            .replace(/\.{3,}\s*\d+/g, '')
            // Remove common PDF headers/footers
            .replace(/^\s*(Table of Contents|Index|Appendix)\s*$/gim, '')
            // Normalize multiple newlines
            .replace(/\n{3,}/g, '\n\n')
            // Trim whitespace from lines
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');

        // Content-type specific cleanup
        if (contentType === 'monster') {
            // Remove common non-stat-block sections
            cleaned = cleaned
                .replace(/^\s*Introduction\s*$/gim, '')
                .replace(/^\s*Overview\s*$/gim, '')
                .replace(/^\s*Credits?\s*$/gim, '');
        }

        return cleaned.trim();
    }

    /**
     * Get available source options for a game.
     */
    getSourcesForGame(game: string): string[] {
        const baseSources = ['Core', '3rdParty'];

        // Game-specific sources
        const gameSources: Record<string, string[]> = {
            'ShadowDark': ['Core', 'Cursed Scroll 1', 'Cursed Scroll 2', 'Cursed Scroll 3', '3rdParty'],
            '5e': ['Core', "Player's Handbook", "Monster Manual", "Dungeon Master's Guide", '3rdParty'],
            'Knave': ['Core', '3rdParty'],
            'Cairn': ['Core', '3rdParty']
        };

        return gameSources[game] || baseSources;
    }

    async analyzeText(text: string, provider: 'local' | 'gemini' = 'local', apiKey?: string, model?: string): Promise<any> {
        const systemPrompt = `You are an expert TTRPG Librarian.
Your goal is to analyze the provided text chunk (from a RPG book) and identify:
1. The Game System (e.g. D&D 5e, ShadowDark, Pathfinder, etc).
2. The Source Book Title (e.g. Cursed Scroll 1, Core Rulebook).
3. The Primary Content Type (e.g. Bestiary, Spells, Items, Tables, Adventure).

Return ONLY a JSON object. No markdown formatting.
Example: {"game": "ShadowDark", "source": "Cursed Scroll 1", "contentType": "monster"}`;

        const userPrompt = `Analyze this text snippet:\n\n${text.slice(0, 2000)}`; // Analyze first 2k chars

        try {
            const result = await this.llm.generate(userPrompt, systemPrompt, provider, apiKey, model);
            return JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch (e) {
            console.error("Analysis failed:", e);
            return { game: "Unknown", source: "Unknown", contentType: "unknown" };
        }
    }

    async processContent(
        text: string,
        types: string | string[], // Accept single type (legacy) or array (new)
        game: string = '',
        source: string = '',
        provider: 'local' | 'gemini' = 'local',
        apiKey?: string,
        model?: string
    ): Promise<string> {
        // Normalize to array
        const typeArray = Array.isArray(types) ? types : [types];

        // Load game-specific template
        const template = this.loadTemplateForGame(game);

        // Clean up the raw text (use first type for cleanup hints)
        const cleanedText = this.cleanupRawText(text, typeArray[0] || 'monster');

        // Build system prompt with template context
        let systemPrompt = `You are a TTRPG Content Converter. 
Your goal is to extract structured data from the provided text and format it as valid YAML.

CRITICAL RULES:
- Return ONLY valid YAML. No markdown code blocks (no \`\`\`yaml).
- Do not include ANY conversational text, preambles, or postscripts.
- The output (even if single) must be a YAML array of objects (start with -).
- Ensure all keys match the schema exactly.
- Use the template conventions for abbreviations (e.g., 'S' means 'str').
- Extract ALL entities matching the requested types from the text.`;

        if (game) {
            systemPrompt += `\n\nGame: ${game}`;
        }
        if (source) {
            systemPrompt += `\nSource: ${source}`;
        }

        // Build type descriptions
        const typeNames = typeArray.map(t => {
            switch (t) {
                case 'monster': return 'Monster/NPC';
                case 'spell': return 'Spell';
                case 'item': return 'Item/Equipment';
                case 'table': return 'Random Table';
                default: return t;
            }
        }).join(', ');
        systemPrompt += `\nContent Types to Extract: ${typeNames}`;

        if (template) {
            systemPrompt += `\n\n--- TEMPLATE REFERENCE ---\n${template}`;
        } else {
            // Fallback schema for when no template exists
            systemPrompt += `\n\n--- FALLBACK SCHEMAS ---`;

            // Add schema for each selected type
            for (const type of typeArray) {
                if (type === 'monster') {
                    systemPrompt += `

## Monster Schema:
- id: "game_monster_name"
  name: "Name"
  type: Monster
  game: "${game || 'Unknown'}"
  source: "${source || 'Unknown'}"
  properties:
    ac: "10"
    hp: "10"
    mv: "near"
    level: "1"
    alignment: "N"
    stats:
      str: "0"
      dex: "0"
      con: "0"
      int: "0"
      wis: "0"
      cha: "0"
    flavor: "Description"
  abilities:
    - name: "Ability Name"
      desc: "Description"
  actions:
    - name: "Attack"
      desc: "1 weapon +0 (1d6)"
  description: "Full description"`;
                } else if (type === 'spell') {
                    systemPrompt += `

## Spell Schema:
- id: "game_spell_name"
  name: "Name"
  type: Spell
  game: "${game || 'Unknown'}"
  source: "${source || 'Unknown'}"
  properties:
    tier: "1"
    class: "Wizard"
    duration: "Instant"
    range: "Near"
  description: "Full spell description"`;
                } else if (type === 'item') {
                    systemPrompt += `

## Item Schema:
- id: "game_item_name"
  name: "Name"
  type: Item
  game: "${game || 'Unknown'}"
  source: "${source || 'Unknown'}"
  properties:
    category: "Magic Item"
    cost: "10 gp"
    benefit: "Effect description"
  description: "Full item description"`;
                } else if (type === 'table') {
                    systemPrompt += `

## Table Schema:
- filename: "game_table_name"
  tablename: "Table Name"
  game: "${game || 'Unknown'}"
  source: "${source || 'Unknown'}"
  type: "Table"
  results:
    - "Result 1"
    - "Result 2"`;
                }
            }
        }

        const userPrompt = `Convert the following text into YAML entries for these content types: ${typeNames}\n\n${cleanedText}`;

        const response = await this.llm.generate(userPrompt, systemPrompt, provider, apiKey, model);

        // Robust cleanup: Remove conversational text and combine multiple YAML blocks
        let cleanYaml = response;

        // 1. Extract content from code blocks if present
        const codeBlockRegex = /```(?:yaml)?([\s\S]*?)```/g;
        const matches = [...response.matchAll(codeBlockRegex)];

        if (matches.length > 0) {
            // Join all code blocks
            cleanYaml = matches.map(m => m[1].trim()).join('\n');
        } else {
            // Fallback: Remove potential non-YAML text
            // Strip lines starting with ** or valid-looking sentence text not part of YAML
            // (Simple heuristic: if it doesn't look like a list item or property, ignore it? Too risky.)
            // Instead, try to strip leading/trailing non-yaml garbage
            cleanYaml = cleanYaml.replace(/```yaml/g, '').replace(/```/g, '').trim();
        }

        return cleanYaml;
    }

    async listLocalModels(): Promise<string[]> {
        return this.llm.listOllamaModels();
    }

    async listGeminiModels(apiKey: string): Promise<{ name: string, displayName: string, description: string }[]> {
        return this.llm.listGeminiModels(apiKey);
    }

    /**
     * Multi-modal extraction: Combines Docling text + Vision for accurate entity extraction.
     * Uses source_schema patterns to identify and separate entities.
     */
    async extractMultiModal(
        doclingText: string,
        pdfBuffer: Buffer,
        type: 'monster' | 'spell' | 'item',
        game: string,
        source: string,
        apiKey: string,
        model: string = 'gemini-2.0-flash'
    ): Promise<any[]> {
        const template = this.loadTemplateForGame(game);

        // Build the extraction prompt using source_schema
        const systemPrompt = `You are a TTRPG Content Extractor.
Your task is to identify and extract ${type} entries from the provided content.

CRITICAL RULES:
1. Return ONLY a valid JSON array of ${type} objects
2. Each object must have: id, name, type, game, source, properties, abilities (for monsters), actions (for monsters), description
3. Use the source_schema patterns to identify entity boundaries
4. Do NOT invent content - only extract what is explicitly present
5. Preserve exact stat values, ability names, and descriptions

Game: ${game}
Source: ${source}
Content Type: ${type}

--- TEMPLATE AND SOURCE SCHEMA ---
${template}

--- DOCLING EXTRACTED TEXT ---
${doclingText}

Now examine the PDF image(s) to verify and enhance the extraction.
Return a JSON array with all ${type} entries found.`;

        const userPrompt = `Extract all ${type} entries from this content. Return as JSON array.`;

        try {
            // Use multimodal with PDF buffer as image
            const result = await this.llm.generateWithImages(
                userPrompt,
                [pdfBuffer],
                systemPrompt,
                apiKey,
                model
            );

            // Parse JSON response
            const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch (error) {
            console.error('Multi-modal extraction failed:', error);
            throw error;
        }
    }

    /**
     * Save extracted cards to the game's content YAML file.
     */
    async saveCards(
        cards: any[],
        game: string,
        contentType: string
    ): Promise<{ saved: number, path: string }> {
        const yaml = require('js-yaml');
        const officialSources = ['ShadowDark Core', 'Core', 'Cursed Scroll 1', 'Cursed Scroll 2', 'Cursed Scroll 3'];

        // Determine target file
        // Default to 3rd Party unless source is explicitly official
        // We check the first card's source (assuming batch is same source)
        const source = cards[0]?.source || 'Unknown';
        const isOfficial = officialSources.includes(source) || source.includes('Core');

        const fileName = isOfficial ? `${game}_Official_Content.yaml` : `${game}_3rdParty_Content.yaml`;
        const contentPath = path.resolve(process.cwd(), '_Content', game, fileName);

        if (!fs.existsSync(path.dirname(contentPath))) {
            fs.mkdirSync(path.dirname(contentPath), { recursive: true });
        }

        let existingContent: any[] = [];

        // Load existing content if file exists
        if (fs.existsSync(contentPath)) {
            const fileContent = fs.readFileSync(contentPath, 'utf-8');
            const loaded = yaml.load(fileContent);
            existingContent = Array.isArray(loaded) ? loaded : [];
        }

        // Get existing IDs to prevent duplicates
        const existingIds = new Set(existingContent.map((c: any) => c.id));

        // Filter out duplicates and add new cards
        const newCards = cards.filter((card: any) => !existingIds.has(card.id));
        const updatedContent = [...existingContent, ...newCards];

        // Sort by type, then by name
        updatedContent.sort((a: any, b: any) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.name.localeCompare(b.name);
        });

        // Write back to file
        fs.writeFileSync(contentPath, yaml.dump(updatedContent, {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false
        }));

        return { saved: newCards.length, path: contentPath };
    }
}


