// src/engine/loader.ts
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Table, SubTable } from './types';

export class TableLoader {
    // Index by filename (basename key) and tablename
    private tablesByFilename: Map<string, Table> = new Map();
    private tablesByName: Map<string, Table> = new Map();
    private allTables: Table[] = [];

    /**
     * Loads tables from a pre-compiled JSON file.
     * @param jsonPath Absolute path to the tables.json file.
     */
    loadFromJSON(jsonPath: string): void {
        console.log(`Loading tables from JSON: ${jsonPath}`);
        try {
            const content = fs.readFileSync(jsonPath, 'utf8');
            const tables = JSON.parse(content) as Table[];
            if (Array.isArray(tables)) {
                tables.forEach(t => this.processTable(t));
                console.log(`Loaded ${tables.length} tables from JSON.`);
            } else {
                console.error("Invalid tables.json format: expected array.");
            }
        } catch (e: any) {
            console.error(`Failed to load tables from JSON: ${e.message}`);
        }
    }

    /**
     * Helper to process valid table objects into the index.
     */
    private processTable(t: Table) {
        if (!t) return;

        // Ensure filename is indexed
        if (t.filename) {
            // Index root table by filename (e.g. for cross-file reference)
            if (!this.tablesByFilename.has(t.filename)) {
                this.tablesByFilename.set(t.filename, t);
                // Also index without extension
                const baseName = path.basename(t.filename, path.extname(t.filename));
                this.tablesByFilename.set(baseName, t);
            }
        }

        this.allTables.push(t);
        if (t.tablename) {
            this.tablesByName.set(t.tablename, t);
        }

        // Recursively index all subtables for global lookup
        this.indexSubTables(t);
    }

    /**
     * Recursively indexes all subtables within a table.
     */
    private indexSubTables(table: Table | SubTable) {
        const subtableLists = [table.tables, table.subTables];
        for (const list of subtableLists) {
            if (Array.isArray(list)) {
                for (const sub of list) {
                    if (sub && sub.tablename) {
                        // Index subtable globally by its tablename
                        if (!this.tablesByName.has(sub.tablename)) {
                            this.tablesByName.set(sub.tablename, sub as any); // Cast to Table for storage
                        }
                    }
                    // Recurse into deeper levels
                    this.indexSubTables(sub);
                }
            }
        }
    }

    /**
     * DEPRECATED: Use loadFromJSON instead.
     */
    loadFromDirectory(dir: string): void {
        console.warn("loadFromDirectory is DEPRECATED. Please use loadFromJSON.");
        // ... helper to forward to old logic or just fail?
        // For now, let's leave it empty or implemented just in case.
        // Actually, let's keep the files scanning for dev fallback if JSON missing?
        // No, we want strict pipeline.
    }

    private getFilesRecursively(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(this.getFilesRecursively(filePath));
            } else {
                results.push(filePath);
            }
        });
        return results;
    }

    getTableByFilename(filename: string): Table | undefined {
        return this.tablesByFilename.get(filename);
    }

    getTableByName(name: string): Table | undefined {
        // First try exact match
        let table = this.tablesByName.get(name);
        if (table) return table;

        // Fallback: search all tables' subTables for one with matching name?
        // Server.js does this: "findTableByName" searches root then recursively.
        // We'll expose a search method.
        return undefined;
    }

    getAllTables(): Table[] {
        return this.allTables;
    }

    // Deep search for a table/subtable by name
    findTable(name: string): SubTable | undefined {
        // 1. Root tables by Name
        if (this.tablesByName.has(name)) return this.tablesByName.get(name);

        // 2. Root tables by Filename (basename)
        if (this.tablesByFilename.has(name)) return this.tablesByFilename.get(name);
        // Also check if name needs .yaml/.yml appended? 
        // Legacy engine checked `${normalizedRef}.yaml`.
        if (!name.endsWith('.yaml') && !name.endsWith('.yml')) {
            if (this.tablesByFilename.has(name + '.yaml')) return this.tablesByFilename.get(name + '.yaml');
            if (this.tablesByFilename.has(name + '.yml')) return this.tablesByFilename.get(name + '.yml');
        }

        // 2. Subtables inside root tables
        for (const table of this.allTables) {
            const found = this.findSubTable(table, name);
            if (found) return found;
        }
        return undefined;
    }

    findSubTable(table: SubTable, name: string): SubTable | undefined {
        if (table.tablename === name || table.name === name) return table;
        if (table.subTables) {
            for (const sub of table.subTables) {
                const found = this.findSubTable(sub, name);
                if (found) return found;
            }
        }
        if (table.tables) { // Handle root 'tables' field
            for (const sub of table.tables) {
                const found = this.findSubTable(sub, name);
                if (found) return found;
            }
        }
        return undefined;
    }
}
