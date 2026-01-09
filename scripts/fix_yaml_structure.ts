
import * as fs from 'fs';
import * as path from 'path';

const tablesDir = path.join(__dirname, '../Tables');

function getAllFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            if (file.endsWith('.yaml')) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Simple heuristic: 
    // If it has "tables:"
    // AND it has "- results:" immediately indented under it
    // AND it DOES NOT have multiple "- " items under tables (checking indent)
    // AND checks if root has "results:" (if it does, it's mixed, skip)

    // Check for root results
    if (/^results:/m.test(content)) {
        return; // Already valid or mixed
    }

    // Check for tables
    const tablesMatch = content.match(/^tables:\s*$/m);
    if (!tablesMatch) return;

    // Find line number of tables:
    const tablesIndex = lines.findIndex(l => l.match(/^tables:\s*$/));
    if (tablesIndex === -1) return;

    // Look at next lines
    // We expect:
    // tables:
    //   - results:
    // OR
    //   - tablename: ...
    //     results:

    // If it is the "bad" pattern (nested results in anonymous subtable):
    let i = tablesIndex + 1;
    while (i < lines.length && lines[i].trim() === '') i++; // skip empty

    if (i >= lines.length) return;

    const firstSubLine = lines[i];
    // Check indentation
    const indent = firstSubLine.match(/^\s*/)?.[0].length || 0;
    if (indent === 0) return; // Weird

    if (firstSubLine.trim().startsWith('- results:')) {
        // FOUND IT!
        console.log(`[CANDIDATE] ${path.basename(filePath)}`);

        // Scan for MULTIPLE entries to be safe
        // If we find another line with SAME indent starting with "-", it might be a multi-table container
        let subCount = 0;
        for (let j = tablesIndex + 1; j < lines.length; j++) {
            const line = lines[j];
            const lineIndent = line.match(/^\s*/)?.[0].length || 0;
            if (lineIndent === indent && line.trim().startsWith('-')) {
                subCount++;
            }
        }

        if (subCount === 1) {
            console.log(`  -> CONFIRMED SINGLE SUBTABLE. FIXING...`);
            fixFile(filePath, tablesIndex, indent);
        } else {
            console.log(`  -> Multi-table container (${subCount} tables). Skipping.`);
        }
    }
}

function fixFile(filePath: string, tablesIndex: number, indentOfDash: number) {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    // 1. Replace "tables:" with "results:" (approximate, we actually want to lift the inner results)
    // Actually, "tables:" line goes away.
    // "- results:" line becomes "results:" (dedented).
    // All lines below it, until next root key (indent 0), must be dedented.

    // Safe approach:
    // Remove "tables:" line.
    // Find "- results:" line. Replace with "results:" and dedent.
    // Dedent subsequent lines that are part of the list.

    // Let's rely on string replacement for the specific block structure
    // tables:
    //   - results:
    //       - item

    // Indent of "- results:" is `indentOfDash`. e.g. 2 spaces.
    // Indent of items is `indentOfDash` + X.

    // New structure:
    // results:
    //   - item

    // So we remove `tables:` line.
    // We change `  - results:` to `results:`.
    // We dedent items by `indentOfDash`.

    const newLines: string[] = [];
    let insideBlock = false;
    let blockIndent = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (i === tablesIndex) {
            // Skip "tables:"
            continue;
        }

        // Detect the start of the block "- results:"
        if (!insideBlock && i > tablesIndex && line.trim().startsWith('- results:')) {
            insideBlock = true;
            const currentIndent = line.match(/^\s*/)?.[0].length || 0;
            // indentOfDash should match currentIndent
            // We verify it's the one we saw earlier
            if (Math.abs(currentIndent - indentOfDash) > 1) {
                console.warn(`Indent mismatch handling ${filePath}. Skipping safe fix.`);
                newLines.push(line);
                insideBlock = false; // abort block logic
                continue;
            }

            // Write "results:" at root?
            // "tables:" was at root. So "results:" should be at root.
            newLines.push("results:");
            blockIndent = currentIndent; // 2 spaces usually
            continue;
        }

        if (insideBlock) {
            // Check if block ended. Block ends if we hit something with indent <= 0 (root key) that is not empty
            if (line.trim() !== '' && (line.match(/^\s*/)?.[0].length || 0) === 0) {
                insideBlock = false;
                newLines.push(line);
                continue;
            }

            // Dedent this line
            // We need to remove `blockIndent` + extra shift for the dash?
            // "  - results:" (indent 2)
            // "      - item" (indent 6)
            // Target:
            // "  - item" (indent 2)
            // So we remove `blockIndent` + 2? No.

            // Wait.
            // Old:
            // tables:
            //   - results:
            //       - item

            // New:
            // results:
            //   - item

            // "      - item" (6 spaces) -> "  - item" (2 spaces). Delta = 4.
            // "  - results:" (2 spaces).
            // So we dedent by `blockIndent + 2`?
            // `blockIndent` is 2.
            // We want to dedent by 4.

            // If the line is empty, just push it.
            if (line.trim() === '') {
                newLines.push(line);
                continue;
            }

            // Remove leading spaces
            const leadingSpaces = line.match(/^\s*/)?.[0].length || 0;

            // Standard formatting usually implies indent+2 for list items of a key?
            // Or indent+4? 
            // We just strip `blockIndent + (dashOffset?)`
            // Let's assume we strip 4 spaces (or `blockIndent * 2`?).

            // Let's try stripping `blockIndent`. 
            // 6 - 2 = 4.
            // "    - item". 
            // "results:" is 0.
            // "    - item" is 4. That is valid YAML (indented list).

            const dedentAmount = blockIndent;
            if (leadingSpaces >= dedentAmount) {
                newLines.push(line.substring(dedentAmount));
            } else {
                // Should not happen inside the block if valid
                newLines.push(line);
            }
        } else {
            newLines.push(line);
        }
    }

    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`  -> FIXED ${path.basename(filePath)}`);
}

const all = getAllFiles(tablesDir);
console.log(`Scanning ${all.length} files...`);
all.forEach(scanFile);
