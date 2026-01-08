// src/engine/rng.ts
import seedrandom from 'seedrandom';

export class RNG {
    private rng: seedrandom.PRNG;

    constructor(seed?: string) {
        this.rng = seedrandom(seed);
    }

    // Returns float between 0 and 1
    nextFloat(): number {
        return this.rng();
    }

    // Returns integer between min and max (inclusive)
    nextInt(min: number, max: number): number {
        return Math.floor(this.rng() * (max - min + 1)) + min;
    }

    choice<T>(list: T[]): T {
        if (list.length === 0) throw new Error("Cannot choose from empty list");
        return list[this.nextInt(0, list.length - 1)];
    }

    weightedChoice<T>(list: { item: T; weight: number }[]): T {
        const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
        let randomVal = this.nextFloat() * totalWeight;

        for (const entry of list) {
            randomVal -= entry.weight;
            if (randomVal <= 0) {
                return entry.item;
            }
        }
        return list[list.length - 1].item; // Fallback
    }
}
