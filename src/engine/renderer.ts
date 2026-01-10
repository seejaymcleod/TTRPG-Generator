// src/engine/renderer.ts
import { RNG } from './rng';
import { TableLoader } from './loader';
import { Dice } from './dice';
import { ExpressionEvaluator } from './expr';
import { ReferenceTableHandler } from './referenceTables';
import {
    Context,
    GeneratedResult,
    RecursionTracker,
    SubTable,
    Table,
    ResultEntry
} from './types';

export class Renderer {
    private rng: RNG;
    private loader: TableLoader;
    private dice: Dice;
    private expr: ExpressionEvaluator;
    private refHandler: ReferenceTableHandler;
    public DEBUG = false;
    private timeoutMs: number;
    private startTime: number;

    constructor(loader: TableLoader, seed?: string, timeoutMs: number = 5000) {
        this.loader = loader;
        this.rng = new RNG(seed);
        this.dice = new Dice(this.rng);
        this.expr = new ExpressionEvaluator();
        this.refHandler = new ReferenceTableHandler();
        this.timeoutMs = timeoutMs;
        this.startTime = Date.now();
    }

    public generate(identifier: string, context: Context = {}): GeneratedResult {
        // Initialize shared memory if not present
        if (!context.memory) {
            context.memory = {};
        }

        const tracker: RecursionTracker = {
            depth: 0,
            tables: new Set(),
            counts: new Map(),
            maxDepth: 30
        };
        const rootTable = this.loader.findTable(identifier);

        if (!rootTable) {
            return {
                header: identifier,
                result: `[Table ${identifier} not found]`,
                _tableName: identifier
            };
        }

        this.startTime = Date.now();
        const res = this.processTable(rootTable, context, tracker);
        return { ...res, context };
    }

    private processTable(
        table: SubTable,
        context: Context,
        tracker: RecursionTracker,
        overrideResults?: ResultEntry[]
    ): GeneratedResult {
        if (Date.now() - this.startTime > this.timeoutMs) {
            throw new Error(`[Renderer Timeout] Execution exceeded ${this.timeoutMs}ms`);
        }

        const trackerId = `${table.filename || ''}:${table.tablename}`;

        // Loop Detection: Check if we are visiting this table too often in the current stack
        const currentCount = tracker.counts.get(trackerId) || 0;
        if (currentCount >= 2) {
            // console.error(`[Loop Limit Hit] ${trackerId}`);
            return { header: table.tablename, result: `[Loop Limit: ${table.tablename}]` };
        }

        if (tracker.depth > tracker.maxDepth) {
            return { header: table.tablename, result: `[Max depth reached: ${table.tablename}]` };
        }

        // Increment count for new tracker
        const newCounts = new Map(tracker.counts);
        newCounts.set(trackerId, currentCount + 1);

        const newTracker = {
            depth: tracker.depth + 1,
            tables: new Set(tracker.tables).add(trackerId),
            counts: newCounts,
            maxDepth: tracker.maxDepth
        };

        const currentContext: Context = { ...context, _currentTable: table };
        const header = table.tablename;
        const sourceInfo = {
            _tableName: table.tablename,
            _fileName: table.filename
        };

        if (table.customDisplay) {
            const display = this.processCustomDisplay(table.customDisplay, table, currentContext, newTracker);
            currentContext[header] = display;
            currentContext['thisResult'] = display;
            return {
                header,
                result: display,
                _hasCustomDisplay: true,
                ...sourceInfo
            };
        }

        const resultsToUse = overrideResults || table.results;

        if (table.tables && !resultsToUse) {
            const subResults = table.tables.map(sub =>
                this.processTable(sub, currentContext, newTracker)
            );

            // Check if all subResults are separateRows
            const separateLines = [];
            let allSeparate = true;
            for (const s of subResults) {
                if (s._isSeparateRows && Array.isArray(s.result)) {
                    separateLines.push(...s.result);
                } else {
                    allSeparate = false;
                    break;
                }
            }

            if (allSeparate && subResults.length > 0) {
                return { header, result: separateLines, _isSeparateRows: true, ...sourceInfo };
            }

            const flattened = subResults.map(r => r.result);
            currentContext[header] = flattened;
            return { header, result: subResults, ...sourceInfo };
        }

        if (resultsToUse) {
            const picked = this.pickResult(resultsToUse);
            const entry = picked.entry;
            const index = picked.index;

            const processed = this.processResultEntry(entry, table, currentContext, newTracker);
            let finalResult = processed.result;

            if (processed._isMultiElementArray && Array.isArray(finalResult)) {
                const directiveIndex = finalResult.findIndex((x: any) => x && typeof x === 'object' && 'roll' in x);
                if (directiveIndex !== -1) {
                    const directive = finalResult[directiveIndex];
                    const numRolls = directive.roll;
                    const exclude = directive.exclude;

                    const bonusResults: any[] = [];

                    let subOptions = table.results!;
                    if (exclude) {
                        subOptions = subOptions.filter((_, i) => i !== index);
                    }

                    for (let i = 0; i < numRolls; i++) {
                        if (subOptions.length === 0) break;
                        const subRes = this.processTable(table, currentContext, newTracker, subOptions);

                        // Handle result from sub-roll
                        if (Array.isArray(subRes.result) && subRes._isMultiElementArray) {
                            bonusResults.push(...subRes.result);
                        } else {
                            bonusResults.push(subRes.result);
                        }
                    }

                    finalResult.splice(directiveIndex, 1);
                    finalResult.push(...bonusResults);
                }
            }

            if (!processed._isSeparateRows) {
                currentContext[header] = finalResult;
                currentContext['thisResult'] = finalResult;
            }

            return {
                header,
                result: finalResult,
                _isCareer: processed._isCareer,
                _isMultiElementArray: processed._isMultiElementArray,
                _isSeparateRows: processed._isSeparateRows,
                ...sourceInfo
            };
        }

        return { header, result: "No results", ...sourceInfo };
    }

