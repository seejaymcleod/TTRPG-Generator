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

    loadFromDirectory(dir: string): void {
        const files = this.getFilesRecursively(dir);
        for (const file of files) {
            if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    let doc = yaml.load(content);

                    if (doc) {
                        const filename = path.basename(file);

                        // Handle array of tables (e.g. ATest_AllFeatures.yaml)
                        if (Array.isArray(doc)) {
                            // Index the file by the first table (best effort)
                            if (doc.length > 0 && typeof doc[0] === 'object') {
                                this.tablesByFilename.set(filename, doc[0]);
                            }

                            doc.forEach((t: any) => {
                                if (t && typeof t === 'object') {
                                    t.filename = filename;
                                    this.allTables.push(t);
                                    if (t.tablename) {
                                        this.tablesByName.set(t.tablename, t);
                                    }
                                }
                            });
                        }
                        // Handle single table
                        else if (typeof doc === 'object') {
                            const table = doc as Table;
                            table.filename = filename;
                            this.tablesByFilename.set(filename, table);
                            this.allTables.push(table);

                            if (table.tablename) {
                                this.tablesByName.set(table.tablename, table);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load ${file}:`, e);
                }
            }
        }
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
