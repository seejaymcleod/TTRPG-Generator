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

// Modify the API endpoint to handle types as arrays
app.get('/api/tables', (req, res) => {
  if (DEBUG) console.log(`Sending data for ${tables.length} tables (use verbose logging to see full data)`);
  res.json(tables.map(table => {
    let typeValue; 
    
    // Handle type field as either string or array
    if (Array.isArray(table.type)) {
      typeValue = table.type;
    } else if (table.subtype) {
      typeValue = table.subtype;
    } else if (table.type) {
      typeValue = table.type;
    } else {
      typeValue = 'Unknown';
    }
    
    return {
      filename: table.filename,
      tablename: table.tablename || 'Unknown',
      game: table.game || 'Unknown',
      type: typeValue,  // This can now be a string or an array
      setting: table.setting || 'Unknown'
    };
  }));
});

// Function to extract values from context - will be used by client
function ExtractContext(context, key, defaultValue = null) {
  if (!context || typeof context !== 'object') return defaultValue;
  if (key in context) return context[key];
  return defaultValue;
}

// Add enhanced error handling to the generate endpoint
app.post('/api/generate', (req, res) => {
  const { table, number } = req.body;
  if (!table || typeof number !== 'number') {
    console.error('Invalid request data:', req.body);
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  // Log full details of the table being requested
  console.log('Generate request received for table:', {
    requestedFilename: table.filename,
    requestedTablename: table.tablename,
    requestedGame: table.game
  });
  
  // Get list of matching tables to help diagnose the issue
  const matchingByFilename = tables.filter(t => t.filename === table.filename);
  const matchingByName = tables.filter(t => t.tablename === table.tablename);
  
  console.log(`Found ${matchingByFilename.length} tables matching filename "${table.filename}"`);
  console.log(`Found ${matchingByName.length} tables matching tablename "${table.tablename}"`);
  
  if (matchingByName.length > 1) {
    console.log('Multiple tables match this tablename:', 
      matchingByName.map(t => ({ filename: t.filename, game: t.game })));
  }

  // First try to find by filename (most specific)
  let selectedTable = null;
  
  if (table.filename) {
    selectedTable = tables.find(t => t.filename === table.filename);
    if (selectedTable) {
      console.log(`Found table by filename: ${table.filename}`);
    }
  }
  
  // If not found by filename, try to find by tablename AND game (more specific than just tablename)
  if (!selectedTable && table.tablename && table.game) {
    selectedTable = tables.find(t => 
      t.tablename === table.tablename && 
      t.game === table.game);
    if (selectedTable) {
      console.log(`Found table by name and game: ${table.tablename} (${table.game})`);
    }
  }
  
  // Last resort: find by tablename only (least specific)
  if (!selectedTable && table.tablename) {
    selectedTable = tables.find(t => t.tablename === table.tablename);
    if (selectedTable) {
      console.log(`Found table by name only: ${table.tablename} (may be ambiguous)`);
    }
  }

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

// Replace the special case NPC handling with a more flexible, structure-based approach
app.post('/api/reroll', (req, res) => {
  const { table, header, context: clientContext } = req.body;
  if (!table) {
    return res.status(400).json({ error: 'Invalid request data: table is required' });
  }

  console.log(`Reroll request for table "${table.filename || table.tablename}", header: "${header}"`);

  const selectedTable = tables.find(t => t.filename === table.filename);
  if (!selectedTable) {
    console.error(`Table not found: ${table.filename}`);
    return res.status(404).json({ error: 'Table not found.' });
  }

  try {
    // Initialize context with thisResult property if not present
    const context = clientContext || {};
    if (!('thisResult' in context)) {
      context.thisResult = null;
    }
    
    // Find the specific subtable for this header with improved fallback logic
    let targetSubTable = null;
    
    // Search through the tables array for the matching header name
    if (selectedTable.tables && Array.isArray(selectedTable.tables)) {
      // First attempt: Look for exact name match
      for (const subTable of selectedTable.tables) {
        if (subTable.name === header || subTable.tablename === header) {
          targetSubTable = subTable;
          break;
        }
      }
      
      // Second attempt: If header matches the top-level tablename, use the first subtable
      if (!targetSubTable && selectedTable.tablename === header) {
        console.log(`Header "${header}" matches top-level tablename, using first subtable`);
        targetSubTable = selectedTable.tables[0];
      }
      
      // Third attempt: For unnamed subtables, check if there's only one subtable
      if (!targetSubTable && selectedTable.tables.length === 1) {
        console.log(`No named subtable found, using the only subtable available`);
        targetSubTable = selectedTable.tables[0];
      }
      
      // Fourth attempt: If still not found, try a case-insensitive match
      if (!targetSubTable) {
        const headerLower = header.toLowerCase();
        for (const subTable of selectedTable.tables) {
          const subTableName = subTable.name || subTable.tablename || '';
          if (subTableName.toLowerCase() === headerLower) {
            console.log(`Found subtable using case-insensitive match: ${subTableName}`);
            targetSubTable = subTable;
            break;
          }
        }
      }
    }
    
    // If not found in tables array, check if the top-level table itself has results
    if (!targetSubTable && selectedTable.results && Array.isArray(selectedTable.results)) {
      console.log(`Using top-level table results for header "${header}"`);
      targetSubTable = selectedTable;
    }
    
    if (!targetSubTable) {
      console.error(`Could not find subtable for header: ${header}`);
      return res.status(404).json({ error: `Could not find subtable for header: ${header}` });
    }
    
    // Process the subtable based on its structure
    let result;
    
    // Case 1: Table uses customDisplay
    if (targetSubTable.customDisplay) {
      console.log(`Processing table with customDisplay: ${targetSubTable.name || header}`);
      result = processCustomDisplay(targetSubTable, tables, context);
    }
    // Case 2: Table has simple array results
    else if (targetSubTable.results && Array.isArray(targetSubTable.results)) {
      if (targetSubTable.results.length === 0) {
        console.error(`Empty results array for subtable: ${header}`);
        return res.status(500).json({ error: `Empty results array for: ${header}` });
      }
      
      // Choose a random result
      const randomResult = getWeightedRandomResult(targetSubTable);
      result = randomResult;
      
      console.log(`Selected value for ${header}: ${JSON.stringify(result)}`);
    }
    // Case 3: No valid results structure
    else {
      console.error(`Invalid structure for subtable: ${header}`);
      return res.status(500).json({ error: `Invalid structure for subtable: ${header}` });
    }
    
    // Update the context
    context[header] = result;
    
    // Return the result with metadata to help client - include both names for compatibility
    return res.json({
      xtractContext: ExtractContext.toString(), // Renamed version
      extractContext: ExtractContext.toString(), // Original name for backward compatibility
      result: {
        header: header,
        result: result,
        _tableName: targetSubTable.name || targetSubTable.tablename || header
      },
      context
    });
  } catch (error) {
    console.error('Error rerolling result:', error);
    res.status(500).json({ error: 'Failed to reroll result: ' + error.message });
  }
});

// Replace the /api/table-contents endpoint with this improved version
app.post('/api/table-contents', (req, res) => {
  const { table } = req.body;
  if (!table) {
    return res.status(400).json({ error: 'Invalid request data: table is required' });
  }

  console.log(`Table contents request for table "${table.filename || table.tablename}"`);

  const selectedTable = tables.find(t => t.filename === table.filename);
  if (!selectedTable) {
    console.error(`Table not found: ${table.filename}`);
    return res.status(404).json({ error: 'Table not found.' });
  }

  try {
    // For complex tables, build a hierarchical structure of all subtables and their results
    const processedTable = processTableForDisplay(selectedTable);
    
    if (!processedTable || (processedTable.subtables && processedTable.subtables.length === 0)) {
      return res.status(404).json({ 
        error: 'No valid table structure found.',
        tableInfo: {
          name: selectedTable.tablename || selectedTable.name || selectedTable.filename,
          type: selectedTable.type || 'Unknown',
          game: selectedTable.game || 'Unknown'
        }
      });
    }
    
    return res.json({ tableData: processedTable });
  } catch (error) {
    console.error('Error processing table contents:', error);
    res.status(500).json({ error: 'Failed to get table contents: ' + error.message });
  }
});

// Helper function to process a table for display
function processTableForDisplay(table) {
  const result = {
    name: table.tablename || table.name || 'Unnamed Table',
    filename: table.filename,
    type: table.type || 'Unknown',
    game: table.game || 'Unknown',
    setting: table.setting || 'Unknown',
    subtables: []
  };

  // Include table description if present
  if (table.description) {
    if (Array.isArray(table.description)) {
      result.description = table.description.join(' ');
    } else if (typeof table.description === 'string') {
      result.description = table.description;
    }
  }

  // Process direct results if they exist
  if (table.results && Array.isArray(table.results) && table.results.length > 0) {
    result.subtables.push({
      name: 'Main Results',
      results: processResultsForDisplay(table.results)
    });
  }

  // Process tables array
  if (table.tables && Array.isArray(table.tables)) {
    for (const subTable of table.tables) {
      const processedSubtable = {
        name: subTable.tablename || subTable.name || 'Unnamed Subtable', // For backward compatibility
        results: []
      };

      // Add subtable description if present
      if (subTable.description) {
        if (Array.isArray(subTable.description)) {
          processedSubtable.description = subTable.description.join(' ');
        } else if (typeof subTable.description === 'string') {
          processedSubtable.description = subTable.description;
        }
      }
      
      // Handle customDisplay tables
      if (subTable.customDisplay) {
        processedSubtable.customDisplay = subTable.customDisplay;
      }
      
      // Process results if they exist
      if (subTable.results && Array.isArray(subTable.results)) {
        processedSubtable.results = processResultsForDisplay(subTable.results);
      }
      
      // Process nested subtables
      if (subTable.subTables && Array.isArray(subTable.subTables)) {
        processedSubtable.nestedSubtables = subTable.subTables.map(nestedTable => {
          const nestedResult = {
            name: nestedTable.tablename || nestedTable.name || 'Unnamed Nested',
            results: nestedTable.results ? processResultsForDisplay(nestedTable.results) : []
          };
          
          // Add nested subtable description if present
          if (nestedTable.description) {
            if (Array.isArray(nestedTable.description)) {
              nestedResult.description = nestedTable.description.join(' ');
            } else if (typeof nestedTable.description === 'string') {
              nestedResult.description = nestedTable.description;
            }
          }
          return nestedResult;
        });
      }
      result.subtables.push(processedSubtable);
    }
  }

  // Process subTables array (in case table uses this format)
  if (table.subTables && Array.isArray(table.subTables)) {
    for (const subTable of table.subTables) {
      result.subtables.push({
        name: subTable.tablename || subTable.name || 'Unnamed Subtable', // For backward compatibility
        results: subTable.results ? processResultsForDisplay(subTable.results) : []
      });
    }
  }

  return result;
}

// Helper function to process results array for display
function processResultsForDisplay(results) {
  if (!results || !Array.isArray(results)) return [];

  return results.map(item => {
    // Handle weighted arrays like [value, weight]
    if (Array.isArray(item) && item.length >= 2) {
      const lastElement = item[item.length - 1];
      // Check if the last element is a number (weight)
      if (typeof lastElement === 'number' || 
          (typeof lastElement === 'string' && !isNaN(parseInt(lastElement)))) {
        const weight = typeof lastElement === 'number' ? lastElement : parseInt(lastElement);
        const value = item.length === 2 ? item[0] : item.slice(0, -1);
        return { value, weight, isWeighted: true };
      }
      // Handle career format [career, items]
      else if (item.length === 2 && 
               typeof item[0] === 'string' && 
               typeof item[1] === 'string') {
        return { career: item[0], items: item[1], isCareer: true };
      }
      // Regular array
      return { value: item };
    }
    // Handle objects
    else if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      return { ...item };
    }
    // Simple values
    return { value: item };
  });
}

// Helper function to find a specific table by its header/name
function findSpecificTable(rootTable, targetName) {
  if (!rootTable || !targetName) return null;
  
  // Check if the current table matches by name
  if (rootTable.tablename && rootTable.tablename.toLowerCase() === targetName.toLowerCase()) {
    return rootTable;
  }
  // Check in tables array
  if (rootTable.tables && Array.isArray(rootTable.tables)) {
    for (const subTable of rootTable.tables) {
      const found = findSpecificTable(subTable, targetName);
      if (found) return found;
    }
  }
  // Check in subTables array (some table formats use this property)
  if (rootTable.subTables && Array.isArray(rootTable.subTables)) {
    for (const subTable of rootTable.subTables) {
      const found = findSpecificTable(subTable, targetName);
      if (found) return found;
    }
  }
  return null;
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

// Updated getWeightedRandomResult function to handle arrays with up to 4 elements
function getWeightedRandomResult(table) {
  let weightedEntries = [];
  table.results.forEach(entry => {
    // Handle arrays (could be weighted entries or career-style entries)
    if (Array.isArray(entry)) {
      // Get the length of the array
      const arrayLength = entry.length;
      
      // If the array has at least 2 elements
      if (arrayLength >= 2) {
        // Check if the last element is numeric (a weight)
        const lastElement = entry[arrayLength - 1];
        const isLastElementNumeric = 
          typeof lastElement === 'number' || 
          (typeof lastElement === 'string' && !isNaN(parseFloat(lastElement)) && 
           lastElement.trim() !== '' && !isNaN(lastElement));
        
        if (isLastElementNumeric) {
          // Get the weight as a number
          const weight = typeof lastElement === 'number' ? 
                        lastElement : parseInt(lastElement, 10);
          
          // Create value array without the weight
          const value = entry.slice(0, arrayLength - 1);
          // If it's a single-value array, extract just the string
          const finalValue = value.length === 1 ? value[0] : value;
          
          // Add weighted entries to the list
          for (let i = 0; i < (weight || 1); i++) {
            weightedEntries.push(finalValue);
          }
          
          if (DEBUG) {
            console.log(`Detected weighted entry with weight ${weight}:`, finalValue);
          }
          return; // Skip the rest of this iteration
        }
        
        // Check for career-style entries (two strings - special case)
        if (arrayLength === 2 && 
            typeof entry[0] === 'string' && 
            typeof entry[1] === 'string') {
            
          // Check if the second string resembles items rather than a numeric string
          const secondElement = entry[1];
          const resemblesItems = secondElement.includes(',') || 
                                secondElement.includes(' ') || 
                                secondElement.length > 5;
          
          if (resemblesItems) {
            // For career-style entries with [career, items] format
            weightedEntries.push({ 
              career: entry[0],
              items: entry[1]
            });
            if (DEBUG) {
              console.log(`Detected career-style entry: ${entry[0]}, ${entry[1]}`);
            }
            return; // Skip the rest of this iteration
          }
        }
      }
      
      // If we got here, it's a regular array without special handling
      weightedEntries.push(entry);
    } else if (typeof entry === 'object' && entry !== null) {
      // Support for object entries (like {career: "X", items: "Y"})
      weightedEntries.push(entry);
    } else if (typeof entry === 'string' || typeof entry === 'number') {
      // Plain string/number entries
      weightedEntries.push(entry);
    }
  });
  if (weightedEntries.length === 0) {
    console.error('Error: No valid entries found for weighting in table:', table.name);
    return 'Error: No valid entries found';
  }
  let result = randomChoice(weightedEntries);
  // Process table references if the result is a string
  if (typeof result === 'string') {
    result = processTableReferences(result, tables);
  }
  return result;
}

// Process a customDisplay string.
function processCustomDisplay(table, allTables, context) {
  if (DEBUG) console.log('Processing customDisplay for table:', table);

  if (!table.customDisplay) {
    console.error('Error: customDisplay is missing in the table:', table);
    return 'Error: customDisplay is missing';
  }
  let deferredTokens = [];
  // Remove outer brackets.
  let displayStr = table.customDisplay.replace(/^\[|\]$/g, '');

  // Prepare variables:
  let normalResult = "";
  let lastIndex = 0;
  let match;
  const tokenRegex = /\{([^}]+)\}/g;

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
        // Look first in the tables array
        let subTable = null;
        if (table.tables && Array.isArray(table.tables)) {
          subTable = table.tables.find(
            t => t.tablename && t.tablename.toLowerCase() === subTableName.toLowerCase()
          );
        }
        // If not found, look for tables with name property for backward compatibility
        if (!subTable && table.tables && Array.isArray(table.tables)) {
          subTable = table.tables.find(
            t => t.name && t.name.toLowerCase() === subTableName.toLowerCase()
          );
        }
        // If still not found, look in subTables for backward compatibility
        if (!subTable && table.subTables && Array.isArray(table.subTables)) {
          subTable = table.subTables.find(
            t => t.tablename && t.tablename.toLowerCase() === subTableName.toLowerCase()
          );
          if (!subTable) {
            subTable = table.subTables.find(
              t => t.name && t.name.toLowerCase() === subTableName.toLowerCase()
            );
          }
        }
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
          const tableName = t.tablename;
          if (tableName && tableName.toLowerCase() === tableToLookup.toLowerCase()) {
            refTable = t;
            break;
          }
        }
        if (DEBUG && !refTable) {
          console.log(`Deferred token: Could not find a table named "${tableToLookup}" anywhere.`);
          console.log(`Available top-level table names:`, allTables.map(t => t.tablename));
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
    let subTable = null;
    // First check in tables array
    if (table.tables && Array.isArray(table.tables)) {
      for (let i = 0; i < table.tables.length; i++) {
        const st = table.tables[i];
        if ((st.tablename && st.tablename.toLowerCase() === pickedResult.toLowerCase()) ||
            (st.name && st.name.toLowerCase() === pickedResult.toLowerCase())) {
          subTable = st;
          break;
        }
      }
    }
    // If not found, check in subTables for backward compatibility
    if (!subTable && table.subTables && Array.isArray(table.subTables)) {
      for (let i = 0; i < table.subTables.length; i++) {
        const st = table.subTables[i];
        if ((st.tablename && st.tablename.toLowerCase() === pickedResult.toLowerCase()) ||
            (st.name && st.name.toLowerCase() === pickedResult.toLowerCase())) {
          subTable = st;
          break;
        }
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
          console.log(`Available subtable names:`, table.subTables.map(st => t.tablename || t.name));
        }
      }
    }
  });

  // Process the final result for table references before returning
  if (typeof finalResult === 'string') {
    finalResult = processTableReferences(finalResult, allTables, context);
  }

  if (DEBUG) {
    console.log(`Final customDisplay result after processing references: "${finalResult}"`);
  }
  return finalResult;
}

