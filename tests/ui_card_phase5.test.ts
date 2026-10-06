import { describe, it, expect } from 'vitest';
import {
    Card,
    createCardFromResult,
    createResultNode,
    serializeCard,
    hydrateCard,
    exportCardToMarkdown,
    undoNodeValue,
    updateNodeValue
} from '../src/engine/card';

describe('Phase 5: UI Modernization, Persistence & Card Export/Import', () => {
    it('serializes and hydrates card with full fidelity', () => {
        const card: Card = {
            id: 'card_test_1',
            title: 'Wandering Wight',
            source: { file: 'Wights.yaml', tableName: 'Wandering Wight' },
            context: { setting: 'crypt' },
            nodes: [
                createResultNode({
                    label: 'Description',
                    displayValue: 'A sinister wight holding a {1d6} rusty blade',
                    tableName: 'Wandering Wight',
                    rawExpression: 'A sinister wight holding a {1d6} rusty blade'
                })
            ],
            createdAt: 1000000
        };

        const jsonStr = serializeCard(card);
        const hydrated = hydrateCard(jsonStr);

        expect(hydrated.id).toBe(card.id);
        expect(hydrated.title).toBe('Wandering Wight');
        expect(hydrated.nodes.length).toBe(1);
        expect(hydrated.nodes[0].displayValue).toBe('A sinister wight holding a {1d6} rusty blade');
        expect(hydrated.nodes[0].generator.tokens).toBeDefined();
    });

    it('exports a card to Markdown statblock format', () => {
        const card: Card = {
            id: 'card_md_1',
            title: 'Goblin Scout',
            source: { file: 'Goblins.yaml', tableName: 'Goblin Scout' },
            context: {},
            nodes: [
                createResultNode({
                    label: 'Armor',
                    displayValue: 'Leather Armor (AC 12)',
                    tableName: 'Goblin Scout'
                }),
                createResultNode({
                    label: 'Weapons',
                    displayValue: 'Shortbow (1d6 dmg)',
                    tableName: 'Goblin Scout'
                })
            ],
            createdAt: 1000000
        };

        const md = exportCardToMarkdown(card);
        expect(md).toContain('## Goblin Scout');
        expect(md).toContain('- **Armor**: Leather Armor (AC 12)');
        expect(md).toContain('- **Weapons**: Shortbow (1d6 dmg)');
    });

    it('supports node value history and undo per field', () => {
        const node = createResultNode({
            label: 'HP',
            displayValue: '10',
            tableName: 'Stats'
        });

        expect(node.displayValue).toBe('10');
        expect(node.history.length).toBe(1);

        // Update value
        updateNodeValue(node, '18');
        expect(node.displayValue).toBe('18');
        expect(node.history.length).toBe(2);

        // Update value again
        updateNodeValue(node, '24');
        expect(node.displayValue).toBe('24');
        expect(node.history.length).toBe(3);

        // Undo once
        const reverted1 = undoNodeValue(node);
        expect(reverted1).toBe('18');
        expect(node.displayValue).toBe('18');
        expect(node.history.length).toBe(2);

        // Undo to initial
        const reverted2 = undoNodeValue(node);
        expect(reverted2).toBe('10');
        expect(node.displayValue).toBe('10');
        expect(node.history.length).toBe(1);

        // Undo past initial returns undefined
        const reverted3 = undoNodeValue(node);
        expect(reverted3).toBeUndefined();
        expect(node.displayValue).toBe('10');
    });

    it('creates card from complex GeneratedResult structure', () => {
        const generatedResult = {
            header: 'Encounter',
            result: [
                { header: 'Creature', result: '3 Ghouls' },
                { header: 'Loot', result: '50 gp' }
            ],
            context: { dungeonLevel: 2 }
        };

        const card = createCardFromResult(
            generatedResult as any,
            { file: 'Encounters.yaml', tableName: 'Encounter' },
            generatedResult.context
        );

        expect(card.title).toBe('Encounter');
        expect(card.nodes.length).toBe(2);
        expect(card.nodes[0].label).toBe('Creature');
        expect(card.nodes[0].displayValue).toBe('3 Ghouls');
        expect(card.nodes[1].label).toBe('Loot');
        expect(card.nodes[1].displayValue).toBe('50 gp');
        expect(card.context).toEqual({ dungeonLevel: 2 });
    });
});
