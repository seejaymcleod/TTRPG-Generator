
import { Renderer } from '../src/engine/renderer';
import { TableLoader } from '../src/engine/loader';
import { RecursionTracker } from '../src/engine/types';

class MockLoader extends TableLoader {
    constructor() { super("Tables"); }
    findTable(name: string) { return null; }
    getAllTables() { return []; }
}

const renderer = new Renderer(new MockLoader());
const tracker: RecursionTracker = { depth: 0, tables: new Set(), counts: new Map(), maxDepth: 30 };

try {
    console.log("Starting debug...");
    const input = "Roll 1d6: {1d6}";
    console.log(`Input: "${input}"`);

    // Access private method via 'any' cast (naughty but useful for debug)
    const result = (renderer as any).processStringRecursive(input, {}, tracker);

    console.log("Result:", result);
} catch (e) {
    console.error("Crash:", e);
}
