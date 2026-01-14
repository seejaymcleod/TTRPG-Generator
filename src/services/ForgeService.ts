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
        type: 'monster' | 'spell' | 'item' | 'table',
        game: string = '',
        source: string = '',
        provider: 'local' | 'gemini' = 'local',
        apiKey?: string,
        model?: string
    ): Promise<string> {
        // Load game-specific template
        const template = this.loadTemplateForGame(game);

        // Clean up the raw text
        const cleanedText = this.cleanupRawText(text, type);

        // Build system prompt with template context
        let systemPrompt = `You are a TTRPG Content Converter. 
Your goal is to extract structured data from the provided text and format it as valid YAML.

CRITICAL RULES:
- Return ONLY valid YAML. No markdown code blocks (no \`\`\`yaml).
- Do not include ANY conversational text, preambles, or postscripts.
- The output (even if single) must be a YAML array of objects (start with -).
- Ensure all keys match the schema exactly.
- Use the template conventions for abbreviations (e.g., 'S' means 'str').`;

        if (game) {
            systemPrompt += `\n\nGame: ${game}`;
        }
        if (source) {
            systemPrompt += `\nSource: ${source}`;
        }

        if (template) {
            systemPrompt += `\n\n--- TEMPLATE REFERENCE ---\n${template}`;
        } else {
            // Fallback schema for when no template exists
            systemPrompt += `\n\n--- FALLBACK SCHEMA ---`;
            if (type === 'monster') {
                systemPrompt += `
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
            }
        }

        const userPrompt = `Convert the following text into ${type} YAML entries:\n\n${cleanedText}`;

        return this.llm.generate(userPrompt, systemPrompt, provider, apiKey, model);
    }

    async listLocalModels(): Promise<string[]> {
        return this.llm.listOllamaModels();
    }

    async listGeminiModels(apiKey: string): Promise<{ name: string, displayName: string, description: string }[]> {
        return this.llm.listGeminiModels(apiKey);
    }
}