// Find a table by name in the hierarchy of a given table
function findTableInHierarchy(rootTable, tableName) {
  if (!rootTable) return null;
  
  // Check if the current table matches
  if ((rootTable.tablename && rootTable.tablename.toLowerCase() === tableName.toLowerCase()) ||
      (rootTable.name && rootTable.name.toLowerCase() === tableName.toLowerCase())) { // For backward compatibility
    return rootTable;
  }
  // Check in tables array
  if (rootTable.tables && Array.isArray(rootTable.tables)) {
    for (const subTable of rootTable.tables) {
      const found = findTableInHierarchy(subTable, tableName);
      if (found) return found;
    }
  }
  // Check in subTables array (for backward compatibility)
  if (rootTable.subTables && Array.isArray(rootTable.subTables)) {
    for (const subTable of rootTable.subTables) {
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
  const header = table.tablename || parentHeader;
  // Store the source table name for reference (will be hidden in UI)
  const sourceInfo = {
    _tableName: table.tablename,
    _fileName: table.filename,
    _originalSource: table._originalSource || table.tablename // Track original source
  };

  // Add description if present - handle both string and array formats
  if (table.description) {
    if (Array.isArray(table.description)) {
      sourceInfo._description = table.description.join(' ');
    } else if (typeof table.description === 'string') {
      sourceInfo._description = table.description;
    }
    
    if (DEBUG) console.log(`Found description for table ${header}:`, sourceInfo._description);
  }
  
  // Check for table structure patterns rather than specific names
  
  // Pattern 1: Table with simple string results
  if (table.results && Array.isArray(table.results) && 
      table.results.length > 0 && 
      table.results.every(item => typeof item === 'string' || typeof item === 'number')) {
    console.log(`Processing simple string results table: ${header}`);
    const result = randomChoice(table.results);
    console.log(`Selected result: ${result}`);
    
    // Process table references in the result
    const processedResult = typeof result === 'string' ? 
                           processTableReferences(result, allTables, context) : 
                           result;
    // Store processed result in context
    if (context && header) {
      context[header] = processedResult;
    }
    
    // Enhanced handling for arrays parsed from string notation
    if (Array.isArray(processedResult)) {
      console.log(`Array result detected for ${header}:`, processedResult);
      // Store the special array format flag
      return {
        header,
        result: processedResult,
        _isMultiElementArray: true, // This flag ensures proper array display in UI
        ...sourceInfo
      };
    }
    
    return { header, result: processedResult, ...sourceInfo };
  }
  
  // Pattern 2: Career-style tables (array of two-element arrays)
  if (table.results && Array.isArray(table.results) && 
      table.results.length > 0 && 
      table.results.every(item => Array.isArray(item) && item.length === 2 && 
                         typeof item[0] === 'string' && typeof item[1] === 'string')) {
    console.log(`Processing career-style table: ${header}`);
    const career = randomChoice(table.results);
    
    // Process table references in career strings
    let processedCareer = [...career];
    if (typeof processedCareer[0] === 'string') {
      processedCareer[0] = processTableReferences(processedCareer[0], allTables, context);
    }
    if (typeof processedCareer[1] === 'string') {
      processedCareer[1] = processTableReferences(processedCareer[1], allTables, context);
    }
    // Store processed result in context
    if (context && header) {
      context[header] = processedCareer;
    }
    
    // Include the _isCareer flag
    return {
      header, 
      result: processedCareer,
      _isCareer: true,
      ...sourceInfo 
    };
  }

  // Original processTable logic for other tables
  // 1) If the table has customDisplay => parse it
  if (table.customDisplay) {
    const result = processCustomDisplay(table, allTables, context);
    return { 
      header, 
      result, 
      _hasCustomDisplay: true,
      _originalSource: sourceInfo._originalSource, // Track origin
      ...sourceInfo 
    };
  }
  // 2) If the table has results => do a weighted pick
  else if (table.results && Array.isArray(table.results) && table.results.length > 0) {
    const result = getWeightedRandomResult(table);
    
    // Process the result further for any string values that might contain references
    let processedResult = result;
    // Process string values in arrays
    if (Array.isArray(result)) {
      processedResult = result.map(item => 
        typeof item === 'string' ? processTableReferences(item, allTables, context) : item
      );
    }
    
    // Store processed result in context
    if (context && header) {
      context[header] = processedResult;
      if (DEBUG) console.log(`Stored result "${processedResult}" for table "${header}" in context`);
    }
    
    // The rest of the logic for handling special cases remains the same 
    // Special detection for Knave Careers format - preserve the original array structure
    if (Array.isArray(result) && result.length === 2 && 
        typeof result[0] === 'string' && typeof result[1] === 'string') {
      // Mark this as a Knave careers result with a special type marker
      return {
        header,
        result,
        _isCareer: true,  // Add this marker to identify it as a career format
        _originalSource: sourceInfo._originalSource, // Track origin
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
          _originalSource: sourceInfo._originalSource, // Track origin
          ...sourceInfo 
        };
      }
    }
    
    // Additional handling for results with potential multi-element arrays
    if (Array.isArray(result)) {
      // Mark multi-element arrays (3+ elements) with a special flag
      if (result.length >= 3) {
        return {
          header,
          result,
          _isMultiElementArray: true,  // Add flag for multi-element arrays
          _originalSource: sourceInfo._originalSource, // Track origin 
          ...sourceInfo 
        };
      } 
      // Handle career-style entries (2 elements)
      else if (result.length === 2 && 
               typeof result[0] === 'string' && 
               typeof result[1] === 'string') {
        return {
          header,
          result,
          _isCareer: true,  // Add career marker
          _originalSource: sourceInfo._originalSource, // Track origin 
          ...sourceInfo 
        };
      }
    }
    
    return { header, result: processedResult, ...sourceInfo };
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
    let context = { 
      thisResult: null // Initialize thisResult to null
    };
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
  console.log(`Table debug for: ${table.tablename || 'unnamed table'}`);
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

// New helper function to find a table with array results
function findTableWithArrayResults(rootTable) {
  if (rootTable.results && Array.isArray(rootTable.results) && 
      rootTable.results.length > 0 && Array.isArray(rootTable.results[0])) {
    return rootTable;
  }
  if (rootTable.tables && Array.isArray(rootTable.tables)) {
    for (const subTable of rootTable.tables) {
      if (subTable.results && Array.isArray(subTable.results) && 
          subTable.results.length > 0 && Array.isArray(subTable.results[0])) {
        return subTable;
      }
      const result = findTableWithArrayResults(subTable);
      if (result) return result;
    }
  }
  return null;
}

// New helper function to find a table with simple string results
function findTableWithSimpleResults(rootTable) {
  if (rootTable.results && Array.isArray(rootTable.results) && 
      rootTable.results.length > 0 && typeof rootTable.results[0] === 'string') {
    return rootTable;
  }
  if (rootTable.tables && Array.isArray(rootTable.tables)) {
    for (const subTable of rootTable.tables) {
      if (subTable.results && Array.isArray(subTable.results) && 
          subTable.results.length > 0 && typeof subTable.results[0] === 'string') {
        return subTable;
      }
      const result = findTableWithSimpleResults(subTable);
      if (result) return result;
    }
  }
  return null;
}

// Function to load all tables from the tables directory
function loadAllTables() {
  console.log(`Loading tables from ${TABLES_DIR}`);
  tables = [];

  try {
    const files = fs.readdirSync(TABLES_DIR);
    files.forEach(file => {
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        try {
          const filePath = path.join(TABLES_DIR, file);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const tableData = yaml.load(fileContent);
          
          // Add the filename to the table data for reference
          tableData.filename = file;
          
          tables.push(tableData);
          if (DEBUG) {
            console.log(`Loaded table: ${tableData.tablename || file}`);
          }
        } catch (err) {
          console.error(`Error loading table ${file}:`, err);
        }
      }
    });
    if (DEBUG) {
      console.log(`Successfully loaded ${tables.length} tables.`);
    }
  } catch (err) {
    console.error('Error reading tables directory:', err);
  }
}

// New function to process references to other tables in result strings
function processTableReferences(input, allTables, context = {}) {
  // Handle string inputs
  if (typeof input === 'string') {
    // Special handling for array-like syntax: "[{...},{...}]"
    if (input.trim().startsWith('[') && input.trim().endsWith(']')) {
      // Extract content between brackets
      const innerContent = input.trim().substring(1, input.trim().length - 1);
      
      // Split by commas, handling nested braces correctly
      const elements = splitBalanced(innerContent, ',');
      if (DEBUG) console.log(`Detected array syntax with ${elements.length} elements:`, elements);
      
      // Process each element separately
      const processedElements = elements.map(element => {
        const processed = processTableReferences(element.trim(), allTables, context);
        return processed;
      });
      // For ability scores, format special arrays nicely
      if (processedElements.length === 2 && 
          typeof processedElements[0] === 'number' && 
          typeof processedElements[1] === 'string' && 
          (processedElements[1].startsWith('+') || processedElements[1].startsWith('-'))) {
        console.log(`Detected ability score format: ${processedElements[0]} (${processedElements[1]})`);
        // Format as readable ability score: "15 (+2)"
        return `${processedElements[0]} (${processedElements[1]})`;
      }
      
      // Return as array for other cases
      return processedElements;
    }
    
    // First, process any dice notation to populate context
    let processedInput = input;
    const diceRegex = /\{(\d+d\d+(?:[+-]\d+)?)\}/g;
    processedInput = input.replace(diceRegex, (match, diceNotation) => {
      const diceResult = parseDiceNotation(diceNotation);
      if (diceResult !== null) {
        if (DEBUG) console.log(`Dice notation found: ${match} evaluated to ${diceResult}`);
        // Store the result in context for reference table lookups
        if (context) context.thisResult = diceResult;
        return diceResult;
      }
      return match; // Return unchanged if not valid dice notation
    });

    // Second, process useReferenceTable calls now that dice results are in context
    const useRefRegex = /\{useReferenceTable\{([^}]+)\}\{([^}]+)\}\}/g;
    processedInput = processedInput.replace(useRefRegex, (match, tableName, lookupValue) => {
      if (DEBUG) console.log(`Detected useReferenceTable function call: Table=${tableName}, Value=${lookupValue}`);
      return lookupInReferenceTable(tableName, lookupValue, allTables, context);
    });

    // Finally, handle standard table references
    const tableRefRegex = /\{([^}\[\]|]+)(?:\[(\d+)\])?(?:\|([^}]+))?\}/g;
    
    return processedInput.replace(tableRefRegex, (match, content, arrayIndex, subtableName) => {
      // Skip dice notation as we've already processed it
      if (parseDiceNotation(content) !== null) {
        return content; // Just return the result which should already be in processedInput
      }
      
      // Special case for thisResult[index]
      if (content === "thisResult" && arrayIndex !== undefined && context && 'thisResult' in context) {
        if (DEBUG) console.log(`Direct access to thisResult[${arrayIndex}] from context:`, context.thisResult);
        
        if (Array.isArray(context.thisResult) && context.thisResult.length > arrayIndex) {
          return context.thisResult[arrayIndex];
        } else if (!Array.isArray(context.thisResult) && arrayIndex == 0) {
          // Allow thisResult[0] to work on non-array values
          return context.thisResult;
        } else {
          console.error(`Invalid thisResult index: ${arrayIndex} for context:`, context.thisResult);
          return `[Invalid thisResult index]`;
        }
      }
      
      // Process as a table reference
      if (DEBUG) console.log(`Processing table reference: ${match} (Table: ${content}, Index: ${arrayIndex || 'none'}, Subtable: ${subtableName || 'none'})`);
      // Find the referenced table
      const referencedTable = findReferencedTable(content, allTables);
      
      if (!referencedTable) {
        console.error(`Referenced table not found: ${content}`);
        return `[${content} not found]`;
      }
      
      // Make a copy of the referenced table to avoid modifying the original
      const workingTable = Object.assign({}, referencedTable);
      
      // IMPORTANT: Add original source tracking - first reference is preserved
      if (!workingTable._originalSource) {
        workingTable._originalSource = content;
        if (DEBUG) console.log(`Setting original source for referenced table to: ${content}`);
      }
      
      try {
        let result;
        
        // If a specific subtable is requested through pipe syntax
        if (subtableName) {
          // Find the specified subtable within the referenced table
          const subtable = findSubtableByName(referencedTable, subtableName);
          
          if (!subtable) {
            console.error(`Subtable "${subtableName}" not found in table "${content}"`);
            return `[${subtableName} not found in ${content}]`;
          }
          
          if (DEBUG) {
            console.log(`Found subtable "${subtableName}" in "${content}"`);
            // Print the structure of the found subtable
            console.log('Subtable structure:', JSON.stringify(subtable, null, 2).substring(0, 200) + '...');
          }
          
          // Generate from the subtable
          if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
            result = getWeightedRandomResult({ results: subtable.results });
          } else {
            console.error(`Subtable "${subtableName}" has no valid results array or is empty`);
            return `[No results in ${content}|${subtableName}]`;
          }
        }
        // Check if the referenced table has customDisplay
        else if (referencedTable.customDisplay) {
          if (DEBUG) console.log(`Table "${content}" uses customDisplay, processing...`);
          let mainTable = referencedTable;
          if (referencedTable.tables && Array.isArray(referencedTable.tables)) {
            const customDisplayTable = referencedTable.tables.find(t => t.customDisplay);
            if (customDisplayTable) {
              mainTable = customDisplayTable;
              if (DEBUG) console.log(`Found customDisplay in subtable: ${mainTable.tablename}`);
            }
          }
          result = processCustomDisplay(mainTable, allTables, context);
        }
        // For whole-table references (no subtable specified)
        else if (referencedTable.results && Array.isArray(referencedTable.results)) {
          result = getWeightedRandomResult({ results: referencedTable.results });
        } else if (referencedTable.tables && Array.isArray(referencedTable.tables) && referencedTable.tables.length > 0) {
          // Look for a table with customDisplay first
          const customDisplayTable = referencedTable.tables.find(t => t.customDisplay);
          if (customDisplayTable) {
            if (DEBUG) console.log(`Found table with customDisplay: ${customDisplayTable.tablename}`);
            result = processCustomDisplay(customDisplayTable, allTables, context);
          } else {
            // Otherwise use the first subtable with results
            const subtable = referencedTable.tables[0];
            if (subtable.results && Array.isArray(subtable.results)) {
              result = getWeightedRandomResult(subtable);
            } else {
              console.error(`No valid results found in first subtable of ${content}`);
              return `[No valid results in ${content}]`;
            }
          }
        } else {
          console.error(`No valid results found in referenced table: ${content}`);
          return `[No results in ${content}]`;
        }
        
        // Now handle array indexing if specified
        if (arrayIndex !== undefined && Array.isArray(result)) {
          const index = parseInt(arrayIndex, 10);
          if (index >= 0 && index < result.length) {
            if (DEBUG) console.log(`Extracting index [${index}] from array result: ${JSON.stringify(result)}`);
            return result[index];
          } else {
            console.error(`Array index ${index} out of bounds for result: ${JSON.stringify(result)}`);
            return `[Index ${index} out of bounds]`;
          }
        }
        
        // NEW: Check for object with career/items format first (common for spells)
        if (result && typeof result === 'object' && !Array.isArray(result) && result.career) {
          if (DEBUG) console.log(`Found object with career property: ${result.career}`);
          return result.career; // Return just the career (spell name)
        }
        
        // Also handle automatic extraction of first element for arrays in string contexts
        if (Array.isArray(result)) {
          if (DEBUG) console.log(`Using first element of array result: ${result[0]} (from ${JSON.stringify(result)})`);
          return result[0]; // Return just the first element
        }
        
        // Handle other object results by converting to string
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          try {
            // Try to extract a meaningful string property if one exists
            if (result.name) return result.name;
            if (result.title) return result.title;
            if (result.value) return String(result.value);
            // Convert to JSON string as last resort
            return JSON.stringify(result);
          } catch (e) {
            console.error(`Error converting object result to string: ${e.message}`);
            return "[Object]";
          }
        }
        return result ? String(result) : '';
      } catch (error) {
        console.error(`Error processing table reference ${match}:`, error);
        return `[Error: ${error.message}]`;
      }
    });
  }
  // Handle arrays by processing each string element
  else if (Array.isArray(input)) {
    return input.map(item => 
      typeof item === 'string' ? processTableReferences(item, allTables, context) : item
    );
  }
  // Return non-string inputs unchanged
  return input;
}

