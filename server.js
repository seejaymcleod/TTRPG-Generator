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

// Generation endpoint
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
    tables = files
      .filter(file => file.endsWith('.yaml'))
      .map(filename => {
        try {
          const table = yaml.load(
            fs.readFileSync(path.join(TABLES_DIR, filename), 'utf8')
          );
          table.filename = filename;
          table.game = table.game || 'Unknown';
          table.type = table.type || 'Unknown';
          table.setting = table.setting || 'Unknown';
          if (DEBUG) {
            console.log('Loaded table:', JSON.stringify(table, null, 2));
          }
          return table;
        } catch (err) {
          console.error('Error loading YAML file:', filename, err);
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.error('Error reading tables directory:', err);
  }
}

// Utility: simple random selection
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Utility: weighted random selection (supports two-element arrays)
function weightedRandom(results) {
  let weightedEntries = [];
  results.forEach(entry => {
    if (Array.isArray(entry)) {
      let [value, weight] = entry;
      for (let i = 0; i < weight; i++) {
        weightedEntries.push(value);
      }
    } else if (typeof entry === 'string') {
      // unweighted => weight=1
      weightedEntries.push(entry);
    }
  });
  if (weightedEntries.length === 0) {
    console.error('Error: No valid entries found for weighting.');
    return 'Error: No valid entries found';
  }
  return randomChoice(weightedEntries);
}

// Weighted random from table.results
function getWeightedRandomResult(table) {
  let weightedEntries = [];
  table.results.forEach(entry => {
    if (Array.isArray(entry)) {
      let [value, weight] = entry;
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

// Process a customDisplay string.
// - For normal tokens like "{Syllable2, 0.5}", parse an optional weight & skip/keep based on a random roll.
// - For tokens starting with "selectedResult", do a top-level table lookup, then subtable lookup in the current table.
function processCustomDisplay(table, allTables, context) {
  // Remove outer brackets.
  let displayStr = table.customDisplay.replace(/^\[|\]$/g, '');
  
  // Prepare variables:
  let normalResult = "";
  let deferredTokens = [];
  
  // Regex to capture tokens in the form {tokenContent}
  const tokenRegex = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let match;
  
  while ((match = tokenRegex.exec(displayStr)) !== null) {
    // Append any text between tokens.
    normalResult += displayStr.slice(lastIndex, match.index);
    let tokenContent = match[1].trim();
    
    // Check for deferred tokens:
    if (tokenContent.startsWith("selectedResult")) {
      deferredTokens.push(tokenContent);
      if (DEBUG) console.log(`Deferred token encountered: ${tokenContent}`);
    } else {
      // Parse "SubtableName" or "SubtableName, weight"
      const parts = tokenContent.split(',');
      const subTableName = parts[0].trim();
      let weight = 1;
      if (parts.length > 1) {
        let parsedWeight = parseFloat(parts[1].trim());
        if (!isNaN(parsedWeight)) {
          weight = parsedWeight;
        }
      }
      // Roll for inclusion based on weight probability
      if (Math.random() < weight) {
        let subTable = table.subTables?.find(
          t => t.name.toLowerCase() === subTableName.toLowerCase()
        );
        if (subTable && subTable.results?.length > 0) {
          let choice = randomChoice(subTable.results);
          normalResult += choice;
          if (DEBUG) {
            console.log(
              `Token "${tokenContent}" included (weight ${weight}). Selected "${choice}" from subtable "${subTableName}".`
            );
          }
        } else {
          if (DEBUG) {
            console.log(
              `Subtable "${subTableName}" not found or has no results.`
            );
          }
        }
      } else {
        if (DEBUG) {
          console.log(
            `Token "${tokenContent}" skipped due to weight roll (${weight}).`
          );
        }
      }
    }
    lastIndex = tokenRegex.lastIndex;
  }
  // Append any trailing text.
  normalResult += displayStr.slice(lastIndex);
  
  // Now handle deferred tokens (e.g. "selectedResult, Ancestry")
  let finalResult = normalResult;
  deferredTokens.forEach(tokenContent => {
    if (DEBUG) {
      console.log(
        `Processing deferred token: "${tokenContent}" with current result: "${finalResult}"`
      );
    }
    // Example tokenContent: "selectedResult, Ancestry"
    let parts = tokenContent.split(',');
    let tableToLookup = parts[1] ? parts[1].trim() : "Ancestry";
    
    // 1) Find the top-level table by name
    let refTable = allTables.find(t =>
      (t.name || t.tablename)?.toLowerCase() === tableToLookup.toLowerCase()
    );
    if (!refTable || !refTable.results) {
      if (DEBUG) {
        console.log(
          `Deferred token: Could not find a top-level table named "${tableToLookup}" or it has no results.`
        );
      }
      return; // Skip further processing for this token
    }
    
    // 2) Pick from that table
    let pickedResult = getWeightedRandomResult(refTable);
    if (DEBUG) {
      console.log(
        `Deferred token: Picked "${pickedResult}" from top-level table "${tableToLookup}".`
      );
    }
    
    // 3) Now use that pick as the subtable name in the *current* table
    if (table.subTables) {
      let subTable = table.subTables.find(
        st => st.name.toLowerCase() === pickedResult.toLowerCase()
      );
      if (subTable && subTable.results?.length > 0) {
        let finalPick = randomChoice(subTable.results);
        finalResult = finalPick;
        if (DEBUG) {
          console.log(
            `Deferred token: Found subtable "${pickedResult}" in current table "${table.name}". Picked "${finalPick}".`
          );
        }
      } else {
        if (DEBUG) {
          console.log(
            `Deferred token: No subtable named "${pickedResult}" in current table "${table.name}".`
          );
        }
      }
    }
  });
  
  if (DEBUG) {
    console.log(`Final customDisplay result: "${finalResult}"`);
  }
  return finalResult;
}

// Process a table, returning { header, result }
function processTable(table, parentHeader, allTables, context) {
  const header = table.name || table.tablename || parentHeader;

  // 1) If the table has customDisplay => parse it
  if (table.customDisplay) {
    return { header, result: processCustomDisplay(table, allTables, context) };
  }
  // 2) If the table has results => do a weighted pick
  else if (table.results && Array.isArray(table.results) && table.results.length > 0) {
    return { header, result: getWeightedRandomResult(table) };
  }
  // 3) If the table has subTables => gather from each subTable
  else if (table.tables && Array.isArray(table.tables)) {
    let subResults = [];
    table.tables.forEach(subTable => {
      const subResult = processTable(subTable, header, allTables, context);
      if (subResult) {
        subResults.push(subResult);
      }
    });
    return { header, result: subResults };
  }
  // 4) Fallback
  else {
    console.warn(
      'Table does not have results or subTables:',
      JSON.stringify(table, null, 2)
    );
    return { header, result: "No valid entries" };
  }
}

// Generate results from a table multiple times
function generateResultsFromTables(table, numberOfGenerations, allTables) {
  let results = [];
  for (let i = 0; i < numberOfGenerations; i++) {
    // Create a fresh context for each generation
    let context = {};
    const result = processTable(table, "", allTables, context);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

// Serve the index.html file
app.get('/', (req, res) => {
  if (DEBUG) console.log('Serving index.html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (DEBUG) console.log('Debugging is enabled.');
});
