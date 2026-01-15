# Repository Map

## Overview
A web-based Tabletop RPG generator using a "File System as CMS" architecture. Content is authored in YAML files, compiled into JSON, and served via an Express backend to a frontend. Includes a Forge workflow for PDF content extraction and a Content browser for managing game content.

## Folder Structure
- **src/**: TypeScript source code containing the core engine, compiler, services, and UI logic.
- **Tables/**: The definitions of all generator tables in YAML format (Source of Truth).
- **_Content/**: Game content storage (monsters, spells, items) and display templates.
- **tests/**: Unit and integration tests, including regression tests for bugs.
- **dist/**: Compiled JavaScript output and the generated `tables.json`.
- **ai/**: Documentation and context files for AI agents.
- **js/**: Frontend JavaScript application logic.
- **css/**: Stylesheets for the frontend.
- **Documents/**: User guides and reference documentation.
- **scripts/**: CLI tools and debug utilities.
- **public/**: Static assets.
- **data/**: User data storage (individual user folders).
- **import/**: PDF source materials for content extraction.

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

### Services (`src/services/`)
- `ForgeService.ts`: PDF content extraction and YAML generation workflow.
- `LLMClient.ts`: LLM integration for content extraction from PDFs.
- `UserService.ts`: User management and authentication.
- `Encryption.ts`: Encryption utilities for sensitive data.

### UI (`src/ui/`)
- `connect_ui.ts`: Bridge between engine and frontend UI.
- `layout.html`: HTML layout template.
- `styles.css`: UI-specific styles.

## Frontend (`js/`)
- `app.js`: Main frontend application logic (search, filtering, rendering, admin functions, content browser).
- `forge.js`: Forge workflow UI for multi-step PDF import and content extraction.
- `extractContext.js`: Context extraction utility.

## Content Storage (`_Content/`)
- `display_templates.yaml`: Card display configuration templates for different content types.
- `ShadowDark/`: ShadowDark game-specific content (monsters, spells, items).
- `Imported/`: User-imported content storage.

## Frontend Entry Points
- `index.html`: Main frontend HTML.
- `index.legacy.html`: Legacy frontend (deprecated).

## Documents (`Documents/`)
- `Creating_Tables_Guide.md`: User guide for authoring YAML tables.
- `Master_Table_Reference.yaml`: Reference YAML showcasing all table features.

## Tests (`tests/`)
- `engine.test.ts`: Core unit tests.
- `verify_content.test.ts`: Integration test for all tables.
- `admin.test.ts`: Admin functionality tests.
- `auth_integration.test.ts`: Authentication integration tests.
- `BugFix_ShadowDark_v136.test.ts`: ShadowDark-specific bugfix regression.
- `repro_recursion.test.ts`: Regression test for renderer recursion loops.
- `repro_math_error.test.ts`: Regression test for math evaluation errors.
- `repro_knave.test.ts`: Knave content debug tests.
- `repro_cairn_bonds_columns.test.ts`: Cairn bonds column rendering test.
- `repro_specific_refs.test.ts`: Specific reference resolution tests.

## Scripts (`scripts/`)
- `cli.ts`: Command-line interface for table generation.
- `debug_dice.ts`: Dice rolling debug utility.
- `debug_loop.ts`: Loop detection debug utility.
- `fix_yaml_structure.ts`: YAML structure repair tool.
- `import_content.ts`: Content import utility for external sources.
- `migrate-users.ts`: User data migration script.
- `organize_tables.ts`: Table organization and restructuring utility.

## Root Level Scripts
- **Server**: `server.js` (Run via `npm start` or `npm run dev`).
- **Legacy Server**: `server.legacy.js` (deprecated, kept for reference).
- **Debug Tools**:
    - `debug_index.ts`: Entry point for debug scripts.
    - `debug_keys.ts`, `debug_subtable.ts`: Specific debug utilities.

## Likely Entry Points
- **Server API**: `server.js`.
- **Compiler CLI**: `src/compiler/build.ts` (Run via `npm run build:tables`).
- **Dev Server**: `npm run dev` (runs server with nodemon).
- **CLI Tool**: `scripts/cli.ts` (Run via `npm run cli`).
