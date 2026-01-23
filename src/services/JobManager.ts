import * as fs from 'fs';
import * as path from 'path';

export interface JobManifest {
    jobId: string;
    source: string;
    totalPages: number;
    pages: string[]; // Filenames of page chunks
    status: 'uploading' | 'ready' | 'processing' | 'completed' | 'failed';
    provider?: string;
    model?: string;
    progress: {
        processed: number;
        failed: number;
        total: number;
    };
    created: number;
    updated: number;
}

export class JobManager {
    private stagingRoot: string;

    constructor() {
        this.stagingRoot = path.resolve(process.cwd(), '_Forge', 'Staging');
        if (!fs.existsSync(this.stagingRoot)) {
            fs.mkdirSync(this.stagingRoot, { recursive: true });
        }
    }

    createJob(jobId: string, sourceCwdRelative: string): JobManifest {
        const jobDir = path.join(this.stagingRoot, jobId);
        if (!fs.existsSync(jobDir)) {
            fs.mkdirSync(jobDir, { recursive: true });
        }

        const manifest: JobManifest = {
            jobId,
            source: sourceCwdRelative,
            totalPages: 0,
            pages: [],
            status: 'uploading',
            progress: { processed: 0, failed: 0, total: 0 },
            created: Date.now(),
            updated: Date.now()
        };

        this.saveManifest(jobId, manifest);
        return manifest;
    }

    getJob(jobId: string): JobManifest | null {
        try {
            const manifestPath = path.join(this.stagingRoot, jobId, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                const data = fs.readFileSync(manifestPath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error(`Failed to load job ${jobId}: ${e}`);
        }
        return null;
    }

    updateJob(jobId: string, update: Partial<JobManifest>) {
        const job = this.getJob(jobId);
        if (job) {
            const updatedJob = { ...job, ...update, updated: Date.now() };
            this.saveManifest(jobId, updatedJob);
            return updatedJob;
        }
        return null;
    }

    private saveManifest(jobId: string, manifest: JobManifest) {
        const manifestPath = path.join(this.stagingRoot, jobId, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    listJobs(): JobManifest[] {
        const jobs: JobManifest[] = [];
        if (fs.existsSync(this.stagingRoot)) {
            const dirs = fs.readdirSync(this.stagingRoot);
            for (const dir of dirs) {
                const job = this.getJob(dir);
                if (job) jobs.push(job);
            }
        }
        // Sort by newest first
        return jobs.sort((a, b) => b.created - a.created);
    }

    getPageContent(jobId: string, pageFile: string): any | null {
        try {
            // New structure: Pages are in "Pages" subdirectory
            let pagePath = path.join(this.stagingRoot, jobId, 'Pages', pageFile);

            // Backward compatibility: Check root if not in Pages
            if (!fs.existsSync(pagePath)) {
                pagePath = path.join(this.stagingRoot, jobId, pageFile);
            }

            if (fs.existsSync(pagePath)) {
                return JSON.parse(fs.readFileSync(pagePath, 'utf-8'));
            }
        } catch (e) {
            console.error(`Failed to read page ${pageFile} for job ${jobId}: ${e}`);
        }
        return null;
    }
}
