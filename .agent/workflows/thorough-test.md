---
description: Run a comprehensive test of all parsing engine and table generation
---

# Thorough Test Workflow

This workflow runs all tests and verification checks for the TTRPG Generator.

## Steps

// turbo
1. **Build tables first** (required before tests):
   ```bash
   npm run build:tables
   ```

// turbo
2. **Run all automated tests**:
   ```bash
   npx vitest run
   ```

// turbo
3. **Run comprehensive content verification** (checks all tables for errors):
   ```bash
   npx vitest run tests/verify_content.test.ts
   ```

// turbo
4. **Run engine feature tests** (core parsing logic):
   ```bash
   npx vitest run tests/engine.test.ts
   ```

5. **Start server and verify in browser**:
   ```bash
   npm start
   ```
   Then open http://localhost:1337/ and:
   - Select "AllFeaturesTest" table
   - Click GENERATE
   - Verify no `[object Object]` or error markers appear
   - Test reroll functionality

## Expected Results

- **Test Files**: 10 passed / 10 total
- **Tests**: 54 passed / 54 total
- **Tables**: 149 loaded

## Quick One-Liner

```bash
npm run build && npx vitest run
```
