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
function generateResultsFromTables(tables, actionType = 'ListNoHeaders', parentHeader = '') {
    if (DEBUG) console.log('Generating results from nested tables:', tables, 'with action type:', actionType);
    if (!tables || tables.length === 0) {
        if (DEBUG) console.warn('No tables found to generate results from.');
        return 'No valid results found';
    }

    let results = [];

    tables.forEach(table => {
        if (DEBUG) console.log('Processing table:', table);
        const header = table.name || parentHeader;
        if (table.results && Array.isArray(table.results) && table.results.length > 0) {
            if (DEBUG) console.log('Table has results:', table.results);
            const randomResult = getRandomResult(table);
            results.push({ header, result: randomResult });
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


// Function to get a random result from a table
function getRandomResult(table) {
    if (DEBUG) console.log('Getting random result for table:', table.name || table.tablename);
    if (!table.results) {
        if (DEBUG) console.warn('No results found for table:', table.name || table.tablename);
        return 'No valid entries available';
    }

    const randomIndex = Math.floor(Math.random() * table.results.length);
    if (DEBUG) console.log('Random index chosen:', randomIndex, 'Random result:', table.results[randomIndex]);

    const result = table.results[randomIndex];
    return (typeof result === 'object' && result.value) ? result.value : result;
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
