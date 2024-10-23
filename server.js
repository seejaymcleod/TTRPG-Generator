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



app.post('/api/generate', (req, res) => {
    const { table, number } = req.body;
    const selectedTable = tables.find(t => t.filename === table.filename);
    if (!selectedTable) {
        return res.status(404).json({ error: 'Table not found.' });
    }

    try {
        const results = [];
        for (let i = 0; i < number; i++) {
            const result = generateResultsFromTables(selectedTable.tables || selectedTable.subTables, selectedTable.actionType);
            results.push(result);
        }

        res.json({ results });
    } catch (error) {
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
                table.filename = filename;  // Ensure name is set for each file
                table.game = table.game || 'Unknown';
                table.type = table.type || 'Unknown';
                table.setting = table.setting || 'Unknown';
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

// Function to generate results from nested tables
// Updated function to dynamically determine the range based on the minimum and maximum of all defined ranges
function generateResultsFromTables(tables, actionType = 'ListNoHeaders', parentHeader = '') {
    if (DEBUG) console.log('Generating results from nested tables:', tables, 'with action type:', actionType);
    if (!tables || tables.length === 0) {
        if (DEBUG) console.warn('No tables found to generate results from.');
        return 'No valid results found';
    }

    let results = [];

    tables.forEach((table, tableIndex) => {
        if (DEBUG) console.log('Processing table:', table);
        const header = table.name || parentHeader;

        if (table.results && Array.isArray(table.results) && table.results.length > 0) {
            if (DEBUG) console.log('Table has results:', table.results);

            // Check if the table has ranges
            const hasRanges = table.results.some(entry => entry.range);

            if (hasRanges) {
                const weightedResult = getWeightedRandomResult(table, tableIndex);
                if (DEBUG) console.log(`Selected weighted result: "${weightedResult}"`);
                results.push({ header, result: weightedResult });
            } else {
                const randomResult = getRandomResult(table);
                if (DEBUG) console.log(`Selected result: "${randomResult}" from non-ranged list of ${table.results.length} total items.`);
                results.push({ header, result: randomResult });
            }
        } else if (table.subTables) {
            if (DEBUG) console.log('Table has subtables:', table.subTables);
            const subResults = generateResultsFromTables(table.subTables, table.actionType, header);
            if (Array.isArray(subResults)) {
                subResults.forEach(subResult => {
                    results.push(subResult);
                });
            } else {
                results.push({ header, result: subResults });
            }
        } else {
            console.error(`Invalid table detected at index ${tableIndex}. Table:`, table);
        }
    });

    switch (actionType) {
        case 'ListWithHeaders':
            return results.map(result => ({ key: result.header, value: result.result }));
        case 'SameLineWithSpaces':
            return results.map(result => result.result).join(' ');
        case 'SameLineNoSpaces':
            return results.map(result => result.result).join('');
        default:
            return results.map(result => ({ key: result.header, value: result.result }));
    }
}

// New function for selecting a weighted random result from tables with ranges
function getWeightedRandomResult(table, tableIndex) {
    let ranges = [];
    let minRange = Infinity;
    let maxRange = -Infinity;

    table.results.forEach((entry, entryIndex) => {
        if (!entry.value) {
            console.error(`Invalid entry detected at index ${entryIndex} in table at index ${tableIndex}. Entry:`, entry);
            return;
        }

        let range = entry.range;
        if (range) {
            if (range.includes('-')) {
                const [start, end] = range.split('-').map(Number);
                for (let i = start; i <= end; i++) {
                    ranges.push({ value: entry.value, index: i });
                }
                minRange = Math.min(minRange, start);
                maxRange = Math.max(maxRange, end);
            } else {
                const value = parseInt(range, 10);
                ranges.push({ value: entry.value, index: value });
                minRange = Math.min(minRange, value);
                maxRange = Math.max(maxRange, value);
            }
        } else {
            console.error(`Invalid range detected at index ${entryIndex} in table at index ${tableIndex}. Entry:`, entry);
        }
    });

    // Check for overlapping ranges
    let rangeSet = new Set();
    for (let rangeEntry of ranges) {
        if (rangeSet.has(rangeEntry.index)) {
            console.error('Overlapping ranges detected for index:', rangeEntry.index);
            return 'Error: Overlapping ranges detected';
        }
        rangeSet.add(rangeEntry.index);
    }

    // Ensure ranges are not empty before proceeding
    if (ranges.length === 0) {
        console.error('Error: No valid ranges found in table at index', tableIndex);
        return 'Error: No valid ranges found';
    }

    // Generate a random value within the full range
    const randomValue = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;
    let selectedResult = ranges.find(entry => entry.index === randomValue)?.value;

    if (selectedResult === null || selectedResult === undefined) {
        // If no match found in ranges, pick a random result
        const fallbackIndex = Math.floor(Math.random() * table.results.length);
        selectedResult = table.results[fallbackIndex].value;
        if (DEBUG) console.warn(`No matching range found for random value ${randomValue}. Falling back to random result at index ${fallbackIndex}`);
    }

    console.log(`Selected: "${selectedResult}" from weighted list based on range ${minRange}-${maxRange}. Random value: ${randomValue}`);
    return selectedResult;
}

// Modified function for selecting a random result from tables without ranges
function getRandomResult(table) {
    const randomIndex = Math.floor(Math.random() * table.results.length);
    if (DEBUG) console.log(`Selecting random result at index ${randomIndex} from table with ${table.results.length} results.`);
    const result = table.results[randomIndex];
    if (!result || result.value === undefined || result.value === null) {
       // console.error(`Error: Invalid result at index ${randomIndex}. Result:`, result);
        return result;
    }
    return result.value;
}


// Serve HTML file
app.get('/', (req, res) => {
    if (DEBUG) console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (DEBUG) console.log('Debugging is enabled.');
});
