// src/engine/template.ts
//
// Template tokenizer: parses result strings such as
//   "You find {1d6} coins and a {Weapons|Blades}. [set:Gold, {2d10}]"
// into an AST instead of flattening them to strings immediately.
//
// The scanning rules intentionally mirror Renderer.processStringRecursive so that
// static analysis (the table linter) sees exactly what the runtime will execute:
//   - `{...}` and `[...]` are matched by counting only their own bracket type.
//   - An unbalanced opener is treated as a literal character.
//   - `[digits]` directly after a word character is a literal index (e.g. `thisResult[0]`).
//   - `{useReferenceTable{A}{B}}`, `[set:Name, value]` and `[if:cond, a, b]` are directives.
//   - A string that is *entirely* `[...]` and mentions `thisResult` is a sequential array.
//
// This is the foundation for Phase 2.2 (AST tokens on ResultNodes / micro re-rolls).

export interface Span {
    start: number; // inclusive offset into the source string
    end: number;   // exclusive offset
}

export type TemplateNode =
    | TextNode
    | ExpressionNode
    | ReferenceTableNode
    | ChoiceNode
    | SetNode
    | IfNode
    | SequenceNode
    | InvalidNode;

export interface TextNode extends Span { kind: 'text'; value: string; }

/** `{...}` — dice, math, table lookup, variable, probability, selectedResult. */
export interface ExpressionNode extends Span {
    kind: 'expression';
    raw: string;              // full source including braces
    inner: string;            // source between the braces
    children: TemplateNode[]; // parsed inner content (nested templates are evaluated first)
    /** The literal token if the inner content contains no nested templates, else undefined. */
    staticToken?: string;
}

/** `{useReferenceTable{Table}{Key}}` */
export interface ReferenceTableNode extends Span {
    kind: 'referenceTable';
    raw: string;
    tableArg: TemplateNode[];
    keyArg: TemplateNode[];
    staticTable?: string;
    staticKey?: string;
}

/** `[a, b, c]` — pick one (options are split on commas *after* evaluating content). */
export interface ChoiceNode extends Span { kind: 'choice'; raw: string; children: TemplateNode[]; }

/** `[set:Name, value]` */
export interface SetNode extends Span { kind: 'set'; raw: string; name: string; value: TemplateNode[]; }

/** `[if:condition, then, else]` */
export interface IfNode extends Span {
    kind: 'if';
    raw: string;
    condition: TemplateNode[];
    then: TemplateNode[];
    else: TemplateNode[];
}

/** Whole-string `[a, {thisResult[0]}..., c]` evaluated sequentially into an array. */
export interface SequenceNode extends Span { kind: 'sequence'; raw: string; items: TemplateNode[][]; }

/** Syntax the runtime would render as an error marker. */
export interface InvalidNode extends Span { kind: 'invalid'; raw: string; reason: string; }

