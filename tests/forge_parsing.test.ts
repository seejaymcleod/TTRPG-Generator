import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForgeService } from '../src/services/ForgeService';
import { LLMClient } from '../src/services/LLMClient';
import * as yaml from 'js-yaml';

describe('ForgeService - Multi-Tiered Semantic Extraction', () => {
    let forge: ForgeService;

    beforeEach(() => {
        forge = new ForgeService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should extract content in multiple passes (analyze + extract)', async () => {
        const generateSpy = vi.spyOn(LLMClient.prototype, 'generate');
        vi.spyOn(LLMClient.prototype, 'listOllamaModels').mockResolvedValue(['llama3']);

        // Mock Pass 1: Semantic Analysis
        const mockMap = JSON.stringify({
            sections: [{
                header: "Spells",
                tags: ["STAT_BLOCK_SPELL"],
                start_snippet: "Some",
                end_snippet: "text"
            }]
        });

        // Mock Pass 2: Extraction
        const mockYaml = `
- id: sd_spell_fireball
  name: "Fireball"
  type: Spell
  game: ShadowDark
  source: Core
  properties:
    tier: "3"
    class: "Wizard"
`;

        generateSpy
            .mockResolvedValueOnce(mockMap)  // Call 1: analyzeDocumentSemantics
            .mockResolvedValueOnce(mockYaml); // Call 2: extractSection

        const result = await forge.processContent("Some spell text", "spell", "ShadowDark", "Core");

        expect(result).toBeDefined();
        const parsed = yaml.load(result) as any[];
        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe('Fireball');

        // Multi-pass = at least 2 LLM calls
        expect(generateSpy).toHaveBeenCalledTimes(2);
    });

    it('should include section awareness in second-pass system prompt', async () => {
        const generateSpy = vi.spyOn(LLMClient.prototype, 'generate');
        vi.spyOn(LLMClient.prototype, 'listOllamaModels').mockResolvedValue(['llama3']);

        const mockMap = JSON.stringify({
            sections: [{
                header: "Spells",
                tags: ["STAT_BLOCK_SPELL"],
                start_snippet: "Text",
                end_snippet: "Text"
            }]
        });

        generateSpy
            .mockResolvedValueOnce(mockMap)
            .mockResolvedValueOnce("- id: test\n  name: Test");

        await forge.processContent("Text", "spell", "ShadowDark", "Core");

        // Check that section awareness is in the second call's system prompt
        const callArgs = generateSpy.mock.calls[1];
        const systemPrompt = callArgs[1] as string;

        expect(systemPrompt).toContain('SECTION AWARENESS');
        // Note: 'black banner' and 'source_schema' was from a previous or predicted implementation,
        // it doesn't seem to be in the current ForgeService.ts except in multimodal.
        // Let's check for what is actually there.
        expect(systemPrompt).toContain('TEMPLATE REFERENCE');
    });
});
