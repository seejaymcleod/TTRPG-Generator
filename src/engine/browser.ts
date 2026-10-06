// src/engine/browser.ts
// Browser distribution bundle entrypoint exposing the full TTRPG engine.

import { TableLoader } from './loader';
import { Renderer } from './renderer';
import { ExecutionEngine } from './execution';
import {
    createCardFromResult,
    updateNodeValue,
    findNodeById,
    serializeCard,
    hydrateCard,
    exportCardToMarkdown
} from './card';
import { parseTemplate, walkTemplate } from './template';
import { GitHubTableSyncProvider, IndexedDBTableStorage, MemoryTableStorage } from './sync';
import { normalizeTable, normalizeSubTable } from './normalize';
import yaml from 'js-yaml';

export const TTRPG = {
    TableLoader,
    Renderer,
    ExecutionEngine,
    createCardFromResult,
    updateNodeValue,
    findNodeById,
    serializeCard,
    hydrateCard,
    exportCardToMarkdown,
    parseTemplate,
    walkTemplate,
    GitHubTableSyncProvider,
    IndexedDBTableStorage,
    MemoryTableStorage,
    normalizeTable,
    normalizeSubTable,
    yaml
};

if (typeof window !== 'undefined') {
    (window as any).TTRPG = TTRPG;
}

export default TTRPG;
