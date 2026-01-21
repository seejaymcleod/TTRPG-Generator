
import path from 'path';
import fs from 'fs';
import { TableLoader } from './src/engine/loader';

const jsonPath = path.join(process.cwd(), 'dist', 'tables.json');
const loader = new TableLoader();
loader.loadFromJSON(jsonPath);

const wealth = loader.findTable("Wealth");
const poorShops = loader.findTable("Poor Shops");

console.log("Wealth found globally?", !!wealth);
console.log("Poor Shops found globally?", !!poorShops);

if (wealth) console.log("Wealth source:", wealth.filename || "In-memory");

const allKeys = loader.getAllTables().map(t => t.tablename || t.name);
console.log("Total tables:", allKeys.length);
console.log("Contains 'Wealth'?", allKeys.includes("Wealth"));
