
import path from 'path';
import fs from 'fs';
import { TableLoader } from './src/engine/loader';

const jsonPath = path.join(process.cwd(), 'dist', 'tables.json');
const loader = new TableLoader();
loader.loadFromJSON(jsonPath);

const shops = loader.findTable("Shops");
console.log("Shops found?", !!shops);

if (shops) {
    const types = loader.findSubTable(shops, "Types");
    console.log("Types found?", !!types);
    if (types) {
        console.log("Types subtables:", types.subTables?.map(t => t.tablename));

        // Check lookup
        const poor = loader.findSubTable(types, "Poor Shops");
        console.log("Poor Shops found in Types?", !!poor);

        const standard = loader.findSubTable(types, "Standard Shops");
        console.log("Standard Shops found in Types?", !!standard);
    }
}
