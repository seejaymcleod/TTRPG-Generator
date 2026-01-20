import { LLMClient } from './LLMClient';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
const pdf = require('pdf-parse');

interface DocumentSection {
    header: string;
    // Semantic tags instead of rigid types. Expanded 10-point taxonomy.
    tags: ('STAT_BLOCK_MONSTER' | 'STAT_BLOCK_NPC' | 'STAT_BLOCK_ITEM' | 'STAT_BLOCK_SPELL' | 'STAT_BLOCK_CLASS' | 'STAT_BLOCK_FEATURE' | 'STRUCTURED_DUNGEON_KEY' | 'CONTENT_TABLE' | 'CONTENT_RULES' | 'NARRATIVE_ADVENTURE')[];
    start_snippet: string;
    end_snippet: string;
}

export class ForgeService {
    private llm: LLMClient;
    private logger?: any;
    private activeTasks: Map<string, { controller: AbortController, pid?: number }> = new Map();

    constructor() {
        const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        this.llm = new LLMClient(ollamaHost);
    }

    setLogger(logger: any) {
        this.logger = logger;
    }

    startTask(taskId: string): AbortSignal {
        const controller = new AbortController();
        this.activeTasks.set(taskId, { controller });
        return controller.signal;
    }

    finishTask(taskId: string) {
        this.activeTasks.delete(taskId);
    }

