
const { ForgeService } = require('../src/services/ForgeService');
const fs = require('fs');
const path = require('path');

// Mock environment
process.env.OLLAMA_HOST = 'http://localhost:11434';

async function testChain() {
    console.log("Initializing ForgeService...");
    const forge = new ForgeService();

    // Mock text that simulates a book structure
    const mockText = `
    # THE FORGOTTEN TOMB
    
    ## Table of Contents
    1. Introduction... 3
    2. Spells ... 5
    3. Room Key ... 10

    # INTRODUCTION
    This is a dark place.
    
    # BESTIARY
    [Start of Monsters]
    GOBLIN
    AC 12, HP 4, ATK 1 club +1 (1d4)
    [End of Monsters]

    # NEW SPELLS
    [Start of Spells]
    FIREBALL
    Tier 3, Wizard
    Blast radius.
    [End of Spells]

    # ROOM KEY
    1. The Entrance
    There is a golden sword here. (Note: This is flavor text, not an item block).
    `;

    console.log("Running Extraction for 'monster' and 'item' only...");
    // Expected: 
    // - Monster: Found in Bestiary
    // - Item: NOT found (Golden sword is flavor text, not a section)

    try {
        const result = await forge.processContent(
            mockText,
            ['monster', 'item'],
            'ShadowDark',
            'Test Source',
            'local' // Use local to avoid cost, or mock if possible. 
            // Since we can't easily mock private methods from here without ts-node magic, 
            // we will rely on the actual LLM logic to see if it follows instructions.
            // If local LLM is dumb, this might fail. 
            // But we can check the logs to see the "Chain" steps.
        );

        console.log("\n--- RESULT ---");
        console.log(result);
        console.log("----------------");

    } catch (e) {
        console.error("Error:", e);
    }
}

testChain();
