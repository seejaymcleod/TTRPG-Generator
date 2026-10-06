// src/engine/execution.ts
//
// Phase 3: Dual-Level Re-rolling & Dependency Cascading Engine
//
// Implements:
//   3.1 Micro Re-rolls (Embedded Dice & Math chips)
//   3.2 Row-Level Re-rolls with Provenance (using node.generator)
//   3.3 Dependency Tracking (Cascading Updates when provided values change)
//   3.4 Template Cards (fixed schema statblocks / characters)

import { Card, ResultNode, updateNodeValue, findNodeById, createResultNode } from './card';
import { TableLoader } from './loader';
import { Renderer } from './renderer';
import { parseTemplate, walkTemplate, TemplateNode, DICE_PATTERN, classifyToken } from './template';
import { Context, Table, SubTable } from './types';

export interface MicroTokenEvaluation {
    raw: string;
    evaluatedValue: string | number;
    start: number;
    end: number;
    isRollable: boolean;
}

export interface CascadeUpdate {
    nodeId: string;
    label: string;
    previousValue: string;
    newValue: string;
}

export interface RowRerollResult {
    card: Card;
    updatedNode: ResultNode;
    cascadedUpdates: CascadeUpdate[];
}

export interface MicroRerollResult {
    card: Card;
    node: ResultNode;
    previousValue: string;
    newValue: string;
    cascadedUpdates: CascadeUpdate[];
}

export interface CardTemplateField {
    key: string;
    label: string;
    type: 'static' | 'rollable' | 'lookup' | 'formula';
    tableName?: string;
    formula?: string;
    defaultValue?: string | number;
    providesKey?: string;
    dependencies?: string[];
}

export interface CardTemplate {
    id: string;
    title: string;
    game: string;
    fields: CardTemplateField[];
}

export class ExecutionEngine {
    private loader: TableLoader;
    private renderer: Renderer;

    constructor(loader: TableLoader, renderer?: Renderer) {
        this.loader = loader;
        this.renderer = renderer || new Renderer(loader);
    }

    /**
     * 3.1 Evaluates and returns micro-token positions within a node's raw expression.
     * Identifies embedded dice expressions like {1d6}, {{1d6}*10}, etc.
     */
    public getMicroTokens(node: ResultNode): MicroTokenEvaluation[] {
        const raw = node.generator.rawExpression;
        if (!raw) return [];

        const tokens: TemplateNode[] = parseTemplate(raw);
        const results: MicroTokenEvaluation[] = [];

        walkTemplate(tokens, (t: TemplateNode) => {
            if (t.kind === 'expression') {
                const isDice = DICE_PATTERN.test(t.inner.trim());
                const isRollable = isDice || (t.staticToken ? DICE_PATTERN.test(t.staticToken) : false);

                results.push({
                    raw: t.raw,
                    evaluatedValue: t.inner,
                    start: t.start,
                    end: t.end,
                    isRollable
                });
            }
        });

        return results;
    }

