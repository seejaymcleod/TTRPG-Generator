import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForgeService } from '../src/services/ForgeService';
import { LLMClient } from '../src/services/LLMClient';
import * as yaml from 'js-yaml';

describe('ForgeService - Single-Pass Extraction', () => {
    let forge: ForgeService;

    beforeEach(() => {
        forge = new ForgeService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should extract content in a single pass', async () => {
        const generateSpy = vi.spyOn(LLMClient.prototype, 'generate');
        vi.spyOn(LLMClient.prototype, 'listOllamaModels').mockResolvedValue(['llama3']);

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

        generateSpy.mockResolvedValue(mockYaml);

        const result = await forge.processContent("Some spell text", "spell", "ShadowDark", "Core");

        expect(result).toBeDefined();
        const parsed = yaml.load(result) as any[];
        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe('Fireball');

        // Single pass = exactly 1 LLM call
        expect(generateSpy).toHaveBeenCalledTimes(1);
    });

    it('should include section awareness in system prompt', async () => {
        const generateSpy = vi.spyOn(LLMClient.prototype, 'generate');
        vi.spyOn(LLMClient.prototype, 'listOllamaModels').mockResolvedValue(['llama3']);

        generateSpy.mockResolvedValue("- id: test\n  name: Test");

        await forge.processContent("Text", "spell", "ShadowDark", "Core");

        // Check that section awareness is in the prompt
        const callArgs = generateSpy.mock.calls[0];
        const systemPrompt = callArgs[1] as string;

        expect(systemPrompt).toContain('SECTION AWARENESS');
        expect(systemPrompt).toContain('black banner');
        expect(systemPrompt).toContain('source_schema');
    });
});
