
import { describe, it, expect, beforeAll } from 'vitest';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';

describe('Circular Reference Check', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        // loader.loadFromJSON(path.join(process.cwd(), 'dist', 'tables.json'));
        // Mock a table that triggers the issue
        loader.findTable = (name: string) => {
            if (name === 'CircularTest') return {
                tablename: 'CircularTest',
                filename: 'CircularTest.yaml',
                results: ["[{thisResult}]"]
            } as any;
            return undefined;
        };
        renderer = new Renderer(loader);
    });

    it('should not create circular references in sequential arrays', () => {
        const result = renderer.generate("CircularTest");
        console.log("Result:", result.result);

        // Try to stringify. This throws if circular.
        expect(() => JSON.stringify(result.result)).not.toThrow();

        // Expect result[0] to be [] (empty array), not the array itself.
        const arr = result.result as any[];
        expect(Array.isArray(arr)).toBe(true);
        expect(Array.isArray(arr[0])).toBe(true);
        expect(arr[0]).not.toBe(arr); // identity check
        expect(arr[0]).toEqual([]);
    });
});