    /**
     * 3.1 Micro Re-roll: Re-evaluates only a single embedded dice token (or expression) within
     * a node without re-rolling the rest of the text, updates the node displayValue and history.
     */
    public rerollMicroToken(
        card: Card,
        nodeId: string,
        tokenRaw: string,
        tokenIndex: number = 0
    ): MicroRerollResult {
        const node = findNodeById(card.nodes, nodeId);
        if (!node) {
            throw new Error(`Node with id "${nodeId}" not found in card`);
        }
        if (node.locked) {
            throw new Error(`Node "${node.label}" is locked`);
        }

        const rawExpr = node.generator.rawExpression || node.displayValue;
        const previousValue = node.displayValue;

        // Parse and locate the specific token
        const tokens = parseTemplate(rawExpr);
        let matchCount = 0;
        let targetNode: TemplateNode | undefined;

        walkTemplate(tokens, (t) => {
            if ('raw' in t && t.raw === tokenRaw) {
                if (matchCount === tokenIndex) {
                    targetNode = t;
                }
                matchCount++;
            }
        });

        if (!targetNode || targetNode.kind !== 'expression') {
            throw new Error(`Token "${tokenRaw}" at index ${tokenIndex} not found in node expression`);
        }

        // Re-roll this token using renderer's evaluation
        const tempContext = { ...card.context };
        const evaluated = this.renderer.generate(card.source.tableName, tempContext);
        // Direct roll of expression
        let rolledSubVal: string;
        try {
            const diceResult = this.renderer['dice'].roll(targetNode.inner);
            rolledSubVal = String(diceResult);
        } catch {
            // If it's a subtable reference or math expression
            rolledSubVal = String(this.renderer['evaluateToken'](targetNode.inner, tempContext, {
                depth: 0,
                tables: new Set(),
                counts: new Map(),
                maxDepth: 10
            }));
        }

        // Replace the substring in displayValue
        // If rawExpression exists, replace the evaluated value corresponding to token
        const newDisplay = node.displayValue.replace(new RegExp(tokenRaw.replace(/[{}]/g, ''), 'g'), rolledSubVal);
        const finalDisplay = newDisplay !== node.displayValue ? newDisplay : node.displayValue.replace(/\d+/, rolledSubVal);

        updateNodeValue(node, finalDisplay);

        // Check if this node provides variables and cascade if necessary
        const cascadedUpdates = this.cascadeDependencies(card, node);

        return {
            card,
            node,
            previousValue,
            newValue: finalDisplay,
            cascadedUpdates
        };
    }

    /**
     * 3.2 Row-Level Re-roll with Provenance: Executes the generator recipe stored on the node
     * instead of inspecting the DOM or relying on globally active table selection.
     */
    public rerollNode(card: Card, nodeId: string): RowRerollResult {
        const node = findNodeById(card.nodes, nodeId);
        if (!node) {
            throw new Error(`Node "${nodeId}" not found in card`);
        }
        if (node.locked) {
            throw new Error(`Node "${node.label}" is locked and cannot be rerolled`);
        }

        const tableName = node.generator.tableName || node.label;
        const sourceFile = node.generator.sourceFile || card.source.file;

        // Find table in loader
        let targetTable: SubTable | Table | undefined = this.loader.getTableByFilename(sourceFile);
        if (targetTable && targetTable.tablename !== tableName) {
            const sub = this.loader.findSubTable(targetTable, tableName);
            if (sub) targetTable = sub;
        }
        if (!targetTable) {
            targetTable = this.loader.findTable(tableName);
        }
        if (!targetTable) {
            throw new Error(`Source table "${tableName}" could not be found in loaded tables`);
        }

        const previousValue = node.displayValue;
        const currentContext: Context = { ...card.context };

        const genResult = this.renderer.reroll(targetTable as Table, tableName, currentContext);
        const newValue = String(genResult.result ?? '');

        updateNodeValue(node, newValue);

        // Update card context with provided value
        if (node.provides) {
            for (const key of Object.keys(node.provides)) {
                node.provides[key] = newValue;
                card.context[key] = newValue;
            }
        } else {
            card.context[node.label] = newValue;
        }

        // 3.3 Cascade updates to any dependent fields
        const cascadedUpdates = this.cascadeDependencies(card, node);

        return {
            card,
            updatedNode: node,
            cascadedUpdates
        };
    }