    // Helper to flatten results into a string for token replacement
    private flattenResultToString(res: any): string {
        if (typeof res === 'string') return res;
        if (typeof res === 'number') return String(res);
        if (Array.isArray(res)) {
            return res.map(r => this.flattenResultToString(r)).join(', ');
        }
        if (typeof res === 'object' && res !== null) {
            if ('result' in res) {
                return this.flattenResultToString(res.result);
            }
            // Fallback for unknown objects
            // Use JSON stringify but maybe better to verify structure?
            // If it's a GeneratedResult like object, we want keys? No, user hated Object Object.
            // If we are FLATTENING to string, we probably want text content.
            // But if it's strictly an object with no result property, JSON is safest for debugging.
            return JSON.stringify(res);
        }
        return String(res);
    }

    private pickResult(results: ResultEntry[]): { entry: ResultEntry, index: number } {
        // Correct implementation matching RNG types
        const weightedList: { item: { entry: ResultEntry, index: number }; weight: number }[] = [];

        results.forEach((r, i) => {
            let weight = 1;
            let item = r;
            if (Array.isArray(r) && r.length === 2 && typeof r[1] === 'number') {
                // Check if it's a weighted tuple (heuristic)
                const val = r[0];
                item = val;
                weight = r[1] as number;
            }
            // We wrap the entry and index so rng.weightedChoice returns the wrapper
            weightedList.push({ item: { entry: item, index: i }, weight });
        });

        // rng.weightedChoice returns T (the .item property of the input objects)
        const chosen = this.rng.weightedChoice(weightedList);
        return chosen;
    }

