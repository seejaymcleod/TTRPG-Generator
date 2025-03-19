# TTRPG Generator Parsing Rules

This document outlines the parsing rules, patterns, and conventions used in the TTRPG Generator application. Understanding these rules is essential for creating new tables and understanding how the system processes data.

## Table Structure

Tables in the system follow a hierarchical YAML structure with several possible formats:

### Basic Table Structure
```yaml
tablename: "Example Table"
game: "Game System"
type: "Category" # Can be a string or array of strings
setting: "Setting"
description: "Table description" # Can be string or array of strings
tables:
  - tablename: "Subtable 1"
    results:
      - "Result 1"
      - "Result 2"
  - tablename: "Subtable 2"
    results:
      - "Result 1"
      - "Result 2"
```

### Legacy Format (with subTables instead of tables)
```yaml
tablename: "Legacy Table"
subTables:
  - name: "Subtable 1"
    results:
      - "Result 1"
      - "Result 2"
```

## Result Entry Formats

Results can be formatted in several ways:

### Simple String Results
```yaml
results:
  - "Simple result text"
  - "Another result"
```

### Weighted Results
```yaml
results:
  - ["Result with weight 1", 1]
  - ["Result with weight 2", 2]
  - ["Result with weight 3", 3]
```

### Career-Style Results (Two-Element Arrays)
```yaml
results:
  - ["Career", "Items"]
  - ["Wizard", "Spellbook, wand, potion"]
```

### Multi-Element Arrays
```yaml
results:
  - ["Element 1", "Element 2", "Element 3"]
```

### Object Results
```yaml
results:
  - career: "Career Name"
    items: "Items description"
```

## Table References in Strings

Table references can be embedded within result strings:

### Basic Table Reference
```
"You encounter a {MonsterTable}"
```

### Table Reference with Index for Array Results
```
"The monster has {Monster[0]} and {Monster[1]}"
```

### Subtable Reference
```
"You meet a {NPCTable|Human}"
```

## Special Syntax

### Dice Notation
```
"{3d6}" - Roll 3 six-sided dice
"{2d10+5}" - Roll 2 ten-sided dice and add 5
```

### Array Notation
```
"Select [option1, option2, option3]" - Picks one option from the array
```

### Weighted Array Notation
```
"Select [[option1, 2], [option2, 1]]" - Weighted selection from array
```

### Reference Table Function
```
"{useReferenceTable{AttributeModifiers}{12}}" - Look up value 12 in AttributeModifiers reference table
```

## Special Template Variables

### thisResult
Refers to the most recently rolled dice result:
```
"Your result is {thisResult}"
```

### Array Indexing
```
"First element: {thisResult[0]}, Second element: {thisResult[1]}"
```

## Custom Display Templates

### Basic Template
```
customDisplay: "{Subtable1} {Subtable2}"
```

### Template with Probability
```
customDisplay: "{Subtable1} {Subtable2, 0.5}"
```
The second subtable has a 50% chance of being included.

### Selected Result Template
```
customDisplay: "{selectedResult, Ancestry}"
```
Uses the value of "Ancestry" from the context to select a matching subtable.

### pickOneFromArrays
```
customDisplay: "{pickOneFromArrays}"
```
Special mode that picks entries from arrays in the results.

## Table Pattern Detection

Instead of hardcoding behaviors based on table names, the system should detect patterns:

### Pattern Detection Rules

1. **Structure-Based Detection**: Identify table type based on its structure:
   ```javascript
   // Example: Detect career-style tables by structure
   if (results && Array.isArray(results) && 
       results.length > 0 && 
       results.every(item => Array.isArray(item) && item.length === 2 && 
                   typeof item[0] === 'string' && typeof item[1] === 'string')) {
     // This is a career-style table
   }
   ```

2. **Content-Based Detection**: Identify purpose based on content patterns:
   ```javascript
   // Example: Detect name tables by analyzing content
   function isNameTable(results) {
     if (!Array.isArray(results)) return false;
     // Check if results contain proper name patterns (capitalized single words)
     return results.some(result => {
       if (typeof result !== 'string') return false;
       return /^[A-Z][a-z]+$/.test(result.trim());
     });
   }
   ```

3. **Role-Based Detection**: Identify purpose based on relationship to other tables:
   ```javascript
   // Example: Detect ancestry-specific subtables by parent-child relationships
   function isAncestrySubtable(table, parentTable) {
     return parentTable && 
            (parentTable.tablename === "Ancestries" || 
             parentTable._role === "ancestry_container");
   }
   ```

### Metadata Tagging

Use metadata tags to assist with context-based processing:

```yaml
tablename: "Human Names"
_role: "name_table"
_dataType: "proper_names"
_formats: ["first_name", "full_name"]
```

## Removing Hardcoded Special Cases

### From Hardcoded to Contextual

#### Before (Hardcoded):
```javascript
// Special case for NPC Names by Ancestry
if (table.filename === "ShadowDark_NPC.yaml" && subtableName) {
  // Special handling logic
}
```

