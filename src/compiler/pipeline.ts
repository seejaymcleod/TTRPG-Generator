// src/compiler/pipeline.ts
//
// Table compilation pipeline shared by `npm run build:tables`, `npm run lint:tables`
// and tests:
//   1. load + validate each YAML file (syntax, schema, semantic checks)
//   2. normalize (inject filename, split types, auto-name subtables, ^N weights)
//   3. lint cross-table references against the full normalized set

import fs from 'fs';
import path from 'path';
import { Table } from '../engine/types';
import { Diagnostic, DiagnosticBag } from './diagnostics';
import { lintReferences, LintInput } from './references';
import { validateFile } from './validate';

export interface SourceFile {
    /** Path used in diagnostics (relative to the tables root). */
    file: string;
    content: string;
}

export interface CompileResult {
    tables: Table[];
    diagnostics: Diagnostic[];
    fileCount: number;
    hasErrors: boolean;
}

export function findTableFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) results.push(...findTableFiles(full));
        else if (/\.ya?ml$/.test(entry)) results.push(full);
    }
    return results;
}

export function readTableSources(dir: string): SourceFile[] {
    return findTableFiles(dir).map(full => ({
        file: path.relative(dir, full),
        content: fs.readFileSync(full, 'utf8'),
    }));
}

/** Normalize a root table in place (same transformations the build has always applied). */
export function normalizeTable(table: any, filename: string): void {
    table.filename = filename;
    if (typeof table.type === 'string' && table.type.includes(',')) {
        table.type = table.type.split(',').map((t: string) => t.trim());
    }
    normalizeSubTable(table, filename.replace(/\.(yaml|yml)$/, ''), 0);
}

function normalizeSubTable(table: any, parentName: string, index: number): void {
    if (!table.tablename) {
        table.tablename = `${parentName}_SubTable_${index + 1}`;
    }

    // Shorthand weights: "Item ^5" → ["Item", 5]
    if (Array.isArray(table.results)) {
        table.results.forEach((entry: unknown, i: number) => {
            if (typeof entry !== 'string') return;
            const match = entry.match(/^(.+?)\s*\^(\d+(?:\.\d+)?)$/);
            if (match) table.results[i] = [match[1], parseFloat(match[2])];
        });
    }

    for (const key of ['tables', 'subTables']) {
        if (Array.isArray(table[key])) {
            table[key].forEach((sub: any, i: number) => {
                if (sub && typeof sub === 'object') normalizeSubTable(sub, table.tablename, i);
            });
        }
    }
}

export interface CompileOptions {
    lintReferences?: boolean;
}

export function compileSources(sources: SourceFile[], options: CompileOptions = { lintReferences: true }): CompileResult {
    const bag = new DiagnosticBag();
    const tables: Table[] = [];
    const lintInputs: LintInput[] = [];

    for (const src of sources) {
        const validated = validateFile(src.file, src.content, bag);
        const filename = path.basename(src.file);
        validated.tables.forEach(t => normalizeTable(t, filename));
        tables.push(...(validated.tables as unknown as Table[]));
        lintInputs.push({ file: src.file, tables: validated.tables as unknown as Table[], source: validated.source });
    }

    if (options.lintReferences !== false) {
        lintReferences(lintInputs, bag);
    }

    return { tables, diagnostics: bag.items, fileCount: sources.length, hasErrors: bag.hasErrors };
}

export function compileDirectory(dir: string, options?: CompileOptions): CompileResult {
    return compileSources(readTableSources(dir), options);
}

export function compileDirectories(dirs: string[], options?: CompileOptions): CompileResult {
    const sources: SourceFile[] = [];
    for (const dir of dirs) {
        if (fs.existsSync(dir)) {
            sources.push(...readTableSources(dir));
        }
    }
    return compileSources(sources, options);
}
