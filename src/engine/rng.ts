// src/engine/rng.ts

// Simple hash function to convert string seed to integer
function xmur3(str: string) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

// Mulberry32 PRNG
function mulberry32(a: number) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export class RNG {
    private rng: () => number;

    constructor(seed?: string) {
        if (seed) {
            const seedFunc = xmur3(seed);
            this.rng = mulberry32(seedFunc());
        } else {
            this.rng = Math.random;
        }
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
