// src/engine/card.ts
//
// Phase 2: Card & Execution Node Data Engine
//
// Represents cards and result nodes as structured, persistent, serializable models
// capable of tracking roll history, micro-tokens (AST tokens for embedded dice/math),
// dependencies, and hydration for macro/micro re-rolls.

import { TemplateNode, parseTemplate } from './template';
import { GeneratedResult, Context, Table, SubTable } from './types';

export interface RollHistoryEntry {
    rolledAt: number;
    value: string;
}

export interface NodeGenerator {
    sourceFile?: string;
    tableName: string;
    rawExpression?: string;
    tokens?: TemplateNode[]; // AST tokens for embedded dice/math micro-rerolls
}

export interface ResultNode {
    id: string;
    label: string;
    displayValue: string;
    generator: NodeGenerator;
    history: RollHistoryEntry[];
    locked: boolean;
    dependencies?: string[];
    provides?: Record<string, any>;
    children?: ResultNode[];
}

export interface CardSource {
    file: string;
    tableName: string;
}

export interface Card {
    id: string;
    title: string;
    source: CardSource;
    context: Record<string, any>;
    nodes: ResultNode[];
    createdAt: number;
}

let nextNodeId = 1;
export function generateNodeId(): string {
    return `node_${Date.now()}_${nextNodeId++}_${Math.random().toString(36).substring(2, 7)}`;
}

export function generateCardId(): string {
    return `card_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a ResultNode from an existing GeneratedResult or primitive value.
 */
export function createResultNode(params: {
    label: string;
    displayValue: string;
    tableName: string;
    sourceFile?: string;
    rawExpression?: string;
    dependencies?: string[];
    provides?: Record<string, any>;
    children?: ResultNode[];
    locked?: boolean;
}): ResultNode {
    const tokens = params.rawExpression ? parseTemplate(params.rawExpression) : undefined;
    return {
        id: generateNodeId(),
        label: params.label,
        displayValue: params.displayValue,
        generator: {
            sourceFile: params.sourceFile,
            tableName: params.tableName,
            rawExpression: params.rawExpression,
            tokens
        },
        history: [
            {
                rolledAt: Date.now(),
                value: params.displayValue
            }
        ],
        locked: params.locked ?? false,
        dependencies: params.dependencies,
        provides: params.provides,
        children: params.children
    };
}

/**
 * Transforms a GeneratedResult hierarchy (from Renderer.generate) into a structured Card model.
 */
export function createCardFromResult(
    result: GeneratedResult,
    source: { file: string; tableName: string },
    context: Context = {},
    title?: string
): Card {
    const cardId = generateCardId();
    const nodes = transformGeneratedResultToNodes(result, source.file);

    return {
        id: cardId,
        title: title || result.header || source.tableName,
        source: {
            file: source.file,
            tableName: source.tableName
        },
        context: sanitizeContext(context),
        nodes,
        createdAt: Date.now()
    };
}

function sanitizeContext(ctx: Context): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(ctx)) {
        if (key.startsWith('_')) continue; // Skip internal keys like _currentTable
        if (typeof val === 'function') continue;
        clean[key] = val;
    }
    return clean;
}

/**
 * Recursively converts a GeneratedResult into ResultNodes.
 */
export function transformGeneratedResultToNodes(res: GeneratedResult, fallbackFile?: string): ResultNode[] {
    const nodes: ResultNode[] = [];
    const sourceFile = res._fileName || fallbackFile;
    const tableName = res._tableName || res.header;

    if (res._isSeparateRows && Array.isArray(res.result)) {
        res.result.forEach((line: any, i: number) => {
            const lineStr = String(line);
            nodes.push(createResultNode({
                label: `${res.header} #${i + 1}`,
                displayValue: lineStr,
                tableName,
                sourceFile,
                rawExpression: lineStr
            }));
        });
        return nodes;
    }

    if (res._isCareer && Array.isArray(res.result)) {
        const careerVal = String(res.result[0] ?? '');
        const itemsVal = String(res.result[1] ?? '');
        const careerNode = createResultNode({
            label: res.header,
            displayValue: careerVal,
            tableName,
            sourceFile,
            rawExpression: careerVal
        });
        const itemsNode = createResultNode({
            label: 'Items',
            displayValue: itemsVal,
            tableName,
            sourceFile,
            rawExpression: itemsVal
        });
        careerNode.children = [itemsNode];
        nodes.push(careerNode);
        return nodes;
    }

    if (Array.isArray(res.result)) {
        // If it's a list of sub-results
        const isNestedObjects = res.result.some(x => x && typeof x === 'object' && 'header' in x && 'result' in x);
        if (isNestedObjects) {
            for (const sub of res.result) {
                if (sub && typeof sub === 'object' && 'header' in sub) {
                    const subNodes = transformGeneratedResultToNodes(sub as GeneratedResult, sourceFile);
                    nodes.push(...subNodes);
                }
            }
            return nodes;
        }

        // Multi-element array / columns
        const display = res.result.map(x => String(x)).join(', ');
        nodes.push(createResultNode({
            label: res.header,
            displayValue: display,
            tableName,
            sourceFile,
            rawExpression: display
        }));
        return nodes;
    }

    // Simple scalar result
    const displayStr = String(res.result ?? '');
    nodes.push(createResultNode({
        label: res.header,
        displayValue: displayStr,
        tableName,
        sourceFile,
        rawExpression: displayStr
    }));

    return nodes;
}

