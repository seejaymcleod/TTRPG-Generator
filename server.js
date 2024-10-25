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
        const results = [];
        for (let i = 0; i < number; i++) {
            const result = generateResultsFromTables(selectedTable.tables || selectedTable.subTables);
            if (Array.isArray(result)) {
                result.forEach(item => {
                    item.address = `${selectedTable.filename}/${selectedTable.tablename || 'Unnamed table'}${item.header ? '/' + item.header : ''}`;
                });
                results.push(...result);
            } else {
                result.address = `${selectedTable.filename}/${selectedTable.tablename || 'Unnamed table'}`;
                results.push(result);
            }
        }

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
function generateResultsFromTables(tables, parentHeader = '') {
    if (DEBUG) console.log('Generating results from nested tables:', tables);
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

            const weightedResult = getWeightedRandomResult(table);
            if (DEBUG) console.log(`Selected weighted result: "${weightedResult}"`);
            results.push({ header, result: weightedResult });
        } else if (table.subTables) {
            if (DEBUG) console.log('Table has subtables:', table.subTables);
            const subResults = generateResultsFromTables(table.subTables, header);
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

        // Handle customDisplay if present
        if (table.customDisplay) {
            const customDisplayText = table.customDisplay.replace(/\{(.*?)\}/g, (match, subTableName) => {
                const subTable = tables.find(t => t.name === subTableName.trim());
                if (subTable) {
                    const subResult = getWeightedRandomResult(subTable);
                    return subResult;
                }
                return match; // If subtable not found, return the original placeholder
            });
            results.push({ header: 'Custom Display', result: customDisplayText });
        }
    });

    return results;
}

// New function for selecting a weighted random result
function getWeightedRandomResult(table) {
    let weightedEntries = [];
    table.results.forEach(entry => {
        if (!entry.value) {
            console.error('Invalid entry:', entry);
            return;
        }
        const [text, weightIndicator] = entry.value.split('^');
        const weight = weightIndicator ? parseInt(weightIndicator.trim(), 10) : 1;
        for (let i = 0; i < weight; i++) {
            weightedEntries.push(text.trim());
        }
    });

    if (weightedEntries.length === 0) {
        console.error('Error: No valid entries found for weighting.');
        return 'Error: No valid entries found';
    }

    const randomIndex = Math.floor(Math.random() * weightedEntries.length);
    return weightedEntries[randomIndex];
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
