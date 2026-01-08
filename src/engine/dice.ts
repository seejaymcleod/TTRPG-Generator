// src/engine/dice.ts
import { RNG } from './rng';

export class Dice {
    private rng: RNG;

    constructor(rng: RNG) {
        this.rng = rng;
    }

    // Parses string like "3d6+1", "1d20", "2d8-5"
    // Returns result number
    roll(expression: string): number {
        const match = expression.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/i);
        if (!match) {
            throw new Error(`Invalid dice expression: ${expression}`);
        }

        const count = parseInt(match[1], 10);
        const sides = parseInt(match[2], 10);
        const operator = match[3];
        const modifier = match[4] ? parseInt(match[4], 10) : 0;

        let total = 0;
        for (let i = 0; i < count; i++) {
            total += this.rng.nextInt(1, sides);
        }

        if (operator === '+') {
            total += modifier;
        } else if (operator === '-') {
            total -= modifier;
        }

        return total;
    }
}
