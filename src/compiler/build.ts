
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { FileSchema, TableDefinition } from './schema';
import { z } from 'zod';

const TABLES_DIR = path.join(process.cwd(), 'Tables');
const DIST_DIR = path.join(process.cwd(), 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'tables.json');

// Ensure dist exists
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR);
}

function getFilesRecursively(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFilesRecursively(filePath));
        } else {
            if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                results.push(filePath);
            }
        }
    });
    return results;
}

function processTable(table: any, parentName: string, index: number) {
    if (!table.tablename) {
        // Zod default might have set it to ""
        table.tablename = `${parentName}_SubTable_${index + 1}`;
    }

    // 1. Process Results for Shorthand Weights ("Item ^5")
    if (table.results && Array.isArray(table.results)) {
        table.results = table.results.map((entry: any) => {
            if (typeof entry === 'string') {
                const match = entry.match(/^(.+?)\s*\^(\d+(?:\.\d+)?)$/);
                if (match) {
                    const content = match[1];
                    const weight = parseFloat(match[2]);
                    // Convert to local tuple format [value, weight] which engine supports
                    // OR object format if schema supports it. Engine checks for Array(2) with number.
                    return [content, weight];
                }
            }
            return entry;
        });
    }

    // Iterate subTables and tables
    const recursables = ['tables', 'subTables'];
    recursables.forEach(key => {
        if (table[key] && Array.isArray(table[key])) {
            table[key].forEach((sub: any, i: number) => {
                processTable(sub, table.tablename, i);
            });
        }
    });

    // Also inject filename into subtables if useful? 
    // Types.ts says SubTable has optional filename.
    // Let's keep it simple for now.
}

function build() {
    console.log('🏗️  Building Tables...');
    const files = getFilesRecursively(TABLES_DIR);
    const allTables: TableDefinition[] = [];
    let errors = 0;

    files.forEach(file => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const doc = yaml.load(content);
            const filename = path.basename(file);

            // 1. Validate Structure
            const parsed = FileSchema.parse(doc);

            // 2. Normalize to array of tables
            const tables = Array.isArray(parsed) ? parsed : [parsed];

            tables.forEach((table) => {
                // Feature: Inject Filename for indexing
                (table as any).filename = filename;

                // Feature: Split comma-separated types
                if (typeof (table as any).type === 'string' && (table as any).type.includes(',')) {
                    (table as any).type = (table as any).type.split(',').map((t: string) => t.trim());
                }

                // Recursive processing to fix missing tablenames
                processTable(table, filename.replace(/\.(yaml|yml)$/, ''), 0);

                allTables.push(table);
            });
        } catch (e: any) {
            console.error(`❌ Failed to process ${path.relative(process.cwd(), file)}`);
            errors++;
            if (e instanceof z.ZodError) {
                (e as any).issues.forEach((err: any) => {
                    console.error(`   [${err.path.join('.')}] ${err.message}`);
                });
            } else {
                console.error(`   ${e.message}`);
                console.error(e); // Log full error for non-zod errors
            }
        }
    });

    if (errors > 0) {
        console.error(`\n💥 Build failed with ${errors} errors.`);
        process.exit(1);
    }

    // 3. Write Output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allTables, null, 2));
    console.log(`\n✨ Build Complete!`);
    console.log(`   Processed ${files.length} files.`);
    console.log(`   Generated ${allTables.length} tables.`);
    console.log(`   Output: ${OUTPUT_FILE}`);
}

build();