    public reroll(table: Table, header: string, context: Context): GeneratedResult {
        // Merge context: Input context + Input values are already merged by caller usually, 
        // but we ensure we work with a fresh object inheriting from them.
        const currentContext = { ...context };
        const tracker: RecursionTracker = {
            depth: 0,
            tables: new Set(),
            counts: new Map(),
            maxDepth: 30
        };

        // 1. Check for Math Expression in header
        if (/[+\-*/]/.test(header)) {
            const expr = `{${header}}`;
            const res = this.processStringRecursive(expr, currentContext, tracker);
            return {
                header,
                result: res,
                _tableName: header
            };
        }

        // 2. Find target subtable
        let targetSubTable: SubTable | undefined;

        // Attempt 1: Exact Name/Tablename match in tables/subTables
        if (table.tables) {
            targetSubTable = table.tables.find(t => t.name === header || t.tablename === header);
        }
        if (!targetSubTable && table.subTables) {
            targetSubTable = table.subTables.find(t => t.name === header || t.tablename === header);
        }

        // Attempt 2: If header matches top-level tablename, use first subtable (Legacy behavior)
        if (!targetSubTable && table.tablename === header && table.tables && table.tables.length > 0) {
            targetSubTable = table.tables[0];
        }

        // Attempt 3: If unique subtable, use it (Legacy behavior)
        if (!targetSubTable && table.tables && table.tables.length === 1) {
            targetSubTable = table.tables[0];
        }

        // Attempt 4: Case-insensitive match
        if (!targetSubTable) {
            const lower = header.toLowerCase();
            if (table.tables) {
                targetSubTable = table.tables.find(t => (t.name || t.tablename || '').toLowerCase() === lower);
            }
            if (!targetSubTable && table.subTables) {
                targetSubTable = table.subTables.find(t => (t.name || t.tablename || '').toLowerCase() === lower);
            }
        }

        // Attempt 5: Fallback to top-level if it has results
        if (!targetSubTable && table.results) {
            targetSubTable = table;
        }

        if (targetSubTable) {
            // CRITICAL: Update _currentTable in context
            currentContext._currentTable = targetSubTable;
            const res = this.processTable(targetSubTable, currentContext, tracker);

            return {
                ...res,
                header: header,
                context: currentContext
            };
        }

        return {
            header,
            result: `[Could not find subtable for header: ${header}]`
        };
    }

    private processResultEntry(
        entry: any,
        table: SubTable,
        context: Context,
        tracker: RecursionTracker
    ): GeneratedResult {
        if (typeof entry === 'object' && entry !== null && 'separateRows' in entry) {
            const rows = entry.separateRows as any[];
            const processedRows = rows.map(row => {
                const rowContext = { ...context };
                if (typeof row === 'string') {
                    return this.processString(row, rowContext, tracker);
                } else {
                    return JSON.stringify(row);
                }
            });
            return { header: 'SeparateRows', result: processedRows, _isSeparateRows: true };
        }

        if (Array.isArray(entry)) {
            const processedArray = entry.map(e => {
                if (typeof e === 'string') return this.processString(e, context, tracker);
                return e;
            });

            const isCareer = processedArray.length === 2 && processedArray.every(x => typeof x === 'string');
            const isMulti = processedArray.length > 2 || processedArray.some(x => typeof x === 'object');

            return {
                header: 'Array',
                result: processedArray,
                _isCareer: isCareer,
                _isMultiElementArray: isMulti
            };
        }

        if (typeof entry === 'string') {
            return { header: 'String', result: this.processString(entry, context, tracker) };
        }

        return { header: 'Number', result: entry };
    }

    private processString(template: string, context: Context, tracker: RecursionTracker): any {
        // Handle Inline Arrays first: [A, B, C] logic is inside processStringRecursive via bracket detection
        return this.processStringRecursive(template, context, tracker);
    }

