#!/usr/bin/env node
/**
 * Page-Based SolKesh Extraction Script
 * 
 * Uses Docling-ingested JSON structure to process content in 10-page chunks.
 * This ensures cleaner boundaries and manageable context sizes.
 * 
 * Usage: node _Forge/SolKesh/extract_pages.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_JSON = path.resolve(__dirname, '../Import/solkesh_structure.json');
const OUTPUT_FILE = path.resolve(__dirname, '../../_Content/SolKesh/SolKesh_Extracted_Content.yaml');
const API_URL = 'http://localhost:1337/api/forge/extract-scribe';

const PAGES_PER_CHUNK = 10;
const DELAY_BETWEEN_CHUNKS = 30000; // 30s

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractChunk(text, chunkName) {
    console.log(`\n[${chunkName}] Extracting (${text.length} chars)...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000); // 10 minute timeout

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                type: 'monster',
                game: 'SolKesh',
                source: 'SolKesh Bestiary'
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await response.json();

        if (data.error) {
            console.error(`[${chunkName}] Error: ${data.error}`);
            return [];
        }

        console.log(`[${chunkName}] Extracted ${data.count || 0} monsters`);
        return data.cards || [];
    } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
            console.error(`[${chunkName}] Error: Request timed out after 10 minutes`);
        } else {
            console.error(`[${chunkName}] Fetch error: ${e.message}`);
        }
        return [];
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('SolKesh Page-Based Extraction');
    console.log('='.repeat(60));

    // Read source file
    if (!fs.existsSync(SOURCE_JSON)) {
        console.error(`Source file not found: ${SOURCE_JSON}`);
        console.error('Please run: python python-service/ingest.py import/SolKesh_Bestiary.pdf import/solkesh_structure.json');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf-8'));
    const structure = data.structure || [];
    console.log(`Loaded structure: ${structure.length} items`);

    // Group by page
    const pages = {};
    let maxPage = 0;

    structure.forEach(item => {
        const page = item.page || 0;
        if (page > maxPage) maxPage = page;
        if (!pages[page]) pages[page] = [];
        pages[page].push(item.text);
    });

    console.log(`Total Pages: ${maxPage}`);

    // Create chunks
    const chunks = [];
    for (let i = 1; i <= maxPage; i += PAGES_PER_CHUNK) {
        const endPage = Math.min(i + PAGES_PER_CHUNK - 1, maxPage);
        let chunkText = '';

        for (let p = i; p <= endPage; p++) {
            if (pages[p]) {
                chunkText += `\n\n--- Page ${p} ---\n\n` + pages[p].join('\n');
            }
        }

        if (chunkText.trim().length > 0) {
            chunks.push({
                name: `Pages_${i}-${endPage}`,
                text: chunkText
            });
        }
    }

    console.log(`Created ${chunks.length} chunks of ~${PAGES_PER_CHUNK} pages each.`);

    // Extract
    const allCards = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (i > 0) {
            console.log(`\nWaiting ${DELAY_BETWEEN_CHUNKS / 1000}s...`);
            await sleep(DELAY_BETWEEN_CHUNKS);
        }

        const cards = await extractChunk(chunk.text, chunk.name);
        allCards.push(...cards);

        console.log(`Running total: ${allCards.length} monsters extracted`);

        // Incremental save
        const yaml = require('js-yaml');
        // Deduplicate locally for save
        const tempMap = new Map();
        for (const card of allCards) {
            if (card.id && !tempMap.has(card.id)) tempMap.set(card.id, card);
        }
        const tempCards = Array.from(tempMap.values());
        if (tempCards.length > 0) {
            fs.writeFileSync(OUTPUT_FILE, yaml.dump(tempCards, { lineWidth: -1 }));
            console.log(`Saved incremental progress to ${OUTPUT_FILE}`);
        }
    }

    // Deduplicate
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
