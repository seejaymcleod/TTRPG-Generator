import fs from 'fs';
import path from 'path';
import { compileDirectories } from './pipeline';
import { formatDiagnostic, summarize } from './diagnostics';

const TABLES_DIR = path.join(process.cwd(), '_Tables');
const PRIVATE_TABLES_DIR = path.join(process.cwd(), '_Tables_Private');
const DIST_DIR = path.join(process.cwd(), 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'tables.json');

const DATA_DIR = path.join(process.cwd(), 'data');
const PUBLIC_OUTPUT_FILE = path.join(DATA_DIR, 'tables.json');

// Ensure dist and data exist
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function build() {
    console.log('🏗️  Building Tables...');

    // 1. Compile open tables for public static hosting (GitHub Pages)
    const publicResult = compileDirectories([TABLES_DIR], { lintReferences: false });
    const publicErrors = publicResult.diagnostics.filter(d => d.severity === 'error');
    if (publicErrors.length > 0) {
        console.error(`\n💥 Build failed with ${publicErrors.length} error(s) on open tables:`);
        publicErrors.forEach(err => console.error(formatDiagnostic(err) + '\n'));
        process.exit(1);
    }
    fs.writeFileSync(PUBLIC_OUTPUT_FILE, JSON.stringify(publicResult.tables, null, 2));
    console.log(`   📦 Public Open Tables: ${publicResult.tables.length} tables saved to ${PUBLIC_OUTPUT_FILE}`);

    // 2. Compile all tables (including private if present) for local engine / server
    const tableDirs = [TABLES_DIR];
    if (fs.existsSync(PRIVATE_TABLES_DIR)) {
        console.log(`   🔒 Including private tables from: ${PRIVATE_TABLES_DIR}`);
        tableDirs.push(PRIVATE_TABLES_DIR);
    }

    const result = compileDirectories(tableDirs, { lintReferences: false });
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    if (errors.length > 0) {
        console.error(`\n💥 Build failed with ${errors.length} error(s):`);
        errors.forEach(err => console.error(formatDiagnostic(err) + '\n'));
        process.exit(1);
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result.tables, null, 2));
    console.log(`\n✨ Build Complete!`);
    console.log(`   Total tables compiled: ${result.tables.length}`);
    console.log(`   Server output: ${OUTPUT_FILE}`);

    const warnings = result.diagnostics.filter(d => d.severity === 'warning');
    if (warnings.length > 0) {
        console.log(`   Notice: ${warnings.length} warning(s) detected. Run 'npm run lint:tables' to inspect.`);
    }
}

build();