// Function to look up a value in a reference table - improved implementation
function lookupInReferenceTable(tableName, lookupValue, allTables, context) {
  if (DEBUG) console.log(`Looking up value ${lookupValue} in reference table ${tableName}`);
  
  // Process the lookup value if it contains special variables
  let processedLookupValue = lookupValue;
  
  // Direct handling for thisResult
  if (lookupValue === "thisResult" && context && 'thisResult' in context) {
    processedLookupValue = context.thisResult;
    if (DEBUG) console.log(`Using thisResult from context: ${processedLookupValue}`);
  }
  // Handle array indexing with thisResult (e.g., thisResult[0])
  else if (/^thisResult\[\d+\]$/.test(lookupValue) && context && 'thisResult' in context) {
    const match = lookupValue.match(/^thisResult\[(\d+)\]$/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (Array.isArray(context.thisResult) && index < context.thisResult.length) {
        processedLookupValue = context.thisResult[index];
        if (DEBUG) console.log(`Using thisResult[${index}] from context: ${processedLookupValue}`);
      } else if (index === 0 && !Array.isArray(context.thisResult)) {
        processedLookupValue = context.thisResult;
        if (DEBUG) console.log(`Using thisResult as scalar value: ${processedLookupValue}`);
      } else {
        console.error(`Invalid thisResult index: ${index} (thisResult=${JSON.stringify(context.thisResult)})`);
        return `[Invalid thisResult index]`;
      }
    }
  }
  // Convert to a number if it looks like one
  if (!isNaN(processedLookupValue)) {
    processedLookupValue = Number(processedLookupValue);
  }
  
  // Find the reference table - first look in ShadowDark_CharacterGenerator.yaml
  let refTable = null;
  // Look for the table in ShadowDark_CharacterGenerator.yaml first
  const charGenTable = allTables.find(t => t.filename === 'ShadowDark_CharacterGenerator.yaml');
  if (charGenTable && charGenTable.referenceTables) {
    refTable = charGenTable.referenceTables.find(rt => rt.tablename === tableName);
    if (refTable && DEBUG) console.log(`Found reference table "${tableName}" in CharacterGenerator`);
  }
  
  // If not found, search all tables for a matching reference table
  if (!refTable) {
    for (const table of allTables) {
      if (table.referenceTables && Array.isArray(table.referenceTables)) {
        refTable = table.referenceTables.find(rt => rt.tablename === tableName);
        if (refTable) {
          if (DEBUG) console.log(`Found reference table "${tableName}" in ${table.filename}`);
          break;
        }
      }
    }
  }
  
  if (!refTable) {
    console.error(`Reference table "${tableName}" not found`);
    return `[${tableName} not found]`;
  }
  if (DEBUG) console.log(`Found reference table "${tableName}" with ${refTable.entries.length} entries, looking up value: ${processedLookupValue}`);
  if (!refTable.entries || !Array.isArray(refTable.entries)) {
    console.error(`Reference table "${tableName}" has no entries`);
    return `[No entries in ${tableName}]`;
  }
  
  // Look for a matching entry
  for (const entry of refTable.entries) {
    if (!entry.key) continue;
    
    // Check for exact match
    if (entry.key == processedLookupValue) {
      if (DEBUG) console.log(`Found exact match: key=${entry.key}, value=${entry.value}`);
      return entry.value;
    }
    
    // Check for range match (format: "3-5" or "10-11")
    if (typeof entry.key === 'string' && entry.key.includes('-')) {
      const [min, max] = entry.key.split('-').map(Number);
      if (!isNaN(min) && !isNaN(max) && 
          processedLookupValue >= min && processedLookupValue <= max) {
        if (DEBUG) console.log(`Found range match: ${min}-${max}, value=${entry.value}`);
        return entry.value;
      }
    }
  }
  if (DEBUG) console.log(`No matching entry found for lookup value ${processedLookupValue}`);
  return `[No match for ${processedLookupValue}]`;
}

