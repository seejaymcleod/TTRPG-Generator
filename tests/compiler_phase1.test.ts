// tests/compiler_phase1.test.ts
import { describe, it, expect } from 'vitest';
import { DiagnosticBag } from '../src/compiler/diagnostics';
import { validateFile, validateEntry } from '../src/compiler/validate';
import { compileSources } from '../src/compiler/pipeline';
import { parseTemplate, classifyToken } from '../src/engine/template';

describe('Phase 1: Table Schemas, Validation & Diagnostics', () => {
    describe('Entry Schema & Problems', () => {
        it('should accept valid string, number, and weighted entries', () => {
            expect(validateEntry('Simple string')).toBeUndefined();
            expect(validateEntry(42)).toBeUndefined();
            expect(validateEntry(['Weighted item', 5])).toBeUndefined();
            expect(validateEntry([['Career', 'Items', 'Gold'], 10])).toBeUndefined();
            expect(validateEntry({ separateRows: ['Row 1', 'Row 2'] })).toBeUndefined();
            expect(validateEntry(['Bonus roll', { roll: 2, exclude: true }])).toBeUndefined();
        });

        it('should report author-friendly diagnostics on invalid entries', () => {
            const boolDiag = validateEntry(true);
            expect(boolDiag).toBeDefined();
            expect(boolDiag?.code).toBe('yaml-boolean');

            const unquotedColon = validateEntry({ 'Key': 'Value' });
            expect(unquotedColon).toBeDefined();
            expect(unquotedColon?.code).toBe('accidental-mapping');

            const emptyList = validateEntry([]);
            expect(emptyList).toBeDefined();
            expect(emptyList?.code).toBe('empty-entry');
        });
    });

    describe('File Validation & Diagnostics', () => {
        it('should report line number for YAML syntax errors', () => {
            const badYaml = `
tablename: "Broken"
game: "Test"
type: "Test"
results:
  - "Unclosed string
            `;
            const bag = new DiagnosticBag();
            const res = validateFile('test.yaml', badYaml, bag);
            expect(res.valid).toBe(false);
            expect(bag.errors.length).toBeGreaterThan(0);
            expect(bag.errors[0].code).toBe('yaml-syntax');
            expect(bag.errors[0].line).toBeDefined();
        });

        it('should validate table metadata and detect missing required fields', () => {
            const missingGame = `
tablename: "No Game"
results:
  - "Valid"
            `;
            const bag = new DiagnosticBag();
            const res = validateFile('nogame.yaml', missingGame, bag);
            expect(res.valid).toBe(false);
            expect(bag.errors.some(e => e.message.includes('game'))).toBe(true);
        });

        it('should catch empty table content', () => {
            const emptyTable = `
tablename: "Empty"
game: "Test"
type: "Test"
            `;
            const bag = new DiagnosticBag();
            validateFile('empty.yaml', emptyTable, bag);
            expect(bag.errors.some(e => e.code === 'empty-table')).toBe(true);
        });
    });

    describe('Cross-Table Reference Linter', () => {
        it('should detect unresolved table and referenceTable references', () => {
            const sources = [
                {
                    file: 'Source.yaml',
                    content: `
tablename: "Source"
game: "Test"
type: "Test"
results:
  - "Here is {NonExistentSubTable}"
  - "{useReferenceTable{NonExistentRef}{5}}"
                    `
                }
            ];
            const result = compileSources(sources, { lintReferences: true });
            expect(result.diagnostics.some(d => d.code === 'unresolved-reference')).toBe(true);
            expect(result.diagnostics.some(d => d.code === 'unresolved-reference-table')).toBe(true);
        });

        it('should suggest close matches with didYouMean', () => {
            const sources = [
                {
                    file: 'Target.yaml',
                    content: `
tablename: "MonsterTraits"
game: "Test"
type: "Test"
results:
  - "Claws"
                    `
                },
                {
                    file: 'Caller.yaml',
                    content: `
tablename: "Caller"
game: "Test"
type: "Test"
results:
  - "Rolled {MonsterTrats}"
                    `
                }
            ];
            const result = compileSources(sources, { lintReferences: true });
            const unres = result.diagnostics.find(d => d.code === 'unresolved-reference');
            expect(unres).toBeDefined();
            expect(unres?.hint).toContain('MonsterTraits');
        });

        it('should detect unquoted dice inside arithmetic expressions', () => {
            const sources = [
                {
                    file: 'Expr.yaml',
                    content: `
tablename: "Expr"
game: "Test"
type: "Test"
results:
  - "Damage: {1d6 + 5}"
                    `
                }
            ];
            const result = compileSources(sources, { lintReferences: true });
            expect(result.diagnostics.some(d => d.code === 'dice-in-expression')).toBe(true);
        });
    });

    describe('Template Tokenizer & Classifier', () => {
        it('should parse nested templates and classify tokens correctly', () => {
            const ast = parseTemplate('Hello {1d20+2} and {Table|Sub} with [a, b]');
            expect(ast.length).toBe(6); // 'Hello ', expr, ' and ', expr, ' with ', choice
            expect(ast[1].kind).toBe('expression');
            expect(ast[5].kind).toBe('choice');

            const diceToken = classifyToken('1d20+2');
            expect(diceToken.type).toBe('dice');

            const lookupToken = classifyToken('Table|Sub');
            expect(lookupToken.type).toBe('lookup');
            if (lookupToken.type === 'lookup') {
                expect(lookupToken.base).toBe('Table');
                expect(lookupToken.sub).toBe('Sub');
            }
        });
    });
});
