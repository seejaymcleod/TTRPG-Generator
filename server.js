'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const port = process.env.PORT || 1337;
let tables = [];
let logs = [];

// Load all tables into memory
async function loadAllTables() {
    const tablesDir = path.join(__dirname, 'tables');
    const files = fs.readdirSync(tablesDir);

    for (const file of files) {
        if (file.endsWith('.yaml')) {
            const filePath = path.join(tablesDir, file);
            const fileContents = fs.readFileSync(filePath, 'utf8');
            const data = yaml.load(fileContents);
            tables.push(data);
            log(`Loaded table: ${data.tablename || 'Unnamed Table'}`);
        }
    }
}

// Log messages
function log(message) {
    logs.push(message);
    console.log(message);
}

// Generate results from the table or subtable
function generateFromList(table, number) {
    const results = [];

    for (let i = 0; i < number; i++) {
        let result = "";
        const tableName = table.name || table.tablename || 'Unnamed Table';
        log(`Processing table: ${tableName}`);
        log(`Table structure: ${JSON.stringify(table)}`);

        if (table.results && Array.isArray(table.results) && table.results.length > 0) {
            // Generate a random result from main table results if available
            const randomIndex = Math.floor(Math.random() * table.results.length);
            const entry = table.results[randomIndex];
            log(`Selected entry from results: ${extractResultValue(entry)}`);
            result = extractResultValue(entry);
        } else if (table.tables && Array.isArray(table.tables) && table.tables.length > 0) {
            // Handle multiple tables at the top level
            const nestedResults = table.tables.map(nestedTable => {
                log(`Processing nested table: ${nestedTable.name || 'Unnamed Nested Table'}`);
                return generateFromList(nestedTable, 1)[0][nestedTable.name || 'Unnamed Nested Table'];
            });
            result = nestedResults.filter(part => part).join(' ');
        } else if (table.subtables && Array.isArray(table.subtables) && table.subtables.length > 0) {
            // Handle subtables
            if (table.actiontype && table.actiontype === 'AddWithSpace') {
                // Concatenate results from subtables with spaces
                const parts = table.subtables.map(subtable => {
                    const subtableResult = generateFromSubtable(subtable);
                    log(`Generated subtable result: ${subtableResult}`);
                    return subtableResult;
                });
                result = parts.filter(part => part).join(' ');
            } else {
                // Handle subtables without specific action type
                const subtableResults = table.subtables.map(subtable => {
                    return generateFromSubtable(subtable);
                });
                result = subtableResults.filter(part => part).join(' ');
            }
        } else {
            log(`Table ${tableName} has no valid results or subtables`);
            result = 'No valid results found';
        }

        results.push({ [tableName]: result });
    }

    return results;
}

// Helper function to generate from a subtable
function generateFromSubtable(subtable) {
    const subtableName = subtable.name || subtable.tablename || 'Unnamed Subtable';
    log(`Processing subtable: ${subtableName}`);
    log(`Subtable structure: ${JSON.stringify(subtable)}`);

    if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
        // Generate a random result from subtable results if available
        const randomIndex = Math.floor(Math.random() * subtable.results.length);
        const entry = subtable.results[randomIndex];
        log(`Selected entry from subtable results: ${extractResultValue(entry)}`);
        return extractResultValue(entry);
    } else if (subtable.subtables && Array.isArray(subtable.subtables) && subtable.subtables.length > 0) {
        // Handle nested subtables
        const nestedResults = subtable.subtables.map(nestedSubtable => {
            return generateFromSubtable(nestedSubtable);
        });
        return nestedResults.filter(part => part).join(' ');
    } else {
        log(`Subtable ${subtableName} has no valid results`);
        return 'No valid results found';
    }
}

// Helper function to extract value from result
function extractResultValue(entry) {
    if (typeof entry === 'object') {
        if (entry.value) {
            return entry.value;
        } else if (entry.description) {
            return entry.description;
        } else if (entry.results) {
            return entry.results;
        } else {
            return 'Complex object with no simple value';
        }
    } else if (typeof entry === 'string' || typeof entry === 'number') {
        return entry;
    } else {
        return 'Default result';
    }
}

// Create server
const server = http.createServer(async (req, res) => {
    if (req.url === '/') {
        // Serve index.html
        fs.readFile('index.html', 'utf8', (err, html) => {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading index.html');
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        });
    } else if (req.url === '/api/tables') {
        // Serve the list of loaded tables
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tables));
    } else if (req.url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString(); // Convert Buffer to string
        });
        req.on('end', () => {
            try {
                const { table, number } = JSON.parse(body);
                log(`Received request to generate ${number} values from table: ${table.tablename || 'Unnamed Table'}`);
                const results = generateFromList(table, number);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
                log(`Generated ${number} values from table: ${table.tablename || 'Unnamed Table'}`);
            } catch (error) {
                console.error("Error generating data:", error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("Internal Server Error");
            }
        });
    } else if (req.url === '/api/logs') {
        // Serve logs
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Load tables at server start
loadAllTables()
    .then(() => {
        server.listen(port, () => {
            log(`Server running at http://localhost:${port}/`);
        });
    })
    .catch(err => log(`Error loading tables: ${err}`));