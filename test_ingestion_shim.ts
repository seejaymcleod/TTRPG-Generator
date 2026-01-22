import { ForgeService } from './src/services/ForgeService';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
    console.log("Initializing ForgeService...");
    const forge = new ForgeService();

    // Real PDF Path
    const pdfPath = String.raw`C:\Users\Seejay\source\repos\TTRPG-Generator\_Forge\Import\Cursed Scroll 6 - City of Masks V1-1.pdf`;

    if (!fs.existsSync(pdfPath)) {
        console.error(`File not found: ${pdfPath}`);
        process.exit(1);
    }

    console.log(`Reading file: ${pdfPath}`);
    const buffer = fs.readFileSync(pdfPath);

    try {
        console.log("Starting ingestion job...");
        // This will spawn python. 
        const { jobId, manifestPath } = await forge.startIngestionJob(buffer, 'Cursed Scroll 6 - City of Masks V1-1.pdf');
        console.log(`Job Created: ${jobId}`);
        console.log(`Manifest: ${manifestPath}`);

        console.log("Waiting 60 seconds for initial processing to start...");
        // Wait longer because real docling might take a moment to boot
        await new Promise(r => setTimeout(r, 60000));

        const job = forge.getJob(jobId);
        console.log("Job Status Check:", JSON.stringify(job, null, 2));

        // List pages if any
        if (job && job.pages.length > 0) {
            console.log(`Found ${job.pages.length} pages generated.`);
        } else {
            console.log("No pages generated yet (Python might still be running or failed).");
        }

    } catch (e) {
        console.error("Test Failed:", e);
    } finally {
        process.exit(0);
    }
}

runTest();
