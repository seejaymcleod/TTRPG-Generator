// src/engine/expr.ts
import { Context } from './types';

export class ExpressionEvaluator {
    // Evaluates "10 + 5", "TestInput * 2", "100 / 0"
    // Valid tokens: numbers, +, -, *, /, (, ), identifiers
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
                // Try looking in thisResult for implicit array index usage in complex cases, 
                // but strict spec says context identifiers.
                // We'll log/warn and return 0 for safety as per prompt 'MathErrorHandling'
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
        return ['+', '-', '*', '/'].includes(s);
    }

    private tokenize(expr: string): string[] {
        // Spaces are separators. Operators are separators.
        // Clean cleanup
        return expr.replace(/([+\-*/()])/g, ' $1 ').trim().split(/\s+/).filter(x => x.length > 0);
    }

    // Shunting-yard algorithm to RPN then evaluate
    private calculate(tokens: (string | number)[]): number {
        const outputQueue: (number | string)[] = [];
        const operatorStack: string[] = [];

        const precedence: Record<string, number> = {
            '+': 1,
            '-': 1,
            '*': 2,
            '/': 2
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
                    precedence[operatorStack[operatorStack.length - 1]] >= precedence[op]
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
                    case '/':
                        if (b === 0) throw new Error("Division by zero");
                        evalStack.push(a / b);
                        break;
                }
            }
        }

        return evalStack.length > 0 ? evalStack[0] : 0;
    }
}
