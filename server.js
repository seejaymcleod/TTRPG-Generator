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
// Add a route to serve images from the Images directory
app.use('/Images', express.static(path.join(__dirname, 'Images')));

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

// New endpoint for rerolling specific items with context preservation
app.post('/api/reroll', (req, res) => {
  const { table, header, context: clientContext } = req.body;
  if (!table) {
    return res.status(400).json({ error: 'Invalid request data: table is required' });
  }

  const selectedTable = tables.find(t => t.filename === table.filename);
  if (!selectedTable) {
    return res.status(404).json({ error: 'Table not found.' });
  }

  try {
    // Find the specific subtable matching the header
    let targetTable = findSpecificTable(selectedTable, header);
    
    if (!targetTable) {
      return res.status(404).json({ error: `Could not find subtable matching header: ${header}` });
    }

    // Create a context object from client-provided context (if any)
    const context = clientContext || {};
    
    // Process just this table with the preserved context
    const result = processTable(targetTable, header, tables, context);
    
    if (DEBUG) {
      console.log(`Rerolled "${header}" with result:`, JSON.stringify(result, null, 2));
      console.log(`Context after reroll:`, context);
    }
    
    res.json({ result, context });
  } catch (error) {
    console.error('Error rerolling result:', error);
    res.status(500).json({ error: 'Failed to reroll result' });
  }
});

// Helper function to find a specific table by its header/name
function findSpecificTable(rootTable, targetName) {
  // Check if this is the table we're looking for
  if ((rootTable.name === targetName) || (rootTable.tablename === targetName)) {
    return rootTable;
  }
  
  // Check tables array
  if (rootTable.tables && Array.isArray(rootTable.tables)) {
    for (const subTable of rootTable.tables) {
      const found = findSpecificTable(subTable, targetName);
      if (found) return found;
    }
  }
  
  // Check subTables array
  if (rootTable.subTables && Array.isArray(rootTable.subTables)) {
    for (const subTable of rootTable.subTables) {
      const found = findSpecificTable(subTable, targetName);
      if (found) return found;
    }
  }
  
  return null;
}

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
function processCustomDisplay(table, allTables, context) {
  if (DEBUG) console.log('Processing customDisplay for table:', table);

  if (!table.customDisplay) {
    console.error('Error: customDisplay is missing in the table:', table);
    return 'Error: customDisplay is missing';
  }

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

    // Check if we already have a cached result for this dependency
    let pickedResult = null;
    if (context && context[tableToLookup]) {
      pickedResult = context[tableToLookup];
      if (DEBUG) {
        console.log(`Using cached result "${pickedResult}" for table "${tableToLookup}" from context`);
      }
    } else {
      // Find the root table object
      const rootTable = findRootTable(table, allTables);
      
      // First try to find the table within the current hierarchy
      let refTable = findTableInHierarchy(rootTable, tableToLookup);
      
      if (DEBUG) {
        console.log(`Looking for table "${tableToLookup}" within current hierarchy: ${refTable ? "Found" : "Not found"}`);
      }

      // If not found in hierarchy, fallback to global search
      if (!refTable) {
        for (let i = 0; i < allTables.length; i++) {
          const t = allTables[i];
          const tableName = t.name || t.tablename;
          if (tableName && tableName.toLowerCase() === tableToLookup.toLowerCase()) {
            refTable = t;
            break;
          }
        }
        
        if (DEBUG && !refTable) {
          console.log(`Deferred token: Could not find a table named "${tableToLookup}" anywhere.`);
          console.log(`Available top-level table names:`, allTables.map(t => t.name || t.tablename));
        }
      }

      if (!refTable) {
        return; // Skip further processing for this token
      }

      if (!refTable.results || !Array.isArray(refTable.results) || refTable.results.length === 0) {
        if (DEBUG) {
          console.log(`Deferred token: Found table "${tableToLookup}" but it has no valid results.`);
        }
        return; // Skip further processing for this token
      }

      // Pick from that table and cache the result in context
      pickedResult = getWeightedRandomResult(refTable);
      if (context) {
        context[tableToLookup] = pickedResult;
      }
      
      if (DEBUG) {
        console.log(
          `Deferred token: Picked "${pickedResult}" from table "${tableToLookup}" and stored in context.`
        );
      }
    }

    // Now use that pick as the subtable name in the *current* table
    if (table.subTables) {
      let subTable = null;
      for (let i = 0; i < table.subTables.length; i++) {
        const st = table.subTables[i];
        if (st.name.toLowerCase() === pickedResult.toLowerCase()) {
          subTable = st;
          break;
        }
      }

      if (subTable && subTable.results?.length > 0) {
        let finalPick = randomChoice(subTable.results);
        finalResult = finalPick;
        if (DEBUG) {
          console.log(
            `Deferred token: Found subtable "${pickedResult}" in current table. Picked "${finalPick}".`
          );
        }
      } else {
        if (DEBUG) {
          console.log(
            `Deferred token: No subtable named "${pickedResult}" in current table or it has no results.`
          );
          if (table.subTables && table.subTables.length > 0) {
            console.log(`Available subtable names:`, table.subTables.map(st => st.name));
          }
        }
      }
    } else {
      if (DEBUG) {
        console.log(`Current table has no subTables property.`);
      }
    }
  });

  if (DEBUG) {
    console.log(`Final customDisplay result: "${finalResult}"`);
  }
  return finalResult;
}