/**
 * Phase 2.3 Serialization: Serialize Card to a standalone JSON string.
 */
export function serializeCard(card: Card): string {
    return JSON.stringify(card, null, 2);
}

/**
 * Phase 2.3 Hydration: Parse JSON and validate structure back into a fully intact Card.
 */
export function hydrateCard(json: string | object): Card {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;

    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid Card JSON: root must be an object');
    }
    if (!raw.id || typeof raw.id !== 'string') {
        throw new Error('Invalid Card JSON: missing or invalid "id"');
    }
    if (!raw.title || typeof raw.title !== 'string') {
        throw new Error('Invalid Card JSON: missing or invalid "title"');
    }
    if (!raw.source || typeof raw.source.tableName !== 'string') {
        throw new Error('Invalid Card JSON: missing or invalid "source"');
    }
    if (!Array.isArray(raw.nodes)) {
        throw new Error('Invalid Card JSON: "nodes" must be an array');
    }

    const hydrateNode = (node: any): ResultNode => {
        if (!node || typeof node !== 'object') {
            throw new Error('Invalid ResultNode: must be an object');
        }
        if (!node.id || !node.label || node.displayValue === undefined) {
            throw new Error(`Invalid ResultNode: missing required properties (id, label, displayValue)`);
        }

        const rawExpr = node.generator?.rawExpression;
        const tokens = rawExpr ? parseTemplate(rawExpr) : node.generator?.tokens;

        return {
            id: node.id,
            label: node.label,
            displayValue: String(node.displayValue),
            generator: {
                sourceFile: node.generator?.sourceFile,
                tableName: node.generator?.tableName || node.label,
                rawExpression: rawExpr,
                tokens
            },
            history: Array.isArray(node.history) ? node.history : [{ rolledAt: Date.now(), value: String(node.displayValue) }],
            locked: Boolean(node.locked),
            dependencies: Array.isArray(node.dependencies) ? node.dependencies : undefined,
            provides: node.provides && typeof node.provides === 'object' ? node.provides : undefined,
            children: Array.isArray(node.children) ? node.children.map(hydrateNode) : undefined
        };
    };

    return {
        id: raw.id,
        title: raw.title,
        source: {
            file: raw.source.file || '',
            tableName: raw.source.tableName
        },
        context: raw.context && typeof raw.context === 'object' ? raw.context : {},
        nodes: raw.nodes.map(hydrateNode),
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
    };
}

/**
 * Finds a node by id in the card hierarchy.
 */
export function findNodeById(nodes: ResultNode[], id: string): ResultNode | undefined {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Updates a node's displayValue, recording a new history entry.
 */
export function updateNodeValue(node: ResultNode, newValue: string): void {
    node.displayValue = newValue;
    node.history.push({
        rolledAt: Date.now(),
        value: newValue
    });
}

/**
 * Undoes the last change for a node by reverting to previous history entry.
 */
export function undoNodeValue(node: ResultNode): string | undefined {
    if (!node.history || node.history.length <= 1) return undefined;
    // Pop current
    const current = node.history.pop();
    const previous = node.history[node.history.length - 1];
    if (previous) {
        node.displayValue = previous.value;
        return previous.value;
    }
    return undefined;
}

/**
 * Exports a Card to clean Markdown statblock format.
 */
export function exportCardToMarkdown(card: Card): string {
    let md = `## ${card.title}\n`;
    if (card.source.tableName && card.source.tableName !== card.title) {
        md += `*Source: ${card.source.tableName}*\n\n`;
    } else {
        md += '\n';
    }

    const renderNodeMd = (node: ResultNode, indentLevel = 0): string => {
        const indent = '  '.repeat(indentLevel);
        let out = `${indent}- **${node.label}**: ${node.displayValue}\n`;
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                out += renderNodeMd(child, indentLevel + 1);
            }
        }
        return out;
    };

    for (const node of card.nodes) {
        md += renderNodeMd(node, 0);
    }
    return md;
}
