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

// Add a route to serve the extractContext function directly
app.get('/js/extractContext.js', (req, res) => {
  if (DEBUG) console.log('Serving extractContext.js');
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

// Add these functions before the API endpoints
// Process a table and generate results
function processTable(table, parentHeader, allTables, context) {
  const header = table.tablename || parentHeader;
  // Store the source table name for reference (will be hidden in UI)
  const sourceInfo = {
    _tableName: table.tablename,
    _fileName: table.filename,
    _originalSource: table._originalSource || table.tablename, // Track original source
    _titleDescription: table.titleDescription || null // Include the title description if present
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
    
    // Handle special cases
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
    
    // Additional handling for multi-element arrays
    if (Array.isArray(result)) {
      if (result.length >= 3) {
        return {
          header,
          result,
          _isMultiElementArray: true,  // Add flag for multi-element arrays
          _originalSource: sourceInfo._originalSource, // Track origin 
          ...sourceInfo 
        };
      } 
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
            console.log(`Found subtable "${subTableName}" with case-insensitive match`);
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

  // Special handling for pickOneFromArrays display mode
  if (table.customDisplay === "{pickOneFromArrays}") {
    if (DEBUG) console.log(`Processing pickOneFromArrays for table ${table.tablename || 'unnamed'}`);
    
    if (!table.results || !Array.isArray(table.results) || table.results.length === 0) {
      console.error('Error: table has no results array for pickOneFromArrays', table);
      return 'Error: No results to pick from';
    }
    
    // Pick a random entry from the results array
    const resultEntry = randomChoice(table.results);
    if (DEBUG) console.log(`Selected base entry: ${resultEntry}`);
    
    // Process the entry to pick items from any arrays it contains
    let processedResult = resultEntry;
    
    // If the entry is a string with array notation [item1, item2, ...]
    if (typeof resultEntry === 'string' && resultEntry.includes('[') && resultEntry.includes(']')) {
      processedResult = processArraysInString(resultEntry);
    }
    
    if (DEBUG) console.log(`Final pickOneFromArrays result: ${processedResult}`);
    return processedResult;
  }

  // Remove surrounding square brackets if present
  let displayTemplate = table.customDisplay;
  const hasBrackets = displayTemplate.startsWith('[') && displayTemplate.endsWith(']');
  if (hasBrackets) {
    displayTemplate = displayTemplate.substring(1, displayTemplate.length - 1);
  }

  if (DEBUG) console.log(`Processing display template: "${displayTemplate}"`);

  // Parse all tokens and text segments from the template
  const segments = [];
  let currentPosition = 0;
  let inToken = false;
  let currentToken = "";
  let currentText = "";
  let bracketDepth = 0;

  for (let i = 0; i < displayTemplate.length; i++) {
    const char = displayTemplate[i];
    
    // Track nested brackets
    if (char === '{') {
      bracketDepth++;
      if (bracketDepth === 1) {
        // Start of a new token
        if (currentText) {
          segments.push({ type: 'text', value: currentText });
          currentText = "";
        }
        inToken = true;
        currentToken = "";
        continue;
      }
    } else if (char === '}') {
      bracketDepth--;
      if (bracketDepth === 0 && inToken) {
        // End of token
        segments.push({ type: 'token', value: currentToken.trim() });
        inToken = false;
        continue;
      }
    }

    // Add characters to the current segment
    if (inToken) {
      currentToken += char;
    } else {
      currentText += char;
    }
  }

  // Add the final text segment if any
  if (currentText) {
    segments.push({ type: 'text', value: currentText });
  }

  if (DEBUG) console.log(`Parsed ${segments.length} segments:`, segments);

  // Process each segment
  let finalResult = "";
  const deferredTokens = [];

  for (const segment of segments) {
    if (segment.type === 'text') {
      // Add text segments directly
      finalResult += segment.value;
    } else if (segment.type === 'token') {
      // Process token
      const tokenContent = segment.value;
      
      // Check if it's a deferred token
      if (tokenContent.startsWith('selectedResult')) {
        deferredTokens.push(tokenContent);
        continue;
      }
      
      // Regular token - parse parts
      const parts = tokenContent.split(',');
      const subTableName = parts[0].trim();
      
      // Calculate probability
      let probability = 1.0;
      if (parts.length > 1) {
        const weightStr = parts[1].trim();
        const parsedWeight = parseFloat(weightStr);
        if (!isNaN(parsedWeight)) {
          probability = parsedWeight;
        }
      }
      
      // Check if we should include this token based on probability
      if (Math.random() > probability) {
        if (DEBUG) console.log(`Skipping token "${tokenContent}" due to probability (${probability})`);
        continue;
      }
      
      // Find the referenced subtable
      let subTable = null;
      
      // First check direct subtables
      if (table.subTables && Array.isArray(table.subTables)) {
        subTable = table.subTables.find(t => 
          t.tablename === subTableName || t.name === subTableName
        );
      }
      
      // Then check tables array
      if (!subTable && table.tables && Array.isArray(table.tables)) {
        subTable = table.tables.find(t => 
          t.tablename === subTableName || t.name === subTableName
        );
      }
      
      // Last resort - search in hierarchy and external tables
      if (!subTable) {
        subTable = findTableInHierarchy(table, subTableName);
      }
      
      if (!subTable && allTables) {
        subTable = findReferencedTable(subTableName, allTables);
      }
      
      if (!subTable) {
        if (DEBUG) console.log(`Token "${tokenContent}": No subtable named "${subTableName}" found`);
        finalResult += `[${subTableName} not found]`;
        continue;
      }
      
      // Process the subtable
      let tokenResult;
      
      if (subTable.customDisplay) {
        // Recursively process subtable with custom display
        if (DEBUG) console.log(`Processing nested customDisplay for subtable "${subTableName}"`);
        tokenResult = processCustomDisplay(subTable, allTables, context);
      } else if (subTable.results && Array.isArray(subTable.results)) {
        // Pick a random result
        tokenResult = randomChoice(subTable.results);
        if (DEBUG) console.log(`Selected "${tokenResult}" from subtable "${subTableName}"`);
      } else {
        if (DEBUG) console.log(`Subtable "${subTableName}" has no valid results or customDisplay`);
        tokenResult = `[No results in ${subTableName}]`;
      }
      
      // Add the result to our output
      if (tokenResult !== null && tokenResult !== undefined) {
        finalResult += tokenResult;
      }
    }
  }

  // Process deferred tokens (like selectedResult)
  if (deferredTokens.length > 0) {
    if (DEBUG) console.log(`Processing ${deferredTokens.length} deferred tokens`);
    
    for (const tokenContent of deferredTokens) {
      // Parse the deferred token parts
      const parts = tokenContent.split(',');
      const tableToLookup = parts.length > 1 ? parts[1].trim() : "Ancestry";
      
      // Look up the value in context or generate a new one
      let pickedResult;
      
      if (context && tableToLookup in context) {
        // Use existing value from context
        pickedResult = context[tableToLookup];
        if (DEBUG) console.log(`Using "${pickedResult}" for "${tableToLookup}" from context`);
      } else {
        // Generate a new value
        let refTable = findTableByName(tableToLookup, table, allTables);
        
        if (!refTable) {
          if (DEBUG) console.log(`Could not find table "${tableToLookup}" for deferred token`);
          finalResult = `[Table ${tableToLookup} not found]`;
          continue;
        }
        
        // Get a result from the table
        if (refTable.results && Array.isArray(refTable.results)) {
          pickedResult = getWeightedRandomResult({ results: refTable.results });
          
          // Store in context for later use
          if (context) {
            context[tableToLookup] = pickedResult;
          }
          
          if (DEBUG) console.log(`Generated "${pickedResult}" for "${tableToLookup}"`);
        } else {
          if (DEBUG) console.log(`Table "${tableToLookup}" has no valid results`);
          finalResult = `[No results in ${tableToLookup}]`;
          continue;
        }
      }
      
      // Find the corresponding subtable matching the selected value
      let subTable = findSubtableByName(table, pickedResult);
      
      // If not found directly, try case-insensitive search
      if (!subTable && typeof pickedResult === 'string') {
        const pickedLower = pickedResult.toLowerCase();
        
        // Check in subTables and tables arrays
        if (table.subTables && Array.isArray(table.subTables)) {
          subTable = table.subTables.find(t => 
            (t.tablename && t.tablename.toLowerCase() === pickedLower) || 
            (t.name && t.name.toLowerCase() === pickedLower)
          );
        }
        
        if (!subTable && table.tables && Array.isArray(table.tables)) {
          subTable = table.tables.find(t => 
            (t.tablename && t.tablename.toLowerCase() === pickedLower) || 
            (t.name && t.name.toLowerCase() === pickedLower)
          );
        }
      }
      
      // Process the found subtable
      if (subTable) {
        let subtableResult;
        
        if (subTable.customDisplay) {
          subtableResult = processCustomDisplay(subTable, allTables, context);
        } else if (subTable.results && Array.isArray(subTable.results)) {
          subtableResult = randomChoice(subTable.results);
        } else {
          if (DEBUG) console.log(`Subtable "${pickedResult}" has no valid results`);
          finalResult = `[No results in subtable ${pickedResult}]`;
          continue;
        }
        
        // Set the final result
        finalResult = subtableResult;
        if (DEBUG) console.log(`Set result to "${finalResult}" from subtable "${pickedResult}"`);
      } else {
        if (DEBUG) console.log(`Could not find subtable "${pickedResult}"`);
        finalResult = `[No subtable for ${pickedResult}]`;
      }
    }
  }

  // Post-process the final result
  // 1. Process any nested array syntax
  if (typeof finalResult === 'string' && finalResult.includes('[') && finalResult.includes(']')) {
    finalResult = processArraysInString(finalResult);
  }
  
  // 2. Process any table references
  if (typeof finalResult === 'string') {
    finalResult = processTableReferences(finalResult, allTables, context);
  }

  if (DEBUG) console.log(`Final customDisplay result: "${finalResult}"`);
  return finalResult;
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
            console.log(`Loaded table: ${file} (${tableData.tablename || 'Unnamed table'})`);
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
          
          // FIXED: Check for customDisplay first, before looking for results array
          if (subtable.customDisplay) {
            if (DEBUG) console.log(`Subtable "${subtableName}" has customDisplay, processing it directly`);
            result = processCustomDisplay(subtable, allTables, context);
          }
          // Only check for results if there's no customDisplay
          else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
            result = getWeightedRandomResult({ results: subtable.results });
          } else {
            console.error(`Subtable "${subtableName}" has no valid results array or customDisplay`);
            return `[No valid content in ${content}|${subtableName}]`;
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
        if (DEBUG) {
          console.log(`Found range match: key=${entry.key}, value=${entry.value}`);
        }
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
  if (!table || !subtableName) return null;
  
  if (DEBUG) console.log(`Searching for subtable: "${subtableName}" in table: ${table.tablename || table.filename}`);
  
  // Special case for NPC Names by Ancestry
  if (table.filename === "ShadowDark_NPC.yaml" && subtableName) {
    if (DEBUG) console.log(`Special handling for NPC table, looking for ancestry: ${subtableName}`);
    
    // Try to find the ancestry-specific name subtable
    if (table.tables && Array.isArray(table.tables)) {
      // First check for a table called "NPC Names by Ancestry"
      const nameTable = table.tables.find(t => 
        (t.tablename === "NPC Names by Ancestry") || 
        (t.name === "NPC Names by Ancestry")
      );
      
      if (nameTable && nameTable.subTables && Array.isArray(nameTable.subTables)) {
        // Now look for the specific ancestry subtable
        const ancestryTable = nameTable.subTables.find(t => 
          (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
          (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
        );
        
        if (ancestryTable) {
          if (DEBUG) console.log(`Found ancestry subtable "${subtableName}" in NPC Names by Ancestry`);
          return ancestryTable;
        }
      }
      
      // Try looking for direct tables
      for (const subTable of table.tables) {
        if ((subTable.tablename && subTable.tablename.toLowerCase() === subtableName.toLowerCase()) ||
            (subTable.name && subTable.name.toLowerCase() === subtableName.toLowerCase())) {
          if (DEBUG) console.log(`Found direct subtable match for "${subtableName}"`);
          return subTable;
        }
      }
    }
  }
  
  // Rest of the regular subtable search
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
    
    // If not found in direct children, try searching deeper in the hierarchy
    for (const subTable of table.subTables) {
      const found = findSubtableByName(subTable, subtableName);
      if (found) return found;
    }
  }
  
  // If not found in direct children, try searching deeper in the hierarchy
  if (table.tables && Array.isArray(table.tables)) {
    for (const subTable of table.tables) {
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

// Add the missing findRootTable function - finds the top-level table containing a subtable
function findRootTable(subTable, allTables) {
  // If the table has a filename, it's likely a root table already
  if (subTable && subTable.filename) {
    if (DEBUG) console.log(`Table has filename property, assuming it's a root table: ${subTable.filename}`);
    return subTable;
  }
  
  // Check if allTables is iterable before attempting to iterate
  if (!allTables || typeof allTables[Symbol.iterator] !== 'function') {
    if (DEBUG) console.log(`findRootTable: allTables is not iterable or is null. Type: ${typeof allTables}`);
    return null;
  }
  
  // Otherwise look through all tables to find which one contains this subtable
  for (const rootTable of allTables) {
    // Skip tables without proper structure
    if (!rootTable) continue;
    
    // Check if the subtable is directly in the tables array
    if (rootTable.tables && Array.isArray(rootTable.tables)) {
      if (rootTable.tables.includes(subTable)) {
        if (DEBUG) console.log(`Found parent table: ${rootTable.tablename || rootTable.filename}`);
        return rootTable;
      }
      
      // Check if the subtable is in a deeper level
      for (const midTable of rootTable.tables) {
        if (midTable.tables && Array.isArray(midTable.tables) && midTable.tables.includes(subTable)) {
          if (DEBUG) console.log(`Found grandparent table: ${rootTable.tablename || rootTable.filename}`);
          return rootTable;
        }
        
        // Also check subTables array for backward compatibility
        if (midTable.subTables && Array.isArray(midTable.subTables) && midTable.subTables.includes(subTable)) {
          if (DEBUG) console.log(`Found grandparent table (via subTables): ${rootTable.tablename || rootTable.filename}`);
          return rootTable;
        }
      }
    }
    
    // Check if the subtable is directly in the subTables array (for backward compatibility)
    if (rootTable.subTables && Array.isArray(rootTable.subTables)) {
      if (rootTable.subTables.includes(subTable)) {
        if (DEBUG) console.log(`Found parent table (via subTables): ${rootTable.tablename || rootTable.filename}`);
        return rootTable;
      }
    }
  }
  
  if (DEBUG) console.log(`Could not find root table for subtable: ${subTable?.tablename || 'unnamed'}`);
  return null;
}

// Also fix the findTableByName function to handle possible null values
function findTableByName(tableName, currentTable, allTables) {
  // 1. Check in current table hierarchy
  if (currentTable) {
    // Check if the current table matches
    if ((currentTable.tablename === tableName) || (currentTable.name === tableName)) {
      return currentTable;
    }
    
    // Check in tables array
    if (currentTable.tables && Array.isArray(currentTable.tables)) {
      const found = currentTable.tables.find(t => 
        (t.tablename === tableName) || (t.name === tableName)
      );
      if (found) return found;
      
      // Search deeper
      for (const subTable of currentTable.tables) {
        const deepFound = findTableByName(tableName, subTable, null);
        if (deepFound) return deepFound;
      }
    }
    
    // Check in subTables array
    if (currentTable.subTables && Array.isArray(currentTable.subTables)) {
      const found = currentTable.subTables.find(t => 
        (t.tablename === tableName) || (t.name === tableName)
      );
      if (found) return found;
      
      // Search deeper
      for (const subTable of currentTable.subTables) {
        const deepFound = findTableByName(tableName, subTable, null);
        if (deepFound) return deepFound;
      }
    }
    
    // Check in root table if allTables is valid
    if (allTables && Array.isArray(allTables)) {
      const rootTable = findRootTable(currentTable, allTables);
      if (rootTable && rootTable !== currentTable) {
        const found = findTableByName(tableName, rootTable, null);
        if (found) return found;
      }
    }
  }
  
  // 2. Check in all tables as last resort
  if (allTables && Array.isArray(allTables)) {
    // Try direct match first
    const directMatch = allTables.find(t => 
      (t.tablename === tableName) || (t.name === tableName)
    );
    if (directMatch) return directMatch;
    
    // Then search for tables with matching subtables
    for (const rootTable of allTables) {
      const found = findTableInHierarchy(rootTable, tableName);
      if (found) return found;
    }
  }
  
  return null;
}

// Fix the processSelectedResultToken function to handle errors better
function processSelectedResultToken(tokenStr, table, allTables, context) {
  // Parse token parts - should be like "{selectedResult, TableName}"
  const parts = tokenStr.replace(/^\{|\}$/g, '').split(',');
  const lookupTableName = parts.length > 1 ? parts[1].trim() : "Ancestry";
  
  if (DEBUG) console.log(`Processing selectedResult token for table "${lookupTableName}"`);
  
  // 1. Get the selected value from context or generate it
  let selectedValue;
  if (context && lookupTableName in context) {
    selectedValue = context[lookupTableName];
    if (DEBUG) console.log(`Using value from context: "${selectedValue}"`);
  } else {
    // First, check directly in the current table's tables array
    let lookupTable = null;
    
    // Try to find lookupTable directly in the table's tables array
    if (table.tables && Array.isArray(table.tables)) {
      lookupTable = table.tables.find(t => 
        t.tablename === lookupTableName || t.name === lookupTableName
      );
      if (lookupTable) {
        if (DEBUG) console.log(`Found lookup table "${lookupTableName}" directly in table's tables array`);
      }
    }
    
    // If not found, try in the global tables array
    if (!lookupTable && Array.isArray(allTables)) {
      lookupTable = allTables.find(t => 
        t.tablename === lookupTableName || t.name === lookupTableName
      );
      if (lookupTable) {
        if (DEBUG) console.log(`Found lookup table "${lookupTableName}" in global tables array`);
      }
    }
    
    // Last resort, try using findTableByName
    if (!lookupTable) {
      try {
        lookupTable = findTableByName(lookupTableName, table, allTables);
      } catch (e) {
        console.error(`Error in findTableByName: ${e.message}`);
      }
    }
    
    if (!lookupTable || !lookupTable.results || !Array.isArray(lookupTable.results)) {
      console.error(`Cannot find lookup table "${lookupTableName}" or it has no results`);
      return `[Error: No such table ${lookupTableName}]`;
    }
    
    // Generate a value
    selectedValue = getWeightedRandomResult({ results: lookupTable.results });
    if (context) {
      context[lookupTableName] = selectedValue;
    }
    if (DEBUG) console.log(`Generated new value for ${lookupTableName}: "${selectedValue}"`);
  }
  
  if (!selectedValue) {
    console.error(`No value for ${lookupTableName} could be determined`);
    return `[No value for ${lookupTableName}]`;
  }
  
  // 2. Find the corresponding subtable with the selected name
  const subtableName = String(selectedValue);
  let subtable = findSubtableByName(table, subtableName);
  
  // Try case-insensitive search if not found
  if (!subtable && typeof subtableName === 'string') {
    const lowerName = subtableName.toLowerCase();
    
    // Check in subTables array
    if (table.subTables && Array.isArray(table.subTables)) {
      subtable = table.subTables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === lowerName) || 
        (t.name && t.name.toLowerCase() === lowerName)
      );
    }
    
    // Check in tables array
    if (!subtable && table.tables && Array.isArray(table.tables)) {
      subtable = table.tables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === lowerName) || 
        (t.name && t.name.toLowerCase() === lowerName)
      );
    }
  }
  
  // 3. Get a result from the subtable
  if (subtable) {
    if (subtable.customDisplay) {
      // Recursively process if it has its own customDisplay
      if (DEBUG) console.log(`Subtable "${subtableName}" has customDisplay, processing recursively`);
      const result = processCustomDisplay(subtable, allTables, context);
      if (DEBUG) console.log(`Result from recursive customDisplay: "${result}"`);
      return result;
    } else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
      // Choose a random result
      const result = randomChoice(subtable.results);
      if (DEBUG) console.log(`Selected "${result}" from subtable "${subtableName}"`);
      return result;
    } else {
      console.error(`Subtable "${subtableName}" has no valid results`);
      return `[No results in ${subtableName}]`;
    }
  } else {
    console.error(`Subtable "${subtableName}" not found`);
    return `[Subtable ${subtableName} not found]`;
  }
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

// Function to find a table by name in the hierarchy of a given table
function findTableInHierarchy(rootTable, tableName) {
  if (!rootTable) return null;
  
  // Check if the current table matches by name
  if ((rootTable.tablename && rootTable.tablename === tableName) ||
      (rootTable.name && rootTable.name === tableName)) {
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

// Improved function to process arrays in strings - handle nested arrays better
function processArraysInString(str) {
  if (DEBUG) console.log(`Processing arrays in string: ${str}`);
  
  // Process all [...] segments by picking one item from each
  let result = str;
  const arrayRegex = /\[([^\[\]]+)\]/g;
  
  // Count brackets to ensure we're not in a partial expression
  const openBrackets = (str.match(/\[/g) || []).length;
  const closeBrackets = (str.match(/\]/g) || []).length;
  
  if (openBrackets !== closeBrackets) {
    if (DEBUG) console.log(`Warning: Unbalanced brackets in string: ${str}`);
    return str; // Return original if brackets are unbalanced
  }
  
  result = result.replace(arrayRegex, (match, contents) => {
    // Split the array contents by commas, but handle nested weighted entries like [item, 2]
    const options = [];
    let currentOption = "";
    let inWeightedItem = false;
    let bracketCount = 0;
    
    // Parse the content character by character for proper handling
    for (let i = 0; i < contents.length; i++) {
      const char = contents[i];
      
      if (char === '[') {
        bracketCount++;
        inWeightedItem = true;
        currentOption += char;
      } 
      else if (char === ']') {
        bracketCount--;
        currentOption += char;
        if (bracketCount === 0) inWeightedItem = false;
      }
      else if (char === ',' && !inWeightedItem && bracketCount === 0) {
        options.push(currentOption.trim());
        currentOption = "";
      }
      else {
        currentOption += char;
      }
    }
    
    // Add the last option if there is one
    if (currentOption.trim()) {
      options.push(currentOption.trim());
    }
    
    if (DEBUG) console.log(`Found options: ${JSON.stringify(options)}`);
    
    // Handle weighted options
    const weightedOptions = options.map(opt => {
      // Check if this is a weighted option like [item, 2]
      if (opt.startsWith('[') && opt.endsWith(']')) {
        // Parse the inner weighted entry
        const innerMatch = opt.match(/\[(.*),\s*(\d+)\]/);
        if (innerMatch) {
          const [_, value, weight] = innerMatch;
          return [value.trim(), parseInt(weight, 10)];
        }
      }
      return opt;
    });
    
    // Use weightedRandom to select from options (handles both weighted and unweighted)
    const selected = weightedRandom(weightedOptions);
    
    if (DEBUG) console.log(`Selected from array: ${selected}`);
    return selected;
  });
  
  // Process nested arrays by recursively calling until all arrays are resolved
  if (result.includes('[') && result.includes(']')) {
    result = processArraysInString(result);
  }
  
  if (DEBUG) console.log(`Processed result: ${result}`);
  return result;
}

// Modified processCustomDisplay function to better handle deferred tokens
function processCustomDisplay(table, allTables, context) {
  if (DEBUG) console.log('Processing customDisplay for table:', table);

  if (!table.customDisplay) {
    console.error('Error: customDisplay is missing in the table:', table);
    return 'Error: customDisplay is missing';
  }

  // Special handling for pickOneFromArrays display mode
  if (table.customDisplay === "{pickOneFromArrays}") {
    // ...existing code...
  }

  // Original customDisplay processing for other formats
  let deferredTokens = [];
  let displayStr = table.customDisplay.replace(/^\[|\]$/g, '');
  let normalResult = "";
  let lastIndex = 0;
  let match;
  const tokenRegex = /\{([^}]+)\}/g;

  // ...existing code for first part of function...

  // Modified part for handling deferred tokens
  let finalResult = normalResult;
  deferredTokens.forEach(tokenContent => {
    if (DEBUG) {
      console.log(`Processing deferred token: "${tokenContent}" with current result: "${finalResult}"`);
    }
    let parts = tokenContent.split(',');
    let tableToLookup = parts[1] ? parts[1].trim() : "Ancestry";
    let pickedResult = null;
    
    if (context && context[tableToLookup]) {
      pickedResult = context[tableToLookup];
      if (DEBUG) {
        console.log(`Using cached result "${pickedResult}" for table "${tableToLookup}" from context`);
      }
    } else {
      // First try to find the table directly within this table's hierarchy
      // This handles cases where the table being referenced is actually a subtable
      let refTable = null;
      
      // Check if the table exists as a direct subtable first
      if (table.tables && Array.isArray(table.tables)) {
        refTable = table.tables.find(t => 
          (t.tablename === tableToLookup) || (t.name === tableToLookup)
        );
      }
      
      // Also check in the root table's structure
      if (!refTable) {
        const rootTable = findRootTable(table, allTables);
        if (rootTable) {
          if (rootTable.tables && Array.isArray(rootTable.tables)) {
            refTable = rootTable.tables.find(t => 
              (t.tablename === tableToLookup) || (t.name === tableToLookup)
            );
          }
        }
      }
      
      // Last resort - check all tables
      if (!refTable) {
        refTable = findTableInHierarchy(table, tableToLookup) || 
                  findReferencedTable(tableToLookup, allTables);
      }
      
      if (!refTable || !refTable.results) {
        console.warn(`Deferred token: Could not find a table named "${tableToLookup}" or it has no results.`);
        finalResult = `[Error: Table ${tableToLookup} not found]`;
        return;
      }
      
      // Get a result from the lookup table
      pickedResult = getWeightedRandomResult({ results: refTable.results });
      if (context) {
        context[tableToLookup] = pickedResult;
      }
      
      if (DEBUG) {
        console.log(`Deferred token: Picked "${pickedResult}" from table "${tableToLookup}" and stored in context.`);
      }
    }

    // Fix for subtable lookup - find the corresponding subtable
    let subTable = findSubtableByName(table, pickedResult);
    
    if (!subTable && DEBUG) console.log(`Could not find subtable named "${pickedResult}" - trying case-insensitive search`);
    
    // Try a case-insensitive search if not found
    if (!subTable) {
      const pickedLower = typeof pickedResult === 'string' ? pickedResult.toLowerCase() : '';
      
      // Check in tables array
      if (table.tables && Array.isArray(table.tables)) {
        subTable = table.tables.find(t => 
          (t.tablename && t.tablename.toLowerCase() === pickedLower) || 
          (t.name && t.name.toLowerCase() === pickedLower)
        );
      }
      
      // Check in subTables array if not found in tables array
      if (!subTable && table.subTables && Array.isArray(table.subTables)) {
        subTable = table.subTables.find(t => 
          (t.tablename && t.tablename.toLowerCase() === pickedLower) || 
          (t.name && t.name.toLowerCase() === pickedLower)
        );
      }
    }
    
    // If found subtable, use it to pick a result
    if (subTable && subTable.results?.length > 0) {
      let finalPick = randomChoice(subTable.results);
      finalResult = finalPick;
      if (DEBUG) {
        console.log(`Deferred token: Found subtable "${pickedResult}" in current table. Picked "${finalPick}".`);
      }
    } else {
      if (DEBUG) {
        console.log(`Deferred token: No subtable named "${pickedResult}" in current table or it has no results.`);
      }
      finalResult = `[No subtable for ${pickedResult}]`;
    }
  });

  // Post-process any nested array syntax from combined results
  if (typeof finalResult === 'string' && finalResult.includes('[') && finalResult.includes(']')) {
    finalResult = processArraysInString(finalResult);
  }

  if (typeof finalResult === 'string') {
    finalResult = processTableReferences(finalResult, allTables, context);
  }

  if (DEBUG) {
    console.log(`Final customDisplay result after processing references: "${finalResult}"`);
  }
  return finalResult;
}

// Helper function to find tables by name (for deferred tokens and subtable lookups)
function findTableByName(tableName, currentTable, allTables) {
  // 1. Check in current table hierarchy
  if (currentTable) {
    // Check if the current table matches
    if ((currentTable.tablename === tableName) || (currentTable.name === tableName)) {
      return currentTable;
    }
    
    // Check in tables array
    if (currentTable.tables && Array.isArray(currentTable.tables)) {
      const found = currentTable.tables.find(t => 
        (t.tablename === tableName) || (t.name === tableName)
      );
      if (found) return found;
      
      // Search deeper
      for (const subTable of currentTable.tables) {
        const deepFound = findTableByName(tableName, subTable, null);
        if (deepFound) return deepFound;
      }
    }
    
    // Check in subTables array
    if (currentTable.subTables && Array.isArray(currentTable.subTables)) {
      const found = currentTable.subTables.find(t => 
        (t.tablename === tableName) || (t.name === tableName)
      );
      if (found) return found;
      
      // Search deeper
      for (const subTable of currentTable.subTables) {
        const deepFound = findTableByName(tableName, subTable, null);
        if (deepFound) return deepFound;
      }
    }
    
    // Check in root table
    const rootTable = findRootTable(currentTable, allTables);
    if (rootTable && rootTable !== currentTable) {
      const found = findTableByName(tableName, rootTable, null);
      if (found) return found;
    }
  }
  
  // 2. Check in all tables as last resort
  if (allTables) {
    // Try direct match first
    const directMatch = allTables.find(t => 
      (t.tablename === tableName) || (t.name === tableName)
    );
    if (directMatch) return directMatch;
    
    // Then search for tables with matching subtables
    for (const rootTable of allTables) {
      const found = findTableInHierarchy(rootTable, tableName);
      if (found) return found;
    }
  }
  
  return null;
}

// Complete rewrite of processCustomDisplay with a more direct approach
function processCustomDisplay(table, allTables, context) {
  if (DEBUG) console.log('Processing customDisplay for table:', table.tablename || 'unnamed');

  if (!table.customDisplay) {
    console.error('Error: customDisplay is missing in the table:', table);
    return 'Error: customDisplay is missing';
  }

  // Special handling for pickOneFromArrays display mode
  if (table.customDisplay === "{pickOneFromArrays}") {
    if (DEBUG) console.log(`Processing pickOneFromArrays for table ${table.tablename || 'unnamed'}`);
    
    if (!table.results || !Array.isArray(table.results) || table.results.length === 0) {
      console.error('Error: table has no results array for pickOneFromArrays', table);
      return 'Error: No results to pick from';
    }
    
    // Pick a random entry from the results array
    const resultEntry = randomChoice(table.results);
    if (DEBUG) console.log(`Selected base entry: ${resultEntry}`);
    
    // Process the entry to pick items from any arrays it contains
    let processedResult = resultEntry;
    
    // If the entry is a string with array notation [item1, item2, ...]
    if (typeof resultEntry === 'string' && resultEntry.includes('[') && resultEntry.includes(']')) {
      processedResult = processArraysInString(resultEntry);
    }
    
    if (DEBUG) console.log(`Final pickOneFromArrays result: ${processedResult}`);
    return processedResult;
  }

  // Handle standard customDisplay format

  // Remove surrounding brackets if present
  let displayTemplate = table.customDisplay;
  if (displayTemplate.startsWith('[') && displayTemplate.endsWith(']')) {
    displayTemplate = displayTemplate.substring(1, displayTemplate.length - 1);
  }

  if (DEBUG) console.log(`Processing display template: "${displayTemplate}"`);

  // Check if this is a simple token replacement or a deferred token
  if (displayTemplate.startsWith("{selectedResult")) {
    // This is a deferred token that uses a value from context
    return processSelectedResultToken(displayTemplate, table, allTables, context);
  } else {
    // This is a template with regular tokens to replace
    return processRegularTokens(displayTemplate, table, allTables, context);
  }
}

// Helper function to process templates with {selectedResult} tokens
function processSelectedResultToken(tokenStr, table, allTables, context) {
  // Parse token parts - should be like "{selectedResult, TableName}"
  const parts = tokenStr.replace(/^\{|\}$/g, '').split(',');
  const lookupTableName = parts.length > 1 ? parts[1].trim() : "Ancestry";
  
  if (DEBUG) console.log(`Processing selectedResult token for table "${lookupTableName}"`);
  
  // 1. Get the selected value from context or generate it
  let selectedValue;
  if (context && lookupTableName in context) {
    selectedValue = context[lookupTableName];
    if (DEBUG) console.log(`Using value from context: "${selectedValue}"`);
  } else {
    // Find the table to look up
    const lookupTable = findTableByName(lookupTableName, table, allTables);
    if (!lookupTable || !lookupTable.results || !Array.isArray(lookupTable.results)) {
      console.error(`Cannot find lookup table "${lookupTableName}" or it has no results`);
      return `[Error: No such table ${lookupTableName}]`;
    }
    
    // Generate a value
    selectedValue = getWeightedRandomResult({ results: lookupTable.results });
    if (context) {
      context[lookupTableName] = selectedValue;
    }
    if (DEBUG) console.log(`Generated new value for ${lookupTableName}: "${selectedValue}"`);
  }
  
  if (!selectedValue) {
    console.error(`No value for ${lookupTableName} could be determined`);
    return `[No value for ${lookupTableName}]`;
  }
  
  // 2. Find the corresponding subtable with the selected name
  const subtableName = String(selectedValue);
  let subtable = findSubtableByName(table, subtableName);
  
  // Try case-insensitive search if not found
  if (!subtable && typeof subtableName === 'string') {
    const lowerName = subtableName.toLowerCase();
    
    // Check in subTables array
    if (table.subTables && Array.isArray(table.subTables)) {
      subtable = table.subTables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === lowerName) || 
        (t.name && t.name.toLowerCase() === lowerName)
      );
    }
    
    // Check in tables array
    if (!subtable && table.tables && Array.isArray(table.tables)) {
      subtable = table.tables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === lowerName) || 
        (t.name && t.name.toLowerCase() === lowerName)
      );
    }
  }
  
  // 3. Get a result from the subtable
  if (subtable) {
    if (subtable.customDisplay) {
      // Recursively process if it has its own customDisplay
      if (DEBUG) console.log(`Subtable "${subtableName}" has customDisplay, processing recursively`);
      const result = processCustomDisplay(subtable, allTables, context);
      if (DEBUG) console.log(`Result from recursive customDisplay: "${result}"`);
      return result;
    } else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
      // Choose a random result
      const result = randomChoice(subtable.results);
      if (DEBUG) console.log(`Selected "${result}" from subtable "${subtableName}"`);
      return result;
    } else {
      console.error(`Subtable "${subtableName}" has no valid results`);
      return `[No results in ${subtableName}]`;
    }
  } else {
    console.error(`Subtable "${subtableName}" not found`);
    return `[Subtable ${subtableName} not found]`;
  }
}

