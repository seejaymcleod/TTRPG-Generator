# Repository Map

## Overview
A web-based Tabletop RPG generator using a "File System as CMS" architecture. Content is authored in YAML files, compiled into JSON, and served via an Express backend to a frontend.

## Folder Structure
- **src/**: TypeScript source code containing the core engine and compiler logic.
- **Tables/**: The definitions of all generator tables in YAML format (Source of Truth).
- **tests/**: Unit and integration tests.
- **dist/**: Compiled JavaScript output and the generated `tables.json`.
- **ai/**: Documentation and context files for AI agents.
- **public/**: Static assets (implied, currently empty/default).
- **utils/**: Utility scripts (content unclear from high-level scan).

## Parser-Related Files
The "Parser" logic is split between the **Compiler** (build-time validation) and the **Engine** (runtime generation).

### Compiler (`src/compiler/`)
- `build.ts`: Main entry point. Reads YAML, validates against schema, resolves IDs, builds `tables.json`.
- `schema.ts`: Zod definitions for `Table`, `Entry`, and other core data structures.

### Engine (`src/engine/`)
- `loader.ts`: `TableLoader` class. Loads `tables.json`, indexes tables/subtables, provides lookup methods.
- `renderer.ts`: `Renderer` class. Core logic for parsing result strings, handling tokens (`{...}`), recursive generation, and dice rolling.
- `index.ts`: Exports the engine modules.
- `types.ts`: TypeScript interfaces shared by Compiler and Engine.
- `rng.ts`: Seeded Random Number Generator implementation.
- `dice.ts`: Dice rolling logic (likely).
- `expr.ts`: Expression evaluator (likely).
- `referenceTables.ts`: Handling of reference tables (e.g. `ShadowDark` lookup tables).

## Tests
- `tests/engine.test.ts`: Unit tests for the Engine's parsing and generation capabilities (e.g., nesting, weird syntax).
- `tests/verify_content.test.ts`: Comprehensive integration test that iterates every table in `tables.json` to verify validity.

## Likely Entry Points
- **Server API**: `server.js` (Run via `npm start` or `npm run dev`).
  - Initializes `TableLoader` from `dist/tables.json`.
  - Serves `index.html` and static files.
  - API Endpoints (inferred): likely acts as a passthrough or serves the JSON.
- **Compiler CLI**: `src/compiler/build.ts` (Run via `npm run build:tables`).
  - Converts `Tables/*.yaml` -> `dist/tables.json`.
- **Frontend**: `index.html` (Main UI).

## Open Questions
- `server.legacy.js` exists in the root; unclear if any legacy logic is still required or if migration is fully complete.
- `utils/` folder content and purpose (not fully inspected).
