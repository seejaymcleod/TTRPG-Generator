
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---

interface ContentItem {
    id: string;
    game: string;
    source: string;
    name: string;
    type: 'Monster' | 'Spell' | 'Item';
    properties: Record<string, any>;
    abilities?: { name: string; desc: string }[];
    actions?: { name: string; desc: string }[];
    description?: string;
}

// --- CSV Parsing Helper ---

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim());
    const data: Record<string, string>[] = [];

    // Simple CSV parser that handles quoted fields
    const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    };

    // Find the header line (look for "Monster" or "Spell Name")
    let headerIndex = 0;
    let actualHeaders: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const parsed = parseLine(lines[i]);
        if (parsed.includes('Monster') || parsed.includes('Spell Name')) {
            headerIndex = i;
            actualHeaders = parsed.map(h => h.trim());
            break;
        }
    }

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseLine(line);
        if (values.length < actualHeaders.length) continue;

        const entry: Record<string, string> = {};
        actualHeaders.forEach((header, index) => {
            if (header) {
                entry[header] = values[index]?.trim().replace(/^"|"$/g, '') || '';
            }
        });
        data.push(entry);
    }

    return data;
}

// --- Conversion Logic ---

function convertMonsters(csvData: Record<string, string>[]): ContentItem[] {
    return csvData.map((row): ContentItem | null => {
        const name = row['Monster'];
        if (!name) return null;

        const id = `sd_monster_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

        // Extract Talents/Abilities
        const abilities: { name: string; desc: string }[] = [];
        for (let i = 1; i <= 10; i++) {
            const talent = row[`Talent ${i}`];
            if (talent) {
                // Heuristic to split Name: Desc
                const parts = talent.split(/[:.](.+)/);
                if (parts.length > 1) {
                    abilities.push({ name: parts[0].trim(), desc: parts[1].trim() });
                } else {
                    abilities.push({ name: 'Talent', desc: talent });
                }
            }
        }

        // Parse Attacks/Actions from 'ATK' column if possible, or just dump string
        // The CSV structure is unique here, ATK string usually contains formatted text
        const acts = row['ATK'] ? [{ name: 'Attack', desc: row['ATK'] }] : [];

        return {
            id,
            game: 'ShadowDark',
            source: 'ShadowDark Core',
            name: name,
            type: 'Monster',
            properties: {
                ac: row['AC'],
                hp: row['HP'],
                mv: row['MV'],
                level: row['LV'],
                alignment: row['AL'],
                stats: {
                    str: row['S'],
                    dex: row['D'],
                    con: row['C'],
                    int: row['I'],
                    wis: row['W'],
                    cha: row['Ch']
                },
                flavor: row['Flavor Text']
            },
            abilities: abilities.length > 0 ? abilities : undefined,
            actions: acts.length > 0 ? acts : undefined,
            description: row['Flavor Text']
        };
    }).filter((x): x is ContentItem => x !== null);
}

function convertSpells(csvData: Record<string, string>[]): ContentItem[] {
    return csvData.map((row): ContentItem | null => {
        const name = row['Spell Name'];
        if (!name) return null;

        const id = `sd_spell_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

        return {
            id,
            game: 'ShadowDark',
            source: 'ShadowDark Core',
            name: name,
            type: 'Spell',
            properties: {
                tier: parseInt(row['Tier #']) || 0,
                class: row['Spell Type'],
                duration: row['Duration'],
                range: row['Range']
            },
            description: row['Description']
        };
    }).filter((x): x is ContentItem => x !== null);
}

// --- Main Execution ---

function main() {
    const rootDir = process.cwd();
    const contentDir = path.join(rootDir, '_Content', 'ShadowDark');
    const monsterCsvPath = path.join(contentDir, 'Shadowdark Monster Database - All.csv');
    const spellCsvPath = path.join(contentDir, 'Shadowdark Spell List - Spells List.csv');
    const outputPath = path.join(contentDir, 'ShadowDark_Content.yaml');

    let allContent: ContentItem[] = [];

    // Process Monsters
    if (fs.existsSync(monsterCsvPath)) {
        console.log(`Processing Monsters from ${monsterCsvPath}...`);
        const csvContent = fs.readFileSync(monsterCsvPath, 'utf-8');
        const parsed = parseCSV(csvContent);
        const monsters = convertMonsters(parsed);
        console.log(`Converted ${monsters.length} monsters.`);
        allContent = allContent.concat(monsters);
    } else {
        console.warn(`Monster CSV not found at ${monsterCsvPath}`);
    }

    // Process Spells
    if (fs.existsSync(spellCsvPath)) {
        console.log(`Processing Spells from ${spellCsvPath}...`);
        const csvContent = fs.readFileSync(spellCsvPath, 'utf-8');
        const parsed = parseCSV(csvContent);
        const spells = convertSpells(parsed);
        console.log(`Converted ${spells.length} spells.`);
        allContent = allContent.concat(spells);
    } else {
        console.warn(`Spell CSV not found at ${spellCsvPath}`);
    }

    // Output valid YAML
    // Since we don't have a library to dump, we construct it manually to ensure valid format
    // Or we use JSON for now? The user asked for "Universal YAML Format".
    // I will generate simple YAML string.

    let yamlOutput = "";

    allContent.forEach(item => {
        yamlOutput += `- id: ${item.id}\n`;
        yamlOutput += `  name: "${item.name.replace(/"/g, '\\"')}"\n`;
        yamlOutput += `  type: ${item.type}\n`;
        yamlOutput += `  game: ${item.game}\n`;
        yamlOutput += `  source: ${item.source}\n`;

        yamlOutput += `  properties:\n`;
        for (const [key, val] of Object.entries(item.properties)) {
            if (typeof val === 'object' && val !== null) {
                yamlOutput += `    ${key}:\n`;
                for (const [k, v] of Object.entries(val)) {
                    yamlOutput += `      ${k}: "${String(v).replace(/"/g, '\\"')}"\n`;
                }
            } else {
                if (val !== undefined && val !== "") {
                    yamlOutput += `    ${key}: "${String(val).replace(/"/g, '\\"')}"\n`;
                }
            }
        }

        if (item.abilities && item.abilities.length > 0) {
            yamlOutput += `  abilities:\n`;
            item.abilities.forEach(ab => {
                yamlOutput += `    - name: "${ab.name.replace(/"/g, '\\"')}"\n`;
                yamlOutput += `      desc: "${ab.desc.replace(/"/g, '\\"')}"\n`;
            });
        }

        if (item.actions && item.actions.length > 0) {
            yamlOutput += `  actions:\n`;
            item.actions.forEach(act => {
                yamlOutput += `    - name: "${act.name.replace(/"/g, '\\"')}"\n`;
                yamlOutput += `      desc: "${act.desc.replace(/"/g, '\\"')}"\n`;
            });
        }

        if (item.description) {
            // Simple multiline handling
            const desc = item.description.replace(/"/g, '\\"');
            yamlOutput += `  description: "${desc}"\n`;
        }
        yamlOutput += "\n";
    });

    fs.writeFileSync(outputPath, yamlOutput);
    console.log(`Successfully wrote ${allContent.length} items to ${outputPath}`);
}

main();