// Helper function to process templates with regular tokens
function processRegularTokens(template, table, allTables, context) {
  // Simple regex to match token patterns like {TokenName} or {TokenName, 0.5}
  const tokenRegex = /\{([^{}]+)\}/g;
  let result = '';
  let lastIndex = 0;
  let match;
  
  // Process each token in the template
  while ((match = tokenRegex.exec(template)) !== null) {
    // Add text before the token
    result += template.substring(lastIndex, match.index);
    
    // Extract token content and parse parts
    const tokenContent = match[1].trim();
    const tokenParts = tokenContent.split(',');
    const subtableName = tokenParts[0].trim();
    
    // Check if token has a weight/probability
    let probability = 1.0;
    if (tokenParts.length > 1) {
      const probStr = tokenParts[1].trim();
      const parsedProb = parseFloat(probStr);
      if (!isNaN(parsedProb)) {
        probability = parsedProb;
      }
    }
    
    // Apply probability - skip token if random roll is higher than probability
    if (Math.random() > probability) {
      if (DEBUG) console.log(`Token "${subtableName}" skipped due to probability roll (${probability})`);
    } else {
      // Find the referenced subtable
      let subtable = findSubtableByName(table, subtableName);
      
      // If not found, try looking through all tables
      if (!subtable) {
        subtable = findTableByName(subtableName, table, allTables);
      }
      
      if (subtable) {
        // Process the subtable
        let tokenResult;
        
        if (subtable.customDisplay) {
          // If subtable has its own customDisplay, process recursively
          if (DEBUG) console.log(`Subtable "${subtableName}" has customDisplay, processing recursively`);
          tokenResult = processCustomDisplay(subtable, allTables, context);
        } else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
          // Otherwise pick a random result
          tokenResult = randomChoice(subtable.results);
          if (DEBUG) console.log(`Selected "${tokenResult}" from subtable "${subtableName}"`);
        } else {
          console.error(`Subtable "${subtableName}" has no valid results`);
          tokenResult = `[No results in ${subtableName}]`;
        }
        
        // Add the token result to our output
        result += tokenResult;
      } else {
        console.error(`Subtable "${subtableName}" not found`);
        result += `[${subtableName} not found]`;
      }
    }
    
    // Update lastIndex for next iteration
    lastIndex = tokenRegex.lastIndex;
  }
  
  // Add any remaining text after the last token
  result += template.substring(lastIndex);
  
  // Process any array syntax in the result
  if (result.includes('[') && result.includes(']')) {
    result = processArraysInString(result);
  }
  
  // Process any table references in the result
  result = processTableReferences(result, allTables, context);
  
  if (DEBUG) console.log(`Final customDisplay result: "${result}"`);
  return result;
}