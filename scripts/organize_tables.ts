import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const TABLES_DIR = path.join(process.cwd(), '_Tables');

// Helper to sanitize folder names
function sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '');
}

function organize() {
    console.log('📦 Organizing Tables...');

    if (!fs.existsSync(TABLES_DIR)) {
        console.error(`❌ Tables directory not found at ${TABLES_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(TABLES_DIR);
    let movedCount = 0;
    let errorCount = 0;

    files.forEach(file => {
        const filePath = path.join(TABLES_DIR, file);
        const stat = fs.statSync(filePath);

        // Skip directories and non-yaml files
        if (stat.isDirectory()) return;
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) return;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const doc = yaml.load(content) as any;

            let gameName = 'Misc';

            // 1. Try to get game from YAML content
            if (doc && doc.game) {
                gameName = doc.game;
            }
            // 2. Try to infer from filename (e.g. "Knave_Weapons.yaml")
            else if (file.includes('_')) {
                gameName = file.split('_')[0];
            }

            // Sanitize folder name
            const folderName = sanitize(gameName);
            const targetDir = path.join(TABLES_DIR, folderName);

            // Create directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir);
            }

            const targetPath = path.join(targetDir, file);

            // Move file
            // Check if file already exists in target (sanity check)
            if (fs.existsSync(targetPath)) {
                console.warn(`⚠️  File ${file} already exists in ${folderName}, skipping.`);
            } else {
                fs.renameSync(filePath, targetPath);
                console.log(`✅ Moved ${file} -> ${folderName}/`);
                movedCount++;
            }

        } catch (e: any) {
            console.error(`❌ Error processing ${file}: ${e.message}`);
            errorCount++;
        }
    });

    console.log(`\n✨ Organization Complete!`);
    console.log(`   Moved: ${movedCount}`);
    console.log(`   Errors: ${errorCount}`);
}

organize();
