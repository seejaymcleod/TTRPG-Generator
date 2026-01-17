
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
require('dotenv').config();
import { decrypt } from '../src/services/Encryption';

async function checkModels() {
    // READ USER CONFIG FOR API KEY
    const userConfigPath = '/Users/seejaymac/Documents/GitHub/TTRPG-Generator/data/users/SeeJayMac.json';
    let apiKey = process.env.GEMINI_API_KEY;

    if (fs.existsSync(userConfigPath)) {
        try {
            const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
            if (userConfig.secrets && userConfig.secrets.geminiApiKey) {
                apiKey = decrypt(userConfig.secrets.geminiApiKey);
            }
        } catch (e) {
            console.error("Failed to read user config:", e);
        }
    }

    if (!apiKey) {
        console.error("Error: GEMINI_API_KEY not found.");
        return;
    }

    console.log("Checking available models...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await axios.get(url);
        const models = response.data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name);

        console.log("Available Generation Models:");
        models.forEach((m: string) => console.log(`- ${m}`));
    } catch (e: any) {
        console.error("Failed to list models:", e.message);
        if (e.response) {
            console.error("Data:", e.response.data);
        }
    }
}

checkModels();
