// tests/engine_card_phase2.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';
import {
    createCardFromResult,
    createResultNode,
    serializeCard,
    hydrateCard,
    findNodeById,
    updateNodeValue
} from '../src/engine/card';
import { parseTemplate } from '../src/engine/template';

describe('Phase 2: Card & Execution Node Data Engine', () => {
    let loader: TableLoader;
    let renderer: Renderer;

    beforeAll(() => {
        loader = new TableLoader();
        const jsonPath = path.join(process.cwd(), 'dist', 'tables.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("dist/tables.json missing. Run 'npm run build:tables' first.");
        }
        loader.loadFromJSON(jsonPath);
        renderer = new Renderer(loader, 'phase2-seed');
    });

    describe('ResultNode & Card Generation', () => {
        it('should create a valid ResultNode with history and tokens', () => {
            const raw = 'You find {2d6+3} gold and a {Weapons}.';
            const node = createResultNode({
                label: 'Loot',
                displayValue: 'You find 11 gold and a Longsword.',
                tableName: 'LootTable',
                sourceFile: 'Loot.yaml',
                rawExpression: raw
            });

            expect(node.id).toBeDefined();
            expect(node.label).toBe('Loot');
            expect(node.displayValue).toBe('You find 11 gold and a Longsword.');
            expect(node.generator.rawExpression).toBe(raw);
            expect(node.generator.tokens).toBeDefined();
            expect(node.generator.tokens?.length).toBeGreaterThan(0);
            expect(node.history.length).toBe(1);
            expect(node.history[0].value).toBe('You find 11 gold and a Longsword.');
            expect(node.locked).toBe(false);
        });

        it('should generate a typed Card via Renderer.generateCard', () => {
            const card = renderer.generateCard('SimpleStringResult');
            expect(card.id).toBeDefined();
            expect(card.title).toBeDefined();
            expect(card.source.tableName).toBeDefined();
            expect(card.nodes.length).toBeGreaterThan(0);
            expect(card.nodes[0].displayValue).toBeDefined();
            expect(card.createdAt).toBeTypeOf('number');
        });

        it('should preserve career and column hierarchies in Card nodes', () => {
            const careerResult = renderer.generate('CareerStyleResult');
            const card = createCardFromResult(
                careerResult,
                { file: 'ATest_AllFeatures.yaml', tableName: 'CareerStyleResult' }
            );

            expect(card.nodes.length).toBe(1);
            const parent = card.nodes[0];
            expect(parent.children).toBeDefined();
            expect(parent.children?.length).toBe(1);
            expect(parent.children?.[0].label).toBe('Items');
        });
    });

    describe('AST Token Preservation (Phase 2.2)', () => {
        it('should parse embedded dice expressions and keep raw tokens', () => {
            const expr = 'Roll: {1d20+5} and {{1d6} * 10} damage';
            const tokens = parseTemplate(expr);

            expect(tokens.length).toBe(5); // text, expr, text, expr, text
            expect(tokens[1].kind).toBe('expression');
            if (tokens[1].kind === 'expression') {
                expect(tokens[1].raw).toBe('{1d20+5}');
                expect(tokens[1].inner).toBe('1d20+5');
                expect(tokens[1].staticToken).toBe('1d20+5');
            }

            const node = createResultNode({
                label: 'Attack',
                displayValue: 'Roll: 18 and 30 damage',
                tableName: 'Attacks',
                rawExpression: expr
            });

            expect(node.generator.tokens).toBeDefined();
            expect(node.generator.tokens?.[1].kind).toBe('expression');
        });
    });

    describe('Card Serialization & Hydration (Phase 2.3)', () => {
        it('should serialize a card to JSON and hydrate it with exact fidelity', () => {
            const originalCard = renderer.generateCard('ATest_AllFeatures');
            expect(originalCard.nodes.length).toBeGreaterThan(0);

            // Add an update and lock one node
            const firstNode = originalCard.nodes[0];
            firstNode.locked = true;
            updateNodeValue(firstNode, 'Modified Value');

            const jsonString = serializeCard(originalCard);
            expect(typeof jsonString).toBe('string');

            const hydrated = hydrateCard(jsonString);
            expect(hydrated.id).toBe(originalCard.id);
            expect(hydrated.title).toBe(originalCard.title);
            expect(hydrated.source.file).toBe(originalCard.source.file);
            expect(hydrated.source.tableName).toBe(originalCard.source.tableName);
            expect(hydrated.nodes.length).toBe(originalCard.nodes.length);

            const hydratedNode = findNodeById(hydrated.nodes, firstNode.id);
            expect(hydratedNode).toBeDefined();
            expect(hydratedNode?.locked).toBe(true);
            expect(hydratedNode?.displayValue).toBe('Modified Value');
            expect(hydratedNode?.history.length).toBe(2);
            expect(hydratedNode?.history[1].value).toBe('Modified Value');
        });

        it('should fail gracefully when hydrating malformed JSON', () => {
            expect(() => hydrateCard('not json')).toThrow();
            expect(() => hydrateCard({})).toThrow(/missing or invalid "id"/);
            expect(() => hydrateCard({ id: '1', title: 'T' })).toThrow(/missing or invalid "source"/);
            expect(() => hydrateCard({ id: '1', title: 'T', source: { tableName: 'T' } })).toThrow(/"nodes" must be an array/);
        });
    });
});
