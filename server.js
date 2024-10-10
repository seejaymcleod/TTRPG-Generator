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
function generateFromList(table, number, isTopLevel = true) {
    const results = [];
    const tableName = table.name || table.tablename || 'Unnamed Table';
    log(`Starting generation from table: ${tableName} with number: ${number}`);

    for (let i = 0; i < number; i++) {
        let result = "";
        log(`Processing table: ${tableName}, iteration: ${i + 1}`);

        if (table.results && Array.isArray(table.results) && table.results.length > 0) {
            // Generate a random result from main table results if available
            const randomIndex = Math.floor(Math.random() * table.results.length);
            const entry = table.results[randomIndex];
            result = extractResultValue(entry);
            log(`Selected entry from results (index: ${randomIndex}): ${result}`);
        } else if (table.tables && Array.isArray(table.tables) && table.tables.length > 0) {
            // Handle multiple tables at the top level
            log(`Processing nested tables in: ${tableName}`);
            const nestedResults = table.tables.map((nestedTable, index) => {
                log(`Processing nested table ${index + 1}: ${nestedTable.name || 'Unnamed Nested Table'}`);
                return generateFromList(nestedTable, 1, false)[0];
            });
            result = nestedResults.filter(part => part).join(' ');
        } else if (table.subtables && Array.isArray(table.subtables) && table.subtables.length > 0) {
            // Handle subtables
            log(`Processing subtables in: ${tableName}`);
            const parts = table.subtables.map((subtable, index) => {
                const subtableResult = generateFromSubtable(subtable);
                log(`Generated subtable result from subtable ${index + 1}: ${subtableResult}`);
                return subtableResult;
            });

            if (table.actiontype === 'SameLineWithSpace') {
                result = parts.filter(part => part).join(' ');
            } else if (table.actiontype === 'SameLineWithNoSpace') {
                result = parts.filter(part => part).join('');
            } else {
                result = parts.filter(part => part).join(' ');
            }
        } else {
            log(`Table ${tableName} has no valid results or subtables`);
            result = 'No valid results found';
        }

        log(`Result before adding index for iteration ${i + 1}: ${result}`);
        if (isTopLevel) {
            results.push(`(${i + 1}) ${result}`); // Ensure numbering is applied only once at the top level
        } else {
            results.push(result); // No numbering for nested tables
        }
    }

    log(`Final generated results for table ${tableName}: ${results}`); // Debugging final results
    return results; // Keep as an array of strings
}

// Helper function to generate from a subtable
function generateFromSubtable(subtable) {
    const subtableName = subtable.name || subtable.tablename || 'Unnamed Subtable';
    log(`Processing subtable: ${subtableName}`);

    if (subtable.results && Array.isArray(subtable.results) && subtable.results.length > 0) {
        // Generate a random result from subtable results if available
        const randomIndex = Math.floor(Math.random() * subtable.results.length);
        const entry = subtable.results[randomIndex];
        const result = extractResultValue(entry);
        log(`Selected entry from subtable results (index: ${randomIndex}): ${result}`);
        return result;
    } else if (subtable.subtables && Array.isArray(subtable.subtables) && subtable.subtables.length > 0) {
        // Handle nested subtables
        log(`Processing nested subtables in subtable: ${subtableName}`);
        const nestedResults = subtable.subtables.map((nestedSubtable, index) => {
            log(`Processing nested subtable ${index + 1}: ${nestedSubtable.name || 'Unnamed Nested Subtable'}`);
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
        if (entry.type === 'NPC') {
            // Example handling for NPC results with proper formatting
            const npcDetails = `
Identifier: ${entry.identifier || 'Unknown'}
NPC Name: ${entry.name || 'Unknown'}
Ancestry: ${entry.ancestry || 'Unknown'}
Alignment: ${entry.alignment || 'Unknown'}
Age: ${entry.age || 'Unknown'}
Wealth: ${entry.wealth || 'Unknown'}
Appearance: ${entry.appearance || 'Unknown'}
Does: ${entry.does || 'Unknown'}
Secrets: ${entry.secrets || 'Unknown'}
Occupation: ${entry.occupation || 'Unknown'}
            `.trim();
            log(`Extracted NPC details: ${npcDetails}`);
            return npcDetails;
        } else if (entry.value) {
            log(`Extracted value from object: ${entry.value}`);
            return entry.value;
        } else if (entry.description) {
            log(`Extracted description from object: ${entry.description}`);
            return entry.description;
        } else if (entry.results) {
            log(`Extracted results from object: ${entry.results}`);
            return entry.results;
        } else {
            log(`Complex object with no simple value`);
            return 'Complex object with no simple value';
        }
    } else if (typeof entry === 'string' || typeof entry === 'number') {
        log(`Extracted primitive value: ${entry}`);
        return entry;
    } else {
        log(`Default result for unrecognized entry type`);
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
                log(`Generated results (final): ${results}`); // Debugging the generated results
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ results }));
                log(`Response sent with generated values.`); // Debugging after sending response
            } catch (error) {
                log(`Error generating data: ${error.message}`);
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
    });