# 5e to Shadowdark Monster Conversion Guide

This guide is designed to convert D&D 5e stat blocks into **Shadowdark RPG** format. It uses statistical benchmarks rather than direct math to ensure high-level monsters don't become "HP sponges."

## 1. Determine Shadowdark Level (LV)

**The Golden Rule:** Do not use 5e CR directly. Shadowdark scales differently.
* **Low Level (CR 0-3):** `Shadowdark Level ≈ 5e HP / 4.5`
* **High Level (CR 4+):** Use the Benchmark Table below.

### Benchmark Table (CR to Shadowdark LV)
| 5e Challenge Rating (CR) | 5e Avg HP Range | **Target Shadowdark Level** | Examples |
| :--- | :--- | :--- | :--- |
| **0 - 1/8** | 1 - 9 | **LV 0 - 1** | Rat, Commoner |
| **1/4 - 1/2** | 10 - 20 | **LV 1 - 2** | Acolyte, Goblin |
| **1 - 2** | 20 - 45 | **LV 3 - 4** | Bugbear, Ogre |
| **3 - 4** | 50 - 90 | **LV 5 - 7** | Hell Hound, Minotaur |
| **5 - 8** | 90 - 130 | **LV 8 - 10** | Troll, Young Dragon |
| **9 - 12** | 130 - 180 | **LV 11 - 13** | Behir, Aboleth |
| **13 - 16** | 180 - 250 | **LV 14 - 16** | Adult Dragon, Mummy Lord |
| **17 - 20+** | 250+ | **LV 17 - 20** | Ancient Dragon, Balor |

---

## 2. Quick Combat Statistics
Once you have the **Level (LV)**, use this table to set the stats. **Adhere to these numbers** to maintain game balance.

| LV | AC (Base) | HP (Formula) | Attack Bonus | Num. Attacks | Damage (Avg) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | 10 | 1 | +0 | 1 | 1 dmg |
| **1** | 11 | 4 | +1 | 1 | 1d4 |
| **2** | 12 | 10 | +1 | 1 | 1d6 |
| **3** | 13 | 14 | +3 | 1 | 1d6 |
| **4** | 13 | 19 | +3 | 2 | 1d6 |
| **5** | 13 | 24 | +4 | 2 | 1d8 |
| **6** | 14 | 29 | +5 | 2 | 1d10 |
| **7** | 14 | 34 | +6 | 2 | 1d10 |
| **8** | 14 | 38 | +6 | 2 | 1d10 |
| **9** | 15 | 43 | +7 | 3 | 1d12 |
| **10+**| 15+ | `LV * 4.5` | `LV` | 3 | 2d8 |

* **AC Adjustment:** +1 for tough hide, +2 for shield/plate. Cap at 18-19.
* **HP Adjustment:** Add `CON mod` to the final HP total if the monster is bulky.

---

## 3. Talent Bank
Select 1-2 talents that match the "vibe" of the 5e monster.

### Innate (Always Active)
* **Alert.** ADV on checks to detect sneaking or hiding creatures.
* **Bloodlust.** +2 damage with melee weapons (included).
* **Camouflage.** Hard to see in cave terrain or rocks.
* **Clever.** +1d4 damage when attacking with surprise.
* **Corrosive.** Metal that touches the monster dissolves on a d6 roll of 1-3.
* **Fearless.** Immune to morale checks.
* **Fireblood/Frostblood.** Fire/Cold immune.
* **Godborn.** Hostile spells targeting the monster are DC 15 to cast.
* **Golem.** Immune to fire/cold/electricity/non-magical damage. Healed by specific element.
* **Greater Undead.** Immune to morale checks. Only damaged by silver or magical sources.
* **Impervious.** Can only be harmed by magical sources.
* **Invisible.** Naturally invisible.
* **Iron Hide.** Half damage from non-magical weapons.
* **Pack Hunter.** Deals +1 damage while an ally is close.
* **Regenerate.** Regains 2d6 HP on its turn unless wounds cauterized (fire/acid).
* **Relentless.** If reduced to 0 HP by non-magical source, DC 15 CON to go to 1 HP instead.
* **Rubbery.** Half damage from stabbing weapons.
* **Stealthy.** ADV on checks to sneak and hide.
* **Stone Hide.** Half damage from stabbing and cutting weapons.
* **Sunblind.** Blinded in bright light.
* **Undead.** Immune to morale checks.

