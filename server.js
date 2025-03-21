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
// Add explicit route for CSS files with correct MIME type
app.use('/css', express.static(path.join(__dirname, 'css')));

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

  // Store the current table in context for internal references
  if (context) {
    context._currentTable = table;
  }

  // Add description if present - handle both string and array formats
  const description = getPropertyCaseInsensitive(table, 'description');
  if (description) {
    if (Array.isArray(description)) {
      sourceInfo._description = description.join(' ');
    } else if (typeof description === 'string') {
      sourceInfo._description = description;
    }
    
    if (DEBUG) console.log(`Found description for table ${header}:`, sourceInfo._description);
  }
  
  // Check for table structure patterns rather than specific names
  const results = getPropertyCaseInsensitive(table, 'results');
  const customDisplay = getPropertyCaseInsensitive(table, 'customDisplay');
  const tables = getPropertyCaseInsensitive(table, 'tables');
  
  // Pattern 1: Table with simple string results
  if (results && Array.isArray(results) && 
      results.length > 0 && 
      results.every(item => typeof item === 'string' || typeof item === 'number')) {
    console.log(`Processing simple string results table: ${header}`);
    const result = randomChoice(results);
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
  if (results && Array.isArray(results) && 
      results.length > 0 && 
      results.every(item => Array.isArray(item) && item.length === 2 && 
                         typeof item[0] === 'string' && typeof item[1] === 'string')) {
    console.log(`Processing career-style table: ${header}`);
    const career = randomChoice(results);
    
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
  if (customDisplay) {
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
  else if (results && Array.isArray(results) && results.length > 0) {
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
  else if (tables && Array.isArray(tables)) {
    let subResults = [];
    tables.forEach(subTable => {
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
      setting: table.setting || 'Unknown',
      inputField: table.inputField || null // Ensure inputField property is included
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
  const { table, number, inputValues } = req.body;
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
    
    // Modified to include inputValues in the context for each generation
    let results = [];
    for (let i = 0; i < number; i++) {
      // Create a fresh context for each generation, initialized with input values
      let context = { 
        thisResult: null // Initialize thisResult to null
      };
      
      // Add any input values to the context
      if (inputValues) {
        Object.keys(inputValues).forEach(key => {
          context[key] = inputValues[key];
        });
        if (DEBUG) console.log('Added input values to context:', inputValues);
      }
      
      const result = processTable(selectedTable, "", tables, context);
      if (result) {
        results.push(result);
      }
    }
    
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
  const { table, header, context: clientContext, inputValues } = req.body;

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
    // CRITICAL FIX: Merge the contexts without deep cloning
    // This allows us to preserve all references throughout the processing chain
    const context = { ...(clientContext || {}), ...(inputValues || {}) };

    // Ensure `thisResult` is initialized in the context
    if (!('thisResult' in context)) {
      context.thisResult = null;
    }

    // ENHANCED DEBUGGING: Log the complete context after merging
    if (DEBUG) {
      console.log('Complete context after merging inputs:', 
        Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
    }

    // Find the specific subtable for this header
    let targetSubTable = null;

    // Check if the header contains a math expression
    let hasMathExpression = false;
    if (/[+\-*/]/.test(header)) {
      if (DEBUG) console.log(`Header "${header}" appears to contain math operators - will process as an expression`);
      hasMathExpression = true;
    }

    // Search for the matching subtable
    if (!hasMathExpression && selectedTable.tables && Array.isArray(selectedTable.tables)) {
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
    if (!targetSubTable && !hasMathExpression && selectedTable.results && Array.isArray(selectedTable.results)) {
      console.log(`Using top-level table results for header "${header}"`);
      targetSubTable = selectedTable;
    }

    let result;

    // Special case for math expressions - evaluate directly
    if (hasMathExpression) {
      console.log(`Processing header "${header}" as a math expression`);
      const exprString = `{${header}}`;
      result = processTableReferences(exprString, tables, context);
      console.log(`Evaluated math expression "${header}" to: ${result}`);
    }
    // Standard processing for regular tables
    else if (targetSubTable) {
      if (targetSubTable.customDisplay) {
        console.log(`Processing table with customDisplay: ${targetSubTable.name || header}`);
        result = processCustomDisplay(targetSubTable, tables, context);
      } else if (targetSubTable.results && Array.isArray(targetSubTable.results)) {
        if (targetSubTable.results.length === 0) {
          console.error(`Empty results array for subtable: ${header}`);
          return res.status(500).json({ error: `Empty results array for: ${header}` });
        }

        const randomResult = getWeightedRandomResult(targetSubTable);

        // CRITICAL FIX: Store the current table in context for proper reference tracking
        context._currentTable = targetSubTable;

        if (DEBUG) {
          console.log(`Context before processing randomResult:`, 
            Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
        }

        if (Array.isArray(randomResult)) {
          console.log(`Processing array result for ${header}:`, randomResult);
          result = processArrayWithExpressions(randomResult, tables, context);
        } else if (typeof randomResult === 'string') {
          // Special handling for array-like strings
          if (randomResult.trim().startsWith('[') && randomResult.trim().endsWith(']')) {
            console.log(`Processing array-like string for ${header} with CharismaModifier=${context.CharismaModifier}:`, randomResult);
            // CRITICAL FIX: Ensure we pass the context properly
            result = processTableReferences(randomResult, tables, context);
          } else {
            result = processTableReferences(randomResult, tables, context);
          }
        } else {
          result = randomResult;
        }

        if (DEBUG) {
          console.log(`Context after processing randomResult:`, 
            Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
        }

        console.log(`Selected and processed value for ${header}:`, result);
      } else {
        console.error(`Invalid structure for subtable: ${header}`);
        return res.status(500).json({ error: `Invalid structure for subtable: ${header}` });
      }
    } else {
      console.error(`Could not find subtable for header: ${header}`);
      return res.status(404).json({ error: `Could not find subtable for header: ${header}` });
    }

    // Update the context with the final result
    context[header] = result;

    // Return the result with metadata
    return res.json({
      result: {
        header: header,
        result: result,
        _tableName: targetSubTable ? (targetSubTable.name || targetSubTable.tablename || header) : header
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
  const results = getPropertyCaseInsensitive(table, 'results');
  
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.error('Error: No valid results found in table:', table.tablename || table.name || 'unnamed');
    return 'Error: No valid entries found';
  }
  
  let weightedEntries = [];
  results.forEach(entry => {
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
    console.error('Error: No valid entries found for weighting in table:', table.tablename || table.name || 'unnamed');
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
function processCustomDisplay(table, allTables, context, recursionTracker = null) {
  // Initialize recursion tracking if not provided
  if (!recursionTracker) {
    recursionTracker = {
      depth: 0,
      tables: new Set(),
      maxDepth: 10
    };
  }
  
  // Check if this table has already been processed (prevent infinite recursion)
  const tableId = table.tablename || table.name || 'unnamed';
  if (recursionTracker.tables.has(tableId)) {
    if (DEBUG) console.log(`Detected recursive customDisplay for table: ${tableId}`);
    return `[Recursive reference to ${tableId}]`;
  }
  
  // Check recursion depth
  if (recursionTracker.depth >= recursionTracker.maxDepth) {
    if (DEBUG) console.log(`Maximum recursion depth reached (${recursionTracker.maxDepth}) for: ${tableId}`);
    return `[Max recursion depth reached for ${tableId}]`;
  }
  
  // Track this table for recursion detection
  recursionTracker.tables.add(tableId);
  recursionTracker.depth++;
  
  if (DEBUG) console.log(`Processing customDisplay for table: ${tableId} (depth: ${recursionTracker.depth})`);

  const customDisplay = getPropertyCaseInsensitive(table, 'customDisplay');
  if (!customDisplay) {
    recursionTracker.tables.delete(tableId);
    recursionTracker.depth--;
    console.error('Error: customDisplay is missing in the table:', table);
    return 'Error: customDisplay is missing';
  }
  
  try {
    // Special handling for pickOneFromArrays display mode
    if (customDisplay === "{pickOneFromArrays}") {
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
      
      // Process any table references in the result
      if (typeof processedResult === 'string' && processedResult.includes('{')) {
        processedResult = processTableReferences(processedResult, allTables, context, recursionTracker);
      }
      
      // Clean up recursion tracker before returning
      recursionTracker.tables.delete(tableId);
      recursionTracker.depth--;
      
      if (DEBUG) console.log(`Final pickOneFromArrays result: ${processedResult}`);
      return processedResult;
    }

    // Handle standard customDisplay format
    // Remove surrounding brackets if present
    let displayTemplate = customDisplay;
    if (displayTemplate.startsWith('[') && displayTemplate.endsWith(']')) {
      displayTemplate = displayTemplate.substring(1, displayTemplate.length - 1);
    }

    let result;
    
    // Check if this is a simple token replacement or a deferred token
    if (displayTemplate.startsWith("{selectedResult")) {
      // This is a deferred token that uses a value from context
      result = processSelectedResultToken(displayTemplate, table, allTables, context, recursionTracker);
    } else {
      // This is a template with regular tokens to replace
      result = processRegularTokens(displayTemplate, table, allTables, context, recursionTracker);
    }
    
    // Remove this table from tracker before returning
    recursionTracker.tables.delete(tableId);
    recursionTracker.depth--;
    
    return result;
  } catch (error) {
    // Clean up tracker even if there's an error
    recursionTracker.tables.delete(tableId);
    recursionTracker.depth--;
    
    console.error(`Error in processCustomDisplay for ${tableId}:`, error);
    return `[Error in ${tableId}: ${error.message}]`;
  }
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

// Fixed function to evaluate mathematical expressions with context variable substitution
function evaluateExpression(expression, context) {
  if (DEBUG) console.log(`Evaluating expression: ${expression}`);
  if (DEBUG) console.log(`Context for evaluation:`, context);
  
  // CRITICAL FIX: Use a deep copy instead of a shallow copy to preserve all context properties
  const localContext = JSON.parse(JSON.stringify(context || {}));
  
  // Step 1: Replace any context variables with their values
  let processedExpression = expression;
  
  // Look for variable names in the expression
  const variableRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let match;
  let matches = [];
  let missingVariables = [];
  
  // First collect all variable matches to avoid regex iteration issues
  while ((match = variableRegex.exec(expression)) !== null) {
    matches.push(match[1]);
  }
  
  // Track dice roll result for display purposes
  let diceValue = null;
  let diceNotation = null;
  
  // Step 2: Process any dice notation in the expression
  const diceRegex = /(\d+)d(\d+)(?:[+-]\d+)?/g;
  processedExpression = processedExpression.replace(diceRegex, (match) => {
    const diceResult = parseDiceNotation(match);
    if (diceResult !== null) {
      if (DEBUG) console.log(`Evaluated dice notation ${match} to ${diceResult}`);
      // Store dice details for display formatting
      diceValue = diceResult;
      diceNotation = match;
      // Store result in context for potential later use
      localContext.thisResult = diceResult;
      localContext._lastDiceRoll = {
        notation: match,
        result: diceResult
      };
      return diceResult;
    }
    return match;
  });
  
  // Then process each variable
  for (const varName of matches) {
    // Skip JavaScript keywords that might appear in expressions
    if (['true', 'false', 'null', 'undefined'].includes(varName)) continue;
    
    // Replace variable with its value from context if it exists
    if (varName in localContext) {
      const varValue = localContext[varName];
      if (DEBUG) console.log(`Found variable ${varName} in context with value: ${varValue}`);
      
      // Convert to number if possible, otherwise use string with quotes
      const replacementValue = !isNaN(varValue) ? Number(varValue) : 
                              `"${String(varValue).replace(/"/g, '\\"')}"`;
      
      // Use a safer replacement strategy by creating a new RegExp for each replacement
      const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
      processedExpression = processedExpression.replace(varRegex, replacementValue);
      
      if (DEBUG) console.log(`Replaced variable ${varName} with value ${replacementValue}`);
    } else {
      if (DEBUG) console.log(`Variable ${varName} not found in context`);
      // Track missing variables instead of immediately failing
      missingVariables.push(varName);
      
      // Replace with 0 to allow evaluation to continue
      const varRegex = new RegExp(`\\b${varName}\\b`, 'g');
      processedExpression = processedExpression.replace(varRegex, "0");
      
      if (DEBUG) console.log(`Replaced missing variable ${varName} with 0 for evaluation`);
    }
  }
  
  // Log missing variables for debugging
  if (missingVariables.length > 0) {
    console.error(`Variables not found in context: ${missingVariables.join(', ')}`, localContext);
  }
  
  // Step 3: Evaluate the processed expression
  try {
    if (DEBUG) console.log(`Evaluating processed expression: ${processedExpression}`);
    // Check if the expression is valid before evaluating
    if (processedExpression.includes('undefined') || processedExpression.includes('NaN')) {
      throw new Error(`Invalid expression after variable substitution: ${processedExpression}`);
    }
    
    // Use Function constructor to create a safe evaluation environment
    const result = new Function('return ' + processedExpression)();
    
    // Store the expression details for better display
    localContext._lastExpression = {
      original: expression,
      processed: processedExpression,
      diceNotation: diceNotation,
      diceValue: diceValue,
      result: result,
      missingVariables: missingVariables
    };
    
    // Copy back the relevant expression data to the original context
    if (context) {
      context._lastExpression = localContext._lastExpression;
    }
    
    if (DEBUG) console.log(`Expression result: ${result}`);
    return result;
  } catch (error) {
    console.error(`Error evaluating expression "${expression}": ${error.message}`);
    console.error(`Processed expression was: ${processedExpression}`);
    // Return a numeric default value rather than an error string
    return diceValue || 0; // Return the dice value if we have it, otherwise 0
  }
}

// New function to process references to other tables in result strings
function processTableReferences(input, allTables, context = {}, recursionTracker = null) {
  // Initialize recursion tracking if not provided
  if (!recursionTracker) {
    recursionTracker = {
      depth: 0,
      tables: new Set(), // Track tables we're currently processing
      maxDepth: 10 // Maximum recursion depth allowed
    };
  }
  
  // ADDED DEBUGGING: Log context state at start of processing
  if (DEBUG) {
    if (typeof input === 'string' && (input.includes('CharismaModifier') || input.includes('2d6'))) {
      console.log(`processTableReferences for "${input.substring(0, 50)}..." with context:`, 
        Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
    }
  }
  
  // Handle string inputs
  if (typeof input === 'string') {
    // Special handling for array-like syntax: "[{...},{...}]"
    if (input.trim().startsWith('[') && input.trim().endsWith(']')) {
      // Extract content between brackets
      const innerContent = input.trim().substring(1, input.trim().length - 1);
      
      // ENHANCED DEBUGGING: Log context details before processing arrays
      if (DEBUG) {
        console.log(`Processing array-like string with context:`, 
          Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
      }
      
      // Split by commas, handling nested braces correctly
      const elements = splitBalanced(innerContent, ',');
      if (DEBUG) console.log(`Detected array syntax with ${elements.length} elements:`, elements);
      
      // CRITICAL FIX: Use a shared reference to the original context for all children
      // Make a deep copy only if needed for tracking purposes
      const sharedContext = context;
      
      // Process each element separately, using the shared context
      const processedElements = elements.map(element => {
        // IMPROVED DEBUGGING: Track context before/after each element processing
        if (DEBUG && element.includes('CharismaModifier')) {
          console.log(`Before processing element "${element.trim()}", CharismaModifier=`, 
            sharedContext.CharismaModifier);
        }
        
        const result = processTableReferences(element.trim(), allTables, sharedContext, recursionTracker);
        
        if (DEBUG && element.includes('CharismaModifier')) {
          console.log(`After processing element "${element.trim()}", CharismaModifier=`, 
            sharedContext.CharismaModifier);
        }
        
        return result;
      });
      
      // Log the context state after processing all elements
      if (DEBUG) {
        console.log(`After processing array-like string, context:`, 
          Object.keys(sharedContext).map(k => `${k}:${sharedContext[k]}`).join(', '));
      }
      
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

    // CRITICAL FIX: First check for variables in context before attempting math evaluation
    // This ensures we detect and use values like CharismaModifier directly from context
    const variableRegex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    processedInput = processedInput.replace(variableRegex, (match, variableName) => {
      if (context && variableName in context) {
        if (DEBUG) console.log(`Found variable "${variableName}" directly in context with value: ${context[variableName]}`);
        return context[variableName];
      }
      return match; // Return unchanged if not found in context
    });

    // Improved regex for mathematical expressions to better capture operations
    const mathExprRegex = /\{([^{}]+(?:[+\-*/][^{}]+)+)\}/g;
    processedInput = processedInput.replace(mathExprRegex, (match, expression) => {
      // Skip if this looks like a table reference with a pipe
      if (expression.includes('|')) return match;
      
      // If this is a useReferenceTable call, skip it
      if (expression.startsWith('useReferenceTable')) return match;
      
      // Skip if this is a selectedResult token
      if (expression.startsWith('selectedResult')) return match;
      
      if (DEBUG) console.log(`Found math expression: ${expression}`);
      
      // CRITICAL FIX: Ensure we're using a reference to the original context
      // Don't create a local deep copy that would lose changes
      if (DEBUG) console.log(`Full context before math evaluation:`, 
        Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
      
      // If we get here, evaluate with the complete context
      const result = evaluateExpression(expression, context);
      
      // Check if we got an error - convert to a safe value if so
      if (typeof result === 'string' && result.startsWith('[Error')) {
        console.error(`Math expression evaluation failed: ${result}`);
        // Use 0 as a safe default for failed math expressions
        if (context) context.thisResult = 0;
        return 0;
      }
      
      // Format the result to display the expression details (for UI display purposes)
      let formattedResult = result;
      
      // Find variable names in the expression
      const variables = [];
      const varRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
      let varMatch;
      while ((varMatch = varRegex.exec(expression)) !== null) {
        const varName = varMatch[1];
        if (!['true', 'false', 'null', 'undefined'].includes(varName)) {
          variables.push(varName);
        }
      }
      
      // Only format if we have a dice roll and a modifier
      if (context._lastExpression && 
          context._lastExpression.diceNotation && 
          variables.length > 0 && 
          typeof result === 'number') {
        
        // Extract modifier name and value
        const modName = variables[0];
        const modValue = context[modName];
        const diceValue = context._lastExpression.diceValue;
        
        // Format as "dice + modifier = total"
        formattedResult = `${diceValue} + ${modValue} = ${result}`;
        
        if (DEBUG) console.log(`Formatted result for display: ${formattedResult}`);
      }
      
      // Store the result in context.thisResult for potential reference table lookups
      if (context) {
        context.thisResult = result;
        // Also store the formatted display value if different
        if (formattedResult !== result) {
          context._displayResult = formattedResult;
        }
        if (DEBUG) console.log(`Stored math result in thisResult: ${result}`);
      }
      
      // For reroll UI display, return the formatted result if available
      return context._displayResult || result;
    });

    // Process useReferenceTable calls (after math expressions to allow math in lookupValue)
    const useRefRegex = /\{useReferenceTable\{([^}]+)\}\{([^}]+)\}\}/g;
    processedInput = processedInput.replace(useRefRegex, (match, tableName, lookupValue) => {
      if (DEBUG) console.log(`Detected useReferenceTable function call: Table=${tableName}, Value=${lookupValue}`);
      return lookupInReferenceTable(tableName, lookupValue, allTables, context);
    });

    // Finally, handle standard table references
    const tableRefRegex = /\{([^}\[\]|+\-*/]+)(?:\[(\d+)\])?(?:\|([^}]+))?\}/g;
    
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
      
      // NEW: Check if the token is an inputField variable in the context before looking for a table
      if (context && content in context) {
        if (DEBUG) console.log(`Found "${content}" in context with value: ${context[content]}`);
        
        // IMPORTANT: Store the value in thisResult so it can be used by subsequent reference table lookups
        // This is the key fix - store the context value in thisResult just like we do for dice rolls
        if (context) {
          context.thisResult = context[content];
          if (DEBUG) console.log(`Stored context value "${content}" in thisResult: ${context.thisResult}`);
        }
        
        return context[content];
      }
      
      // Process as a table reference
      if (DEBUG) console.log(`Processing table reference: ${match} (Table: ${content}, Index: ${arrayIndex || 'none'}, Subtable: ${subtableName || 'none'})`);
      
      // Create a unique identifier for this table reference
      const refId = subtableName ? `${content}|${subtableName}` : content;
      
      // Check if we're already processing this table reference (recursion detection)
      if (recursionTracker.tables.has(refId)) {
        if (DEBUG) console.log(`Detected recursive reference to table: ${refId}`);
        return `[Recursive reference to ${refId}]`;
      }
      
      // Check recursion depth
      if (recursionTracker.depth >= recursionTracker.maxDepth) {
        if (DEBUG) console.log(`Maximum recursion depth reached (${recursionTracker.maxDepth}) for: ${refId}`);
        return `[Max recursion depth reached for ${refId}]`;
      }
      
      // Find the referenced table - pass the current table context
      const referencedTable = findReferencedTable(content, allTables, context._currentTable);
      
      if (!referencedTable) {
        console.error(`Referenced table not found: ${content}`);
        return `[${content} not found]`;
      }
      
      // Track this reference for recursion detection
      recursionTracker.tables.add(refId);
      recursionTracker.depth++;
      
      try {
        // Make a copy of the referenced table to avoid modifying the original
        const workingTable = Object.assign({}, referencedTable);
        
        // IMPORTANT: Add original source tracking - first reference is preserved
        if (!workingTable._originalSource) {
          workingTable._originalSource = content;
          if (DEBUG) console.log(`Setting original source for referenced table to: ${content}`);
        }
        
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
            result = processCustomDisplay(subtable, allTables, context, recursionTracker);
          }
          // Only check for results if there's no customDisplay
          else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
            result = getWeightedRandomResult({ results: subtable.results });
            
            // Process any nested references in the result
            if (typeof result === 'string' && result.includes('{')) {
              result = processTableReferences(result, allTables, context, recursionTracker);
            }
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
          result = processCustomDisplay(mainTable, allTables, context, recursionTracker);
        }
        // For whole-table references (no subtable specified)
        else if (referencedTable.results && Array.isArray(referencedTable.results)) {
          result = getWeightedRandomResult({ results: referencedTable.results });
          
          // Process any nested table references in the result
          if (typeof result === 'string' && result.includes('{')) {
            result = processTableReferences(result, allTables, context, recursionTracker);
          }
        } else if (referencedTable.tables && Array.isArray(referencedTable.tables) && referencedTable.tables.length > 0) {
          // Look for a table with customDisplay first
          const customDisplayTable = referencedTable.tables.find(t => t.customDisplay);
          if (customDisplayTable) {
            if (DEBUG) console.log(`Found table with customDisplay: ${customDisplayTable.tablename}`);
            result = processCustomDisplay(customDisplayTable, allTables, context, recursionTracker);
          } else {
            // Otherwise use the first subtable with results
            const subtable = referencedTable.tables[0];
            if (subtable.results && Array.isArray(subtable.results)) {
              result = getWeightedRandomResult(subtable);
              
              // Process any nested references
              if (typeof result === 'string' && result.includes('{')) {
                result = processTableReferences(result, allTables, context, recursionTracker);
              }
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
        
        // Remove this reference from tracker before returning
        recursionTracker.tables.delete(refId);
        recursionTracker.depth--;
        
        return result ? String(result) : '';
      } catch (error) {
        // Clean up tracker even if there's an error
        recursionTracker.tables.delete(refId);
        recursionTracker.depth--;
        
        console.error(`Error processing table reference ${match}:`, error);
        return `[Error: ${error.message}]`;
      }
    });
  }
  // Handle arrays by processing each string element
  else if (Array.isArray(input)) {
    // Use the special array processing function to prevent cross-contamination
    return processArrayWithExpressions(input, allTables, context);
  }
  // Return non-string inputs unchanged
  return input;
}

// Improved array processing function to better preserve context
function processArrayWithExpressions(array, allTables, context) {
  // Return immediately if not an array
  if (!Array.isArray(array)) return array;
  
  // Create a new array for results
  const resultArray = [];
  
  // CRITICAL FIX: Don't create a deep copy - use the original context
  // This ensures variable values like CharismaModifier stay accessible
  if (DEBUG) {
    console.log(`processArrayWithExpressions starting with context:`, 
      Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
  }
  
  // Special handling for dice roll + lookup pattern
  if (array.length === 2 && 
      typeof array[0] === 'string' && 
      typeof array[1] === 'string' &&
      array[0].includes('{') && 
      array[1].includes('useReferenceTable')) {
    
    if (DEBUG) {
      console.log(`Processing special array pattern: dice roll + reference table lookup`);
      console.log(`Before first element, CharismaModifier = ${context.CharismaModifier}`);
    }
    
    // Process first element (dice roll) with the context
    const result1 = processTableReferences(array[0], allTables, context);
    resultArray.push(result1);
    
    if (DEBUG) {
      console.log(`After first element, CharismaModifier = ${context.CharismaModifier}`);
      console.log(`After processing first element, context:`, 
        Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
    }
    
    // Ensure thisResult is properly formatted for thisResult[0] reference
    if (context.thisResult !== undefined && !Array.isArray(context.thisResult)) {
      context.thisResult = [context.thisResult];
    }
    
    // Process second element (reference table lookup) with the updated context
    const result2 = processTableReferences(array[1], allTables, context);
    resultArray.push(result2);
    
    if (DEBUG) {
      console.log(`After processing both elements, context:`, 
        Object.keys(context).map(k => `${k}:${context[k]}`).join(', '));
    }
    
    // No need to copy changes back as we're using the original context
    
    return resultArray;
  }
  
  // Standard processing for other array types
  for (let i = 0; i < array.length; i++) {
    const element = array[i];
    if (typeof element === 'string') {
      resultArray.push(processTableReferences(element, allTables, context));
    } else {
      resultArray.push(element);
    }
  }
  
  // No need to copy changes back as we're using the original context
  
  return resultArray;
}

// Helper function to access object properties in a case-insensitive manner
function getPropertyCaseInsensitive(obj, propName) {
  if (!obj || typeof obj !== 'object') return undefined;
  
  // Try direct access first (fastest)
  if (propName in obj) return obj[propName];
  
  // If not found with exact case, try case-insensitive search
  const lowerPropName = propName.toLowerCase();
  for (const key in obj) {
    if (key.toLowerCase() === lowerPropName) {
      return obj[key];
    }
  }
  
  return undefined;
}

// Function to find subtables by name
function findSubtableByName(table, subtableName) {
  if (!table || !subtableName) return null;
  
  if (DEBUG) console.log(`Searching for subtable: "${subtableName}" in table: ${table.tablename || table.filename}`);
  
  // Special case for NPC Names by Ancestry
  if (table.filename === "ShadowDark_NPC.yaml" && subtableName) {
    if (DEBUG) console.log(`Special handling for NPC table, looking for ancestry: ${subtableName}`);
    
    // Try to find the ancestry-specific name subtable.
    const tables = getPropertyCaseInsensitive(table, 'tables');
    if (tables && Array.isArray(tables)) {
      // First check for a table called "NPC Names by Ancestry"
      const nameTable = tables.find(t => 
        (t.tablename === "NPC Names by Ancestry") || 
        (t.name === "NPC Names by Ancestry")
      );
      
      if (nameTable) {
        const subTables = getPropertyCaseInsensitive(nameTable, 'subTables');
        if (subTables && Array.isArray(subTables)) {
          // Now look for the specific ancestry subtable
          const ancestryTable = subTables.find(t => 
            (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
            (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
          );
          
          if (ancestryTable) {
            if (DEBUG) console.log(`Found ancestry subtable "${subtableName}" in NPC Names by Ancestry`);
            return ancestryTable;
          }
        }
      }
      
      // Try looking for direct tables
      for (const subTable of tables) {
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
  const tables = getPropertyCaseInsensitive(table, 'tables');
  if (tables && Array.isArray(tables)) {
    // Search in the tables array first
    const subtable = tables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
    );
    if (subtable) return subtable;
  }
  
  // Also check in subTables array (for backward compatibility)
  const subTables = getPropertyCaseInsensitive(table, 'subTables');
  if (subTables && Array.isArray(subTables)) {
    const subtable = subTables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
    );
    if (subtable) return subtable;
    
    // If not found in direct children, try searching deeper in the hierarchy
    for (const subTable of subTables) {
      const found = findSubtableByName(subTable, subtableName);
      if (found) return found;
    }
  }
  
  // If not found in direct children, try searching deeper in the hierarchy
  if (tables && Array.isArray(tables)) {
    for (const subTable of tables) {
      const found = findSubtableByName(subTable, subtableName);
      if (found) return found;
    }
  }
  
  return null;
}

// Function to find a table by name (replacing the corrupted implementation)
function findTableByName(tableName, currentTable, allTables) {
  // 1. Check in current table hierarchy
  if (currentTable) {
    // Check if the current table matches
    if ((currentTable.tablename === tableName) || (currentTable.name === tableName)) {
      return currentTable;
    }
    
    // Check in tables array
    const tables = getPropertyCaseInsensitive(currentTable, 'tables');
    if (tables && Array.isArray(tables)) {
      const found = tables.find(t => 
        (t.tablename === tableName) || (t.name === tableName)
      );
      if (found) return found;
      
      // Search deeper
      for (const subTable of tables) {
        const deepFound = findTableByName(tableName, subTable, null);
        if (deepFound) return deepFound;
      }
    }
    
    // Check in subTables array (for backward compatibility)
    const subTables = getPropertyCaseInsensitive(currentTable, 'subTables');
    if (subTables && Array.isArray(subTables)) {
      const found = subTables.find(t => 
        (t.tablename === tableName) || (t.name === tableName)
      );
      if (found) return found;
      
      // Search deeper
      for (const subTable of subTables) {
        const deepFound = findTableByName(tableName, subTable, null);
        if (deepFound) return deepFound;
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

// Function to find a table in the hierarchy of a given table
function findTableInHierarchy(rootTable, tableName) {
  if (!rootTable) return null;
  
  // Check if the current table matches by name
  if ((rootTable.tablename && rootTable.tablename === tableName) || 
      (rootTable.name && rootTable.name === tableName)) {
    return rootTable;
  }
  
  // Check in tables array
  const tables = getPropertyCaseInsensitive(rootTable, 'tables');
  if (tables && Array.isArray(tables)) {
    for (const subTable of tables) {
      const found = findTableInHierarchy(subTable, tableName);
      if (found) return found;
    }
  }
  
  // Check in subTables array (for backward compatibility)
  const subTables = getPropertyCaseInsensitive(rootTable, 'subTables');
  if (subTables && Array.isArray(subTables)) {
    for (const subTable of subTables) {
      const found = findTableInHierarchy(subTable, tableName);
      if (found) return found;
    }
  }
  
  return null;
}

// Helper function to find the root table containing a subtable
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
    const tables = getPropertyCaseInsensitive(rootTable, 'tables');
    if (tables && Array.isArray(tables)) {
      if (tables.includes(subTable)) {
        if (DEBUG) console.log(`Found parent table: ${rootTable.tablename || rootTable.filename}`);
        return rootTable;
      }
      
      // Check if the subtable is in a deeper level
      for (const midTable of tables) {
        const midTables = getPropertyCaseInsensitive(midTable, 'tables');
        if (midTables && Array.isArray(midTables) && midTables.includes(subTable)) {
          if (DEBUG) console.log(`Found grandparent table: ${rootTable.tablename || rootTable.filename}`);
          return rootTable;
        }
        
        // Also check subTables array for backward compatibility
        const midSubTables = getPropertyCaseInsensitive(midTable, 'subTables');
        if (midSubTables && Array.isArray(midSubTables) && midSubTables.includes(subTable)) {
          if (DEBUG) console.log(`Found grandparent table (via subTables): ${rootTable.tablename || rootTable.filename}`);
          return rootTable;
        }
      }
    }
    
    // Check if the subtable is directly in the subTables array (for backward compatibility)
    const subTables = getPropertyCaseInsensitive(rootTable, 'subTables');
    if (subTables && Array.isArray(subTables)) {
      if (subTables.includes(subTable)) {
        if (DEBUG) console.log(`Found parent table (via subTables): ${rootTable.tablename || rootTable.filename}`);
        return rootTable;
      }
    }
  }
  
  if (DEBUG) console.log(`Could not find root table for subtable: ${subTable?.tablename || 'unnamed'}`);
  return null;
}

// Function to find a table in the hierarchy of a given table
function findTableInHierarchy(rootTable, tableName) {
  if (!rootTable) return null;
  
  // Check if the current table matches by name
  if ((rootTable.tablename && rootTable.tablename === tableName) || 
      (rootTable.name && rootTable.name === tableName)) {
    return rootTable;
  }
  
  // Check in tables array
  const tables = getPropertyCaseInsensitive(rootTable, 'tables');
  if (tables && Array.isArray(tables)) {
    for (const subTable of tables) {
      const found = findTableInHierarchy(subTable, tableName);
      if (found) return found;
    }
  }
  
  // Check in subTables array (for backward compatibility)
  const subTables = getPropertyCaseInsensitive(rootTable, 'subTables');
  if (subTables && Array.isArray(subTables)) {
    for (const subTable of subTables) {
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
      } else if (char === ']') {
        bracketCount--;
        currentOption += char;
        if (bracketCount === 0) inWeightedItem = false;
      } else if (char === ',' && !inWeightedItem && bracketCount === 0) {
        options.push(currentOption.trim());
        currentOption = "";
      } else {
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

// Function to look up a value in a reference table
function lookupInReferenceTable(tableName, lookupValue, allTables, context) {
  if (DEBUG) console.log(`Looking up value ${lookupValue} in reference table ${tableName}`);
  
  // Process the lookup value if it contains special variables
  let processedLookupValue = lookupValue;
  
  // If the lookup value is an error string, convert to a numeric value
  if (typeof processedLookupValue === 'string' && processedLookupValue.startsWith('[Error')) {
    console.error(`Error value passed to reference table lookup: ${processedLookupValue}`);
    processedLookupValue = 0; // Use 0 as a safe default
  }
  
  // Direct handling for thisResult
  if (lookupValue === "thisResult" && context && 'thisResult' in context) {
    processedLookupValue = context.thisResult;
    if (DEBUG) console.log(`Using thisResult from context: ${processedLookupValue}`);
    
    // If thisResult is an error string, convert to a numeric value
    if (typeof processedLookupValue === 'string' && processedLookupValue.startsWith('[Error')) {
      console.error(`Error value in thisResult: ${processedLookupValue}`);
      processedLookupValue = 0; // Use 0 as a safe default
    }
  } 
  // Handle array indexing with thisResult (e.g., thisResult[0])
  else if (/^thisResult\[\d+\]$/.test(lookupValue) && context && 'thisResult' in context) {
    const match = lookupValue.match(/^thisResult\[(\d+)\]$/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (Array.isArray(context.thisResult) && index < context.thisResult.length) {
        processedLookupValue = context.thisResult[index];
        if (DEBUG) console.log(`Using thisResult[${index}] from context: ${processedLookupValue}`);
        
        // Check for error in the extracted array element
        if (typeof processedLookupValue === 'string' && processedLookupValue.startsWith('[Error')) {
          console.error(`Error value in thisResult[${index}]: ${processedLookupValue}`);
          processedLookupValue = 0; // Use 0 as a safe default
        }
      } else if (index === 0 && !Array.isArray(context.thisResult)) {
        processedLookupValue = context.thisResult;
        if (DEBUG) console.log(`Using thisResult as scalar value: ${processedLookupValue}`);
        
        // Check for error in the extracted value
        if (typeof processedLookupValue === 'string' && processedLookupValue.startsWith('[Error')) {
          console.error(`Error value in thisResult: ${processedLookupValue}`);
          processedLookupValue = 0; // Use 0 as a safe default
        }
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
    
    // NEW: Check for "less than or equal to" format (<=N)
    if (typeof entry.key === 'string' && entry.key.startsWith('<=')) {
      const threshold = Number(entry.key.substring(2));
      if (!isNaN(threshold) && processedLookupValue <= threshold) {
        if (DEBUG) {
          console.log(`Found <= match: key=${entry.key}, value=${entry.value}, threshold=${threshold}`);
        }
        return entry.value;
      }
    }
    
    // NEW: Check for "less than" format (<N)
    if (typeof entry.key === 'string' && entry.key.startsWith('<') && !entry.key.startsWith('<=')) {
      const threshold = Number(entry.key.substring(1));
      if (!isNaN(threshold) && processedLookupValue < threshold) {
        if (DEBUG) {
          console.log(`Found < match: key=${entry.key}, value=${entry.value}, threshold=${threshold}`);
        }
        return entry.value;
      }
    }
    
    // NEW: Check for "greater than or equal to" format (N<=)
    if (typeof entry.key === 'string' && entry.key.endsWith('<=')) {
      const threshold = Number(entry.key.substring(0, entry.key.length - 2));
      if (!isNaN(threshold) && processedLookupValue >= threshold) {
        if (DEBUG) {
          console.log(`Found >= match: key=${entry.key}, value=${entry.value}, threshold=${threshold}`);
        }
        return entry.value;
      }
    }
    
    // NEW: Check for "greater than" format (N<)
    if (typeof entry.key === 'string' && entry.key.endsWith('<') && !entry.key.endsWith('<=')) {
      const threshold = Number(entry.key.substring(0, entry.key.length - 1));
      if (!isNaN(threshold) && processedLookupValue > threshold) {
        if (DEBUG) {
          console.log(`Found > match: key=${entry.key}, value=${entry.value}, threshold=${threshold}`);
        }
        return entry.value;
      }
    }
  }
  
  if (DEBUG) console.log(`No matching entry found for lookup value ${processedLookupValue}`);
  return `[No match for ${processedLookupValue}]`;
}

// Function to find a referenced table by name or filename, checking current context first
function findReferencedTable(tableRef, allTables, currentTable = null) {
  const normalizedRef = tableRef.replace(/\.ya?ml$/i, '');
  
  // First try by exact filename matchwithin the current table
  if (currentTable) {
    // Check if the current table has a matching subtable
    if (currentTable.tables && Array.isArray(currentTable.tables)) {
      const internalTable = currentTable.tables.find(t => 
        (t.tablename && t.tablename === tableRef) || 
        (t.name && t.name === tableRef));
      if (internalTable) {
        if (DEBUG) console.log(`Found internal reference "${tableRef}" within current table`);
        return internalTable;
      }
    }
    
    // Also check in subTables array (for backward compatibility)
    if (currentTable.subTables && Array.isArray(currentTable.subTables)) {
      const internalTable = currentTable.subTables.find(t => 
        (t.tablename && t.tablename === tableRef) || 
        (t.name && t.name === tableRef));
      if (internalTable) {
        if (DEBUG) console.log(`Found internal reference "${tableRef}" within current table's subTables`);
        return internalTable;
      }
    }

    // 2. NEW: If not found as direct subtable, look for sibling tables within the same file
    // Try to find the parent table (root table of the current file)
    const rootTable = findRootTableFromContext(currentTable, allTables);
    if (rootTable && rootTable.tables && Array.isArray(rootTable.tables)) {
      // Look for a sibling table with matching name
      const siblingTable = rootTable.tables.find(t => 
        (t.tablename && t.tablename === tableRef) || 
        (t.name && t.name === tableRef));
      
      if (siblingTable) {
        if (DEBUG) console.log(`Found sibling table "${tableRef}" within same file`);
        return siblingTable;
      }
    }
  }
  
  // 3. Next try by exact filename match
  let table = allTables.find(t => 
    t.filename === `${normalizedRef}.yaml` || 
    t.filename === `${normalizedRef}.yml`);
  
  // 4. If not found, try by table name
  if (!table) {
    table = allTables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === normalizedRef.toLowerCase()) || 
      (t.name && t.name.toLowerCase() === normalizedRef.toLowerCase()));
  }
  
  if (DEBUG) {
    if (table) {
      console.log(`Found referenced table: ${table.filename} (${table.tablename})`);
    } else {
      console.log(`Could not find referenced table: ${normalizedRef}`);
    }
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

// Function to find subtables by name
function findSubtableByName(table, subtableName) {
  if (!table || !subtableName) return null;
  
  if (DEBUG) console.log(`Searching for subtable: "${subtableName}" in table: ${table.tablename || table.filename}`);
  
  // Special case for NPC Names by Ancestry
  if (table.filename === "ShadowDark_NPC.yaml" && subtableName) {
    if (DEBUG) console.log(`Special handling for NPC table, looking for ancestry: ${subtableName}`);
    
    // Try to find the ancestry-specific name subtable.
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
  const tables = getPropertyCaseInsensitive(table, 'tables');
  if (tables && Array.isArray(tables)) {
    // Search in the tables array first
    const subtable = tables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
    );
    if (subtable) return subtable;
  }
  
  // Also check in subTables array (for backward compatibility)
  const subTables = getPropertyCaseInsensitive(table, 'subTables');
  if (subTables && Array.isArray(subTables)) {
    const subtable = subTables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
    );
    if (subtable) return subtable;
    
    // If not found in direct children, try searching deeper in the hierarchy
    for (const subTable of subTables) {
      const found = findSubtableByName(subTable, subtableName);
      if (found) return found;
    }
  }
  
  // If not found in direct children, try searching deeper in the hierarchy
  if (tables && Array.isArray(tables)) {
    for (const subTable of tables) {
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

// Function to find the top-level table containing a subtable
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
        
        // Also check subTables array
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
      
      // Nested check in subTables
      for (const midTable of rootTable.subTables) {
        if (midTable.subTables && Array.isArray(midTable.subTables) && midTable.subTables.includes(subTable)) {
          return rootTable;
        }
      }
    }
  }
  
  if (DEBUG) console.log(`Could not find root table for subtable: ${subTable?.tablename || 'unnamed'}`);
  return null;
}

// Function to find a table by name (replacing the corrupted implementation)
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
    
    // Check in subTables array (for backward compatibility)
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

// Helper function to find the root table (table with filename) from current context
function findRootTableFromContext(currentTable, allTables) {
  // If this table already has a filename, it's a root table
  if (currentTable && currentTable.filename) {
    return currentTable;
  }
  
  // Otherwise search through all tables to find which one contains this table
  // or has the same filename as this table's filename property
  for (const rootTable of allTables) {
    // Skip tables without proper structure
    if (!rootTable) continue;
    
    // If current table has a filename reference, match by that
    if (currentTable && currentTable.filename && rootTable.filename === currentTable.filename) {
      return rootTable;
    }
    
    // Otherwise check if the root table contains this table somewhere in its hierarchy
    if (rootTable.tables && Array.isArray(rootTable.tables)) {
      // Direct child check
      if (rootTable.tables.includes(currentTable)) {
        return rootTable;
      }
      
      // Nested check in tables array
      for (const midTable of rootTable.tables) {
        if (midTable.tables && Array.isArray(midTable.tables) && 
            midTable.tables.includes(currentTable)) {
          return rootTable;
        }
        
        // Also check subTables array
        if (midTable.subTables && Array.isArray(midTable.subTables) && 
            midTable.subTables.includes(currentTable)) {
          return rootTable;
        }
      }
    }
    
    // Check in subTables array too
    if (rootTable.subTables && Array.isArray(rootTable.subTables)) {
      // Direct check
      if (rootTable.subTables.includes(currentTable)) {
        return rootTable;
      }
      
      // Nested check in subTables
      for (const midTable of rootTable.subTables) {
        if (midTable.subTables && Array.isArray(midTable.subTables) && 
            midTable.subTables.includes(currentTable)) {
          return rootTable;
        }
      }
    }
  }
  
  return null;
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

// Helper function to process templates with {selectedResult} tokens
function processSelectedResultToken(tokenStr, table, allTables, context, recursionTracker = null) {
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
  
  // 2. Find the corresponding subtable with the name matching the selected value
  if (!selectedValue) {
    console.error(`No value for ${lookupTableName} could be determined`);
    return `[Error: No value for ${lookupTableName}]`;
  }
  
  // Now look for a subtable with the name matching selectedValue
  let subtable = findSubtableByName(table, selectedValue);
  
  // Try case-insensitive search if not found
  if (!subtable && typeof selectedValue === 'string') {
    const lowerName = selectedValue.toLowerCase();
    
    // Check in subTables array
    const subTables = getPropertyCaseInsensitive(table, 'subTables');
    if (subTables && Array.isArray(subTables)) {
      subtable = subTables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === lowerName) || 
        (t.name && t.name.toLowerCase() === lowerName)
      );
    }
    
    // Check in tables array
    if (!subtable) {
      const tables = getPropertyCaseInsensitive(table, 'tables');
      if (tables && Array.isArray(tables)) {
        subtable = tables.find(t => 
          (t.tablename && t.tablename.toLowerCase() === lowerName) || 
          (t.name && t.name.toLowerCase() === lowerName)
        );
      }
    }
  }
  
  // 3. Get a result from the subtable
  if (subtable) {
    if (subtable.customDisplay) {
      // Recursively process if it has its own customDisplay
      if (DEBUG) console.log(`Subtable "${selectedValue}" has customDisplay, processing recursively`);
      const result = processCustomDisplay(subtable, allTables, context, recursionTracker);
      if (DEBUG) console.log(`Result from recursive customDisplay: "${result}"`);
      return result;
    } else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
      // Choose a random result
      const result = randomChoice(subtable.results);
      if (DEBUG) console.log(`Selected "${result}" from subtable "${selectedValue}"`);
      
      // Process any table references in the result
      if (typeof result === 'string' && result.includes('{')) {
        return processTableReferences(result, allTables, context, recursionTracker);
      }
      
      return result;
    } else {
      console.error(`Subtable "${selectedValue}" has no valid results`);
      return `[No results in ${selectedValue}]`;
    }
  } else {
    console.error(`Subtable "${selectedValue}" not found`);
    return `[Subtable ${selectedValue} not found]`;
  }
}

// Implementation of the missing function for processing regular tokens in customDisplay
function processRegularTokens(template, table, allTables, context, recursionTracker = null) {
  // Initialize recursion tracking if not provided
  if (!recursionTracker) {
    recursionTracker = {
      depth: 0,
      tables: new Set(),
      maxDepth: 10
    };
  }

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
      // First try to find the token as an internal subtable
      let subtable = findSubtableByName(table, subtableName);
      
      // If not found within table, try looking for it as a sibling table within the same file
      if (!subtable && table.filename) {
        const rootTable = findRootTableFromFilename(table.filename, allTables);
        if (rootTable) {
          const tables = getPropertyCaseInsensitive(rootTable, 'tables');
          if (tables && Array.isArray(tables)) {
            subtable = tables.find(t => 
              (t.tablename && t.tablename.toLowerCase() === subtableName.toLowerCase()) ||
              (t.name && t.name.toLowerCase() === subtableName.toLowerCase())
            );
          }
        }
      }
      
      // If still not found, try looking through all tables
      if (!subtable) {
        subtable = findTableByName(subtableName, table, allTables);
      }
      
      if (subtable) {
        // Process the subtable
        let tokenResult;
        
        if (subtable.customDisplay) {
          // If subtable has its own customDisplay, process recursively
          if (DEBUG) console.log(`Subtable "${subtableName}" has customDisplay, processing recursively`);
          tokenResult = processCustomDisplay(subtable, allTables, context, recursionTracker);
        } else if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
          // Otherwise pick a random result
          tokenResult = randomChoice(subtable.results);
          if (DEBUG) console.log(`Selected "${tokenResult}" from subtable "${subtableName}"`);
          
          // Process any table references in the result
          if (typeof tokenResult === 'string' && tokenResult.includes('{')) {
            tokenResult = processTableReferences(tokenResult, allTables, context, recursionTracker);
          }
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
  result = processTableReferences(result, allTables, context, recursionTracker);
  
  if (DEBUG) console.log(`Final customDisplay result: "${result}"`);
  return result;
}

// Helper function to find a root table by filename
function findRootTableFromFilename(filename, allTables) {
  if (!filename || !allTables || !Array.isArray(allTables)) return null;
  
  const rootTable = allTables.find(t => t.filename === filename);
  if (rootTable) {
    if (DEBUG) console.log(`Found root table by filename: ${filename}`);
    return rootTable;
  }
  
  return null;
}

// Update findReferencedTable function to better handle internal table references
function findReferencedTable(tableRef, allTables, currentTable = null) {
  const normalizedRef = tableRef.replace(/\.ya?ml$/i, '');
  
  // First check if this is a reference to a table within the current table
  if (currentTable) {
    // 1. Check if the current table has a matching subtable
    // First try direct tables array
    const tables = getPropertyCaseInsensitive(currentTable, 'tables');
    if (tables && Array.isArray(tables)) {
      const internalTable = tables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === tableRef.toLowerCase()) || 
        (t.name && t.name.toLowerCase() === tableRef.toLowerCase()));
      
      if (internalTable) {
        if (DEBUG) console.log(`Found internal reference "${tableRef}" within current table's tables array`);
        return internalTable;
      }
    }
    
    // Also check in subTables array (for backward compatibility)
    const subTables = getPropertyCaseInsensitive(currentTable, 'subTables');
    if (subTables && Array.isArray(subTables)) {
      const internalTable = subTables.find(t => 
        (t.tablename && t.tablename.toLowerCase() === tableRef.toLowerCase()) || 
        (t.name && t.name.toLowerCase() === tableRef.toLowerCase()));
      
      if (internalTable) {
        if (DEBUG) console.log(`Found internal reference "${tableRef}" within current table's subTables array`);
        return internalTable;
      }
    }
    
    // 2. If not found as direct subtable, look for sibling tables within the same file
    const rootTable = currentTable.filename ? 
                      findRootTableFromFilename(currentTable.filename, allTables) : 
                      findRootTableFromContext(currentTable, allTables);
    
    if (rootTable) {
      // Look for a sibling table with matching name
      const siblingTables = getPropertyCaseInsensitive(rootTable, 'tables');
      if (siblingTables && Array.isArray(siblingTables)) {
        const siblingTable = siblingTables.find(t => 
          (t.tablename && t.tablename.toLowerCase() === tableRef.toLowerCase()) || 
          (t.name && t.name.toLowerCase() === tableRef.toLowerCase()));
        
        if (siblingTable) {
          if (DEBUG) console.log(`Found sibling table "${tableRef}" within same file`);
          return siblingTable;
        }
      }
      
      // Also check in root table's subTables array
      const siblingSubTables = getPropertyCaseInsensitive(rootTable, 'subTables');
      if (siblingSubTables && Array.isArray(siblingSubTables)) {
        const siblingTable = siblingSubTables.find(t => 
          (t.tablename && t.tablename.toLowerCase() === tableRef.toLowerCase()) || 
          (t.name && t.name.toLowerCase() === tableRef.toLowerCase()));
        
        if (siblingTable) {
          if (DEBUG) console.log(`Found sibling table "${tableRef}" within root table's subTables`);
          return siblingTable;
        }
      }
    }
  }
  
  // 3. Next try by exact filename match
  let table = allTables.find(t => 
    t.filename === `${normalizedRef}.yaml` || 
    t.filename === `${normalizedRef}.yml`);
  
  // 4. If not found, try by table name (case-insensitive)
  if (!table) {
    table = allTables.find(t => 
      (t.tablename && t.tablename.toLowerCase() === normalizedRef.toLowerCase()) || 
      (t.name && t.name.toLowerCase() === normalizedRef.toLowerCase()));
  }
  
  if (DEBUG) {
    if (table) {
      console.log(`Found referenced table: ${table.filename} (${table.tablename || table.name || 'unnamed'})`);
    } else {
      console.log(`Could not find referenced table: ${normalizedRef}`);
    }
  }
  
  return table;
}