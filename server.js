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

// Add enhanced error handling to the generate endpoint
app.post('/api/generate', (req, res) => {
  const { table, number } = req.body;
  if (!table || typeof number !== 'number') {
    console.error('Invalid request data:', req.body);
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  // Find the table by both filename and tablename to be more flexible
  const selectedTable = tables.find(t => 
    (t.filename === table.filename) || 
    (t.tablename === table.tablename));
  
  if (!selectedTable) {
    console.error('Table not found:', table);
    return res.status(404).json({ error: 'Table not found.' });
  }

  try {
    console.log('Generating from table:', selectedTable.tablename || selectedTable.filename);
    
    // Check that the table structure is valid
    if (!selectedTable.tables || !Array.isArray(selectedTable.tables)) {
      console.error('Invalid table structure - missing tables array:', selectedTable);
      return res.status(500).json({ error: 'Invalid table structure - missing tables array.' });
    }
    
    const results = generateResultsFromTables(selectedTable, number, tables);
    
    if (!results || results.length === 0) {
      console.error('Generated empty results');
      return res.status(500).json({ error: 'Generated empty results.' });
    }
    
    console.log('Successfully generated results');
    res.json({ results });
  } catch (error) {
    console.error('Error generating results:', error);
    res.status(500).json({ error: 'Failed to generate results: ' + error.message });
  }
});

// Enhanced debugging version of the reroll endpoint with much more logging
app.post('/api/reroll', (req, res) => {
  const { table, header, context: clientContext } = req.body;
  if (!table) {
    return res.status(400).json({ error: 'Invalid request data: table is required' });
  }

  console.log(`Reroll request for ${table.filename}, header: ${header}`);

  const selectedTable = tables.find(t => t.filename === table.filename);
  if (!selectedTable) {
    console.error(`Table not found: ${table.filename}`);
    return res.status(404).json({ error: 'Table not found.' });
  }

  try {
    const context = clientContext || {};
    const isKnaveCareer = table.filename && table.filename.includes('Knave_Careers');
    const isViridianLocation = table.filename && table.filename.includes('ViridianDice_Locations') || 
                              header === 'Dungeon Locations';
    
    // Special handling for Knave careers (rename to array format handler)
    if (isKnaveCareer) {
      console.log('Processing array format reroll');
      
      // Find the Careers table directly from the loaded table structure
      const arrayTable = selectedTable.tables && 
                        selectedTable.tables.find(t => t.name === 'Careers');
      
      if (!arrayTable || !arrayTable.results || !arrayTable.results.length) {
        console.error('Invalid array structure:', selectedTable);
        return res.status(500).json({ error: 'Could not find array data' });
      }
      
      // Get random array entry directly from the results
      const arrayEntry = arrayTable.results[Math.floor(Math.random() * arrayTable.results.length)];
      console.log('Selected array entry:', arrayEntry);
      
      // Validate the array entry format
      if (!Array.isArray(arrayEntry)) {
        console.error('Invalid array format:', arrayEntry);
        return res.status(500).json({ error: 'Invalid array data format' });
      }
      
      // Return the array in proper format
      return res.json({
        result: {
          header: header || 'Careers',
          result: arrayEntry,
          _isArray: true,
          _tableName: 'Array Data'
        },
        context
      });
    }
    
    // Special handling for Viridian locations
    if (isViridianLocation) {
      console.log('Processing Viridian location reroll');
      
      // Find the Dungeon Locations table directly
      const locationsTable = selectedTable.tables &&
                            selectedTable.tables.find(t => t.name === 'Dungeon Locations');
      
      if (!locationsTable || !locationsTable.results || !locationsTable.results.length) {
        console.error('Invalid Viridian locations structure:', selectedTable);
        return res.status(500).json({ error: 'Could not find locations data' });
      }
      
      // Get random location
      const location = locationsTable.results[Math.floor(Math.random() * locationsTable.results.length)];
      console.log('Selected location:', location);
      
      // Return the location in proper format
      return res.json({
        result: {
          header: header || 'Dungeon Locations',
          result: location,
          _tableName: 'Viridian Locations'
        },
        context
      });
    }
    
    // For other tables, use the existing find and process approach
    let targetTable = findSpecificTable(selectedTable, header);
    
    if (!targetTable) {
      console.error(`Could not find subtable matching header: ${header}`);
      return res.status(404).json({ error: `Could not find subtable matching header: ${header}` });
    }
    
    const result = processTable(targetTable, header, tables, context);
    console.log('Final result:', result);
    res.json({ result, context });
  } catch (error) {
    console.error('Error rerolling result:', error);
    res.status(500).json({ error: 'Failed to reroll result: ' + error.message });
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

// Modify the getWeightedRandomResult function to handle multi-value arrays
function getWeightedRandomResult(table) {
  let weightedEntries = [];
  table.results.forEach(entry => {
    if (Array.isArray(entry)) {
      // New type check: If array has 2 elements and both are strings,
      // it's a multi-field entry (not a weighted entry)
      if (entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
        // For career-style entries with [career, items] format
        weightedEntries.push({
          career: entry[0],
          items: entry[1]
        });
      } else {
        // Standard weighted entry [value, weight]
        let [value, weight] = entry;
        for (let i = 0; i < (weight || 1); i++) {
          weightedEntries.push(value);
        }
      }
    } else if (typeof entry === 'object' && entry !== null) {
      // Support for object entries (like {career: "X", items: "Y"})
      weightedEntries.push(entry);
    } else if (typeof entry === 'string') {
      // Plain string entries
      weightedEntries.push(entry);
    }
  });
  
  if (weightedEntries.length === 0) {
    console.error('Error: No valid entries found for weighting in table:', table.name);
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

// Check if a table is contained within another table
function isTableContained(parentTable, childTable) {
  if (parentTable === childTable) return true;
  
  if (parentTable.tables && Array.isArray(parentTable.tables)) {
    for (const subTable of parentTable.tables) {
      if (isTableContained(subTable, childTable)) return true;
    }
  }
  
  return false;
}

// Process a table and generate results
function processTable(table, parentHeader, allTables, context) {
  const header = table.name || table.tablename || parentHeader;

  // Store the source table name for reference (will be hidden in UI)
  const sourceInfo = {
    _tableName: table.name || table.tablename,
    _fileName: table.filename
  };

  // Special case for Viridian Locations
  if ((table.filename && table.filename.includes('ViridianDice_Locations')) ||
      (header === 'Dungeon Locations')) {
    console.log(`Processing Viridian Location table: ${header}`);
    
    if (table.results && Array.isArray(table.results) && table.results.length > 0) {
      const result = randomChoice(table.results);
      console.log(`Selected Viridian Location: ${result}`);
      
      // Store result in context
      if (context && header) {
        context[header] = result;
      }
      
      return { header, result, ...sourceInfo };
    }
  }

  // Special case for Knave Careers - explicitly detect by filename
  if (table.filename && table.filename.includes('Knave_Careers')) {
    console.log(`Processing Knave Career table: ${header}`);
    
    if (table.results && Array.isArray(table.results) && table.results.length > 0) {
      const career = randomChoice(table.results);
      console.log(`Selected Knave Career:`, career);
      
      // Force careers into standard [career, items] format
      let result;
      if (Array.isArray(career) && career.length >= 2) {
        result = career;
      } else if (typeof career === 'object' && career.career && career.items) {
        result = [career.career, career.items];
      } else {
        console.error('Unexpected career format:', career);
        result = ["Unknown Career", "Unknown Items"];
      }
      
      // Store result in context
      if (context && header) {
        context[header] = result;
      }
      
      // Always include the _isCareer flag
      return { 
        header, 
        result,
        _isCareer: true,
        ...sourceInfo 
      };
    }
  }

  // Original processTable logic for other tables
  // 1) If the table has customDisplay => parse it
  if (table.customDisplay) {
    const result = processCustomDisplay(table, allTables, context);
    return { header, result, ...sourceInfo };
  }
  // 2) If the table has results => do a weighted pick
  else if (table.results && Array.isArray(table.results) && table.results.length > 0) {
    const result = getWeightedRandomResult(table);
    
    // Store result in context
    if (context && header) {
      context[header] = result;
      if (DEBUG) console.log(`Stored result "${result}" for table "${header}" in context`);
    }
    
    // Special detection for Knave Careers format - preserve the original array structure
    if (Array.isArray(result) && result.length === 2 && 
        typeof result[0] === 'string' && typeof result[1] === 'string') {
      // Mark this as a Knave careers result with a special type marker
      return { 
        header, 
        result,
        _isCareer: true,  // Add this marker to identify it as a career format
        ...sourceInfo 
      };
    }
    
    // Handle special case for object results with career/items
    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
      if (result.career && result.items) {
        // Preserve as a two-element array
        return { 
          header, 
          result: [result.career, result.items],
          _isCareer: true,
          ...sourceInfo 
        };
      }
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

// Add this new helper function to debug table data
function debugTableStructure(table) {
  if (!DEBUG) return;
  
  console.log(`Table debug for: ${table.name || table.tablename || 'unnamed table'}`);
  console.log(`Filename: ${table.filename || 'N/A'}`);
  console.log(`Has customDisplay: ${table.customDisplay ? 'YES' : 'NO'}`);
  console.log(`Has results: ${table.results ? `YES (${table.results.length} entries)` : 'NO'}`);
  
  if (table.results && table.results.length > 0) {
    const sampleEntry = table.results[0];
    console.log(`Sample result entry: ${typeof sampleEntry === 'object' ? JSON.stringify(sampleEntry) : sampleEntry}`);
    
    // Check for career format
    if (Array.isArray(sampleEntry) && sampleEntry.length === 2 && 
        typeof sampleEntry[0] === 'string' && typeof sampleEntry[1] === 'string') {
      console.log(`Table appears to use career format [career, items]`);
    }
  }
  
  console.log(`Has tables: ${table.tables ? `YES (${table.tables.length} tables)` : 'NO'}`);
  console.log(`Has subTables: ${table.subTables ? `YES (${table.subTables.length} subtables)` : 'NO'}`);
}

// Add this debug helper function at the top of the file with other utility functions
function printObject(obj, label = 'Object') {
  console.log(`=== ${label} ===`);
  if (typeof obj !== 'object' || obj === null) {
    console.log(`Not an object: ${obj}`);
    return;
  }
  
  try {
    const cleaned = JSON.parse(JSON.stringify(obj, (key, value) => {
      if (typeof value === 'function') return '[Function]';
      if (key.startsWith('_') && key !== '_isCareer' && key !== '_fileName' && key !== '_tableName') return undefined;
      return value;
    }));
    console.log(cleaned);
  } catch (e) {
    console.log('Error stringifying object:', e);
    console.log(obj);
  }
}

// Update this part of the reroll endpoint handling for Knave careers
app.post('/api/reroll', (req, res) => {
  // ...existing code...
  
  try {
    // ...existing code...
    
    // Enhanced Knave career handling - ensure it always returns the proper format
    if (selectedTable.filename && selectedTable.filename.includes('Knave_Careers')) {
      console.log(`=== KNAVE CAREER SPECIAL HANDLING ===`);
      
      // Always force the career array format regardless of what came back from processTable
      if (typeof result === 'object' && result !== null) {
        result._isCareer = true;
        
        // Force into array format [career, items]
        let careerValue = 'Unknown Career';
        let itemsValue = 'Unknown Items';
        
        // Check for array format first
        if (Array.isArray(result.result) && result.result.length >= 2) {
          careerValue = result.result[0] || careerValue;
          itemsValue = result.result[1] || itemsValue;
          console.log(`Found Knave career in array format: [${careerValue}, ${itemsValue}]`);
        }
        // Check for object format with career/items properties
        else if (typeof result.result === 'object' && result.result !== null &&
                result.result.career && result.result.items) {
          careerValue = result.result.career;
          itemsValue = result.result.items;
          console.log(`Found Knave career in object format, converting to array: [${careerValue}, ${itemsValue}]`);
        }
        // If we get a string, try to split it
        else if (typeof result.result === 'string') {
          const matches = result.result.match(/^([^,]+),\s*(.+)$/);
          if (matches && matches.length >= 3) {
            careerValue = matches[1].trim();
            itemsValue = matches[2].trim();
            console.log(`Split Knave career string into array: [${careerValue}, ${itemsValue}]`);
          } else {
            careerValue = result.result;
            console.log(`Using string value as career only: [${careerValue}, ${itemsValue}]`);
          }
        }
        
        // Override the result with our properly formatted array
        result.result = [careerValue, itemsValue];
        
        // Direct access to the table to fetch a real career if needed
        if (careerValue === 'Unknown Career' && targetTable && 
            targetTable.results && targetTable.results.length > 0) {
          // Try to get a valid career from the table
          const freshResult = getWeightedRandomResult(targetTable);
          if (Array.isArray(freshResult) && freshResult.length >= 2) {
            result.result = [freshResult[0], freshResult[1]];
            console.log(`Generated fresh Knave career: [${result.result[0]}, ${result.result[1]}]`);
          }
        }
        
        // Final check for malformed career
        if (!Array.isArray(result.result) || result.result.length < 2) {
          console.error('Career format is still incorrect, forcing array structure:', result);
          result.result = [careerValue, itemsValue];
        }
        
        printObject(result, 'Final Knave career result');
      }
    }
    
    // Enhanced Viridian Locations handling
    if (targetTable.name === 'Dungeon Locations' || 
        (selectedTable.filename && selectedTable.filename.includes('ViridianDice_Locations'))) {
      console.log(`=== VIRIDIAN LOCATION SPECIAL HANDLING ===`);
      
      // If result is an object, ensure it has a result property that is a string
      if (typeof result === 'object' && result !== null) {
        // Direct string case
        if (typeof result.result === 'string') {
          console.log(`Viridian location already in correct format: "${result.result}"`);
        }
        // Need to extract from object
        else if (result.result && typeof result.result === 'object') {
          // If the nested result has a string result property, use that
          if (typeof result.result.result === 'string') {
            const locationName = result.result.result;
            result.result = locationName;
            console.log(`Extracted location name from nested object: "${locationName}"`);
          }
          // Otherwise try to find any string property
          else {
            let found = false;
            for (const key in result.result) {
              if (typeof result.result[key] === 'string' && !key.startsWith('_')) {
                const locationName = result.result[key];
                result.result = locationName;
                console.log(`Found string property "${key}" with value: "${locationName}"`);
                found = true;
                break;
              }
            }
            
            // If no string property found, try to generate a new one
            if (!found && targetTable && targetTable.results && targetTable.results.length > 0) {
              const locationName = randomChoice(targetTable.results);
              result.result = locationName;
              console.log(`Generated new location: "${locationName}"`);
            }
          }
        }
      }
      
      printObject(result, 'Final Viridian location result');
    }
    
    // ...existing code...
  } catch (error) {
    // ...existing error handling...
  }
});

// ...existing code...
