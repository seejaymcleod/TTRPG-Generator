// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const app = express();
const PORT = process.env.PORT || 1337;
const TABLES_DIR = path.join(__dirname, 'tables');

// Toggleable debugging flag
const DEBUG = true;

// Load tables into memory on startup
let tables = [];
loadAllTables();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to fetch table names and details
app.get('/api/tables', (req, res) => {
  if (DEBUG) console.log('Sending tables data:', tables);
  res.json(tables.map(table => ({
    filename: table.filename,
    tablename: table.tablename || 'Unknown',
    game: table.game || 'Unknown',
    type: table.type || 'Unknown',
    setting: table.setting || 'Unknown'
  })));
});

// Modified generateResultsFromTables to pass all tables
app.post('/api/generate', (req, res) => {
  const { table, number } = req.body;
  if (!table || typeof number !== 'number') {
    return res.status(400).json({ error: 'Invalid request data.' });
  }
  const selectedTable = tables.find(t => t.filename === table.filename);
  if (!selectedTable) {
    return res.status(404).json({ error: 'Table not found.' });
  }
  try {
    const results = generateResultsFromTables(selectedTable, number, tables);
    if (DEBUG) console.log('Generated results:', JSON.stringify(results, null, 2));
    res.json({ results });
  } catch (error) {
    console.error('Error generating results:', error);
    res.status(500).json({ error: 'Failed to generate results.' });
  }
});

// Function to load all YAML files
function loadAllTables() {
  try {
    const files = fs.readdirSync(TABLES_DIR);
    tables = files.filter(file => file.endsWith('.yaml')).map(filename => {
      try {
        const table = yaml.load(fs.readFileSync(path.join(TABLES_DIR, filename), 'utf8'));
        table.filename = filename;
        table.game = table.game || 'Unknown';
        table.type = table.type || 'Unknown';
        table.setting = table.setting || 'Unknown';
        if (DEBUG) console.log('Loaded table:', JSON.stringify(table, null, 2));
        return table;
      } catch (err) {
        console.error('Error loading YAML file:', filename, err);
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('Error reading tables directory:', err);
  }
}

// Utility: simple random selection.
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Utility: weighted random selection (supports two-element arrays for weighting).
function weightedRandom(results) {
  let weightedEntries = [];
  results.forEach(entry => {
    if (Array.isArray(entry)) {
      let value = entry[0];
      let weight = entry[1];
      for (let i = 0; i < weight; i++) {
        weightedEntries.push(value);
      }
    } else if (typeof entry === 'string') {
      weightedEntries.push(entry);
    }
  });
  if (weightedEntries.length === 0) {
    console.error('Error: No valid entries found for weighting.');
    return 'Error: No valid entries found';
  }
  return randomChoice(weightedEntries);
}

// New function: process customDisplay strings.
// It parses tokens like {Syllable1} or {Syllable2, 0.5} and for the special token
// "selectedResult", it uses the "Ancestry" table to cache a result and then picks a random
// value from the matching subtable.
function processCustomDisplay(table, allTables) {
  let displayStr = table.customDisplay;
  // Remove surrounding square brackets if present.
  displayStr = displayStr.replace(/^\[|\]$/g, '');
  const tokenRegex = /\{([^}]+)\}/g;
  let resultStr = "";
  let match;
  while ((match = tokenRegex.exec(displayStr)) !== null) {
    let tokenContent = match[1].trim();
    // Check for the special token "selectedResult"
    if (tokenContent.startsWith("selectedResult")) {
      // For example, customDisplay: [selectedResult{Ancestry}]
      let ancestryTable = allTables.find(t => t.name === "Ancestry");
      if (ancestryTable) {
        const selectedAncestry = weightedRandom(ancestryTable.results);
        // Find the subtable with the name matching the selected ancestry.
        let subTable = table.subTables.find(t => t.name.toLowerCase() === selectedAncestry.toLowerCase());
        if (subTable && subTable.results && subTable.results.length > 0) {
          resultStr += randomChoice(subTable.results);
        }
      }
    } else {
      // Token format: "SubtableName" or "SubtableName, probability"
      let parts = tokenContent.split(',').map(s => s.trim());
      let subTableName = parts[0];
      let probability = parts[1] ? parseFloat(parts[1]) : 1;
      if (Math.random() <= probability) {
        let subTable = table.subTables.find(t => t.name.toLowerCase() === subTableName.toLowerCase());
        if (subTable && subTable.results && subTable.results.length > 0) {
          resultStr += randomChoice(subTable.results);
        }
      }
    }
  }
  return resultStr;
}

// Modified processTable to support customDisplay.
function processTable(table, parentHeader = '', allTables) {
  const header = table.name || table.tablename || parentHeader;

  // 1) If there's a customDisplay, parse it (returns a single string).
  if (table.customDisplay) {
    return { header, result: processCustomDisplay(table, allTables) };
  }

  // 2) If there is a direct 'results' array, pick one entry (weighted or not).
  else if (table.results && Array.isArray(table.results) && table.results.length > 0) {
    return { header, result: getWeightedRandomResult(table) };
  }

  // 3) If there are subTables, gather results from each one.
  else if (table.tables && Array.isArray(table.tables)) {
    let subResults = [];

    table.tables.forEach(subTable => {
      const subResult = processTable(subTable, header, allTables);
      if (subResult) {
        subResults.push(subResult);
      }
    });

    // We return an object with 'header' plus a nested array of results.
    return { header, result: subResults };
  }

  // 4) If none of the above, no valid content.
  else {
    console.warn('Table does not have results or tables:', JSON.stringify(table, null, 2));
    return { header, result: "No valid entries" };
  }
}


// Updated getWeightedRandomResult that supports the new weighted format.
function getWeightedRandomResult(table) {
  let weightedEntries = [];
  table.results.forEach(entry => {
    if (Array.isArray(entry)) {
      let value = entry[0];
      let weight = entry[1];
      for (let i = 0; i < weight; i++) {
        weightedEntries.push(value);
      }
    } else if (typeof entry === 'string') {
      weightedEntries.push(entry);
    }
  });
  if (weightedEntries.length === 0) {
    console.error('Error: No valid entries found for weighting.');
    return 'Error: No valid entries found';
  }
  return randomChoice(weightedEntries);
}

// Generate results from a table.
function generateResultsFromTables(table, numberOfGenerations, allTables) {
  let results = [];
  for (let i = 0; i < numberOfGenerations; i++) {
    const result = processTable(table, "", allTables);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

// Serve the index.html file.
app.get('/', (req, res) => {
  if (DEBUG) console.log('Serving index.html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server.
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (DEBUG) console.log('Debugging is enabled.');
});
