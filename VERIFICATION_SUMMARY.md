# Content Verification Summary

## Status: 23 Failures Remaining

### Error Categories:

1. **`[object Object]` (3 failures)**
   - `ShadowDark_MagicItemAttributes.yaml`: Random Magic Items
   - `ShadowDark_MishapsDiabolic.yaml`: SameRow, DiffRow (null values in arrays)
   - `TomeOfAdventure_Locations.yaml`: Locations

2. **`null` values (1 failure)**
   - `ShadowDark_MishapsDiabolic.yaml`: Invalid object structure in results

3. **`not found` errors (18 failures)**
   - **Shops/Tav

erns Pattern** (3): `Wealth not found`, `NamePart1 not found`, `NamePart2 not found`
   - **Spells Pattern** (6): `RandomTier not found`, `SpellTiers not found` in Priest/Witch/Wizard/ScrollsAndWands
   - **NPC/Test** (2): `0.5 not found` (weighted tables with decimal weights) 
   - **Locations** (1): `StructuresDescription not found`, `FeatureFirst not found`, `FeatureLast not found`

### Root Causes Identified:

#### 1. `customDisplay` context issue
Syntax like `[{selectedResult, Wealth}]` attempts to:
1. Roll on `Wealth` subtable (✓ now works - indexed globally)
2. Use result to lookup subtable of same name
3. **Problem**: The lookup happens **within current table context**, not globally

Example from `ShadowDark_Shops.yaml`:
```yaml
tablename: Types  
customDisplay: "[{selectedResult, Wealth}]"
```
This rolls `Wealth` → gets `"Standard Shops"` → tries to find subtable `Standard Shops` within `Types`.

**Current Fix**: Added fallback to global lookup in `processCustomDisplay`
**Still Failing**: Need to verify this fallback is working

#### 2. Weighted decimal values causing parse errors
`0.5` appears in results like `[Party Secret, 0.5]` but generates `"0.5 not found"`, suggesting token evaluation is treating it as a table/variable reference instead of recognizing the weighted tuple.

#### 3. Complex object serialization
`[object Object]` appears when the renderer returns a raw object instead of stringifying it properly. This suggests dice directives or complex syntax isn't being fully resolved.

### Next Steps:

1. Debug why `processCustomDisplay` fallback isn't working despite the fix
2. Investigate weighted value parsing (`0.5` issue)
3. Trace object serialization for `[object Object]` failures
