import fs from 'fs';
import path from 'path';
import { compileDirectory } from './pipeline';
import { formatDiagnostic, summarize } from './diagnostics';

const TABLES_DIR = path.join(process.cwd(), '_Tables');
const DIST_DIR = path.join(process.cwd(), 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'tables.json');

// Ensure dist exists
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

function build() {
    console.log('🏗️  Building Tables...');
    // In build mode, we perform full validation without failing build on cross-table references,
    // which are linter checks (available via npm run lint:tables).
    const result = compileDirectory(TABLES_DIR, { lintReferences: false });

    const errors = result.diagnostics.filter(d => d.severity === 'error');
    if (errors.length > 0) {
        console.error(`\n💥 Build failed with ${errors.length} error(s):`);
        errors.forEach(err => console.error(formatDiagnostic(err) + '\n'));
        process.exit(1);
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result.tables, null, 2));
    console.log(`\n✨ Build Complete!`);
    console.log(`   Processed ${result.fileCount} files.`);
    console.log(`   Generated ${result.tables.length} tables.`);
    console.log(`   Output: ${OUTPUT_FILE}`);

    const warnings = result.diagnostics.filter(d => d.severity === 'warning');
    if (warnings.length > 0) {
        console.log(`   Notice: ${warnings.length} warning(s) detected. Run 'npm run lint:tables' to inspect.`);
    }
}

build();