/** Split on commas that are not nested inside `{}` or `[]` (mirrors Renderer.splitByCommaIgnoringGenerics). */
export function splitTopLevelCommas(str: string): string[] {
    const parts: string[] = [];
    let current = '';
    let braces = 0;
    let brackets = 0;
    for (const c of str) {
        if (c === '{') braces++;
        else if (c === '}') braces--;
        else if (c === '[') brackets++;
        else if (c === ']') brackets--;
        else if (c === ',' && braces === 0 && brackets === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += c;
    }
    parts.push(current);
    return parts;
}

function findClose(str: string, start: number, open: string, close: string): number {
    let depth = 1;
    for (let i = start + 1; i < str.length; i++) {
        if (str[i] === open) depth++;
        else if (str[i] === close) depth--;
        if (depth === 0) return i;
    }
    return -1;
}

/** True if the nodes contain anything that is evaluated at runtime. */
export function isDynamic(nodes: TemplateNode[]): boolean {
    return nodes.some(n => n.kind !== 'text');
}

function staticText(nodes: TemplateNode[]): string | undefined {
    if (isDynamic(nodes)) return undefined;
    return nodes.map(n => (n as TextNode).value).join('');
}

/**
 * Parse a template string into nodes. `offset` shifts all spans so nested parses
 * report positions relative to the outermost string.
 */
export function parseTemplate(str: string, offset = 0): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    let text = '';
    let textStart = 0;
    let index = 0;

    const pushText = (s: string, at: number) => {
        if (!text) textStart = at;
        text += s;
    };
    const flushText = () => {
        if (text) nodes.push({ kind: 'text', value: text, start: offset + textStart, end: offset + textStart + text.length });
        text = '';
    };

    while (index < str.length) {
        const nextBrace = str.indexOf('{', index);
        const nextBracket = str.indexOf('[', index);
        if (nextBrace === -1 && nextBracket === -1) {
            pushText(str.substring(index), index);
            break;
        }
        const isBrace = nextBrace !== -1 && (nextBracket === -1 || nextBrace < nextBracket);
        const start = isBrace ? nextBrace : nextBracket;
        if (start > index) pushText(str.substring(index, start), index);

        const end = isBrace ? findClose(str, start, '{', '}') : findClose(str, start, '[', ']');
        if (end === -1) {
            // Unbalanced: runtime emits the character literally and moves on.
            pushText(str[start], start);
            index = start + 1;
            continue;
        }

        const raw = str.substring(start, end + 1);
        const inner = str.substring(start + 1, end);
        const innerOffset = offset + start + 1;
        const span = { start: offset + start, end: offset + end + 1 };

        if (isBrace) {
            flushText();
            if (inner.startsWith('useReferenceTable')) {
                nodes.push(parseReferenceTable(raw, inner, innerOffset, span));
            } else {
                const children = parseTemplate(inner, innerOffset);
                nodes.push({ kind: 'expression', raw, inner, children, staticToken: staticText(children), ...span });
            }
        } else {
            // Bracket: index, set, if, sequence or choice.
            const prevChar = text.length > 0 ? text[text.length - 1] : (nodes.length === 0 ? '' : '\u0000');
            if (/^\d+$/.test(inner) && /[a-zA-Z0-9_]/.test(prevChar)) {
                pushText(raw, start);
            } else {
                flushText();
                nodes.push(parseBracket(str, raw, inner, innerOffset, span, start === 0 && end === str.length - 1));
            }
        }
        index = end + 1;
    }
    flushText();
    return nodes;
}

function parseReferenceTable(raw: string, inner: string, innerOffset: number, span: Span): TemplateNode {
    let cursor = 'useReferenceTable'.length;
    const extractArg = (): { text: string; at: number } | null => {
        if (cursor >= inner.length || inner[cursor] !== '{') return null;
        const close = findClose(inner, cursor, '{', '}');
        if (close === -1) return null;
        const arg = { text: inner.substring(cursor + 1, close), at: cursor + 1 };
        cursor = close + 1;
        return arg;
    };
    const table = extractArg();
    const key = extractArg();
    if (!table || !key) {
        return { kind: 'invalid', raw, reason: 'useReferenceTable requires two arguments: {useReferenceTable{Table}{Key}}', ...span };
    }
    const tableArg = parseTemplate(table.text, innerOffset + table.at);
    const keyArg = parseTemplate(key.text, innerOffset + key.at);
    return {
        kind: 'referenceTable', raw, tableArg, keyArg,
        staticTable: staticText(tableArg), staticKey: staticText(keyArg), ...span
    };
}

function parseParts(content: string, contentOffset: number): TemplateNode[][] {
    let cursor = 0;
    return splitTopLevelCommas(content).map(part => {
        const nodes = parseTemplate(part, contentOffset + cursor);
        cursor += part.length + 1;
        return nodes;
    });
}

