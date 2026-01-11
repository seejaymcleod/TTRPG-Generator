# TTRPG Generator: Creating Tables Guide

This document is a comprehensive guide to scripting content for the TTRPG Generator.

## Table of Contents
1.  [Core Concepts](#1-core-concepts)
2.  [Table Structure](#2-table-structure)
3.  [Linking & References](#3-linking--references)
4.  [Advanced Results](#4-advanced-results)
5.  [Logic & Scripting](#5-logic--scripting)
6.  [Directives](#6-directives)
7.  [Formatting](#7-formatting)

---

## 1. Core Concepts
*   **YAML**: All tables are written in `.yaml` files in the `Tables/` directory.
*   **Flat Namespace**: Every table and subtable has a global, unique name. Referencing `{Name}` finds that table anywhere in the project.
*   **Context**: The engine remembers variables for a single generation request, allowing for consistent names and descriptions.

---

## 2. Table Structure
A minimal valid table file looks like this:

```yaml
filename: My_Loot_Table.yaml # Must be unique
tablename: LootGenerator     # Must be unique
game: D&D 5e                 # Filter tag
type: Loot                   # Filter tag
results:
  - "A rusty sword"
  - "A gold coin"
```

### Subtables
You can bundle related tables together using the `tables` list.
*Note: Subtables are just organizational helpers. They still need unique names.*

```yaml
tablename: DragonGenerator
results:
  - "A {Age} {Color} Dragon."

tables:
  - tablename: Age
    results: ["Young", "Ancient"]
  
  - tablename: Color
    results: ["Red", "Blue"]
```

---

## 3. Linking & References
Use curly braces `{}` to inject content from another table.

### Syntax
*   `{TableName}`: Rolls on the table named `TableName`.
*   `{1d20}`: Rolls dice.
*   `{1d6+4}`: Rolls dice with math.

### Global Linking
Because of the **Flat Namespace**, you do not need to know which file a table is in.
*   **Correct**: `{GoblinName}`
*   **Incorrect**: `{GoblinGenerator:GoblinName}`

---

## 4. Advanced Results

### Weighted Lists
Make specific items appear more frequently.

**Syntax A (Shorthand)**: `Item ^Weight`
```yaml
results:
  - Common Potion ^10
  - Rare Elixir ^1
```

**Syntax B (Variables)**: `[[Item, Weight]]`
Use this if your item name contains special characters or if you prefer explicit arrays.
```yaml
results:
  - [[Common Potion, 10]] 
```

### User Inputs
Add a field for the user to type a value (e.g., a modifier).
**Syntax**: `inputField: [VarName, Type]`
*   Type: `number` or `text`

```yaml
tablename: SkillCheck
inputField: [DexMod, number]
results:
  - "Stealth Check: {1d20 + DexMod}"
```

---

## 5. Logic & Scripting
Make your tables dynamic and "smart".

### Variables `[set:...]`
Store a rolled result to use it again.
**Syntax**: `[set:VarName, Value]`
**Usage**: `{VarName}`

**Example: Consistent NPC**
```yaml
# Without variables: Name rolls differently each time!
- "{Name} attacks. {Name} misses." 

# With variables: Name is rolled once and remembered.
- "[set:Actor, {Name}] {Actor} attacks. {Actor} misses."
```

### Conditionals `[if:...]`
Show text only if a condition is true.
**Syntax**: `[if:Condition, TrueText, FalseText]`
**Operators**: `==`, `!=`, `>`, `<`, `>=`, `<=`

**Example:**
```yaml
- "You rolled a {1d20}. [if:{1d20} == 20, CRITICAL HIT!, Normal roll.]"
```

---

## 6. Directives
Special objects that control how the table generates results.

### Multi-Rolls
Roll multiple times on the same list.
**Syntax**: `["Base Text", { roll: N }]`

```yaml
results:
  - ["You find:", { roll: 3 }] # Returns "You find" plus 3 more rolls from this table
```

### Exclusive Rolls (Unique)
Roll multiple times, but ensure no duplicates.
**Syntax**: `["Base Text", { roll: N, exclude: true }]`

```yaml
results:
  - ["Loot Bundle:", { roll: 3, exclude: true }]
```

---

## 7. Formatting
Customize how your result card looks in the specific UI.

### Custom Display
Overrides the default "TableName - Result" header.
**Syntax**: `customDisplay: "Title Pattern"`

```yaml
tablename: MonsterCard
customDisplay: "{Name} (CR {CR})"
_description: "A stat block for a monster."
results: ...
```

### Reference Tables (Lookups)
Use these for range-based lookups (like 2d6 reaction tables).

```yaml
referenceTables:
  - tablename: ReactionTable
    entries:
      - key: "2-5"
        value: "Hostile"
      - key: "6-8"
        value: "Unsure"
      - key: "9+"
        value: "Friendly"
```
**Access**: `{useReferenceTable{ReactionTable}{2d6}}`

### Separate Rows
Display multiple results on separate lines in the UI.
**Syntax**: `{ separateRows: [Item1, Item2, ...] }`

```yaml
results:
  - { separateRows: ["{Virtue}", "{Vice}", "{Background}"] }
```

### Selected Result (Dynamic Lookup)
Dynamically select which subtable to roll based on a previous result.
**Syntax**: `{selectedResult, KeyTable}`

```yaml
customDisplay: "[{selectedResult, Ancestry}]"
tables:
  - tablename: Ancestry
    results: ["Human", "Elf", "Dwarf"]
  - tablename: Human
    results: ["John", "Jane"]
  - tablename: Elf
    results: ["Legolas", "Arwen"]
```
*The engine first rolls on `Ancestry`, then uses that result (e.g., "Human") as the name of the subtable to roll next.*

### Probability Inclusion
Include a table reference only some percentage of the time.
**Syntax**: `{TableName, Probability}`

```yaml
customDisplay: "[{Name}{Nickname, 0.3}]"
# Nickname is included only 30% of the time
```

### Array Index Access
Access specific elements from an array result.
**Syntax**: `{TableName[Index]}`

```yaml
- tablename: Career
  results:
    - ["Warrior", "Sword and Shield"]
    - ["Mage", "Staff and Spellbook"]

- tablename: Summary
  results:
    - "Class: {Career[0]}, Equipment: {Career[1]}"
```

### Inline Choices
Pick one option randomly from a comma-separated list.
**Syntax**: `[Option1, Option2, Option3]`

```yaml
results:
  - "The goblin is [angry, scared, curious]."
  - "You find a [red, blue, green] gem."
```

---

## 8. Metadata Fields

These optional fields provide context and filtering in the UI.

| Field | Type | Description |
|-------|------|-------------|
| `filename` | string | Must match the `.yaml` filename exactly |
| `tablename` | string | Unique identifier for the table |
| `game` | string | Game system filter (e.g., "D&D 5e", "Cairn") |
| `type` | string or array | Category filter (e.g., "Loot", ["People", "NPC"]) |
| `setting` | string | Setting filter (e.g., "Fantasy", "Sci-Fi") |
| `description` | string or array | Shown in UI beneath the table header |
| `titleDescription` | string | Shown above the generated content |

**Example:**
```yaml
filename: My_NPCs.yaml
tablename: TavernPatron
game: Knave
type: [People, NPC]
setting: Fantasy
description:
  - Generates a random tavern patron.
  - Roll multiple times for a busy tavern.
titleDescription: "A patron at the local tavern."
```

---

## 9. Error Markers

When something goes wrong, the engine produces these markers. If you see them in output, check your YAML:

| Marker | Meaning |
|--------|---------|
| `[Table X not found]` | Referenced table doesn't exist |
| `[Max depth reached]` | Recursion limit hit (circular reference?) |
| `[Loop Limit: X]` | Same table called too many times in one roll |
| `[object Object]` | Unquoted YAML parsed as object instead of string |
| `[Invalid set syntax]` | Malformed `[set:...]` directive |

