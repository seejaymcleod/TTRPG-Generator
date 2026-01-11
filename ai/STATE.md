# Project State (keep under 40 lines if possible)

Project: Tabletop RPG table generator (File System as CMS)
Version: 0.1.48

Current focus:
- Multi-column table rendering
- Object rendering failsafes ([object Object] prevention)
- Documentation audit and test coverage improvement

Core paths:
- src/engine/ (Renderer, Loader, Expressions)
- Tables/ (Content)
- tests/ (Unit & Regression tests)

Parsing rules snapshot:
- Recursive token replacement `{@Table}`
- Math expressions supported `{$ 1 + 2}` with `ExpressionEvaluator`
- Recursion depth limit enforced to prevent infinite loops
- Weighted arrays supported `[[5, "common"], [1, "rare"]]`

Interfaces / schemas:
- Input: YAML files in `Tables/` (Map<string, Table>)
- Output: `dist/tables.json` (compiled) -> HTML/JSON response

Commands:
- Install: `npm install`
- Dev: `npm run dev` (starts server + watch)
- Build Content: `npm run build:tables`
- Test: `npm test` (runs all tests)
- CLI: `npm run cli`

Known issues:
- `server.legacy.js` is deprecated, kept for reference only
- Complex nested tables may hit recursion limits (by design)
