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

import { normalizeTable, normalizeSubTable } from '../engine/normalize';
export { normalizeTable, normalizeSubTable };

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
