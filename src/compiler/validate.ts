// src/compiler/validate.ts
//
// Per-file validation: YAML syntax, schema conformance, and semantic checks that
// a schema cannot express (YAML coercion accidents, broken tuples, empty tables,
// unknown keys, reference-table key overlaps...). Every problem becomes a
// Diagnostic with file + line + YAML path.

import { z } from 'zod';
import { Diagnostic, DiagnosticBag, Severity, didYouMean } from './diagnostics';
import { loadYamlWithLocations, YamlSource, YamlSyntaxError } from './yamlSource';
import {
    EntrySchema,
    KNOWN_ROOT_KEYS,
    KNOWN_SUBTABLE_KEYS,
    RootTableSchema,
    TableDefinition,
} from './schema';

type Path = (string | number)[];

export interface ValidatedFile {
    /** Path relative to the tables root, used in diagnostics. */
    file: string;
    /** Raw root tables (one per document entry). Empty if the file could not be parsed. */
    tables: TableDefinition[];
    /** Whether the file passed schema validation (no errors). */
    valid: boolean;
    source?: YamlSource;
}

const CHILD_KEYS = ['tables', 'subTables', 'subtables'] as const;

export function childTables(table: any): { key: string; list: any[] }[] {
    return CHILD_KEYS
        .filter(k => Array.isArray(table?.[k]))
        .map(k => ({ key: k, list: table[k] }));
}

