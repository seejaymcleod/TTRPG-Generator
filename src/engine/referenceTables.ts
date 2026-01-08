// src/engine/referenceTables.ts
import { ReferenceTable } from './types';

export class ReferenceTableHandler {
    lookup(table: ReferenceTable, key: string | number): string {
        const strKey = String(key);
        const numKey = parseFloat(strKey);
        const isNum = !isNaN(numKey);

        for (const entry of table.entries) {
            // Check exact string match
            if (String(entry.key) === strKey) return entry.value;

            // Check exact number match
            if (isNum && parseFloat(String(entry.key)) === numKey) return entry.value;

            // Check Range "6-12"
            if (isNum && typeof entry.key === 'string' && entry.key.includes('-') && !entry.key.startsWith('-')) {
                const parts = entry.key.split('-');
                if (parts.length === 2) {
                    const min = parseFloat(parts[0]);
                    const max = parseFloat(parts[1]);
                    if (!isNaN(min) && !isNaN(max) && numKey >= min && numKey <= max) {
                        return entry.value;
                    }
                }
            }

            // Check Inequality "<=3" or "13<=" (>=13)
            if (isNum && typeof entry.key === 'string') {
                if (entry.key.startsWith('<=')) {
                    const val = parseFloat(entry.key.substring(2));
                    if (!isNaN(val) && numKey <= val) return entry.value;
                } else if (entry.key.endsWith('<=')) { // Note: Spec says "13<=" for >=
                    const val = parseFloat(entry.key.substring(0, entry.key.length - 2));
                    if (!isNaN(val) && numKey >= val) return entry.value;
                }
                // Handle ">=" standard notation as well if needed, but spec says "13<="
            }
        }

        return "[Reference lookup failed]";
    }
}
