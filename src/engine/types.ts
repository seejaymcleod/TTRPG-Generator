// src/engine/types.ts

export type ResultEntry =
    | string
    | number
    | [string | number | any[], number] // Weighted: [value, weight]
    | string[] // Array result (e.g. career)
    | { separateRows: any[] } // Directive
    | { roll: number; exclude?: boolean }; // Directive inside array

export interface SubTable {
    tablename: string;
    // Helper optional fields to handle variations in yaml
    name?: string;
    description?: string | string[];
    results?: ResultEntry[];
    customDisplay?: string;
    subTables?: SubTable[];
    tables?: SubTable[]; // Compatibility with some YAML structures
    // For recursion tracking
    filename?: string;
}

export interface ReferenceTableEntry {
    key: string | number;
    value: string;
}

export interface ReferenceTable {
    tablename: string;
    description?: string | string[];
    entries: ReferenceTableEntry[];
}

export interface Table extends SubTable {
    filename: string;
    game?: string;
    setting?: string;
    type?: string | string[];
    titleDescription?: string;
    inputField?: [string, 'number' | 'string'];
    tables?: SubTable[];
    referenceTables?: ReferenceTable[];
}

export interface Context {
    [key: string]: any;
    thisResult?: any;
    _currentTable?: SubTable;
}

export interface RecursionTracker {
    depth: number;
    tables: Set<string>; // "filename:tablename"
    maxDepth: number;
}

export interface GeneratedResult {
    header: string;
    result: any;
    _isCareer?: boolean;
    _isMultiElementArray?: boolean;
    _isSeparateRows?: boolean;
    _hasCustomDisplay?: boolean;
    _tableName?: string;
    _fileName?: string;
    _originalSource?: string;
}
