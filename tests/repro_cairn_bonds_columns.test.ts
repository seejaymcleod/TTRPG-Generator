
import { describe, it, expect, beforeAll } from 'vitest';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';

describe('Cairn Character Bonds Columns Reproduction', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        try {
            loader.loadFromJSON(path.join(process.cwd(), 'dist', 'tables.json'));
        } catch (e) {
            console.error("Failed to load tables.json.");
        }
        renderer = new Renderer(loader);
    });

    it('should result in a string, not an array', () => {
        // Find the table first to be sure
        const table = loader.getAllTables().find(t => t.tablename === "Character Bonds" && t.game === "Cairn");
        expect(table).toBeDefined();

        const result = renderer.generate(table?.tablename || "Character Bonds");

        console.log("Result type:", typeof result.result);
        console.log("Result value:", JSON.stringify(result.result, null, 2));

        // Expectation: It should be a string (the HTML string from YAML)
        // If it returns an array, that explains the columns (if frontend treats array as columns/rows)
        expect(typeof result.result).toBe('string');
        expect(Array.isArray(result.result)).toBe(false);
    });
});
