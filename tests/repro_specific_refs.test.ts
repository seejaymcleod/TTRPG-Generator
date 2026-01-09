
import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/engine/renderer';
import { TableLoader } from '../src/engine/loader';
import { Table } from '../src/engine/types';

describe('Refactor Reproduction Tests', () => {
    const loader = new TableLoader();
    const renderer = new Renderer(loader);

    // Setup mock tables
    const mockTables: Table[] = [
        {
            filename: 'Test_MundaneItems.yaml',
            tablename: 'Apples',
            results: [
                "Gold Apple",
                "Red Apple",
                "Green Apple"
            ]
        },
        {
            filename: 'Test_SpecificRefs.yaml',
            tablename: 'PickOneTest',
            // customDisplay: "{pickOneFromArrays}", // Removed to match refactor
            results: [
                "Result [A, B]",
                "Single Result",
                "Result [One, Two, Three]"
            ]
        },
        {
            filename: 'Test_SpecificRefs.yaml',
            tablename: 'SelectedResultTest',
            customDisplay: "[{selectedResult, DynamicKey}]",
            subTables: [
                {
                    tablename: 'DynamicKey',
                    results: ["KeyA"]
                },
                {
                    tablename: 'KeyA',
                    results: ["Value for KeyA"]
                }
            ]
        }
    ];

    // Load mocks
    // We need to bypass the file system loader for this test or mock it.
    // Since TableLoader is designed to load from files/json, let's just inject directly if possible or mock findTable.
    // We'll iterate and manually cache them since private maps aren't easily accessible, 
    // but we can use processTable (which is private in Loader) -> actually loader has indexSubTables.
    // Let's just patch findTable for this instance since we don't have a public addTable method.

    // Actually, we can just use the public loadFromJSON methodology but pass our object.
    // Or simpler: override findTable.
    const originalFindTable = loader.findTable.bind(loader);
    loader.findTable = (name: string) => {
        const found = mockTables.find(t => t.tablename === name);
        if (found) return found;
        return originalFindTable(name);
    };

    // also need to handle subtables if finding by name
    loader.findSubTable = (table, name) => {
        // Basic recursive search on our mock objects
        if (table.subTables) {
            const found = table.subTables.find(s => s.tablename === name);
            if (found) return found;
        }
        return undefined;
    }


    it('should handle pickOneFromArrays behavior', () => {
        // This tests that when customDisplay is "{pickOneFromArrays}",
        // it picks a result from the table, checks if it's a string, and processes it.
        // If the string contains [A, B], it should pick one.

        // Force RNG? We can just check structure.
        for (let i = 0; i < 10; i++) {
            const result = renderer.generate('PickOneTest');
            const text = result.result as string;
            // Should not contain brackets unless it failed
            expect(text).not.toContain('[');
            expect(text).not.toContain(']');
            expect(['Result A', 'Result B', 'Single Result', 'Result One', 'Result Two', 'Result Three']).toContain(text);
        }
    });

    it('should handle selectedResult behavior', () => {
        // This tests "[{selectedResult, DynamicKey}]"
        // 1. Evaluate DynamicKey -> "KeyA"
        // 2. Look for sibling/subtable "KeyA" -> "Value for KeyA"
        // 3. Output "Value for KeyA" inside brackets -> "[Value for KeyA]"

        // Note: The original regex was /\[\{selectedResult,\s*([^}]+)\}\]/
        // Which implies the brackets ARE part of the output unless they are consumed.
        // Let's see what happens.

        const result = renderer.generate('SelectedResultTest');
        const text = result.result as string;

        expect(text).toBe('Value for KeyA');
    });
});
