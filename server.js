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
        const results = generateResultsFromTables(selectedTable, number);
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

// Function to generate results from nested tables
function generateResultsFromTables(table, numberOfGenerations) {
    if (DEBUG) console.log('Generating results from table:', JSON.stringify(table, null, 2));
    if (!table.results && !table.tables) {
        console.warn('No results or subTables found for generation.');
        return [{ header: 'Error', result: 'No valid entries found' }];
    }

    let results = [];
    for (let i = 0; i < numberOfGenerations; i++) {
        const result = processTable(table);
        if (result) {
            results.push(result);
        }
    }
    return results;
}

// Function to process an individual table or sub-table
function processTable(table, parentHeader = '') {
    if (DEBUG) console.log('Processing table:', JSON.stringify(table, null, 2));

    const header = table.name || table.tablename || parentHeader;
    let results = [];

    if (table.results && Array.isArray(table.results) && table.results.length > 0) {
        if (DEBUG) console.log('Table has results. Proceeding to get a weighted result.');
        const weightedResult = getWeightedRandomResult(table);
        if (DEBUG) console.log('Selected weighted result:', weightedResult);
        return { header, result: weightedResult };
    } else if (table.tables && Array.isArray(table.tables)) {
        if (DEBUG) console.log('Table has subTables. Processing each subTable:', header);
        table.tables.forEach((subTable, index) => {
            if (DEBUG) console.log(`Processing subTable ${index + 1} of ${table.tables.length}:`, JSON.stringify(subTable, null, 2));
            const subResult = processTable(subTable, header);
            if (subResult) {
                results.push(subResult);
            }
        });
    } else {
        console.warn('Table does not have results or tables:', JSON.stringify(table, null, 2));
    }

    return results.length > 0 ? results[0] : null;
}

// New function for selecting a weighted random result
function getWeightedRandomResult(table) {
    if (DEBUG) console.log('Getting weighted random result from table:', JSON.stringify(table, null, 2));
    let weightedEntries = [];
    table.results.forEach((entry, index) => {
        if (typeof entry !== 'string') {
            console.error(`Invalid entry at index ${index}: Expected a string but got`, JSON.stringify(entry, null, 2));
            return;
        }
        const [text, weightIndicator] = entry.split('^');
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
