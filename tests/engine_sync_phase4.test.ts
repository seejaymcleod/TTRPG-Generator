// tests/engine_sync_phase4.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
    GitHubTableSyncProvider,
    MemoryTableStorage,
    GitHubSyncConfig,
    SyncProgress
} from '../src/engine/sync';

describe('Phase 4: Dual-Repo Split & Multi-Device Sync', () => {
    describe('4.2 Client-Side Table Sync Provider', () => {
        it('should sync YAML tables from GitHub repository tree and save to storage', async () => {
            const memoryStorage = new MemoryTableStorage();
            const provider = new GitHubTableSyncProvider(memoryStorage);

            const mockTreeResponse = {
                tree: [
                    { path: 'Shadowdark/Monsters.yaml', type: 'blob', sha: 'abc123' },
                    { path: 'README.md', type: 'blob', sha: 'def456' },
                    { path: 'Shadowdark/Spells.yaml', type: 'blob', sha: 'ghi789' }
                ]
            };

            const mockYamlContent1 = `
tablename: "Monsters"
game: "Shadowdark"
type: "Bestiary"
results:
  - "Goblin"
  - "Orc"
`;

            const mockYamlContent2 = `
tablename: "Spells"
game: "Shadowdark"
type: "Magic"
results:
  - "Light"
  - "Fireball"
`;

            const mockFetch = vi.fn().mockImplementation((url: string) => {
                if (url.includes('/git/trees/')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve(mockTreeResponse)
                    });
                }
                if (url.includes('Monsters.yaml')) {
                    return Promise.resolve({
                        ok: true,
                        text: () => Promise.resolve(mockYamlContent1)
                    });
                }
                if (url.includes('Spells.yaml')) {
                    return Promise.resolve({
                        ok: true,
                        text: () => Promise.resolve(mockYamlContent2)
                    });
                }
                return Promise.resolve({ ok: false, status: 404 });
            });

            const progressEvents: SyncProgress[] = [];
            const config: GitHubSyncConfig = {
                repoOwner: 'owner',
                repoName: 'ttrpg-private-tables',
                token: 'ghp_secret_token_123'
            };

            const tables = await provider.syncFromGitHub(
                config,
                (p) => progressEvents.push({ ...p }),
                mockFetch as any
            );

            expect(tables.length).toBe(2);
            expect(tables[0].tablename).toBe('Monsters');
            expect(tables[1].tablename).toBe('Spells');

            // Verify progress callbacks
            expect(progressEvents.length).toBeGreaterThan(0);
            expect(progressEvents[progressEvents.length - 1].currentFile).toBe('Complete');

            // Verify storage
            const stored = await memoryStorage.getAllTables();
            expect(stored.length).toBe(2);
            expect(stored.some(s => s.filename === 'Monsters.yaml')).toBe(true);
            expect(stored.some(s => s.filename === 'Spells.yaml')).toBe(true);
        });

        it('should handle private repository token in request headers', async () => {
            const memoryStorage = new MemoryTableStorage();
            const provider = new GitHubTableSyncProvider(memoryStorage);

            const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
                expect(opts.headers['Authorization']).toBe('token my_token');
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ tree: [] })
                });
            });

            await provider.syncFromGitHub(
                { repoOwner: 'test', repoName: 'repo', token: 'my_token' },
                undefined,
                mockFetch as any
            );
        });
    });

    describe('4.3 Local Filesystem Fallback & Stored Loading', () => {
        it('should import local dropped files into storage and load them', async () => {
            const storage = new MemoryTableStorage();
            const provider = new GitHubTableSyncProvider(storage);

            const files = [
                {
                    name: 'Custom_Encounters.yaml',
                    content: `
tablename: "Encounters"
game: "Custom"
type: "Adventure"
results:
  - "Bandit Ambush"
  - "Wandering Merchant"
`
                }
            ];

            const imported = await provider.importLocalFiles(files);
            expect(imported.length).toBe(1);
            expect(imported[0].tablename).toBe('Encounters');

            const loaded = await provider.loadStoredTables();
            expect(loaded.length).toBe(1);
            expect(loaded[0].tablename).toBe('Encounters');
        });
    });
});