#### After (Contextual):
```javascript
// Detect name tables by structure and content
function isNameTable(table) {
  // Check if tablename contains "name" keyword
  const hasNameInTitle = table.tablename && 
                         table.tablename.toLowerCase().includes('name');
  
  // Check results pattern (proper names)
  const hasNameResults = table.results && 
                         Array.isArray(table.results) &&
                         table.results.some(r => typeof r === 'string' && 
                                          /^[A-Z][a-z]+$/.test(r.trim()));
  
  // Check metadata
  const hasNameMetadata = table._role === 'name_table' || 
                          table._dataType === 'proper_names';
  
  return hasNameInTitle || hasNameResults || hasNameMetadata;
}

// Generic by-category lookup
function findSubtableByCategory(table, categoryValue) {
  if (!table || !categoryValue) return null;
  
  // Look for tables or subtables
  const tableArrays = [
    getPropertyCaseInsensitive(table, 'tables'),
    getPropertyCaseInsensitive(table, 'subTables')
  ];
  
  for (const tableArray of tableArrays) {
    if (!tableArray || !Array.isArray(tableArray)) continue;
    
    // First check for direct match by name
    const directMatch = tableArray.find(t => 
      (t.tablename && t.tablename.toLowerCase() === categoryValue.toLowerCase()) ||
      (t.name && t.name.toLowerCase() === categoryValue.toLowerCase())
    );
    
    if (directMatch) return directMatch;
    
    // Then check for a category container
    for (const subTable of tableArray) {
      const isContainer = subTable.tablename && 
                          subTable.tablename.includes("by") &&
                          (subTable.tables || subTable.subTables);
                          
      if (isContainer) {
        const innerTables = subTable.tables || subTable.subTables;
        if (innerTables && Array.isArray(innerTables)) {
          const categoryMatch = innerTables.find(t => 
            (t.tablename && t.tablename.toLowerCase() === categoryValue.toLowerCase()) ||
            (t.name && t.name.toLowerCase() === categoryValue.toLowerCase()) ||
            (t.category && t.category.toLowerCase() === categoryValue.toLowerCase())
          );
          
          if (categoryMatch) return categoryMatch;
        }
      }
    }
  }
  
  return null;
}
```

## Reference Tables
Reference tables provide lookup functionality:
```yaml
referenceTables:
  - tablename: "AttributeModifiers"
    entries:
      - key: "3"
        value: "-4"
      - key: "4-5"
        value: "-3"
```

## Context Variables
The system maintains a context object that stores generated values for reference:
- Values are stored under their table name
- `thisResult` stores the most recent dice roll or result
- Context values can be referenced in templates and custom displays

## Table Type Detection

To avoid hardcoding special cases, the system should infer table types based on structure:

### Result Type Detection

```javascript
function detectResultType(results) {
  if (!Array.isArray(results) || results.length === 0) return "unknown";
  
  // Sample the first few results
  const sample = results.slice(0, Math.min(5, results.length));
  
  // Check for career-style results
  if (sample.every(item => Array.isArray(item) && item.length === 2 && 
                  typeof item[0] === 'string' && typeof item[1] === 'string')) {
    return "career";
  }
  
  // Check for weighted results
  if (sample.every(item => Array.isArray(item) && item.length === 2 && 
                  (typeof item[0] === 'string' || typeof item[0] === 'number') && 
                  typeof item[1] === 'number')) {
    return "weighted";
  }
  
  // Check for simple strings
  if (sample.every(item => typeof item === 'string')) {
    return "simple_string";
  }
  
  // Check for objects
  if (sample.every(item => typeof item === 'object' && !Array.isArray(item))) {
    if (sample.every(item => item.career && item.items)) {
      return "career_object";
    }
    return "object";
  }
  
  return "mixed";
}
```

## Recursion Protection
- The system limits recursion depth to 10 levels
- It detects circular references to prevent infinite recursion

## Error Handling
- Missing tables: `[TableName not found]`
- Invalid table structure: `[No valid results in TableName]`
- Recursion detection: `[Recursive reference to TableName]`
- Maximum recursion: `[Max recursion depth reached for TableName]`

## Implementation Guidelines

When implementing new features or tables:
1. Use the parsing rules consistently
2. Avoid hardcoding specific table or field names
3. Use contextual lookups instead of direct index access
4. Make sure tables follow the documented structure
5. Document any new parsing rules or special cases in this file

## Moving Away From Hardcoded Rules

To make the system more flexible and maintainable:

1. **Use Pattern Detection**: Detect table types by their structure, content patterns, and metadata tags
2. **Implement Self-Describing Tables**: Add metadata fields that describe how tables should be processed
3. **Create Pluggable Generators**: Allow different generation strategies based on detected table types
4. **Use Progressive Enhancement**: Fall back to simpler processing when specialized metadata is missing
5. **Define Clear Interfaces**: Establish standard patterns for table structures and detection
6. **Add Type Hints**: Include type information in table metadata

### Example of Self-Describing Table:
```yaml
tablename: "Character Generator"
_generator: "character"
_requires: ["ancestry", "class", "background"]
_version: 2
_description: "Generates complete character sheets"
tables:
  - tablename: "Ancestry"
    _role: "ancestry_selector"
    _required: true
    results: [...]
  - tablename: "Class" 
    _role: "class_selector"
    _required: true
    results: [...]
```
