/**
 * Seed the warscrolls.spearhead column with AoS 4th edition Spearhead army data.
 * The spearhead column stores the specific spearhead name (e.g. "Fangs of the Blood God").
 * Units that appear in multiple spearheads have pipe-separated values:
 *   "Gnawfeast Clawpack|Warpspark Clawpack"
 *
 * Run: node scrapeSpearheads.js
 */

const { getDb, initDb } = require('./db');

// Each spearhead entry: name, faction_slug(s), and unit names as they appear in the DB.
// Units are matched by LOWER(name) exact or fuzzy LIKE search within the faction.
// faction_slug can be a string or array (for multi-subfaction armies like Orruk Warclans).
const SPEARHEADS = [
  // ── ORDER ────────────────────────────────────────────────────────────────
  {
    name: 'Castelite Company',
    lore: 'The Castelite Companies are the disciplined backbone of Sigmar\'s free cities, combining the thundering charge of Freeguild Cavaliers with the devastating firepower of the Ironweld Great Cannon. Under the sharp command of the Freeguild Cavalier-Marshal, these soldiers hold the line through iron will and tactical precision, repelling any assault on civilisation\'s borders.',
    faction: 'cities-of-sigmar',
    units: ['Freeguild Cavalier-Marshal', 'Freeguild Steelhelms', 'Freeguild Cavaliers', 'Ironweld Great Cannon'],
    battleTraits:       [{"name":"The Officar's Order","timing":"Once Per Battle Round, Start of Battle Round","text":"Declare: Pick a battle tactic card in your hand and place it face-down separately next to your other battle tactic cards. Effect: When you use the command on that card, it is not discarded but returns to your hand. The card goes back to being a normal battle tactic card, except you cannot use the command on it in the same phase it went back into your hand. If you did not use the command on the card you separated, you can still score the battle tactic on it at the end of your turn as normal. If you neither used the command nor scored the battle tactic on the card, it automatically returns to your hand at the end of your turn."}],
    regimentAbilities:  [{"name":"For Sigmar, Charge!","timing":"Passive","text":"Friendly Cavalry units have Strike-first if they charged in the same turn."},{"name":"Ironweld Discipline","timing":"Once Per Turn, Enemy Shooting Phase","text":"Declare: Pick your Ironweld Great Cannon to use this ability. Effect: Roll a dice. On a 3+, it can use the 'Shoot' ability as if it were your shooting phase."}],
    enhancements:       [{"name":"Flask of Lethisian Darkwater","timing":"Once Per Battle, Start of Any Turn","text":"Effect: Heal (D6) your general."},{"name":"Heirloom Blade","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of your general's Master-forged Longsword."},{"name":"Brazier of Holy Flame","timing":"End of Any Turn","text":"Declare: Pick a friendly Freeguild Steelhelms unit within your general's combat range. Effect: You can return up to D3 slain models to that unit."},{"name":"Glimmering","timing":"Passive","text":"Effect: Each phase, you can re-roll 1 hit roll, or 1 wound roll, or 1 save roll made for your general."}]
  },
  {
    name: 'Fusil-Platoon',
    lore: 'Fusil-Platoons are the long-range arm of the Freeguild, expert marksmen trained to lay down coordinated volleys that can break enemy charges before they land. Led by the formidable Fusil-Major astride an Ogor Warhulk, these hunters and artificers combine technology and tenacity to strike hard from a distance.',
    faction: 'cities-of-sigmar',
    units: ['Fusil-Major on Ogor Warhulk', 'Alchemite Warforger', 'Freeguild Fusiliers', 'Wildercorps Hunters'],
    battleTraits:       [{"name":"Fortify Position","timing":"Passive","text":"Subtract 1 from the Rend characteristic of weapons used for attacks that target friendly Castelite units if they did not use a Move ability in the same turn."}],
    regimentAbilities:  [{"name":"Well Provisioned","timing":"Once Per Turn (Army), Your Shooting Phase","text":"Declare: Pick a friendly non-Hero unit to be the target. Effect: Roll a dice. On a 3+, add 1 to wound rolls for that unit's shooting attacks for the rest of the phase."},{"name":"Respected Leader","timing":"Once Per Battle, Deployment Phase","text":"Effect: Friendly Wildercorps Hunters units gain the Reinforcements keyword."}],
    enhancements:       [{"name":"Adept Tactician","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick 2 friendly Freeguild Fusiliers units that have been destroyed and have not already been replaced. Effect: Set up a single replacement Freeguild Fusiliers unit with 10 models more than 6\" from all enemy units."},{"name":"Shield Bash","timing":"Once Per Turn, Your Movement Phase","text":"Declare: Pick an enemy Infantry, War Machine or Cavalry unit in combat with your general to be the target. Effect: Roll a dice. On a 3+, the target must immediately use the 'Retreat' ability as if it were the enemy movement phase."},{"name":"Brace!","timing":"Passive","text":"Effect: Your general has Ward (5+)."},{"name":"Point-Blank Volley","timing":"Once Per Turn, Enemy Combat Phase","text":"Declare: Pick an enemy unit in combat with your general to be the target. Effect: Roll a D3. On a 2+, inflict an amount of mortal damage on the target equal to the roll."}]
  },
  {
    name: "Zenestra's Zealots",
    lore: "Pontifex Zenestra the Matriarch of the Wheel leads her Zealots with burning conviction, wielding divine authority as a weapon no less deadly than sword or spell. Her devoted Command Corps and ranks of Steelhelms fight not merely for the city but for the soul of Sigmar's empire, driven by fervent faith that borders on terrifying.",
    faction: 'cities-of-sigmar',
    units: ['Freeguild Marshal and Relic Envoy', 'Pontifex Zenestra', 'Freeguild Command Corps', 'Freeguild Steelhelms'],
    battleTraits:       [{"name":"Shadowy Spymaster / Sudden Ambush","timing":"Passive (Deployment)","text":"Your Whisperblade is not set up during the deployment phase. Instead, from the second battle round onwards, it can use Sudden Ambush (Your Movement Phase): Set up this unit within 6\" of an enemy unit and not in combat."},{"name":"Lady of the Wheel","timing":"Passive","text":"Each time a friendly model is slain by a combat attack, roll a number of dice equal to that model's Health characteristic. For each 5+, inflict 1 mortal damage on the attacking unit after the Fight ability has been resolved."}],
    regimentAbilities:  [{"name":"Fervent Rush","timing":"Once Per Turn (Army), Your Movement Phase","text":"Declare: Pick a friendly unit to use this ability. Effect: This unit can use Charge abilities this turn even if it used a Run ability in the same turn."},{"name":"Fierce Zealots","timing":"Passive","text":"Effect: Add 3 to the control scores of friendly Freeguild Steelhelms units."}],
    enhancements:       [{"name":"Devout Commander","timing":"Passive","text":"Effect: Add 1 to the Attacks characteristic and the Rend characteristic of your general's Master-forged Weapon."},{"name":"Step To It!","timing":"Once Per Turn, Reaction: You declared a Run ability for a non-Hero unit wholly within 12\" of your general","text":"Effect: Do not make a run roll as part of that Run ability. Instead, add 6\" to that non-Hero unit's Move characteristic to determine the distance each model in that unit can move as part of that Run ability."},{"name":"Stand Fast, Comrades","timing":"Once Per Battle, Your Hero Phase","text":"Declare: Pick a visible friendly non-Hero unit wholly within 12\" of your general to be the target. Effect: The target has Ward (4+) until the start of the next battle round."},{"name":"Ardent Demand","timing":"Any Combat Phase","text":"Declare: Pick a visible friendly non-Hero unit wholly within 12\" of your general to be the target. Effect: Add 1 to hit rolls for the target's combat attacks for the rest of the turn."}]
  },
  {
    name: 'Heartflayer Troupe',
    lore: 'The Heartflayer Troupes are among the most feared of Morathi-Khaine\'s instruments of war, blending the serpentine grace of Melusai with the manic ferocity of Witch Aelves and the sorcerous riders of the Doomfire Warlocks. They strike in glorious, blood-soaked coordination, each kill an act of devotion to the murder-god.',
    faction: 'daughters-of-khaine',
    units: ['Melusai Ironscale', 'Witch Aelves', 'Doomfire Warlocks', 'Blood Stalkers'],
    battleTraits:       [{"name":"Blood Rites","timing":"Passive","text":"At the start of each battle round, all friendly units gain the Blood Rites passive ability that corresponds to the current battle round number. Round 1 — Quickening Bloodlust: Add 1 to run rolls for this unit. Round 2 — Headlong Fury: Add 1 to charge rolls for this unit. Round 3 — Zealot's Rage: Add 1 to hit rolls for combat attacks made by this unit. Round 4 — Slaughterer's Strength: Add 1 to wound rolls for combat attacks made by this unit."}],
    regimentAbilities:  [{"name":"Murderous Epiphany","timing":"Once Per Battle, Your Hero Phase","text":"Effect: All friendly units gain the Blood Rites passive ability they would have gained at the start of the next battle round (they keep this ability for the rest of the battle, but they do not gain it for a second time at the start of the next battle round)."},{"name":"Blessing of Khaine","timing":"Any Combat Phase","text":"Declare: Pick a friendly unit wholly within 12\" of your general. You cannot pick your general. Effect: Add 1 to ward rolls for that unit this phase."}],
    enhancements:       [{"name":"Bathed in Blood","timing":"Passive","text":"Effect: Each time a model is slain by your general, Heal (1) your general."},{"name":"Fuelled by Revenge","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of melee weapons used by friendly Blood Stalkers units while they are wholly within 12\" of your general."},{"name":"Flask of Shademist","timing":"Once Per Battle, Any Combat Phase","text":"Effect: Until the end of the phase, subtract 1 from hit rolls for attacks that target friendly units while they are wholly within 12\" of your general."},{"name":"Zealous Orator","timing":"Your Hero Phase","text":"Declare: Pick a friendly unit wholly within 9\" of your general that is not in combat. Roll a dice for each slain model from that unit. Effect: For each 5+, you can return 1 slain model to that unit."}]
  },
  {
    name: 'Khainite Shadow Coven',
    lore: 'Shadow Covens operate in the darkness between cities and battlelines, assassins and killers bound to the will of a Slaughter Queen who embodies Khaine\'s most merciless aspect. The Khainite Shadowstalkers strike unseen while Sisters of Slaughter whirl in a storm of blades, and all serve the Cauldron\'s terrible blessing.',
    faction: 'daughters-of-khaine',
    units: ['Slaughter Queen on Cauldron of Blood', 'Hag Queen', 'Bloodwrack Medusa', 'Khainite Shadowstalkers', 'Sisters of Slaughter'],
    battleTraits:       [{"name":"Shadowmasked","timing":"Once Per Turn, Any Charge Phase","text":"Declare: Pick a friendly Infantry unit that is in combat and did not charge this turn to be the target. Effect: Subtract 1 from hit rolls and wound rolls for combat attacks that target that friendly unit for the rest of the turn."}],
    regimentAbilities:  [{"name":"Bleed Them Pale","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a friendly Infantry unit that is in combat and did not charge this turn to be the target. Effect: The target can move 6\" but cannot end that move in combat."},{"name":"Murderous Strike","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of melee weapons used by friendly Infantry units that charged in the same turn."}],
    enhancements:       [{"name":"Shadow Avatar","timing":"Once Per Battle, Your Combat Phase","text":"Effect: Add 1 to the Rend characteristic of your general's melee weapons for the rest of the turn."},{"name":"Frenzied Exhortations","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target. Effect: Roll a dice. On a 3+, add 1 to ward rolls for the target for the rest of the turn."},{"name":"Boiling Blood","timing":"Your Shooting Phase","text":"Declare: Pick a visible enemy unit within 12\" of your general to be the target. Effect: Roll a dice. If the roll equals or exceeds the target's Save characteristic, halve the target's Move characteristic until the start of your next turn."},{"name":"Bladed Impact","timing":"Any Charge Phase","text":"Declare: If your general charged this phase, pick an enemy unit within 1\" of them to be the target. Effect: Roll a D3. On a 2+, inflict an amount of mortal damage on the target equal to the roll."}]
  },
  {
    name: 'Saga Axeband',
    lore: 'The Saga Axebands are the fiery heart of a Fyreslayer lodge\'s war-host, warriors tattooed with ur-gold runes that blaze with the power of the slain god Grimnir. Led by a Battlesmith who preserves the lodge\'s fighting legends in steel and story, these tenacious duardin grow only more dangerous the longer a battle rages.',
    faction: 'fyreslayers',
    units: ['Battlesmith', 'Hearthguard Berzerkers', 'Vulkite Berzerkers'],
    battleTraits:       [{"name":"Awaken the Runes","timing":"Once Per Battle Round, Start of Your Turn","text":"Declare: Pick 1 of the ur-gold runes, then make an activation roll of D6. Each ur-gold rune can only be activated once per battle. Effect: On a 1-5, the rune's standard effect applies. On a 6, the rune's enhanced effect applies as well. Effects last until the start of your next turn. Rune of Fury — Standard: Add 1 to hit rolls for combat attacks made by friendly units. Enhanced: Also add 1 to the Attacks characteristic of your units' melee weapons. Rune of Searing Heat — Standard: Add 1 to the Rend characteristic of your units' melee weapons. Enhanced: Also add 1 to the Damage characteristic of your units' melee weapons. Rune of Fiery Determination — Standard: Your units have Ward (5+). Enhanced: Also add 1 to save rolls for friendly units. Rune of Relentless Zeal — Standard: Add 2\" to the Move characteristic of your units. Enhanced: Also add 2 to charge rolls for your units."}],
    regimentAbilities:  [{"name":"Magmic Tunnels","timing":"Once Per Battle, Start of the First Battle Round","text":"Effect: Pick up to 2 friendly units. Remove them from the battlefield and set them up again anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Fyresteel Throwing Axes","timing":"Once Per Turn (Army), Your Shooting Phase","text":"Declare: Pick any number of friendly units that are not in combat and are within 10\" of any enemy units. Effect: For each of those units, pick a visible enemy unit within 10\" of it and roll a dice. On a 4+, inflict D3 mortal damage on that enemy unit."}],
    enhancements:       [{"name":"Too Stubborn to Die","timing":"Start of Any Turn","text":"Effect: Heal (D3) your general."},{"name":"Spirit of Grimnir","timing":"Passive","text":"Effect: You can re-roll activation rolls you make for the 'Ur-gold Runes' ability."},{"name":"Horn of Grimnir","timing":"Your Hero Phase","text":"Declare: Pick your general to use this ability if they are not in combat. Effect: Roll a dice for each friendly unit on the battlefield that has any slain models. On a 3+, you can return 1 slain model to that unit."},{"name":"Powerful Presence","timing":"Passive","text":"Effect: Add 3 to your general's control score."}]
  },
  {
    name: 'Akhelian Tide Guard',
    lore: 'The Akhelian Tide Guard represents the pinnacle of Idoneth military craft — an elite formation of eel-mounted warriors who crash upon the foe like a breaking wave. Commanded by an Akhelian King who embodies the imperious authority of the deep-sea nobility, they strike with the speed and power of the ocean\'s wrath, then recede before a counterattack can land.',
    faction: 'idoneth-deepkin',
    units: ['Akhelian King', 'Akhelian Morrsarr Guard', 'Akhelian Ishlaen Guard', 'Namarti Reavers'],
    battleTraits:       [{"name":"Royal Imperative","timing":"Once Per Battle (Army), Any Combat Phase","text":"You can only use this ability in the third battle round. Effect: Pick 1 of the following effects to apply for the rest of the battle round — Into Them!: Friendly units have Strike-first. Strike Sure: Friendly units' melee weapons have Crit (Mortal)."}],
    regimentAbilities:  [{"name":"The Spear of Asphoren","timing":"Once Per Turn (Army), Any Charge Phase","text":"Declare: Pick a friendly unit that is not in combat to use this ability. Effect: Add 1 to charge rolls for that unit for the rest of the turn."},{"name":"The Shield of Ulchiss","timing":"Once Per Turn (Army), Your Movement Phase","text":"Declare: Pick a friendly unit in combat to use this ability. Effect: For the rest of the turn, each time that unit uses a Retreat ability, no mortal damage is inflicted on it."}],
    enhancements:       [{"name":"Dutiful Souls","timing":"Once Per Battle, Your Hero Phase","text":"Declare: Pick a friendly unit wholly within 12\" of your general to be the target. Effect: You can return 1 slain model to the target unit. If the target is an Infantry unit, you can return D3 slain models to it instead."},{"name":"Shimmering Amulet","timing":"Passive","text":"Effect: Your general has Ward (5+)."},{"name":"Voltaic Charge","timing":"Passive","text":"Effect: Your general's Akhelian Royal Weapons have Charge (+1 Damage)."},{"name":"Soul Stealer","timing":"End of Any Turn","text":"Effect: If your general is in combat, Heal (D3) your general."}]
  },
  {
    name: 'Soulraid Hunt',
    lore: 'Soulraid Hunts are launched not for conquest but for souls — the Idoneth require the stolen spirits of others to survive, and the Isharann Soulscryer leads these grim expeditions with uncanny precision. Akhelian sharks circle overhead while Namarti Thralls surge forward, and the entire raid vanishes back into the ethersea before the survivors can mount a defence.',
    faction: 'idoneth-deepkin',
    units: ['Isharann Soulscryer', 'Akhelian Morrsarr Guard', 'Akhelian Allopex', 'Namarti Thralls'],
    battleTraits:       [{"name":"Tides of Death","timing":"Passive","text":"In each battle round, all friendly units have the Tides of Death passive ability that corresponds to the current battle round number. Round 1 — Low Tide: Subtract 1 from hit rolls for shooting attacks that target this unit. Round 2 — Flood Tide: This unit can use a Run ability and still use Shoot and/or Charge abilities later in the turn. Round 3 — High Tide: This unit has Strike-first. Round 4 — Ebb Tide: This unit can use a Retreat ability and still use Shoot and/or Charge abilities later in the turn."}],
    regimentAbilities:  [{"name":"Way of the Cresting Wave","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of melee weapons used by friendly Namarti Thralls units that charged in the same turn."},{"name":"Ethersea Predators","timing":"End of Any Turn","text":"Effect: Pick a friendly Cavalry unit that used a Fight ability this turn. Heal (D3) that unit."}],
    enhancements:       [{"name":"Arch-Ritualist","timing":"Passive","text":"Effect: Add 1 to rolls for your general's 'Ritual of the Creeping Mist' ability."},{"name":"Steelshell Armour","timing":"Passive","text":"Effect: Ignore all modifiers to save rolls for your general (positive and negative)."},{"name":"Mind Flare","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general. Effect: Until the end of the phase, attacks made by that unit only score hits on unmodified hit rolls of 6."},{"name":"Delicious Morsels","timing":"Your Hero Phase","text":"Effect: Heal (1) each friendly Cavalry unit within your general's combat range."}]
  },
  {
    name: 'Grundstok Trailblazers',
    lore: 'The Grundstok Trailblazers are a self-sufficient vanguard force built around the hovering firepower of a Grundstok Gunhauler, tasked with scouting new trading routes and eliminating anything that might threaten them. Endrinriggers manage the skycraft while Grundstok Thunderers lay down disciplined volleys, and the Endrinmaster ensures the whole enterprise runs without a misfire.',
    faction: 'kharadron-overlords',
    units: ['Endrinmaster with Dirigible Suit', 'Grundstok Thunderers', 'Grundstok Gunhauler', 'Endrinriggers'],
    battleTraits:       [{"name":"Gunhauler Escort","timing":"Passive","text":"Subtract 1 from hit rolls for attacks that target friendly Kharadron Overlords Infantry units while they are wholly within 6\" of a friendly Grundstok Gunhauler."}],
    regimentAbilities:  [{"name":"Rapid Relocation","timing":"Once Per Battle (Army), Your Movement Phase","text":"Declare: Pick a friendly unit with Fly to be the target. Effect: Remove the target from the battlefield and set it up again anywhere on the battlefield more than 6\" from all enemy units. The target cannot use Charge abilities this turn."},{"name":"Propeller Downdraught","timing":"Passive","text":"Effect: Subtract 1 from charge rolls for enemy units while they are within 9\" of a friendly Grundstok Gunhauler."}],
    enhancements:       [{"name":"Emergency Fuel Injection Pods","timing":"Once Per Battle (Army), Any Combat Phase","text":"Effect: Your general has Strike-first for the rest of the turn."},{"name":"Prospector and Pioneer","timing":"Passive","text":"Effect: Add 2 to your general's control score."},{"name":"Celestium-Burst Bomblets","timing":"Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general to be the target. Effect: Roll a dice. On a 3+, ward rolls cannot be made for the target for the rest of the turn."},{"name":"Extraction Fail-Safes","timing":"Passive","text":"Effect: Subtract 1 from the number of damage points inflicted on this unit when it uses a Retreat ability."}]
  },
  {
    name: 'Skyhammer Task Force',
    lore: 'A Skyhammer Task Force deploys the Arkanaut Frigate as a flying assault platform, delivering companies of Arkanauts and Skywardens directly into the heart of enemy formations. The Arkanaut Admiral commands the operation with pragmatic efficiency, turning the sky itself into a weapon and the enemy\'s own territory into a landing zone.',
    faction: 'kharadron-overlords',
    units: ['Arkanaut Admiral', 'Arkanaut Company', 'Skywardens', 'Arkanaut Frigate'],
    battleTraits:       [{"name":"Ply the Skies","timing":"Reaction: You declared a non-Charge Move ability for an Arkanaut Frigate","text":"Used By: The Arkanaut Frigate that is using that Move ability. Effect: Pick a friendly Infantry unit that is wholly within the combat range of that Arkanaut Frigate and not in combat to be transported. Remove that Infantry unit from the battlefield. Then, when the Arkanaut Frigate ends its move, set up the Infantry unit on the battlefield again, wholly within the combat range of the Arkanaut Frigate and not in combat. A unit cannot use Charge abilities if it was transported in the same turn."}],
    regimentAbilities:  [{"name":"Assault Boat","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick a friendly unit that was transported this turn to use this ability. Effect: That unit can still use Charge abilities later in the turn."},{"name":"Disengage","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick a friendly Arkanaut Frigate to use this ability. Effect: If that unit uses a Retreat ability this phase, no mortal damage is inflicted on it and it can still use Shoot abilities later in the turn."}],
    enhancements:       [{"name":"Masterwrought Armour","timing":"Passive","text":"Effect: Your general has Ward (6+)."},{"name":"Flask of Vintage Gorogna","timing":"Once Per Battle, Any Hero Phase","text":"Effect: Heal (D6) your general."},{"name":"There's No Reward Without Risk","timing":"Once Per Battle, Reaction: You declared a Charge ability for a unit wholly within 12\" of your general","text":"Effect: You can re-roll the charge roll for that Charge ability."},{"name":"Leave No Duardin Behind","timing":"Once Per Battle, Your Hero Phase","text":"Declare: Pick a friendly Arkanaut Company unit wholly within 12\" of your general and roll a dice for each slain model from that unit. Effect: For each 4+, you can return 1 slain model to that unit."}]
  },
  {
    name: 'Glittering Phalanx',
    lore: 'The Glittering Phalanx is a masterwork of Lumineth martial philosophy — Vanari Auralan Wardens holding the centre in an unbreakable line while Sentinels rain arrows from range and Bladelords seek openings for precise, lethal counterstrikes. Under the spiritual guidance of a Scinari Cathallar, their emotional unity makes them nearly unassailable.',
    faction: 'lumineth-realm-lords',
    units: ['Scinari Cathallar', 'Vanari Auralan Sentinels', 'Vanari Auralan Wardens', 'Vanari Bladelords'],
    battleTraits:       [{"name":"Facets of War","timing":"Once Per Battle Round, Start of Battle Round","text":"You must use this ability at the start of the battle round. Pick 1 Facet of War ability. That Facet of War ability can be used this battle round but the other cannot. Facets — Shining Company (Passive): Subtract 1 from hit rolls for attacks that target friendly units. Lightning Reactions (Passive): When players are alternating picking units to use a Fight ability, when it is your turn to pick a unit, you can pick 2 units instead of 1. Resolve the second Fight ability immediately after the first."},{"name":"Power of Hysh","timing":"Once Per Turn (Army), Your Hero Phase","text":"Declare: Pick a friendly unit. Effect: Roll a dice. On a 2+, until the start of your next turn, attacks made by that unit score critical hits on unmodified hit rolls of 5+."}],
    regimentAbilities:  [{"name":"Arcane Prowess","timing":"Passive","text":"Effect: Add 1 to casting rolls for your general."},{"name":"Heightened Reflexes","timing":"Passive","text":"Effect: Add 1 to save rolls for friendly units that use a Fight ability immediately after another friendly unit because of the 'Lightning Reactions' ability, until the end of the phase."}],
    enhancements:       [{"name":"Overwhelming Heat","timing":"Your Hero Phase","text":"Declare: Pick a visible enemy unit within 24\" of your general, then make a casting roll of 2D6. Effect: On a 7+, halve the Move characteristic of that unit until the start of your next turn and roll a dice. If the roll equals or exceeds that unit's Save characteristic, inflict D3 mortal damage on it."},{"name":"Protection of Hysh","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 7+, the target has Ward (5+) until the start of your next turn."},{"name":"Waystone","timing":"Your Movement Phase","text":"Effect: Remove your general from the battlefield and set them up again anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Speed of Hysh","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 18\" of your general, then make a casting roll of 2D6. Effect: On a 5+, double the Move characteristic of that unit until the start of your next turn."}]
  },
  {
    name: 'Hurakan Vanguard',
    lore: 'The Hurakan Vanguard moves with the capricious speed of the wind itself, guided by a Windmage whose mastery of Hysh\'s air currents grants the force supernatural mobility. The aelementiri Spirit of the Wind anchors their battle-plan while Windchargers race across the field to strike wherever the leeward tide carries them.',
    faction: 'lumineth-realm-lords',
    units: ['Hurakan Windmage', 'Hurakan Windchargers', 'Vanari Auralan Wardens', 'Hurakan Spirit of the Wind'],
    battleTraits:       [{"name":"Storm Brewing","timing":"Deployment Phase","text":"Declare: Pick a battlefield edge to be the target. Effect: That battlefield edge is leeward. For the rest of the battle, each time a friendly Ride the Hurricane ability is used, after that ability has been resolved, change the leeward battlefield edge to the next edge clockwise."},{"name":"Pulled by the Winds","timing":"Once Per Turn (Army), Any Movement Phase","text":"Declare: Pick a friendly unit that is not in combat to be the target. Effect: The target can move D6\" but must end that move closer to the leeward battlefield edge. It can pass through the combat ranges of enemy units but cannot end that move in combat."},{"name":"Gale Force","timing":"Once Per Turn (Army), Reaction: You declared an Attack ability","text":"Used By: The unit using that Attack ability. Effect: Add 1 to hit rolls for attacks made as part of that Attack ability if the target of that ability is closer to the leeward battlefield edge than the unit using this ability."}],
    regimentAbilities:  [{"name":"Lifted Debris","timing":"Your Hero Phase","text":"Declare: Pick an enemy unit that is closer to the leeward battlefield edge than the large terrain feature within friendly territory to be the target. Effect: Roll a number of dice equal to the current battle round number. For each 3+, inflict 1 mortal damage on the target."},{"name":"Roaring Headwind","timing":"Once Per Battle (Army), Enemy Hero Phase","text":"Declare: Pick an enemy unit to be the target. Effect: For the rest of the turn, each time the target uses a Move ability, it must end that move closer to the leeward battlefield edge."}],
    enhancements:       [{"name":"Scattered to the Winds","timing":"Passive","text":"Effect: Subtract 1 from the control scores of enemy units within 6\" of your general for each friendly Ride the Hurricane ability used this battle round."},{"name":"Wind Whisperer","timing":"Once Per Battle (Army), Any Hero Phase","text":"Declare: Pick a battlefield edge to be the target. Effect: Change the leeward battlefield edge to the target battlefield edge."},{"name":"Temple Guardians","timing":"Passive","text":"Effect: While any friendly Infantry units are within your general's combat range, both your general and those Infantry units have Ward (5+)."},{"name":"Curved Shots","timing":"Passive","text":"Effect: You can measure the range and visibility of your general's shooting attacks from any point on the leeward battlefield edge."}]
  },
  {
    name: 'Starscale Warhost',
    lore: 'The Starscale Warhost enacts the will of the Old Ones through the brute force of the oldest predators in the Mortal Realms. A Saurus Oldblood astride a thundering Carnosaur leads Saurus Warriors and mighty Kroxigor into battle, the great reptiles acting as extensions of the slann\'s star-written designs made flesh.',
    faction: 'seraphon',
    units: ['Saurus Oldblood on Carnosaur', 'Saurus Warriors', 'Kroxigor'],
    battleTraits:       [{"name":"Beast of the Dark Jungles","timing":"Any Combat Phase","text":"Declare: Pick your general to use this ability if they are in combat. Effect: Pick 1 of the following — Gargantuan Jaws: Pick an enemy unit in combat with your general and roll a dice. If the roll exceeds that unit's Health characteristic, 1 model in that unit is slain. Roar: Pick an enemy unit in combat with your general. Subtract D6 from that unit's control score this turn."}],
    regimentAbilities:  [{"name":"Predatory Fighters","timing":"Once Per Phase, End of Any Turn","text":"Declare: Roll a dice for each enemy unit in combat with any friendly units. Effect: On a 3+, inflict 1 mortal damage on the unit being rolled for."},{"name":"Temple-City Guardians","timing":"Passive","text":"Effect: Friendly units have Ward (6+) while they are wholly within friendly territory."}],
    enhancements:       [{"name":"Sotek's Gaze","timing":"End of Any Turn","text":"Effect: Roll a dice. Add the roll to your general's control score this turn."},{"name":"Ancient Strategist","timing":"Once Per Battle, Enemy Movement Phase","text":"Declare: Pick a friendly unit wholly within 12\" of your general. You cannot pick your general. Effect: That unit can use the 'Normal Move' ability as if it were your movement phase."},{"name":"Blade of Realities","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of your general's Relic Celestite Weapon."},{"name":"The Wrath of Chotec","timing":"Passive","text":"Effect: The Attacks characteristic of your general's Sunbolt Gauntlet is 6 instead of D6."}]
  },
  {
    name: 'Sunblooded Prowlers',
    lore: 'Sunblooded Prowlers are built for the patient hunt, their Hunters of Huanchi concealed in the ether until the moment to strike is perfect. The Sunblood at their head fights with cold-blooded ferocity, and the glittering terror of a Spawn of Chotec arriving from nowhere heralds doom for those who thought themselves safe.',
    faction: 'seraphon',
    units: ['Sunblood', 'Saurus Warriors', 'Hunters of Huanchi', 'Terrawings', 'Spawn of Chotec'],
    battleTraits:       [{"name":"Hidden Hunters / Chameleon Ambush","timing":"Passive (Deployment)","text":"Your 2 Hunters of Huanchi units and the Spawn of Chotec are not set up during the deployment phase. Instead, from the third battle round onwards, they can use Chameleon Ambush (Your Movement Phase): Set up this unit anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Vengeance of Azyr","timing":"End of Any Turn","text":"Declare: Pick each enemy unit in combat with a friendly Saurus unit to be the targets. Effect: Roll a dice for each target. On a 4+, inflict 1 mortal damage on the target."}],
    regimentAbilities:  [{"name":"Scaled Aegis","timing":"Your Hero Phase","text":"Declare: Pick a friendly Saurus unit to be the target. Effect: Roll a dice. On a 3+, that unit has Ward (6+) until the start of your next turn."},{"name":"Followers of Huanchi","timing":"Your Shooting Phase","text":"Declare: Pick a friendly Skink unit to be the target. Effect: Roll a dice. On a 3+, the target's ranged weapons have Crit (Auto-wound) for the rest of the turn, including Companion weapons."}],
    enhancements:       [{"name":"Instinctive Commander","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general and not in combat to be the target. Effect: Roll a dice. On a 3+, the target can immediately use the 'Normal Move' ability as if it were your movement phase."},{"name":"Savage Mauling","timing":"Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general to be the target. Effect: Ward rolls cannot be made for the target for the rest of the turn."},{"name":"Venomite Swarm","timing":"Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general to be the target. Effect: If your general's Venomites token is on the battlefield, roll a D3. On a 1, remove that token from the battlefield. On a 2+, inflict an amount of mortal damage on the target equal to the roll."},{"name":"Blessed by the Old Ones","timing":"End of Any Turn","text":"Declare: Your general must use this ability if it has been destroyed. Roll a dice. Effect: On a 2+, you can set up a replacement unit with 1 Sunblood model anywhere on the battlefield more than 6\" from all enemy units."}]
  },
  {
    name: "Yndrasta's Spearhead",
    lore: "Yndrasta the Celestial Spear leads this strike force as Sigmar's chosen huntress, a figure of terrible divine purpose who falls upon monsters and tyrants with the fury of a thunderstorm. Annihilators crash down from the heavens in her wake while Vanquishers and a Stormstrike Chariot drive the enemy before them.",
    faction: 'stormcast-eternals',
    units: ['Yndrasta', 'Knight-Vexillor', 'Annihilators', 'Vanquishers', 'Stormstrike Chariot'],
    battleTraits:       [{"name":"Scions of the Storm / Lightning-Strike Arrival","timing":"Passive (Deployment)","text":"Yndrasta and your Annihilators unit are not set up during the deployment phase. Instead, from the third battle round onwards, they can use Lightning-Strike Arrival (Your Movement Phase): Set up this unit anywhere on the battlefield more than 6\" from all enemy units."}],
    regimentAbilities:  [{"name":"Drive Them Back","timing":"End of Any Turn","text":"Declare: Pick any number of friendly units that are both contesting an objective and in combat. Effect: Each of those units can make a pile-in move. For each unit that did so, pick an enemy unit within 1\" of it and roll a dice. On a 4+, inflict 1 mortal damage on that enemy unit."},{"name":"Defend to the Last","timing":"Passive","text":"Effect: Friendly units have Ward (6+) while they are contesting an objective you control."}],
    enhancements:       [{"name":"The Prime Huntress","timing":"Passive","text":"Effect: The Damage characteristic of Thengavar (Yndrasta's spear) is 2D6 for attacks that target a Monster."},{"name":"Strike with the Tempest's Rage","timing":"Passive","text":"Effect: Your general has Strike-first if they charged in the same turn."},{"name":"Dazzling Radiance","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick your general to use this ability if they were set up this phase. Effect: You can return 1 slain model to each friendly unit wholly within 12\" of your general."},{"name":"Hawk of the Celestial Skies","timing":"Once Per Battle, Any Combat Phase","text":"Effect: Until the end of the phase, add 1 to hit rolls for attacks made by friendly units while they are wholly within 12\" of your general."}]
  },
  {
    name: 'Vigilant Brotherhood',
    lore: 'The Vigilant Brotherhood embodies the stoic, watchful aspect of the Stormcast Eternals — a sworn order pledged to guard the light of Azyr against the encroaching dark. A Lord-Vigilant patrols on Gryph-stalker while Prosecutors harry the enemy from above and Liberators hold the ground in a Sigmarite wall of shields.',
    faction: 'stormcast-eternals',
    units: ['Lord-Vigilant on Gryph-stalker', 'Lord-Veritant', 'Prosecutors', 'Liberators'],
    battleTraits:       [{"name":"Holy Orders — Shield of Azyr","timing":"Once Per Turn, Your Hero Phase","text":"Declare: Pick a friendly unit. Effect: Until the start of your next turn, that unit has Ward (5+)."},{"name":"Holy Orders — Storm Charge","timing":"Once Per Battle, Your Charge Phase","text":"Declare: Pick a friendly unit that is not in combat. Effect: That unit can use Charge abilities this turn even if it used a Run ability in the same turn."}],
    regimentAbilities:  [{"name":"Strike Where Needed","timing":"Once Per Battle, Reaction: You declared a Retreat ability","text":"Used By: The unit using that Retreat ability. Effect: No mortal damage is inflicted on that unit by that Retreat ability. In addition, that unit can still use Charge abilities this turn even though it used a Retreat ability."},{"name":"Blaze of Glory","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a friendly unit that is in combat. Effect: Until the end of the phase, each time a model in that unit is slain, make a vengeance roll of D6. On a 4+, inflict 1 mortal damage on an enemy unit in combat with that unit."}],
    enhancements:       [{"name":"Hallowed Scrolls","timing":"Passive","text":"Effect: Your general has Ward (5+)."},{"name":"Morrda's Talon","timing":"Passive","text":"Effect: Your general's Hallowed Greataxe has Crit (Mortal)."},{"name":"Quicksilver Draught","timing":"Once Per Battle, Any Combat Phase","text":"Effect: Your general has Strike-first this phase."},{"name":"Null Pendant","timing":"Once Per Battle, End of Any Turn","text":"Declare: Roll a dice for each enemy unit contesting the same objective as your general. Effect: On a 2+, subtract the roll from the control score of that enemy unit this turn."}]
  },
  {
    name: 'Bitterbark Copse',
    lore: 'A Bitterbark Copse is a fragment of living forest roused to fury, its Treelord a towering embodiment of the woodland realm\'s ancient anger. Branchwych and Kurnoth Hunters fight from within reach of the world\'s spirit-paths, and the whole copse can melt into the realmroots only to emerge elsewhere in an eyeblink.',
    faction: 'sylvaneth',
    units: ['Branchwych', 'Treelord', 'Kurnoth Hunters', 'Treerevenants'],
    battleTraits:       [{"name":"Ley Lines","timing":"Once Per Turn, End of Any Turn","text":"Effect: Heal (1) each friendly unit that is within 3\" of any terrain features."},{"name":"Strike and Fade","timing":"Once Per Turn, End of Any Turn","text":"Declare: Pick a friendly unit that used a Fight ability this turn and is within 3\" of any terrain features, then roll a dice. Effect: On a 2+, remove that unit from the battlefield and set it up again so that each model in the unit is within 3\" of any terrain features and more than 6\" from all enemy units."}],
    regimentAbilities:  [{"name":"Vengeful Spirits of the Land","timing":"Once Per Turn, End of Any Turn","text":"Declare: Pick an enemy unit that is contesting an objective and roll a dice. Effect: On a 4+, inflict D3 mortal damage on that enemy unit."},{"name":"Walkers of the Hidden Paths","timing":"Once Per Turn, Your Movement Phase","text":"Declare: Pick a friendly unit that is within 3\" of any terrain features and not in combat. Effect: Remove that unit from the battlefield and set it up again more than 6\" from all enemy units. That unit cannot use Move abilities for the rest of the phase."}],
    enhancements:       [{"name":"Regrowth","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 18\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 5+, Heal (D6) the target."},{"name":"Gnarled Warrior","timing":"Passive","text":"Effect: Ignore negative modifiers to save rolls for your general."},{"name":"Treesong","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 7+, add 1 to the Rend characteristic of the target unit's melee weapons until the start of your next turn."},{"name":"Seed of Rebirth","timing":"Passive","text":"Effect: If your general would be destroyed, before removing them from play, roll a dice. On a 3+, your general is not destroyed and any remaining damage points inflicted on them have no effect. Then, Heal (1) your general. This unit cannot use this ability again for the rest of the battle."}]
  },
  {
    name: 'Spitewing Flight',
    lore: 'The Spitewing Flight are the swift and vengeful hunters of Alarielle\'s realm, a formation of Spiterider Lancers and Gossamid Archers who harry their quarry with relentless aerial precision. Led by an Archrevenant whose fury builds with each chord of the Song of the Hunt, they do not rest until their chosen prey is brought low.',
    faction: 'sylvaneth',
    units: ['Archrevenant', 'Gossamid Archers', 'Spiterider Lancers', 'Revenant Seekers'],
    battleTraits:       [{"name":"Target of Vengeance","timing":"Once Per Battle Round (Army), Start of Battle Round","text":"Declare: If there is no enemy quarry on the battlefield, pick an enemy unit on the battlefield to be the target. Effect: The target is the quarry for the rest of the battle."},{"name":"Song of the Hunt","timing":"Passive","text":"You gain 1 chord each time an enemy quarry is destroyed. Cumulative effects — 1 chord: Add 1 to run rolls and charge rolls for friendly units while they are within 9\" of the enemy quarry. 2 chords: Add 1 to hit rolls for friendly units' attacks while they are within 9\" of the enemy quarry. 3+ chords: Add 1 to wound rolls for friendly units' attacks while they are within 9\" of the enemy quarry."},{"name":"Airborne Cohesion","timing":"Passive","text":"Effect: Friendly units have a coherency range of 2\"."}],
    regimentAbilities:  [{"name":"Leaves on the Wind","timing":"Once Per Battle (Army), End of Any Turn","text":"Declare: Pick a friendly unit that is in combat to be the target. Effect: The target can immediately use the 'Retreat' ability as if it were your movement phase and no mortal damage is inflicted on it if it does so."},{"name":"Lifebringers","timing":"Once Per Turn (Army), End of Any Turn","text":"Effect: Heal (D3) each friendly unit."}],
    enhancements:       [{"name":"Head of the Hunt","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of your general's melee weapons while the enemy quarry is within 9\" of and visible to them."},{"name":"Zephyrkin","timing":"Reaction: You declared a Fight ability for your general","text":"Effect: If your general charged this turn, they can move up to 2D6\" after that Fight ability has been resolved. They cannot end that move in combat."},{"name":"Bold Spirit","timing":"Once Per Battle (Army), Any Hero Phase","text":"Effect: For the rest of the turn, add 1 to wound rolls for friendly units' combat attacks while they are within your general's combat range."},{"name":"Cunning Pursuer","timing":"Passive","text":"Effect: While your general is in combat, add 1 to charge rolls for friendly units wholly within 12\" of them. Add 2 instead while your general is in combat with the quarry."}]
  },
  // ── CHAOS ─────────────────────────────────────────────────────────────────
  {
    name: 'Fangs of the Blood God',
    lore: 'Karanak, the Three-Headed Hound of Vengeance, leads the Fangs of the Blood God on hunts that span reality itself. These Flesh Hounds and their daemonic kin pursue any quarry that Khorne marks for death, their hunger for slaughter growing with every scent of blood until nothing can outrun their relentless pursuit.',
    faction: 'blades-of-khorne',
    units: ['Karanak', 'Flesh Hounds', 'Claws of Karanak'],
    battleTraits:       [{"name":"The Quarry","timing":"Start of Battle Round","text":"Effect: If no enemy units are the quarry, pick an enemy unit to be the quarry (you can pick an enemy unit in reserve)."},{"name":"Blood-Drenched","timing":"Once Per Turn, End of Any Turn","text":"Declare: Pick a friendly unit that slew any enemy models using a Fight ability this turn to be the target. Effect: For the rest of the battle, the target's melee weapons have Crit (Mortal)."}],
    regimentAbilities:  [{"name":"The Scent of Blood","timing":"Passive","text":"Effect: Add 1 to hit rolls and add 1 to wound rolls for combat attacks that target an enemy unit that had any damage points allocated to it this turn."},{"name":"Savagery Upon Savagery","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a friendly unit in combat to be the target. Effect: For the rest of the turn, add 1 to the Attacks characteristic of the target's melee weapons. If the target is a Hero, add D3 to the Attacks characteristic of its melee weapons instead."}],
    enhancements:       [{"name":"Sustained by Gore","timing":"End of Any Turn","text":"Effect: Heal (D3) your general."},{"name":"Evasive Hunter","timing":"Passive","text":"Effect: Subtract 1 from hit rolls and wound rolls for shooting attacks that target your general."},{"name":"Killing Pounce","timing":"Once Per Battle, Any Charge Phase","text":"Effect: For the rest of the turn, when making charge rolls for your general, you can roll an additional dice, to a maximum of 3, but if you do, they must finish that charge in combat with the quarry."},{"name":"Furious Bites","timing":"End of Any Turn","text":"Effect: If your general is in combat with the quarry, inflict D3 mortal damage on the quarry."}]
  },
  {
    name: 'Gore Pilgrims',
    lore: 'Gore Pilgrims march to war as a living sacrifice to the Blood God, each death — friend or foe — feeding the tide of power that the Slaughterpriest channels in Khorne\'s name. Blood Warriors and Bloodreavers are hurled screaming into battle, and with enough blood spilled, the Mighty Skullcrushers thunder forward to finish the butchery.',
    faction: 'blades-of-khorne',
    units: ['Slaughterpriest', 'Blood Warriors', 'Bloodreavers', 'Mighty Skullcrushers'],
    battleTraits:       [{"name":"The Blood Tithe","timing":"Passive","text":"Each time a unit is destroyed during the battle, you receive 1 blood tithe point."},{"name":"Murderlust","timing":"Once Per Turn, Any Hero Phase","text":"Declare: Spend 1 blood tithe point and pick up to D3 friendly units. Effect: Each of those units can move D6\" (roll for each)."},{"name":"Heads Must Roll","timing":"Once Per Turn, Any Hero Phase","text":"Declare: Spend 3 blood tithe points and pick up to 3 friendly units. Effect: Add 1 to the Rend characteristic of those units' melee weapons until the start of your next turn."}],
    regimentAbilities:  [{"name":"Favoured of Khorne","timing":"Once Per Turn, Start of Your Turn","text":"Effect: Roll a dice. On a 2+, you receive 1 blood tithe point."},{"name":"Blood-Woken Runes","timing":"Passive","text":"Effect: Friendly units have Ward (5+) if they have used a Fight ability in the same phase."}],
    enhancements:       [{"name":"Resanguination","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 16\" of your general, then make a chanting roll of D6. Effect: On a 3+, Heal (D3) that unit."},{"name":"The Crimson Plate","timing":"Passive","text":"Effect: Your general has Ward (5+)."},{"name":"Headhunter","timing":"Any Combat Phase","text":"Declare: Pick an enemy Hero in combat with your general. Effect: Your general has Strike-first this phase, but all attacks made by them this phase must target that enemy Hero."},{"name":"Unholy Flames","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 16\" of your general, then make a chanting roll of D6. Effect: On a 4+, add 1 to the Rend characteristic of that unit's melee weapons until the start of your next turn."}]
  },
  {
    name: 'Fluxblade Coven',
    lore: 'The Fluxblade Coven dances through probability itself, the Magister on Disc of Tzeentch having glimpsed the threads of destiny and learned how to pluck them. Flamers and Screamers erupt from conjured portals while Tzaangors and Kairic Acolytes ensure that what the Great Schemer has decreed cannot be denied.',
    faction: 'disciples-of-tzeentch',
    units: ['Magister on Disc of Tzeentch', 'Flamers of Tzeentch', 'Screamers of Tzeentch', 'Tzaangors', 'Kairic Acolytes'],
    battleTraits:       [{"name":"Masters of Destiny","timing":"Once Per Battle, Start of the First Battle Round","text":"Effect: Roll 9 dice and put them to one side. These are your destiny dice. During the battle, instead of rolling 1 of the listed rolls, you can pick one of your destiny dice and use it as the roll. Once used, a destiny dice is discarded. The following rolls can be replaced: Casting rolls, Run rolls, Charge rolls, Hit rolls, Wound rolls, Save rolls (you must still modify by Rend). If you want to replace a roll that uses more than one D6, you must use the same number of destiny dice."}],
    regimentAbilities:  [{"name":"Transient Forms","timing":"Passive","text":"Effect: Roll a dice each time a friendly Kairic Acolytes model is slain in the combat phase. On a 4+, you can return 1 slain model to a friendly Tzaangors unit within 9\" of the slain model."},{"name":"Eternal Conflagration","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of ranged weapons used by friendly Flamers of Tzeentch units."}],
    enhancements:       [{"name":"Shield of Fate","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 18\" of your general, then make a casting roll of 2D6. Effect: On a 6+, until the start of your next turn, that unit has Ward (6+). If that unit already has a ward, add 1 to ward rolls for that unit instead."},{"name":"Daemonic Heart","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit within 1\" of your general. Effect: Inflict an amount of mortal damage on that unit equal to the number of the current battle round."},{"name":"Glimpse the Future","timing":"Your Hero Phase","text":"Declare: If you have fewer than 6 destiny dice, make a casting roll of 2D6. Effect: On a 7+, you can roll a dice and add it to your destiny dice."},{"name":"Time Slippendant","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit within 9\" of your general. Effect: That unit has Strike-last this phase."}]
  },
  {
    name: 'Tzaangor Warflock',
    lore: 'The Tzaangor Warflock is an ever-mutating mass of avian beastmen guided by the foreknowledge of a Tzaangor Shaman who reads fate in the entrails of the battlefield. Enlightened riders lope ahead while Skyfires arc blazing arrows along trajectories only they can see — nothing occurs that the Shaman had not already predicted.',
    faction: 'disciples-of-tzeentch',
    units: ['Tzaangor Shaman', 'Tzaangors', 'Tzaangor Enlightened', 'Tzaangor Skyfires'],
    battleTraits:       [{"name":"Fated Arrival","timing":"Passive (Deployment)","text":"Your Tzaangor Enlightened unit is not set up during the deployment phase. Instead, from the second battle round onwards, it can use Fated Arrival (Your Movement Phase): Set up this unit wholly within friendly territory, within 1\" of a battlefield edge and more than 6\" from all enemy units."},{"name":"Predict the Future","timing":"Your Hero Phase","text":"Effect: You can look at up to 3 cards from the top of your battle tactic deck without adding them to your hand. Then, in any order, return each card face down to either the top or the bottom of your battle tactic deck."},{"name":"Cheat Destiny","timing":"Reaction: You used a command on a battle tactic card","text":"Effect: Instead of discarding that card, return it face down to the bottom of your battle tactic deck."}],
    regimentAbilities:  [{"name":"Constant Flux","timing":"Passive","text":"Effect: Subtract 1 from the Rend characteristic of weapons used for attacks that target friendly units while you are the underdog."},{"name":"Arcane Ritualists","timing":"Passive","text":"Effect: Add 1 to casting rolls for your general while they are wholly within 6\" of another friendly unit."}],
    enhancements:       [{"name":"Predicted Strike","timing":"Once Per Battle, Enemy Movement Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general and that is not in combat to be the target. Effect: The target can move D6\". It cannot move through the combat ranges of enemy units or end that move in combat."},{"name":"Fold Reality","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 6+, remove the target from the battlefield and set it up again wholly within 12\" of your general and more than 6\" from all enemy units."},{"name":"Infernal Gateway","timing":"Your Hero Phase","text":"Declare: Pick a visible enemy unit within 18\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 5+, roll either 3 dice or a number of dice equal to the number of battle tactic cards you have discarded this battle. For each 4+, inflict 1 mortal damage on the target."},{"name":"Mutagenic Sorcery","timing":"End of Any Turn","text":"Declare: Pick a visible enemy unit within 12\" of your general to be the enemy target, then pick a friendly Tzaangors unit in combat with the enemy target to be the friendly target. Effect: Roll a D3. On a 2+: Inflict an amount of mortal damage on the enemy target equal to the roll. You can return 1 slain model to the friendly target."}]
  },
  {
    name: 'Blades of The Lurid Dream',
    lore: 'The Blades of the Lurid Dream pursue excess in all things, the Shardspeaker\'s shadowy arts ensnaring hearts and minds while Slickblade Seekers slash through enemies in a frenzy of sensation. The Temptations of Slaanesh twist even the enemy\'s failures into victories for the Dark Prince, and the Slaangor Fiendbloods feast on whatever remains.',
    faction: 'hedonites-of-slaanesh',
    units: ['Shardspeaker of Slaanesh', 'Blissbarb Archers', 'Slickblade Seekers', 'Slaangor Fiendbloods'],
    battleTraits:       [{"name":"Temptations of Slaanesh","timing":"Passive","text":"You receive 6 temptation dice at the start of the battle round. Each time your opponent makes a failed hit roll, wound roll or save roll, you can offer them a temptation dice. If they accept, that roll is replaced with a 6. Each time your opponent accepts, you gain D6 depravity points. Each time your opponent rejects, inflict D3 mortal damage on the unit for which the roll was made. You cannot offer a temptation dice for the same enemy unit more than once per phase. At the end of the battle round, all remaining temptation dice are lost. Depravity thresholds (cumulative) — 12+ DP: Tantalising Torment: This unit can use a Run ability and still use Charge abilities later in the turn. 18+ DP: Sadistic Spite: This unit's melee weapons have Crit (Mortal). 24+ DP: Oblivious Indulgence: This unit has Ward (5+)."}],
    regimentAbilities:  [{"name":"Unparalleled Speed","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a friendly unit to use this ability. Effect: That unit has Strike-first this phase."},{"name":"Locus of Diversion","timing":"Once Per Turn, Your Movement Phase","text":"Declare: Pick a friendly unit to use this ability. Effect: For the rest of the turn, that unit can use a Retreat ability and still use Shoot and/or Charge abilities later in the turn."}],
    enhancements:       [{"name":"Sceptre of Domination","timing":"Any Combat Phase","text":"Declare: Roll a dice for each enemy unit in combat with your general. Effect: On a 5+, the unit being rolled for has Strike-last this phase."},{"name":"Twisted Mirror","timing":"Once Per Turn, Your Shooting Phase","text":"Declare: Pick an enemy unit within 9\" of your general and roll a dice. Effect: On a 4+, subtract 1 from save rolls for that unit until the start of your next turn."},{"name":"Cacophonic Choir","timing":"Your Hero Phase","text":"Declare: Make a casting roll of 2D6. Effect: On a 6+, make a cacophony roll of D6. Inflict D3 mortal damage on each enemy unit (roll for each) within 6\" of your general that has a Control characteristic less than the cacophony roll."},{"name":"Pendant of Slaanesh","timing":"Your Hero Phase","text":"Effect: Heal (D3) your general."}]
  },
  {
    name: 'Epicurean Revellers',
    lore: 'The Epicurean Revellers are a daemonic cavalcade devoted to the most extravagant expressions of Slaanesh\'s appetite, led by the hypnotic Thricefold Discord whose very presence overwhelms the senses. Fiends lash with euphoria-inducing barbs, Daemonettes carve beauty from carnage, and Seekers race ahead to claim the finest kills.',
    faction: 'hedonites-of-slaanesh',
    units: ['Thricefold Discord', 'Fiends', 'Daemonettes', 'Seekers'],
    battleTraits:       [{"name":"Favour Most Fickle","timing":"Passive","text":"The following effects apply based on the number of friendly units on the battlefield (not cumulative): 5 or more units: Add 2 to the Control characteristic of friendly units. 4 units: Add 1 to hit rolls and wound rolls for friendly units' combat attacks, including attacks made with Companion weapons. 3 units: Add 1 to run rolls and charge rolls for friendly units. 2 units: Friendly units have Ward (5+). 1 unit: Add 2 to the Attacks characteristic of friendly units' melee weapons, including Companion weapons."}],
    regimentAbilities:  [{"name":"Bringers of Degradation","timing":"Passive","text":"Effect: When players are alternating picking units to use a Fight ability, when it is your turn to pick a unit, you can pick 2 friendly Daemonettes units instead of 1 unit. Resolve the second Fight ability immediately after the first."},{"name":"Daemonic Onslaught","timing":"Once Per Battle, Deployment Phase","text":"Declare: Pick a friendly Seekers or Fiends unit wholly within 12\" of your general to be the target. Effect: The target can use the 'Normal Move' ability as if it were your movement phase."}],
    enhancements:       [{"name":"Twisted Grace","timing":"Passive","text":"Effect: When your general makes a pile-in move, if they charged in the same turn, add D6\" to the distance they can move."},{"name":"High Courtiers","timing":"Passive","text":"Effect: While your general is wholly within the combat range of a friendly Daemonettes unit, both units have Ward (5+)."},{"name":"Excess of Violence","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target. Effect: The target's melee weapons, including Companion weapons, have Crit (2 Hits) until the start of your next turn."},{"name":"Irresistible Soul-Musk","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick a visible friendly Seekers or Fiends unit wholly within 12\" of your general to be the target. Effect: Remove the target from the battlefield and set it up again on the battlefield more than 6\" from all enemy units."}]
  },
  {
    name: 'Bleak Host',
    lore: 'The Bleak Host spreads Nurgle\'s bountiful gifts across the battlefield, each wound festering with the Plague God\'s loving attention. Pusgoyle Blightlords swoop on droning wings while Putrid Blightkings grind the enemy down, the Spoilpox Scrivener keeping meticulous record of every disease point tallied in Father Nurgle\'s name.',
    faction: 'maggotkin-of-nurgle',
    units: ['Spoilpox Scrivener', 'Pusgoyle Blightlords', 'Putrid Blightkings', 'Plaguebearers'],
    battleTraits:       [{"name":"The Infectious Hosts / Daemonic Summoning","timing":"Passive (Deployment)","text":"One of your Pusgoyle Blightlords and one of your Plaguebearers units are not set up during the deployment phase. Instead, from the third battle round onwards, they can use Daemonic Summoning (Your Movement Phase): Set up this unit anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Diseased","timing":"Passive","text":"Each time an attack made by a friendly model scores a critical hit, you receive 1 disease point, to a maximum of 7."},{"name":"Nurgle's Embrace","timing":"End of Any Turn","text":"Effect: Spend any number of your disease points. For each disease point you spend, pick an enemy unit that is in combat with any of your units and roll a dice. On a 5+, inflict 1 mortal damage on that unit (you can pick the same enemy unit more than once)."}],
    regimentAbilities:  [{"name":"Locus of Fecundity","timing":"Once Per Phase, Your Hero Phase","text":"Declare: Pick a friendly unit. Effect: Heal (D3) that unit."},{"name":"Infested with Wonders","timing":"Passive","text":"Effect: Each time a friendly model is slain, before it is removed from play, you can pick an enemy unit within 1\" of it and roll a dice. On a 4+, inflict 1 mortal damage on that unit."}],
    enhancements:       [{"name":"Summoner of Plaguebearers","timing":"End of Any Turn","text":"Declare: Pick a friendly Plaguebearers unit wholly within 14\" of your general. Effect: Return 1 slain model to that unit."},{"name":"Gardener of Nurgle","timing":"Your Movement Phase","text":"Declare: If your general is contesting an objective not contested by any enemy models, roll a dice. Effect: On a 3+, that objective is considered by you to be desecrated. Friendly units have Ward (4+) while they are contesting a desecrated objective. If your opponent gains control of a desecrated objective, it is no longer desecrated."},{"name":"Pestilent Breath","timing":"Your Shooting Phase","text":"Declare: Pick an enemy unit within 7\" of your general and roll a dice for each model in that unit. Effect: For each 5+, inflict 1 mortal damage on that unit."},{"name":"Gift of Febrile Frenzy","timing":"Once Per Battle, Any Combat Phase","text":"Effect: Until the end of the phase, add 1 to the Attacks characteristic of melee weapons used by friendly units while they are wholly within 7\" of your general."}]
  },
  {
    name: 'Bubonic Cell',
    lore: 'A Bubonic Cell spreads corruption not through blunt force but through patient, insidious decay, the Rotbringer Sorcerer channelling Nurgle\'s endless cycle to defile the very land itself. Nurglings swarm and gnaw while a Beast of Nurgle lumbers forward with cheerful malice, and the Rotmire Creed poison everything they touch.',
    faction: 'maggotkin-of-nurgle',
    units: ['Rotbringer Sorcerer', 'Nurglings', 'Beast of Nurgle', 'Rotmire Creed'],
    battleTraits:       [{"name":"Cycle of Corruption","timing":"Passive","text":"If it is the first battle round, roll a dice to determine which Cycle ability applies (if you roll a 5 or 6, roll again). If it is not the first battle round, the next Cycle ability in the sequence is used. Cycle 1 — Numberless Pests: Subtract 1 from hit rolls for attacks that target friendly units. Cycle 2 — Plague of Misery: While enemy units are within 6\" of any friendly units, they cannot use abilities that heal or return slain models to a unit. Cycle 3 — Burgeoning Filth: Subtract 3 from the control scores of enemy units while they are in combat with any friendly units. Cycle 4 — Nauseous Revulsion: Subtract 1 from charge rolls for enemy units."}],
    regimentAbilities:  [{"name":"Corruption of the Land","timing":"Once Per Turn (Army), End of Your Turn","text":"Declare: Pick a terrain feature, then roll a dice for each enemy unit within 3\" of that terrain feature. Effect: On a 4+, inflict D3 mortal damage on that enemy unit."},{"name":"Putrefied Ground","timing":"Once Per Battle, Enemy Hero Phase","text":"Effect: For the rest of the turn: Subtract 1 from the Move characteristic of enemy units. Subtract 1 from run rolls for enemy units."}],
    enhancements:       [{"name":"Unnatural Vitality","timing":"Passive","text":"Effect: Your general has Ward (4+)."},{"name":"Subcutaneous Suppuration","timing":"Passive","text":"Effect: Subtract 1 from wound rolls for attacks that target your general."},{"name":"Gaseous Emanation","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit within your general's combat range to be the target. Effect: The target has Strike-last for the rest of the turn."},{"name":"Overripe Death's Heads","timing":"Your Shooting Phase","text":"Declare: If your general is not in combat, pick a visible enemy unit within 7\" of them to be the target. Effect: Roll a dice. On a 4+, inflict 1 mortal damage on the target."}]
  },
  {
    name: 'Gnawfeast Clawpack',
    lore: 'The Gnawfeast Clawpack is an eruption of skaven cunning and cowardice weaponised — a Clawlord screaming orders while a Grey Seer hurls warp-lightning and a Warlock Engineer tinkers with increasingly unstable devices. Clanrats swarm in their thousands and Rat Ogors smash what remains, and if the plan fails, there are always more rats.',
    faction: 'skaven',
    units: ['Clawlord', 'Grey Seer', 'Warlock Engineer', 'Clanrats', 'Rat Ogors'],
    battleTraits:       [{"name":"The Lurking Gnawhole / Vermintide","timing":"Once Per Battle, Deployment Phase","text":"Declare: Pick a friendly unit that has not been deployed to be the target. Effect: The target unit is set up in reserve in the tunnels below. Units in the tunnels below that have not used the 'Gnawhole Ambush' ability by the end of the third battle round are destroyed. Vermintide (Your Movement Phase): Set up that unit wholly within 6\" of a corner of the battlefield and more than 9\" from all enemy units."}],
    regimentAbilities:  [{"name":"Warpstone-Laced Bullets","timing":"Once Per Battle, Your Shooting Phase","text":"Declare: Pick a ranged weapon a friendly unit is armed with. Effect: That weapon has Crit (Mortal) this phase."},{"name":"Too Quick to Hit-Hit","timing":"Passive","text":"Effect: No mortal damage is inflicted on friendly units when they use Retreat abilities."}],
    enhancements:       [{"name":"Lead the Seething Horde","timing":"Reaction: You declared the 'Call for Reinforcements' ability","text":"Effect: Instead of using the set-up instructions in the 'Call for Reinforcements' ability, the replacement unit can be set up wholly within 13\" of this unit and not in combat."},{"name":"Skryre Connections","timing":"Passive","text":"Effect: Your general's Ratling Pistol has an Attacks characteristic of 2D6 instead of D6."},{"name":"Warpstone Charm","timing":"Passive","text":"Effect: Subtract 1 from save rolls for enemy units in combat with your general."},{"name":"Cloak of Stitched Victories","timing":"Passive","text":"Effect: Your general has Ward (5+)."}]
  },
  {
    name: 'Warpspark Clawpack',
    lore: 'The Warpspark Clawpack represents skaven ingenuity at its most dangerously erratic, the Grey Seer\'s warp-fuelled schemes backed by the raw destructive power of Stormfiends and a Warp Lightning Cannon that crackles with barely contained energy. The fact that it might kill as many friends as enemies only adds to the excitement.',
    faction: 'skaven',
    units: ['Grey Seer', 'Stormfiends', 'Warp Lightning Cannon', 'Clanrats'],
    battleTraits:       [{"name":"Always Three Clawsteps Ahead","timing":"Once Per Phase, Enemy Movement Phase","text":"Declare: Pick a friendly unit that is not in combat. Effect: That unit can use the 'Normal Move' ability as if it were your movement phase."}],
    regimentAbilities:  [{"name":"Warpstone-Laced Armour","timing":"Once Per Battle, Reaction: Opponent declared an Attack ability and targeted your Stormfiends unit","text":"Used By: Your Stormfiends unit. Effect: Your Stormfiends unit has Ward (5+) for the rest of the turn."},{"name":"Endless Swarm of Rats","timing":"Passive","text":"Effect: When a friendly Clanrats unit uses its 'Seething Swarm' ability, you can return D6 slain models to that unit instead of D3."}],
    enhancements:       [{"name":"Skilled Manipulator","timing":"Passive","text":"Effect: Your general has Ward (4+) while they are within 1\" of any friendly Clanrats units."},{"name":"Skitterleap","timing":"Your Hero Phase","text":"Declare: Make a casting roll of 2D6. Effect: On a 6+, remove your general from the battlefield and set them up again on the battlefield more than 6\" from all enemy units. They cannot use Move abilities in the following movement phase."},{"name":"Cage of Warp Lightning","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a visible enemy unit within 6\" of your general and roll a dice. Effect: On a 2+, the enemy unit has Strike-last this phase. On a 1, inflict 1 mortal damage on your general."},{"name":"Scurry Away","timing":"Any Combat Phase","text":"Effect: Roll a dice. On a 3+, this unit can immediately use the 'Retreat' ability as if it were your movement phase. If it does so, no mortal damage is inflicted on it."}]
  },
  {
    name: 'Bloodwind Legion',
    lore: 'The Bloodwind Legion is a host of warriors who have pledged themselves to the Chaos Gods in pursuit of apotheosis — Chaos Warriors and Knights riding to war behind a Chaos Lord who has already proven himself worthy of dark blessings. Each kill on the battlefield is a plea to the Ruinous Powers for the gift of mutation and ascension.',
    faction: 'slaves-to-darkness',
    units: ['Chaos Lord', 'Chaos Chariot', 'Chaos Warriors', 'Chaos Knights'],
    battleTraits:       [{"name":"Eye of the Gods","timing":"Once Per Turn, End of Any Turn","text":"Declare: Pick a friendly unit that is contesting an objective not controlled by your opponent and is not in combat, OR a unit that destroyed an enemy unit this turn. Effect: Roll once on the Eye of the Gods table for that unit. That unit gains the Eye of the Gods passive ability that corresponds to the roll. Roll results — 1: Snubbed by the Gods: No effect. 2: Ward of Tzeentch: This unit has Ward (6+). 3: Grace of Slaanesh: Add 1 to run rolls for this unit. 4: Blessing of Nurgle: Subtract 1 from wound rolls for attacks that target this unit. 5: Fury of Khorne: Add 1 to the Rend characteristic of this unit's melee weapons. 6: Champion of Chaos: Pick any ability from the table."}],
    regimentAbilities:  [{"name":"The Dread Banner","timing":"Once Per Battle, Start of the First Battle Round","text":"Declare: Pick a friendly Chaos Warriors or Chaos Knights unit. Effect: You can immediately roll on the Eye of the Gods table for that unit."},{"name":"Fierce Conquerors","timing":"Passive","text":"Effect: Add 3 to the control scores of friendly Chaos Warriors units."}],
    enhancements:       [{"name":"Mark of Khorne","timing":"Passive","text":"Effect: Add 1 to the Rend characteristic of your general's melee weapons if they charged in the same turn."},{"name":"Mark of Tzeentch","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick a friendly unit on the battlefield. You cannot pick your general. Effect: Remove that unit from the battlefield and set it up again wholly within 6\" of your general and more than 6\" from all enemy units. It cannot use Move abilities for the rest of the phase."},{"name":"Mark of Nurgle","timing":"Passive","text":"Effect: Subtract 1 from wound rolls for combat attacks that target your general."},{"name":"Mark of Slaanesh","timing":"Passive","text":"Effect: Your general has Strike-first."}]
  },
  {
    name: 'Darkoath Raiders',
    lore: 'The Darkoath Raiders are sworn to their dark oaths with a conviction that borders on religious mania, the Warqueen\'s word binding her Savagers, Fellriders and Marauders to acts of conquest that must be fulfilled or else face supernatural repercussions. They raid with a ferocity born of desperation and dark faith in equal measure.',
    faction: 'slaves-to-darkness',
    units: ['Darkoath Warqueen', 'Darkoath Savagers', 'Darkoath Fellriders', 'Darkoath Marauders'],
    battleTraits:       [{"name":"Oaths of Darkness","timing":"Once Per Turn (Army), Your Hero Phase","text":"Effect: You can reveal 1 battle tactic card in your hand to your opponent. If you do so, that battle tactic card becomes your oath for the rest of the turn. You can still use the command on it or attempt to score the battle tactic on it as normal. If you score the battle tactic on your oath this turn, your oath is fulfilled — instead of discarding the card, it is placed to one side but you can still use the command on it. If you use the command on your oath before it is scored, it is discarded as normal. At the end of the turn, if the oath has not been fulfilled, it ceases to be your oath."}],
    regimentAbilities:  [{"name":"Rage of Arkhar","timing":"Once Per Turn (Army), Any Combat Phase","text":"Declare: Pick a friendly unit in combat to be the target. Effect: For the rest of the turn, add 1 to the Attacks and Rend characteristics of the target's melee weapons."},{"name":"Fearless Invaders","timing":"Once Per Turn (Army), Your Movement Phase","text":"Declare: Pick a friendly unit in combat to be the target. Effect: If the target uses a Retreat ability this turn, no mortal damage is inflicted on it and it can still use Charge abilities later in the turn."}],
    enhancements:       [{"name":"Bloodthirsty Blade","timing":"Passive","text":"Effect: The Rend characteristic of your general's Rune-etched Axe is 2."},{"name":"Godshadow Talisman","timing":"Passive","text":"Effect: Your general has Ward (4+)."},{"name":"Champion of Raids","timing":"Your Charge Phase","text":"Declare: Pick another friendly unit wholly within 12\" of your general to be the target. Effect: The target can re-roll charge rolls for the rest of the turn."},{"name":"Fell Ritualist","timing":"Passive","text":"Effect: Each time you draw battle tactic cards, if your general is on the battlefield, you can choose to draw 1 additional battle tactic card, then put 1 of your battle tactic cards in your hand back at the bottom of your battle tactic deck."}]
  },
  // ── DEATH ─────────────────────────────────────────────────────────────────
  {
    name: 'Carrion Retainers',
    lore: 'In the delusion of the Abhorrant Archregent, the Carrion Retainers are a noble company of gallant knights and loyal footsoldiers serving the realm\'s most distinguished court. In terrible reality, they are ghouls and vampiric monsters who tear enemies limb from limb — their courtly bows and formal salutes masking something far more predatory.',
    faction: 'flesh-eater-courts',
    units: ['Abhorrant Archregent', 'Cryptguard', 'Morbheg Knights', 'Varghulf Courtier'],
    battleTraits:       [{"name":"Noble Deeds","timing":"Passive","text":"Each time a friendly Hero uses a Fight ability, after its attacks have been resolved, give that Hero a number of noble deeds points equal to the number of damage points allocated by that ability. Each Hero can have a maximum of 6 noble deeds points at any time."},{"name":"Feeding Frenzy","timing":"Passive","text":"Effect: Add 1 to the Attacks characteristic of melee weapons used by friendly units while they are wholly within 12\" of any friendly Heroes that have 6 noble deeds points."},{"name":"Summon Loyal Subjects","timing":"Your Movement Phase","text":"Declare: Pick a friendly Hero with any noble deeds points to use this ability. Effect: Spend noble deeds points — 1 point: pick a friendly Cryptguard unit within 9\" of this unit and return 1 model to it. 2 points: pick a friendly Morbheg Knights unit within 9\" of this unit and return 1 model to it."}],
    regimentAbilities:  [{"name":"Crusading Army","timing":"Passive","text":"Effect: Add 1 to run rolls and charge rolls for friendly units."},{"name":"Defenders of the Realm","timing":"Passive","text":"Effect: Add 1 to save rolls for friendly units that are contesting an objective you control."}],
    enhancements:       [{"name":"Ulguan Cloak","timing":"Passive","text":"Effect: Your general is not visible to enemy models that are more than 12\" away from them."},{"name":"Blood-River Chalice","timing":"Once Per Battle, Your Hero Phase","text":"Effect: Heal (2D3) your general."},{"name":"Rousing Oration","timing":"Your Hero Phase","text":"Effect: Roll a dice for each friendly unit wholly within 12\" of your general. Do not roll a dice for your general. For each 5+, give 1 noble deeds point to your general."},{"name":"Crimson Victuals","timing":"Your Hero Phase","text":"Declare: Pick a visible enemy unit within 18\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 6+, inflict D3 mortal damage on the target. Then, if your Cryptguard unit is within 6\" of the target, you can return 1 slain model to your Cryptguard unit for each damage point allocated by this ability."}]
  },
  {
    name: 'Charnel Watch',
    lore: 'The Charnel Watch serves the Abhorrant Gorewarden with unwavering loyalty born of madness, their perception of their own heroism shifting with each turn of the Delusion. What they believe themselves to be matters little — Crypt Horrors and Crypt Flayers are lethal regardless of which noble fantasy drives them forward.',
    faction: 'flesh-eater-courts',
    units: ['Abhorrant Gorewarden', 'Royal Beastflayers', 'Crypt Horrors', 'Crypt Flayers'],
    battleTraits:       [{"name":"Delusions and Madness","timing":"Once Per Battle Round (Army), Start of Battle Round","text":"You must use this ability at the start of each battle round. If it is the first battle round, pick a Delusion. Otherwise, make a delusion roll by rolling a D6 — on a 1-3, pick a different Delusion to the one you picked last time; on a 4+, pick the same Delusion as last time. Delusions — Great Feast: If you believe this Delusion, at end of any turn, Heal (1) each friendly unit on the battlefield. If the target is a Serfs unit, return D3 slain models to it instead. Knightly Host: While you believe this Delusion, if the unmodified charge roll for a friendly Hero or Knights unit is 8+, add 1 to hit rolls for that unit's combat attacks for the rest of the turn."}],
    regimentAbilities:  [{"name":"Delusion of the Sentinel","timing":"Passive","text":"While you believe this Delusion, add 1 to ward rolls for friendly units while each model in the unit is contesting an objective."},{"name":"Delusion of the Hunter","timing":"Passive","text":"While you believe this Delusion, add 1 to wound rolls for combat attacks made by friendly units while no models in the unit are contesting an objective."}],
    enhancements:       [{"name":"Almost Lucid","timing":"Once Per Battle, Reaction: You declared the 'Delusions and Madness' ability","text":"Effect: You can re-roll the delusion roll."},{"name":"Companion of the Hunt","timing":"End of Any Turn","text":"Effect: If your general is not in combat, they can move 3\". They cannot move into combat during any part of that move."},{"name":"A Worthy Challenge","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit that started the battle with 3 or fewer models and is in combat with your general to be the target. Effect: Your opponent must decide whether the target will accept or refuse your general's challenge. If they accept, when your general and the target are picked to use a Fight ability, all of their attacks must target each other. If they refuse, the target has Strike-last for the rest of the phase."},{"name":"Choirmaster","timing":"Once Per Battle, Your Shooting Phase","text":"Declare: Pick a visible enemy unit within 6\" of your general to be the target. Effect: For the rest of the turn, add 1 to the Damage characteristic of friendly units' ranged weapons for attacks that target that enemy unit."}]
  },
  {
    name: 'Cursed Shacklehorde',
    lore: 'The Cursed Shacklehorde is bound together by chains of spectral agony and the implacable will of the Spirit Torment who controls them. Bladegheist Revenants and Dreadscythe Harridans are tormented souls who must fight on whether they wish to or not, and the Dreadblade Harrows ride ahead to ensure none escape the procession\'s reach.',
    faction: 'nighthaunt',
    units: ['Spirit Torment', 'Chainghasts', 'Bladegheist Revenants', 'Dreadscythe Harridans', 'Dreadblade Harrows'],
    battleTraits:       [{"name":"Spectral Procession / Cackling Arrival","timing":"Passive (Deployment)","text":"1 of your Bladegheist Revenants units and 1 of your Dreadscythe Harridans units start the battle in reserve. From the second battle round onwards, Cackling Arrival (Once Per Turn (Army), Your Movement Phase): Declare: Pick 1 of your units in reserve. Effect: Set up that unit anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Ethereal","timing":"Passive","text":"Effect: Ignore negative modifiers to save rolls for friendly units."}],
    regimentAbilities:  [{"name":"Discorporate","timing":"Once Per Turn (Army), Any Hero Phase","text":"Declare: Pick a friendly unit to be the target. Effect: Roll a dice. On a 3+, add 1 to save rolls for the target for the rest of the turn."},{"name":"Mounting Dread","timing":"Once Per Turn (Army), End of Any Turn","text":"Declare: Pick a friendly unit to be the target. Effect: Roll a dice. On a 2+, subtract the current battle round number from the control scores of enemy units while they are in combat with the target."}],
    enhancements:       [{"name":"Unholy Visage","timing":"Your Hero Phase","text":"Declare: Pick a visible enemy unit within 6\" of your general to be the target. Effect: Roll a dice. On a 3+, the target must immediately use a Retreat ability as if it were the enemy movement phase."},{"name":"Tales of Horror","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy Infantry or Cavalry unit within 6\" of your general to be the target. Effect: For the rest of the battle, if the target is replaced using the 'Call for Reinforcements' ability, halve the number of models in the replacement unit, rounding up."},{"name":"Deathly Possessor","timing":"Any Combat Phase","text":"Declare: Pick an enemy Hero within 12\" of your general to be the target, then pick another enemy unit within the target's combat range to be the victim. Effect: Roll a D3. On a 2+, pick one: inflict mortal damage on the target equal to the roll, OR inflict mortal damage on the victim equal to the roll."},{"name":"Spectral Howl","timing":"Once Per Battle, Any Hero Phase","text":"Declare: Pick an enemy unit within 12\" of your general to be the target. Effect: For the rest of the turn, subtract 1 from the number of dice rolled when making charge rolls for the target, to a minimum of 1."}]
  },
  {
    name: 'Slasher Host',
    lore: 'A Knight of Shrouds commands the Slasher Host like a general of a living army — except all his troops are wrathful spirits and the only orders that register are those of attack and kill. Spirit Hosts, Grimghast Reapers and Chainrasps crash forward in a Wave of Terror that cannot be stopped by conventional means.',
    faction: 'nighthaunt',
    units: ['Knight of Shrouds', 'Spirit Hosts', 'Grimghast Reapers', 'Chainrasps'],
    battleTraits:       [{"name":"Wave of Terror","timing":"Any Charge Phase","text":"Declare: Pick a friendly unit to use this ability if it charged this phase and the charge roll was 10+. Then, pick an enemy unit within 1\" of it to be the target. Effect: The target has Strike-last this turn."},{"name":"Ethereal","timing":"Passive","text":"Effect: Ignore all modifiers to save rolls for friendly units (positive and negative)."}],
    regimentAbilities:  [{"name":"Death Stalkers","timing":"Start of the First Battle Round","text":"Declare: Pick an enemy unit on the battlefield. Effect: Add 1 to the Rend characteristic of melee weapons used for attacks that target that unit."},{"name":"Chorus of Terror","timing":"Passive","text":"Effect: Subtract 1 from hit rolls for combat attacks that target a friendly unit that charged in the same turn."}],
    enhancements:       [{"name":"Soulfire Ring","timing":"End of Any Turn","text":"Effect: If any models were slain by your general this turn, Heal (D6) your general."},{"name":"Cloaked in Shadow","timing":"Passive","text":"Effect: No more than 1 enemy unit can target your general with attacks (shooting or combat) per phase."},{"name":"Beacon of Nagashizzar","timing":"Once Per Battle, Your Hero Phase","text":"Effect: Return 1 slain model to each friendly unit on the battlefield."},{"name":"Shadow's Edge","timing":"Passive","text":"Effect: Your general's Sword of Stolen Hours has Crit (Mortal)."}]
  },
  {
    name: 'Kavalos Vanguard',
    lore: 'The Kavalos Vanguard is the spearhead of the Ossiarch Bonereapers\' inexorable advance — a swift, disciplined cavalry formation that outmanoeuvres lesser armies with mechanical precision. The Liege-Kavalos commands with cold authority, and the Kavalos Deathriders execute every order without hesitation, fear or fatigue.',
    faction: 'ossiarch-bonereapers',
    units: ['Liege-Kavalos', 'Kavalos Deathriders', 'Teratic Cohort'],
    battleTraits:       [{"name":"Calculated Feint","timing":"Passive","text":"Effect: No mortal damage is inflicted on friendly Cavalry units by Retreat abilities."},{"name":"Kavalos Lance","timing":"Once Per Turn (Army), Your Hero Phase","text":"Declare: Pick a friendly unit to be the target. Effect: For the rest of the turn, the target can pass across enemy models as if it had Fly."}],
    regimentAbilities:  [{"name":"Feigned Retreat","timing":"Once Per Battle, Your Movement Phase","text":"Effect: For the rest of the turn, friendly units can use Charge abilities even if they used a Retreat ability in the same turn."},{"name":"Reinforced Constructs","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a friendly unit to be the target. Effect: The target has Ward (5+) for the rest of the turn."}],
    enhancements:       [{"name":"Mighty Archaeossian","timing":"Passive","text":"Effect: Your general has Ward (5+)."},{"name":"Murderous Blade","timing":"Passive","text":"Effect: Your general's Commander's Blade has Crit (2 Hits)."},{"name":"Imperious Commander","timing":"Your Movement Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target. Effect: Roll a dice. On a 3+, add 2\" to the target's Move characteristic for the rest of the turn."},{"name":"Cold Savagery","timing":"Any Combat Phase","text":"Declare: If your general has not charged this turn and is in combat, pick a visible friendly unit wholly within 12\" of them to be the target. Effect: Roll a dice. On a 3+, add 1 to the Rend characteristic of the target's melee weapons, including Companion weapons, for the rest of the turn."}]
  },
  {
    name: 'Mortisan Elite',
    lore: 'The Mortisan Elite are the Ossiarch Bonereapers at their most refined — arcane constructs of ossified bone animated by the Mortisan Ossifector\'s arts and driven by the relentless Nagashian imperative to collect, categorise and destroy. Immortis Guard protect, Necropolis Stalkers adapt, and Morghast Archai descend from on high.',
    faction: 'ossiarch-bonereapers',
    units: ['Mortisan Ossifector', 'Immortis Guard', 'Necropolis Stalkers', 'Morghast Archai'],
    battleTraits:       [{"name":"Heralds of Nagash / Dread Descent","timing":"Passive (Deployment)","text":"Your unit of Morghast Archai is not set up during the deployment phase. Instead, from the second battle round onwards, it can use Dread Descent (Once Per Turn (Army), Your Movement Phase): Set up this unit anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Relentless Discipline","timing":"Once Per Phase (Army)","text":"Declare: Pick a friendly unit to be the target. Effect: Make a discipline roll of D6. Add 1 to the roll if the target is wholly within 12\" of your general. On a 4+, pick 1 of the effects below: Your Movement Phase — Add 2\" to the target's Move characteristic for the rest of the phase. Your Charge Phase — Add 1 to charge rolls for the target for the rest of the phase. Any Combat Phase — Add 1 to wound rolls for combat attacks made by the target for the rest of the phase. Any Combat Phase — The target has Ward (5+) for the rest of the phase."}],
    regimentAbilities:  [{"name":"Peerless Cohesion","timing":"Once Per Turn (Army), Reaction: You declared the 'Relentless Discipline' ability","text":"Effect: You can use the 'Relentless Discipline' ability for a second time this phase but you must pick a different target to the one you picked the first time."},{"name":"Immaculate Generalship","timing":"Passive","text":"Effect: Add 1 to discipline rolls you make."}],
    enhancements:       [{"name":"Shard Storm","timing":"Your Hero Phase","text":"Declare: Pick a visible enemy unit within 12\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 7+, roll a number of dice equal to the number of models in the target unit. For each 5+, inflict 1 mortal damage on the target."},{"name":"Mend Constructs","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly unit wholly within 12\" of your general to be the target, then make a casting roll of 2D6. Effect: On a 6+, Heal (D3) the target."},{"name":"Lode of Saturation","timing":"Passive","text":"Effect: Subtract 1 from the Rend characteristic of melee weapons used for combat attacks that target this general."},{"name":"Helm of Tyranny","timing":"Once Per Battle, End of Your Turn","text":"Declare: Pick an enemy unit within 12\" of your general to be the target and roll a dice. Effect: On a 3+, subtract 3 from the control score of the target for the rest of the turn."}]
  },
  {
    name: 'Tithe-Reaper Echelon',
    lore: 'The Tithe-Reaper Echelon marches to collect what Nagash demands — the bones of the living, rendered into tithe for the Great Necromancer\'s eternal project. A Mortisan Soulreaper oversees the harvest while Mortek Guard advance in lockstep and a Gothizzar Harvester processes the fallen on the battlefield itself.',
    faction: 'ossiarch-bonereapers',
    units: ['Mortisan Soulreaper', 'Mortek Guard', 'Kavalos Deathriders', 'Gothizzar Harvester'],
    battleTraits:       [{"name":"Reserve Contingent / Contingent Arrival","timing":"Passive (Deployment)","text":"One of your Mortek Guard units is not set up during the deployment phase. Instead, from the third battle round onwards, it can use Contingent Arrival (Your Movement Phase): Set up this unit anywhere on the battlefield wholly within 3\" of a battlefield edge and more than 6\" from all enemy units."},{"name":"Ossiarch Commands","timing":"Passive","text":"At the start of the battle round, you receive 2 Ossiarch command points. Each Ossiarch Command costs 1 Ossiarch command point to use. The same unit cannot use more than one Ossiarch Command in the same phase. At the end of the battle round, all remaining Ossiarch command points are lost."}],
    regimentAbilities:  [{"name":"Impenetrable Ranks","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick a friendly unit to use this ability. Effect: Until the end of the phase, add 1 to ward rolls for that unit. (Ossiarch Command)"},{"name":"Re-Form Ranks","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick a friendly Mortek Guard unit in combat to use this ability. Effect: That unit can use a Retreat ability this phase without any mortal damage being inflicted on it. (Ossiarch Command)"}],
    enhancements:       [{"name":"Empower Nadirite Weapons","timing":"Your Hero Phase","text":"Declare: Pick a visible friendly Mortek Guard unit wholly within 12\" of your general, then make a casting roll of 2D6. Effect: On a 5+, until the start of your next turn, add 1 to the Rend characteristic of that unit's melee weapons."},{"name":"Unstoppable Commander","timing":"Your Movement Phase","text":"Declare: Pick a friendly Mortek Guard unit wholly within 12\" of your general, then roll a dice. Effect: On a 2+, add 3\" to that unit's Move characteristic this phase."},{"name":"Murderous Drive","timing":"Passive","text":"Effect: Your general's Soulreaper Scythe has Crit (2 Hits)."},{"name":"Marrowpact","timing":"Passive","text":"Effect: Each time your general uses a Fight ability, after all of their attacks have been resolved, Heal (X) your general where X is the number of damage points allocated by those attacks."}]
  },
  {
    name: 'Bloodcrave Hunt',
    lore: 'The Bloodcrave Hunt is a vampire lord\'s personal retinue made manifest upon the battlefield — an expression of aristocratic predation that strikes with the speed of night and the inevitability of the grave. Blood Knights thunder ahead, Deathrattle Skeletons hold ground, and Vargheists descend from the darkness to finish the bloodletting.',
    faction: 'soulblight-gravelords',
    units: ['Vampire Lord', 'Deathrattle Skeletons', 'Blood Knights', 'Vargheists'],
    battleTraits:       [{"name":"Death's Descent / Swoop Down","timing":"Passive (Deployment)","text":"Your Vargheists unit is not set up during the deployment phase. Instead, from the third battle round onwards, it can use Swoop Down (Your Movement Phase): Set up this unit anywhere on the battlefield more than 6\" from all enemy units."},{"name":"The Hunger","timing":"Passive","text":"Each time a friendly Vampire unit uses a Fight ability, after all of its attacks have been resolved, Heal (X) that Vampire unit where X is the number of damage points allocated by those attacks."}],
    regimentAbilities:  [{"name":"Endless Legions","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick a friendly Deathrattle Skeletons unit that has been destroyed. Effect: You can set up a replacement unit with D6+4 models anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Ruinous Chargers","timing":"Any Charge Phase","text":"Declare: Pick your Blood Knights unit to use this ability if it charged this turn. Effect: Inflict D3 mortal damage on each enemy unit it passed across during that Charge ability."}],
    enhancements:       [{"name":"Grave-Sand Shard","timing":"Once Per Battle, Reaction: You declared the 'Skeleton Legion' ability for a unit within 9\" of your general","text":"Effect: Add 1 to each legion roll made for that unit."},{"name":"Cloud of Bats","timing":"Once Per Battle, Your Movement Phase","text":"Effect: Remove your general from the battlefield and set them up again anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Aura of Night","timing":"Passive","text":"Effect: Ignore negative modifiers to save rolls for shooting attacks that target your general."},{"name":"Spirit Gale","timing":"Your Hero Phase","text":"Declare: Make a casting roll of 2D6. Effect: On a 7+, inflict 1 mortal damage on each enemy unit on the battlefield."}]
  },
  {
    name: 'Deathrattle Tomb Host',
    lore: 'The Deathrattle Tomb Host answers the Wight King\'s ancient summons — warriors who fell in battles long forgotten, now raised to fight once more under the command of a lord who cannot be stopped by mere death. Barrow Guard and Barrow Knights march with hollow purpose, and the shambling Deathrattle Skeletons rise whenever they fall.',
    faction: 'soulblight-gravelords',
    units: ['Wight King', 'Barrow Guard', 'Barrow Knights', 'Deathrattle Skeletons'],
    battleTraits:       [{"name":"The Unquiet Dead / The Rising Dead","timing":"Passive (Deployment)","text":"One of your Deathrattle Skeletons units is not set up during the deployment phase. Instead, from the third battle round onwards, it can use The Rising Dead (Once Per Battle (Army), Your Movement Phase): Set up this unit anywhere on the battlefield wholly within 3\" of a battlefield edge and more than 6\" from all enemy units."},{"name":"Aura of Antiquity","timing":"Once Per Turn (Army), Your Combat Phase","text":"Declare: Pick an enemy unit in combat with any friendly units to be the target. Effect: Roll a dice. On a 3+, subtract 1 from the Rend characteristic of the target's melee weapons until the start of your next turn."}],
    regimentAbilities:  [{"name":"Overwhelming Hordes","timing":"Passive","text":"Effect: Add 1 to wound rolls for combat attacks made by friendly non-Hero units that target a unit that has fewer models than the attacking unit."},{"name":"Deathmarch","timing":"Once Per Turn (Army), Your Hero Phase","text":"Declare: Pick a friendly non-Hero unit that is not in combat to be the target. Effect: For the rest of the turn, add 1\" to the target's Move characteristic and add 3 to its control score."}],
    enhancements:       [{"name":"Shyishan Blade","timing":"Passive","text":"Effect: The Rend characteristic of your general's Baleful Tomb Blade is 2."},{"name":"Stolen Animus","timing":"Passive","text":"Effect: Each time your general scores a critical hit, Heal (2) your general after the Attack ability has been resolved."},{"name":"Propelled by Hate","timing":"Your Charge Phase","text":"Declare: Pick another friendly unit wholly within 12\" of your general to be the target. Effect: You can re-roll charge rolls for the target for the rest of the turn."},{"name":"Soul-Drain Pendant","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general to be the target. Effect: Roll a dice. On a 2+, the target has Strike-last for the rest of the turn."}]
  },
  // ── DESTRUCTION ────────────────────────────────────────────────────────────
  {
    name: 'Bad Moon Madmob',
    lore: 'The Bad Moon Madmob surges forward under the insane light of the Bad Moon Gorkamorka, Moonclan Stabbas gibbering with excitement and Squig Hoppers bounding at random while Rockgut Troggoths lumber in from behind. The Loonboss who leads them is only marginally less deranged than the forces under his command.',
    faction: 'gloomspite-gitz',
    units: ['Loonboss', 'Moonclan Stabbas', 'Squig Hoppers', 'Rockgut Troggoths'],
    battleTraits:       [{"name":"Under the Light of the Bad Moon","timing":"Once Per Battle, Start of the First Battle Round","text":"Declare: Pick a territory (either friendly territory or enemy territory) to be under the Light of the Bad Moon. That territory remains under the Light of the Bad Moon in the first and second battle rounds. In the third and fourth battle rounds, the other territory is under the Light of the Bad Moon. While a friendly unit is wholly within the territory under the Light of the Bad Moon: Frothing Zealots: If the unit is a Moonclan Stabbas unit, add 3 to its control score. Lunar Squigs: If the unit is a Squig Hoppers unit, no mortal damage is inflicted on it when it uses Retreat abilities. Moonlit Hide: If the unit is a Rockgut Troggoths unit, add 1 to save rolls for it."},{"name":"Squigalanche","timing":"Passive (Deployment)","text":"One of your units of Squig Hoppers is not set up during the deployment phase. Instead, from the third battle round onwards, it can use Squigalanche (Your Movement Phase): Set up this unit wholly within your territory, wholly within 3\" of a battlefield edge and more than 6\" from all enemy units."}],
    regimentAbilities:  [{"name":"The Lunatic Hordes","timing":"Your Hero Phase","text":"Declare: Pick a friendly Moonclan Stabbas unit to use this ability. Effect: You can return up to D3 slain models to that unit."},{"name":"The Hand of Gork","timing":"Once Per Battle (Army), Your Movement Phase","text":"Declare: Pick a friendly unit that is not in combat to use this ability. Effect: Remove that unit from the battlefield and set it up again more than 9\" from all enemy units."}],
    enhancements:       [{"name":"Fight Another Day","timing":"End of Any Turn","text":"Declare: Pick your general to use this ability if they used a Fight ability this turn. Effect: Your general can make a 2D6\" move but cannot end that move in combat."},{"name":"The Clammy Cowl","timing":"Passive","text":"Effect: Subtract 1 from hit rolls for attacks that target your general."},{"name":"Hallucinogenic Fungus Brew","timing":"Passive","text":"Effect: Your general has Ward (4+) in the first battle round, Ward (5+) in the second battle round, and Ward (6+) in the third and fourth battle rounds."},{"name":"Nightshade Mushroom","timing":"Once Per Battle, Enemy Movement Phase","text":"Declare: Pick a friendly unit within your general's combat range. Effect: That unit cannot be targeted by shooting attacks in the next shooting phase."}]
  },
  {
    name: 'Snarlpack Huntaz',
    lore: 'The Snarlpack Huntaz are the fastest of the Gloomspite Gitz forces — wolf-riders and snarling war-machines that descend on the enemy in a flurry of fangs and crude weaponry. The Snarlboss barks commands with frightening authority, and the blazing Sunsteala Wheela\'s passage makes a mockery of the enemy\'s carefully laid ambushes.',
    faction: 'gloomspite-gitz',
    units: ['Snarlboss', 'Wolfgit Retinue', 'Snarlpack Cavalry', 'Sunsteala Wheela'],
    battleTraits:       [{"name":"Fast as Frazzlegit","timing":"Passive","text":"Effect: Friendly units can use Charge abilities even if they used a Retreat ability in the same turn. In addition, no mortal damage is inflicted on friendly units by Retreat abilities."}],
    regimentAbilities:  [{"name":"Flankin' Force","timing":"Once Per Battle, Start of First Battle Round","text":"Effect: Pick up to 2 friendly units. Remove them from the battlefield and set them up again anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Frazzleboom","timing":"Passive","text":"Effect: Each time a friendly War Machine is destroyed, before removing it from play, pick an enemy unit within 3\" of that War Machine and roll a D3. On a 2+, inflict an amount of mortal damage on that unit equal to the roll."}],
    enhancements:       [{"name":"Kunnin' as a Snarlfang","timing":"Once Per Battle, Any Combat Phase","text":"Effect: For the rest of the turn, add 1 to the Rend characteristic of melee weapons used by friendly units while they are wholly within 12\" of the bearer."},{"name":"Glare of Frazzlegit","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general to be the target. Effect: Subtract 1 from hit rolls for attacks made by the target for the rest of the turn."},{"name":"Sunsteala Shard","timing":"Once Per Battle, Enemy Shooting Phase","text":"Effect: For the rest of the turn, friendly units cannot be targeted by shooting attacks while they are wholly within 6\" of this unit, unless the attacking unit is in combat with the target unit."},{"name":"Devious Backstabba","timing":"End of Any Turn","text":"Declare: Pick an enemy Hero in combat with this unit to be the target. Effect: Roll a D3. On a 2+, inflict an amount of mortal damage on the target equal to the roll."}]
  },
  {
    name: 'Ironjawz Bigmob',
    lore: 'An Ironjawz Bigmob is a Waaagh! given direction — barely — by a Megaboss whose only leadership quality is that he hits harder than anyone who disagrees with him. Brute Ragerz lead the charge, Ardboyz hold the centre and Brutes erupt from reserves to hit the enemy just when they think the worst is over.',
    faction: ['ironjawz', 'orruk-warclans'],
    units: ['Megaboss', 'Brute Ragerz', 'Ardboyz', 'Brutes'],
    battleTraits:       [{"name":"'Ere We Go!","timing":"Passive (Deployment)","text":"Your Brutes are not set up during the deployment phase. Instead, from the third battle round onwards, they can use 'Ere We Go! (Your Movement Phase): Set up this unit anywhere on the battlefield more than 6\" from all enemy units."},{"name":"Mighty Destroyers","timing":"Once Per Turn (Army), Any Hero Phase","text":"Declare: Pick a friendly unit that was not set up this turn to be the target. Effect: The target can move up to 3\". It can move into combat. If it was in combat at the start of the move, it must end that move in combat."}],
    regimentAbilities:  [{"name":"Natural Disaster","timing":"Passive","text":"Effect: If you make an unmodified charge roll of 8+ for a friendly unit, add 1 to the Attacks characteristic of that unit's melee weapons for the rest of the turn."},{"name":"A Proper Ruckus","timing":"Once Per Battle, Reaction: You declared the 'Mighty Destroyers' ability","text":"Effect: All friendly units on the battlefield that were not set up this turn are the targets of that ability instead."}],
    enhancements:       [{"name":"Amberbone Whetstone","timing":"Passive","text":"Effect: The Rend characteristic of your general's melee weapons is 2."},{"name":"Trophy Skulls","timing":"Passive","text":"Effect: Your general's Control characteristic is 5."},{"name":"Armour of Gork","timing":"Passive","text":"Effect: Your general has Ward (6+)."},{"name":"Mega Bossy","timing":"Passive","text":"Effect: If this unit charged this turn, for the rest of the turn, add 1 to charge rolls for friendly units while they are wholly within 12\" of this unit."}]
  },
  {
    name: 'Swampskulka Gang',
    lore: 'The Swampskulka Gang fights in the Kruleboyz way — sneaky, patient and absolutely willing to use every underhanded trick available to them. The Killaboss on Great Gnashtoof directs Man-skewer Boltboyz to pick apart enemies at range before the Gutrippaz wade in, and the Beast-skewer Killbow ensures nothing too large gets any ideas.',
    faction: ['kruleboyz', 'orruk-warclans'],
    units: ['Killaboss on Great Gnashtoof', 'Murknob with Belcha-banna', 'Man-skewer Boltboyz', 'Gutrippaz', 'Beast-skewer Killbow'],
    battleTraits:       [{"name":"Kruleboyz Waaagh!","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick your general to use this ability, then pick another friendly unit wholly within 12\" of them to be the target. Effect: Your general and the target have Strike-first this phase."}],
    regimentAbilities:  [{"name":"Noisy Racket","timing":"Passive","text":"Effect: Subtract 1 from wound rolls for attacks made by enemy units in the first battle round."},{"name":"Covered in Mud","timing":"Start of the First Battle Round","text":"Declare: Pick a friendly unit to use this ability. Effect: In this battle, that unit is not visible to enemy models that are more than 12\" away from it."}],
    enhancements:       [{"name":"Egomaniak","timing":"Passive","text":"Effect: If any other friendly units are within your general's combat range, before you allocate a damage point to your general, roll a dice. On a 4+, you must allocate that damage point to one of those units instead."},{"name":"Mork's Eye Pebble","timing":"Once Per Battle, Enemy Movement Phase","text":"Effect: In the next shooting phase, friendly units have Ward (5+) while they are wholly within 12\" of your general."},{"name":"Kunnin' Plan","timing":"Once Per Turn, Your Hero Phase","text":"Declare: Pick a friendly unit wholly within 12\" of your general. Effect: If that unit uses a Retreat ability this turn, no mortal damage is inflicted on it and it can still use Shoot and/or Charge abilities later in the turn."},{"name":"Eye-Biter Ash","timing":"Once Per Battle, Any Combat Phase","text":"Declare: Pick an enemy unit in combat with your general and roll a dice. Effect: On a 1-4, subtract 1 from hit rolls for attacks made by that unit for the rest of the phase. On a 5+, subtract 1 from hit rolls for attacks made by that unit for the rest of the battle."}]
  },
  {
    name: 'Scrapglutt',
    lore: 'The Scrapglutt is an Ogor warband with more Gnoblars than most, the little creatures pressed into service manning a Scraplauncher that hurls miscellaneous debris with surprising effect. Ironguts provide the fist of the force, while the Gnoblar camp followers mostly stay out of the way — which is the most anyone can hope for from them.',
    faction: 'ogor-mawtribes',
    units: ['Gnoblar Scraplauncher', 'Ironguts', 'Gnoblars'],
    battleTraits:       [{"name":"Better Late Than Never / Let's Get Stuck In","timing":"Passive (Deployment)","text":"A unit of Ironguts with 4 models is not set up during the deployment phase. Instead, in the third battle round, that unit can use Let's Get Stuck In (Your Movement Phase): Set up this unit wholly within friendly territory, wholly within 6\" of the battlefield edge, and not in combat."}],
    regimentAbilities:  [{"name":"It's a Hard Life","timing":"Any Hero Phase","text":"Declare: Pick a friendly Gnoblars unit within your general's combat range to be the target. Effect: Roll a D3. On a 2+: Heal (X) your general where X is an amount equal to the roll, and 1 model in that Gnoblars unit is slain."},{"name":"Frenzied Artillery","timing":"Passive","text":"Effect: If the unmodified charge roll for a friendly Gnoblar Scraplauncher is 6+, add 3 to the Attacks characteristic of the target's Companion weapons for the rest of the turn."}],
    enhancements:       [{"name":"Savage Instincts","timing":"Reaction: You declared a Fight ability for your general","text":"Effect: Pick a friendly unit that has not used a Fight ability this turn and is within your general's combat range to be the target. The target can be picked to use a Fight ability immediately after the Fight ability used by your general has been resolved."},{"name":"Nasty Trap","timing":"Once Per Battle, Your Movement Phase","text":"Declare: Pick an enemy unit within 12\" of your general to be the target. Effect: Give the target your general's Trap token. While the target has a Trap token, each time the target is picked to use a Move or Charge ability, roll a dice. On a 4+, that Move or Charge ability has no effect and the target's Trap token is removed."},{"name":"Massive Bulk","timing":"Passive","text":"Effect: Add 2 to the Health characteristic of your general."},{"name":"Veteran Hunter","timing":"Once Per Battle, Any Hero Phase","text":"Declare: Pick an enemy unit within 12\" of your general to be the target. Effect: For the rest of the turn, add 1 to the Rend characteristic of your general's combat attacks that target that unit."}]
  },
  {
    name: "Tyrant's Bellow",
    lore: "A Tyrant's Bellow resounds across the battlefield as the Ogor warband crashes forward on the Mawpath, their endless hunger driving them to devour everything in their path. Mournfang Pack stampede ahead while Leadbelchers blast away and the Ironblaster adds its thunderous voice to the Tyrant's roaring declaration of war.",
    faction: 'ogor-mawtribes',
    units: ['Tyrant', 'Mournfang Pack', 'Ogor Gluttons', 'Leadbelchers', 'Ironblaster'],
    battleTraits:       [{"name":"On the Mawpath / Bellowing Arrival","timing":"Passive (Deployment)","text":"Your Ironblaster, Mournfang Pack and 1 unit of Ogor Gluttons are not set up during the deployment phase. Instead, from the third battle round onwards, they can use Bellowing Arrival (Your Movement Phase): Set up this unit anywhere on the battlefield, within 1\" of a battlefield edge and more than 6\" from all enemy units."}],
    regimentAbilities:  [{"name":"Pulverising Girth","timing":"Once Per Phase, Any Charge Phase","text":"Declare: Pick any number of friendly units that charged this phase. Effect: For each of those units, pick an enemy unit in combat with it and roll a dice. On a 4+, inflict 1 mortal damage on that enemy unit."},{"name":"Bred for Toughness","timing":"Passive","text":"Effect: Add 1 to the Health characteristic of your Ironblaster and your Mournfang Pack unit."}],
    enhancements:       [{"name":"Longstrider","timing":"Passive","text":"Effect: Your general has a Move characteristic of 8\" instead of 6\"."},{"name":"Flask of Stonehorn Blood","timing":"Once Per Battle, Reaction: Opponent declared an Attack ability and targeted your general","text":"Effect: Your general has Ward (3+) this phase."},{"name":"Booming Roar","timing":"Any Combat Phase","text":"Effect: Roll a dice. On a 4+, subtract 1 from hit rolls for attacks made by enemy units this phase while they are within 9\" of your general."},{"name":"Blubbergrub","timing":"Once Per Battle, Any Movement Phase","text":"Declare: Pick either your Ironblaster or your Mournfang Pack unit if it is within your general's combat range. Effect: Heal (D6) that unit."}]
  },
  {
    name: 'Wallsmasher Stomp',
    lore: 'The Wallsmasher Stomp is exactly what it sounds like — a mob of Mancrusher Gargants following the biggest of their number in the direction of whatever looks most worth smashing. Their Bullstomper leader has the vague awareness that enemies should be crushed, walls should be toppled and rocks should be thrown, and this is sufficient strategic vision.',
    faction: 'sons-of-behemat',
    units: ['Mancrusher Gargant', 'Mancrusher Mob'],
    battleTraits:       [{"name":"Bullstomper","timing":"Passive","text":"Mancrusher Mobs are led by fearsome gargants known as Bullstompers. Your general has the Hero keyword (in addition to the Monster keyword) but does not have the Reinforcements keyword or icon."},{"name":"Bellowing Roar","timing":"Any Combat Phase","text":"Declare: Pick a friendly unit to use this ability, pick an enemy unit in combat with it to be the target, then roll a dice. Effect: On a 2+, subtract 1 from hit rolls for attacks made by the target unit this phase."},{"name":"'Grab Those Rocks and Chuck 'Em!'","timing":"Your Hero Phase","text":"Declare: Pick your general to use this ability, then pick another friendly unit wholly within 12\" of them. Effect: Add 1 to the Attacks characteristic of that unit's Throwin' Rocks this turn."}],
    regimentAbilities:  [{"name":"Foe-Chompers","timing":"Passive","text":"Effect: Each time an enemy model is slain by a friendly unit's 'Stuff 'Em In Me Bag' ability, Heal (D3) that unit."},{"name":"Earth-Shaking Charge","timing":"Once Per Phase (Army), Any Charge Phase","text":"Declare: Pick a friendly unit that charged this phase to use this ability, then roll a dice for each enemy unit in combat with it. Effect: On a 3+, that enemy unit has Strike-last this turn."}],
    enhancements:       [{"name":"Monstrously Tough","timing":"Passive","text":"Effect: Your general has a Health characteristic of 15 instead of 12."},{"name":"Extra-Big Bag","timing":"Passive","text":"Effect: When your general uses their 'Stuff 'Em In Me Bag' ability, you can pick 2 enemy units instead of 1 (roll for each)."},{"name":"Lanky Git","timing":"Passive","text":"Effect: When you make a charge roll for your general, roll 3D6 instead of 2D6."},{"name":"Furiously Territorial","timing":"Passive","text":"Effect: Add 1 to hit rolls for attacks made by your general that target an enemy unit that is contesting an objective you do not control."}]
  },
  // ── NEW / UNRELEASED FACTIONS (may not be in DB yet) ─────────────────────
  {
    name: 'Helforge Host',
    lore: 'The Helforge Host marches to war like a moving engine of destruction, the War Despot\'s iron will channelling daemonic power through the ranks of the Infernal Cohort. The Dominator Engine grinds forward on mechanical legs while the Tormentor Bombard rains devastation from afar, all fuelled by Hashut\'s dark gift of industry and pain.',
    faction: 'helsmiths-of-hashut',
    units: ['War Despot', 'Dominator Engine', 'Tormentor Bombard', 'Infernal Cohort'],
    battleTraits:       [{"name":"Harness Daemonic Power","timing":"Once Per Turn (Army), Your Hero Phase","text":"You must use this ability at the start of each of your hero phases. Remove all daemonic power points from each friendly unit. Then, gain a number of daemonic power points equal to the current battle round number plus 1. Allocate your daemonic power points to friendly units (each unit can have a maximum of 3 daemonic power points). All unallocated daemonic power points are then lost."}],
    regimentAbilities:  [{"name":"Grinding Advance","timing":"Once Per Battle, Deployment Phase","text":"Declare: Pick up to 2 friendly Infernal Cohort units to be the targets. Effect: Each target can immediately move up to 3\" but cannot use Charge abilities in the first battle round."},{"name":"Suppressive Bombardment","timing":"Once Per Turn, Your Shooting Phase","text":"Declare: Pick an enemy Infantry unit that had any damage points allocated to it this turn as a result of shooting attacks made by a friendly Tormentor Bombard to be the target. Effect: Until the start of your next turn, subtract 1 from the number of dice rolled when making charge rolls for the target, to a minimum of 1."}],
    enhancements:       [{"name":"Scroll of Petrification","timing":"Once Per Battle, Any Hero Phase","text":"Effect: For the rest of the turn, your general has Ward (2+) but cannot use abilities or be picked to be the target of friendly abilities."},{"name":"Chalice of Darkness","timing":"Once Per Battle, Your Shooting Phase","text":"Declare: Pick a visible enemy unit within 12\" of your general to be the target. Effect: Inflict D3 mortal damage on the target."},{"name":"Talisman of Obsidian","timing":"Passive","text":"Effect: Ignore the first damage point allocated to your general in each phase."},{"name":"Amulet of Burning Hate","timing":"Once Per Battle, Any Combat Phase","text":"Effect: For the rest of the turn, your general's attacks score critical hits on unmodified hit rolls of 5+."}]
  },
];

