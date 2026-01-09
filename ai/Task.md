SOURCES:
ai/00_SYSTEM_CONTRACT.md
ai/REPO_MAP.md
ai/STATE.md

TASK:
1) I rerolled all for ATestSystem and on the third time I got an error on ArrayWithDiceAndRef, RefTableLookupWithDice, RefTableLookupWithArray.. 
Console
Math error in "100 / 0": Error: Division by zero
    at ExpressionEvaluator.calculate (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\expr.js:106:35)
    at ExpressionEvaluator.evaluate (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\expr.js:29:25)
    at Renderer.evaluateToken (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:391:30)
    at Renderer.processStringRecursive (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:345:42)
    at Renderer.processString (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:253:21)
    at Renderer.processResultEntry (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:246:53)
    at Renderer.processTable (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:86:36)
    at C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:62:61
    at Array.map (<anonymous>)
    at Renderer.processTable (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:62:45)
Math error in "100 / 0": Error: Division by zero
    at ExpressionEvaluator.calculate (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\expr.js:106:35)
    at ExpressionEvaluator.evaluate (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\expr.js:29:25)
    at Renderer.evaluateToken (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:391:30)
    at Renderer.processStringRecursive (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:345:42)
    at Renderer.processString (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:253:21)
    at Renderer.processResultEntry (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:246:53)
    at Renderer.processTable (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:86:36)
    at Renderer.reroll (C:\Users\Seejay\source\repos\TTRPG-Generator\dist\src\engine\renderer.js:198:30)
    at C:\Users\Seejay\source\repos\TTRPG-Generator\server.js:179:29
    at Layer.handle [as handle_request] (C:\Users\Seejay\source\repos\TTRPG-Generator\node_modules\express\lib\router\layer.js:95:5)

2) Draw Steel Negotiations 
Reactions reference lookup failed. Not sure the console errors are doing anything anymore. 
3) Custom.yaml, most of it fails, but you may want to look at its formatting. 

4) Tome of adventures, many of those mess up. Again, they might not be complete yet. 
ENTRY POINT:
<real file(s) from REPO_MAP.md>
<or failing test name / error output>

CONTEXT:
<only the relevant code snippets or diff>

RULES FOR THIS TASK:
- Start from the entry point
- Infer dependencies via imports or stack trace only
- If more files are required, list them and STOP
- always increment the version by one

DELIVERABLE:
Unified diff + tests.