// src/compiler/lint.ts
//
// Usage:
//   npm run lint:tables                       # errors + warnings
//   npm run lint:tables -- --verbose          # include info diagnostics
//   npm run lint:tables -- --strict           # exit non-zero on warnings too
//   npm run lint:tables -- --json             # machine-readable output
//   npm run lint:tables -- --code=unresolved-reference
//   npm run lint:tables -- Shadowdark         # only files whose path contains "Shadowdark"

import path from 'path';
import { Diagnostic, formatDiagnostic, summarize } from './diagnostics';
import { compileDirectory } from './pipeline';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const filters = args.filter(a => !a.startsWith('--'));

const tablesDir = option('dir') ? path.resolve(option('dir')!) : path.join(process.cwd(), '_Tables');
const result = compileDirectory(tablesDir);

let diagnostics: Diagnostic[] = result.diagnostics;
if (!flag('verbose')) diagnostics = diagnostics.filter(d => d.severity !== 'info');
if (option('code')) diagnostics = diagnostics.filter(d => d.code === option('code'));
if (filters.length) diagnostics = diagnostics.filter(d => filters.some(f => d.file.includes(f)));

const order = { error: 0, warning: 1, info: 2 };
diagnostics.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || order[a.severity] - order[b.severity]);

if (flag('json')) {
    console.log(JSON.stringify(diagnostics, null, 2));
} else {
    diagnostics.forEach(d => console.log(formatDiagnostic(d) + '\n'));
    console.log(`🔎 Linted ${result.fileCount} files: ${summarize(diagnostics)}`);
}

const failed = diagnostics.some(d => d.severity === 'error') || (flag('strict') && diagnostics.some(d => d.severity === 'warning'));
process.exit(failed ? 1 : 0);
