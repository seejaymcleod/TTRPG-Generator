
import { describe, it, expect, beforeAll } from 'vitest';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';

describe('Knave Content Debug', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        loader.loadFromJSON(path.join(process.cwd(), 'dist', 'tables.json'));
        renderer = new Renderer(loader);
    });

    it('should inspect Knave City Events structure', () => {
        const table = loader.findTable('Knave_CityEvents');
        console.log('Knave_CityEvents results sample:', table?.results?.slice(0, 5));

        // Generate one.
        const res = renderer.generate('Knave_CityEvents');
        console.log('Generate Result:', res.result);

        expect(res.result).not.toContain('[object Object]');
    });
});
