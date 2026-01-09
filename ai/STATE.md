# Project State (keep under 40 lines if possible)

Project: Tabletop RPG table generator (File System as CMS)

Current focus:
- Renderer stability (recursion limits, error handling)
- Math expression evaluation (division by zero fixes)
- Regression testing

Core paths:
- src/engine/ (Renderer, Loader, Expressions)
- Tables/ (Content)
- tests/ (Unit & Regression tests)

Parsing rules snapshot:
- Recursive token replacement `{@Table}`
- Math expressions supported `{$ 1 + 2}` with `ExpressionEvaluator`
- Recursion depth limit enforced to prevent infinite loops

Interfaces / schemas:
- Input: YAML files in `Tables/` (Map<string, Table>)
- Output: `dist/tables.json` (compiled) -> HTML/JSON response

Commands:
- Install: `npm install`
- Dev: `npm run dev` (starts server + watch)
- Build Content: `npm run build:tables`
- Test: `npm test` (runs all tests)

Known issues:
- `server.legacy.js` status to be confirmed replacement
- Circular dependencies in some complex tables can trigger recursion limits
