SOURCES:
ai/00_SYSTEM_CONTRACT.md
ai/REPO_MAP.md
ai/STATE.md

TASK: 

1. Separate the elementals into two, with a lesser and greater version. They each have separate HP and LVL and Attack values. 
2. Make the Hydra have 15HP and LVL 2. The abilities note is sufficient for people to understand the mechanics.


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