// Per-ability flavour sentences, keyed by ability name.
// Applied to battleTraits, regimentAbilities, and enhancements during upsert.
const ABILITY_LORE = new Map([
  // ── Castelite Company ─────────────────────────────────────────────────────
  ["The Officar's Order",        "A battle tactic held in reserve is often worth more than one played too early."],
  ["For Sigmar, Charge!",        "The thundering hooves of Freeguild Cavaliers have broken many a heretic line before a sword was drawn."],
  ["Ironweld Discipline",        "Gun crews of the Ironweld Arsenal are trained to fire on command, regardless of the chaos surrounding them."],
  ["Flask of Lethisian Darkwater","Distilled from the dark waters of Lethis, this draught knits wounds with remarkable speed."],
  ["Heirloom Blade",             "Passed down through generations, the steel of this longsword has been sharpened by a hundred years of war."],
  ["Brazier of Holy Flame",      "The sacred flames of Sigmar are said to call the fallen back to duty one final time."],
  ["Glimmering",                 "A fragment of concentrated aethergold whose radiance sharpens the senses and quickens the reflexes."],
  // ── Fusil-Platoon ────────────────────────────────────────────────────────
  ["Fortify Position",           "A disciplined soldier who holds their ground is harder to strike than one who breaks and runs."],
  ["Well Provisioned",           "The quartermasters of the Freeguild ensure every soldier marches with full powder and ball."],
  ["Respected Leader",           "The Wildercorps take their cue from commanders who have proved themselves in the field."],
  ["Adept Tactician",            "A sharp mind can conjure fresh troops where the enemy expects only ruin."],
  ["Shield Bash",                "A well-timed shove from an armoured commander can send even a seasoned warrior stumbling."],
  ["Brace!",                     "The commander's survival instinct is matched only by their ability to interpose themselves between harm and its target."],
  ["Point-Blank Volley",         "At close range, even a pistol becomes a weapon that armies fear."],
  // ── Zenestra's Zealots ────────────────────────────────────────────────────
  ["Shadowy Spymaster / Sudden Ambush", "Zenestra keeps her most dangerous agents close until the moment they are most needed."],
  ["Lady of the Wheel",          "The Matriarch teaches that every death feeds the sacred cycle — even the deaths of her own."],
  ["Fervent Rush",               "Faith is its own momentum; those who believe hard enough find that even walls cannot slow them."],
  ["Fierce Zealots",             "The Steelhelms who march for Zenestra fight with the conviction of true believers, and it shows."],
  ["Devout Commander",           "A commander whose weapon is an extension of their faith strikes harder than one who merely fights for coin."],
  ["Step To It!",                "The Marshal's voice carries the weight of divine authority — even reluctant feet move quickly when they hear it."],
  ["Stand Fast, Comrades",       "Zenestra's blessing turns ordinary soldiers into something that cannot easily be broken."],
  ["Ardent Demand",              "A prayer voiced at the right moment can be more dangerous than any sword."],
  // ── Heartflayer Troupe ───────────────────────────────────────────────────
  ["Blood Rites",                "With each battle round, the blessings of Khaine deepen and the killing grows ever more ecstatic."],
  ["Murderous Epiphany",         "The devout sometimes experience a moment of divine clarity in which all of Khaine's gifts arrive at once."],
  ["Blessing of Khaine",         "To fight under the god's direct attention is to find that wounds seem to matter less than they should."],
  ["Bathed in Blood",            "The Ironscale drinks deep of the fallen, and each death makes her stronger."],
  ["Fuelled by Revenge",         "Blood Stalkers fight hardest when they have cause to — and in war, cause is never far away."],
  ["Flask of Shademist",         "A vaporous draught that dims the vision of enemies and makes the faithful harder to strike."],
  ["Zealous Orator",             "Words of Khaine, spoken in the right tone, can return a warrior's fighting spirit even from the edge of death."],
  // ── Khainite Shadow Coven ────────────────────────────────────────────────
  ["Shadowmasked",               "The Shadowstalkers move between shadows like fish between reeds, impossible to pin down."],
  ["Bleed Them Pale",            "When the moment demands a sudden withdrawal, the Sisters melt away before the enemy can react."],
  ["Murderous Strike",           "Those who charge into the Sisters expecting an easy kill often find their mistake at the end of a blade."],
  ["Shadow Avatar",              "When the Slaughter Queen gives herself to the killing entirely, her blades become extensions of Khaine's own will."],
  ["Frenzied Exhortations",      "A word of encouragement from the High Priestess carries divine authority that sharpens every blow."],
  ["Boiling Blood",              "The Medusa's gaze can heat the blood of a foe until movement becomes agony."],
  ["Bladed Impact",              "The force of a charging blade can punch through armour that would stop a thrown spear."],
  // ── Saga Axeband ─────────────────────────────────────────────────────────
  ["Awaken the Runes",           "The ur-gold runes smouldering in Fyreslayer flesh blaze with the power of Grimnir when called upon in battle."],
  ["Magmic Tunnels",             "The Fyreslayers know passages through the magmic underworld that no enemy can follow — or predict."],
  ["Fyresteel Throwing Axes",    "Hurled with duardin strength, even a short-ranged axe can open a gap in the enemy line."],
  ["Too Stubborn to Die",        "A Fyreslayer who has not yet settled their debts will simply not permit themselves to fall."],
  ["Spirit of Grimnir",          "The Battlesmith's connection to Grimnir's memory runs deep enough to reshape fate itself."],
  ["Horn of Grimnir",            "The war-horn's call reaches even the dead — and sometimes, the dead answer."],
  ["Powerful Presence",          "To stand beside a Battlesmith in full war-chant is to feel the weight of every saga ever told."],
  // ── Akhelian Tide Guard ──────────────────────────────────────────────────
  ["Royal Imperative",           "The King's word falls on the battlefield like a breaking wave — sudden, total, and impossible to ignore."],
  ["The Spear of Asphoren",      "The charging eel-riders of the Tide Guard are the sharpest weapon in the Idoneth arsenal."],
  ["The Shield of Ulchiss",      "Even in retreat, the Tide Guard maintains the discipline that separates them from lesser warriors."],
  ["Dutiful Souls",              "The Namarti fight harder knowing that the King has not forgotten them."],
  ["Shimmering Amulet",          "An enchanted piece of deepkin craftsmanship that turns blows aside as water turns a ship's prow."],
  ["Voltaic Charge",             "The Akhelian Royal Weapons crackle with voltaic energy, discharged with devastating force on impact."],
  ["Soul Stealer",               "This warrior is said to siphon the spirits of fallen foes to sustain them in battle."],
  // ── Soulraid Hunt ────────────────────────────────────────────────────────
  ["Tides of Death",             "The Idoneth fight differently depending on which tide carries them — patient in low water, unstoppable at the flood."],
  ["Way of the Cresting Wave",   "The Thralls who charge on the crest of the tide hit hardest of all."],
  ["Ethersea Predators",         "The eel-cavalry recover quickly after a kill, as though the ethersea itself replenishes their energy."],
  ["Arch-Ritualist",             "Years of practice in the Ritual of the Creeping Mist have made this Soulscryer's power almost unerring."],
  ["Steelshell Armour",          "Armour taken from the great shellcrabs of the deeps, impervious to enchantment as well as blade."],
  ["Mind Flare",                 "A technique that overwhelms the enemy's senses so completely that they can barely raise their weapons to strike."],
  ["Delicious Morsels",          "The cavalry's eels are fed scraps of captured soul — a morsel that keeps them eager and alert."],
  // ── Grundstok Trailblazers ───────────────────────────────────────────────
  ["Gunhauler Escort",           "A skyvessel hovering overhead changes the calculus of any firefight in the Trailblazers' favour."],
  ["Rapid Relocation",           "The Endrinriggers can pick up a unit and redeploy it across the battlefield faster than any ground force could march."],
  ["Propeller Downdraught",      "The Gunhauler's engines create such a powerful downdraft that enemies struggle to advance beneath it."],
  ["Emergency Fuel Injection Pods", "A risky modification that floods the suit's motivators with raw aether-gold, making the wearer terrifyingly fast."],
  ["Prospector and Pioneer",     "This Endrinmaster has an eye for claim-staking that serves equally well on a battlefield."],
  ["Celestium-Burst Bomblets",   "The tiny explosive charges are calibrated to disrupt ward-fields as much as to wound flesh."],
  ["Extraction Fail-Safes",      "A series of aether-cushioned braces that protect against the worst of a rapid retreat."],
  // ── Skyhammer Task Force ─────────────────────────────────────────────────
  ["Ply the Skies",              "The Frigate drops to deck-skimming altitude just long enough for troops to leap onto the enemy."],
  ["Assault Boat",               "A unit delivered by Frigate arrives ready to fight — not winded, not disordered, but absolutely ready."],
  ["Disengage",                  "The Admiral knows that a Frigate surviving to fight again is worth more than one that burns holding a position."],
  ["Masterwrought Armour",       "Each plate has been fitted and refitted by master endrin-wrights until it surpasses anything else in the skies."],
  ["Flask of Vintage Gorogna",   "A legendary brew that Kharadron admirals have long carried against the day of their worst wounds."],
  ["There's No Reward Without Risk", "The Admiral has staked their career on more dangerous charges than this one."],
  ["Leave No Duardin Behind",    "The Admiral counts every soldier under their command, and intends to bring as many home as possible."],
  // ── Glittering Phalanx ───────────────────────────────────────────────────
  ["Facets of War",              "Lumineth commanders adapt their battlefield philosophy between engagements, choosing the approach that light prescribes."],
  ["Power of Hysh",              "Light drawn from the heart of Hysh can sharpen a warrior's aim until they strike true with every blow."],
  ["Arcane Prowess",             "The Cathallar's mastery of Hysh's lore exceeds that of most wizards twice her age."],
  ["Heightened Reflexes",        "When the Lightning Reactions discipline activates, each Lumineth unit fights with preternatural awareness."],
  ["Overwhelming Heat",          "The Cathallar focuses Hysh's light into a burning lance that slows and scorches the chosen foe."],
  ["Protection of Hysh",         "Hysh's light can be made solid enough to turn aside a blade, at least for a moment."],
  ["Waystone",                   "The ancient waystones of the Lumineth allow instantaneous travel for those who know how to use them."],
  ["Speed of Hysh",              "Light is the fastest thing in the Mortal Realms — for a brief moment, the Cathallar lends a unit something of its nature."],
  // ── Hurakan Vanguard ─────────────────────────────────────────────────────
  ["Storm Brewing",              "The Windmage reads the battlefield's invisible currents and chooses which direction to drive their enemies."],
  ["Pulled by the Winds",        "The leeward wind does not ask the Windchargers where they wish to go."],
  ["Gale Force",                 "Attacking with the wind at their back, Hurakan warriors strike with a force that exceeds their natural strength."],
  ["Lifted Debris",              "The Windmage tears rocks and rubble from the earth and hurls them at whatever the wind has designated as its target."],
  ["Roaring Headwind",           "A wall of wind pushes the chosen enemy inexorably toward whatever the Windmage has decided is their doom."],
  ["Scattered to the Winds",     "Each time the Hurricane ability passes, nearby enemies find it harder to hold their positions."],
  ["Wind Whisperer",             "The Windmage can redirect the storm on a whisper, confounding any enemy who thought they understood it."],
  ["Temple Guardians",           "The Hurakan Windmage draws strength from the presence of the Realm's chosen infantry."],
  ["Curved Shots",               "The wind carries the Windmage's arrows around corners and over obstacles, making cover meaningless."],
  // ── Starscale Warhost ────────────────────────────────────────────────────
  ["Beast of the Dark Jungles",  "The Carnosaur's primal instincts make it effective both at killing individuals and terrifying entire formations."],
  ["Predatory Fighters",         "The cold-blooded patience of Saurus warriors makes them brutal opponents in sustained close combat."],
  ["Temple-City Guardians",      "Saurus do not surrender territory the Old Ones have designated as theirs."],
  ["Sotek's Gaze",               "A relic imbued with the Great Serpent's attention, whose gaze is worth an army's worth of soldiers."],
  ["Ancient Strategist",         "The Oldblood's grasp of battlefield positioning reflects ten thousand years of accumulated tactical wisdom."],
  ["Blade of Realities",         "Forged from stone that exists in all realities simultaneously, this weapon strikes through any defence."],
  ["The Wrath of Chotec",        "The sun-god's fury is not rationed — the gauntlet spits fire with an abandon that reflects divine wrath."],
  // ── Sunblooded Prowlers ───────────────────────────────────────────────────
  ["Hidden Hunters / Chameleon Ambush", "The hunters of Huanchi can disappear into any terrain and emerge where least expected."],
  ["Vengeance of Azyr",          "The Seraphon do not merely fight — they enact a design, and the design calls for the enemy's destruction."],
  ["Scaled Aegis",               "The Sunblood's blessing calls upon the Old Ones' protection to shield those who fight in their name."],
  ["Followers of Huanchi",       "The skinks move with a darting speed that makes their shots difficult to anticipate or avoid."],
  ["Instinctive Commander",      "The Sunblood's battlefield instincts can redirect allied units as efficiently as any spoken order."],
  ["Savage Mauling",             "In the grip of a Sunblood, even the most supernaturally protected foe finds their defences overwhelmed."],
  ["Venomite Swarm",             "The Sunblood's swarm of venomites can be directed at a single target with devastating effect."],
  ["Blessed by the Old Ones",    "The Old Ones do not permit a Sunblood to fall while there is still work to be done."],
  // ── Yndrasta's Spearhead ─────────────────────────────────────────────────
  ["Scions of the Storm / Lightning-Strike Arrival", "Yndrasta and her chosen do not march to the battlefield — they fall upon it from the heavens at the moment of their choosing."],
  ["Drive Them Back",            "The warriors under Yndrasta's command have learned to fight on objectives with brutal, implacable efficiency."],
  ["Defend to the Last",         "Standing ground consecrated by Stormcast conviction is harder than it looks for any attacker."],
  ["The Prime Huntress",         "Against a monster, Yndrasta's spear becomes something more than a weapon — it becomes the instrument of a god's will."],
  ["Strike with the Tempest's Rage", "The general who charges first strikes with the momentum of Sigmar's own hammer behind them."],
  ["Dazzling Radiance",          "When Yndrasta descends in a blaze of celestial light, her presence alone is enough to restore the fallen."],
  ["Hawk of the Celestial Skies","When the Celestial Spear is near, the warriors around her find their aim and resolve sharpened."],
  // ── Vigilant Brotherhood ─────────────────────────────────────────────────
  ["Holy Orders — Shield of Azyr","The Lord-Vigilant's blessing wraps a chosen unit in divine protection that can turn even mortal wounds aside."],
  ["Holy Orders — Storm Charge", "Faith is momentum; those who charge in Sigmar's name can sustain it even after running."],
  ["Strike Where Needed",        "The Brotherhood's Retreat is never a rout — it is a deliberate repositioning that catches the enemy off-guard."],
  ["Blaze of Glory",             "The Stormcast do not give up their lives cheaply — even slain, they take their pound of flesh."],
  ["Hallowed Scrolls",           "The Lord-Vigilant carries words of warding so potent that the darkness hesitates before it can strike."],
  ["Morrda's Talon",             "An axe consecrated to the god of endings, its edge cuts through supernatural protection as easily as flesh."],
  ["Quicksilver Draught",        "A few drops of this celestial quicksilver lend preternatural speed to an already formidable warrior."],
  ["Null Pendant",               "The pendant disrupts the concentration of enemies who attempt to contest consecrated ground."],
  // ── Bitterbark Copse ─────────────────────────────────────────────────────
  ["Ley Lines",                  "The ancient spirit-paths of the realmroots heal the Sylvaneth in small ways, constantly."],
  ["Strike and Fade",            "The forest's children do not hold ground — they destroy and vanish, then destroy again."],
  ["Vengeful Spirits of the Land","When the land itself is angered, even contested objectives become dangerous to those who hold them."],
  ["Walkers of the Hidden Paths","The realmroot network is a secret road that leads everywhere and takes no time to travel."],
  ["Regrowth",                   "The Branchwych channels the forest's renewal, healing wounds that should have proved fatal."],
  ["Gnarled Warrior",            "A Treelord is a fortress as much as a warrior — its ancient bark turns aside the worst blows without notice."],
  ["Treesong",                   "A song of Alarielle's realm, sung at the right moment, can set even wooden weapons ablaze with verdant energy."],
  ["Seed of Rebirth",            "The Sylvaneth do not die as other things die — sometimes the seed inside refuses to let go."],
  // ── Spitewing Flight ─────────────────────────────────────────────────────
  ["Target of Vengeance",        "The Flight do not hunt at random — they choose their quarry and do not stop until it falls."],
  ["Song of the Hunt",           "Each death of the quarry increases the fury and precision of the Song that drives the Spitewing Flight."],
  ["Airborne Cohesion",          "The riders of the Spitewing Flight maintain their formation even in the chaos of aerial combat."],
  ["Leaves on the Wind",         "A Spitewing unit can retreat so swiftly it seems to have been blown away by the forest wind."],
  ["Lifebringers",               "The natural vitality of the forest is channelled through the Flight, touching every unit with gentle restoration."],
  ["Head of the Hunt",           "The Archrevenant fights hardest when they can smell the quarry — and right now, they can."],
  ["Zephyrkin",                  "After the killing blow, the Archrevenant leaps away as lightly as a seed on the wind."],
  ["Bold Spirit",                "The Archrevenant's boldness is infectious, inspiring nearby warriors to reach for something more dangerous."],
  ["Cunning Pursuer",            "A pursuer who cannot be outrun is more frightening than any amount of firepower."],
  // ── Fangs of the Blood God ───────────────────────────────────────────────
  ["The Quarry",                 "Karanak does not wait for permission — the moment a quarry is designated, the hunt is already underway."],
  ["Blood-Drenched",             "A unit that has tasted the kill is marked by Khorne himself, and their weapons reflect the god's approval."],
  ["The Scent of Blood",         "The hounds can smell when a creature has been wounded, and they hit harder when they know it."],
  ["Savagery Upon Savagery",     "In the heart of the killing, the hounds' attacks become a blur of fang and claw that cannot be matched."],
  ["Sustained by Gore",          "Karanak feeds as it hunts — the bloodshed is the point, but survival is the result."],
  ["Evasive Hunter",             "The Three-Headed Hound moves too quickly to make a comfortable target for any ranged weapon."],
  ["Killing Pounce",             "When the quarry is within reach, Karanak's charge is something between a leap and a thunderbolt."],
  ["Furious Bites",              "The quarry cannot be safe in combat with Karanak — that is precisely the point."],
  // ── Gore Pilgrims ────────────────────────────────────────────────────────
  ["The Blood Tithe",            "Every death feeds the ocean of blood that Khorne collects, and the Slaughterpriest draws from that ocean."],
  ["Murderlust",                 "The Slaughterpriest's prayer drives warriors to a pace that borders on the supernatural."],
  ["Heads Must Roll",            "At the Slaughterpriest's command, blades bite through armour as though it were paper."],
  ["Favoured of Khorne",         "The Blood God favours the persistent — those who do not stop fighting receive his dark attention."],
  ["Blood-Woken Runes",          "Warriors who have shed blood in the recent fighting carry Khorne's blessing like a shield."],
  ["Resanguination",             "The Slaughterpriest's prayer can knit wounds, provided enough blood is offered in return."],
  ["The Crimson Plate",          "The armour of the most favoured of Khorne's champions is steeped in enough violence to protect the wearer."],
  ["Headhunter",                 "The Slaughterpriest singles out a Hero for personal killing, and nothing short of death can distract them."],
  ["Unholy Flames",              "The unholy fire the Slaughterpriest calls down sharpens mortal weapons with something beyond craft."],
  // ── Fluxblade Coven ──────────────────────────────────────────────────────
  ["Masters of Destiny",         "The Magister has glimpsed the shape of events to come — the dice have already been rolled, they just haven't been revealed."],
  ["Transient Forms",            "Tzeentch does not permit his servants to die easily — he simply changes what form they take."],
  ["Eternal Conflagration",      "The Flamers have been granted a gift: their fire burns hotter than it has any right to."],
  ["Shield of Fate",             "The Magister spins fate around a chosen unit until chance itself becomes a form of armour."],
  ["Daemonic Heart",             "The Magister's daemonic nature means that being in close combat with them is more dangerous than it should be."],
  ["Glimpse the Future",         "A mind that can see even slightly into the future can always find another destiny die waiting."],
  ["Time Slippendant",           "A charm that briefly displaces the target just far enough in time to rob them of the initiative."],
  // ── Tzaangor Warflock ────────────────────────────────────────────────────
  ["Fated Arrival",              "The Enlightened arrive not when logic dictates, but when Tzeentch's plan requires them."],
  ["Predict the Future",         "The Shaman rifles through destiny like a card reader through a deck, choosing what they wish to see."],
  ["Cheat Destiny",              "Tzeentch finds the idea of a battle tactic being used only once philosophically unsound."],
  ["Constant Flux",              "The Warflock's constantly shifting forms are hard to strike cleanly even for those who outmatch them."],
  ["Arcane Ritualists",          "Surrounded by fellow believers, the Shaman's power becomes something even they cannot fully predict."],
  ["Predicted Strike",           "The Shaman has already seen this movement in the pattern — the unit simply enacts what fate has written."],
  ["Fold Reality",               "Space means little to a devoted servant of the Architect of Fate."],
  ["Infernal Gateway",           "A tear in reality that swallows everything nearby and deposits it somewhere far less pleasant."],
  ["Mutagenic Sorcery",          "The Shaman uses the battle itself as raw material for further mutations, to everyone's discomfort."],
  // ── Blades of The Lurid Dream ────────────────────────────────────────────
  ["Temptations of Slaanesh",    "Every failed roll is, to Slaanesh, another invitation the enemy either accepts or suffers for refusing."],
  ["Unparalleled Speed",         "The Blades can strike first in any phase — and usually choose to."],
  ["Locus of Diversion",         "The Shardspeaker's influence is subtle enough that enemies barely notice they are no longer in the fight."],
  ["Sceptre of Domination",      "The Shardspeaker's sceptre strikes opponents with overwhelming sensation, leaving them slow to react."],
  ["Twisted Mirror",             "The Shardspeaker shows an enemy unit a reflection so disturbing that their defensive instincts fail them."],
  ["Cacophonic Choir",           "A sound calibrated to the exact frequency of each listener's particular dread."],
  ["Pendant of Slaanesh",        "A gift from the Prince of Excess that sustains the wearer by feeding on the ambient sensation of battle."],
  // ── Epicurean Revellers ──────────────────────────────────────────────────
  ["Favour Most Fickle",         "Slaanesh's gifts shift as units are destroyed — the survivors are rewarded more extravagantly than the fallen."],
  ["Bringers of Degradation",    "The Daemonettes do not need to be directed to pick the most vulnerable targets — they seek them instinctively."],
  ["Daemonic Onslaught",         "The Thricefold Discord's command can set a unit in motion before the battle has properly begun."],
  ["Twisted Grace",              "The Thricefold Discord moves through a charge with a fluid elegance that most warriors can only aspire to."],
  ["High Courtiers",             "The Thricefold Discord and their Daemonette court protect each other with the ferocity of jealous lovers."],
  ["Excess of Violence",         "When the Revellers truly commit to the killing, their weapons find ways to wound that should be impossible."],
  ["Irresistible Soul-Musk",     "A unit saturated with Slaaneshi essence can be plucked from one location and placed wherever desire demands."],
  // ── Bleak Host ───────────────────────────────────────────────────────────
  ["The Infectious Hosts / Daemonic Summoning", "The Plaguebearers and Blightlords do not arrive all at once — Nurgle believes in pacing the delivery of his gifts."],
  ["Diseased",                   "Every critical hit inflicted by the Host adds to the accumulated suffering that Nurgle lovingly records."],
  ["Nurgle's Embrace",           "Nurgle's disease points are not merely tracked — they are returned to the enemy as gifts of suffering."],
  ["Locus of Fecundity",         "The Spoilpox Scrivener's presence marks a unit as particularly beloved of Nurgle, who restores them accordingly."],
  ["Infested with Wonders",      "Death in Nurgle's service is never without purpose — the fallen leave something behind for the enemy to deal with."],
  ["Summoner of Plaguebearers",  "The Scrivener fills the battlefield with Nurgle's eternal servants as efficiently as it records the dead."],
  ["Gardener of Nurgle",         "An objective touched by Nurgle's gardener becomes part of the garden — and Nurgle protects what is his."],
  ["Pestilent Breath",           "The Scrivener's breath is not merely unpleasant — at close range it becomes genuinely lethal."],
  ["Gift of Febrile Frenzy",     "Nurgle's fever can drive even Plaguebearers to something resembling urgency."],
  // ── Bubonic Cell ─────────────────────────────────────────────────────────
  ["Cycle of Corruption",        "Nurgle's cycle turns whether the enemy wishes it or not, each phase bringing a new and unpleasant gift."],
  ["Corruption of the Land",     "The Rotbringer Sorcerer channels Nurgle's entropy into terrain features, making proximity hazardous."],
  ["Putrefied Ground",           "The ground itself becomes hostile under Nurgle's dominion, dragging at enemy feet and slowing their advance."],
  ["Unnatural Vitality",         "The Rotbringer's connection to Nurgle's endless life cycle makes killing them a frustrating exercise."],
  ["Subcutaneous Suppuration",   "Layers of infection beneath the Sorcerer's skin absorb impacts that would fell a lesser warrior."],
  ["Gaseous Emanation",          "The vapours that arise from the Sorcerer's person have the effect of significantly slowing enemy reflexes."],
  ["Overripe Death's Heads",     "The Sorcerer carries gourds of weaponised contagion, hurled at enemies when the moment suits."],
  // ── Gnawfeast Clawpack ───────────────────────────────────────────────────
  ["The Lurking Gnawhole / Vermintide", "The Clawpack keeps a unit in reserve below the battlefield until the most advantageous moment."],
  ["Warpstone-Laced Bullets",    "A careful application of warpstone to ammunition makes the resulting shot significantly more lethal, if unstable."],
  ["Too Quick to Hit-Hit",       "Clanrats scatter and run so quickly that whatever would hurt them during a retreat simply cannot connect."],
  ["Lead the Seething Horde",    "The Clawlord knows how to deliver reinforcements exactly where they will cause the most chaos."],
  ["Skryre Connections",         "The Clawlord has favoured access to the Warlock Engineers' most excessive and dangerous weapons."],
  ["Warpstone Charm",            "A charm that radiates enough warp-energy to make the wearer genuinely uncomfortable to stand near."],
  ["Cloak of Stitched Victories","Each patch of this cloak was taken from a defeated enemy — there are a great many patches."],
  // ── Warpspark Clawpack ───────────────────────────────────────────────────
  ["Always Three Clawsteps Ahead","The Grey Seer's paranoid genius extends to predicting exactly where the enemy will be — and not being there."],
  ["Warpstone-Laced Armour",     "The Stormfiends' armour, treated with warpstone, becomes briefly impervious when the seer focuses their will upon it."],
  ["Endless Swarm of Rats",      "There are always more Clanrats — always more. For the enemy, this is one of the more demoralising facts of war."],
  ["Skilled Manipulator",        "The Grey Seer survives not by being hard to kill, but by ensuring something else is between them and danger."],
  ["Skitterleap",                "A signature skaven spell that moves the caster with a speed that leaves observers questioning what they saw."],
  ["Cage of Warp Lightning",     "Warp-lightning can be contained and directed, at least in theory — in practice it sometimes escapes."],
  ["Scurry Away",                "When the moment calls for it, even a Grey Seer can move with impressive urgency."],
  // ── Bloodwind Legion ─────────────────────────────────────────────────────
  ["Eye of the Gods",            "Every meaningful deed on the battlefield is noticed by the Chaos Gods, who express their approval immediately."],
  ["The Dread Banner",           "The banner's runes demand acknowledgement from the gods before the battle has properly begun."],
  ["Fierce Conquerors",          "Chaos Warriors who hold an objective hold it with the conviction of those who believe they have already been judged worthy."],
  ["Mark of Khorne",             "The mark of the Blood God grants extra savagery to a charging warrior who already has plenty."],
  ["Mark of Tzeentch",           "The mark allows the Chaos Lord to bend space around a chosen unit, moving it where it is needed."],
  ["Mark of Nurgle",             "The mark of the Plague God thickens the skin of the recipient until blows cannot land cleanly."],
  ["Mark of Slaanesh",           "The mark of the Dark Prince grants preemptive action — the first to strike is often the last to need to."],
  // ── Darkoath Raiders ─────────────────────────────────────────────────────
  ["Oaths of Darkness",          "The Darkoath do not make empty promises — their oaths are binding in ways that go beyond social obligation."],
  ["Rage of Arkhar",             "Arkhar is the name the Darkoath give to the kill-state — the moment when calculation becomes pure violence."],
  ["Fearless Invaders",          "A unit that can retreat and charge in the same turn is one that the enemy can never safely corner."],
  ["Bloodthirsty Blade",         "The Warqueen's axe has been given an edge that goes beyond what any whetstone could achieve."],
  ["Godshadow Talisman",         "A relic taken from a slain god-follower and repurposed as armour — the irony is not lost on the Darkoath."],
  ["Champion of Raids",          "The Warqueen's presence is a rallying point for all nearby Darkoath, spurring them to greater speed."],
  ["Fell Ritualist",             "The Warqueen's dark rituals grant a hand in how fate deals its cards each turn."],
  // ── Carrion Retainers ────────────────────────────────────────────────────
  ["Noble Deeds",                "In the court's delusion, heroic acts are tallied and rewarded — in reality, they involve a great deal more blood."],
  ["Feeding Frenzy",             "When the Heroes of the court truly exert themselves, the serfs around them are driven to new heights of carnage."],
  ["Summon Loyal Subjects",      "The Archregent rewards valour with fresh troops — or, from another perspective, conjures more ghouls."],
  ["Crusading Army",             "In the Archregent's delusion, the court marches on a sacred crusade — the effect on their speed and aggression is genuine."],
  ["Defenders of the Realm",     "The Retainers guard objectives with the zeal of knights protecting a castle gate, however that appears to observers."],
  ["Ulguan Cloak",               "The cloak wraps the Archregent in shadow stolen from Ulgu, rendering them effectively invisible at range."],
  ["Blood-River Chalice",        "A chalice that, in the Archregent's delusion, holds sacred wine — in reality it holds something else entirely."],
  ["Rousing Oration",            "The Archregent's speech is madness, but it moves the court to acts that translate as raw fighting power."],
  ["Crimson Victuals",           "The Archregent's prayer knits wounds while feeding something the recipient probably shouldn't think too hard about."],
  // ── Charnel Watch ────────────────────────────────────────────────────────
  ["Delusions and Madness",      "The Gorewarden's Delusion shifts between battles, and the court shifts with it, becoming something new each time."],
  ["Delusion of the Sentinel",   "Those who believe they are guardians fight harder when they stand on what they perceive as sacred ground."],
  ["Delusion of the Hunter",     "Those who believe they are hunters fight harder when freed to pursue their quarry across the field."],
  ["Almost Lucid",               "In moments of terrifying clarity, the Gorewarden can reshape the Delusion before it fully sets."],
  ["Companion of the Hunt",      "Between the fighting, the Gorewarden moves with the restless energy of someone who cannot stop hunting."],
  ["A Worthy Challenge",         "The Gorewarden issues a challenge in the courtly fashion — considerably more violent than protocol suggests."],
  ["Choirmaster",                "The Gorewarden's voice can be directed at a target to devastating effect, even through the chaos of battle."],
  // ── Cursed Shacklehorde & Slasher Host ───────────────────────────────────
  ["Spectral Procession / Cackling Arrival", "The Shacklehorde keeps units in the spirit realm until the moment they are called upon to emerge."],
  ["Ethereal",                   "The Nighthaunt do not acknowledge wounds from weapons not consecrated against them."],
  ["Discorporate",               "The spirits briefly become more spirit than substance, making them significantly harder to damage."],
  ["Mounting Dread",             "The longer a unit fights beside the Shacklehorde, the less effectively it can hold any territory."],
  ["Unholy Visage",              "A face so terrible that enemies abandon their position simply to get away from it."],
  ["Tales of Horror",            "The Spirit Torment whispers tales of what happened to the last unit that tried to reinforce itself."],
  ["Deathly Possessor",          "The Spirit Torment briefly inhabits a nearby enemy, turning their body against their allies."],
  ["Spectral Howl",              "A sound without a source that reaches the back of the skull and makes it temporarily impossible to run."],
  ["Wave of Terror",             "A charge powerful enough catches the enemy completely off balance, leaving them unable to respond effectively."],
  ["Death Stalkers",             "The Knight of Shrouds selects a target and marks every Nighthaunt weapon for its destruction."],
  ["Chorus of Terror",           "The sound of the Slashers' charge is so terrible that defenders cannot bring themselves to attack cleanly."],
  ["Soulfire Ring",              "The ring feeds on the death the Knight causes, returning something of their lost essence with each kill."],
  ["Cloaked in Shadow",          "The Knight moves between shadows so completely that only one enemy unit at a time can even locate them."],
  ["Beacon of Nagashizzar",      "The beacon's light reaches all Nighthaunt on the battlefield, recalling even the most diminished to completeness."],
  ["Shadow's Edge",              "The sword was sharpened on a whetstone stolen from Nagash's own armoury — and it shows."],
  // ── Kavalos Vanguard ─────────────────────────────────────────────────────
  ["Calculated Feint",           "A retreat that costs nothing is not a retreat — it is a tactical repositioning."],
  ["Kavalos Lance",              "The Liege-Kavalos' command allows cavalry to treat obstacles — including enemy formations — as open ground."],
  ["Feigned Retreat",            "The manoeuvre is precisely what it sounds like, and the enemy falls for it more often than they should."],
  ["Reinforced Constructs",      "The Ossifector's arts can temporarily harden the bone of any construct in the field."],
  ["Mighty Archaeossian",        "Bone exposed to centuries of Nagash's power does not break easily."],
  ["Murderous Blade",            "The Liege-Kavalos' blade has been forged to strike twice where another weapon would strike once."],
  ["Imperious Commander",        "A glance from the Liege-Kavalos is enough to send any construct unit into a faster march."],
  ["Cold Savagery",              "The Liege-Kavalos waits, and then strikes in a way that no amount of readiness can fully anticipate."],
  // ── Mortisan Elite ───────────────────────────────────────────────────────
  ["Heralds of Nagash / Dread Descent", "The Morghast Archai are held in reserve until Nagash deems the moment correct — and Nagash is rarely wrong."],
  ["Relentless Discipline",      "The Mortisan's ability to focus an entire unit's effort into a single, precise moment is the defining feature of Ossiarch warfare."],
  ["Peerless Cohesion",          "Two discipline actions in a single phase is not twice as effective — it is exponentially more so."],
  ["Immaculate Generalship",     "Years of calculating outcomes have given the Ossifector an edge in every activation roll."],
  ["Shard Storm",                "The Ossifector directs fragments of sharpened bone at an enemy unit with the precision of a volley of arrows."],
  ["Mend Constructs",            "Bone can be re-knit — with the Ossifector's expertise, quickly enough to matter."],
  ["Lode of Saturation",         "The Ossifector's body has absorbed so much Shyishan realmstone that it blunts any weapon that strikes them."],
  ["Helm of Tyranny",            "The Helm broadcasts a Nagashian authority that erodes the resolve of nearby enemies."],
  // ── Tithe-Reaper Echelon ─────────────────────────────────────────────────
  ["Reserve Contingent / Contingent Arrival", "The Mortek Guard are patient — they wait until the battle is already engaged before claiming their portion."],
  ["Ossiarch Commands",          "Nagash's commands are finite and cannot be squandered — the Soulreaper doles them out with calculated care."],
  ["Impenetrable Ranks",         "Mortek Guard who lock shields are among the hardest things in the Mortal Realms to damage."],
  ["Re-Form Ranks",              "A unit that breaks free of combat and re-dresses its ranks can present a fresh front to a tiring enemy."],
  ["Empower Nadirite Weapons",   "Nadirite, treated with the right cantrip, cuts through armour that would turn most other weapons."],
  ["Unstoppable Commander",      "The Soulreaper's will, transmitted to a Mortek Guard unit, adds urgency to an otherwise implacable march."],
  ["Murderous Drive",            "The Soulreaper's scythe does not merely cut — it cuts through armour and into the architecture of reality."],
  ["Marrowpact",                 "The Soulreaper draws sustenance from the damage they cause, a grim self-sufficiency that unnerves the enemy."],
  // ── Bloodcrave Hunt ──────────────────────────────────────────────────────
  ["Death's Descent / Swoop Down","The Vargheists do not arrive with the others — they wait until the prey is committed, then fall from above."],
  ["The Hunger",                 "Vampires heal through killing — it is a simple, brutal, and effective approach to longevity."],
  ["Endless Legions",            "The Vampire Lord does not fight with a fixed number of soldiers — they fight until the enemy runs out of willingness to continue."],
  ["Ruinous Chargers",           "The Blood Knights do not stop at the enemy line — they ride through it, leaving damage behind them."],
  ["Grave-Sand Shard",           "A shard from the sarcophagus of a Mortarch, carrying the weight of ancient undead authority."],
  ["Cloud of Bats",              "The Vampire Lord disperses into bats and reconstitutes elsewhere, leaving pursuers grasping at air."],
  ["Aura of Night",              "The Vampire Lord bends the shadows around themselves until ranged attackers cannot find a clean angle."],
  ["Spirit Gale",                "A wave of spectral energy that the Vampire Lord sends across the entire battlefield to torment the living."],
  // ── Deathrattle Tomb Host ────────────────────────────────────────────────
  ["The Unquiet Dead / The Rising Dead", "The Deathrattle Skeletons are held below until the Wight King decides the right moment to deploy them."],
  ["Aura of Antiquity",          "The presence of ancient undead corrodes the weapons of living enemies — time, given form, eating at their steel."],
  ["Overwhelming Hordes",        "Numbers, when directed properly, become their own form of advantage even against better individual fighters."],
  ["Deathmarch",                 "The Wight King's ancient command words quicken the pace of the dead, who march without exhaustion or hesitation."],
  ["Shyishan Blade",             "Forged in Shyish and quenched in grave-water, the Wight King's tomb blade has a particular hunger for the living."],
  ["Stolen Animus",              "The Wight King siphons vitality from enemies as they strike, using it to sustain themselves in battle."],
  ["Propelled by Hate",          "The Wight King's contempt for the living can be channelled into an almost physical force that drives allied charges."],
  ["Soul-Drain Pendant",         "A relic that reaches into the enemy and extracts just enough vitality to leave them dangerously slow."],
  // ── Bad Moon Madmob ──────────────────────────────────────────────────────
  ["Under the Light of the Bad Moon", "When the Bad Moon shines on a territory, the Gitz within it gain strength that shouldn't be possible."],
  ["Squigalanche",               "A second wave of Squig Hoppers is always in reserve — because the first wave may arrive wherever it likes, and often does."],
  ["The Lunatic Hordes",         "Moonclan Stabbas can always be topped back up — there are always more Stabbas in a Loonboss's warband."],
  ["The Hand of Gork",           "Gork reaches down and moves a unit wherever it needs to go. Gork doesn't ask permission."],
  ["Fight Another Day",          "The Loonboss has survived this long by knowing when to temporarily stop being where the enemy is."],
  ["The Clammy Cowl",            "The cowl radiates an aura of wrongness that makes enemies deeply uncomfortable with aiming at its wearer."],
  ["Hallucinogenic Fungus Brew", "The Loonboss has consumed quantities of hallucinogenic fungi that would be lethal to anything but a grot."],
  ["Nightshade Mushroom",        "A mushroom so toxic that its mere proximity makes targeting enemies with shooting all but impossible."],
  // ── Snarlpack Huntaz ─────────────────────────────────────────────────────
  ["Fast as Frazzlegit",         "The Snarlpack runs fast enough that retreating from combat barely slows them down."],
  ["Flankin' Force",             "The Snarlboss keeps troops in hand until the enemy commits, then deploys them where they'll hurt most."],
  ["Frazzleboom",                "The Sunsteala Wheela goes out with a bang — and the bang is directed at whoever was standing near it."],
  ["Kunnin' as a Snarlfang",     "The Snarlboss's cunning is contagious — nearby units fight with a sharpness that suggests they've learned something."],
  ["Glare of Frazzlegit",        "The Snarlboss has perfected a look that makes enemies wonder if they should be somewhere else."],
  ["Sunsteala Shard",            "A fragment of stolen sun-magic that makes nearby Gitz impossible to shoot at from a distance."],
  ["Devious Backstabba",         "The Snarlboss specialises in letting a Hero think they are winning, then proving them wrong."],
  // ── Ironjawz Bigmob ──────────────────────────────────────────────────────
  ["'Ere We Go!",                "The Brutes arrive late, as orruks often do — the timing is rarely as accidental as it appears."],
  ["Mighty Destroyers",          "The Megaboss's bellow can set a unit moving even in the middle of another phase, which is bad news for whoever they're moving toward."],
  ["Natural Disaster",           "A charge that goes especially well encourages the Ironjawz to swing harder, which is saying something."],
  ["A Proper Ruckus",            "When the Megaboss decides it's time for everyone to move, everyone moves."],
  ["Amberbone Whetstone",        "A whetstone made from amberbone that gives the Megaboss's weapons an edge that doesn't dull."],
  ["Trophy Skulls",              "The Megaboss has collected enough skulls to command contested ground through sheer intimidation."],
  ["Armour of Gork",             "Gork made this armour himself, or so the Megaboss claims — it does seem unusually hard to damage them."],
  ["Mega Bossy",                 "The Megaboss's charge sets the tempo for every unit nearby — and the tempo is very fast."],
  // ── Swampskulka Gang ─────────────────────────────────────────────────────
  ["Kruleboyz Waaagh!",          "When the Killaboss decides it's time to commit, both they and their most favoured unit become very dangerous to be near."],
  ["Noisy Racket",               "The Murknob with Belcha-banna produces such a hideous noise in the first battle round that enemy aim suffers."],
  ["Covered in Mud",             "A unit daubed in the Kruleboyz's special swamp mud is effectively invisible until it chooses not to be."],
  ["Egomaniak",                  "The Killaboss's ego is so enormous that nearby allies absorb hits meant for them without being asked."],
  ["Mork's Eye Pebble",          "Mork's gaze, focused through the pebble, makes it briefly impossible for ranged attackers to find their marks."],
  ["Kunnin' Plan",               "The Killaboss has a plan — the plan is terrible — the plan somehow works."],
  ["Eye-Biter Ash",              "Ground into the face of a nearby enemy, the ash has a lasting effect on their ability to see who is hitting them."],
  // ── Scrapglutt ───────────────────────────────────────────────────────────
  ["Better Late Than Never / Let's Get Stuck In", "The Ironguts hold themselves back until the third battle round, then arrive with enough enthusiasm to compensate."],
  ["It's a Hard Life",           "The Gnoblars' suffering is a useful resource, though they would prefer it weren't."],
  ["Frenzied Artillery",         "A Scraplauncher that charges fires its Companion weapons with the frenzied energy of an impact."],
  ["Savage Instincts",           "The general's fighting style is infectious — nearby units finish their attacks and immediately want to do more."],
  ["Nasty Trap",                 "The enemy unit receives a token that makes any movement they attempt potentially quite costly."],
  ["Massive Bulk",               "The general's size exceeds what the Ogor physique normally produces — which is already considerable."],
  ["Veteran Hunter",             "The general has fought this type of enemy before and knows exactly where the armour is thinnest."],
  // ── Tyrant's Bellow ──────────────────────────────────────────────────────
  ["On the Mawpath / Bellowing Arrival", "Three units of Ogors hold off until the third battle round, then arrive at the battlefield edge with considerable momentum."],
  ["Pulverising Girth",          "An Ogor unit that charges carries enough momentum that nearby enemies are damaged on impact."],
  ["Bred for Toughness",         "The Ironblaster and Mournfang Pack are built to take punishment in ways that defy the normal rules of survival."],
  ["Longstrider",                "The Tyrant's stride has always been longer than average — it has been measured."],
  ["Flask of Stonehorn Blood",   "A draught that temporarily grants the toughness of the creature whose blood it contains."],
  ["Booming Roar",               "The Tyrant's roar is loud enough at close range to be measurable as a hazard to enemy aim."],
  ["Blubbergrub",                "A healing foodstuff that Ogors carry for when the battle has damaged them more than usual."],
  // ── Wallsmasher Stomp ─────────────────────────────────────────────────────
  ["Bullstomper",                "The largest of the Mancrushers takes the field as a Hero — which is to say they are slightly more aware of what is happening."],
  ["Bellowing Roar",             "The Gargant's roar is not merely loud — it strikes at enemy confidence in a way that reduces their accuracy."],
  ["'Grab Those Rocks and Chuck 'Em!'", "The Bullstomper issues an order that the Mob understands immediately, as it aligns with their existing preferences."],
  ["Foe-Chompers",               "The Stuff 'Em In Me Bag ability feeds the Gargants in a way that keeps them active longer than they should be."],
  ["Earth-Shaking Charge",       "A Gargant charge sends shockwaves through the ground that the enemy's feet can feel before they see it coming."],
  ["Monstrously Tough",          "The Bullstomper has absorbed more damage over their lifetime than most fortifications."],
  ["Extra-Big Bag",              "A larger bag means more things go in the bag — this is straightforward."],
  ["Lanky Git",                  "The Bullstomper's legs are unusually long even by Gargant standards, which is saying something."],
  ["Furiously Territorial",      "The Bullstomper becomes angrier when enemies contest objectives it has decided are its own."],
  // ── Helforge Host ────────────────────────────────────────────────────────
  ["Harness Daemonic Power",     "The War Despot channels Hashut's dark industry through the Host each turn, directing its power where it is needed."],
  ["Grinding Advance",           "The Infernal Cohort can be pushed into motion before the battle begins, gaining early positioning at a cost."],
  ["Suppressive Bombardment",    "A unit struck by the Tormentor Bombard's shells is left unable to function as a coherent charging force."],
  ["Scroll of Petrification",    "The scroll turns the War Despot to iron — impervious to damage, but also to action."],
  ["Chalice of Darkness",        "A vessel of focused darkness that can be hurled at an enemy unit to inflict direct damage."],
  ["Talisman of Obsidian",       "A stone from Hashut's forge that absorbs the first blow of each engagement without transmitting it to the wearer."],
  ["Amulet of Burning Hate",     "Hashut's hatred, crystallised into a wearable object, sharpens the wearer's strikes to critical precision."],
]);

