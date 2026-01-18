const express = require('express');
const path = require('path');
const fs = require('fs');

// Import the compiled engine
// Note: Running from root, so dist is at ./dist
const { TableLoader, Renderer } = require('./dist/src/engine');

const app = express();
const PORT = process.env.PORT || 1337;

app.use(express.static(__dirname));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add a route to serve the extractContext function directly (Legacy Compat)
app.get('/js/extractContext.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
/**
 * Global extractContext function to fix "extractContext is not defined" error
 * This needs to be included before any other scripts
 */
(function() {
    console.log("Loading extractContext polyfill");

    // Define globally with both naming conventions
    window.extractContext = function(context, key, defaultValue = null) {
        if (!context || typeof context !== 'object') return defaultValue;
        if (key in context) return context[key];
        return defaultValue;
    };

    // Also define with capital E for consistency
    window.ExtractContext = window.extractContext;

    console.log("extractContext polyfill loaded successfully");
})();
  `);
});

// Initialize and load tables using the new Engine Loader
const loader = new TableLoader();
const tablesJsonPath = path.join(__dirname, 'dist', 'tables.json');
console.log(`Loading tables from ${tablesJsonPath}...`);

// Ensure build exists
if (!fs.existsSync(tablesJsonPath)) {
  console.error("❌ dist/tables.json not found! Run 'npm run build:tables' first.");
  process.exit(1);
}

loader.loadFromJSON(tablesJsonPath);
console.log(`Engine loaded with ${loader.getAllTables().length} tables.`);

// Helper to get renderer instance (fresh seed per request? Or per generation?)
// For now, new renderer per request to ensure fresh RNG if no seed provided, 
// or maybe we want a global one? 
// The legacy code didn't use seedrandom globally, it used Math.random.
// Our new engine uses seedrandom. If we want true properties of random, 
// we can instantiate Renderer with no seed (it uses Date.now + random).
const getRenderer = (seed) => new Renderer(loader, seed);

// --- SSE Event Management ---
let forgeClients = [];
const broadcastForgeEvent = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  forgeClients.forEach(client => client.res.write(payload));
};

// --- Forge Logging Hijack ---
// We'll wrap console methods or provide a logger to ForgeService 
// so we can stream its logs to the UI.
const forgeLogger = {
  log: (...args) => {
    console.log('[Forge UI Log]', ...args);
    broadcastForgeEvent('log', { level: 'info', message: args.join(' ') });
  },
  warn: (...args) => {
    console.warn('[Forge UI Warn]', ...args);
    broadcastForgeEvent('log', { level: 'warn', message: args.join(' ') });
  },
  error: (...args) => {
    console.error('[Forge UI Error]', ...args);
    broadcastForgeEvent('log', { level: 'error', message: args.join(' ') });
  },
  progress: (step, total, message) => {
    broadcastForgeEvent('progress', { step, total, message });
  }
};

// --- API Endpoints ---

// GET /api/tables
app.get('/api/tables', (req, res) => {
  try {
    const tables = loader.getAllTables().map(t => {
      // Normalize type to array if possible or keep as is
      return {
        filename: t.filename,
        tablename: t.tablename || 'Unknown',
        game: t.game || 'Unknown',
        type: t.type || 'Unknown',
        setting: t.setting || 'Unknown',
        source: t.source || null,
        inputField: t.inputField || null
      };
    });
    res.json(tables);
  } catch (e) {
    console.error("Error fetching tables:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/content
app.get('/api/content', (req, res) => {
  try {
    let yaml;
    try {
      yaml = require('js-yaml');
    } catch (e) {
      console.error("js-yaml not found, cannot serve YAML content");
      return res.status(500).json({ error: "Server missing js-yaml dependency" });
    }

    const contentDir = path.join(__dirname, '_Content');
    const contentData = [];

    // Recursively scan for `*_Content.yaml` files
    function scanForContent(dir) {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir, { withFileTypes: true });

      items.forEach(item => {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          scanForContent(fullPath);
        } else if (item.name.endsWith('_Content.yaml') || item.name.endsWith('_Content.yml')) {
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const data = yaml.load(fileContent);

            if (Array.isArray(data)) {
              console.log(`[Content] Loaded ${data.length} items from ${item.name}`);
              contentData.push(...data);
            }
          } catch (e) {
            console.warn(`[Content] Failed to load ${item.name}: ${e.message}`);
          }
        }
      });
    }

    // Start scan from ShadowDark directory (or root content dir if desired)
    // For now, let's scan the whole _Content dir to be future-proof
    scanForContent(contentDir);

    res.json({ content: contentData });
  } catch (e) {
    console.error("Error serving content:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/templates
app.get('/api/templates', (req, res) => {
  try {
    let yaml;
    try {
      yaml = require('js-yaml');
    } catch (e) {
      return res.status(500).json({ error: "Server missing js-yaml dependency" });
    }

    const templatePath = path.join(__dirname, '_Content', 'display_templates.yaml');
    if (fs.existsSync(templatePath)) {
      const fileContent = fs.readFileSync(templatePath, 'utf8');
      const data = yaml.load(fileContent);
      res.json(data);
    } else {
      res.json({}); // Return empty if no config
    }
  } catch (e) {
    console.error("Error serving templates:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/generate
app.post('/api/generate', (req, res) => {
  const { table, number, inputValues } = req.body;

  if (!table) {
    return res.status(400).json({ error: 'Invalid request data: table is required' });
  }

  // Find the table using the same logic as the loader/legacy
  // Loader indexes by filename and name. 
  // Client sends { filename, tablename, ... }
  let targetTable;
  if (table.filename) {
    targetTable = loader.getTableByFilename(table.filename);
  }
  if (!targetTable && table.tablename) {
    targetTable = loader.getTableByName(table.tablename);
  }

  if (!targetTable) {
    return res.status(404).json({ error: `Table not found: ${table.filename || table.tablename}` });
  }

  const count = parseInt(number) || 1;
  const results = [];
  const renderer = getRenderer(); // Random seed


  // Log the incoming request details
  console.log(`[Generate] Request for: ${targetTable.tablename} (${targetTable.filename}). Count: ${count}`);

  try {
    for (let i = 0; i < count; i++) {
      // Context includes input values
      const context = { ...(inputValues || {}) };
      // Ensure thisResult is null initially
      context.thisResult = null;

      const identifier = targetTable.filename || targetTable.tablename;
      const result = renderer.generate(identifier, context);

      if (result._isSeparateRows) {
        results.push(result);
      } else if (Array.isArray(result.result) && !result._isCareer && !result._isMultiElementArray) {
        results.push(result);
      } else {
        results.push(result);
      }
    }

    res.json({ results });
  } catch (e) {
    console.error(`[Generate Error] Failed for table: ${targetTable.tablename}`);
    console.error(`Params: count=${count}, inputs=${JSON.stringify(inputValues)}`);
    console.error("Stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reroll
app.post('/api/reroll', (req, res) => {
  const { table, header, context, inputValues } = req.body;

  if (!table || !header) {
    return res.status(400).json({ error: 'Missing table or header' });
  }

  // Attempt to locate the root table context
  let rootTable;
  if (table.filename) rootTable = loader.getTableByFilename(table.filename);
  if (!rootTable && table.tablename) rootTable = loader.getTableByName(table.tablename);

  if (!rootTable) {
    return res.status(404).json({ error: 'Table not found' });
  }

  const renderer = getRenderer();
  const mergedContext = { ...(context || {}), ...(inputValues || {}) };

  try {
    const result = renderer.reroll(rootTable, header, mergedContext);

    // Return { result: { ... }, context: ... }
    res.json({
      result: result,
      context: mergedContext // Context might have been updated by mutations (though new engine tries to be immutable, assignments happen)
      // Actually, new engine context entries are assigned to `context` object passed in.
    });
  } catch (e) {
    console.error("Reroll error:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- Forge Mode Endpoints ---
const multer = require('multer');
// Memory storage for immediate processing
const upload = multer({ storage: multer.memoryStorage() });

// Lazy load ForgeService to avoid startup crash if not built yet
let forgeService;
const getForgeService = () => {
  if (!forgeService) {
    try {
      const { ForgeService } = require('./dist/src/services/ForgeService');
      forgeService = new ForgeService();
    } catch (e) {
      console.error("Failed to load ForgeService. Is the project built?", e);
      throw new Error("Forge Service not available. Run npm run build.");
    }
  }

  // Ensure the UI logger is always injected so it can stream progress
  if (forgeService && forgeService.setLogger) {
    forgeService.setLogger(forgeLogger);
  }

  return forgeService;
};

// POST /api/forge/upload
app.post('/api/forge/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const { taskId } = req.body;
  const forge = getForgeService();
  if (taskId) forge.startTask(taskId);

  try {
    const text = await forge.extractText(req.file.buffer, req.file.originalname, taskId);
    res.json({ text });
  } catch (e) {
    console.error("Forge Upload Error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    if (taskId) forge.finishTask(taskId);
  }
});

// --- Forge SSE Endpoint ---
app.get('/api/forge/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  forgeClients.push(newClient);

  req.on('close', () => {
    forgeClients = forgeClients.filter(c => c.id !== clientId);
  });

  // Initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  broadcastForgeEvent('log', { message: `New client connected (ID: ${clientId})`, level: 'info' });
});

// POST /api/forge/load-path - Load file from local filesystem path
app.post('/api/forge/load-path', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'No path provided' });
  }

  try {
    const fs = require('fs');
    const path = require('path');

    // Security: Only allow files within the project directory or common safe locations
    const resolvedPath = path.resolve(filePath);
    const projectRoot = path.resolve(__dirname);

    // Allow files in project dir, or absolute paths that end with allowed extensions
    const allowedExtensions = ['.pdf', '.txt', '.md', '.json', '.yaml', '.yml'];
    const ext = path.extname(resolvedPath).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: `File type not allowed: ${ext}` });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const buffer = fs.readFileSync(resolvedPath);
    const forge = getForgeService();
    const { taskId } = req.body;
    if (taskId) forge.startTask(taskId);

    try {
      const filename = path.basename(resolvedPath);
      const text = await forge.extractText(buffer, filename, taskId);
      res.json({ text, filename });
    } finally {
      if (taskId) forge.finishTask(taskId);
    }
  } catch (e) {
    console.error("Forge Load Path Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forge/cancel - Cancel an active task
app.post('/api/forge/cancel', async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ error: 'No taskId provided' });

  const forge = getForgeService();
  const success = forge.cancelTask(taskId);
  res.json({ success });
});

// Forge - List Ollama Models
app.get('/api/llm/models', async (req, res) => {
  try {
    const forge = getForgeService();
    const models = await forge.listLocalModels();
    res.json({ models });
  } catch (e) {
    console.error("Model fetch error:", e);
    // Return fallback list on error
    res.json({ models: ['llama3', 'mistral'] });
  }
});

// Forge - List Gemini Models (requires API key)
app.get('/api/llm/gemini-models', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    // Return defaults if no key
    return res.json({
      models: [
        { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (Preview)', description: 'Fast and smart' },
        { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', description: 'Production ready speed' },
        { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', description: 'Reasoning expert' }
      ]
    });
  }

  try {
    const forge = getForgeService();
    const models = await forge.listGeminiModels(apiKey);
    res.json({ models });
  } catch (e) {
    console.error("Gemini model fetch error:", e);
    res.json({
      models: [
        { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', description: 'Fast and cost-effective' }
      ]
    });
  }
});

// GET /api/forge/metadata - Get unique games, sources, types from content database
app.get('/api/forge/metadata', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const yaml = require('js-yaml');

    const contentDir = path.join(__dirname, '_Content');
    const games = new Set();
    const sources = new Set();
    const types = new Set();

    // Recursively scan _Content for YAML files
    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      items.forEach(item => {
        if (item.isDirectory()) {
          // Use directory name as game if it's a direct child of _Content
          if (dir === contentDir) {
            games.add(item.name);
          }
          scanDir(path.join(dir, item.name));
        } else if (item.name.endsWith('.yaml') || item.name.endsWith('.yml')) {
          try {
            const content = fs.readFileSync(path.join(dir, item.name), 'utf8');
            const doc = yaml.load(content);
            if (doc) {
              if (doc.game) games.add(doc.game);
              if (doc.source) sources.add(doc.source);
              if (doc.type) types.add(doc.type);
            }
          } catch (e) { /* Skip invalid YAML */ }
        }
      });
    }

    scanDir(contentDir);

    res.json({
      games: Array.from(games).sort(),
      sources: Array.from(sources).sort(),
      types: Array.from(types).sort()
    });
  } catch (e) {
    console.error('Forge metadata error:', e);
    res.json({ games: [], sources: [], types: [] });
  }
});

// POST /api/forge/analyze
app.post('/api/forge/analyze', async (req, res) => {
  const { text, provider, apiKey, model, taskId } = req.body;
  if (!text) return res.status(400).json({ error: "Text required" });

  const forge = getForgeService();
  if (taskId) forge.startTask(taskId);

  try {
    const analysis = await forge.analyzeText(text, provider, apiKey, model, taskId);
    res.json({ analysis });
  } catch (e) {
    console.error("Analysis Error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    if (taskId) forge.finishTask(taskId);
  }
});

// GET /api/forge/sources/:game - Get available sources for a game
app.get('/api/forge/sources/:game', (req, res) => {
  const game = req.params.game;
  try {
    const forge = getForgeService();
    const sources = forge.getSourcesForGame(game);
    res.json({ sources });
  } catch (e) {
    res.json({ sources: ['Core', '3rdParty'] });
  }
});

// POST /api/forge/process
app.post('/api/forge/process', async (req, res) => {
  const { text, type, types, game, source, provider, apiKey, model, taskId } = req.body;

  // Support both single type (legacy) and types array (new)
  const contentTypes = types || (type ? [type] : []);

  if (!text || contentTypes.length === 0) {
    return res.status(400).json({ error: 'Text and at least one content type required' });
  }
  const forge = getForgeService();
  if (taskId) forge.startTask(taskId);

  try {
    // Process all selected content types
    const yaml = await forge.processContent(text, contentTypes, game || '', source || '', provider, apiKey, model, taskId);
    res.json({ yaml });
  } catch (e) {
    console.error("Forge Process Error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    if (taskId) forge.finishTask(taskId);
  }
});

// POST /api/forge/save
// POST /api/forge/save
app.post('/api/forge/save', async (req, res) => {
  const { content, type } = req.body; // type is legacy default fall back

  if (!content) return res.status(400).json({ error: 'No content provided' });

  let yamlParser;
  try {
    yamlParser = require('js-yaml');
  } catch (e) {
    return res.status(500).json({ error: 'Server missing js-yaml dependency' });
  }

  try {
    // Validation: Ensure it's valid YAML
    // content can be a string (multiline) or maybe already parsed? usually string from client.
    let data;
    if (typeof content === 'string') {
      data = yamlParser.load(content);
    } else {
      data = content;
    }

    if (!data) throw new Error("Empty YAML content");

    // Force array
    const items = Array.isArray(data) ? data : [data];
    const savedPaths = [];

    // Helper to determine subfolder based on type
    const getFolderForType = (itemType, defaultType) => {
      const t = (itemType || defaultType || 'unknown').toLowerCase();
      if (t.includes('monster') || t.includes('npc')) return 'monsters';
      if (t.includes('spell')) return 'spells';
      if (t.includes('item') || t.includes('equipment')) return 'items';
      if (t.includes('table')) return 'tables';
      // Fallback: pluralize
      return t + 's';
    };

    items.forEach(item => {
      const itemName = item.name || 'Untitled';
      const itemGame = item.game || 'Generic';
      const itemType = item.type; // e.g. 'Monster', 'Spell'

      const sanitizedName = itemName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const sanitizedGame = itemGame.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      // Determine destination
      // Use item's own type if available, else fall back to request type
      const folderName = getFolderForType(itemType, type);

      const baseDir = path.join(__dirname, '_Content', 'Imported');
      const targetDir = path.join(baseDir, sanitizedGame, folderName);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filename = `${sanitizedName}.yaml`;
      const filePath = path.join(targetDir, filename);

      // Serialize just this item back to YAML
      // Note: we're splitting the mixed array into individual files per item.
      // This is generally cleaner for file-based CMS.
      const itemYaml = yamlParser.dump([item]); // Wrap in array to maintain list format expected by loader

      fs.writeFileSync(filePath, itemYaml, 'utf8');
      savedPaths.push(filePath);
      console.log(`[Forge] Saved ${filename} to ${targetDir}`);
    });

    res.json({ message: `Saved ${savedPaths.length} items successfully`, paths: savedPaths });

  } catch (e) {
    console.error("Forge Save Error:", e);
    res.status(500).json({ error: 'Invalid YAML or Save Failed: ' + e.message });
  }
});


// POST /api/forge/extract-multimodal - Combine Docling text + Vision for entity extraction
app.post('/api/forge/extract-multimodal', upload.single('file'), async (req, res) => {
  const { doclingText, type, game, source, apiKey, model } = req.body;

  if (!req.file && !doclingText) {
    return res.status(400).json({ error: 'PDF file or docling text required' });
  }
  if (!type || !game || !source) {
    return res.status(400).json({ error: 'Type, game, and source are required' });
  }
  if (!apiKey) {
    return res.status(400).json({ error: 'API key required for multimodal extraction' });
  }

  try {
    const forge = getForgeService();

    // If file provided, we use it for both text extraction and vision
    let text = doclingText;
    let pdfBuffer = req.file?.buffer;

    if (req.file && !doclingText) {
      text = await forge.extractText(req.file.buffer);
    }

    // Perform multimodal extraction
    const cards = await forge.extractMultiModal(
      text,
      pdfBuffer,
      type,
      game,
      source,
      apiKey,
      model || 'gemini-2.0-flash'
    );

    res.json({ cards, count: cards.length });
  } catch (e) {
    console.error("Multimodal Extraction Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forge/save-cards - Save verified cards to content YAML
app.post('/api/forge/save-cards', async (req, res) => {
  const { cards, game, contentType, origin } = req.body;

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'Cards array required' });
  }
  if (!game) {
    return res.status(400).json({ error: 'Game is required' });
  }

  try {
    const forge = getForgeService();
    const result = await forge.saveCards(cards, game, contentType || 'content', origin);
    res.json(result);
  } catch (e) {
    console.error("Save Cards Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/forge/extract-scribe - Use the enhanced Python Scribe pipeline
// This uses the new Python scripts with Gemini retry logic and model fallback
app.post('/api/forge/extract-scribe', async (req, res) => {
  const { text, type, game, source, taskId, apiKey, model } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text content required' });
  }
  if (!type) {
    return res.status(400).json({ error: 'Content type required (monster, item, spell)' });
  }

  const forge = getForgeService();
  if (taskId) forge.startTask(taskId);

  try {
    broadcastForgeEvent('log', { level: 'info', message: `[Scribe] Starting ${type} extraction via Python pipeline...` });

    const cards = await forge.extractWithPythonScribe(
      text,
      type,
      game || 'ShadowDark',
      source || 'Core',
      taskId,
      apiKey,
      model
    );

    broadcastForgeEvent('log', { level: 'info', message: `[Scribe] Extracted ${cards.length} ${type} entries` });

    res.json({
      cards,
      count: cards.length,
      message: `Extracted ${cards.length} ${type}(s) using Python Scribe pipeline`
    });
  } catch (e) {
    console.error("Scribe Extraction Error:", e);
    broadcastForgeEvent('log', { level: 'error', message: `[Scribe] Error: ${e.message}` });
    res.status(500).json({ error: e.message });
  } finally {
    if (taskId) forge.finishTask(taskId);
  }
});


// POST /api/table-contents (Matching Legacy Structure)
app.post('/api/table-contents', (req, res) => {
  const { table } = req.body;
  let target;
  if (table.filename) target = loader.getTableByFilename(table.filename);
  if (!target && table.tablename) target = loader.getTableByName(table.tablename);

  if (!target) return res.status(404).json({ error: 'Table not found' });

  // Helper to process results for display (stringify objects/arrays)
  const processResultsForDisplay = (results) => {
    if (!results) return [];
    return results.map(r => {
      if (typeof r === 'string') return r;
      if (typeof r === 'number') return String(r);
      // Handle array results (e.g. multi-roll format or just data)
      if (Array.isArray(r)) return JSON.stringify(r);
      // Handle object results (e.g. directives)
      if (typeof r === 'object') {
        if (r.roll) return `[Directive: Roll ${r.roll}]`;
        return JSON.stringify(r);
      }
      return String(r);
    });
  };

  // Recursive function to match legacy structure
  const processTableForDisplay = (t) => {
    const out = {
      name: t.tablename || t.name || 'Unnamed Table',
      filename: t.filename,
      type: t.type || 'Unknown',
      game: t.game || 'Unknown',
      setting: t.setting || 'Unknown',
      subtables: []
    };

    // Handle description
    if (t.description) {
      if (Array.isArray(t.description)) out.description = t.description.join(' ');
      else if (typeof t.description === 'string') out.description = t.description;
    }

    // 1. Direct results -> "Main Results" subtable
    if (t.results && Array.isArray(t.results) && t.results.length > 0) {
      out.subtables.push({
        name: 'Main Results',
        results: processResultsForDisplay(t.results)
      });
    }

    // 2. Subtables (tables/subTables)
    const childTables = t.tables || t.subTables || [];
    childTables.forEach(sub => {
      const processedSub = {
        name: sub.tablename || sub.name || 'Unnamed Subtable',
        results: []
      };

      // Description for subtable
      if (sub.description) {
        if (Array.isArray(sub.description)) processedSub.description = sub.description.join(' ');
        else if (typeof sub.description === 'string') processedSub.description = sub.description;
      }

      // Custom Display
      if (sub.customDisplay) {
        processedSub.customDisplay = sub.customDisplay;
      }

      // Results
      if (sub.results && Array.isArray(sub.results)) {
        processedSub.results = processResultsForDisplay(sub.results);
      }

      // Nested subtables (legacy structure supports infinite nesting, but usually 1 level deep in UI)
      // Legacy uses 'nestedSubtables' for deeper levels or just recurses? 
      // Legacy `server.js` snippet showed: `processedSubtable.nestedSubtables = subTable.subTables.map(...)`
      // Let's replicate this pattern if it exists.
      if (sub.subTables || sub.tables) {
        // Recurse strictly for nesting in the UI structure if needed, 
        // OR just push them as sibling subtables if that's how the UI renders.
        // Legacy snippet specifically creates `nestedSubtables` on the subtable object.
        const nested = sub.subTables || sub.tables;
        if (nested && Array.isArray(nested)) {
          processedSub.nestedSubtables = nested.map(n => {
            const nRes = {
              name: n.tablename || n.name || 'Unnamed',
              results: processResultsForDisplay(n.results || [])
            };
            if (n.description) nRes.description = Array.isArray(n.description) ? n.description.join(' ') : n.description;
            return nRes;
          });
        }
      }

      out.subtables.push(processedSub);
    });

    return out;
  };

  try {
    const tableData = processTableForDisplay(target);
    res.json({ tableData });
  } catch (e) {
    console.error("Error processing table contents:", e);
    res.status(500).json({ error: e.message });
  }
});


app.listen(PORT, () => {
  console.log(`Server v2 running on port ${PORT}`);
  console.log(`Powered by TypeScript Engine`);
});

// --- User System Implementation ---

const crypto = require('crypto');

// Import UserService from compiled TypeScript
const UserService = require('./dist/src/services/UserService');
const Encryption = require('./dist/src/services/Encryption');

// Initialize encryption on startup
Encryption.initEncryption();

// Legacy compatibility wrappers
function loadUsers() {
  // Return array of all users for legacy endpoints
  const usernames = UserService.listUsers();
  return usernames.map(u => UserService.loadUser(u)).filter(Boolean);
}

function saveUsers(users) {
  // Save each user individually
  for (const user of users) {
    UserService.saveUser(user);
  }
}

function hashPassword(password) {
  return UserService.hashPassword(password);
}

// POST /api/register
app.post('/api/register', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const newUser = UserService.createUser(username, password, email, false);
    // Return user without sensitive data
    const { passwordHash, secrets, ...safeUser } = newUser;
    res.json({ user: safeUser });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = UserService.verifyCredentials(username, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { passwordHash, secrets, ...safeUser } = user;
  res.json({ user: safeUser });
});

// POST /api/user/favorites/toggle
app.post('/api/user/favorites/toggle', (req, res) => {
  const { username, tableFilename } = req.body;

  const user = UserService.loadUser(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Ensure favorites structure exists
  if (!user.favorites) user.favorites = { tables: [], cards: [] };
  if (Array.isArray(user.favorites)) {
    // Migrate old format
    user.favorites = { tables: user.favorites, cards: [] };
  }

  const favIndex = user.favorites.tables.indexOf(tableFilename);
  let isFavorite = false;

  if (favIndex === -1) {
    user.favorites.tables.push(tableFilename);
    isFavorite = true;
  } else {
    user.favorites.tables.splice(favIndex, 1);
    isFavorite = false;
  }

  UserService.saveUser(user);

  res.json({ favorites: user.favorites.tables, isFavorite });
});

// GET /api/user/secrets - Get decrypted secrets for current user
app.get('/api/user/secrets', (req, res) => {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const secrets = UserService.getUserSecrets(username);
  res.json({ secrets: secrets || {} });
});

// POST /api/user/secrets - Set encrypted secrets
app.post('/api/user/secrets', (req, res) => {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { geminiApiKey } = req.body;

  try {
    UserService.setUserSecrets(username, { geminiApiKey });
    res.json({ message: 'Secrets saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/user/preferences - Get user preferences
app.get('/api/user/preferences', (req, res) => {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = UserService.loadUser(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ preferences: user.preferences || {} });
});

// POST /api/user/preferences - Update user preferences
app.post('/api/user/preferences', (req, res) => {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = UserService.loadUser(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.preferences = { ...user.preferences, ...req.body };
  UserService.saveUser(user);

  res.json({ preferences: user.preferences });
});

// --- Password Recovery ---

// Mock Email Sender (future SMTP hook)
async function sendEmail(to, subject, body) {
  console.log('=================================================');
  console.log(`[MOCK EMAIL] To: ${to}`);
  console.log(`[MOCK EMAIL] Subject: ${subject}`);
  console.log(`[MOCK EMAIL] Body:`);
  console.log(body);
  console.log('=================================================');
  // Return true to simulate success
  return true;
}

// POST /api/forgot-password
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required' });

  const users = loadUsers();
  const user = users.find(u => u.email === email);

  // Security: Don't reveal if user exists or not, but for dev/MVP we can be lenient or just standardized
  // If user not found, we just pretend we sent it to avoid enumeration? 
  // For this local generator, let's be helpfully explicitly.
  if (!user) {
    return res.status(404).json({ error: 'User with this email not found' });
  }

  // Generate Token
  const token = crypto.randomBytes(20).toString('hex');
  const expiry = Date.now() + 3600000; // 1 hour from now

  user.resetToken = token;
  user.resetTokenExpiry = expiry;

  saveUsers(users);

  // "Send" Email
  const success = await sendEmail(
    user.email,
    'Password Reset Request',
    `You requested a password reset. Your token is: ${token}\n\nUse this token in the app to reset your password.`
  );

  if (success) {
    res.json({ message: 'Password reset email sent (check server console)' });
  } else {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// POST /api/reset-password
app.post('/api/reset-password', (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }

  const users = loadUsers();
  const user = users.find(u =>
    u.resetToken === token &&
    u.resetTokenExpiry > Date.now()
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  // Reset Password
  user.passwordHash = hashPassword(newPassword);
  user.resetToken = null;
  user.resetTokenExpiry = null;

  saveUsers(users);

  res.json({ message: 'Password successfully reset' });
});

// --- Admin Endpoints ---

// Middleware to check if user is admin
// Trusts 'x-username' header for local tool context
function requireAdmin(req, res, next) {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (!user.isAdmin) {
    return res.status(403).json({ error: 'Access denied: Admins only' });
  }

  req.adminUser = user;
  next();
}

// GET /api/admin/users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = loadUsers();
  // Return safe user objects
  const safeUsers = users.map(u => {
    const { passwordHash, resetToken, resetTokenExpiry, ...safe } = u;
    return safe;
  });
  res.json({ users: safeUsers });
});

// PUT /api/admin/users/:username
app.put('/api/admin/users/:username', requireAdmin, (req, res) => {
  const targetUsername = req.params.username;
  const { newUsername, email, password, isAdmin } = req.body;

  const users = loadUsers();
  const userIndex = users.findIndex(u => u.username === targetUsername);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Update fields
  const user = users[userIndex];

  if (newUsername && newUsername !== user.username) {
    // Check collision
    if (users.find(u => u.username === newUsername)) {
      return res.status(409).json({ error: 'New username already taken' });
    }
    user.username = newUsername;
  }

  if (email !== undefined) user.email = email;
  if (password) user.passwordHash = hashPassword(password);
  if (isAdmin !== undefined) user.isAdmin = !!isAdmin;

  saveUsers(users);

  const { passwordHash, resetToken, resetTokenExpiry, ...safeUser } = user;
  res.json({ message: 'User updated', user: safeUser });
});

// DELETE /api/admin/users/:username
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  const targetUsername = req.params.username;

  // Prevent self-deletion ? Maybe? Or just allowed.
  // Generally good to prevent deleting yourself efficiently to avoid locking yourself out if you are the only admin.
  if (targetUsername === req.adminUser.username) {
    return res.status(400).json({ error: 'Cannot delete your own account while logged in.' });
  }

  const users = loadUsers();
  const newUsers = users.filter(u => u.username !== targetUsername);

  if (users.length === newUsers.length) {
    return res.status(404).json({ error: 'User not found' });
  }

  saveUsers(newUsers);
  res.json({ message: `User ${targetUsername} deleted` });
});

// Final Catch-all Error Handler for API routes
// This ensures that even middleware errors (like PayloadTooLarge) 
// return JSON if they come from an /api/* path.
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.error('API Error Middleware:', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      details: err.stack
    });
  }
  next(err);
});

// Standard error page fallback
app.use((err, req, res, next) => {
  res.status(err.status || 500).send('<h1>Something went wrong</h1><pre>' + err.message + '</pre>');
});
