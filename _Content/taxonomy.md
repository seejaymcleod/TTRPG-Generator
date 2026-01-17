# TTRPG Grand Unified Taxonomy
## Purpose
This taxonomy defines the classification system for parsing Tabletop RPG content. The goal is to strictly categorize unstructured text into one of the following schemas. 

## I. ACTORS (Living Entities)
*Active agents in the game world with agency and statistics.*

### 1. Bestiary (Monster/NPC)
* **Definition:** A stat block for a creature, adversary, or non-player character.
* **Key Indicators:** HP, AC/Defense, Challenge Rating (CR/Level), Attacks, Stat Attributes (STR/DEX).
* **Types:**
    * `Monster`: Hostile entity defined by combat stats.
    * `NPC`: Social entity defined by role, faction, or dialogue.

### 2. Character Archetype (PC Build)
* **Definition:** A template used by players to construct a character.
* **Key Indicators:** Progression tables, "Starting Equipment," "Hit Dice," Leveling benefits.
* **Types:**
    * `Class`: Core profession (e.g., Fighter, Wizard).
    * `Ancestry/Species`: Biological origin (e.g., Dwarf, Elf).
    * `Background`: Social history (e.g., Soldier, Urchin).
    * `Subclass`: Specialization branch (e.g., School of Evocation).


## II. OBJECTS (Tangible Assets)
*Physical items that can be held, traded, or equipped.*

### 3. Equipment & Loot
* **Definition:** Discrete items with economic or utility value.
* **Key Indicators:** Cost, Weight, Damage Dice, Armor Class (AC), Rarity.
* **Types:**
    * `Weapon`: Defined by damage and properties.
    * `Armor`: Defined by AC and encumbrance.
    * `Gear`: Utility items (rope, torches).
    * `Magic Item`: Items with supernatural effects and rarity.
    * `Consumable`: Items that are used up after use.
    * `Loot`: Treasure with value but no utility (Gems, Art).

## III. DYNAMICS (Rules & Powers)
*Discrete packets of logic that modify the game state.*

### 4. Powers
* **Definition:** Active abilities often requiring resources (mana, slots).
* **Key Indicators:** Level/Tier, Range, Duration, Casting Time.
* **Types:**
    * `Spell`: Magic effect.
    * `Psionic`: Mental effect.
    * `Technique`: Martial maneuver.


### 5. Features & Traits
* **Definition:** Passive or permanent upgrades attached to an Actor.
* **Key Indicators:** "Prerequisite," "Benefit," often found in lists.
* **Types:**
    * `Feat/Talent`: Optional upgrades selected by players.
    * `Trait`: Innate ability (e.g., Darkvision).
    * `Class Feature`: Automatic upgrade from leveling.

### 6. Game Rules
* **Definition:** Global logic applicable to all participants.
* **Types:**
    * `Condition`: Status effects (Blinded, Poisoned).
    * `Mishap`: Consequence tables (Magical backlash).
    * `Mechanic`: Subsystems (Stealth rules, Grappling rules).

## IV. CONTEXT (Narrative & Setting)
*World-building elements. NOTE: Do not extract "Objects" mentioned in flavor text here unless they have a full stat block.*

### 7. Location (Dungeons & Hexes)
* **Definition:** A specific place with a description and associated contents.
* **Key Indicators:** Room numbers (1, 2, 3...), Hex coordinates (0101), "Read Aloud" text.
* **Types:**
    * `Room`: Dungeon chamber.
    * `Hex`: Wilderness region (Terrain type, Encounter chance).
    * `Settlement`: Town or City data.

### 8. Adventure Data
* **Definition:** Plot-driving elements.
* **Types:**
    * `Quest/Hook`: Goal and reward.
    * `Faction`: Organization details.
    * `Patron`: Higher power granting boons.
    * `Adventure`: A complete adventure module.
    * `Dungeon`: A complete dungeon module.
    * `Hex`: A hex map location.
    * `Key`: A keyed area.
    * `Rumor`: Rumored events and information.
    * `Secret`: Secrets and hidden information.

## V. TABLES (Generators)
* **Definition:** Randomized lists used to generate content from variou categories.
* **Key Indicators:** Dice notation (d6, d100), numbered rows.