// Find a table by name in the hierarchy of a given table
function findTableInHierarchy(rootTable, tableName) {
  if (!rootTable) return null;
  
  // Check if the current table matches
  if ((rootTable.name || rootTable.tablename) && 
      (rootTable.name || rootTable.tablename).toLowerCase() === tableName.toLowerCase()) {
    return rootTable;
  }
  
  // Check in tables array
  if (rootTable.tables && Array.isArray(rootTable.tables)) {
    for (const subTable of rootTable.tables) {
      const found = findTableInHierarchy(subTable, tableName);
      if (found) return found;
    }
  }
  
  return null;
}

// Find the root table that contains the current table
function findRootTable(currentTable, allTables) {
  // If currentTable is already a top-level table, return it
  if (allTables.includes(currentTable)) {
    return currentTable;
  }
  
  // Otherwise, find the top-level table that contains the current table
  for (const topTable of allTables) {
    if (isTableContained(topTable, currentTable)) {
      return topTable;
    }
  }
  
  return null;
}

// Check if childTable is contained somewhere in parentTable
function isTableContained(parentTable, childTable) {
  if (parentTable === childTable) return true;
  
  if (parentTable.tables && Array.isArray(parentTable.tables)) {
    for (const subTable of parentTable.tables) {
      if (isTableContained(subTable, childTable)) {
        return true;
      }
    }
  }
  
  return false;
}

// Process a table, returning { header, result } with source info
function processTable(table, parentHeader, allTables, context) {
  const header = table.name || table.tablename || parentHeader;

  // Store the source table name for reference (will be hidden in UI)
  const sourceInfo = {
    _tableName: table.name || table.tablename,
    _fileName: table.filename
  };

  // 1) If the table has customDisplay => parse it
  if (table.customDisplay) {
    const result = processCustomDisplay(table, allTables, context);
    return { header, result, ...sourceInfo };
  }
  // 2) If the table has results => do a weighted pick
  else if (table.results && Array.isArray(table.results) && table.results.length > 0) {
    const result = getWeightedRandomResult(table);
    // Store result in context if this is a dependency table
    if (context && header) {
      context[header] = result;
      if (DEBUG) console.log(`Stored result "${result}" for table "${header}" in context`);
    }
    return { header, result, ...sourceInfo };
  }
  // 3) If the table has subTables => gather from each subTable
  else if (table.tables && Array.isArray(table.tables)) {
    let subResults = [];
    table.tables.forEach(subTable => {
      // Pass down the filename as well
      if (!subTable.filename && table.filename) {
        subTable.filename = table.filename;
      }
      const subResult = processTable(subTable, header, allTables, context);
      if (subResult) {
        subResults.push(subResult);
      }
    });
    return { header, result: subResults, ...sourceInfo };
  }
  // 4) Fallback
  else {
    console.warn(
      'Table does not have results or subTables:',
      JSON.stringify(table, null, 2)
    );
    return { header, result: "No valid entries", ...sourceInfo };
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
