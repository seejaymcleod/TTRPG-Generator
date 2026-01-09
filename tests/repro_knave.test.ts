
import { describe, it, expect, beforeAll } from 'vitest';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';

describe('Knave Object Object Reproduction', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        loader.loadFromJSON(path.join(process.cwd(), 'dist', 'tables.json'));
        renderer = new Renderer(loader);
    });

    it('should generate City Events without [object Object]', () => {
        for (let i = 0; i < 50; i++) {
            const result = renderer.generate("Knave_CityEvents");
            const str = JSON.stringify(result.result);
            if (str.includes('[object Object]')) {
                console.log("Found error in City Events:", str);
            }
            expect(str).not.toContain('[object Object]');
        }
    });

    it('should generate Delusions without [object Object]', () => {
        for (let i = 0; i < 50; i++) {
            const result = renderer.generate("Knave_Delusions");
            const str = JSON.stringify(result.result);
            if (str.includes('[object Object]')) {
                console.log("Found error in Delusions:", str);
            }
            expect(str).not.toContain('[object Object]');
        }
    });

    it('should generate Forms without [object Object]', () => {
        for (let i = 0; i < 50; i++) {
            const result = renderer.generate("Knave_Forms");
            const str = JSON.stringify(result.result);
            if (str.includes('[object Object]')) {
                console.log("Found error in Forms:", str);
            }
            expect(str).not.toContain('[object Object]');
        }
    });
});
