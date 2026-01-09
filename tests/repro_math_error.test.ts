
import { describe, it, expect } from 'vitest';
import { ExpressionEvaluator } from '../src/engine/expr';

describe('ExpressionEvaluator Math Errors', () => {
    const expr = new ExpressionEvaluator();

    it('should handle division by zero gracefully', () => {
        // Currently this logs a warning and returns 0.
        // We want to ensure it doesn't crash, and maybe we want to silence the warning or handle it better.
        const result = expr.evaluate("100 / 0", {});
        expect(result).toBe(0); // Expect default fallback
    });

    it('should handle complex division by zero', () => {
        const result = expr.evaluate("(10 + 20) / (5 - 5)", {});
        expect(result).toBe(0);
    });
});
