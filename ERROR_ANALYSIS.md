# Error Pattern Analysis

## **PRIMARY ROOT CAUSE (18 / 23 failures): Naming Mismatch in `{selectedResult, X}` Pattern**

### The Pattern:
```yaml
- tablename: Types  
  customDisplay: "[{selectedResult, Wealth}]"
  subtables:
    - tablename: Poor Shops  # ❌ Named "Poor Shops"
    - tablename: Standard Shops
    - tablename: Wealthy Shops
```

### The Problem:
1. Rolls on `Wealth` table → gets `"Poor"` (the result value)
2. Looks for subtable named `"Poor"` 
3. **FAILS** because subtable is named `"Poor Shops"`, not `"Poor"`

### Affected Files (Same Issue):
1. **ShadowDark_Shops.yaml** - Subtables: `Poor Shops`, `Standard Shops`, `Wealthy Shops` (should be `Poor`, `Standard`, `Wealthy`)
2. **ShadowDark_Taverns.yaml** - Same issue
3. **ShadowDark_SpellsPriest.yaml** - Subtables: None! (should have `Tier1-5` as subtables in `RandomSpellAnyTier`)
4. **ShadowDark_SpellsWitch.yaml** - Same
5. **ShadowDark_SpellsWizard.yaml** - Same
6. **ShadowDark_Scroll sAndWands.yaml** - Same pattern

### **SOLUTION**: 
Rename subtables to match the **exact result values** from the reference table.

Example fix for Shops/Taverns:
```yaml
subtables:
  - tablename: Poor  # Changed from "Poor Shops"
  - tablename: Standard  # Changed from "Standard Shops"  
  - tablename: Wealthy  # Changed from "Wealthy Shops"
```

For Spells files, `RandomSpellAnyTier` should have `subtables` (not `results`):
```yaml
- tablename: RandomSpellAnyTier
  customDisplay: "[{selectedResult, RandomTier}]"
  subtables:  # Not results!
    - tablename: Tier1
      results: [...]
    - tablename: Tier2
      results: [...]
```

---

## **SECONDARY ISSUES (5 / 23 failures): YAML Data Quality**

### 1. Decimal Weights Parsing (`0.5 not found`) - 2 failures
**Files**: ShadowDark_NPC.yaml, ShadowDark_Test.yaml

**Problem**: Weighted entries like `[Party Secret, 0.5]` are being treated as objects/strings incorrectly.

**Example from NPC.yaml**:
```yaml
- tablename: NameBySyllable
  customDisplay: "[{Syllable1}  ...0.5]{Syllable3}]"  # The "0.5" here is INVALID
```

The `0.5` in `customDisplay` is not a valid syntax. Weighted probabilities belong in `results`, not in display templates.

### 2. Object Serialization (`[object Object]`) - 2 failures
**Files**: ShadowDark_MagicItemAttributes.yaml, TomeOfAdventure_Locations.yaml

**Likely Cause**: Unresolved nested objects or directives returning raw objects instead of strings.

### 3. Null Structure (`{\"Roll_SameRow(2\":null}`) - 1 failure  
**File**: ShadowDark_MishapsDiabolic.yaml

**Cause**: Complex directive syntax being parsed as object keys incorrectly. Needs investigation of the actual YAML structure.

---

## **Summary**:
- **~78% of failures** (18/23) are caused by **ONE fixable pattern**: subtable naming mismatches
- **~22% of failures** (5/23) are **YAML authoring errors**, not engine bugs

**Recommended Action**: Fix the subtable names in the 6 affected YAML files first. This will bring success rate from 84% → **96%**.