### Ride-Along (Triggers on Hit)
* **Ambush.** Deal an extra die of damage when undetected.
* **Attach.** Attach to target; attack auto-hits next round. DC 12 STR on turn to remove.
* **Backstab.** Deal x2 damage against surprised creatures.
* **Blind.** One target within near DC 15 CHA or blinded for 1d4 days.
* **Blood Drain.** Attach. DC 9 STR to remove. Target loses CON or takes extra damage.
* **Constrict.** Contested STR to hold target immobile for one round.
* **Crush.** DC 15 STR or target takes extra damage (1d8 or 2d8).
* **Disease.** DC 9-12 CON or 1d4 CON damage (can't heal while ill).
* **Dissolve.** One random piece of non-magical gear is destroyed.
* **Engulf.** DC 12 STR or trapped inside monster. Auto-hits. DC 12 STR to escape.
* **Grab.** DC 12-15 STR or target held/immobilized.
* **Knock.** DC 9 STR or pushed a close distance and fall down.
* **Life Drain.** 1d4 CON damage. Death if reduced to 0 CON.
* **Paralyze.** DC 12-15 CON or paralyzed 1d4 rounds.
* **Petrify.** DC 12 CON or petrified.
* **Poison.** DC 9-15 CON or take damage (1d4 to 2d10) or go to 0 HP.
* **Strangle.** Deals x2 damage against surprised creatures.
* **Swallow.** DC 18 STR (or on crit) swallowed whole. Damage per round inside.
* **Tongue.** 1 creature in near DC 12 DEX or pulled to close range.

### Thematic (Active Abilities)
* **Breath (Fire/Frost/Acid).** Near or Double Near area. DC 15 DEX or [3d8 to 6d10] damage. Recharge 1d4 rounds.
* **Change Shape.** In place of attacks, transform into similarly-sized creature/humanoid.
* **Charge.** Move double near in straight line and attack. If hit, x2 or x3 damage.
* **Charm.** One creature within near DC 14-15 CHA or friendship/control.
* **Darkness.** Extinguish all light sources in near.
* **Enlarge.** 1/day. +1d6 damage and ADV on STR checks for 3 rounds.
* **Enslave.** One creature within far DC 15 WIS or monster controls for 1d4 rounds.
* **Invisibility.** 1/day. Turn invisible for 3 rounds. Ends if attacks.
* **Mind Blast.** Near-sized cube. DC 15 INT or 3d6 damage and paralyzed.
* **Possess.** One target, close range. Contested CHA check. If monster wins, inhabits body for 2d4 rounds.
* **Rage.** 1/day. Immune to morale checks, +1d4 damage (3 rounds).
* **Roar/Scream.** Enemies within range DC 12-18 CHA/WIS or paralyzed/blinded/frightened.
* **Slow.** Far range, one target. DC 15 CON or speed halved.
* **Summon.** Summons allies (Bears, Spiders, etc.). See Spells.
* **Telepathic.** Read thoughts or speak mentally.
* **Web.** Near-sized cube. DC 13 DEX or stuck.
* **Whirlwind.** All within close/near DC 15-18 DEX or flung random direction.

---

## 4. Monster Spells
**Spell DC = 10 + Tier**
*(Tier 1 = DC 11, Tier 2 = DC 12, Tier 3 = DC 13, Tier 4 = DC 14, Tier 5 = DC 15)*

* **Abjure (Tier 3 WIS).** End any hostile magical effects affecting monster.
* **Abolish (Tier 3 WIS).** One target in far takes 5d8 damage.
* **Absorb (Tier 3 INT).** Near, one target. Target loses ability to cast one random spell; monster regains one.
* **Agony (Tier 4 CHA).** One target in near takes 3d8 damage.
* **Anchor (Tier 4 WIS).** One target in far DC 18 STR or bound/anchored 1d4 rounds.
* **Anoint (Tier 2 WIS).** One weapon/armor becomes +2 magic version for 10 rounds.
* **Arcane Armor (Tier 2 INT).** Self. AC 16 for 2d4 rounds.
* **Banish (Tier 4 INT).** Extradimensional creatures in near DC 15 CHA or sent home.
* **Barkskin (Tier 3 INT).** Self. AC 15 for 5 rounds.
* **Blast (Tier 2 INT).** Far, one target. 2d6 damage. (Tier 4 version deals 5d8 damage).
* **Bug Brain (Tier 3 WIS).** Near, one target. INT drops to 1 for 1d4 rounds.
* **Cancel (Tier 3 INT).** End one spell affecting a target within near.
* **Command (Tier 5 WIS).** Focus. Target obeys simple command next turn.
* **Conjure Flames (Tier 2 INT).** One target in far takes 2d6 damage.
* **Death Bolt (Tier 5 INT).** One target LV 9 or less within near DC 15 CON or go to 0 HP.
* **Deathtouch (Tier 2 WIS).** 2d4 damage to one creature within close.
* **Fade (Tier 3 CHA).** Self. Invisible 1d4 rounds.
* **Fireblast (Tier 4 INT).** 4d6 damage to all within near-sized cube within far.
* **Flight (Tier 3 INT).** Fly double near for 5 rounds.
* **Gate (Tier 4 WIS).** Open portal to another plane for 1d6 rounds.
* **Healing Touch (Tier 1 WIS).** Heal one creature within close for 1d4 HP (or 2d4).
* **Hellfrost (Tier 3 CHA).** All within near-sized cube take 3d6 damage.
* **Holy Flame (Tier 3 WIS).** Self. Weapons ignite (+1d6 dmg) for 5 rounds.
* **Hypnotize (Tier 3 CHA).** Focus. One target in near is stupefied.
* **Illusion (Tier 1 CHA).** Create convincing visual/auditory illusion within near.
* **Levitate (Tier 2 INT).** Hover near, vertical only.
* **Magic Bolt (Tier 1 INT).** 1d4 damage to one target within far.
* **Mist (Tier 3 CHA).** Self. Turn into mist, fly double near. 2d4 rounds.
* **Mithralskin (Tier 4 INT).** Self. AC 18 for 5 rounds.
* **Null (Tier 4 INT).** Self. Hostile spells targeting monster are DC 18 to cast.
* **Paralyze (Tier 5 INT).** DC 15 CON or paralyzed.
* **Phase (Tier 3 INT).** Self. Teleport up to one mile.
* **Portent (Tier 4 WIS).** One target in near has ADV or DISADV on all rolls 2d4 rounds.
* **Shadow Leap (Tier 4 INT).** Self. Teleport up to 100 miles.
* **Sigil of Doom (Tier 5 INT).** One target LV 9 or less in near DC 15 CON or 0 HP.
* **Snare (Tier 3 INT).** Focus. One humanoid within near paralyzed.
* **Spider Swarm (Tier 2 CHA).** Swarm appears in near. 1d4 rounds.
* **Sting (Tier 1 CHA).** Near, one target. 1d6 dmg and DISADV on next attack.
* **Summon Bear (Tier 4 INT).** Summons Brown Bear for 5 rounds.
* **Summon Cobra (Tier 3 INT).** Summons 1d4 Cobras for 1d4 rounds.
* **Summon Spiders (Tier 4 WIS).** Summons 2d4 Giant Spiders for 5 rounds.
* **Thunderclap (Tier 3 INT).** Near-sized cube. Creatures thrown 2d20 feet.
* **Time Stop (Tier 5 WIS).** Self. Time freezes for everyone else 1d4 rounds.
* **True Name (Tier 5 INT).** Near. Learn True Name of target.
* **Unmake (Tier 3 WIS).** One target in far takes 3d8 damage.
* **Venom (Tier 2 INT).** One target in far takes 2d8 damage.
* **Void Step (Tier 5 INT).** Teleport self and 4 targets up to 100 miles.
* **Web (Tier 3 WIS).** Near-sized cube of webs. Immobilize (DC 15 STR).
* **Wither (Tier 4 INT).** 4d8 damage to enemies within near-sized cube.

---

## 5. Output Template

### [MONSTER NAME]
*[Brief description of appearance and vibe in natural language]*

**AC** [Value], **HP** [Value], **ATK** [Num] [Weapon] +[Bonus] ([Damage]) [or Special], **MV** [Near/Double Near/Fly/Swim], **S** [+X], **D** [+X], **C** [+X], **I** [+X], **W** [+X], **Ch** [+X], **AL** [L/N/C], **LV** [Value]

**[Talent Name].** [Description of effect in plain English. Include DC and duration if applicable.]
**[Spell Name] (Tier [X] [Stat] Spell).** DC [Value]. [Effect].