TASK above:

SOURCES:
ai/00_SYSTEM_CONTRACT.md
ai/REPO_MAP.md
ai/STATE.md

GEMINI API KEY:
If lost for some reason, it's in the user file:
/Users/seejaymac/Documents/GitHub/TTRPG-Generator/data/users/SeeJayMac.json

CONTEXT:
<only the relevant code snippets or diff>

RULES FOR THIS TASK:
- Start from the entry point
- Infer dependencies via imports or stack trace only
- If more files are required, list them and STOP
- always increment the version by one
- Do not alter YAMLS to fix bugs unless it is a last resort; you must tell me.
- Restart the server and kill background processes after you deliver
- ALWAYS ask before a commit is made.

DELIVERABLE:
Unified diff + tests.
