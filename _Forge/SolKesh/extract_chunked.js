#!/usr/bin/env node
/**
 * Chunked SolKesh Extraction Script
 * 
 * Splits SolKesh.md by biome sections and processes each chunk separately
 * via the Forge Scribe API, then merges results.
 * 
 * Usage: node scripts/extract_solkesh_chunked.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.resolve(__dirname, '../import/raw_data/SolKesh.md');
const OUTPUT_FILE = path.resolve(__dirname, '../_Content/SolKesh/SolKesh_Extracted_Content.yaml');
const API_URL = 'http://localhost:1337/api/forge/extract-scribe';

// Define biome section boundaries (approximate line ranges based on document structure)
// These will be used to split the document
const BIOME_KEYWORDS = [
    'Strands Creature Entries',
    'Farplains Creature Entries',
    'Fenlands Creature Entries',
    'Wealdwoods Creature Entries',
    'Umbrawells Creature Entries',
    'Wayward Creature Entries'
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractChunk(text, chunkName) {
    console.log(`\n[${chunkName}] Extracting (${text.length} chars)...`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                type: 'monster',
                game: 'SolKesh',
                source: 'SolKesh Bestiary'
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error(`[${chunkName}] Error: ${data.error}`);
            return [];
        }

        console.log(`[${chunkName}] Extracted ${data.count || 0} monsters`);
        return data.cards || [];
    } catch (e) {
        console.error(`[${chunkName}] Fetch error: ${e.message}`);
        return [];
    }
}

function splitByCreatureBlocks(content) {
    // Split content into chunks of roughly 100-150k characters each
    // focusing on creature entries (identified by ## headers followed by stat blocks)
    const lines = content.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;
    let chunkIndex = 0;
    const MAX_CHUNK_SIZE = 120000; // ~120k chars per chunk

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentChunk.push(line);
        currentSize += line.length + 1;

        // Check if we're at a good split point (before a new creature entry)
        // and chunk is large enough
        if (currentSize > MAX_CHUNK_SIZE &&
            (line.startsWith('## ') || line === '') &&
            i < lines.length - 100) {

            chunks.push({
                name: `Chunk_${++chunkIndex}`,
                text: currentChunk.join('\n')
            });
            currentChunk = [];
            currentSize = 0;
        }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        chunks.push({
            name: `Chunk_${++chunkIndex}`,
            text: currentChunk.join('\n')
        });
    }

    return chunks;
}

async function main() {
    console.log('='.repeat(60));
    console.log('SolKesh Chunked Extraction');
    console.log('='.repeat(60));

    // Read source file
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Source file not found: ${SOURCE_FILE}`);
        process.exit(1);
    }

    const content = fs.readFileSync(SOURCE_FILE, 'utf-8');
    console.log(`\nSource file: ${content.length.toLocaleString()} characters`);

    // Split into chunks
    const chunks = splitByCreatureBlocks(content);
    console.log(`\nSplit into ${chunks.length} chunks:`);
    chunks.forEach((c, i) => {
        console.log(`  ${c.name}: ${c.text.length.toLocaleString()} chars`);
    });

    // Extract each chunk with delay between
    const allCards = [];
    const DELAY_BETWEEN_CHUNKS = 30000; // 30 seconds between API calls

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (i > 0) {
            console.log(`\nWaiting ${DELAY_BETWEEN_CHUNKS / 1000}s before next chunk...`);
            await sleep(DELAY_BETWEEN_CHUNKS);
        }

        const cards = await extractChunk(chunk.text, chunk.name);
        allCards.push(...cards);

        console.log(`Running total: ${allCards.length} monsters extracted`);
    }

    // Deduplicate by ID
    const cardMap = new Map();
    for (const card of allCards) {
        if (card.id && !cardMap.has(card.id)) {
            cardMap.set(card.id, card);
        }
    }

    const uniqueCards = Array.from(cardMap.values());
    console.log(`\n${'='.repeat(60)}`);
    console.log(`EXTRACTION COMPLETE`);
    console.log(`Total unique monsters: ${uniqueCards.length}`);
    console.log(`${'='.repeat(60)}`);

    // Save results
    if (uniqueCards.length > 0) {
        const yaml = require('js-yaml');
        const yamlContent = yaml.dump(uniqueCards, { lineWidth: -1 });
        fs.writeFileSync(OUTPUT_FILE, yamlContent);
        console.log(`\nSaved to: ${OUTPUT_FILE}`);
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
