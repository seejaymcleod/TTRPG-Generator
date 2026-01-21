
import path from 'path';
import fs from 'fs';
import { TableLoader } from './src/engine/loader';

const jsonPath = path.join(process.cwd(), 'dist', 'tables.json');
const loader = new TableLoader();
loader.loadFromJSON(jsonPath);

const tables = loader.getAllTables();
console.log(`Loaded ${tables.length} tables.`);
const keys = tables.map(t => t.tablename || t.name).filter(x => x).sort();
const allKeys = keys.join('\n');
fs.writeFileSync('all_keys.txt', allKeys);
console.log("Wrote keys to all_keys.txt");