    cancelTask(taskId: string) {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.controller.abort();
            if (task.pid) {
                try {
                    process.kill(task.pid);
                    this.log(`Killed process ${task.pid} for task ${taskId}`);
                } catch (e) {
                    this.warn(`Failed to kill process ${task.pid}: ${e}`);
                }
            }
            this.activeTasks.delete(taskId);
            this.log(`Cancelled task ${taskId}`);
            return true;
        }
        return false;
    }

    private log(message: string) {
        console.log(`[Forge] ${message}`);
        if (this.logger?.log) this.logger.log(message);
    }

    private warn(message: string) {
        console.warn(`[Forge] ${message}`);
        if (this.logger?.warn) this.logger.warn(message);
    }

    private error(message: string) {
        console.error(`[Forge] ${message}`);
        if (this.logger?.error) this.logger.error(message);
    }

    async extractText(fileBuffer: Buffer, filename?: string, taskId?: string): Promise<string> {
        // Handle non-PDF files directly
        if (filename) {
            const ext = path.extname(filename).toLowerCase();
            const textExtensions = ['.md', '.txt', '.yaml', '.yml', '.json'];
            if (textExtensions.includes(ext)) {
                return fileBuffer.toString('utf-8');
            }
        }

        // Try Python Docling first for PDFs
        try {
            return await this.extractWithDocling(fileBuffer, taskId);
        } catch (error) {
            this.warn(`Docling failed or not installed, falling back to pdf-parse: ${error}`);
            try {
                // Robust detection of pdf-parse function
                let pdfParser: any = pdf;
                if (typeof pdfParser !== 'function' && pdf && typeof pdf.default === 'function') {
                    pdfParser = pdf.default;
                }

                if (typeof pdfParser !== 'function') {
                    // One last attempt: Check if it's the mehmet-kozan version which is an object with PDFParse class
                    // or other common patterns. For now, we prefer the function approach.
                    throw new Error("pdf-parse library not loaded correctly. Expected a function.");
                }
                const data = await pdfParser(fileBuffer);
                return data.text;
            } catch (pdfError: any) {
                this.error(`Critical: Both Docling and pdf-parse failed. ${pdfError}`);
                throw new Error(`Failed to parse PDF: ${pdfError.message}`);
            }
        }
    }

    private async extractWithDocling(fileBuffer: Buffer, taskId?: string): Promise<string> {
        const tempPath = path.resolve(process.cwd(), `temp_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, fileBuffer);

        return new Promise((resolve, reject) => {
            const pythonScript = path.resolve(process.cwd(), 'python-service/parser.py');
            const venvPython = path.resolve(process.cwd(), '.venv/bin/python');
            const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

            this.log(`Spawning Docling: ${pythonCmd} ${pythonScript}`);

            const pythonProcess = spawn(pythonCmd, [pythonScript, tempPath]);

            // Store PID for cancellation
            if (taskId && this.activeTasks.has(taskId)) {
                this.activeTasks.get(taskId)!.pid = pythonProcess.pid;
            }

            const timeout = setTimeout(() => {
                pythonProcess.kill();
                reject(new Error("Docling process timed out after 10 minutes"));
            }, 600000);

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => output += data.toString());
            pythonProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                errorOutput += msg;
                // Forward reasonable-looking logs to the UI
                if (this.logger?.log && (msg.includes('Docling') || msg.includes('INFO') || msg.length < 200)) {
                    this.log(`[Docling] ${msg.trim()}`);
                }
            });

            pythonProcess.on('close', (code) => {
                clearTimeout(timeout);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                if (code !== 0 && code !== null) {
                    reject(new Error(`Docling process exited with code ${code}: ${errorOutput}`));
                } else if (code === null) {
                    reject(new Error("Docling process was killed (timeout)"));
                } else {
                    if (!output || output.trim().length === 0) {
                        reject(new Error("Docling process finished but returned empty output. Check server logs."));
                    } else {
                        resolve(output);
                    }
                }
            });

            pythonProcess.on('error', (err) => {
                clearTimeout(timeout);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                reject(err);
            });
        });
    }

    /**
     * NEW: Extract content using the Python Scribe pipeline.
     * This uses the enhanced Python scripts with retry logic and model fallback.
     */
    async extractWithPythonScribe(
        text: string,
        contentType: string,
        game: string = 'ShadowDark',
        source: string = 'Core',
        taskId?: string,
        apiKey?: string,
        model?: string
    ): Promise<any[]> {
        const tempTextPath = path.resolve(process.cwd(), `temp_scribe_${Date.now()}.txt`);
        const tempTemplatePath = path.resolve(process.cwd(), `temp_template_${Date.now()}.json`);

        // Generate JSON schema template based on content type
        const template = this.generateScribeTemplate(contentType);

        fs.writeFileSync(tempTextPath, text);
        fs.writeFileSync(tempTemplatePath, JSON.stringify(template, null, 2));

        const venvPython = path.resolve(process.cwd(), '.venv/bin/python');
        const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
        const scribeScript = path.resolve(process.cwd(), 'python-service/scribe.py');

        this.log(`[Scribe] Extracting ${contentType} using Python pipeline...`);
        if (model) this.log(`[Scribe] Using model: ${model}`);

        const args = [
            scribeScript,
            '--text', tempTextPath,
            '--template', tempTemplatePath
        ];

        if (model) {
            args.push('--model', model);
        }

        if (apiKey) {
            args.push('--api-key', apiKey);
        }

        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(pythonCmd, args);

            if (taskId && this.activeTasks.has(taskId)) {
                this.activeTasks.get(taskId)!.pid = pythonProcess.pid;
            }

            // 10 minute timeout for large documents
            const timeout = setTimeout(() => {
                pythonProcess.kill();
                reject(new Error("Scribe process timed out after 10 minutes"));
            }, 600000);

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => output += data.toString());
            pythonProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                errorOutput += msg;
                // Forward progress messages to logger
                if (msg.includes('[Scribe]')) {
                    this.log(msg.trim());
                }
            });

            pythonProcess.on('close', (code) => {
                clearTimeout(timeout);
                // Clean up temp files
                if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
                if (fs.existsSync(tempTemplatePath)) fs.unlinkSync(tempTemplatePath);

                if (code !== 0 && code !== null) {
                    reject(new Error(`Scribe process exited with code ${code}: ${errorOutput}`));
                    return;
                }

                try {
                    const parsed = JSON.parse(output);
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].error) {
                        reject(new Error(`Scribe error: ${parsed[0].error}`));
                        return;
                    }

                    // Transform to YAML format
                    const transformed = this.transformScribeOutput(parsed, contentType, game, source);
                    this.log(`[Scribe] Extracted ${transformed.length} ${contentType} entries`);
                    resolve(transformed);
                } catch (e) {
                    reject(new Error(`Failed to parse Scribe output: ${e}`));
                }
            });

            pythonProcess.on('error', (err) => {
                clearTimeout(timeout);
                if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
                if (fs.existsSync(tempTemplatePath)) fs.unlinkSync(tempTemplatePath);
                reject(err);
            });
        });
    }

    /**
     * Generate a JSON Schema template for the Scribe based on content type.
     */
    private generateScribeTemplate(contentType: string): any {
        const baseTemplate = {
            description: `A list of ShadowDark ${contentType}s`,
            type: "array",
            items: {
                type: "object",
                properties: {} as any,
                required: ["name"]
            }
        };

        const type = contentType.toLowerCase();

        if (type === 'monster' || type === 'npc') {
            baseTemplate.items.properties = {
                name: { type: "string", description: "Monster Name" },
                ac: { type: "integer", description: "Armor Class" },
                hp: { type: "integer", description: "Hit Points" },
                level: { type: "integer", description: "Level (LV)" },
                mv: { type: "string", description: "Movement speed" },
                alignment: { type: "string", description: "Alignment (L, N, C)" },
                attack: { type: "string", description: "Full attack string" },
                stats: {
                    type: "object",
                    properties: {
                        str: { type: "string" }, dex: { type: "string" }, con: { type: "string" },
                        int: { type: "string" }, wis: { type: "string" }, cha: { type: "string" }
                    }
                },
                flavor: { type: "string", description: "Description" },
                abilities: {
                    type: "array",
                    items: { type: "object", properties: { name: { type: "string" }, desc: { type: "string" } } }
                }
            };
            baseTemplate.items.required = ["name", "ac", "hp", "level"];
        } else if (type === 'spell') {
            baseTemplate.items.properties = {
                name: { type: "string" },
                tier: { type: "integer", description: "Spell tier (1-5)" },
                class: { type: "string", description: "Casting class (Wizard, Priest, Witch)" },
                duration: { type: "string" },
                range: { type: "string" },
                description: { type: "string", description: "Full spell effect" }
            };
            baseTemplate.items.required = ["name", "tier"];
        } else if (type === 'item') {
            baseTemplate.items.properties = {
                name: { type: "string" },
                category: { type: "string", description: "Item category (Weapon, Armor, Magic Item, etc.)" },
                cost: { type: "string", description: "Price in gp/sp" },
                benefit: { type: "string", description: "Item effect or bonus" },
                flavor: { type: "string", description: "Description" },
                curse: { type: "string", description: "Curse effect, if any" }
            };
            baseTemplate.items.required = ["name"];
        }

        return baseTemplate;
    }

    /**
     * Transform Scribe JSON output to the YAML content format.
     */
    private transformScribeOutput(data: any[], contentType: string, game: string, source: string): any[] {
        const type = contentType.toLowerCase();
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);

        return data.map(item => {
            const name = (item.name || 'Unknown').replace(/^(##\s*)?/, '').trim();
            const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
            const id = `sd_${type}_${nameSlug}`;

            if (type === 'monster' || type === 'npc') {
                return {
                    id,
                    name: name.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
                    type: 'Monster',
                    game,
                    source,
                    properties: {
                        ac: String(item.ac || ''),
                        hp: String(item.hp || ''),
                        mv: item.mv || '',
                        level: String(item.level || ''),
                        alignment: item.alignment || 'N',
                        stats: item.stats || { str: '+0', dex: '+0', con: '+0', int: '+0', wis: '+0', cha: '+0' },
                        flavor: item.flavor || ''
                    },
                    abilities: item.abilities || [],
                    actions: item.attack ? [{ name: 'Attack', desc: item.attack }] : [],
                    description: item.flavor || ''
                };
            } else if (type === 'spell') {
                return {
                    id,
                    name,
                    type: 'Spell',
                    game,
                    source,
                    properties: {
                        tier: String(item.tier || ''),
                        class: item.class || '',
                        duration: item.duration || '',
                        range: item.range || ''
                    },
                    description: item.description || ''
                };
            } else {
                // Item
                return {
                    id,
                    name,
                    type: 'Item',
                    game,
                    source,
                    properties: {
                        category: item.category || 'Gear',
                        cost: item.cost || '',
                        benefit: item.benefit || '',
                        flavor: item.flavor || '',
                        curse: item.curse || ''
                    },
                    description: item.flavor || item.benefit || ''
                };
            }
        });
    }

    private loadTemplateForGame(game: string): string {
        if (!game) return '';
        const templatePath = path.resolve(process.cwd(), '_Content', game, `${game}_Templates.yaml`);
        if (fs.existsSync(templatePath)) {
            this.log(`Loading template: ${templatePath}`);
            return fs.readFileSync(templatePath, 'utf-8');
        }
        return '';
    }

    private cleanupRawText(rawText: string, contentType: string): string {
        let cleaned = rawText
            .replace(/\f/g, '\n')
            .replace(/^\s*\d+\s*$/gm, '')
            .replace(/\.{3,}\s*\d+/g, '')
            .replace(/^\s*(Table of Contents|Index|Appendix)\s*$/gim, '')
            .replace(/\n{3,}/g, '\n\n')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');

        if (contentType === 'monster') {
            cleaned = cleaned
                .replace(/^\s*Introduction\s*$/gim, '')
                .replace(/^\s*Overview\s*$/gim, '')
                .replace(/^\s*Credits?\s*$/gim, '');
        }
        return cleaned.trim();
    }

    getSourcesForGame(game: string): string[] {
        const gameSources: Record<string, string[]> = {
            'ShadowDark': ['Core', 'Cursed Scroll 1', 'Cursed Scroll 2', 'Cursed Scroll 3', '3rdParty'],
            '5e': ['Core', "Player's Handbook", "Monster Manual", "Dungeon Master's Guide", '3rdParty'],
            'Knave': ['Core', '3rdParty'],
            'Cairn': ['Core', '3rdParty']
        };
        return gameSources[game] || ['Core', '3rdParty'];
    }

    async analyzeText(text: string, provider: 'local' | 'gemini' = 'local', apiKey?: string, model?: string, taskId?: string): Promise<any> {
        const systemPrompt = `You are an expert TTRPG Librarian. Analyze text and identify Game System, Source, and Content Type. Return ONLY JSON.`;
        const userPrompt = `Analyze this text snippet:\n\n${text.slice(0, 2000)}`;
        const signal = taskId ? this.activeTasks.get(taskId)?.controller.signal : undefined;
        try {
            const result = await this.llm.generate(userPrompt, systemPrompt, provider, apiKey, model, this.logger, signal);
            // Robust cleaning: remove backticks, "json" prefix (with or without backticks), and whitespace
            const cleaned = result
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .replace(/^json\s*/i, '') // Handle "json { ... }" without backticks
                .trim();
            return JSON.parse(cleaned);
        } catch (e) {
            this.error(`Analysis failed: ${e}`);
            return { game: "Unknown", source: "Unknown", contentType: "unknown" };
        }
    }

    /**
     * Extract all headers from a markdown/text document.
     * Looks for patterns like "## HEADER" or "ALL CAPS LINES" or bold headers.
     */
    private extractHeaders(text: string): { header: string, startIndex: number, endIndex: number, content: string }[] {
        const headers: { header: string, startIndex: number, endIndex: number, content: string }[] = [];
        const lines = text.split('\n');

        let currentHeader: string | null = null;
        let headerStart = 0;
        let contentLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Check for markdown headers (## Header)
            const mdHeaderMatch = trimmed.match(/^##\s+(.+)$/);
            // Check for ALL CAPS headers (at least 3 chars, mostly uppercase)
            const isCapsHeader = trimmed.length >= 3 &&
                trimmed.length <= 50 &&
                trimmed === trimmed.toUpperCase() &&
                /^[A-Z][A-Z\s\-']+$/.test(trimmed);

            if (mdHeaderMatch || isCapsHeader) {
                // Save previous section
                if (currentHeader && contentLines.length > 0) {
                    const content = contentLines.join('\n').trim();
                    if (content.length > 10) { // Keep even small sections for batching, was 50
                        headers.push({
                            header: currentHeader,
                            startIndex: headerStart,
                            endIndex: i - 1,
                            content: content
                        });
                    }
                }

                // Start new section
                currentHeader = mdHeaderMatch ? mdHeaderMatch[1] : trimmed;
                headerStart = i;
                contentLines = [];
            } else if (currentHeader) {
                contentLines.push(line);
            }
        }

        // Don't forget the last section
        if (currentHeader && contentLines.length > 0) {
            const content = contentLines.join('\n').trim();
            if (content.length > 10) {
                headers.push({
                    header: currentHeader,
                    startIndex: headerStart,
                    endIndex: lines.length - 1,
                    content: content
                });
            }
        }

        return headers;
    }

    /**
     * Filter headers to find ones likely matching the requested content type/subtype.
     */
    private filterHeadersByType(headers: { header: string, content: string }[], contentType: string): { header: string, content: string }[] {
        const searchTerms: string[] = [];

        // General Type Mapping
        const typeMap: Record<string, string[]> = {
            'item': ['ITEM', 'OBJECT', 'GEAR', 'EQUIPMENT', 'TREASURE', 'ARTIFACT'],
            'monster': ['MONSTER', 'NPC', 'BEAST', 'CREATURE', 'ADVERSARY'],
            'spell': ['SPELL', 'MAGIC', 'RITUAL', 'PRAYER'],
            'table': ['TABLE', 'D20', 'D100', 'D6', 'D12']
        };
        searchTerms.push(...(typeMap[contentType.toLowerCase()] || []));

        // Subtypes (User might ask for "Magic Item" or "Weapon" specifically)
        // If content type passed is "Magic Item" (not just "item")
        if (contentType.toLowerCase().includes('magic')) searchTerms.push('MAGIC', 'WAND', 'POTION', 'SCROLL', 'RING', 'STAFF');
        if (contentType.toLowerCase().includes('weapon')) searchTerms.push('WEAPON', 'SWORD', 'AXE', 'BOW', 'DAGGER', 'MACE');
        if (contentType.toLowerCase().includes('armor')) searchTerms.push('ARMOR', 'SHIELD', 'MAIL', 'HELM', 'PLATE');
        if (contentType.toLowerCase().includes('potion')) searchTerms.push('POTION', 'FLASK', 'VIAL', 'PHILTER');

        // Content Patterns (Regex)
        const patterns: RegExp[] = [];
        if (contentType.toLowerCase().includes('item')) {
            patterns.push(/Benefit\./i, /Curse\./i, /Bonus\./i, /Cost[\s:|]/i, /gp|sp|cp/i);
        }
        if (contentType.toLowerCase().includes('monster')) {
            patterns.push(/AC\s+\d/i, /HP\s+\d/i, /ATK\s+/i);
        }
        if (contentType.toLowerCase().includes('spell')) {
            patterns.push(/Tier\s+\d/i, /Duration:/i, /Range:/i);
        }

        return headers.filter(h => {
            const headerUpper = h.header.toUpperCase();

            // 1. Direct Keyword Match in Header
            const keywordMatch = searchTerms.some(term => headerUpper.includes(term));
            if (keywordMatch) return true;

            // 2. Pattern Match in Content
            const contentMatch = patterns.some(p => p.test(h.content));

            // 3. Special Case: If searching for "Item", include specific sub-headers
            // (Heuristic: If content has "Benefit." it is likely a magic item)
            if (contentType === 'item' && /Benefit\./.test(h.content)) {
                return true;
            }

            return contentMatch;
        });
    }

    /**
     * Load the template for a specific content type from the game's templates file.
     */
    private loadTypeTemplate(game: string, contentType: string): string {
        if (!game) return '';

        const templatePath = path.resolve(process.cwd(), '_Content', game, `${game}_Templates.yaml`);
        if (!fs.existsSync(templatePath)) {
            this.warn(`No templates found for game: ${game}`);
            return '';
        }

        try {
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            const parsed = yaml.load(templateContent) as any;

            if (parsed?.templates) {
                // Find the matching template (Item, Monster, Spell, etc.)
                const typeName = contentType.charAt(0).toUpperCase() + contentType.slice(1).toLowerCase();
                const template = parsed.templates[typeName];

                if (template) {
                    this.log(`Loaded ${typeName} template for ${game}`);
                    // Return just the relevant parts for the prompt
                    return yaml.dump({
                        template_name: typeName,
                        required_fields: template.required_fields,
                        properties: template.properties,
                        full_example: template.full_example,
                        source_schema: template.source_schema
                    });
                }
            }
        } catch (e) {
            this.warn(`Failed to parse templates: ${e}`);
        }

        return '';
    }

    async processContent(
        text: string,
        types: string | string[],
        game: string = '',
        source: string = '',
        provider: 'local' | 'gemini' = 'local',
        apiKey?: string,
        model?: string,
        taskId?: string
    ): Promise<string> {
        const typeArray = Array.isArray(types) ? types : [types];
        const cleanedText = this.cleanupRawText(text, typeArray[0] || 'monster');

        this.log(`Starting Batch Extraction for types: ${typeArray.join(', ')}`);

        // Step 1: Index based on Headers (RAG-lite)
        this.log("Step 1: Indexing document sections...");
        const allSections = this.extractHeaders(cleanedText);
        this.log(`Indexed ${allSections.length} sections.`);

        const allResults: any[] = [];
        // Max characters per batch (Gemini has huge context, local has less)
        const BATCH_SIZE = provider === 'gemini' ? 100000 : 15000;

        // Process each requested content type
        for (const contentType of typeArray) {
            this.log(`\nProcessing content type: ${contentType}`);

            // Step 2: Filter sections by content type & subtype keywords
            const relevantSections = this.filterHeadersByType(allSections, contentType);
            this.log(`Found ${relevantSections.length} sections matching "${contentType}"`);

            if (relevantSections.length === 0) {
                this.warn(`No sections found matching type: ${contentType}`);
                continue;
            }

            // Step 3: Load template
            const template = this.loadTypeTemplate(game, contentType);

            // Step 4: Batch relevant sections
            const batches: string[] = [];
            let currentBatch = "";

            for (const section of relevantSections) {
                const sectionText = `\n\n--- SECTION: ${section.header} ---\n${section.content}`;

                if (currentBatch.length + sectionText.length > BATCH_SIZE) {
                    batches.push(currentBatch);
                    currentBatch = sectionText;
                } else {
                    currentBatch += sectionText;
                }
            }
            if (currentBatch) batches.push(currentBatch);

            this.log(`Created ${batches.length} batches for processing.`);

            // Step 5: Process Batches
            for (let i = 0; i < batches.length; i++) {
                this.log(`Processing Batch ${i + 1}/${batches.length} (${batches[i].length} chars)...`);

                if (this.logger?.progress) {
                    this.logger.progress(i + 1, batches.length, `Batch ${i + 1}/${batches.length} (${contentType})`);
                }

                try {
                    const yamlString = await this.extractBatchWithTemplate(
                        batches[i],
                        contentType,
                        game,
                        source,
                        template,
                        provider,
                        apiKey,
                        model,
                        taskId
                    );

                    const parsed = yaml.load(yamlString);
                    if (Array.isArray(parsed)) {
                        allResults.push(...parsed);
                        this.log(`Extracted ${parsed.length} entries from Batch ${i + 1}`);
                    } else if (parsed) {
                        allResults.push(parsed);
                        this.log(`Extracted 1 entry from Batch ${i + 1}`);
                    }
                } catch (err: any) {
                    this.error(`Failed to process Batch ${i + 1}: ${err.message}`);
                }
            }
        }

        this.log(`\nExtraction complete. Total entries: ${allResults.length}`);
        return allResults.length > 0 ? yaml.dump(allResults) : "[]";
    }

    /**
     * Extract multiple entries from a large batch of text.
     */
    private async extractBatchWithTemplate(
        batchText: string,
        contentType: string,
        game: string,
        source: string,
        template: string,
        provider: 'local' | 'gemini',
        apiKey?: string,
        model?: string,
        taskId?: string
    ): Promise<string> {
        const typeName = contentType.charAt(0).toUpperCase() + contentType.slice(1).toLowerCase();

        // Handle subtypes mapping for the prompt
        let specificType = typeName;
        if (batchText.includes("Weapon")) specificType = "Weapon";
        if (batchText.includes("Armor")) specificType = "Armor";
        if (batchText.includes("Potion")) specificType = "Potion";
        if (batchText.includes("Scroll")) specificType = "Scroll";

        let systemPrompt = `You are a TTRPG Content Parser. You are processing a batch of text containing multiple ${typeName} entries (specifically: ${specificType}).

CRITICAL RULES:
1. You MUST extract EVERY single entry provided in the text.
2. The input text contains multiple sections clearly marked with --- SECTION: Header ---.
3. Count the sections. If there are 10 sections, your output array MUST have 10 items.
4. Do NOT summarize or skip any entries.
5. Return ONLY a valid YAML array.

Entry Schema:
  - id: sd_${contentType}_{snake_case_name}
  - name: (Name from header)
  - type: "${typeName}"
  - game: "${game || 'ShadowDark'}"
  - source: "${source || 'Core'}"
  - properties: { key: value }`;

        if (template) {
            systemPrompt += `\n\nTEMPLATE REFERENCE:\n${template}`;
        }

        const userPrompt = `Batch Content to Process:
${batchText}

Output YAML Array of ALL ${specificType}s:`;

        const signal = taskId ? this.activeTasks.get(taskId)?.controller.signal : undefined;
        // Increase timeout/retries for large batches
        const response = await this.llm.generate(userPrompt, systemPrompt, provider, apiKey, model, this.logger, signal);

        // Clean up response
        const codeBlockMatch = response.match(/```(?:yaml)?([\s\S]*?)```/);
        return codeBlockMatch ? codeBlockMatch[1].trim() : response.replace(/```yaml/g, '').replace(/```/g, '').trim();
    }

    private mapTypesToTags(types: string[]): string[] {
        const map: Record<string, string[]> = {
            'monster': ['STAT_BLOCK_MONSTER', 'STAT_BLOCK_NPC'],
            'spell': ['STAT_BLOCK_SPELL'],
            'item': ['STAT_BLOCK_ITEM'],
            'table': ['CONTENT_TABLE']
        };
        return types.flatMap(t => map[t] || []);
    }

    async listLocalModels(): Promise<string[]> {
        return this.llm.listOllamaModels();
    }

    async listGeminiModels(apiKey: string): Promise<any[]> {
        return this.llm.listGeminiModels(apiKey);
    }

    async extractMultiModal(doclingText: string, pdfBuffer: Buffer, type: string, game: string, source: string, apiKey: string, model: string = 'gemini-2.0-flash'): Promise<any[]> {
        const template = this.loadTemplateForGame(game);
        const systemPrompt = `Multimodal extractor for ${type}. Return JSON array. \nTemplate:\n${template}`;
        const userPrompt = `Extract ${type} from this content. Text:\n${doclingText}`;
        try {
            const result = await this.llm.generateWithImages(userPrompt, [pdfBuffer], systemPrompt, apiKey, model);
            const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch (error) {
            this.error(`Multi-modal extraction failed: ${error}`);
            throw error;
        }
    }

    async saveCards(cards: any[], game: string, contentType: string, origin?: string): Promise<{ saved: number, path: string }> {
        const fileName = origin === 'official' ? `${game}_Official_Content.yaml` :
            origin === 'custom' ? `${game}_Custom_Content.yaml` : `${game}_3rdParty_Content.yaml`;
        const contentPath = path.resolve(process.cwd(), '_Content', game, fileName);

        if (!fs.existsSync(path.dirname(contentPath))) fs.mkdirSync(path.dirname(contentPath), { recursive: true });

        let existingContent: any[] = [];
        if (fs.existsSync(contentPath)) {
            const loaded = yaml.load(fs.readFileSync(contentPath, 'utf-8'));
            existingContent = Array.isArray(loaded) ? loaded : [];
        }

        const cardMap = new Map(existingContent.map((c: any) => [c.id, c]));
        let savedCount = 0;

        for (const newCard of cards) {
            if (!cardMap.has(newCard.id)) {
                cardMap.set(newCard.id, newCard);
                savedCount++;
            }
        }

        const updatedContent = Array.from(cardMap.values()).sort((a: any, b: any) => {
            if (a.type !== b.type) return (a.type || '').localeCompare(b.type || '');
            return (a.name || '').localeCompare(b.name || '');
        });

        fs.writeFileSync(contentPath, yaml.dump(updatedContent, { lineWidth: -1, quotingType: '"' }));
        return { saved: savedCount, path: contentPath };
    }
}
