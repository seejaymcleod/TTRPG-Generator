// src/engine/expr.ts
import { Context } from './types';

export class ExpressionEvaluator {
    // Evaluates "10 + 5", "TestInput * 2", "100 / 0", "Dice > 5"
    // Valid tokens: numbers, +, -, *, /, %, >, <, >=, <=, ==, !=, (, ), identifiers
    evaluate(expr: string, context: Context): number {
        // Tokenize
        const tokens = this.tokenize(expr);
        if (tokens.length === 0) return 0;

        // Parse and resolve identifiers
        const activeTokens: (string | number)[] = tokens.map(t => {
            if (this.isNumber(t)) return parseFloat(t);
            if (this.isOperator(t) || t === '(' || t === ')') return t;
            // It's an identifier
            const val = context[t];
            if (val === undefined) {
                return 0;
            }
            return Number(val);
        });

        try {
            return this.calculate(activeTokens);
        } catch (e) {
            console.warn(`Math error in "${expr}":`, e);
            return 0; // Fallback
        }
    }

    private isNumber(s: string): boolean {
        return !isNaN(parseFloat(s)) && isFinite(parseFloat(s));
    }

    private isOperator(s: string): boolean {
        return ['+', '-', '*', '/', '%', '>', '<', '>=', '<=', '==', '!='].includes(s);
    }

    private tokenize(expr: string): string[] {
        // Spaces are separators. Operators are separators.
        // We need to capture multi-char operators first
        // Regex: Split by spaces, but keep operators. 
        // A simple split by space isn't enough if operators don't have spaces.
        // We use a regex that matches operators or other tokens.

        // Match:
        // 1. Comparison Operators (descending length)
        // 2. Arithmetic Operators
        // 3. Parentheses
        // 4. Numbers / Identifiers (non-operator chars)

        const pattern = /(>=|<=|==|!=|[+\-*/%><()]|[a-zA-Z0-9_.]+|"[^"]*")/g;
        const matches = expr.match(pattern);
        return matches ? matches : [];
    }

    // Shunting-yard algorithm to RPN then evaluate
    private calculate(tokens: (string | number)[]): number {
        const outputQueue: (number | string)[] = [];
        const operatorStack: string[] = [];

        const precedence: Record<string, number> = {
            '*': 3, '/': 3, '%': 3,
            '+': 2, '-': 2,
            '>': 1, '<': 1, '>=': 1, '<=': 1, '==': 1, '!=': 1
        };

        for (const token of tokens) {
            if (typeof token === 'number') {
                outputQueue.push(token);
            } else if (token === '(') {
                operatorStack.push(token);
            } else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop()!);
                }
                operatorStack.pop(); // Pop '('
            } else if (this.isOperator(token as string)) {
                const op = token as string;
                while (
                    operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1] !== '(' &&
                    (precedence[operatorStack[operatorStack.length - 1]] || 0) >= (precedence[op] || 0)
                ) {
                    outputQueue.push(operatorStack.pop()!);
                }
                operatorStack.push(op);
            }
        }

        while (operatorStack.length > 0) {
            outputQueue.push(operatorStack.pop()!);
        }

        // Evaluate RPN
        const evalStack: number[] = [];
        for (const token of outputQueue) {
            if (typeof token === 'number') {
                evalStack.push(token);
            } else {
                const b = evalStack.pop();
                const a = evalStack.pop();
                if (a === undefined || b === undefined) throw new Error("Invalid expression");

                switch (token) {
                    case '+': evalStack.push(a + b); break;
                    case '-': evalStack.push(a - b); break;
                    case '*': evalStack.push(a * b); break;
                    case '/': evalStack.push(b === 0 ? 0 : a / b); break;
                    case '%': evalStack.push(a % b); break;
                    case '>': evalStack.push(a > b ? 1 : 0); break;
                    case '<': evalStack.push(a < b ? 1 : 0); break;
                    case '>=': evalStack.push(a >= b ? 1 : 0); break;
                    case '<=': evalStack.push(a <= b ? 1 : 0); break;
                    case '==': evalStack.push(a === b ? 1 : 0); break;
                    case '!=': evalStack.push(a !== b ? 1 : 0); break;
                }
            }
        }

        return evalStack.length > 0 ? evalStack[0] : 0;
    }
}
