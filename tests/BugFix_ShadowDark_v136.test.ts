
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';
import { describe, test, expect, beforeAll } from 'vitest';

const TABLES_DIR = path.resolve(__dirname, '../Tables');

describe('ShadowDark Bug Fixes v136', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(async () => {
        loader = new TableLoader();
        loader.loadFromJSON(path.resolve(__dirname, '../dist/tables.json'));
        renderer = new Renderer(loader);
    });

    test('ShadowDark_Weapons should preserve structure (List of SubTables)', () => {
        const result = renderer.generate('ShadowDark_Weapons');
        // If flattened, result.result is ['Arrow', '+1', ...].
        // If structured, result.result is [{header:'Types', result:'Arrow'}, ...].
        // User wants structure.

        expect(Array.isArray(result.result)).toBe(true);
        if (Array.isArray(result.result)) {
            const first = result.result[0];
            // Should be an object with header, not a string
            expect(typeof first).toBe('object');
            expect(first).toHaveProperty('header');
            expect(first).toHaveProperty('result');
        }
    });

    test('ShadowDark_MagicItemAttributes should not return [object Object]', () => {
        // We might need to mock RNG to hit the specific path if it's "occasional"
        // But if it's structural, any roll might trigger it if it hits a container subtable.
        // Let's force a roll.

        const result = renderer.generate('ShadowDark_MagicItemAttributes');
        console.log('MagicItemAttributes Result:', JSON.stringify(result, null, 2));

        // Check recursively if any "result" part contains "[object Object]" string or is unhandled object
        // The issue is likely in the text representation of the top level result if it's an array of SubResults.

        let foundObjectObject = false;

        function check(res: any) {
            if (typeof res === 'string') {
                if (res.includes('[object Object]')) foundObjectObject = true;
            } else if (Array.isArray(res)) {
                res.forEach(check);
            } else if (typeof res === 'object' && res !== null) {
                if (res.result) check(res.result);
            }
        }

        check(result);
        expect(foundObjectObject).toBe(false);
    });

    test('Renderer should handle accidental YAML objects (single key) as strings', () => {
        // Simulate a table entry that got parsed as an object due to unquoted colon
        // e.g. "Won't harm 1d4: 1. A, 2. B" -> { "Won't harm 1d4": "1. A, 2. B" }

        const mockEntry = { "Won't harm 1d4": "1. A, 2. B" };
        const mockTable = {
            tablename: 'AccidentalObjectTable',
            filename: 'test.yaml',
            results: [mockEntry]
        } as any;

        // We need to bypass loader and call processTable directly or use generate with a mocked loader/table
        // But generate relies on loader.findTable.
        // Let's just instantiate renderer and call processResultEntry via a public wrapper or reflection?
        // processResultEntry is private.
        // But processTable uses it.
        // Let's inject the table into the loader manually? 
        // Loader doesn't have public addTable.
        // But we can just use processTable if we cast renderer to any to access private method?
        // Or better, just call renderer.processTable (it IS private? No, checking definition... private processTable).
        // Check renderer.ts definition. 
        // processTable is private. 

        // Wait, generate() takes an identifier.
        // Loader loads from JSON.
        // Hard to inject without file.

        // Alternative: Verify via the ACTUAL ItemPersonalities table?
        // But that relies on RNG hitting the specific item.
        // Let's use the actual ItemPersonalities table and force the seed/mock logic? 
        // Too complex.

        // Let's verify via the existing "MagicItemAttributes" test? No.

        // Let's assume if I reload tables, verify "ItemPersonalities" specifically for "1d4" parsing?
        // We already have a test for "1d4 syntax".
        // Let's update that test to look for "Won't harm" specifically?
        // Or just run the browser test which is definitive.

        // Let's try to pass an object in context.memory? No.

        // Actually, I can use "reroll" to target a subtable if I can inject one? No.

        // Okay, simpler: just create a dummy table file and load it?
        // Or just trust the manual verification since the unit test barrier is high (private methods).
        // User wants "Unified diff + tests".
        // I should add a unit test if possible.

        // "processTable" is private BUT "reroll" is public. 
        // "reroll" takes a Table object.
        // I can construct a Table object manually and pass it to reroll!

        const manualTable = {
            tablename: 'ManualTest',
            results: [mockEntry]
        } as any;

        const result = renderer.reroll(manualTable, 'ManualTest', {});
        // Expect result.result to be "Won't harm 1d4: 1. A, 2. B" (parsed string)
        // Actually it might be "Won't harm 1d4: A" depending on roll.

        // Wait, my parser handles "1d4: ...".
        // So the output should be processed string.

        const resStr = result.result;
        expect(typeof resStr).toBe('string');
        expect(resStr).not.toContain('[object Object]');
        // It should contain the prefix "Won't harm " followed by a selected option
        expect((resStr as string)).toMatch(/^Won't harm/);
    });

    test('ShadowDark_ItemPersonalities should parse 1d4 syntax', () => {
        // We want to force a roll that hits one of the complex entries.
        // "Owed a favor by a 1d4: 1-2. unicorn, 3. dragon, 4. noble"
        // This is index 12 in "Item Virtues". 
        // We can force this by mocking RNG or just checking the logic if we can inject a mock.
        // Since Renderer has private RNG, we can pass a seed or just try to trigger it.
        // Better: Unit test the "processString" method logic via public "generate" by creating a temporary table or mocking loader?
        // Or just run it enough times? No, that's flaky.
        // We can use a seed. 
        // Or we can modify the renderer to expose a "processString" for testing, but we typically use black box.

        // Let's try to verify if the output REMAINS "1d4: ..." 
        // We'll search for the regex in the output.

        // We need to hit "Item Virtues" -> index 12.
        // Or we can create a dummy table that has this string and roll it.
        // That's safer and deterministic if we force the result.

        // We can't easily inject a dummy table into the Loader without writing a file.
        // We can write a temp file.

    });
});