function enrichAbilities(arr) {
  return arr.map(ab => ({
    ...ab,
    lore_text: ABILITY_LORE.get(ab.name) ?? null,
  }));
}

function run(opts = {}) {
  initDb();
  const db = getDb();

  // Clear all existing spearhead values
  db.prepare('UPDATE warscrolls SET spearhead = NULL').run();

  let totalUpdated = 0;
  const missed = [];
  // Track which warscroll IDs have been assigned which spearhead names, to build pipe-separated lists
  const assigned = new Map(); // warscroll_id → Set of spearhead names

  const tryMatch = (factionSlug, unitName) => {
    const slugs = Array.isArray(factionSlug) ? factionSlug : [factionSlug];
    const nameLower = unitName.toLowerCase().trim();
    // DB strips hyphens during scraping, so also try hyphen-stripped version
    const nameNorm = nameLower.replace(/-/g, '');

    for (const slug of slugs) {
      // Exact match
      let row = db.prepare(
        'SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) = ?'
      ).get(slug, nameLower)
      || db.prepare(
        'SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) = ?'
      ).get(slug, nameNorm);

      if (!row) {
        // Prefix match
        row = db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ? LIMIT 1"
        ).get(slug, `${nameLower}%`)
        || db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ? LIMIT 1"
        ).get(slug, `${nameNorm}%`);
      }

      if (!row) {
        // Substring match — also try DB-side hyphen stripping
        row = db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(name) LIKE ? LIMIT 1"
        ).get(slug, `%${nameLower}%`)
        || db.prepare(
          "SELECT id, name FROM warscrolls WHERE faction_slug = ? AND LOWER(REPLACE(name,'-','')) LIKE ? LIMIT 1"
        ).get(slug, `%${nameNorm}%`);
      }

      if (row) return row;
    }
    return null;
  };

  for (const sp of SPEARHEADS) {
    console.log(`\n${sp.name} (${Array.isArray(sp.faction) ? sp.faction.join('/') : sp.faction}):`);
    // Track matched unit names to avoid double-counting for multi-size units (e.g. Flesh Hounds appearing twice)
    const matchedUnitNames = new Set();

    for (const unitName of sp.units) {
      const row = tryMatch(sp.faction, unitName);
      if (row) {
        if (!assigned.has(row.id)) assigned.set(row.id, new Set());
        assigned.get(row.id).add(sp.name);
        if (!matchedUnitNames.has(row.name)) {
          console.log(`  ✓ ${row.name}`);
          matchedUnitNames.add(row.name);
          totalUpdated++;
        }
      } else {
        console.log(`  ✗ NOT FOUND: "${unitName}"`);
        missed.push({ spearhead: sp.name, slug: Array.isArray(sp.faction) ? sp.faction[0] : sp.faction, unitName });
      }
    }
  }

  // Write back: pipe-separated spearhead names for units in multiple spearheads
  for (const [id, names] of assigned.entries()) {
    const value = [...names].join('|');
    db.prepare('UPDATE warscrolls SET spearhead = ? WHERE id = ?').run(value, id);
  }

  // Upsert spearhead rules into the spearheads table
  const upsert = db.prepare(`
    INSERT INTO spearheads (name, faction_slug, lore_text, battle_traits, regiment_abilities, enhancements)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      faction_slug = excluded.faction_slug,
      lore_text = excluded.lore_text,
      battle_traits = excluded.battle_traits,
      regiment_abilities = excluded.regiment_abilities,
      enhancements = excluded.enhancements
  `);
  for (const sp of SPEARHEADS) {
    const slug = Array.isArray(sp.faction) ? sp.faction[0] : sp.faction;
    upsert.run(
      sp.name,
      slug,
      sp.lore || null,
      JSON.stringify(enrichAbilities(sp.battleTraits      || [])),
      JSON.stringify(enrichAbilities(sp.regimentAbilities || [])),
      JSON.stringify(enrichAbilities(sp.enhancements      || [])),
    );
  }

  if (opts.closeDb !== false && require.main === module) db.close();

  console.log(`\n✅ Updated ${totalUpdated} unique DB units across ${SPEARHEADS.length} spearheads.`);
  if (missed.length) {
    console.log(`⚠️  ${missed.length} unit(s) not found in DB:`);
    missed.forEach(m => console.log(`   [${m.spearhead}] "${m.unitName}"`));
  }
}

if (require.main === module) run();
module.exports = { run };
