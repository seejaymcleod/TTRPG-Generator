// src/engine/normalize.ts
// Pure helper to normalize table schemas and subtables without Node fs/path dependencies.

export function normalizeTable(table: any, filename: string): void {
    table.filename = filename;
    if (typeof table.type === 'string' && table.type.includes(',')) {
        table.type = table.type.split(',').map((t: string) => t.trim());
    }
    normalizeSubTable(table, filename.replace(/\.(yaml|yml)$/, ''), 0);
}

export function normalizeSubTable(table: any, parentName: string, index: number): void {
    if (!table.tablename) {
        table.tablename = `${parentName}_SubTable_${index + 1}`;
    }

    // Shorthand weights: "Item ^5" → ["Item", 5]
    if (Array.isArray(table.results)) {
        table.results.forEach((entry: unknown, i: number) => {
            if (typeof entry !== 'string') return;
            const match = entry.match(/^(.+?)\s*\^(\d+(?:\.\d+)?)$/);
            if (match) table.results[i] = [match[1], parseFloat(match[2])];
        });
    }

    for (const key of ['tables', 'subTables']) {
        if (Array.isArray(table[key])) {
            table[key].forEach((sub: any, i: number) => {
                if (sub && typeof sub === 'object') normalizeSubTable(sub, table.tablename, i);
            });
        }
    }
}