    private processStringRecursive(str: string, context: Context, tracker: RecursionTracker): any {
        let index = 0;
        let result: any = "";
        let isBuildingString = true; // Track if we are building a simple string or returning a complex object
        let iterations = 0;

        const append = (val: any) => {
            if (isBuildingString) {
                if (typeof val === 'object') {
                    result += JSON.stringify(val);
                } else {
                    result += val;
                }
            }
        };

        while (index < str.length) {
            // Log loop state
            // console.log(`[PSR] Loop Idx=${index} Len=${str.length} ResLen=${String(result).length}`);
            this.checkTimeout();

            // Loop Prevention: Hard limit on iterations for a single string
            if (++iterations > 1000) {
                const msg = `[PSR] Infinite recursion protection hit for string: ${str.substring(0, 100)}... (Length: ${str.length})`;
                console.error(msg);
                throw new Error(msg);
            }
            const nextBrace = str.indexOf('{', index);
            const nextBracket = str.indexOf('[', index);

            let nextIndex = -1;
            let type = ''; // 'brace' | 'bracket'

            if (nextBrace === -1 && nextBracket === -1) {
                if (typeof result === 'string') result += str.substring(index);
                break;
            }

            if (nextBrace !== -1 && (nextBracket === -1 || nextBrace < nextBracket)) {
                nextIndex = nextBrace;
                type = 'brace';
            } else {
                nextIndex = nextBracket;
                type = 'bracket';
            }

            // Add text before
            if (typeof result === 'string') result += str.substring(index, nextIndex);

            // Find balancing closer
            const start = nextIndex;
            let end = -1;
            let depth = 1;

            for (let i = start + 1; i < str.length; i++) {
                // this.checkTimeout();
                if (str[i] === (type === 'brace' ? '{' : '[')) depth++;
                else if (str[i] === (type === 'brace' ? '}' : ']')) depth--;

                if (depth === 0) {
                    end = i;
                    break;
                }
            }

            if (end === -1) {
                if (typeof result === 'string') result += str[start];
                index = start + 1;
                continue;
            }

            const content = str.substring(start + 1, end);

            if (type === 'brace') {
                if (content.startsWith('useReferenceTable')) {
                    // Manual parse of args
                    // Expected: useReferenceTable{A}{B}
                    let cursor = 'useReferenceTable'.length;

                    const extractArg = (): string | null => {
                        if (cursor >= content.length || content[cursor] !== '{') return null;
                        let depth = 1;
                        let start = cursor;
                        for (let i = cursor + 1; i < content.length; i++) {
                            // this.checkTimeout();
                            if (content[i] === '{') depth++;
                            if (content[i] === '}') depth--;
                            if (depth === 0) {
                                cursor = i + 1;
                                return content.substring(start + 1, i);
                            }
                        }
                        return null;
                    };

                    const rawRef = extractArg();
                    const rawKey = extractArg();

                    if (rawRef && rawKey) {
                        const refName = String(this.processStringRecursive(rawRef, context, tracker));
                        let keyVal = String(this.processStringRecursive(rawKey, context, tracker));

                        // SPECIAL CASE: If keyVal looks like an expression (e.g. "thisResult[0]"), try to evaluate it.
                        // Legacy tables using {useReferenceTable{...}{thisResult[0]}} rely on implicit evaluation.
                        if (keyVal.includes('thisResult')) {
                            const evaluated = this.evaluateToken(keyVal, context, tracker);
                            if (typeof evaluated !== 'string' || !evaluated.startsWith('[')) {
                                keyVal = String(evaluated);
                            }
                        }

                        let foundTable = null;
                        for (const t of this.loader.getAllTables()) {
                            if (t.referenceTables) {
                                foundTable = t.referenceTables.find(rt => rt.tablename === refName);
                                if (foundTable) break;
                            }
                        }

                        if (foundTable) {
                            if (typeof result === 'string') result += this.refHandler.lookup(foundTable, keyVal);
                        } else {
                            if (typeof result === 'string') result += `[ReferenceTable ${refName} not found]`;
                        }
                    } else {
                        if (typeof result === 'string') result += `[Invalid useReferenceTable syntax]`;
                    }
                } else {
                    const processedContent = this.processStringRecursive(content, context, tracker);
                    const evalRes = this.evaluateToken(String(processedContent), context, tracker);

                    if (typeof result === 'string') {
                        // Use helper to safely stringify objects (e.g. GeneratedResult[])
                        result += this.flattenResultToString(evalRes);
                    }
                }
            } else {
                // Bracket: [content]
                const isInteger = /^\d+$/.test(content);
                const prevChar = (typeof result === 'string' && result.length > 0) ? result[result.length - 1] : '';
                const looksLikeIndex = isInteger && /[a-zA-Z0-9_]/.test(prevChar);

                if (looksLikeIndex) {
                    if (typeof result === 'string') result += `[${content}]`;
                } else if (content.startsWith('set:')) {
                    // [set:Variable, Value]
                    const parts = this.splitByCommaIgnoringGenerics(content.substring(4));
                    if (parts.length >= 2) {
                        const varName = parts[0].trim();
                        const valueExpr = parts.slice(1).join(',').trim();
                        const processedValue = this.processStringRecursive(valueExpr, context, tracker);

                        // Write to shared memory if available, else local context
                        if (context.memory) {
                            context.memory[varName] = processedValue;
                        } else {
                            context[varName] = processedValue;
                        }

                        if (typeof result === 'string') result += "";
                    } else {
                        if (typeof result === 'string') result += `[Invalid set syntax]`;
                    }
                } else if (content.startsWith('if:')) {
                    // [if:Condition, TrueVal, FalseVal]
                    const parts = this.splitByCommaIgnoringGenerics(content.substring(3));
                    if (parts.length >= 2) {
                        const condition = parts[0];
                        const trueVal = parts[1];
                        const falseVal = parts[2] || "";

                        const condRes = this.evaluateToken(String(this.processStringRecursive(condition, context, tracker)), context, tracker);

                        let isTrue = false;
                        if (typeof condRes === 'number') isTrue = condRes !== 0;
                        else if (typeof condRes === 'string') isTrue = (condRes === 'true' || (condRes.length > 0 && condRes !== 'false'));
                        else if (typeof condRes === 'boolean') isTrue = condRes;

                        if (isTrue) {
                            if (typeof result === 'string') result += this.processStringRecursive(trueVal, context, tracker);
                        } else {
                            if (typeof result === 'string') result += this.processStringRecursive(falseVal, context, tracker);
                        }
                    }
                } else {
                    // INLINE ARRAY vs SEQUENTIAL EVALUATION
                    const isWholeString = (start === 0 && end === str.length - 1);
                    const hasDependency = content.includes('thisResult');

                    if (isWholeString && hasDependency) {
                        // SEQUENTIAL ARRAY MODE
                        const items = this.splitByCommaIgnoringGenerics(content);
                        const seqResults: any[] = [];
                        const seqContext = { ...context };

                        for (const item of items) {
                            seqContext['thisResult'] = [...seqResults]; // Snapshot to avoid circular reference
                            const processedItem = this.processStringRecursive(item.trim(), seqContext, tracker);
                            seqResults.push(processedItem);
                        }
                        return seqResults; // Return array directly
                    } else {
                        // Normal Choice Mode
                        const processedContent = this.processStringRecursive(content, context, tracker);
                        const valToAppend = String(processedContent);

                        const choices = valToAppend.split(',').map(s => s.trim());
                        const pick = this.rng.choice(choices);
                        if (typeof result === 'string') result += pick;
                    }
                }
            }
            index = end + 1;
        }

        // Post-processing for ShadowDark 1d4 syntax: "Some Prefix 1d4: 1-2. A, 3. B"
        if (typeof result === 'string') {
            // Regex: Catch "1d4: ..." or "1d6: ..." at some point in the string
            const sdMatch = result.match(/(.*?)(\b\d+d\d+:\s*)(.+)/);
            if (sdMatch && !result.includes('{')) {
                const prefix = sdMatch[1];
                const diceStr = sdMatch[2].replace(':', '').trim();
                const optionsStr = sdMatch[3];

                try {
                    const roll = this.dice.roll(diceStr);
                    let selected = "";

                    // Regex to match "1. Option" or "1-2. Option"
                    // LookAhead ensures we stop before the next number bullet
                    const regex = /(?:^|\s|,)(\d+(?:-\d+)?)\.\s*(.*?)(?=$|,\s*\d+(?:-\d+)?\.)/g;
                    let match;
                    while ((match = regex.exec(optionsStr)) !== null) {
                        const rangeStr = match[1];
                        const content = match[2];
                        let min, max;
                        if (rangeStr.includes('-')) {
                            const [l, h] = rangeStr.split('-').map(Number);
                            min = l; max = h;
                        } else {
                            min = max = parseInt(rangeStr);
                        }

                        if (roll >= min && roll <= max) {
                            selected = content.trim();
                            break;
                        }
                    }

                    if (selected) {
                        return prefix + selected;
                    }
                } catch (e) {
                    // Ignore parsing errors, return format as is
                }
            }
        }

        return result;
    }