function getAt(root: unknown, path: Path): unknown {
    return path.reduce<any>((node, part) => (node == null ? undefined : node[part as any]), root);
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Explain why a `results` entry is invalid, in table-author terms. */
export function describeEntryProblem(entry: unknown): { code: string; message: string; hint?: string } {
    const inner = (v: unknown): { code: string; message: string; hint?: string } | undefined => {
        if (typeof v === 'boolean') {
            return {
                code: 'yaml-boolean',
                message: `YAML parsed this value as the boolean ${v}.`,
                hint: `Quote it if it is text, e.g. - "${v}"`,
            };
        }
        if (v === null || v === undefined) {
            return { code: 'empty-entry', message: 'Entry is empty (a bare "-" or "~").', hint: 'Remove the line or give it a value.' };
        }
        if (isPlainObject(v)) {
            const keys = Object.keys(v);
            if ('roll' in v || 'exclude' in v) {
                return {
                    code: 'invalid-directive',
                    message: `Invalid roll directive ${JSON.stringify(v)}.`,
                    hint: 'Use { roll: <positive integer>, exclude: true|false } inside an array entry.',
                };
            }
            if ('separateRows' in v) {
                return {
                    code: 'invalid-separate-rows',
                    message: 'separateRows must be a non-empty list of strings and the only key in the entry.',
                };
            }
            const preview = keys.length === 1 ? `${keys[0]}: ${String((v as any)[keys[0]])}` : keys.join(', ');
            return {
                code: 'accidental-mapping',
                message: `YAML parsed this entry as a mapping because it contains ": " — "${preview.slice(0, 80)}".`,
                hint: 'Wrap the whole entry in quotes.',
            };
        }
        return undefined;
    };

    const direct = inner(entry);
    if (direct) return direct;

    if (Array.isArray(entry)) {
        if (entry.length === 0) return { code: 'empty-entry', message: 'Entry is an empty list.' };
        for (const item of entry) {
            if (Array.isArray(item)) {
                if (entry.length === 2 && typeof entry[1] === 'number') {
                    const nested = item.map(inner).find(Boolean);
                    if (nested) return nested;
                    continue;
                }
                return { code: 'invalid-entry', message: 'Nested lists are only allowed as the value of a weighted tuple: [[a, b, c], weight].' };
            }
            const problem = inner(item);
            if (problem) return problem;
        }
        if (entry.length === 2 && typeof entry[1] === 'number' && !(entry[1] > 0)) {
            return { code: 'invalid-weight', message: `Weight must be a positive number (got ${entry[1]}).` };
        }
    }
    return { code: 'invalid-entry', message: `Unsupported entry ${JSON.stringify(entry)?.slice(0, 80)}.` };
}

export function validateFile(file: string, content: string, bag: DiagnosticBag): ValidatedFile {
    let source: YamlSource;
    try {
        source = loadYamlWithLocations(content, file);
    } catch (e) {
        const err = e as YamlSyntaxError;
        bag.add({ severity: 'error', code: 'yaml-syntax', message: err.message, file, line: err.line, path: [] });
        return { file, tables: [], valid: false };
    }

    const doc = source.doc;
    const errorsBefore = bag.errors.length;
    const report = (severity: Severity, code: string, message: string, path: Path, hint?: string) => {
        bag.add({ severity, code, message, file, path, line: source.locate(path), hint });
    };

    if (doc === null || doc === undefined) {
        report('error', 'empty-file', 'File is empty.', []);
        return { file, tables: [], valid: false, source };
    }

    const roots: { table: any; path: Path }[] = Array.isArray(doc)
        ? doc.map((t, i) => ({ table: t, path: [i] }))
        : [{ table: doc, path: [] }];

    for (const { table, path } of roots) {
        // 1. Schema conformance
        const parsed = RootTableSchema.safeParse(table);
        if (!parsed.success) reportZodIssues(parsed.error, table, path, report);

        // 2. Semantic checks (defensive: the doc may not match the schema)
        if (isPlainObject(table)) {
            checkTable(table, path, true, report);
            if (typeof table.filename === 'string') {
                const actual = file.split(/[\\/]/).pop();
                if (actual && table.filename !== actual) {
                    report('info', 'filename-mismatch', `Declared filename "${table.filename}" differs from the actual file name "${actual}"; the actual name is used.`, [...path, 'filename']);
                }
            }
        }
    }

    return {
        file,
        tables: roots.map(r => r.table).filter(isPlainObject) as TableDefinition[],
        valid: bag.errors.length === errorsBefore,
        source,
    };
}

type Reporter = (severity: Severity, code: string, message: string, path: Path, hint?: string) => void;

function reportZodIssues(error: z.ZodError, root: unknown, basePath: Path, report: Reporter) {
    const seenEntries = new Set<string>();
    for (const issue of error.issues) {
        const path = issue.path as Path;
        const resultsIdx = path.lastIndexOf('results');
        const isEntry = resultsIdx !== -1 && typeof path[resultsIdx + 1] === 'number';

        if (isEntry) {
            const entryPath = path.slice(0, resultsIdx + 2);
            const key = entryPath.join('.');
            if (seenEntries.has(key)) continue;
            seenEntries.add(key);
            const entry = getAt(root, entryPath);
            const problem = describeEntryProblem(entry);
            report('error', problem.code, problem.message, [...basePath, ...entryPath], problem.hint);
            continue;
        }

        const last = path[path.length - 1];
        const value = getAt(root, path);
        let message = issue.message;
        if (issue.code === 'invalid_type' && value === undefined) {
            message = `Missing required field "${String(last)}".`;
        } else if (last !== undefined) {
            message = `"${String(last)}": ${issue.message}`;
        }
        report('error', 'schema', message, [...basePath, ...path]);
    }
}

function checkTable(table: Record<string, any>, path: Path, isRoot: boolean, report: Reporter) {
    const known = isRoot ? KNOWN_ROOT_KEYS : KNOWN_SUBTABLE_KEYS;
    const label = table.tablename || table.name || (isRoot ? '(root)' : '(unnamed subtable)');

    // Unknown / deprecated keys
    for (const key of Object.keys(table)) {
        if (key.startsWith('_')) continue; // metadata tags are allowed (see docs/parsing-rules.md)
        if (key === 'subtables') {
            report('warning', 'deprecated-key', `"subtables" is a deprecated alias.`, [...path, key], 'Rename to "subTables".');
            continue;
        }
        if (!known.has(key)) {
            const suggestion = didYouMean(key, known);
            const rootOnly = !isRoot && KNOWN_ROOT_KEYS.has(key);
            report('warning', 'unknown-key',
                rootOnly ? `"${key}" is only meaningful on a root table and is ignored here.` : `Unknown key "${key}" is ignored by the engine.`,
                [...path, key],
                suggestion && !rootOnly ? `Did you mean "${suggestion}"?` : undefined);
        }
    }

    const children = childTables(table);
    const hasResults = Array.isArray(table.results);
    const hasContent = hasResults || children.length > 0 || typeof table.customDisplay === 'string' || Array.isArray(table.referenceTables);

    if (!hasContent) {
        report('error', 'empty-table', `Table "${label}" has no results, tables, subTables or customDisplay.`, path);
    }
    if (hasResults && table.results.length === 0) {
        report('error', 'empty-results', `Table "${label}" has an empty results list.`, [...path, 'results']);
    }
    if (!isRoot && !table.tablename && !table.name) {
        report('info', 'unnamed-table', 'Subtable has no tablename; it gets an auto-generated name and cannot be referenced.', path);
    }

    if (hasResults) checkEntries(table, path, report);

    // Children
    for (const { key, list } of children) {
        const seen = new Map<string, number>();
        list.forEach((child, i) => {
            const childPath = [...path, key, i];
            if (!isPlainObject(child)) return; // schema already reported
            const name = child.tablename || child.name;
            if (name) {
                if (seen.has(name)) {
                    report('warning', 'duplicate-sibling', `Duplicate subtable name "${name}" (also at index ${seen.get(name)}); only the first is reachable by name.`, childPath);
                } else {
                    seen.set(name, i);
                }
            }
            checkTable(child, childPath, false, report);
        });
    }

    if (isRoot && Array.isArray(table.referenceTables)) {
        table.referenceTables.forEach((rt: any, i: number) => checkReferenceTable(rt, [...path, 'referenceTables', i], report));
    }
}

function checkEntries(table: Record<string, any>, path: Path, report: Reporter) {
    const headers: string[] | undefined = Array.isArray(table.headers) ? table.headers : undefined;

    table.results.forEach((entry: unknown, i: number) => {
        const entryPath = [...path, 'results', i];
        if (!Array.isArray(entry)) return;

        // ["+2 magic weapon (benefit", "curse) (500 gp)", 0.5]  ← unquoted comma split a weighted tuple
        const last = entry[entry.length - 1];
        if (entry.length >= 3 && typeof last === 'number' && entry.slice(0, -1).every(x => typeof x === 'string')) {
            report('warning', 'suspicious-split-tuple',
                `Entry looks like a weighted tuple split by an unquoted comma: ${JSON.stringify(entry).slice(0, 100)}.`,
                entryPath,
                `Quote the text: ["${entry.slice(0, -1).join(', ')}", ${last}]`);
        }

        if (headers) {
            const value = entry.length === 2 && typeof entry[1] === 'number' && Array.isArray(entry[0]) ? entry[0] : entry;
            const isWeightedScalar = entry.length === 2 && typeof entry[1] === 'number' && !Array.isArray(entry[0]);
            const columns = (value as unknown[]).filter(x => !isPlainObject(x)).length;
            if (!isWeightedScalar && columns !== headers.length) {
                report('warning', 'header-mismatch', `Entry has ${columns} column(s) but the table declares ${headers.length} header(s).`, entryPath);
            }
        }
    });
}

type ParsedKey =
    | { kind: 'range'; min: number; max: number }
    | { kind: 'exact'; value: string };

export function parseReferenceKey(key: string | number): ParsedKey {
    const s = String(key).trim();
    const num = Number(s);
    if (s !== '' && !isNaN(num)) return { kind: 'range', min: num, max: num };
    let m = s.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return { kind: 'range', min: parseFloat(m[1]), max: parseFloat(m[2]) };
    m = s.match(/^<=\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return { kind: 'range', min: -Infinity, max: parseFloat(m[1]) };
    m = s.match(/^(-?\d+(?:\.\d+)?)\s*<=$/);
    if (m) return { kind: 'range', min: parseFloat(m[1]), max: Infinity };
    m = s.match(/^(-?\d+(?:\.\d+)?)\s*\+$/);
    if (m) return { kind: 'range', min: parseFloat(m[1]), max: Infinity };
    return { kind: 'exact', value: s };
}

function checkReferenceTable(rt: any, path: Path, report: Reporter) {
    if (!isPlainObject(rt) || !Array.isArray(rt.entries)) return;
    const seenExact = new Map<string, number>();
    const ranges: { min: number; max: number; i: number }[] = [];

    rt.entries.forEach((entry: any, i: number) => {
        if (!isPlainObject(entry) || entry.key === undefined) return;
        const entryPath = [...path, 'entries', i];
        const raw = String(entry.key);

        if (typeof entry.value === 'string' && entry.value.includes('{')) {
            report('warning', 'template-in-reference-value',
                'Reference table values are returned verbatim; "{...}" templates inside them are not evaluated.', [...entryPath, 'value']);
        }

        if (seenExact.has(raw)) {
            report('warning', 'duplicate-reference-key', `Duplicate key "${raw}" (first at entry ${seenExact.get(raw)}); later entries are unreachable.`, entryPath);
            return;
        }
        seenExact.set(raw, i);

        const parsed = parseReferenceKey(entry.key);
        if (parsed.kind === 'range') {
            if (parsed.min > parsed.max) {
                report('error', 'invalid-reference-key', `Range "${raw}" has min greater than max.`, entryPath);
                return;
            }
            const overlap = ranges.find(r => parsed.min <= r.max && r.min <= parsed.max);
            if (overlap) {
                report('warning', 'overlapping-reference-keys', `Key "${raw}" overlaps "${rt.entries[overlap.i].key}" (entry ${overlap.i}); the first match wins.`, entryPath);
            }
            ranges.push({ ...parsed, i });
        } else if (/^\s*>=/.test(raw)) {
            report('error', 'invalid-reference-key', `Key "${raw}" is not a supported range form and will only match literally.`, entryPath,
                'Use "a-b", "<=n", "n<=" or "n+".');
        }
    });
}

/** Exposed for tests: validate a single entry value without a file. */
export function validateEntry(entry: unknown): Diagnostic | undefined {
    if (EntrySchema.safeParse(entry).success) return undefined;
    const p = describeEntryProblem(entry);
    return { severity: 'error', code: p.code, message: p.message, hint: p.hint, file: '<inline>', path: [] };
}
