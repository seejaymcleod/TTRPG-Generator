// src/compiler/references.ts
//
// Cross-table reference linter. Parses every template string (results entries and
// customDisplay) with the shared template tokenizer and checks that each
// `{Reference}`, `{Table|Sub}`, `{selectedResult, X}`, `{useReferenceTable{A}{B}}`
// and math identifier will actually resolve at runtime.
//
// Resolution uses the real TableLoader, so lint results match runtime lookup
// semantics exactly, including its quirks (global-first lookup, fuzzy partial
// matching), which are surfaced as warnings.

import { TableLoader } from '../engine/loader';
import { SubTable, Table } from '../engine/types';
import {
    classifyToken,
    ClassifiedToken,
    DICE_PATTERN,
    parseTemplate,
    TemplateNode,
    walkTemplate,
} from '../engine/template';
import { DiagnosticBag, Severity, didYouMean } from './diagnostics';
import { YamlSource } from './yamlSource';
import { childTables } from './validate';

type Path = (string | number)[];

export interface LintInput {
    file: string;
    tables: Table[];
    source?: YamlSource;
}

interface TemplateSite {
    file: string;
    source?: YamlSource;
    table: SubTable;
    path: Path;
    template: string;
}

const BUILTIN_VARIABLES = new Set(['thisResult', 'memory']);

