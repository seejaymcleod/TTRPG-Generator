const express = require('express');
const path = require('path');
const fs = require('fs');

// Import the compiled engine
// Note: Running from root, so dist is at ./dist
const { TableLoader, Renderer } = require('./dist/src/engine');

const app = express();
const PORT = process.env.PORT || 1337;

app.use(express.static(__dirname));
app.use(express.json());

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
        inputField: t.inputField || null
      };
    });
    res.json(tables);
  } catch (e) {
    console.error("Error fetching tables:", e);
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