// Add the missing function to find referenced tables by name or filename
function findReferencedTable(tableRef, allTables) {
  // Remove file extension if present
  const normalizedRef = tableRef.replace(/\.ya?ml$/i, '');
  // First try by exact filename match
  let table = allTables.find(t => 
    t.filename === `${normalizedRef}.yaml` || 
    t.filename === `${normalizedRef}.yml`);
  // If not found, try by table name
  if (!table) {
    table = allTables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === normalizedRef.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === normalizedRef.toLowerCase()));
  }
  if (DEBUG && table) {
    console.log(`Found referenced table: ${table.filename} (${table.tablename})`);
  } else if (DEBUG && !table) {
    console.log(`Could not find referenced table: ${normalizedRef}`);
    console.log(`Available tables:`, allTables.map(t => t.filename).join(', '));
  }
  return table;
}

// Function to parse and evaluate dice notation (e.g. "3d6", "2d10+5")
function parseDiceNotation(notation) {
  if (typeof notation !== 'string') {
    return null;
  }
  // Trim notation and check if it matches the dice pattern
  notation = notation.trim();
  
  // Common dice notation pattern: NdM+X or NdM-X (N = number of dice, M = sides, X = modifier)
  const diceRegex = /^(\d+)d(\d+)([+-]\d+)?$/i;
  const match = notation.match(diceRegex);
  
  if (!match) {
    return null; // Not a dice notation
  }
  
  const numDice = parseInt(match[1], 10);
  const numSides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  
  // Roll the dice
  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * numSides) + 1;
  }
  total += modifier;
  if (DEBUG) console.log(`Parsed dice notation: ${notation} => ${total}`);
  return total;
}

