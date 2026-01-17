import * as fs from 'fs';
import * as path from 'path';
require('dotenv').config(); // Load .env file for decryption key
import { ForgeService } from '../src/services/ForgeService';
import { decrypt } from '../src/services/Encryption';


// ... (imports remain)

async function processBatch() {
    const forge = new ForgeService();
    console.log("Initializing ForgeService...");

    // READ USER CONFIG FOR API KEY
    const userConfigPath = '/Users/seejaymac/Documents/GitHub/TTRPG-Generator/data/users/SeeJayMac.json';
    let apiKey = process.env.GEMINI_API_KEY;

    if (fs.existsSync(userConfigPath)) {
        try {
            const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
            if (userConfig.secrets && userConfig.secrets.geminiApiKey) {
                console.log("Found encrypted API key in user config. Decrypting...");
                apiKey = decrypt(userConfig.secrets.geminiApiKey);
                console.log("API Key decrypted successfully.");
            }
        } catch (e) {
            console.error("Failed to read user config:", e);
        }
    }

    if (!apiKey) {
        console.error("Error: GEMINI_API_KEY not found in .env or user config.");
        process.exit(1);
    }

    const importDir = path.resolve(process.cwd(), 'import/raw_data');
    if (!fs.existsSync(importDir)) {
        console.error(`Error: Raw data directory not found at ${importDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(importDir).filter(f => f.endsWith('.md'));
    if (files.length === 0) {
        console.log("No markdown files found in import/raw_data. Run generate_raw_data.py first.");
        return;
    }

    console.log(`Found ${files.length} markdown files to process.`);
    const model = 'gemini-2.0-flash-lite'; // Optimized for speed and cost

    for (const file of files) {
        console.log(`\n----------------------------------------`);
        console.log(`Processing: ${file}`);
        console.log(`----------------------------------------`);

        const filePath = path.join(importDir, file);
        const text = fs.readFileSync(filePath, 'utf-8');
        const sourceName = file.replace('.md', ''); // Use filename as source

        try {
            // Process for all major types
            // Tier 1 & 2 will filter out irrelevant ones automatically!
            const types = ['monster', 'spell', 'item', 'table'];

            // Step A: Extract Content
            const yamlResult = await forge.processContent(
                text,
                types,
                'ShadowDark',
                sourceName,
                'gemini',
                apiKey, // Use the decrypted key
                model
            );

            // Step B: Parse YAML result to JSON objects
            const yaml = require('js-yaml');
            let cards: any[] = [];
            try {
                cards = yaml.load(yamlResult);
                if (!Array.isArray(cards)) cards = [];
            } catch (e) {
                console.error("Failed to parse generated YAML:", e);
                continue;
            }

            if (cards.length === 0) {
                console.log(`No cards extracted from ${file}.`);
                continue;
            }

            console.log(`Extracted ${cards.length} cards.`);

            // Step C: Save Cards (Separately by type to match official structure)
            const monsters = cards.filter(c => c.type === 'Monster' || c.type === 'NPC');
            const spells = cards.filter(c => c.type === 'Spell');
            const items = cards.filter(c => c.type === 'Item' || c.type === 'Equipment' || c.type === 'Magic Item');
            const tables = cards.filter(c => c.type === 'Random Table');

            if (monsters.length > 0) {
                await forge.saveCards(monsters, 'ShadowDark', 'monster', 'official');
                console.log(`Saved ${monsters.length} Monsters.`);
            }
            if (spells.length > 0) {
                await forge.saveCards(spells, 'ShadowDark', 'spell', 'official');
                console.log(`Saved ${spells.length} Spells.`);
            }
            if (items.length > 0) {
                await forge.saveCards(items, 'ShadowDark', 'item', 'official');
                console.log(`Saved ${items.length} Items.`);
            }
            if (tables.length > 0) {
                await forge.saveCards(tables, 'ShadowDark', 'table', 'official');
                console.log(`Saved ${tables.length} Tables.`);
            }

        } catch (error) {
            console.error(`Failed to process ${file}:`, error);
        }

        // Rate Limit Guard: Wait 30 seconds between files
        console.log("Waiting 30 seconds to respect API rate limits...");
        await new Promise(resolve => setTimeout(resolve, 30000));
    }

    console.log("\nBatch Import Complete.");
}

processBatch();