    private splitByCommaIgnoringGenerics(str: string): string[] {
        const parts: string[] = [];
        let current = "";
        let depth = 0; // {} depth
        let bracketDepth = 0; // [] depth

        for (let i = 0; i < str.length; i++) {
            // this.checkTimeout();
            const c = str[i];
            if (c === '{') depth++;
            else if (c === '}') depth--;
            else if (c === '[') bracketDepth++;
            else if (c === ']') bracketDepth--;
            else if (c === ',' && depth === 0 && bracketDepth === 0) {
                parts.push(current);
                current = "";
                continue;
            }
            current += c;
        }
        parts.push(current);
        return parts;
    }

    private evaluateToken(token: string, context: Context, tracker: RecursionTracker): string | number {
        this.checkTimeout();
        try {
            const roll = this.dice.roll(token);
            context['thisResult'] = roll;
            return roll;
        } catch (e) { }

        // Check for Probability syntax: {Table, 0.5}
        const probMatch = token.match(/^(.+?),\s*((?:0\.)?\d+)$/);
        if (probMatch) {
            const tableName = probMatch[1].trim();
            const prob = parseFloat(probMatch[2]);
            if (!isNaN(prob)) {
                if (this.rng.nextFloat() <= prob) {
                    return this.evaluateToken(tableName, context, tracker);
                } else {
                    return ""; // Excluded
                }
            }
        }

        if (/[+\-*/%<>=!]/.test(token) && !/\|/.test(token)) {
            return this.expr.evaluate(token, context);
        }

        // Handle {selectedResult, TableName} syntax manually if encountered in a token
        if (token.startsWith('selectedResult,')) {
            const keyTable = token.substring('selectedResult,'.length).trim();
            let table = this.loader.findTable(keyTable);

            if (!table && context._currentTable) {
                const sub = this.loader.findSubTable(context._currentTable, keyTable);
                if (sub) table = sub;
            }

            if (table) {
                const keyRes = this.processTable(table, context, tracker).result;
                const keyResStr = String(keyRes);

                let targetSub = this.loader.findTable(keyResStr);
                if (!targetSub && context._currentTable) {
                    targetSub = this.loader.findSubTable(context._currentTable, keyResStr);
                }

                if (targetSub) {
                    return String(this.processTable(targetSub, context, tracker).result);
                }
            }
            return `[${token} target not found]`;
        }

        const match = token.match(/^(.+?)(\[(\d+)\])?(?:\|(.+))?$/);
        if (match) {
            const base = match[1];
            const index = match[3] ? parseInt(match[3]) : -1;
            const sub = match[4];

            // 1. Check Local Context
            if (base in context) {
                const val = context[base];
                if (index !== -1 && Array.isArray(val)) return val[index];
                return val;
            }

            // 2. Check Shared Memory
            if (context.memory && base in context.memory) {
                const val = context.memory[base];
                if (index !== -1 && Array.isArray(val)) return val[index];
                return val;
            }

            if (base === 'thisResult' && context.thisResult) {
                const val = context.thisResult;
                if (index !== -1 && Array.isArray(val)) return val[index];
                if (index !== -1 && !Array.isArray(val) && index === 0) return val;
                return val;
            }

            // Fallback for simple variables like {MyVar} if it's not a table
            if (base in context) {
                return context[base];
            }

            let table = this.loader.findTable(base);

            if (!table && context._currentTable) {
                const sub = this.loader.findSubTable(context._currentTable, base);
                if (sub) table = sub;
            }

            if (table) {
                if (sub) {
                    const foundSub = this.loader.findSubTable(table, sub);
                    if (foundSub) table = foundSub;
                }
                const res = this.processTable(table, context, tracker);
                const val = res.result;
                context['thisResult'] = val; // Store result for same-string reuse
                if (index !== -1) {
                    if (Array.isArray(val)) return val[index];
                    return `[Index ${index} invalid]`;
                }
                if (Array.isArray(val)) return this.flattenResultToString(val);
                return this.flattenResultToString(val);
            }
        }

        return `[${token} not found]`;
    }

    private processCustomDisplay(template: string, table: SubTable, context: Context, tracker: RecursionTracker): string {
        return String(this.processString(template, context, tracker));
    }

    private checkTimeout(extraInfo?: string) {
        if (Date.now() - this.startTime > this.timeoutMs) {
            if (extraInfo) console.error(extraInfo);
            throw new Error(`[Renderer Timeout] Execution exceeded ${this.timeoutMs}ms`);
        }
    }
}
