// src/compiler/yamlSource.ts
//
// Loads YAML with enough position information to point diagnostics at a line,
// without adding a CST dependency. js-yaml's `listener` hook reports the start
// offset of every composed node; we record it for every mapping/sequence, and
// locate scalar children by scanning the block structure of the source text.

import yaml from 'js-yaml';

export interface YamlSource {
    doc: unknown;
    /** Best-effort 1-based line for a path into the document. */
    locate(path: (string | number)[]): number | undefined;
}

export class YamlSyntaxError extends Error {
    constructor(message: string, public line?: number) {
        super(message);
    }
}

export function loadYamlWithLocations(content: string, filename = '<inline>'): YamlSource {
    const lineStarts = [0];
    for (let i = 0; i < content.length; i++) if (content[i] === '\n') lineStarts.push(i + 1);
    const lines = content.split('\n');

    const lineOf = (pos: number): number => {
        // Skip leading whitespace / sequence dashes so the line points at the node itself.
        while (pos < content.length && (/\s/.test(content[pos]) || (content[pos] === '-' && /\s/.test(content[pos + 1] || '')))) pos++;
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
        }
        return lo + 1;
    };

    const objectLines = new WeakMap<object, number>();
    const openStack: number[] = [];

    let doc: unknown;
    try {
        doc = yaml.load(content, {
            filename,
            listener(event: string, state: any) {
                if (event === 'open') {
                    openStack.push(state.position);
                } else if (event === 'close') {
                    const pos = openStack.pop();
                    const result = state.result;
                    if (pos !== undefined && result && typeof result === 'object') {
                        // Outer frames close last and win, which gives the earliest start.
                        objectLines.set(result, lineOf(pos));
                    }
                }
            }
        } as yaml.LoadOptions);
    } catch (e: any) {
        const line = e?.mark?.line !== undefined ? e.mark.line + 1 : undefined;
        throw new YamlSyntaxError(e.reason || e.message, line);
    }

    const indentOf = (s: string) => s.length - s.trimStart().length;
    const isBlank = (s: string) => s.trim() === '' || s.trim().startsWith('#');

    /** Line of element `index` in a block sequence that starts at `startLine`. */
    const locateSequenceItem = (startLine: number, index: number): number | undefined => {
        let i = startLine - 1;
        // Find first "- " at or after the start line.
        while (i < lines.length && !/^\s*- |^\s*-$/.test(lines[i])) {
            if (lines[i].includes('[')) return undefined; // flow sequence; give up
            i++;
        }
        if (i >= lines.length) return undefined;
        const indent = indentOf(lines[i]);
        let count = -1;
        for (; i < lines.length; i++) {
            const l = lines[i];
            if (isBlank(l)) continue;
            const ind = indentOf(l);
            if (ind < indent) break;
            if (ind === indent) {
                if (!/^\s*-( |$)/.test(l)) break;
                count++;
                if (count === index) return i + 1;
            }
        }
        return undefined;
    };

    /** Line of `key:` within a mapping starting at `startLine`. */
    const locateKey = (startLine: number, key: string): number | undefined => {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^\\s*(- )?["']?${escaped}["']?\\s*:`);
        const baseIndent = indentOf(lines[startLine - 1] || '');
        for (let i = startLine - 1; i < lines.length; i++) {
            if (i > startLine - 1 && !isBlank(lines[i]) && indentOf(lines[i]) < baseIndent) break;
            if (re.test(lines[i])) return i + 1;
        }
        return undefined;
    };

    const locate = (path: (string | number)[]): number | undefined => {
        let node: any = doc;
        let line: number | undefined = node && typeof node === 'object' ? objectLines.get(node) ?? 1 : 1;
        for (const part of path) {
            if (node === null || typeof node !== 'object') return line;
            const child = node[part as any];
            let childLine: number | undefined;
            if (child && typeof child === 'object') childLine = objectLines.get(child);
            if (childLine === undefined && line !== undefined) {
                childLine = Array.isArray(node) && typeof part === 'number'
                    ? locateSequenceItem(line, part)
                    : locateKey(line, String(part));
            }
            if (childLine === undefined) return line;
            line = childLine;
            node = child;
        }
        return line;
    };

    return { doc, locate };
}