function parseBracket(_src: string, raw: string, inner: string, innerOffset: number, span: Span, isWholeString: boolean): TemplateNode {
    if (inner.startsWith('set:')) {
        const parts = splitTopLevelCommas(inner.substring(4));
        if (parts.length < 2) return { kind: 'invalid', raw, reason: 'set requires a name and a value: [set:Name, value]', ...span };
        const valueSrc = parts.slice(1).join(',');
        const valueOffset = innerOffset + 4 + parts[0].length + 1;
        return { kind: 'set', raw, name: parts[0].trim(), value: parseTemplate(valueSrc.trim(), valueOffset + (valueSrc.length - valueSrc.trimStart().length)), ...span };
    }
    if (inner.startsWith('if:')) {
        const parts = parseParts(inner.substring(3), innerOffset + 3);
        if (parts.length < 2) return { kind: 'invalid', raw, reason: 'if requires a condition and a value: [if:cond, then, else]', ...span };
        return { kind: 'if', raw, condition: parts[0], then: parts[1], else: parts[2] || [], ...span };
    }
    if (isWholeString && inner.includes('thisResult')) {
        return { kind: 'sequence', raw, items: parseParts(inner, innerOffset), ...span };
    }
    return { kind: 'choice', raw, children: parseTemplate(inner, innerOffset), ...span };
}

/** Depth-first walk over every node, including nested children. */
export function walkTemplate(nodes: TemplateNode[], visit: (node: TemplateNode) => void): void {
    for (const node of nodes) {
        visit(node);
        switch (node.kind) {
            case 'expression': walkTemplate(node.children, visit); break;
            case 'referenceTable': walkTemplate(node.tableArg, visit); walkTemplate(node.keyArg, visit); break;
            case 'choice': walkTemplate(node.children, visit); break;
            case 'set': walkTemplate(node.value, visit); break;
            case 'if': walkTemplate(node.condition, visit); walkTemplate(node.then, visit); walkTemplate(node.else, visit); break;
            case 'sequence': node.items.forEach(item => walkTemplate(item, visit)); break;
        }
    }
}

// ---------------------------------------------------------------------------
// Token classification (mirrors Renderer.evaluateToken dispatch order)
// ---------------------------------------------------------------------------

export const DICE_PATTERN = /^(\d+)d(\d+)(?:([+-])(\d+))?$/i;
const PROBABILITY_PATTERN = /^(.+?),\s*((?:0\.)?\d+)$/;
const EXPRESSION_CHARS = /[+\-*/%<>=!]/;
const LOOKUP_PATTERN = /^(.+?)(\[(\d+)\])?(?:\|(.+))?$/;
const EXPRESSION_TOKEN = /(>=|<=|==|!=|[+\-*/%><()]|[a-zA-Z0-9_.]+|"[^"]*")/g;

export type ClassifiedToken =
    | { type: 'dice'; token: string }
    | { type: 'probability'; token: string; target: ClassifiedToken; probability: number }
    | { type: 'expression'; token: string; identifiers: string[] }
    | { type: 'selectedResult'; token: string; table: string }
    | { type: 'lookup'; token: string; base: string; index?: number; sub?: string }
    | { type: 'empty'; token: string };

/** Classify a fully-evaluated `{token}` the same way the renderer will. */
export function classifyToken(token: string): ClassifiedToken {
    if (token.trim() === '') return { type: 'empty', token };
    if (DICE_PATTERN.test(token)) return { type: 'dice', token };

    const prob = token.match(PROBABILITY_PATTERN);
    if (prob && !isNaN(parseFloat(prob[2]))) {
        return { type: 'probability', token, target: classifyToken(prob[1].trim()), probability: parseFloat(prob[2]) };
    }

    if (EXPRESSION_CHARS.test(token) && !token.includes('|')) {
        const parts = token.match(EXPRESSION_TOKEN) || [];
        const identifiers = parts.filter(p => !/^(>=|<=|==|!=|[+\-*/%><()])$/.test(p) && !p.startsWith('"'));
        return { type: 'expression', token, identifiers };
    }

    if (token.startsWith('selectedResult,')) {
        return { type: 'selectedResult', token, table: token.substring('selectedResult,'.length).trim() };
    }

    const m = token.match(LOOKUP_PATTERN)!;
    return { type: 'lookup', token, base: m[1], index: m[3] !== undefined ? parseInt(m[3], 10) : undefined, sub: m[4] };
}
