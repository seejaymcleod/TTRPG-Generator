SOURCES:
ai/00_SYSTEM_CONTRACT.md
ai/REPO_MAP.md
ai/STATE.md

TASK: 
1) Each card needs an undo stack and button. I'm not sure what a resonable memory limit is, but let's start with 100. Clear that memory whenever makes sense. 
2) Card rows need to be able to be deleted.
3) Card rows need each field to be editable.
Edits will have autocomplete based on the table underneath (but only for that same column). For example, if the header is Race and the value is Elf. I should be able to type Human and it will autocomplete to Human. Since that's a VALID entry on the table, the row will not be locked. Otherwise, it becomes locked. 
4) Each row needs a reset button which rerolls and unlocks the row.
5) Each card needs a reset button which rerolls and unlocks all rows.
I'm not sure if there are other features that need to be with this, so design YOLO, but ask for my approval before you implementing anything I didn't ask for. 
6) These features need to work regardless of where the card is (table generator or saved cards)
7) The Title should also be editable.
8) Delete card icon is missing. 
9) lock and reroll icons are kind of crap, you can do better than what i chose. Any icons in there that I chose you can replace as desired. 

Show off your skills and make it look good.
/thorough_test at the end


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
