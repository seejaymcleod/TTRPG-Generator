// src/engine/sync.ts
//
// Phase 4: Client-Side Table Sync Provider & Local Storage / Filesystem
//
// Implements:
//   4.2 Client-Side Table Sync Provider
//       - Secure GitHub API integration (fine-grained PAT / public repos)
//       - Downloads table tree into browser IndexedDB or in-memory TableStorage
//       - Sync mechanism to pull updates across devices
//   4.3 Local Filesystem Fallback
//       - Folder drag-and-drop or File System Access API parsing

import yaml from 'js-yaml';
import { Table } from './types';
import { normalizeTable } from '../compiler/pipeline';

export interface GitHubSyncConfig {
    repoOwner: string;
    repoName: string;
    branch?: string;
    token?: string; // Optional personal access token for private repos
    tablePath?: string; // Root folder inside the repo, defaults to "" or "_Tables"
}

export interface SyncProgress {
    totalFiles: number;
    completedFiles: number;
    currentFile: string;
}

export interface StoredTableRecord {
    filename: string;
    content: string; // raw YAML
    syncedAt: number;
    hash?: string;
}

/**
 * Storage adapter interface for browser IndexedDB or Node memory store.
 */
export interface TableStorage {
    saveTable(record: StoredTableRecord): Promise<void>;
    getTable(filename: string): Promise<StoredTableRecord | undefined>;
    getAllTables(): Promise<StoredTableRecord[]>;
    deleteTable(filename: string): Promise<void>;
    clearAll(): Promise<void>;
}

/**
 * In-memory fallback TableStorage (also used for server-side / unit test environments).
 */
export class MemoryTableStorage implements TableStorage {
    private store = new Map<string, StoredTableRecord>();

    async saveTable(record: StoredTableRecord): Promise<void> {
        this.store.set(record.filename, record);
    }

    async getTable(filename: string): Promise<StoredTableRecord | undefined> {
        return this.store.get(filename);
    }

    async getAllTables(): Promise<StoredTableRecord[]> {
        return Array.from(this.store.values());
    }

    async deleteTable(filename: string): Promise<void> {
        this.store.delete(filename);
    }

    async clearAll(): Promise<void> {
        this.store.clear();
    }
}

/**
 * Browser IndexedDB TableStorage implementation.
 */
export class IndexedDBTableStorage implements TableStorage {
    private dbName = 'TTRPG_Tables_DB';
    private storeName = 'tables';
    private version = 1;

    private async openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('IndexedDB is not available in this environment'));
            }
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'filename' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveTable(record: StoredTableRecord): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async getTable(filename: string): Promise<StoredTableRecord | undefined> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(filename);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllTables(): Promise<StoredTableRecord[]> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async deleteTable(filename: string): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.delete(filename);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async clearAll(): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}

/**
 * 4.2 GitHub Table Sync Provider:
 * Communicates with GitHub REST API to list and download YAML table files into TableStorage.
 */
export class GitHubTableSyncProvider {
    private storage: TableStorage;

    constructor(storage?: TableStorage) {
        if (storage) {
            this.storage = storage;
        } else if (typeof indexedDB !== 'undefined') {
            this.storage = new IndexedDBTableStorage();
        } else {
            this.storage = new MemoryTableStorage();
        }
    }

    public getStorage(): TableStorage {
        return this.storage;
    }

    /**
     * Sync tables from a remote GitHub repository.
     */
    async syncFromGitHub(
        config: GitHubSyncConfig,
        onProgress?: (progress: SyncProgress) => void,
        customFetch: typeof fetch = fetch
    ): Promise<Table[]> {
        const branch = config.branch || 'main';
        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'TTRPG-Generator-Sync'
        };
        if (config.token) {
            headers['Authorization'] = `token ${config.token}`;
        }

        // 1. Get the Git tree recursively to list all files
        const treeUrl = `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/trees/${branch}?recursive=1`;
        const treeRes = await customFetch(treeUrl, { headers });
        if (!treeRes.ok) {
            throw new Error(`Failed to fetch repo tree: ${treeRes.status} ${treeRes.statusText}`);
        }

        const treeData = await treeRes.json();
        if (!treeData.tree || !Array.isArray(treeData.tree)) {
            throw new Error('Invalid repository tree response from GitHub');
        }

        const prefix = config.tablePath ? config.tablePath.replace(/^\/+|\/+$/g, '') + '/' : '';
        const yamlEntries = treeData.tree.filter((item: any) => {
            if (item.type !== 'blob') return false;
            const isYaml = item.path.endsWith('.yaml') || item.path.endsWith('.yml');
            if (!isYaml) return false;
            if (prefix) return item.path.startsWith(prefix);
            return true;
        });

        const totalFiles = yamlEntries.length;
        const parsedTables: Table[] = [];

        // 2. Fetch each file content (raw)
        for (let i = 0; i < yamlEntries.length; i++) {
            const entry = yamlEntries[i];
            const filename = entry.path.split('/').pop() || entry.path;

            if (onProgress) {
                onProgress({
                    totalFiles,
                    completedFiles: i,
                    currentFile: filename
                });
            }

            const rawUrl = `https://raw.githubusercontent.com/${config.repoOwner}/${config.repoName}/${branch}/${entry.path}`;
            const fileRes = await customFetch(rawUrl, { headers });

            if (fileRes.ok) {
                const text = await fileRes.text();
                // Save to local storage
                await this.storage.saveTable({
                    filename,
                    content: text,
                    syncedAt: Date.now(),
                    hash: entry.sha
                });

                // Parse and normalize into Table object
                try {
                    const parsed = yaml.load(text);
                    const tables = Array.isArray(parsed) ? parsed : [parsed];
                    tables.forEach((t: any) => {
                        normalizeTable(t, filename);
                        parsedTables.push(t as Table);
                    });
                } catch (e: any) {
                    console.warn(`[Sync] Failed to parse YAML for ${filename}: ${e.message}`);
                }
            }
        }

        if (onProgress) {
            onProgress({
                totalFiles,
                completedFiles: totalFiles,
                currentFile: 'Complete'
            });
        }

        return parsedTables;
    }

    /**
     * 4.3 Local Filesystem / Dropped Files parser:
     * Parses multiple local file contents and saves them to local TableStorage.
     */
    async importLocalFiles(files: { name: string; content: string }[]): Promise<Table[]> {
        const tables: Table[] = [];
        for (const file of files) {
            if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml')) continue;

            await this.storage.saveTable({
                filename: file.name,
                content: file.content,
                syncedAt: Date.now()
            });

            try {
                const parsed = yaml.load(file.content);
                const tableList = Array.isArray(parsed) ? parsed : [parsed];
                tableList.forEach((t: any) => {
                    normalizeTable(t, file.name);
                    tables.push(t as Table);
                });
            } catch (e: any) {
                console.warn(`[Import] Failed to parse ${file.name}: ${e.message}`);
            }
        }
        return tables;
    }

    /**
     * Load and parse all currently stored tables from TableStorage into runtime Tables.
     */
    async loadStoredTables(): Promise<Table[]> {
        const records = await this.storage.getAllTables();
        const tables: Table[] = [];

        for (const rec of records) {
            try {
                const parsed = yaml.load(rec.content);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                list.forEach((t: any) => {
                    normalizeTable(t, rec.filename);
                    tables.push(t as Table);
                });
            } catch (e: any) {
                console.warn(`[LoadStored] Could not parse stored ${rec.filename}: ${e.message}`);
            }
        }

        return tables;
    }
}
