
import { describe, it, expect, beforeAll } from 'vitest';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';

describe('Reproduction of User Issues', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        loader.loadFromJSON(path.join(process.cwd(), 'dist', 'tables.json'));
        renderer = new Renderer(loader);
    });

    it('should handle probability syntax {Table, 0.5}', () => {
        // ShadowDark NPC NameBySyllable uses structure like [{Syllable1}{Syllable2, 0.5}]
        const result = (renderer as any).processStringRecursive("{Syllable2, 0.5}", { _currentTable: { tablename: "Test", results: [] } as any }, { depth: 0, tables: new Set(), maxDepth: 10 });
        console.log("Probability Result:", result);
        expect(result).not.toContain("not found");
        // It should be either empty string or a result from Syllable2
    });

    it('should handle division by zero gracefully', () => {
        const result = (renderer as any).processStringRecursive("{100 / 0}", {}, { depth: 0, tables: new Set(), maxDepth: 10 });
        console.log("DivByZero Result:", result);
        // Should be 0 based on expr.ts fallback
        expect(Number(result)).toBe(0);
    });
});
