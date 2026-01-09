
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import { GeneratedResult } from '../src/engine/types';

const ERROR_MARKERS = [
    'undefined',
    'null',
    '[object Object]',
    'NaN',
    'not found', // "[Table ...] not found"
    'Invalid',   // "Invalid syntax"
];

describe('Comprehensive Content Verification', () => {
    let loader: TableLoader;
    let renderer: Renderer;
    let allTables: any[] = [];

    beforeAll(() => {
        const jsonPath = path.join(process.cwd(), 'dist', 'tables.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("dist/tables.json missing. Run 'npm run build:tables' first.");
        }
        loader = new TableLoader();
        loader.loadFromJSON(jsonPath);
        renderer = new Renderer(loader, 'verify-seed');
        allTables = loader.getAllTables();
    });

    it('should load tables', () => {
        expect(allTables.length).toBeGreaterThan(0);
        console.log(`\n🔍 Verifying ${allTables.length} tables...\n`);
    });

    // We can iterate and dynamically create tests, but Vitest might prefer static structure.
    // However, looping inside one test allows continuing on failure if we handle expect carefully,
    // or we can use `test.each` if we can prepare the list beforehand.
    // Let's use a loop inside a test to gather all failures, or simple `it.each` if possible.
    // Since we need to load data first, `it.each` might be tricky before `beforeAll` runs? 
    // Actually, we can just fail the single huge test or loop and collect errors.

    it('verify all tables generate valid content', () => {
        const failures: string[] = [];
        const warnings: string[] = [];

        allTables.forEach(table => {
            // content-verify only root tables or meaningful subtables?
            // Root tables usually have filenames.
            if (!table.filename) return;

            // Skip "Test" tables if we want clean output, but user wants comprehensive.
            // checking 'tablename' used for lookup.
            const tableName = table.tablename || table.name || 'Unknown';
            const id = `${table.filename} :: ${tableName}`;

            try {
                // Generates result
                const result = renderer.generate(tableName, {});
                const resultStr = JSON.stringify(result.result);

                // Check for error markers
                const foundError = ERROR_MARKERS.find(m => resultStr.includes(m));
                if (foundError) {
                    failures.push(`[${id}] Generated '${resultStr}' containing error marker '${foundError}'`);
                }

                // Verify Reroll capabilities if applicable
                // If the result indicates it came from a table (it should), try rerolling it.
                // NOTE: `generate` returns { header, result, _tableName, ... }
                // We typically reroll based on `_tableName` or matching header.

                if (result._tableName) {
                    try {
                        // We need a context for reroll? usually empty is fine.
                        // We need to look up the table to reroll FROM.
                        // The renderer.reroll takes (table, header, context).
                        // If `result._tableName` is present, we can look that up.

                        const originTable = loader.findTable(result._tableName);
                        if (originTable) {
                            // Can we find the specific subtable if it was a subresult?
                            // renderer.reroll uses 'header' to find subtable.

                            // If the result header suggests a subtable, try to find it.
                            if (result.header && result.header !== originTable.tablename) {
                                // Try rerolling this specific header
                                // Cast to Table since reroll expects it (SubTable extends Table conceptually)
                                const rerollRes = renderer.reroll(originTable as any, result.header, {});
                                const rerollStr = JSON.stringify(rerollRes.result);
                                const foundRerollError = ERROR_MARKERS.find(m => rerollStr.includes(m));
                                if (foundRerollError) {
                                    failures.push(`[${id}] Reroll of '${result.header}' failed: ${rerollStr}`);
                                }
                            }
                        } else {
                            // Warnings for internal logic consistency? 
                            // warnings.push(`[${id}] Could not find table '${result._tableName}' for reroll check.`);
                        }
                    } catch (e: any) {
                        failures.push(`[${id}] Reroll threw exception: ${e.message}`);
                    }
                }

            } catch (e: any) {
                failures.push(`[${id}] Exception during generation: ${e.message}`);
            }
        });

        if (failures.length > 0) {
            console.error("\n❌ CONTENT VERIFICATION FAILED:\n");
            failures.forEach(f => console.error(f));
            // Fail the test
            expect(failures.length).toBe(0);
        } else {
            console.log("✅ All tables verified successfully.");
        }
    });

    // Optional: Check specific known broken refs user might care about?
    // The generic loop covers most.
});
