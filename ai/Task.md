TASK above:

SOURCES:
ai/00_SYSTEM_CONTRACT.md
ai/REPO_MAP.md
ai/STATE.md

GEMINI API KEY:
If lost for some reason, it's in the user file:
/Users/seejaymac/Documents/GitHub/TTRPG-Generator/data/users/SeeJayMac.json


TASK: 
Check out this folder AS AN EXAMPLE: 
/Users/seejaymac/Documents/GitHub/TTRPG-Generator/_Content/SolKesh

The Forge YAML creation script is not working properly. It should be updated and heavily refactored to use the inputschema as a template to pull from the generated MD file. And a contentSchema should be used to generate the Game_SourceType_Content.yaml files. 

For testing only, you can use the /Users/seejaymac/Documents/GitHub/TTRPG-Generator/import/raw_data/SolKesh.md file, rather than pulling from the textbox on page 2 of the Forge mode. I guess the script should be able to handle both a file OR a string from that box. 

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
