SOURCES:
ai/00_SYSTEM_CONTRACT.md
ai/REPO_MAP.md
ai/STATE.md

TASK: 
1) I asked for a timeout on the renderer to prevent infinite loops. Add that.
2) Related. [Generate] Request for: AllFeaturesTest (ATest_AllFeatures.yaml). Count: 1 

That hung for 30 seconds. WHY? 

CONTEXT:
<only the relevant code snippets or diff>

RULES FOR THIS TASK:
- Start from the entry point
- Infer dependencies via imports or stack trace only
- If more files are required, list them and STOP
- always increment the version by one

DELIVERABLE:
Unified diff + tests.