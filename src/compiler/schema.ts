// src/compiler/schema.ts
//
// Formal schema for table YAML files. This is the single source of truth for what a
// table file may contain; the validator (validate.ts) turns Zod issues into
// line-aware diagnostics and layers semantic checks on top.
//
// Entry grammar (what may appear in `results:`):
//   "text with {Refs} and {1d6}"            string
//   42                                       number
//   ["text", 3]                              weighted tuple   [value, weight > 0]
//   [["a", "b", "c"], 5]                     weighted array
//   ["Career", "Items"]                      two-element (career-style) array
//   ["A", "B", "C", "D"]                     multi-element array (columns)
//   ["Base", { roll: 2, exclude: true }]     array with re-roll directive
//   { separateRows: ["row 1", "row 2"] }     separate-rows directive
//
// Table files may also use `^N` weight shorthand ("Rare thing ^0.5"), which the
// compiler rewrites into a weighted tuple.

import { z } from 'zod';

const Scalar = z.union([z.string(), z.number()]);
const TextBlock = z.union([z.string(), z.array(z.string())]);

/** `{ roll: n, exclude?: true }` — roll n more times on the same table (only valid inside an array entry). */
export const RollDirectiveSchema = z.strictObject({
    roll: z.number().int().positive(),
    exclude: z.boolean().optional(),
});

/** `{ separateRows: [...] }` — render each row on its own line. */
export const SeparateRowsSchema = z.strictObject({
    separateRows: z.array(z.string()).min(1),
});

export const ArrayEntrySchema = z.array(z.union([Scalar, RollDirectiveSchema])).min(1);

export const WeightedEntrySchema = z.tuple([
    z.union([Scalar, ArrayEntrySchema, SeparateRowsSchema]),
    z.number().positive(),
]);

export const EntrySchema = z.union([
    z.string(),
    z.number(),
    WeightedEntrySchema,
    ArrayEntrySchema,
    SeparateRowsSchema,
]);

export const ReferenceEntrySchema = z.object({
    key: Scalar,
    value: z.union([Scalar, z.array(Scalar)]),
});

/** Lookup tables used by `{useReferenceTable{Name}{Key}}`. Keys may be exact, `a-b`, `<=n`, `n<=` or `n+`. */
export const ReferenceTableSchema = z.object({
    tablename: z.string().min(1),
    description: TextBlock.optional(),
    entries: z.array(ReferenceEntrySchema).min(1),
});

/** Nested table. Loose: unknown keys are reported as warnings by the validator, not rejected. */
export const SubTableSchema = z.looseObject({
    tablename: z.string().optional(),
    /** Legacy alias for tablename. */
    name: z.string().optional(),
    description: TextBlock.optional(),
    results: z.array(EntrySchema).optional(),
    customDisplay: z.string().optional(),
    /** Column labels for multi-element array entries. */
    headers: z.array(z.string()).optional(),
    weight: z.number().optional(),
    filename: z.string().optional(),
    get tables() { return z.array(SubTableSchema).optional(); },
    get subTables() { return z.array(SubTableSchema).optional(); },
    /** Deprecated lowercase alias of subTables. */
    get subtables() { return z.array(SubTableSchema).optional(); },
});

export const RootTableSchema = z.looseObject({
    tablename: z.string().min(1),
    game: z.string().min(1),
    setting: z.string().optional(),
    /** One type, a list of types, or a comma-separated string (split by the compiler). */
    type: z.union([z.string().min(1), z.array(z.string()).min(1)]),
    description: TextBlock.optional(),
    titleDescription: z.string().optional(),
    source: z.string().optional(),
    page: Scalar.optional(),
    /** Prompt the user for a value: [variableName, 'number' | 'string']. */
    inputField: z.tuple([z.string().min(1), z.enum(['number', 'string'])]).optional(),
    filename: z.string().optional(),
    results: z.array(EntrySchema).optional(),
    customDisplay: z.string().optional(),
    headers: z.array(z.string()).optional(),
    tables: z.array(SubTableSchema).optional(),
    subTables: z.array(SubTableSchema).optional(),
    subtables: z.array(SubTableSchema).optional(),
    referenceTables: z.array(ReferenceTableSchema).optional(),
});

/** A file holds a single root table or a list of root tables. */
export const FileSchema = z.union([RootTableSchema, z.array(RootTableSchema).min(1)]);

export const KNOWN_ROOT_KEYS = new Set(Object.keys(RootTableSchema.shape));
export const KNOWN_SUBTABLE_KEYS = new Set(Object.keys(SubTableSchema.shape));

export type Entry = z.infer<typeof EntrySchema>;
export type ReferenceTableDefinition = z.infer<typeof ReferenceTableSchema>;
export type SubTableDefinition = z.infer<typeof SubTableSchema>;
export type TableDefinition = z.infer<typeof RootTableSchema>;
export type FileDefinition = z.infer<typeof FileSchema>;
