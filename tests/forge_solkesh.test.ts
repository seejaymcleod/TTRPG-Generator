/**
 * Test: Forge SolKesh Schema-Driven Extraction
 * Tests the refactored Forge pipeline with SolKesh InputSchema and ContentSchema.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ForgeService } from '../src/services/ForgeService';
import * as path from 'path';
import * as fs from 'fs';

describe('ForgeService - SolKesh Schema-Driven Extraction', () => {
    let forge: ForgeService;
    const solkeshDir = path.resolve(process.cwd(), '_Content/SolKesh');
    const rawDataPath = path.resolve(process.cwd(), 'import/raw_data/SolKesh.md');

    beforeEach(() => {
        forge = new ForgeService();
    });

    describe('Schema Loading', () => {
        it('should load InputSchema for SolKesh', () => {
            // Access the private method via the class for testing
            const inputSchema = (forge as any).loadInputSchema('SolKesh');

            expect(inputSchema).not.toBeNull();
            expect(inputSchema.game).toBe('SolKesh');
            expect(inputSchema.extraction_rules).toBeDefined();
            expect(inputSchema.extraction_rules.id_format).toBe('sk_{type_prefix}_{snake_case_name}');
        });

        it('should load ContentSchema Monster definition for SolKesh', () => {
            const contentSchema = (forge as any).loadContentSchema('SolKesh', 'Monster');

            expect(contentSchema).not.toBeNull();
            expect(contentSchema.game).toBe('SolKesh');
            expect(contentSchema.required).toContain('id');
            expect(contentSchema.required).toContain('name');
        });

        it('should return null for games without schemas', () => {
            const inputSchema = (forge as any).loadInputSchema('NonExistentGame');
            expect(inputSchema).toBeNull();
        });
    });

    describe('Template Generation', () => {
        it('should generate SolKesh-specific monster template with InputSchema fields', () => {
            const template = (forge as any).generateScribeTemplate('monster', 'SolKesh');

            expect(template.items.properties.bio).toBeDefined();
            expect(template.items.properties.ecology).toBeDefined();
            expect(template.items.properties.taming).toBeDefined();
            expect(template.items.properties.attributes).toBeDefined();
            expect(template.items.properties.traits).toBeDefined();
            expect(template.items.properties.actions).toBeDefined();
            expect(template.items.properties.legendary_actions).toBeDefined();
        });

        it('should use hardcoded template for ShadowDark (no InputSchema)', () => {
            const template = (forge as any).generateScribeTemplate('monster', 'ShadowDark');

            // ShadowDark uses hardcoded template with 'level', 'alignment', etc.
            expect(template.items.properties.level).toBeDefined();
            expect(template.items.properties.alignment).toBeDefined();
            // Should NOT have SolKesh-specific fields
            expect(template.items.properties.bio).toBeUndefined();
            expect(template.items.properties.ecology).toBeUndefined();
        });
    });

    describe('Output Transformation', () => {
        it('should transform output with SolKesh ID format (sk_type_name)', () => {
            const mockData = [{
                name: 'Test Monster',
                ac: '15',
                hp: '26 (4d8 + 8)',
                bio: { class: 'Gastropoda', genus: 'Test', niche: 'Carnivore', biome: 'Coastal' },
                traits: [{ name: 'Test Trait', desc: 'A trait' }],
                actions: [{ name: 'Bite', desc: '+5 to hit, 1d6 damage' }]
            }];

            const result = (forge as any).transformScribeOutput(mockData, 'monster', 'SolKesh', 'SolKesh Bestiary');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('sk_monster_test_monster');
            expect(result[0].game).toBe('SolKesh');
            expect(result[0].source).toBe('SolKesh Bestiary');
            expect(result[0].properties.bio).toBeDefined();
            expect(result[0].properties.bio.class).toBe('Gastropoda');
        });

        it('should detect Apex stage from legendary_actions', () => {
            const mockData = [{
                name: 'Slannethiss',
                ac: '17',
                hp: '114',
                legendary_actions: [{ name: 'Quick Slash', desc: 'Makes one attack' }]
            }];

            const result = (forge as any).transformScribeOutput(mockData, 'monster', 'SolKesh', 'SolKesh Bestiary');

            expect(result[0].id).toBe('sk_apex_slannethiss');
            expect(result[0].stage).toBe('Apex');
        });

        it('should detect Young stage from name keywords', () => {
            const mockData = [
                { name: 'Gharril Juvenile', ac: '8', hp: '3' },
                { name: 'Daellash Elver', ac: '11', hp: '5' }
            ];

            const result = (forge as any).transformScribeOutput(mockData, 'monster', 'SolKesh', 'SolKesh Bestiary');

            expect(result[0].id).toBe('sk_young_gharril_juvenile');
            expect(result[0].stage).toBe('Young');
            expect(result[1].id).toBe('sk_young_daellash_elver');
            expect(result[1].stage).toBe('Young');
        });
    });

    describe('File Reading', () => {
        it('should confirm SolKesh.md raw data file exists', () => {
            expect(fs.existsSync(rawDataPath)).toBe(true);
        });

        it('should confirm SolKesh_InputSchema.yaml exists', () => {
            expect(fs.existsSync(path.join(solkeshDir, 'SolKesh_InputSchema.yaml'))).toBe(true);
        });

        it('should confirm SolKesh_ContentSchema.yaml exists', () => {
            expect(fs.existsSync(path.join(solkeshDir, 'SolKesh_ContentSchema.yaml'))).toBe(true);
        });
    });
});
