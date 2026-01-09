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

    constructor(loader: TableLoader, seed?: string) {
        this.loader = loader;
        this.rng = new RNG(seed);
        this.dice = new Dice(this.rng);
        this.expr = new ExpressionEvaluator();
        this.refHandler = new ReferenceTableHandler();
    }

    public generate(identifier: string, context: Context = {}): GeneratedResult {
        const tracker: RecursionTracker = {
            depth: 0,
            tables: new Set(),
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

        return this.processTable(rootTable, context, tracker);
    }

    private processTable(
        table: SubTable,
        context: Context,
        tracker: RecursionTracker,
        overrideResults?: ResultEntry[]
    ): GeneratedResult {
        const trackerId = `${table.filename || ''}:${table.tablename}`;
        if (tracker.depth > tracker.maxDepth) {
            return { header: table.tablename, result: `[Max depth reached: ${table.tablename}]` };
        }

        const newTracker = {
            depth: tracker.depth + 1,
            tables: new Set(tracker.tables).add(trackerId),
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
        const tracker: RecursionTracker = { depth: 0, tables: new Set(), maxDepth: 30 };

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

            // Legacy reroll returns a specific structure wrapping the result
            // But our generate returns GeneratedResult. We can return that directly, 
            // ensuring header matches request if possible, or let the caller handle it.
            // The legacy API expects: { result: { header, result, _tableName }, context }
            // We will return GeneratedResult, and the API handler will wrap it.

            // Override header to match request if it wasn't a perfect match? 
            // Legacy renderer keeps the requested header.
            return {
                ...res,
                header: header
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

    private processString(template: string, context: Context, tracker: RecursionTracker): string | number {
        // Handle Inline Arrays first: [A, B, C] logic is inside processStringRecursive via bracket detection
        // But we need to handle nested braces/brackets properly.
        return this.processStringRecursive(template, context, tracker);
    }

    private processStringRecursive(str: string, context: Context, tracker: RecursionTracker): string | number {
        let index = 0;
        let result = "";

        while (index < str.length) {
            const nextBrace = str.indexOf('{', index);
            const nextBracket = str.indexOf('[', index);

            let nextIndex = -1;
            let type = ''; // 'brace' | 'bracket'

            if (nextBrace === -1 && nextBracket === -1) {
                result += str.substring(index);
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
            result += str.substring(index, nextIndex);

            // Find balancing closer
            const start = nextIndex;
            let end = -1;
            let depth = 1;

            for (let i = start + 1; i < str.length; i++) {
                if (str[i] === (type === 'brace' ? '{' : '[')) depth++;
                else if (str[i] === (type === 'brace' ? '}' : ']')) depth--;

                if (depth === 0) {
                    end = i;
                    break;
                }
            }

            if (end === -1) {
                result += str[start];
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
                        const keyVal = String(this.processStringRecursive(rawKey, context, tracker));

                        let foundTable = null;
                        for (const t of this.loader.getAllTables()) {
                            if (t.referenceTables) {
                                foundTable = t.referenceTables.find(rt => rt.tablename === refName);
                                if (foundTable) break;
                            }
                        }

                        if (foundTable) {
                            result += this.refHandler.lookup(foundTable, keyVal);
                        } else {
                            result += `[ReferenceTable ${refName} not found]`;
                        }
                    } else {
                        result += `[Invalid useReferenceTable syntax]`;
                    }
                } else {
                    const processedContent = this.processStringRecursive(content, context, tracker);
                    const evalRes = this.evaluateToken(String(processedContent), context, tracker);
                    result += String(evalRes);
                }
            } else {
                // Bracket: [content]
                const isInteger = /^\d+$/.test(content);
                const prevChar = result.length > 0 ? result[result.length - 1] : '';
                const looksLikeIndex = isInteger && /[a-zA-Z0-9_]/.test(prevChar);

                if (looksLikeIndex) {
                    result += `[${content}]`;
                } else {
                    const processedContent = String(this.processStringRecursive(content, context, tracker));
                    const choices = processedContent.split(',').map(s => s.trim());
                    const pick = this.rng.choice(choices);
                    result += pick;
                }
            }

            index = end + 1;
        }

        return result;
    }

    private evaluateToken(token: string, context: Context, tracker: RecursionTracker): string | number {
        try { return this.dice.roll(token); } catch (e) { }

        // Check for Probability syntax: {Table, 0.5}
        // Token comes in as "Table, 0.5" or "Table,0.5"
        // Regex for "Something, Number"
        const probMatch = token.match(/^(.+?),\s*((?:0\.)?\d+)$/);
        if (probMatch) {
            const tableName = probMatch[1].trim();
            const prob = parseFloat(probMatch[2]);
            if (!isNaN(prob)) {
                // Start Roll
                if (this.rng.nextFloat() <= prob) {
                    return this.evaluateToken(tableName, context, tracker);
                } else {
                    return ""; // Excluded
                }
            }
        }

        if (/[+\-*/]/.test(token) && !/\|/.test(token)) {
            return this.expr.evaluate(token, context);
        }

        // Handle {selectedResult, TableName} syntax manually if encountered in a token
        if (token.startsWith('selectedResult,')) {
            const keyTable = token.substring('selectedResult,'.length).trim();
            let table = this.loader.findTable(keyTable);

            // If not found global, check if it's a subtable of the current table context
            if (!table && context._currentTable) {
                const sub = this.loader.findSubTable(context._currentTable, keyTable);
                if (sub) table = sub;
            }

            if (table) {
                const keyRes = this.processTable(table, context, tracker).result;
                // Target MUST be subtable of current table context (or sibling?)
                // Spells logic: RandomTier -> Tier1. RandomTier is sibling of Tier1. Both under SpellsPriest.
                // context._currentTable points to ... RandomSpellAnyTier?
                // If RandomSpellAnyTier is a sibling of Tier1...
                // Wait. In SpellsPriest.yaml:
                // tables:
                //   - RandomSpellAnyTier
                //   - Tier1
                //   - Tier2
                // They are SIBLINGS.
                // processCustomDisplay uses `table` (which is the current table passed in).
                // `evaluateToken` receives `context`. `context._currentTable` is `RandomSpellAnyTier`.
                // We need to look for `Tier1` which is a SIBLING of `context._currentTable`.
                // BUT `RandomSpellAnyTier` doesn't know its parent.
                // So we can only lookup Global (unlikely if same name exists elsewhere) or via Loader traversal?
                // Actually, if they are root tables in the file (SpellsPriest has `tables:` list), they are indexed globally by name?
                // Tier1, Tier2... are common names. They might be overwritten globally!
                // This is a risk.
                // BUT `loader.findSubTable` logic.
                // If `context._currentTable` is a Root Table? No, it's in a list. 
                // We don't have reference to "Parent Table".
                const keyResStr = String(keyRes);

                // 1. Try finding globally (Exact)
                let targetSub = this.loader.findTable(keyResStr);

                // 2. Try finding as subtable of current table (Fuzzy allowed via findSubTable)
                if (!targetSub && context._currentTable) {
                    targetSub = this.loader.findSubTable(context._currentTable, keyResStr);
                }

                // 3. Try finding globally (Fuzzy? - Loader.findTable doesn't do fuzzy, but maybe we should?)
                // For now, relying on subtable fuzzy match which covers the Shops case (Types -> Standard Shops).

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

            if (base in context) {
                const val = context[base];
                if (index !== -1 && Array.isArray(val)) return val[index];
                return val;
            }
            if (base === 'thisResult' && context.thisResult) {
                const val = context.thisResult;
                if (index !== -1 && Array.isArray(val)) return val[index];
                if (index !== -1 && !Array.isArray(val) && index === 0) return val;
                return val;
            }

            let table = this.loader.findTable(base);

            // If not found global, check if it's a subtable of the current table context
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
                if (index !== -1) {
                    if (Array.isArray(val)) return val[index];
                    return `[Index ${index} invalid]`;
                }
                if (Array.isArray(val)) return val.join(', ');
                return val;
            }
        }

        return `[${token} not found]`;
    }

    private processCustomDisplay(template: string, table: SubTable, context: Context, tracker: RecursionTracker): string {
        if (template.includes('pickOneFromArrays')) {
            if (!table.results) return "No results";
            const pick = this.pickResult(table.results).entry;
            return String(this.processString(String(pick), context, tracker));
        }

        const selResRegex = /\[\{selectedResult,\s*([^}]+)\}\]/;
        const match = template.match(selResRegex);
        if (match) {
            const keyTable = match[1];
            // Look for subtable, or fallback to global table (sibling)
            let keySub = this.loader.findSubTable(table, keyTable);
            if (!keySub) {
                keySub = this.loader.findTable(keyTable);
            }

            if (keySub) {
                const keyRes = this.processTable(keySub, context, tracker).result;
                const targetSub = this.loader.findSubTable(table, String(keyRes)); // Target MUST be subtable of current
                if (targetSub) {
                    return String(this.processTable(targetSub, context, tracker).result);
                }
            }
        }

        return String(this.processString(template, context, tracker));
    }
}
