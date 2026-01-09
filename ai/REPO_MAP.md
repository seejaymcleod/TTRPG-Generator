# Repository Map

## Overview
A web-based Tabletop RPG generator using a "File System as CMS" architecture. Content is authored in YAML files, compiled into JSON, and served via an Express backend to a frontend.

## Folder Structure
- **src/**: TypeScript source code containing the core engine and compiler logic.
- **Tables/**: The definitions of all generator tables in YAML format (Source of Truth).
- **tests/**: Unit and integration tests, including regression tests for bugs.
- **dist/**: Compiled JavaScript output and the generated `tables.json`.
- **ai/**: Documentation and context files for AI agents.
- **public/**: Static assets.
- **utils/**: (Currently empty).

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
- `dice.ts`: Dice rolling logic.
- `expr.ts`: Expression evaluator (math logic).
- `referenceTables.ts`: Handling of reference tables.

## Tests (`tests/`)
- `engine.test.ts`: core unit tests.
- `verify_content.test.ts`: integration test for all tables.
- `debug_circular.test.ts`: Circular dependency debug tests.
- `repro_recursion.test.ts`: Regression test for renderer recursion loops.
- `repro_math_error.test.ts`: Regression test for math evaluation errors.
- `repro_knave.test.ts`, `debug_knave_content.test.ts`: Specific content debug tests.

## Root Level Scripts
- **Server**: `server.js` (Run via `npm start` or `npm run dev`).
- **Debug Tools**:
    - `debug_index.ts`: entry point for debug scripts.
    - `debug_keys.ts`, `debug_subtable.ts`: specific debug utilities.

## Likely Entry Points
- **Server API**: `server.js`.
- **Compiler CLI**: `src/compiler/build.ts` (Run via `npm run build:tables`).
- **Dev Server**: `npm run dev` (runs server with nodemon).

## Open Questions
- `server.legacy.js` exists in root; unclear if active.