    /**
     * 3.3 Dependency Tracking (Cascading Updates):
     * When a node with `provides` (or whose label matches dependencies) changes,
     * re-roll affected unlocked nodes that declare dependencies on it.
     */
    public cascadeDependencies(card: Card, sourceNode: ResultNode): CascadeUpdate[] {
        const providedKeys = new Set<string>();
        if (sourceNode.provides) {
            Object.keys(sourceNode.provides).forEach(k => providedKeys.add(k));
        }
        providedKeys.add(sourceNode.label);

        const updates: CascadeUpdate[] = [];

        const checkAndReroll = (node: ResultNode) => {
            if (node.id === sourceNode.id || node.locked) return;

            // Check if node depends on any provided key
            const dependsOnSource = node.dependencies?.some(dep => providedKeys.has(dep));

            // Also check if rawExpression references any provided key
            const rawMentionsSource = node.generator.rawExpression &&
                Array.from(providedKeys).some(key =>
                    node.generator.rawExpression?.includes(`{${key}}`) ||
                    node.generator.rawExpression?.includes(`{selectedResult, ${key}}`)
                );

            if (dependsOnSource || rawMentionsSource) {
                const prev = node.displayValue;
                try {
                    const res = this.rerollNodeInternal(card, node);
                    updates.push({
                        nodeId: node.id,
                        label: node.label,
                        previousValue: prev,
                        newValue: res.displayValue
                    });
                } catch (e: any) {
                    console.warn(`[Cascade] Failed to update dependent node "${node.label}": ${e.message}`);
                }
            }

            if (node.children) {
                node.children.forEach(checkAndReroll);
            }
        };

        card.nodes.forEach(checkAndReroll);
        return updates;
    }

    private rerollNodeInternal(card: Card, node: ResultNode): ResultNode {
        const tableName = node.generator.tableName || node.label;
        const sourceFile = node.generator.sourceFile || card.source.file;
        let targetTable = this.loader.getTableByFilename(sourceFile) || this.loader.findTable(tableName);

        if (targetTable) {
            const sub = this.loader.findSubTable(targetTable, tableName);
            if (sub) targetTable = sub;
        }

        if (!targetTable) {
            return node;
        }

        const genResult = this.renderer.reroll(targetTable as Table, tableName, card.context);
        const newValue = String(genResult.result ?? '');
        updateNodeValue(node, newValue);

        if (node.provides) {
            for (const key of Object.keys(node.provides)) {
                node.provides[key] = newValue;
                card.context[key] = newValue;
            }
        }
        return node;
    }

    /**
     * 3.4 Template Cards: Instantiates a fixed-schema template card (e.g. Monster Statblock)
     * with rollable, static, and formula fields.
     */
    public generateTemplateCard(template: CardTemplate, context: Context = {}): Card {
        const cardId = `template_card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const cardContext: Context = { ...context };
        const nodes: ResultNode[] = [];

        for (const field of template.fields) {
            let displayVal = '';
            let rawExpr: string | undefined;

            if (field.type === 'static') {
                displayVal = String(field.defaultValue ?? '');
            } else if (field.type === 'rollable' && field.tableName) {
                const targetTable = this.loader.findTable(field.tableName);
                if (targetTable) {
                    const res = this.renderer.generate(field.tableName, cardContext);
                    displayVal = String(res.result ?? '');
                    rawExpr = `{${field.tableName}}`;
                } else {
                    displayVal = String(field.defaultValue ?? `[Table ${field.tableName} not found]`);
                }
            } else if (field.type === 'formula' && field.formula) {
                rawExpr = field.formula;
                const evaluated = this.renderer['expr'].evaluate(field.formula, cardContext);
                displayVal = String(evaluated);
            } else if (field.type === 'lookup' && field.tableName) {
                rawExpr = `{useReferenceTable{${field.tableName}}{${field.defaultValue ?? 0}}}`;
                displayVal = String(field.defaultValue ?? '');
            }

            if (field.providesKey) {
                cardContext[field.providesKey] = displayVal;
            }
            cardContext[field.key] = displayVal;

            const node = createResultNode({
                label: field.label,
                displayValue: displayVal,
                tableName: field.tableName || field.key,
                rawExpression: rawExpr,
                dependencies: field.dependencies,
                provides: field.providesKey ? { [field.providesKey]: displayVal } : undefined
            });

            nodes.push(node);
        }

        return {
            id: cardId,
            title: template.title,
            source: {
                file: `${template.game}_Templates.yaml`,
                tableName: template.id
            },
            context: cardContext,
            nodes,
            createdAt: Date.now()
        };
    }
}
