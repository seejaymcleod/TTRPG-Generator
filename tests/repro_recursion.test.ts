
import { describe, it, expect, beforeAll } from 'vitest';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';

describe('Infinite Recursion Reproduction', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        // Assuming dist/tables.json is populated. If not, we might need to load individual files if the loader supports it.
        // But the existing test does this, so we'll stick to it.
        try {
            loader.loadFromJSON(path.join(process.cwd(), 'dist', 'tables.json'));
        } catch (e) {
            console.error("Failed to load tables.json. Ensure 'npm run build' has been run or tables.json exists.");
        }
        renderer = new Renderer(loader);
    });

    it('should generate Character Bonds without recursion error', () => {
        const result = renderer.generate("Cairn_CharacterBonds");
        const str = JSON.stringify(result);
        expect(str).not.toContain('recursion protection hit');
        expect(result.result).not.toContain('Recursion Limit Hit');
    }, 5000);

    it('should generate Custom NPC without recursion error', () => {
        let result = renderer.generate("Custom_NPC", {});
        if (result.result.toString().startsWith("[Table Custom_NPC not found]")) {
            result = renderer.generate("NPC");
        }

        const str = JSON.stringify(result);
        if (str.includes('Recursion Limit Hit')) {
            console.error("Recursion Limit Hit in Custom NPC:", str);
        }

        expect(result.result).not.toContain('Recursion Limit Hit');
    }, 5000);
});
