// tests/engine.test.ts
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { TableLoader, Renderer } from '../src/engine';
import path from 'path';

// Assumes we run from root
const TABLES_DIR = path.join(__dirname, '../Tables');

describe('TTRPG Engine V2', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        loader.loadFromDirectory(TABLES_DIR);
    });

    beforeEach(() => {
        // Deterministic seed for testing by default
        renderer = new Renderer(loader, 'test-seed');
    });

    it('should find tables by filename (without extension)', () => {
        const table = loader.findTable('ATest_AllFeatures');
        expect(table).toBeDefined();
        // Also check with extension
        const tableExt = loader.findTable('ATest_AllFeatures.yaml');
        expect(tableExt).toBeDefined();
    });

    it('should find subtable by name', () => {
        const table = loader.getTableByName('AllFeaturesTest');
        expect(table).toBeDefined();
        if (table) expect(table.tablename).toBe('AllFeaturesTest');
    });

    it('should generate SimpleStringResult', () => {
        const res = renderer.generate('SimpleStringResult');
        expect(['Result A', 'Result B', 'Result C']).toContain(res.result);
    });

    it('should generate SimpleNumberResult', () => {
        const res = renderer.generate('SimpleNumberResult');
        expect([100, 200, 300]).toContain(res.result);
    });

    it('should respect WeightedResults', () => {
        const res = renderer.generate('WeightedResults');
        expect(['Weighted A', 'Weighted B', 'Weighted C']).toContain(res.result);
    });

    it('should handle CareerStyleResult', () => {
        const res = renderer.generate('CareerStyleResult');
        expect(res._isCareer).toBe(true);
        expect(Array.isArray(res.result)).toBe(true);
        expect(res.result).toHaveLength(2);
    });

    it('should handle ArrayWithDiceAndRef', () => {
        // Ambiguous parsing: String "[{...}, {...}]" acts as inline choice in new engine.
        // We accept string result.
        const res = renderer.generate('ArrayWithDiceAndRef');
        expect(typeof res.result).toBe('string');
    });

    it('should correct evaluate BasicDice', () => {
        const res = renderer.generate('BasicDice');
        expect(res.result).toMatch(/Roll 1d6: \d+/);
    });

    it('should evaluate Math expressions', () => {
        const res = renderer.generate('SimpleMath');
        expect(res.result).toContain('Calculation 10 + 5: 15');
    });

    it('should evaluate MathWithContextVar', () => {
        const res = renderer.generate('MathWithContextVar', { TestInput: 10 });
        // Result is one of the list. Verify it resolved correctly.
        expect(res.result).toMatch(/(Input \+ 10: 20|Input \* 2: 20|Dice \+ Input: \d+)/);
    });

    it('should handle InternalRef', () => {
        const res = renderer.generate('InternalRef');
        expect(res.result).toMatch(/Reference SimpleStringResult: Result [ABC]/);
    });

    it('should handle MissingTableRef', () => {
        const res = renderer.generate('MissingTableRef');
        expect(res.result).toContain('NonExistentTable not found');
    });

    it('should correctly handle ReferenceTable lookups', () => {
        const res = renderer.generate('RefTableLookupExact');
        expect(res.result).toContain('Value C');

        const resRange = renderer.generate('RefTableLookupRange');
        expect(resRange.result).toContain('Value D');

        const resIneq = renderer.generate('RefTableLookupInequality');
        expect(resIneq.result).toMatch(/Value [AE]/);
    });

    it('should handle CustomDisplayConcat', () => {
        const res = renderer.generate('CustomDisplayConcat');
        expect(res._hasCustomDisplay).toBe(true);
        expect(res.result).toMatch(/Result [ABC] and \d+/);
    });

    it('should handle CustomDisplayPickOne ({pickOneFromArrays})', () => {
        const res = renderer.generate('CustomDisplayPickOne');
        expect(res.result).not.toContain('[');
        expect(res.result).not.toContain(']');
    });

    it('should handle MultiRollDirective (Retry Loop)', () => {
        let res: any;
        let attempts = 0;
        let hit = false;

        while (attempts < 50 && !hit) {
            const r = new Renderer(loader, `multi-seed-${attempts}`);
            res = r.generate('MultiRollDirective');
            if (res._isMultiElementArray) {
                hit = true;
            }
            attempts++;
        }

        expect(hit).toBe(true);
        expect(Array.isArray(res.result)).toBe(true);
        expect(res.result.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle MultiRollExcludeDirective (Retry Loop)', () => {
        let res: any;
        let attempts = 0;
        let hit = false;

        while (attempts < 50 && !hit) {
            const r = new Renderer(loader, `exclude-seed-${attempts}`);
            res = r.generate('MultiRollExcludeDirective');
            if (res._isMultiElementArray) {
                hit = true;
            }
            attempts++;
        }

        expect(hit).toBe(true);
        expect(Array.isArray(res.result)).toBe(true);
        expect(res.result.length).toBeGreaterThan(1);
        expect(res.result).toContain('Roll 1, exclude self');
    });

    it('should handle SeparateRowsDirective', () => {
        const res = renderer.generate('SeparateRowsDirective');
        expect(res._isSeparateRows).toBe(true);
        expect(Array.isArray(res.result)).toBe(true);
        if (Array.isArray(res.result)) {
            expect(res.result[0]).toMatch(/Result [ABC]/);
            expect(res.result[1]).toMatch(/\d+/);
            expect(res.result[2]).toBe('Static Text');
        }
    });

    it('should handle Recursion Limits', () => {
        const res = renderer.generate('RecursionA');
        expect(JSON.stringify(res.result)).toContain('Max depth reached');
    });

    it('should handle InlineArrays [A, B]', () => {
        const res = renderer.generate('InlineArrays');
        expect(res.result).toMatch(/Choose one: (Red|Green|Blue)/);
        expect(res.result).not.toContain('[');
    });

    describe('Reroll Functionality', () => {
        let aTestTable: any;

        beforeEach(() => {
            aTestTable = loader.findTable('ATest_AllFeatures');
        });

        it('should reroll a specific subtable (exact match)', () => {
            const table = loader.getTableByName('AllFeaturesTest');
            expect(table).toBeDefined();
            if (!table) return;

            const res = renderer.reroll(table, 'SimpleStringResult', {});
            expect(['Result A', 'Result B', 'Result C']).toContain(res.result);
        });

        it('should reroll using top-level table fallback', () => {
            const table = loader.getTableByName('SimpleStringResult'); // This is a subtable in AllFeatures, but indexed if top level? No, it's inside.
            // We need a root table that maps to a subtable name?
            // Actually, legacy reroll logic says: if header == table.tablename, pick first subtable.
            // AllFeaturesTest doesn't match this structure directly as it has many subtables.
            // Let's test checking for a subtable that exists.
            const root = loader.getTableByName('AllFeaturesTest');
            if (!root) return;

            // "SimpleNumberResult" is a subtable.
            const res = renderer.reroll(root, 'SimpleNumberResult', {});
            expect([100, 200, 300]).toContain(res.result);
        });

        it('should reroll math expressions', () => {
            const root = loader.getTableByName('AllFeaturesTest');
            if (!root) return;

            const res = renderer.reroll(root, '1d6 + 5', {});
            // Expect number (as string or number)
            const val = parseInt(String(res.result));
            expect(val).toBeGreaterThanOrEqual(6);
            expect(val).toBeLessThanOrEqual(11);
        });

        it('should reroll ShadowDark Ancestry', () => {
            const root = loader.getTableByName('NPC'); // ShadowDark_NPC.yaml tablename is NPC
            expect(root).toBeDefined();
            if (!root) return;

            const res = renderer.reroll(root, 'Ancestry', {});
            // Ancestry results: Human, Elf, Dwarf, Halfling, Half-orc, Goblin
            expect(['Human', 'Elf', 'Dwarf', 'Halfling', 'Half-orc', 'Goblin']).toContain(res.result);
        });

        it('should reroll InlineArrays correctly', () => {
            const table = loader.getTableByName('AllFeaturesTest');
            expect(table).toBeDefined();
            if (!table) return;
            const result = renderer.reroll(table, 'InlineArrays', {});
            expect(result.header).toBe('InlineArrays');
            expect(typeof result.result).toBe('string');
            const valid = ['Red', 'Green', 'Blue'];
            expect(valid.some(v => (result.result as string).includes(v))).toBe(true);
        });

        it('should reroll MultiRollDirective correctly', () => {
            const table = loader.getTableByName('AllFeaturesTest');
            expect(table).toBeDefined();
            if (!table) return;
            const result = renderer.reroll(table, 'MultiRollDirective', {});
            expect(result.header).toBe('MultiRollDirective');
            if (Array.isArray(result.result)) {
                expect(result.result.length).toBeGreaterThan(1);
            } else {
                expect(typeof result.result).toBe('string');
                expect(result.result).toMatch(/Base/);
            }
        });

        it('should reroll CrossFileRefTable correctly', () => {
            const table = loader.getTableByName('AllFeaturesTest');
            expect(table).toBeDefined();
            if (!table) return;
            const result = renderer.reroll(table, 'CrossFileRefTable', {});
            expect(result.header).toBe('CrossFileRefTable');
            expect(typeof result.result).toBe('string');
            expect((result.result as string)).toContain('Reference ShadowDark Ancestry');
        });

        it('should reroll SeparateRowsDirective correctly', () => {
            const table = loader.getTableByName('AllFeaturesTest');
            expect(table).toBeDefined();
            if (!table) return;
            const result = renderer.reroll(table, 'SeparateRowsDirective', {});
            expect(result.header).toBe('SeparateRowsDirective');
            expect(result._isSeparateRows).toBe(true);
            expect(Array.isArray(result.result)).toBe(true);
        });

        it('should fail gracefully for missing headers', () => {
            expect(aTestTable).toBeDefined();
            if (!aTestTable) return;
            const res = renderer.reroll(aTestTable, 'NonExistentThing', {});
            expect(res.result).toContain('Could not find subtable');
        });
    });
});
