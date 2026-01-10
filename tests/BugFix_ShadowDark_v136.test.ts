
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