// Add this function to find subtables by name - add it near processTableReferences
function findSubtableByName(table, subtableName) {
  if (!table) return null;
  
  // Special case for NameBySyllable in ShadowDark_NPC.yaml
  if (subtableName === "NameBySyllable" && table.filename === "ShadowDark_NPC.yaml") {
    if (DEBUG) {
      console.log("Searching for NameBySyllable in ShadowDark_NPC.yaml");
      console.log("Table structure:", JSON.stringify(table, null, 2).substring(0, 500) + '...');
    }
    
    // If table has a specified NameBySyllable structure, prioritize that
    if (table.tables && Array.isArray(table.tables)) {
      // Look through top-level tables
      for (const subTable of table.tables) {
        if ((subTable.tablename && subTable.tablename === subtableName) || 
            (subTable.name && subTable.name === subtableName)) {
          if (subTable.results && Array.isArray(subTable.results)) {
            if (DEBUG) console.log(`Found NameBySyllable as direct subtable with ${subTable.results.length} results`);
            return subTable;
          }
        }
      }
      
      // If not found as direct subtable, look more carefully through the structure
      for (const subTable of table.tables) {
        if (subTable.subtables || subTable.subTables) {
          const subTableList = subTable.subtables || subTable.subTables;
          if (Array.isArray(subTableList)) {
            for (const nestedTable of subTableList) {
              if ((nestedTable.tablename && nestedTable.tablename === subtableName) || 
                  (nestedTable.name && nestedTable.name === subtableName)) {
                if (nestedTable.results && Array.isArray(nestedTable.results)) {
                  if (DEBUG) console.log(`Found NameBySyllable in nested subtable with ${nestedTable.results.length} results`);
                  return nestedTable;
                }
              }
            }
          }
        }
      }
      
      // As a fallback for NameBySyllable, create a synthetic table with default names
      if (DEBUG) console.log("Creating fallback NameBySyllable table");
      return {
        tablename: "NameBySyllable",
        results: [
          "Ardan", "Baern", "Corrin", "Davin", "Elric", "Faelen", 
          "Gareth", "Harkin", "Irwin", "Jorvik", "Kylar", "Lucan",
          "Maren", "Nadia", "Orrin", "Piper", "Quinn", "Rylan",
          "Soren", "Thalia", "Ulric", "Varis", "Willow", "Xander"
        ]
      };
    }
  }
  
  // Check if the table has a tables array
  if (table.tables && Array.isArray(table.tables)) {
    // Search in the tables array first
    const subtable = table.tables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
    );
    if (subtable) return subtable;
  }
  
  // Also check in subTables array (for backward compatibility)
  if (table.subTables && Array.isArray(table.subTables)) {
    const subtable = table.subTables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
    );
    if (subtable) return subtable;
  }
  
  // If not found in direct children, try searching deeper in the hierarchy
  if (table.tables && Array.isArray(table.tables)) {
    for (const subTable of table.tables) {
      const found = findSubtableByName(subTable, subtableName);
      if (found) return found;
    }
  }
  if (table.subTables && Array.isArray(table.subTables)) {
    for (const subTable of table.subTables) {
      const found = findSubtableByName(subTable, subtableName);
      if (found) return found;
    }
  }
  return null;
}

// Helper function to split a string by a delimiter while respecting nested braces
function splitBalanced(str, delimiter) {
  const results = [];
  let bracketCount = 0;
  let currentChunk = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '{') bracketCount++;
    if (char === '}') bracketCount--;
    
    if (char === delimiter && bracketCount === 0) {
      results.push(currentChunk);
      currentChunk = '';
    } else {
      currentChunk += char;
    }
  }
  if (currentChunk) {
    results.push(currentChunk);
  }
  return results;
}