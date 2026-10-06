// src/compiler/diagnostics.ts
//
// Structured diagnostics for the table compiler and linter. Every problem carries
// the file, YAML path and (when known) source line, plus a stable `code` so tests
// and tooling can match on it.

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
    severity: Severity;
    code: string;
    message: string;
    /** File path relative to the tables root (or as given). */
    file: string;
    /** 1-based source line, if it could be determined. */
    line?: number;
    /** Path inside the YAML document, e.g. ['tables', 2, 'results', 5]. */
    path: (string | number)[];
    /** Suggested fix. */
    hint?: string;
}

export class DiagnosticBag {
    readonly items: Diagnostic[] = [];

    add(d: Diagnostic): void {
        this.items.push(d);
    }

    get errors(): Diagnostic[] { return this.items.filter(d => d.severity === 'error'); }
    get warnings(): Diagnostic[] { return this.items.filter(d => d.severity === 'warning'); }
    get hasErrors(): boolean { return this.items.some(d => d.severity === 'error'); }
}

/** Human readable YAML path: tables[2].results[5] */
export function formatPath(path: (string | number)[]): string {
    return path.reduce<string>((acc, part) => {
        if (typeof part === 'number') return `${acc}[${part}]`;
        return acc ? `${acc}.${part}` : part;
    }, '');
}

const ICONS: Record<Severity, string> = { error: '❌', warning: '⚠️ ', info: 'ℹ️ ' };

export function formatDiagnostic(d: Diagnostic): string {
    const loc = `${d.file}${d.line ? `:${d.line}` : ''}`;
    const where = d.path.length ? ` (${formatPath(d.path)})` : '';
    let out = `${ICONS[d.severity]} ${loc}${where}\n   [${d.code}] ${d.message}`;
    if (d.hint) out += `\n   ↳ ${d.hint}`;
    return out;
}

export function summarize(diagnostics: Diagnostic[]): string {
    const count = (s: Severity) => diagnostics.filter(d => d.severity === s).length;
    const byCode = new Map<string, number>();
    diagnostics.forEach(d => byCode.set(d.code, (byCode.get(d.code) || 0) + 1));
    const codes = [...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}: ${n}`).join(', ');
    return `${count('error')} error(s), ${count('warning')} warning(s), ${count('info')} info` + (codes ? `\n   ${codes}` : '');
}

/** Levenshtein distance, used for "did you mean" hints. */
export function editDistance(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return dp[a.length][b.length];
}

export function didYouMean(name: string, candidates: Iterable<string>, maxDistance?: number): string | undefined {
    const lower = name.toLowerCase();
    const limit = maxDistance ?? Math.max(2, Math.floor(name.length / 4));
    let best: string | undefined;
    let bestScore = Infinity;
    for (const c of candidates) {
        const score = editDistance(lower, c.toLowerCase());
        if (score < bestScore) { best = c; bestScore = score; }
    }
    return bestScore <= limit ? best : undefined;
}
