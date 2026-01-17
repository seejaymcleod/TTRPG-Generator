/**
 * Test: Forge Gemini Model Loading
 * This test verifies that the Forge correctly loads Gemini models when:
 * 1. User secrets contain a Gemini API key
 * 2. Provider is set to Gemini
 */

import { describe, test, expect } from 'vitest';

const BASE_URL = 'http://localhost:1337';

describe('Forge Gemini Model Loading', () => {
    const testUsername = 'SeeJayMac';

    test('should return decrypted Gemini API key from user secrets', async () => {
        const response = await fetch(`${BASE_URL}/api/user/secrets`, {
            headers: { 'x-username': testUsername }
        });

        expect(response.ok).toBe(true);
        const data = await response.json();

        expect(data.secrets).toBeDefined();
        expect(data.secrets.geminiApiKey).toBeDefined();
        expect(data.secrets.geminiApiKey).toMatch(/^AIzaSy/); // Valid Gemini key format
    });

    test('should return Gemini models when API key is provided', async () => {
        // First get the API key
        const secretsResponse = await fetch(`${BASE_URL}/api/user/secrets`, {
            headers: { 'x-username': testUsername }
        });
        const secretsData = await secretsResponse.json();
        const apiKey = secretsData.secrets?.geminiApiKey;

        expect(apiKey).toBeDefined();

        // Then fetch models
        const modelsResponse = await fetch(`${BASE_URL}/api/llm/gemini-models?apiKey=${apiKey}`);
        expect(modelsResponse.ok).toBe(true);

        const modelsData = await modelsResponse.json();
        expect(modelsData.models).toBeDefined();
        expect(Array.isArray(modelsData.models)).toBe(true);
        expect(modelsData.models.length).toBeGreaterThan(0);

        // Verify model structure
        const firstModel = modelsData.models[0];
        expect(firstModel.name).toBeDefined();
        expect(firstModel.displayName).toBeDefined();
    });

    test('should return default models when no API key provided', async () => {
        const response = await fetch(`${BASE_URL}/api/llm/gemini-models`);
        expect(response.ok).toBe(true);

        const data = await response.json();
        expect(data.models).toBeDefined();
        expect(data.models.length).toBeGreaterThan(0);

        // Should have recognizable default models
        const modelNames = data.models.map((m: any) => m.name);
        expect(modelNames).toContain('gemini-2.0-flash');
    });
});
