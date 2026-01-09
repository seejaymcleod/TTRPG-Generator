
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import path from 'path';
import fs from 'fs';

// Ensure tables.json exists
const tablesPath = path.join(__dirname, '../dist/tables.json');
if (!fs.existsSync(tablesPath)) {
    console.error("tables.json not found, please rebuild"); // assume built
    process.exit(1);
}

const loader = new TableLoader();
loader.loadFromJSON(tablesPath);

const renderer = new Renderer(loader, undefined, 2000); // 2s timeout for speed

console.log("Starting generation...");
try {
    const res = renderer.generate("AllFeaturesTest");
    console.log("Done!");
} catch (e: any) {
    console.error("Caught:", e.message);
}
