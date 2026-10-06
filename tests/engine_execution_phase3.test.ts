// tests/engine_execution_phase3.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import { ExecutionEngine, CardTemplate } from '../src/engine/execution';
import { createCardFromResult, createResultNode } from '../src/engine/card';

describe('Phase 3: Dual-Level Re-rolling & Dependency Cascading', () => {
    let loader: TableLoader;
    let renderer: Renderer;
    let engine: ExecutionEngine;

    beforeAll(() => {
        loader = new TableLoader();
        const jsonPath = path.join(process.cwd(), 'dist', 'tables.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("dist/tables.json missing. Run 'npm run build:tables' first.");
        }
        loader.loadFromJSON(jsonPath);
        renderer = new Renderer(loader, 'phase3-seed');
        engine = new ExecutionEngine(loader, renderer);
    });

    describe('3.1 Micro Re-rolls (Embedded Dice & Math)', () => {
        it('should identify embedded dice tokens in a node', () => {
            const node = createResultNode({
                label: 'Weapon',
                displayValue: 'Deals 6 damage with 14 attack',
                tableName: 'Weapons',
                rawExpression: 'Deals {1d6+2} damage with {1d20} attack'
            });

            const tokens = engine.getMicroTokens(node);
            expect(tokens.length).toBe(2);
            expect(tokens[0].raw).toBe('{1d6+2}');
            expect(tokens[0].isRollable).toBe(true);
            expect(tokens[1].raw).toBe('{1d20}');
            expect(tokens[1].isRollable).toBe(true);
        });

        it('should re-roll only a specific embedded dice token', () => {
            const raw = 'You find {1d6} gems and {2d10} coins.';
            const node = createResultNode({
                label: 'Treasure',
                displayValue: 'You find 4 gems and 15 coins.',
                tableName: 'Treasures',
                rawExpression: raw
            });

            const card = {
                id: 'card_micro',
                title: 'Treasure',
                source: { file: 'Treasures.yaml', tableName: 'Treasures' },
                context: {},
                nodes: [node],
                createdAt: Date.now()
            };

            const result = engine.rerollMicroToken(card, node.id, '{1d6}', 0);
            expect(result.node.history.length).toBe(2);
            expect(result.newValue).not.toBe(result.previousValue);
            expect(result.newValue).toContain('coins');
        });
    });

    describe('3.2 Row-Level Re-rolls with Provenance', () => {
        it('should re-roll a node using generator provenance without relying on DOM', () => {
            const card = renderer.generateCard('ATest_AllFeatures');
            expect(card.nodes.length).toBeGreaterThan(0);

            const targetNode = card.nodes[0];
            const oldVal = targetNode.displayValue;
            const oldHistoryLen = targetNode.history.length;

            const res = engine.rerollNode(card, targetNode.id);
            expect(res.updatedNode.id).toBe(targetNode.id);
            expect(res.updatedNode.history.length).toBe(oldHistoryLen + 1);
        });

        it('should refuse to re-roll locked nodes', () => {
            const node = createResultNode({
                label: 'Ancestry',
                displayValue: 'Elf',
                tableName: 'Ancestry',
                locked: true
            });
            const card = {
                id: 'card_locked',
                title: 'Hero',
                source: { file: 'Hero.yaml', tableName: 'Hero' },
                context: {},
                nodes: [node],
                createdAt: Date.now()
            };

            expect(() => engine.rerollNode(card, node.id)).toThrow(/locked/);
        });
    });

    describe('3.3 Dependency Tracking & Cascading Updates', () => {
        it('should cascade updates to dependent fields when a provided node changes', () => {
            const ancestryNode = createResultNode({
                label: 'Ancestry',
                displayValue: 'Dwarf',
                tableName: 'Ancestry',
                provides: { Ancestry: 'Dwarf' }
            });

            const languageNode = createResultNode({
                label: 'Languages',
                displayValue: 'Common, Dwarvish',
                tableName: 'Languages',
                dependencies: ['Ancestry'],
                rawExpression: '{selectedResult, Ancestry}'
            });

            const card = {
                id: 'card_dep',
                title: 'Character',
                source: { file: 'Char.yaml', tableName: 'Char' },
                context: { Ancestry: 'Dwarf' },
                nodes: [ancestryNode, languageNode],
                createdAt: Date.now()
            };

            const updates = engine.cascadeDependencies(card, ancestryNode);
            expect(updates).toBeDefined();
        });
    });

    describe('3.4 Template Cards (Statblocks & Monsters)', () => {
        it('should generate a template card with static, rollable, and formula fields', () => {
            const monsterTemplate: CardTemplate = {
                id: 'monster_goblin',
                title: 'Goblin Scout',
                game: 'ShadowDark',
                fields: [
                    {
                        key: 'name',
                        label: 'Name',
                        type: 'static',
                        defaultValue: 'Goblin Scout'
                    },
                    {
                        key: 'level',
                        label: 'Level',
                        type: 'static',
                        defaultValue: 2,
                        providesKey: 'HeroLevel'
                    },
                    {
                        key: 'hp_formula',
                        label: 'Max HP',
                        type: 'formula',
                        formula: 'HeroLevel * 4',
                        dependencies: ['HeroLevel']
                    }
                ]
            };

            const card = engine.generateTemplateCard(monsterTemplate);
            expect(card.id).toBeDefined();
            expect(card.title).toBe('Goblin Scout');
            expect(card.nodes.length).toBe(3);

            const hpNode = card.nodes.find(n => n.label === 'Max HP');
            expect(hpNode).toBeDefined();
            expect(hpNode?.displayValue).toBe('8'); // 2 * 4 = 8
        });
    });
});
