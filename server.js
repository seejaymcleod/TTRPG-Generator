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
    const context = clientContext || {};
    
    // Find the specific subtable for this header
    let targetSubTable = null;
    
    // Search through the tables array for the matching header
    if (selectedTable.tables && Array.isArray(selectedTable.tables)) {
      for (const subTable of selectedTable.tables) {
        if (subTable.name === header) {
          targetSubTable = subTable;
          break;
        }
      }
    }
    
    if (!targetSubTable) {
      console.error(`Could not find subtable for header: ${header}`);
      return res.status(404).json({ error: `Could not find subtable for: ${header}` });
    }
    
    // Process the subtable based on its structure
    let result;
    
    // Case 1: Table uses customDisplay
    if (targetSubTable.customDisplay) {
      console.log(`Processing table with customDisplay: ${targetSubTable.name}`);
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
    
    // Return the result with metadata to help client
    return res.json({
      result: {
        header: header,
        result: result,
        _tableName: targetSubTable.name
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
        name: subTable.name || 'Unnamed Subtable',
        results: []
      };
      
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
          return {
            name: nestedTable.name || 'Unnamed Nested',
            results: nestedTable.results ? processResultsForDisplay(nestedTable.results) : []
          };
        });
      }
      
      result.subtables.push(processedSubtable);
    }
  }

  // Process subTables array (in case table uses this format)
  if (table.subTables && Array.isArray(table.subTables)) {
    for (const subTable of table.subTables) {
      result.subtables.push({
        name: subTable.name || 'Unnamed Subtable',
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
  if ((rootTable.name || rootTable.tablename) && 
      (rootTable.name || rootTable.tablename).toLowerCase() === targetName.toLowerCase()) {
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
    
    // Additional handling for results with potential multi-element arrays
    if (Array.isArray(result)) {
      // Mark multi-element arrays (3+ elements) with a special flag
      if (result.length >= 3) {
        return { 
          header,
          result,
          _isMultiElementArray: true,  // Add flag for multi-element arrays
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
  
  // Check for Knave career format specifically
  if (rootTable.tables) {
    for (const subTable of rootTable.tables) {
      if (subTable.name === 'Careers' && subTable.results && 
          Array.isArray(subTable.results) && subTable.results.length > 0 && 
          Array.isArray(subTable.results[0])) {
        return subTable;
      }
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
    // Use existing string replacement logic
    const tableRefRegex = /\{([^}]+)\}/g;
    
    return input.replace(tableRefRegex, (match, tableName) => {
      if (DEBUG) console.log(`Processing table reference: ${tableName}`);
      
      const referencedTable = findReferencedTable(tableName, allTables);
      
      if (!referencedTable) {
        console.error(`Referenced table not found: ${tableName}`);
        return `[${tableName} not found]`;
      }
      
      try {
        if (referencedTable.results && Array.isArray(referencedTable.results)) {
          return getWeightedRandomResult({ results: referencedTable.results });
        }
        else if (referencedTable.tables && Array.isArray(referencedTable.tables) && referencedTable.tables.length > 0) {
          const subtable = referencedTable.tables[0];
          if (subtable.results && Array.isArray(subtable.results)) {
            return getWeightedRandomResult(subtable);
          }
        }
        
        console.error(`No valid results found in referenced table: ${tableName}`);
        return `[No results in ${tableName}]`;
      } catch (error) {
        console.error(`Error processing table reference ${tableName}:`, error);
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

// Helper function to find a referenced table by name or filename
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
    console.log(`Found referenced table: ${table.filename} (${table.tablename || table.name})`);
  }
  
  return table;
}
