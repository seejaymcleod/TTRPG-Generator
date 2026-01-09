
import { z } from 'zod';
import { SubTable, ResultEntry } from '../engine/types';

// Helper for loose boolean/string boolean
const BooleanLike = z.union([z.boolean(), z.string().transform((val) => val === 'true')]);

// Entry can be a simple string (sugar for { result: str }) or a full object
// We accept permissive types because YAML loading returns primitive types
export const ResultEntrySchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.any()
]);

// Refine ResultEntrySchema to be distinct
export const ComplexEntrySchema = z.object({
    result: z.union([z.string(), z.number(), z.boolean(), z.array(z.any())]).optional(),
    weight: z.number().optional(),
    range: z.string().optional(),
}).catchall(z.any());

export const EntrySchema: z.ZodType<ResultEntry> = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.any()])), // Tuples or arrays
    ComplexEntrySchema as any // Cast to any to avoid complex structural matching issues for now
]);

export const SubTableSchema: z.ZodType<SubTable> = z.lazy(() => z.object({
    tablename: z.string().default(''), // Default to empty, will be populated by compiler if missing
    name: z.string().optional(),
    results: z.array(EntrySchema).optional(),
    tables: z.array(SubTableSchema).optional(),
    subTables: z.array(SubTableSchema).optional(),
    referenceTables: z.array(z.any()).optional(), // Define explicitly, though we use catchall
    customDisplay: z.string().optional(),
    description: z.union([z.string(), z.array(z.string())]).optional(),
    // Common optional fields
    weight: z.number().optional(),
    filename: z.string().optional()
}).catchall(z.any()));

export const RootTableSchema = SubTableSchema; // They are effectively same structure

// The file schema can be a single root table OR an array of tables
export const FileSchema = z.union([
    RootTableSchema,
    z.array(RootTableSchema)
]);

export type TableDefinition = z.infer<typeof RootTableSchema>;
export type FileDefinition = z.infer<typeof FileSchema>;
