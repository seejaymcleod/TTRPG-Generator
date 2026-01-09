
import * as path from 'path';
import * as fs from 'fs';
import { TableLoader } from '../src/engine/loader';
import { Renderer } from '../src/engine/renderer';

interface CliOptions {
    table: string | null;
    count: number;
    stress: boolean;
    list: boolean;
    all: boolean; // For smoke testing all tables
    timeout: number;
}

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        table: null,
        count: 1,
        stress: false,
        list: false,
        all: false,
        timeout: 5000
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--table':
                options.table = args[++i];
                break;
            case '--count':
                options.count = parseInt(args[++i], 10);
                break;
            case '--stress':
                options.stress = true;
                break;
            case '--list':
                options.list = true;
                break;
            case '--all':
                options.all = true;
                break;
            case '--timeout':
                options.timeout = parseInt(args[++i], 10);
                break;
        }
    }
    return options;
}

async function run() {
    const options = parseArgs();

    // Load Tables
    const tablesPath = path.join(__dirname, '../dist/tables.json');
    if (!fs.existsSync(tablesPath)) {
        console.error("Error: dist/tables.json not found. Run 'npm run build:tables' first.");
        process.exit(1);
    }

    const loader = new TableLoader();
    loader.loadFromJSON(tablesPath);
    const renderer = new Renderer(loader, undefined, options.timeout); // Pass timeout

    console.log(`Loaded ${loader.getAllTables().length} tables.`);

    if (options.list) {
        loader.getAllTables().forEach(t => console.log(`- ${t.tablename}`));
        return;
    }

    if (options.all) {
        console.log("Running SMOKE TEST on all tables...");
        const tables = loader.getAllTables();
        let errors = 0;
        for (const t of tables) {
            try {
                renderer.generate(t.tablename);
                // console.log(`[PASS] ${t.tablename}`);
            } catch (e: any) {
                console.error(`[FAIL] ${t.tablename}: ${e.message}`);
                errors++;
            }
        }
        console.log(`Smoke test complete. Errors: ${errors}`);
        process.exit(errors > 0 ? 1 : 0);
    }

    if (options.table) {
        console.log(`Generating '${options.table}' (Count: ${options.count}, Timeout: ${options.timeout}ms)...`);

        let failures = 0;
        for (let i = 0; i < options.count; i++) {
            try {
                const result = renderer.generate(options.table);
                if (options.stress && i % 100 === 0) process.stderr.write(`Iter ${i}...\r`); // Progress indicator

                // Only print output if NOT stress testing or if it's the first few
                if (!options.stress || i < 5) {
                    console.log(`\n--- Result ${i + 1} ---`);
                    console.log(typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : result.result);
                }

                if (String(result.result).includes("[object Object]")) {
                    throw new Error("Result contains [object Object]");
                }

            } catch (e: any) {
                console.error(`\n[ERROR] Iteration ${i} failed: ${e.message}`);
                failures++;
                if (options.stress) {
                    console.error("Stress test aborted.");
                    process.exit(1);
                }
            }
        }

        if (options.stress) console.error(`\nStress test finished. Failures: ${failures}`);
        process.exit(failures > 0 ? 1 : 0);
    } else {
        console.log("Usage: npx ts-node scripts/cli.ts --table <name> [--count N] [--stress] [--all] [--list]");
    }
}

run();