export function lintReferences(inputs: LintInput[], bag: DiagnosticBag): void {
    const loader = new TableLoader();
    loader.loadTables(inputs.flatMap(i => i.tables));

    // --- Indexes -----------------------------------------------------------
    const owner = new Map<object, string>();          // table object → file
    const namesByFile = new Map<string, Set<string>>(); // file → table names defined in it
    const allNames = new Set<string>();
    const rootNames = new Map<string, string[]>();      // root tablename → files
    const referenceTables = new Map<string, string[]>(); // reference table name → files
    const inputNames = new Set<string>();
    const setVariables = new Set<string>();
    const sites: TemplateSite[] = [];

    for (const input of inputs) {
        const names = new Set<string>();
        namesByFile.set(input.file, names);
        const base = input.file.split(/[\\/]/).pop()!.replace(/\.ya?ml$/, '');
        allNames.add(base);

        input.tables.forEach((root, rootIdx) => {
            const rootPath: Path = input.tables.length > 1 ? [rootIdx] : [];
            if (root.tablename) rootNames.set(root.tablename, [...(rootNames.get(root.tablename) || []), input.file]);
            if (Array.isArray(root.inputField) && typeof root.inputField[0] === 'string') inputNames.add(root.inputField[0]);
            for (const rt of root.referenceTables || []) {
                if (rt?.tablename) referenceTables.set(rt.tablename, [...(referenceTables.get(rt.tablename) || []), input.file]);
            }

            const walk = (table: any, path: Path) => {
                if (!table || typeof table !== 'object') return;
                owner.set(table, input.file);
                for (const n of [table.tablename, table.name]) {
                    if (typeof n === 'string' && n) { names.add(n); allNames.add(n); }
                }
                const addSite = (template: unknown, p: Path) => {
                    if (typeof template === 'string' && /[{[]/.test(template)) {
                        sites.push({ file: input.file, source: input.source, table, path: p, template });
                    }
                };
                if (typeof table.customDisplay === 'string') addSite(table.customDisplay, [...path, 'customDisplay']);
                (Array.isArray(table.results) ? table.results : []).forEach((entry: unknown, i: number) => {
                    forEachString(entry, [...path, 'results', i], addSite);
                });
                for (const { key, list } of childTables(table)) list.forEach((c, i) => walk(c, [...path, key, i]));
            };
            walk(root, rootPath);
        });
    }

    const parsedSites = sites.map(site => ({ site, nodes: parseTemplate(site.template) }));
    for (const { nodes } of parsedSites) {
        walkTemplate(nodes, n => { if (n.kind === 'set' && n.name) setVariables.add(n.name); });
    }

    // --- Global duplicates ---------------------------------------------------
    for (const [name, files] of rootNames) {
        if (files.length > 1) {
            bag.add({
                severity: 'warning', code: 'duplicate-table-name', file: files[0], path: ['tablename'],
                message: `Root table name "${name}" is also used in ${files.slice(1).join(', ')}; references resolve to only one of them.`,
            });
        }
    }
    for (const [name, files] of referenceTables) {
        if (files.length > 1) {
            bag.add({
                severity: 'warning', code: 'duplicate-reference-table', file: files[0], path: ['referenceTables'],
                message: `Reference table "${name}" is defined in ${files.length} places (${[...new Set(files)].join(', ')}); the first one loaded wins.`,
            });
        }
    }

    // --- Per-site checks -----------------------------------------------------
    // Deduplicate identical problems in the same file and report the occurrence count.
    const pending = new Map<string, { severity: Severity; code: string; message: string; hint?: string; site: TemplateSite; count: number }>();
    const report = (site: TemplateSite, severity: Severity, code: string, message: string, hint?: string) => {
        const key = `${site.file}\u0000${code}\u0000${message}`;
        const existing = pending.get(key);
        if (existing) existing.count++;
        else pending.set(key, { severity, code, message, hint, site, count: 1 });
    };

    const isKnownVariable = (name: string) => BUILTIN_VARIABLES.has(name) || inputNames.has(name) || setVariables.has(name);

    const isExactMatch = (t: SubTable, name: string) =>
        t.tablename === name || t.name === name ||
        (typeof t.filename === 'string' && (t.filename === name || t.filename.replace(/\.ya?ml$/, '') === name));

    const resolveTable = (name: string, site: TemplateSite): SubTable | undefined => {
        return loader.findTable(name) || loader.findSubTable(site.table, name);
    };

    const checkTableRef = (name: string, site: TemplateSite, raw: string, sub?: string): SubTable | undefined => {
        if (isKnownVariable(name)) return undefined;
        const found = resolveTable(name, site);
        if (!found) {
            const suggestion = didYouMean(name, allNames);
            report(site, 'error', 'unresolved-reference', `${raw} does not match any table, subtable, input or [set:] variable.`,
                suggestion ? `Did you mean "${suggestion}"?` : undefined);
            return undefined;
        }
        if (!isExactMatch(found, name)) {
            report(site, 'warning', 'fuzzy-reference',
                `${raw} has no exact match and only resolves by partial name match to "${found.tablename}".`,
                `Reference "${found.tablename}" explicitly.`);
        }
        const foundOwner = owner.get(found);
        if (foundOwner && foundOwner !== site.file && namesByFile.get(site.file)?.has(name)) {
            report(site, 'warning', 'shadowed-reference',
                `${raw} resolves to "${name}" in ${foundOwner}, not the table of the same name in this file (lookups are global-first).`,
                'Give the local table a unique name.');
        }
        if (sub) {
            if (!loader.findSubTable(found, sub)) {
                report(site, 'error', 'unresolved-subtable',
                    `${raw}: "${found.tablename}" has no subtable "${sub}"; the renderer silently rolls "${found.tablename}" instead.`);
            }
        }
        return found;
    };

    const checkExpression = (token: Extract<ClassifiedToken, { type: 'expression' }>, site: TemplateSite, raw: string) => {
        const whole = token.token.trim();
        const asTable = loader.findTable(whole);
        if (asTable && isExactMatch(asTable, whole)) {
            report(site, 'error', 'operator-in-table-name',
                `${raw} names a table, but it contains a math character (+ - * / % < > = !) so it is evaluated as arithmetic (→ 0).`,
                'Rename the table to avoid these characters.');
            return;
        }
        for (const id of token.identifiers) {
            if (/^-?\d+(\.\d+)?$/.test(id)) continue;
            if (DICE_PATTERN.test(id)) {
                report(site, 'error', 'dice-in-expression',
                    `${raw}: "${id}" inside a math expression is read as the number ${parseFloat(id)}, not rolled.`,
                    `Wrap the dice in braces: {{${id}} ...}`);
                continue;
            }
            if (!isNaN(parseFloat(id))) {
                report(site, 'warning', 'malformed-number', `${raw}: "${id}" is read as ${parseFloat(id)}.`);
                continue;
            }
            if (BUILTIN_VARIABLES.has(id) || inputNames.has(id)) continue;
            if (setVariables.has(id)) {
                report(site, 'warning', 'set-variable-in-expression',
                    `${raw}: math expressions read the context, not [set:] variables, so "${id}" evaluates to 0.`,
                    `Interpolate it first: {{${id}} ...}`);
                continue;
            }
            if (resolveTable(id, site)) {
                report(site, 'warning', 'table-in-expression',
                    `${raw}: "${id}" is a table, but math expressions only read already-generated context values; it is not rolled and may evaluate to 0.`,
                    `Interpolate it first: {{${id}} ...}`);
                continue;
            }
            report(site, 'warning', 'unknown-identifier', `${raw}: "${id}" is not an input, variable or table and evaluates to 0.`);
        }
    };

    const checkToken = (token: ClassifiedToken, site: TemplateSite, raw: string) => {
        switch (token.type) {
            case 'empty':
                report(site, 'warning', 'empty-expression', `${raw} is empty.`);
                break;
            case 'dice':
                break;
            case 'probability':
                checkToken(token.target, site, raw);
                break;
            case 'expression':
                checkExpression(token, site, raw);
                break;
            case 'selectedResult': {
                const t = checkTableRef(token.table, site, raw);
                if (t && Array.isArray(t.results)) {
                    for (const r of t.results) {
                        if (typeof r !== 'string' || /[{[]/.test(r)) continue;
                        if (!resolveTable(r, site)) {
                            report(site, 'warning', 'unresolved-selected-target',
                                `${raw}: result "${r}" of "${t.tablename}" does not name a table, so selecting it yields "[... target not found]".`);
                        }
                    }
                }
                break;
            }
            case 'lookup':
                checkTableRef(token.base, site, raw, token.sub);
                break;
        }
    };

    for (const { site, nodes } of parsedSites) {
        walkTemplate(nodes, (node: TemplateNode) => {
            switch (node.kind) {
                case 'invalid':
                    report(site, 'error', 'invalid-syntax', `${node.raw}: ${node.reason}`);
                    break;
                case 'expression':
                    if (node.staticToken !== undefined) checkToken(classifyToken(node.staticToken), site, node.raw);
                    break;
                case 'referenceTable':
                    if (node.staticTable !== undefined && !referenceTables.has(node.staticTable)) {
                        const suggestion = didYouMean(node.staticTable, referenceTables.keys());
                        report(site, 'error', 'unresolved-reference-table', `${node.raw}: no reference table named "${node.staticTable}".`,
                            suggestion ? `Did you mean "${suggestion}"?` : undefined);
                    }
                    break;
            }
        });
    }

    for (const p of pending.values()) {
        bag.add({
            severity: p.severity,
            code: p.code,
            message: p.count > 1 ? `${p.message} (${p.count} occurrences)` : p.message,
            hint: p.hint,
            file: p.site.file,
            path: p.site.path,
            line: p.site.source?.locate(p.site.path),
        });
    }
}

function forEachString(value: unknown, path: Path, visit: (s: unknown, p: Path) => void) {
    if (typeof value === 'string') visit(value, path);
    else if (Array.isArray(value)) value.forEach((v, i) => forEachString(v, [...path, i], visit));
    else if (value && typeof value === 'object' && Array.isArray((value as any).separateRows)) {
        (value as any).separateRows.forEach((v: unknown, i: number) => forEachString(v, [...path, 'separateRows', i], visit));
    }
}
