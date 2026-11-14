// Path to Glory battlepack data for the Ravaged Coast and Blighted Wilds
// campaigns — generated from Wahapedia (aos4/the-rules/ravaged-coast and
// /blighted-wilds) with backend/scrapeRules.js's parseAbilityBlock and
// backend/phaseKey.js. Regenerate rather than hand-edit.
//   paths: same shape as PathToGloryWizard's PATHS (4 ranks x 2 options),
//     plus hero (true = a HERO Path, eligible for your general) and source.
//   heroic_traits / artefacts / spell_lore / prayer_lore: same shape as
//     /api/faction-rules items (bullets as a JSON string) — the battlepack's
//     universal tables, usable by any faction in that campaign.
//   battle_abilities: in-battle rules, grouped by section, for reference.
const BATTLEPACKS = {
 "ravaged-coast": {
  "key": "ravaged-coast",
  "name": "Ravaged Coast",
  "paths": [
   {
    "key": "rc-brawler",
    "name": "Path of the Brawler",
    "restricted": "HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Dependable Assault",
        "timing": "Your Charge Phase",
        "effect": "If this unit is not in combat and has not used a RUN or RETREAT ability this turn, it can move a distance of 7\". This unit can pass through the combat ranges of enemy units but it must end that move within 1 2\" of a visible enemy unit. If it does so, this unit bas charged.",
        "bullets": [],
        "keywords": "CORE, MOVE, CHARGE",
        "lore_text": "Though not the swiftest, this warrior will reach the front in due time.",
        "phase_key": "movement,charge"
       },
       {
        "name": "First To The Fight",
        "timing": "Passive",
        "effect": "Add 2 to charge rolls for this unit.",
        "bullets": [],
        "lore_text": "First to strike, first to triumph: that is this hero's mantra.",
        "phase_key": "charge"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Veteran's Eye",
        "timing": "Passive",
        "effect": "Add 1 to hit rolls for this unit's combat attacks.",
        "bullets": [],
        "lore_text": "This warrior has a knack for knowing just where to strike.",
        "phase_key": "combat"
       },
       {
        "name": "Powerful Bruiser",
        "timing": "Passive",
        "effect": "Add 1 to wound rolls for this unit's combat attacks.",
        "bullets": [],
        "lore_text": "Each blow from this battle-hardened hero leaves a mark.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Reckless Brutality",
        "timing": "Any Combat Phase",
        "effect": "For the rest of the phase:",
        "bullets": [
         "Subtract 1 from save rolls for this unit.",
         "Add 2 to the Rend characteristic of this unit's weapons."
        ],
        "lore_text": "Offence is the best form of attack - so sayeth this warrior, anyway.",
        "phase_key": "combat"
       },
       {
        "name": "Deathdealer",
        "timing": "End of Any Turn",
        "declare": "Pick each enemy unit in combat with this unit to be the targets.",
        "effect": "Roll a D3 for each target. On a 2+, inflict an amount of mortal damage on the target equal to the roll.",
        "bullets": [],
        "lore_text": "Every hewing strike from this warrior can fell beasts or sunder serried ranks.",
        "phase_key": "end of turn"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Devastating Strength",
        "timing": "Deployment Phase",
        "effect": "Pick 1 of this unit's melee weapons. Add 1 to the Damage characteristic of that weapon for the rest of the battle.",
        "bullets": [],
        "lore_text": "This warrior's raw physical power is the stuff of legend.",
        "phase_key": "deployment"
       },
       {
        "name": "Flurry Of Attacks",
        "timing": "Passive",
        "effect": "Add 2 to the Attacks characteristic of this unit's melee weapons.",
        "bullets": [],
        "lore_text": "This hero wades through foes in a blur of thrusts, chops and slashes.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-ruler",
    "name": "Path of the Ruler",
    "restricted": "HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Lead By Example",
        "timing": "Any Charge Phase",
        "declare": "If this unit charged this phase, pick another friendly unit wholly within 12\" of it to be the target.",
        "effect": "You can re-roll charge rolls for the target for the rest of the phase.",
        "bullets": [],
        "lore_text": "This hero knows their place: leading from the front.",
        "phase_key": "charge"
       },
       {
        "name": "Inspirational",
        "timing": "Any Hero Phase",
        "declare": "Pick a friendly non-HERO unit wholly within 12\" of this unit to the target.",
        "effect": "Roll 2D6. Add the roll to the target's control score for the rest of the turn.",
        "bullets": [],
        "lore_text": "This hero exhorts their warriors to achieve greatness.",
        "phase_key": "hero phase"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Stand Firm",
        "timing": "Any Combat Phase",
        "declare": "Pick this unit and a friendly non-HERO unit within its combat range to be the targets.",
        "effect": "For the rest of the tmn, if either target uses the 'All-out Defence' command, the other target can also use the same command in the same phase and no command points are spent to use the command a second time.",
        "bullets": [],
        "lore_text": "None would willingly disgrace themselves before this leader.",
        "phase_key": "hero phase,combat"
       },
       {
        "name": "Magnificent Fury",
        "timing": "Passive",
        "effect": "While this unit is in combat, add 1 to wound rolls for combat attacks made by other friendly units while they are within this unit's combat range.",
        "bullets": [],
        "lore_text": "This hero's righteous blows inspire those around them.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Drillmaster",
        "timing": "Any Combat Phase",
        "declare": "If this unit is in combat, pick another friendly unit within its combat range to be the target.",
        "effect": "Pick 1 of the target's melee weapons. Add 1 to the Rend characteristic of that weapon for the rest of the turn.",
        "bullets": [],
        "lore_text": "This hero expects the best from those they command.",
        "phase_key": "combat"
       },
       {
        "name": "Martial Exemplar",
        "timing": "End of Any Turn",
        "declare": "If this unit destroyed an enemy unit this turn, pick another visible friendly unit wholly within 12\" of this unit to be the target.",
        "effect": "Until the end of the next battle round, add 1 to the Attacks characteristic of the target's melee weapons.",
        "bullets": [],
        "lore_text": "Warriors cannot help but seek to emulate this hero's warlike example.",
        "phase_key": "combat,end of turn"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "'To Arms!'",
        "timing": "Once Per Turn (Army), Your Hero Phase",
        "declare": "If this unit is in combat, pick another friendly unit wholly within 12\" of this unit that is in combat to be the target.",
        "effect": "The target can immediately use a FIGHT ability as if it were the combat phase.",
        "bullets": [],
        "lore_text": "The loyalty this leader inspires sees their warriors rush to aid them.",
        "phase_key": "hero phase,combat"
       },
       {
        "name": "Decisive Strike",
        "timing": "Enemy Combat Phase",
        "declare": "If this unit is not in combat, pick each friendly unit within its combat range that is not in combat to be the targets.",
        "effect": "Each target can move D6\". The targets can pass through the combat ranges of enemy units and can end that move in combat.",
        "bullets": [],
        "lore_text": "A single, stirring moment of heroism can change the course of a battle.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-duellist",
    "name": "Path of the Duellist",
    "restricted": "INFANTRY HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Deflection",
        "timing": "Passive",
        "effect": "Weapon abilities that apply on a critical hit have no effect on attacks that target this unit.",
        "bullets": [],
        "lore_text": "This warrior easily turns aside meaningful blows."
       },
       {
        "name": "Take The Lead",
        "timing": "Passive",
        "effect": "While this unit is in combat with an enemy un it that has STRIKE-FIRST, this unit has STRIKE-FIRST.",
        "bullets": [],
        "lore_text": "Victory demands bold strikes.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Deadly Riposte",
        "timing": "Reaction: Opponent declared a FIGHT ability that targeted this unit",
        "effect": "If this unit has not used a FIGHT ability this phase, until the end of the phase:",
        "bullets": [
         "Each time your opponent makes an unmodified hit roll of l for a combat attack that targets this unit, after the FIGHT ability has been resolved, inflict an amount of mortal damage on the attacking unit equal to the Damage characteristic of the weapon used for that attack.",
         "Subtract 1 from hit rolls for this unit's attacks."
        ],
        "lore_text": "One warrior can slay ten, if they have honed themselves sufficiently.",
        "phase_key": "combat"
       },
       {
        "name": "Precise Thrust",
        "timing": "Passive",
        "effect": "Ward rolls cannot be made for enemy units while they are in combat with this unit.",
        "bullets": [],
        "lore_text": "So pinpoint are this warrior's blows that even magical defences can be pierced."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Deadly Riposte",
        "timing": "Reaction: Opponent declared a FIGHT ability that targeted this unit",
        "effect": "If this unit has not used a FIGHT ability this phase, roll a dice. On a 4+, this unit can immediately use a FIGHT ability but all of its attacks must target that enemy unit.",
        "bullets": [],
        "lore_text": "There is no barrier between thought and action for this hero.",
        "phase_key": "combat"
       },
       {
        "name": "Precise Thrust",
        "timing": "Passive",
        "effect": "This unit's combat attacks score critical hits on unmodified hit rolls of 5+.",
        "bullets": [],
        "lore_text": "Each blow from this warrior is, in its own way, a work of art.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Apotheosis Of Steel",
        "timing": "Passive",
        "effect": "Each time a combat attack that targets this unit does not score a successful hit, inflict 1 mortal damage on the attacking unit after the FIGHT ability has been resolved.",
        "bullets": [],
        "lore_text": "For lesser warriors, merely to enter this hero's radius is a death seutence.",
        "phase_key": "combat"
       },
       {
        "name": "To Surpass All",
        "timing": "Passive",
        "effect": "The first time an enemy unit is destroyed by an ATTACK ability used by this unit, this unit has WARD (6+) for the rest of the battle. Add 1 to ward rolls for this unit for each additional enemy unit destroyed by an ATTACK ability used by this unit, to a maximum of 2.",
        "bullets": [],
        "lore_text": "This warrior seeks nothing less than perfection.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-warmonger",
    "name": "Path of the Warmonger",
    "restricted": "INFANTRY HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Lost In The Melee",
        "timing": "Passive",
        "effect": "This unit cannot targeted by shooting attacks while it is in combat.",
        "bullets": [],
        "lore_text": "This fervent warrior is almost impossible to trade.",
        "phase_key": "shooting"
       },
       {
        "name": "Caked In Gore",
        "timing": "Passive",
        "effect": "Add 10 to this unit's control score while it is in combat.",
        "bullets": [],
        "lore_text": "This warrior's natural place is right in the thick of it."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Quick Fire",
        "timing": "Any Shooting Phase",
        "declare": "If this unit is in combat, pick 1 of its ranged weapons to be the target weapon and pick an enemy unit in combat with it to be the target unit.",
        "effect": "Roll a dice. On a 3+, the target weapon has Shoot in Combat for the rest of the phase but all attacks made with that weapon this phase must target the target unit.",
        "bullets": [],
        "lore_text": "This warrior has trained themselves to fire volleys at terribly close range.",
        "phase_key": "shooting"
       },
       {
        "name": "Gifted Gladiator",
        "timing": "Reaction: You declared the 'All-out Attack' or 'All-out Defence' command for this unit",
        "effect": "If this unit is in combat, roll a dice. On a 3+, no command points are spent to use that command.",
        "bullets": [],
        "lore_text": "This warrior's natural place is right in the thick of it.",
        "phase_key": "hero phase"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Blindsiding Barrage",
        "timing": "Passive",
        "effect": "If this unit charged this battle round, it has STRIKE-FIRST for the rest of the battle round.",
        "bullets": [],
        "lore_text": "Heads start flying the moment this warrior reaches the melee.",
        "phase_key": "combat"
       },
       {
        "name": "Bringer Of Carnage",
        "timing": "Any Combat Phase",
        "declare": "If this unit is in combat, pick 1 of its non-Companion melee weapons to be the target.",
        "effect": "Roll a dice. On a 1-4, add 1 to the target's Damage characteristic for the rest of the phase. On a 5+, add 2 to the target's Damage characteristic for the rest of the phase.",
        "bullets": [],
        "lore_text": "Bloody ruin is always this warrior's end goal.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "To Fight Eternal",
        "timing": "End of Any Turn",
        "effect": "If this unit used a FIGHT ability this turn, add 1 to the Attacks characteristic of its non-Companion melee weapons for the rest of the battle.",
        "bullets": [],
        "lore_text": "Battle itself seems to be this warrior's meat and wine.",
        "phase_key": "combat,end of turn"
       },
       {
        "name": "Slice And Dice",
        "timing": "Any Combat Phase",
        "effect": "Roll a dice for each enemy unit in combat with this unit. For each 2+, add 1 to the Rend characteristic of this unit's melee weapons for the rest of the phase.",
        "bullets": [],
        "lore_text": "It appears as if this warrior can shatter enemy armour through will alone.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-sorcerer",
    "name": "Path of the Sorcerer",
    "restricted": "WIZARD HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Focused Sorcery",
        "timing": "Passive",
        "effect": "The first time this unit uses a non-SUMMON SPELL ability each phase, add 2 to the casting roll for that spell.",
        "bullets": [],
        "lore_text": "This wizard has a knack for the fundaments of magic.",
        "phase_key": "hero phase"
       },
       {
        "name": "Power Disruptor",
        "timing": "Passive",
        "effect": "Add 1 to unbinding rolls for this unit. In addition, this unit can use the 'Unbind' ability if the enemy WIZARD casting the spell is anywhere on the battlefield instead of within 30\" of this unit.",
        "bullets": [],
        "lore_text": "This sorcerer has trained themselves to face down hostile magics.",
        "phase_key": "hero phase"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Overspilling Power",
        "timing": "End of Your Turn",
        "effect": "This unit can use a SPELL ability as if it were your hero phase.",
        "bullets": [],
        "lore_text": "This hero uses any excuse to shape the arcane.",
        "phase_key": "hero phase"
       },
       {
        "name": "Honed Talent",
        "timing": "Passive",
        "effect": "If the casting roll for this unit is a double, add 1 to this unit's power level for the rest of the phase.",
        "bullets": [],
        "lore_text": "Like a sudden magma spout, this sorcerer's ability carz catch even them by surprise.",
        "phase_key": "hero phase"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Arcane Onslaught",
        "timing": "Passive",
        "effect": "Each time this unit uses an UNLIMITED SPELL ability, you can pick up to 2 eligible units to be the targets instead of 1.",
        "bullets": [],
        "lore_text": "Power springs wild and nigh on unbidden from this mage's fingers."
       },
       {
        "name": "Arcane Avalanche",
        "timing": "Once Per Turn, Your Hero Phase",
        "effect": "The next spell cast by this unit this phase 1 cannot be unbound.",
        "bullets": [],
        "lore_text": "What ward or counterspell can disrupt this mage's arts?",
        "phase_key": "hero phase"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Arcane Onslaught",
        "timing": "End of Your Turn",
        "effect": "If a unit was destroyed by a SPELL ability used by this unit this turn, add 1 to this unit's power level for the rest of the battle.",
        "bullets": [],
        "lore_text": "The havoc wreaked by this hero's spells only fuels their desire for power."
       },
       {
        "name": "Arcane Avalanche",
        "timing": "Reaction: Opponent declared a FIGHT ability that targeted this unit",
        "effect": "Until the end of the next turn:",
        "bullets": [
         "Subtract 1 from hit rolls and wound rolls for attacks that target this unit.",
         "Subtract 1 from the Rend characteristic and Damage characteristic of weapons used for attacks that target this unit.",
         "Subtract 1 from this unit's power level, to a minimum of 0."
        ],
        "lore_text": "Burning gales of force encircle this mage, protecting them from harm.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-conjurer",
    "name": "Path of the Conjurer",
    "restricted": "WIZARD HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Ancient Technique",
        "timing": "Once Per Turn, Reaction: You declared a SUMMON SPELL ability for this unit",
        "effect": "Add 1 to the casting roll for that spell.",
        "bullets": [],
        "lore_text": "This hero has not forgotten the elder practices of magic.",
        "phase_key": "hero phase"
       },
       {
        "name": "Master Banisher",
        "timing": "Passive",
        "effect": "Add 2 to banishment rolls for this unit.",
        "bullets": [],
        "lore_text": "At a word from this wizard, spell constructs burst apart.",
        "phase_key": "hero phase"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Expert Summoner",
        "timing": "Passive",
        "effect": "Add 3\" to the distance that MANIFESTATIONS summoned by this unit can be set up wholly within.",
        "bullets": [],
        "lore_text": "This mage's will extends far indeed."
       },
       {
        "name": "Total Banishment",
        "timing": "Once Per Battle (Army), End of Battle Round",
        "effect": "Each enemy MANIFESTATION on the battlefield is banished and removed from play.",
        "bullets": [],
        "lore_text": "With a strident command, this mage nullifies hostile magics.",
        "phase_key": "hero phase,end of turn"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Disrupting Presence",
        "timing": "Passive",
        "effect": "Each time an enemy unit within 12\" of this unit uses a SUMMON SPELL ability, subtract 2 from the casting roll for that spell.",
        "bullets": [],
        "lore_text": "This wizard's fiery hatred of hostile magic incinerates spellcraft.",
        "phase_key": "hero phase"
       },
       {
        "name": "Castigator",
        "timing": "Your Movement Phase",
        "declare": "Pick an enemy MANIFESTATION within 6\" of this unit to be the target, then make a banishment roll of 2D6.",
        "effect": "If the banishment roll equals or exceeds the banishment value listed on the MANIFESTATION's warscroll, inflict D3 mortal damage on the unit that summoned it. Then, the target is banished and removed from play.",
        "bullets": [],
        "keywords": "BANISH",
        "lore_text": "Those who would summon living spells must face this mage's ire.",
        "phase_key": "hero phase,movement"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Silence The Aether",
        "timing": "Passive",
        "effect": "Enemy units within 12\" of this unit cannot use SUMMON SPELL abilities.",
        "bullets": [],
        "lore_text": "No pernicious magic dares show itself in this master mage's presence."
       },
       {
        "name": "Supreme Conjurer",
        "timing": "Once Per Battle (Army), Reaction: You declared a SUMMON SPELL abillity for this unit",
        "effect": "Change the casting roll for that spell to a value of 8 that cannot be modified. In addition, set up the MANIFESTATION on the battlefield wholly within 6\" of this unit and visible to them.",
        "bullets": [],
        "lore_text": "There is no secret of invocation beyond this mage's ken.",
        "phase_key": "hero phase"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-zealot",
    "name": "Path of the Zealot",
    "restricted": "PRIEST HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Paragon Of Faith",
        "timing": "Deployment Phase",
        "effect": "Give this unit D3 ritual points.",
        "bullets": [],
        "lore_text": "This warrior's zeal shines like a beacon, gleaming either with light or with more sinister power.",
        "phase_key": "deployment"
       },
       {
        "name": "Scourging Castigation",
        "timing": "Your Movement Phase",
        "declare": "Pick an enemy PRIEST within 12\" of this unit to be the target.",
        "effect": "Roll a D3. Remove a number of ritual points from the target equal to the roll, to a minimum of I.",
        "bullets": [],
        "lore_text": "No false dogma shall be preached in this warrior's presence.",
        "phase_key": "movement"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Firebrand Exhortations",
        "timing": "Your Hero Phase",
        "effect": "Add 1 to chanting rolls for this unit.",
        "bullets": [],
        "lore_text": "This wrathful preacher shapes the realms with each chant.",
        "phase_key": "hero phase"
       },
       {
        "name": "Refute The False",
        "timing": "Passive",
        "effect": "Subtract 1 from chanting rolls for enemy units while they are within 12\" of this unit.",
        "bullets": [],
        "lore_text": "This hero's raw zeal can smother an enemy's link to their gods."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Smite False Prophets",
        "timing": "Passive",
        "effect": "Each time this unit chants a prayer and the chanting roll is 12+, inflict 1 mortal damage on each enemy PRIEST and enemy WIZARD on the battlefield.",
        "bullets": [],
        "lore_text": "Those who invoke unworthy gods near this hero must fear divine wrath."
       },
       {
        "name": "Assured Devotion",
        "timing": "Passive",
        "effect": "Each time an unmodified chanting roll for an enemy PRIEST is 1, give this unit D3 ritual points.",
        "bullets": [],
        "lore_text": "The stammered prayers of rival preachers only deepens this hero's faith."
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Resurrecting Touch",
        "timing": "Your Hero Phase",
        "declare": "Pick a friendly INFANTRY HERO that has been destroyed to be the target, then make a chanting roll of D6.",
        "effect": "Set up a replacement unit identical to the target wholly within 3\" of this unit.",
        "bullets": [],
        "keywords": "PRAYER",
        "lore_text": "This priest can channel divine favour even into the fallen.",
        "casting_value": "7",
        "phase_key": "hero phase"
       },
       {
        "name": "Grand Armageddon",
        "timing": "Once Per Battle, Your Shooting Phase",
        "declare": "Pick each objective on the battlefield to be the targets.",
        "effect": "Roll a D6 for each target. Inflict an amount of mortal damage on each unit contesting the target equal to the roll.",
        "bullets": [],
        "lore_text": "Many have predicted the end of days. This hero's preaching, though, is more accurate than most ...",
        "phase_key": "shooting"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-invoker",
    "name": "Path of the Invoker",
    "restricted": "PRIEST HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Heard By The Divine",
        "timing": "Once Per Turn, Reaction: You dedared a SUMMON PRAYER ability for this unit",
        "effect": "Add 1 to the chanting roll for that prayer.",
        "bullets": [],
        "lore_text": "Constructs of godly power heed this cleric's command."
       },
       {
        "name": "Sacred Aura",
        "timing": "Passive",
        "effect": "Each time a prayer chanted by this unit is answered, Heal (1) each friendly unit within 3\" of it.",
        "bullets": [],
        "lore_text": "This hero's homilies refresh body and soul."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Test Their Faith",
        "timing": "Passive",
        "effect": "Each time this unit banishes an enemy MANIFESTATION, inflict D6 mortal damage on the unit that summoned it.",
        "bullets": [],
        "lore_text": "Those who would conjure false works before this hero are soon punished.",
        "phase_key": "hero phase"
       },
       {
        "name": "Incandescent Faith",
        "timing": "Passive",
        "effect": "Add 6\" to the distance that MANIFESTATIONS summoned by this unit can be set up wholly within.",
        "bullets": [],
        "lore_text": "This priest 's zeal is an inferno, always seeking to spread."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Restore The Faithful",
        "timing": "Once Per Battle, End of Any Turn",
        "effect": "Heal (D6) each friendly unit on the battlefield.",
        "bullets": [],
        "lore_text": "This preacher's faith is so intense that it seems to banish all ills.",
        "phase_key": "end of turn"
       },
       {
        "name": "Resolute Conviction",
        "timing": "End of Any Turn",
        "declare": "Pick a MANIFESTATION within thjs unit's combat range to be the target.",
        "effect": "Roll a dice. On a 3+, the target is banished and removed from play.",
        "bullets": [],
        "lore_text": "And this hero did say, 'Let this foul manifestation leave my sight', and it was so.",
        "phase_key": "hero phase,end of turn"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Sparking Divinity",
        "timing": "Passive",
        "effect": "Each time this unit uses a SUMMON PRAYER ability and the prayer is answered, add 1 to this unit's power level for the rest of the battle.",
        "bullets": [],
        "lore_text": "The more this hero proselytises, the deeper their faith becomes."
       },
       {
        "name": "Dominant Dogma",
        "timing": "Once Per Turn, Reaction: You declared a SUMMON PRAYER ability for this unit",
        "effect": "If the prayer is answered, after resolving effect, instead of resetting this unit's and points total to 0, reset it to half the chanting value of the prayer, rounding up.",
        "bullets": [],
        "lore_text": "When this preacher hits their stride, there seems to be no stopping them."
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-colossus",
    "name": "Path of the Colossus",
    "restricted": "MONSTER HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Alpha Beast",
        "timing": "Passive",
        "effect": "Subtract 2 from the control scores of enemy MONSTERS while they are in combat with this unit.",
        "bullets": [],
        "lore_text": "Others monsters shy away from this intimidating colossus and its master."
       },
       {
        "name": "Thundering Bulk",
        "timing": "Passive",
        "effect": "Each time this unit uses the 'Power Through' command, inflict an additional 1 mortal damage on the target.",
        "bullets": [],
        "lore_text": "Sheer momentum is this beast's greatest weapon."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Bestial Bellows",
        "timing": "Passive",
        "effect": "The effects of the 'Champion', 'Standard Bearer' and 'Musician' abilities do not apply to enemy units while they are within 12\" of this unit.",
        "bullets": [],
        "lore_text": "A roar from this creature soon shakes a regiment's courage."
       },
       {
        "name": "Wrestle Down",
        "timing": "Passive",
        "effect": "This unit cannot be picked to be the target of enemy RAMPAGE abilities.",
        "bullets": [],
        "lore_text": "Monsters that would contest this beast are soon put in their place."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Volcanic Charge",
        "timing": "Once Per Battle, Any Charge Phase",
        "effect": "If this unit is not in combat and has not used a RUN or RETREAT ability this turn, it can move a distance of 9\". This unit can pass through the combat ranges of enemy units but it must end that move within 1 2\" of a visible enemy unit. If it does so, this unit has charged.",
        "bullets": [],
        "keywords": "CORE, MOVE, CHARGE",
        "lore_text": "Like an onrushing pyroclastic flow, this beast is nearly inescapable.",
        "phase_key": "movement,charge"
       },
       {
        "name": "Animal Fury",
        "timing": "Passive",
        "effect": "Add 1 to the Attacks characteristic of this unit's weapons. This also affects weapons that have the Companion weapon ability.",
        "bullets": [],
        "lore_text": "Spending so much time with their violent mount has rubbed off on the rider.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Pulverising Blows",
        "timing": "Any Combat Phase",
        "declare": "Pick a visible enemy unit in combat with this unit to be the target.",
        "effect": "Roll a dice. On a 3+, subtract 1 from save rolls for the target for the rest of the phase.",
        "bullets": [],
        "keywords": "RAMPAGE",
        "lore_text": "Armour shatters and crumbles beneath the strikes of monster and master.",
        "phase_key": "combat"
       },
       {
        "name": "Obliterating Impact",
        "timing": "Any Combat Phase",
        "declare": "If this unit charged this turn, pick a visible enemy unit within 1\" of it to be the target.",
        "effect": "Roll a number of dice equal to this unit's Health characteristic minus the number of damage points it has. For each 4+, inflict 1 mortal damage on the target.",
        "bullets": [],
        "keywords": "RAMPAGE",
        "lore_text": "When this monster slams into the fray, its foes are left broken and bleeding.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-dragoon",
    "name": "Path of the Dragoon",
    "restricted": "CAVALRY HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Fleet Steed",
        "timing": "Passive",
        "effect": "Each time this unit uses a MOVE ability, add 2\" to the distance it can move.",
        "bullets": [],
        "lore_text": "This warrior's mount is amongst the swiftest of its breed."
       },
       {
        "name": "Deft Assault",
        "timing": "Enemy Combat Phase",
        "effect": "If this unit is not in combat, it can move up to 3\". It can move into combat.",
        "bullets": [],
        "lore_text": "A beast that can navigate rocky mountains can swiftly find its way through a melee.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Saddlemaster",
        "timing": "Passive",
        "effect": "This unit can use SHOOT abilities even if it used a RUN ability in the same turn.",
        "bullets": [],
        "lore_text": "This warrior's mount is amongst the swiftest of its breed.",
        "phase_key": "movement"
       },
       {
        "name": "Ashplain Runner",
        "timing": "Passive",
        "effect": "Add 1 to charge rolls for this unit.",
        "bullets": [],
        "lore_text": "This hero charges across the scorching plains without a lick of fear.",
        "phase_key": "charge"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Follow-Up Strike",
        "timing": "Once Per Battle, Any Combat Phase",
        "effect": "If this unit did not charge this turn, add 1 to the Damage characteristic of this unit's melee weapons for the rest of the turn.",
        "bullets": [],
        "lore_text": "Aqshy's anger sees this daring hero fight on even after the first charge.",
        "phase_key": "combat"
       },
       {
        "name": "From Doom's Jaws",
        "timing": "Passive",
        "effect": "No mortal damage is inflicted on this unit by RETREAT abilities.",
        "bullets": [],
        "lore_text": "Hit-and-run warfare is second nature to this hero.",
        "phase_key": "movement"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Daring Deathblow",
        "timing": "Passive",
        "effect": "If this unit is destroyed by a combat attack, roll 12 dice. For each 5+, inflict 1 mortal damage on the attacking unit after the FIGHT ability bas been resolved.",
        "bullets": [],
        "lore_text": "This dauntless cavalier will fight even as death's claws reach out to claim them.",
        "phase_key": "combat"
       },
       {
        "name": "Shock And Awe",
        "timing": "Any Combat Phase",
        "declare": "If this unit charged this turn, pick an enemy unit in combat with it to be the target.",
        "effect": "This unit can immediately use a SHOOT ability as if it were your shooting phase, but it must target that enemy unit. This unit's ranged weapons have Shoot in Combat this phase.",
        "bullets": [],
        "lore_text": "A decisive strike with every possible weapon - that is the way to win.",
        "phase_key": "shooting,combat"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-guardian",
    "name": "Path of the Guardian",
    "restricted": "non-HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Beck And Call",
        "timing": "Reaction: You declared the 'All-out Attack' command for an INFANTRY HERO within this unit's combat range",
        "effect": "Add 1 to hit rolls for this unit's attacks for the rest of the phase.",
        "bullets": [],
        "lore_text": "These warriors follow their commander in all things - aggression included.",
        "phase_key": "combat"
       },
       {
        "name": "Hidden In The Ranks",
        "timing": "Passive",
        "effect": "Subtract 1 from wound rolls for ranged attacks that target friendly non-MONSTER HEROES while they are within this unit's combat range.",
        "bullets": [],
        "lore_text": "There are few safer places than surrounded by these burly warriors.",
        "phase_key": "shooting"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Cut-Throat Fighters",
        "timing": "Enemy Combat Phase",
        "declare": "If this unit did not charge this turn, pick an enemy unit within its combat range to be the target.",
        "effect": "Roll a dice for each model in this unit within 3\" of the target. For each 6, inflict 1 mortal damage on the target.",
        "bullets": [],
        "lore_text": "These warriors discount no tactics when defending their charge.",
        "phase_key": "combat"
       },
       {
        "name": "Bold And Stalwart",
        "timing": "Passive",
        "effect": "While a friendly non-MONSTER HERO is within this unit's combat range, add 5 to this unit's control score.",
        "bullets": [],
        "lore_text": "These chosen souls embody the honour of their commander."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Fortified Defences",
        "timing": "Passive",
        "effect": "If this unit has not used a MOVE ability or made a pile-in move this turn, add 1 to save rolls for this unit.",
        "bullets": [],
        "lore_text": "Few can shift these warriors once they have readied themselves.",
        "phase_key": "combat"
       },
       {
        "name": "Devoted Lifewards",
        "timing": "Passive",
        "effect": "Friendly INFANTRY HEROES have WARD (5+) while they are wholly within this unit's combat range.",
        "bullets": [],
        "lore_text": "These warriors are utterly stalwart in their duties of protection.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Cast Them Back",
        "timing": "Passive",
        "effect": "Enemy INFANTRY units cannot contest objectives while they are in combat with this unit.",
        "bullets": [],
        "lore_text": "It is easier to tear down a fortress with fingertips than wrest a position fromthese warriors."
       },
       {
        "name": "Strike As One",
        "timing": "Once Per Battle, Any Combat Phase",
        "declare": "Pick this unit and a friendly non-MONSTER HERO within this unit's combat range to be the targets.",
        "effect": "The targets have STRIKE-FIRST for the rest of the turn.",
        "bullets": [],
        "lore_text": "These warriors and their charge fight as a single dreadful force.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-bulwark",
    "name": "Path of the Bulwark",
    "restricted": "non-HERO INFANTRY only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Indomitable Defenders",
        "timing": "Passive",
        "effect": "While each model in this unit is contesting an objective that is not wholly within enemy territory, add 5 to this unit's control score.",
        "bullets": [],
        "lore_text": "Let the enemy try to seize what these warriors have laid claim to!"
       },
       {
        "name": "Anti-Cavalry Tactics",
        "timing": "Passive",
        "effect": "While each model in this unit is contesting an objective wholly within friendly territory, this unit's melee weapons have Anti-charge (+1 Rend).",
        "bullets": [],
        "lore_text": "These warriors are well versed in seeing off outriders.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Thin The Ranks",
        "timing": "Once Per Battle, Any Combat Phase",
        "declare": "If this unit did not charge this turn, pick an enemy unit in combat with it to be the target.",
        "effect": "Roll a dice. If the roll is less than the number of models in the target unit, inflict an amount of mortal damage on the target equal to the roll.",
        "bullets": [],
        "lore_text": "Proper tactics can break the back of even the greatest horde.",
        "phase_key": "combat"
       },
       {
        "name": "Defence Above All",
        "timing": "Any Combat Phase",
        "effect": "If this unit is wholly within friendly territory, roll a dice. On a 4+, for the rest of the turn:",
        "bullets": [
         "Add 1 to save rolls for this unit.",
         "This unit has STRIKE-LAST."
        ],
        "lore_text": "For these warriors, killing is secondary to enduring.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Fortress Formation",
        "timing": "Passive",
        "effect": "While each model in this unit is contesting an objective that is not within enemy territory, enemy models that have a lower Health characteristic than this unit cannot contest objectives while they are in combat with this unit.",
        "bullets": [],
        "lore_text": "Weaker enemies have no hope of dislodging these proud souls.",
        "phase_key": "combat"
       },
       {
        "name": "Territorial",
        "timing": "Passive",
        "effect": "While this unit is contesting an objective within friendly territory, enemy units cannot be set up within 12\" of this unit.",
        "bullets": [],
        "lore_text": "These warriors know their territory like the backs of their hands.",
        "phase_key": "deployment"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Fight Fire With Fire",
        "timing": "Passive",
        "effect": "If this unit is in combat with an enemy unit that uses the 'All-out Attack' command, add 1 to save rolls for this unit for the rest of the turn.",
        "bullets": [],
        "lore_text": "Weaker enemies have no hope of dislodging these proud souls.",
        "phase_key": "combat"
       },
       {
        "name": "Made Of Stone",
        "timing": "Passive",
        "effect": "While this unit is contesting an objective within friendly territory, the Charge (+1 Damage) weapon ability has no effect on attacks that target this unit.",
        "bullets": [],
        "lore_text": "Blows that could crack a volcano seem to hardly trouble these souls.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-cavalier",
    "name": "Path of the Cavalier",
    "restricted": "non-HERO CAVALRY only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Hot-Blooded Charge",
        "timing": "Passive",
        "effect": "Add 1 to charge rolls for this unit while it is wholly within enemy territory.",
        "bullets": [],
        "lore_text": "Whooping with glee, these riders barrel into deepest danger.",
        "phase_key": "charge"
       },
       {
        "name": "Terrifying Stampede",
        "timing": "Passive",
        "effect": "If this unit charged this turn, add 5 to its control score for the rest of the turn.",
        "bullets": [],
        "lore_text": "The charge of these cavaliers can put any foe to flight."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Hardy Steeds",
        "timing": "Reaction: You declared a RUN ability for this unit",
        "effect": "Instead of making a run roll as part of that RUN ability, you can use a value of 6 for the roll that cannot be modified. In addition, this unit cannot use CHARGE abilities for the rest of the turn.",
        "bullets": [],
        "lore_text": "The mounts of these riders are capable of enduring for great distances.",
        "phase_key": "movement"
       },
       {
        "name": "Shrouded By Smoke",
        "timing": "Passive",
        "effect": "Subtract 1 from wound rolls for shooting attacks that target this unit.",
        "bullets": [],
        "lore_text": "These cavaliers are expert at using smoke-drifts to obscure their rides.",
        "phase_key": "shooting"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Staggering Charge",
        "timing": "Any Combat Phase",
        "declare": "If this unit charged this turn and is contesting an objective you do not control, pick an enemy unit in combat with this unit to be the target.",
        "effect": "The target has STRIKE-LAST for the rest of the turn.",
        "bullets": [],
        "lore_text": "The mounts of these riders are capable of enduring for great distances.",
        "phase_key": "combat"
       },
       {
        "name": "Sunder Their Spears",
        "timing": "Passive",
        "effect": "The Anti-charge (+1 Rend) weapon ability has no effect on attacks that target this unit.",
        "bullets": [],
        "lore_text": "Such is the force of these cavaliers that even pike-walls cannot stop them.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Furious Mounts",
        "timing": "Passive",
        "effect": "While this unit is in enemy territory, this unit's Companion weapons have Crit (Mortal).",
        "bullets": [],
        "lore_text": "The burning war-fury of these riders has spread to their loyal steeds."
       },
       {
        "name": "Ride To Glory",
        "timing": "Once Per Battle, Any Combat Phase",
        "effect": "If this unit is contesting an objective you do not control, this unit can use 2 FIGHT abilities this phase. After the first is used, however, this unit has STRIKE-LAST for the rest of the turn.",
        "bullets": [],
        "lore_text": "These warriors lust for renown, and overrunning the foe is a surefire source.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-pack",
    "name": "Path of the Pack",
    "restricted": "BEAST only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Tireless Pursuers",
        "timing": "Passive",
        "effect": "Each time this unit uses a MOVE ability, add 2\" to the distance it can move.",
        "bullets": [],
        "lore_text": "These beasts will run their prey down for leagues."
       },
       {
        "name": "Powerful Legs",
        "timing": "Passive",
        "effect": "Add 1 to charge rolls for this unit.",
        "bullets": [],
        "lore_text": "These beasts suddenly close on the foe at great pace.",
        "phase_key": "charge"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Hunter's Instinct",
        "timing": "Passive",
        "effect": "Add 1 to hit rolls for this unit's combat attacks. This ability also affects Companion weapons.",
        "bullets": [],
        "lore_text": "A measured savagery marks these creatures' attacks.",
        "phase_key": "combat"
       },
       {
        "name": "Sparking Claws",
        "timing": "Passive",
        "bullets": [],
        "lore_text": "Flames and cinders leap from jaws and talons."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Scattering Pack",
        "timing": "Passive",
        "effect": "This unit cannot be picked to be the target of enemy RAMPAGE abilities.",
        "bullets": [],
        "lore_text": "These beasts dart and dive around monstrous attacks."
       },
       {
        "name": "Weakening Blow",
        "timing": "Any Combat Phase",
        "declare": "Pick an enemy MONSTER in combat with this unit to be the target.",
        "effect": "Roll a dice. On a 3+, for the rest of the turn, the target must apply the effects of its 'Battle Damaged' ability regardless of how many damage points it has.",
        "bullets": [],
        "lore_text": "Through primal instinct, these beasts know how to slay larger foes by way of many minor wounds.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Natural Armour",
        "timing": "Passive",
        "effect": "This unit has WARD (5+).",
        "bullets": [],
        "lore_text": "Flesh becomes like basalt or mutates under the touch of warping powers.",
        "phase_key": "combat"
       },
       {
        "name": "Frothing",
        "timing": "Passive",
        "effect": "Ignore the first damage point that would be allocated to this unit in each phase.",
        "bullets": [],
        "lore_text": "An unnatural rabidity has seed these beasts as they roam near the Gnaw."
       }
      ]
     }
    ],
    "hero": false,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-behemoth",
    "name": "Path of the Behemoth",
    "restricted": "non-HERO MONSTER only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Lumbering Titan",
        "timing": "Passive",
        "effect": "Add 1 to this unit's Health characteristic.",
        "bullets": [],
        "lore_text": "Telling wounds seem to slough off this beast's hide.",
        "phase_key": "combat"
       },
       {
        "name": "Mind Set Aflame",
        "timing": "Passive",
        "effect": "The 'Battle Damaged' ability has no effect on this unit.",
        "bullets": [],
        "lore_text": "Even the greatest pains cannot blunt this beast's ferocity."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Burning Bloodlust",
        "timing": "Reaction: Opponent declared the 'All-out Attack' command for a unit in combat with this unit",
        "effect": "Add 1 to hit rolls for this unit's attacks for the rest of the turn. This ability also affects Companion weapons.",
        "bullets": [],
        "lore_text": "This monster meets violence with wrathful violence.",
        "phase_key": "combat"
       },
       {
        "name": "Agile Onslaught",
        "timing": "Passive",
        "effect": "You can re-roll charge rolls for this unit.",
        "bullets": [],
        "lore_text": "Once the scent of prey meets its nostrils, this beast is indefatigable.",
        "phase_key": "charge"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Unnatural Resilience",
        "timing": "Passive",
        "effect": "This unit has WARD (6+).",
        "bullets": [],
        "lore_text": "Perhaps the source of this beast's toughness is best left unknown.",
        "phase_key": "combat"
       },
       {
        "name": "Furnace Of Fury",
        "timing": "Passive",
        "effect": "This unit can use 2 different RAMPAGE abilities in the same turn.",
        "bullets": [],
        "lore_text": "Within this monster burns a savage, unquenchable flame."
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Unrestrained Aggression",
        "timing": "Passive",
        "effect": "This unit's weapons have Crit (2 Hits). This ability also affects Companion weapons.",
        "bullets": [],
        "lore_text": "When the blood starts flying, this beast is nigh on unstoppable."
       },
       {
        "name": "Obsidian Bones",
        "timing": "Passive",
        "effect": "Add 1 to save rolls for this unit.",
        "bullets": [],
        "lore_text": "Swords shatter against this transfigured beast's limbs.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Ravaged Coast"
   },
   {
    "key": "rc-artillerist",
    "name": "Path of the Artillerist",
    "restricted": "WAR MACHINE only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Surly Crew",
        "timing": "Passive",
        "effect": "Add 1 to the Attacks characteristic of this unit's melee weapons.",
        "bullets": [],
        "lore_text": "These crewmen are eager to defend their beloved war engine.",
        "phase_key": "combat"
       },
       {
        "name": "Mobile Construction",
        "timing": "Passive",
        "effect": "Each time this unit uses a MOVE ability, add 2\" to the distance it can move.",
        "bullets": [],
        "lore_text": "This war engine's chassis was built for manoeuvrability."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "King Of The Hill",
        "timing": "Passive",
        "effect": "While this unit is contesting an objective, enemy INFANTRY and CAVALRY units cannot contest that objective.",
        "bullets": [],
        "lore_text": "Few can force back this bulky construct."
       },
       {
        "name": "Veteran Spotter",
        "timing": "Passive",
        "effect": "This unit can ignore the effects of the 'Guarded Hero' ability when picking targets for its shooting attacks.",
        "bullets": [],
        "lore_text": "The keen eye of a crew's spotter can single out a foe from great distance.",
        "phase_key": "shooting"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Trained Hands",
        "timing": "Once Per Battle, Reaction: You declared a SHOOT ability for this unit",
        "effect": "Immediately after the SHOOT ability has been resolved, this unit can use a second SHOOT ability.",
        "bullets": [],
        "lore_text": "The crew of this machine can load and fire at an astounding rate.",
        "phase_key": "shooting"
       },
       {
        "name": "Blackpowder Munitions",
        "timing": "Once Per Battle, Reaction: You declared a SHOOT ability for this unit",
        "effect": "This unit's ranged weapons have Crit (Mortal) for the rest of the phase.",
        "bullets": [],
        "lore_text": "Ammunition infused with blackpowder makes for quite the bang.",
        "phase_key": "shooting"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Perfect Trajectory",
        "timing": "Passive",
        "effect": "While this unit is contesting an objective that you control, add 6\" to the Range characteristic of its ranged weapons.",
        "bullets": [],
        "lore_text": "Judging arcs and parabolas is not the flashiest warrior skill, but' it has its uses."
       },
       {
        "name": "Quick Repositioning",
        "timing": "Any Combat Phase",
        "declare": "Pick an enemy unit that charged this turn and is in combat with this unit to be the target.",
        "effect": "This unit can move a distance up to its Move characteristic. It can move through the combat ranges of enemy units but cannot end that move within an enemy unit's combat range. Then, roll a dice. On a 3+, the target cannot make a pile-in move for the rest of the phase.",
        "bullets": [],
        "lore_text": "This engine is light enough to evade death's Jaws.",
        "phase_key": "movement,combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Ravaged Coast"
   }
  ],
  "heroic_traits": [
   {
    "name": "Words Of Blazing Power",
    "timing": "Passive",
    "effect": "Add 1 to casting rolls for this unit when it casts a spell from the Lore of Magmic Fury.",
    "bullets": "[]",
    "lore_text": "Each incantation this hero speaks crackles with the arcane spirit of Aqshy.",
    "source_note": "Ravaged Coast: Hallmarks of Hel's Claw",
    "phase_key": "hero phase"
   },
   {
    "name": "Spiteful Spark",
    "timing": "Any Combat Phase",
    "declare": "Pick each enemy unit in combat with this unit to be the targets.",
    "effect": "Roll a dice for each target. On a 2+, inflict 1 mortal damage on the target.",
    "bullets": "[]",
    "lore_text": "This hero's contempt manifests as bright sparks that can scorch an unwary foe.",
    "source_note": "Ravaged Coast: Hallmarks of Hel's Claw",
    "phase_key": "combat"
   },
   {
    "name": "Tainted Radiance",
    "timing": "Passive",
    "effect": "Subtract 3 from the control scores of enemy units while they are in combat with this unit.",
    "bullets": "[]",
    "lore_text": "Time spent fighting near the Gnaw has touched this hero's soul. Something in their bearing sees enemies recoil from them.",
    "source_note": "Ravaged Coast: Hallmarks of Hel's Claw"
   },
   {
    "name": "Brash And Angry",
    "timing": "Once Per Battle, Reaction: Opponent declared a CHARGE ability for an enemy unit within 9\" of this unit",
    "effect": "If this unit is not in combat, it can immediately use a CHARGE ability as if it were your charge phase, but it must end the move within 1 2\" of that enemy unit. If it does so, this unit has charged and that enemy unit's CHARGE ability has no effect. This unit has STRIKE-LAST for the rest of the turn.",
    "bullets": "[]",
    "lore_text": "The wrathful nature of Aqshy has settled in this warrior's soul and can bubble up at any moment.",
    "source_note": "Ravaged Coast: Hallmarks of Hel's Claw",
    "phase_key": "charge"
   },
   {
    "name": "Forthright Fury",
    "timing": "Passive",
    "effect": "When making run rolls for friendly units wholly within 12\" of this unit, if you roll a 1-3, you can use a value of 4 instead.",
    "bullets": "[]",
    "lore_text": "The burning impetus that fills this hero soon spreads to their warriors.",
    "source_note": "Ravaged Coast: Hallmarks of Hel's Claw",
    "phase_key": "movement"
   },
   {
    "name": "Live On The Edge",
    "timing": "Passive",
    "effect": "This unit has WARD (4+) against damage points inflicted by SHOOT abilities.",
    "bullets": "[]",
    "lore_text": "Having braved many a lava-spitting geyser, this warrior has a sixth sense for sudden and unforeseen danger.",
    "source_note": "Ravaged Coast: Hallmarks of Hel's Claw",
    "phase_key": "combat"
   }
  ],
  "artefacts": [
   {
    "name": "Axe Of Boiling Wrath",
    "timing": "Deployment Phase",
    "declare": "Pick an enemy HERO to be the target.",
    "effect": "For the rest of the battle, while this unit is in combat with the target:",
    "bullets": "[\"All of this unit's attacks must target that HERO.\",\"Add 1 to wound rolls for this unit's combat attacks.\",\"This unit's melee weapons have Anti-HERO (+1 rend).\"]",
    "lore_text": "Made from obsidian, this blade constantly hisses with anger. It will cleave a neck with ease but is prone to stoking grudges to an inferno.",
    "source_note": "Ravaged Coast: Aqshian Artefacts",
    "phase_key": "combat,deployment"
   },
   {
    "name": "Sparking Shield",
    "timing": "Passive",
    "effect": "Each time an unmodified hit roll for a combat attack that targets this unit is 1 , inflict 1 mortal damage on the attacking unit after the FIGHT ability has been resolved.",
    "bullets": "[]",
    "lore_text": "Thie emberstone crystals embedded within this shield spark when struck, causing the assailant to be consumed by flame.",
    "source_note": "Ravaged Coast: Aqshian Artefacts",
    "phase_key": "combat"
   },
   {
    "name": "Cremated Pendant",
    "timing": "Passive",
    "effect": "Add double the current battle round number to this unit's control score.",
    "bullets": "[]",
    "lore_text": "The ashes of entire clans are fused together to form this pendant. It is a firm reminder to defend that which was once lost.",
    "source_note": "Ravaged Coast: Aqshian Artefacts"
   },
   {
    "name": "Warpmock Blade",
    "timing": "Deployment Phase",
    "declare": "Pick 1 of this unit's non-Companion melee weapons to be the target weapon.",
    "effect": "For the rest of the battle, while this unit is in combat, in addition to its own weapon abilities, the target weapon has all of the weapon abilities that the melee weapons used by enemy units in combat with it have, except for the Companion weapon ability.",
    "bullets": "[]",
    "lore_text": "Recovered from a darksome cave, this blade was once wielded by a Skaven assassin and can copy the quirks of its prey's own weapons.",
    "source_note": "Ravaged Coast: Aqshian Artefacts",
    "phase_key": "deployment"
   },
   {
    "name": "Magmic Key",
    "timing": "Once Per Battle, Your Movement Phase",
    "effect": "Remove this unit from the battlefield and set it up again on the battlefield more than 9\" from all enemy units.",
    "bullets": "[]",
    "keywords": "CORE, MOVE",
    "lore_text": "The power in this glowing relic can be used to open magmic tunnels through the shifting earth of Aqshy.",
    "source_note": "Ravaged Coast: Aqshian Artefacts",
    "phase_key": "movement"
   },
   {
    "name": "Carved Magmadroth Horn",
    "timing": "Passive",
    "effect": "If a friendly unit wholly within 12\" of this unit uses the 'Rally' command, you can make 3 additional rally rolls of D6.",
    "bullets": "[]",
    "lore_text": "A blast from this blackened horn echoes like a roaring Magmadroth, putting steel into allied spines.",
    "source_note": "Ravaged Coast: Aqshian Artefacts"
   }
  ],
  "spell_lore": [
   {
    "name": "Pyroclastic Repression",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible enemy unit within 18\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, subtract 2 from run rolls and charge rolls for the target, to a minimum of 0.",
    "bullets": "[]",
    "keywords": "SPELL, UNLIMITED",
    "lore_text": "Waves of burning force emanate from the caster, suppressing the foe with each step they take.",
    "casting_value": "6",
    "source_note": "Ravaged Coast: Lore of Magmic Fury",
    "phase_key": "hero phase,movement,charge"
   },
   {
    "name": "Flaming Blades Of Ruin",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible unit wholly within 12\" of them and not in combat to be the target, then make a casting roll of 2D6.",
    "effect": "Inflict D3 mortal damage on the target. Add 1 to the Attacks characteristic of the target's melee weapons for the rest of the turn.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "The caster imbues the blades of nearby warriors with bright tongues of fire - a fire that refuses to be tamed.",
    "casting_value": "7",
    "source_note": "Ravaged Coast: Lore of Magmic Fury",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Volcanic Blast",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible terrain feature within 12\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Inflict D3 mortal damage on each unit (friendly and enemy) within 3\" of the target.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "At the caster's bidding, magmic power and scalding plumes of lava erupt from the earth.",
    "casting_value": "7",
    "source_note": "Ravaged Coast: Lore of Magmic Fury",
    "phase_key": "hero phase"
   },
   {
    "name": "Fulminating Flame-Cage",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick an enemy unit within 18\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, each time your opponent declares an ability for the target, as a reaction, roll a dice. On a 4+, inflict 1 mortal damage on the target.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "Chains of unnatural heat set tight around the caster's foes, burning and punishing them for each motion.",
    "casting_value": "7",
    "source_note": "Ravaged Coast: Lore of Magmic Fury",
    "phase_key": "hero phase"
   },
   {
    "name": "Embody The Blaze",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible friendly unit that is in combat and is wholly within 12\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "The target can immediately use a FIGHT ability as if it were the combat phase. The target has STRIKE-LAST for the rest of the turn .",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "Scorching their own flesh, the wizard imbues the bodies and spirits of their allies with the rampantness of an inferno.",
    "casting_value": "8",
    "source_note": "Ravaged Coast: Lore of Magmic Fury",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Cascading Fire Cloak",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, then make a casting roll of 2D6.",
    "effect": "The caster has WARD (5+) until the start of your next turn.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "A bright, blazing curtain of cinders rises to surround the caster mid ward off blows.",
    "casting_value": "6",
    "source_note": "Ravaged Coast: Lore of Magmic Fury",
    "phase_key": "hero phase,combat"
   }
  ],
  "prayer_lore": [
   {
    "name": "Burning Insistence",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible friendly unit wholly within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Add 3 to the target's control score until the start of your next turn. If the chanting roll was 8+, add 10 to the target's control score until the start of your next turn instead.",
    "bullets": "[]",
    "keywords": "PRAYER, UNLIMITED",
    "lore_text": "An incandescent rage is sparked within the faithful, driving out any thought of retreat.",
    "casting_value": "4",
    "source_note": "Ravaged Coast: Prayers of Aqshian Wrath",
    "phase_key": "hero phase"
   },
   {
    "name": "Invocation To Wrath",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible friendly unit wholly within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Add 1 to wound rolls for the target's combat attacks until the start of your next turn. If the chanting roll was 8+, you can pick up to 2 eligible units to be the targets instead of 1.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "Bellowing, chanting and hissing, the priest invokes the rage of an already furious realm now torturedand incensed.",
    "casting_value": "4",
    "source_note": "Ravaged Coast: Prayers of Aqshian Wrath",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Trail Of Lava",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible friendly unit wholly within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn:",
    "bullets": "[\"The target can use a RETREAT ability and still use SHOOT and/or CHARGE abilities later in the turn. If the chantLng roll was 8+, after the RETREAT ability has been resolved, inflict D3 mortal damage on each enemy unit that was in combat with the target at the start of the move.\",\"No mortal damage is inflicted on the target by RETREAT abilities.\"]",
    "keywords": "PRAYER",
    "lore_text": "The priest causes lava to seep in the faithful's wake, stymieing would-be pursuers.",
    "casting_value": "4",
    "source_note": "Ravaged Coast: Prayers of Aqshian Wrath",
    "phase_key": "hero phase,movement"
   },
   {
    "name": "Cauterisation",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible enemy unit within 18\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn:",
    "bullets": "[\"The target's melee weapons cannot be affected by weapon abilities other than the Companion weapon ability.\",\"If the chanting roll was 10+, for each unmodified hit roll of 1 for a combat attack made by the target, inflict 1 mortal damage on the target after the FIGHT ability has been resolved.\"]",
    "keywords": "PRAYER",
    "lore_text": "The priest channels white-hot fury - or the corruptive fires of the Gnaw - to burn out the blessings of enemy weapons.",
    "casting_value": "4",
    "source_note": "Ravaged Coast: Prayers of Aqshian Wrath",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Leaping Embers",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible friendly unit wholly within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Add 2 to charge rolls for the target until the start of your next turn. If the chanting roll was 8+, add 4 to charge rolls for the target until the start of your next turn instead.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "At the chanter's behest, allies seem to transform into leaping licks of flame that cross distances at great pace.",
    "casting_value": "4",
    "source_note": "Ravaged Coast: Prayers of Aqshian Wrath",
    "phase_key": "hero phase,charge"
   },
   {
    "name": "Crumbling Impact",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible friendly unit wholly within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn, each time an enemy unit ends a move made as part of a CHARGE ability within 3\" of the target inflict D3 mortal damage on that unit after the CHARGE ability has been resolved. If the chanting roll was 8+, inflict D6 mortal damage on that unit instead.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "The land cracks and splinters beneath the charge of the faithful, venting forth energies both pure and foul.",
    "casting_value": "4",
    "source_note": "Ravaged Coast: Prayers of Aqshian Wrath",
    "phase_key": "hero phase,movement,charge"
   }
  ],
  "battle_abilities": {
   "Deployment": [
    {
     "name": "Stalled Reinforcements",
     "timing": "Deployment Phase",
     "declare": "Pick a number of friendly units with a combined points value equal to or greater than the surplus value to be the targets.",
     "effect": "Set up those units in reserve as stalled reinforcements. They have now been deployed. If any stalled reinforcements are part of a regiment, the other units in that regiment can still be deployed using the 'Deploy Regiment' ability.",
     "bullets": "[]",
     "keywords": "DEPLOY",
     "lore_text": "It is a truism of war that large hosts can take time to fully deploy.",
     "phase_key": "deployment"
    },
    {
     "name": "Timely Arrival",
     "timing": "Once Per Turn (Army), Your Movement Phase",
     "declare": "Pick a friendly stalled reinforcement to be the target.",
     "effect": "Roll a dice. On a 4+, set up the target in friendly territory, wholly within 6\" of a battlefield edge and more than 9\" from all enemy units. If it is not possible to set up the target, it remains in reserve as a stalled reinforcement.",
     "bullets": "[]",
     "lore_text": "Reserve units arrive to swing the pendulum of battle in their general's favour.",
     "phase_key": "movement,deployment"
    }
   ],
   "Ravaged Coast Abilities": [
    {
     "name": "Aqshian Anger",
     "timing": "Passive",
     "effect": "If a unit uses the 'All-out Attack' command, add 1 to hit rolls for attacks that target that unit for the rest of the phase.",
     "bullets": "[]",
     "lore_text": "Aqshy is a land of fire, and a red-hot temperament burns within all those who fight here.",
     "phase_key": "combat"
    },
    {
     "name": "Poisoned Domain",
     "timing": "Once Per Turn, End of Your Turn",
     "declare": "Pick all units (friendly and enemy) within 1\" of any terrain features to be the targets.",
     "effect": "Roll a dice for each target. On a 1, inflict D6 mortal damage on the target.",
     "bullets": "[]",
     "lore_text": "The Ravaged Coast is a tainted horrorscape, its air toxic and its land warping in a manner deadly to any that dare to trespass."
    }
   ],
   "Emberstone": [
    {
     "name": "Collect Emberstone",
     "timing": "Once Per Turn (Army), End of Your Turn",
     "declare": "Pick an emberstone cluster on the battlefield and determine control of it as if it were an objective (Core Rules, 32.2). If you control that emberstone cluster, pick a friendly unit within 3\" of it that is not in combat and does not have an emberstone token to be the target.",
     "effect": "Roll a dice. On a 1, inflict D3 mortal damage on each unit within 3\" of that emberstone cluster, then remove that emberstone cluster from the battlefield. On a 2-6, remove that emberstone cluster from the battlefield and give the target an emberstone token.",
     "bullets": "[]",
     "lore_text": "Your warriors use this moment of respite to gather a large cluster of emberstone crystals."
    },
    {
     "name": "Filled With Fury",
     "timing": "Passive",
     "effect": "While a unit has an ember stone token:",
     "bullets": "[\"Subtract 1 from save rolls for that unit.\",\"Add 1 to wound rolls for attacks made by that unit.\"]",
     "lore_text": "Simply holding emberstone can see warriors abandon their training and fall into volcanic anger.",
     "phase_key": "combat"
    },
    {
     "name": "Dig For Emberstone",
     "timing": "End of Final Battle Round",
     "declare": "Pick an objective that you control to be a dig site. You cannot pick the same objective more than once per battle. Then, pick a friendly unit that is not in combat and is contesting that dig site to be the target.",
     "effect": "Roll a dice. On a 1, inflict 1 battle wound on the target. On a 4+, give the target an emberstone token.",
     "bullets": "[]",
     "lore_text": "You believe that you have found a rich seam of emberstone, but these magical fragments may have burned out - or burn too bright ..."
    }
   ],
   "Battle Scars": [
    {
     "name": "Smouldering Scars",
     "timing": "Passive",
     "effect": "At the end of the battle, roll a dice. On a 5+, this unit suffers D3 battle wounds.",
     "bullets": "[]",
     "lore_text": "Traces of flame lick within these lacerations, seeing rile bearer contort with pain."
    },
    {
     "name": "Unyielding Blisters",
     "timing": "Passive",
     "effect": "Damage points allocated to this unit cannot be healed.",
     "bullets": "[]",
     "lore_text": "Attempts to tend these warriors' wounds sees them break out in agonising red-raw blisters."
    },
    {
     "name": "Scorched Limbs",
     "timing": "Passive",
     "effect": "Subtract 1 from run rolls and charge rolls for this unit.",
     "bullets": "[]",
     "lore_text": "Caught by a gout of steam or lava-plume, these warriors' limbs are charred and weakened.",
     "phase_key": "movement,charge"
    },
    {
     "name": "Blood-Deep Corruption",
     "timing": "Passive",
     "effect": "This unit cannot use RUN or RETREAT abilities.",
     "bullets": "[]",
     "lore_text": "Too much inhaled warp-dust sees these warriors' veins pulse green as their endurance 'is sapped.",
     "phase_key": "movement"
    },
    {
     "name": "Warp-Rust",
     "timing": "Passive",
     "effect": "Each time you declare a FIGHT ability for this unit, as a reaction, roll a dice. On a 4+, for the rest of the turn, this unit's non-Companion melee weapons cannot be affected by weapon abilities.",
     "bullets": "[]",
     "lore_text": "Proximity to the Gnaw has seen the weapons of these warriors grow dull.",
     "phase_key": "combat"
    },
    {
     "name": "Endless Chittering",
     "timing": "Passive",
     "effect": "Each time you declare a command for this unit, as a reaction, roll a dice. On a 4+, that command has no effect, it still counts as having been used and the command points spent to use it are still lost.",
     "bullets": "[]",
     "lore_text": "The shrieking of vermin periodically overwhelms these warriors' senses, driving all wit from them.",
     "phase_key": "hero phase"
    },
    {
     "name": "Hissing Wheezes",
     "timing": "Passive",
     "effect": "This unit has STRIKE-LAST.",
     "bullets": "[]",
     "lore_text": "The corruption emanating from the Gnaw has poisoned these warriors, blighting them with fatigue - and their sputterings now carry a rat-like edge..."
    },
    {
     "name": "Ash-Blighted",
     "timing": "Passive",
     "effect": "Subtract 1 from the Attacks characteristic of this unit's weapons.",
     "bullets": "[]",
     "lore_text": "Having waded through too many scalding ash-storms, these warriors are covered in pumice-grey cystsand find their motions slowed.",
     "phase_key": "combat"
    },
    {
     "name": "Raging Agonies",
     "timing": "Passive",
     "effect": "Each time you declare a non-CORE ability for this unit, as a reaction, roll a dice. On a 5+, that ability has no effect.",
     "bullets": "[]",
     "lore_text": "Like a volcano suddenly erupting or a temper snapping, the pain of these warriors' injuries flares up without warning."
    }
   ]
  }
 },
 "blighted-wilds": {
  "key": "blighted-wilds",
  "name": "Blighted Wilds",
  "paths": [
   {
    "key": "bw-thyrian-druid",
    "name": "Path of the Thyrian Druid",
    "restricted": "HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Bound To Thyria",
        "timing": "Any Hero Phase",
        "effect": "Heal (1) this unit.",
        "bullets": [],
        "lore_text": "While the land endures, so too does this hero.",
        "phase_key": "hero phase"
       },
       {
        "name": "Forest Strider",
        "timing": "Passive",
        "effect": "This unit can pass across terrain features as if it had FLY.",
        "bullets": [],
        "lore_text": "The densest forests are no impediment to this soul."
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Skilled Healer",
        "timing": "Your Hero Phase",
        "declare": "Pick either another visible friendly unit wholly within 12\" of this unit or a visible friendly faction terrain feature wholly within 12\" of this unit to be the target.",
        "effect": "Heal (D3) the target.",
        "bullets": [],
        "lore_text": "While the land endures, so too does this hero.",
        "phase_key": "hero phase"
       },
       {
        "name": "Deepwood Shadows",
        "timing": "Passive",
        "effect": "Friendly units are not visible to enemy units that are more than 12\" from them while those friendly units are wholly within this unit's combat range.",
        "bullets": [],
        "lore_text": "The densest forests are no impediment to this soul."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "A Ghost In The Trees",
        "timing": "Your Hero Phase",
        "effect": "If this unit is wholly within 3\" of a terrain feature, remove it from the battlefield and set it up again wholly within friendly territory and more than 9\" from all enemy units.",
        "bullets": [],
        "lore_text": "Many tales tell of this hero emerging without warningfrom dense foliage and plunging straight into the fray.",
        "phase_key": "hero phase"
       },
       {
        "name": "Shield Of Thorns",
        "timing": "Any Combat Phase",
        "declare": "Pick an enemy unit that charged this turn and is in combat with this unit to be the target.",
        "effect": "Subtract 1 from the Attacks characteristic of the target's melee weapons for the rest of the turn.",
        "bullets": [],
        "lore_text": "When danger strikes, prickly bushes burst from the ground around this hero to impede their foes.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Bound To The Cycle",
        "timing": "Once Per Battle, Any Movement Phase",
        "declare": "This unit can only use this ability if it has been destroyed.",
        "effect": "Roll a dice. If the roll is equal to or less than the current battle round number, set up a replacement unit wholly within 3\" of a terrain feature and more than 9\" from all enemy units.",
        "bullets": [],
        "lore_text": "Death becomes new life - a cycle to which this hero is inextricably linked.",
        "phase_key": "movement"
       },
       {
        "name": "Nexus Of Regeneration",
        "timing": "Once Per Battle, End of Any Turn",
        "declare": "Pick each friendly unit wholly within 12\" of this unit to be the targets.",
        "effect": "Pick 1 of the following effects for each target:",
        "bullets": [
         "Return 1 slain model to the target unit.",
         "If the target is not a MONSTER, Heal (D6) the target.",
         "If the target is a MONSTER, Heal (2D6) the target"
        ],
        "lore_text": "Those who fight at this hero's side are invigorated by their vital aura.",
        "phase_key": "end of turn"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Blighted Wilds"
   },
   {
    "key": "bw-sacrifice-master",
    "name": "Path of the Sacrifice Master",
    "restricted": "HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Willing Sacrifice",
        "timing": "Passive",
        "effect": "Add 1 to wound rolls for this unit's combat attacks while there are no other friendly units within its combat range.",
        "bullets": [],
        "lore_text": "This hero knows that the land will take any blood - even their own.",
        "phase_key": "combat"
       },
       {
        "name": "Seize New Offerings",
        "timing": "Passive",
        "effect": "Add 1 to hit rolls for this unit's attacks that target an enemy unit that has no other enemy units within its combat range.",
        "bullets": [],
        "lore_text": "Isolated enemies make for fine gifts to the deepwood spirits.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Prepare The Gift",
        "timing": "Passive",
        "effect": "Add 1 to the Rend characteristic of this unit's melee weapons used for attacks that target an enemy unit that is not damaged.",
        "bullets": [],
        "lore_text": "An unharmed enemy is simply one who has not yet been readied for the rite.",
        "phase_key": "combat"
       },
       {
        "name": "The Wilderness Demands",
        "timing": "Any Combat Phase",
        "effect": "If this unit did not charge this turn, it can move 3\", it can move into combat.",
        "bullets": [],
        "lore_text": "One cannot rest; always, the wilds wish for greater tribute.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "An Offering In Kind",
        "timing": "End of Any Turn",
        "effect": "If an enemy unit was destroyed this turn by this unit's combat attacks, Heal (5) this unit. If that enemy unit was a HERO, Heal (X) this unit instead, where X is the number of damage points allocated to this unit.",
        "bullets": [],
        "lore_text": "As this hero offers up foes to the hungry soil, they are justly rewarded.",
        "phase_key": "combat,end of turn"
       },
       {
        "name": "Marked For The Altar",
        "timing": "Once Per Battle, Any Combat Phase",
        "declare": "Pick an enemy unit in combat with this unit to be the target. Then pick 1 of this unit's melee weapons to be the Sacrificial Weapon.",
        "effect": "For the rest of the turn, add the target's Control characteristic, to a maximum of 5, to the Attacks characteristic of the Sacrificial Weapon, but all of its combat attacks must target that enemy unit.",
        "bullets": [],
        "lore_text": "A formidable enemy is merely an excuse to fight all the harder.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "We All Must Make Sacrifices...",
        "timing": "Reaction: Your opponent declared a command for a unit within 6\" of this unit",
        "effect": "Roll a dice. If the roll equals or exceeds the number of command points your opponent has, alter the command has been resolved, inflict an amount of mortal damage equal to the roll on the unit using that command. This unit can use this ability more than once per phase but only once per command.",
        "bullets": [],
        "lore_text": "As enemies struggle for military order, a resonant word from this hero sees them offer themselves to Ghyran.",
        "phase_key": "hero phase"
       },
       {
        "name": "Lord Of Blood And Briar",
        "timing": "Passive",
        "effect": "While an enemy unit is in combat with this unit:",
        "bullets": [
         "That enemy unit has a maximum control score of 1.",
         "Subtract 1 from that enemy unit's power level, to a minimum of 0.",
         "That enemy unit's attacks cannot score critical hits (treat them as regular hits instead)."
        ],
        "lore_text": "Radiating the terror of countless sacrificed souls, this hero's aura deeply disturbs their adversaries."
       }
      ]
     }
    ],
    "hero": true,
    "source": "Blighted Wilds"
   },
   {
    "key": "bw-weald-born",
    "name": "Path of the Weald-Born",
    "restricted": "non-HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Bursting With Vigour",
        "timing": "Passive",
        "effect": "Add 2 to run rolls for this unit while it is not damaged.",
        "bullets": [],
        "lore_text": "In the spring of their existence, these warriors seem to possess boundless energy.",
        "phase_key": "movement"
       },
       {
        "name": "Sacrificial Frenzy",
        "timing": "Passive",
        "effect": "If no slain models have been returned to this unit this battle, add 1 to hit rolls for this unit's combat attacks while it is damaged or any models in this unit have been slain.",
        "bullets": [],
        "lore_text": "Seeing their own blood spatter the earth inspires a battle-mania in this unit.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Greenwoad Spirals",
        "timing": "Passive",
        "effect": "This unit has WARD (5+) against damage points inflicted by SPELL abilities and abilities used by MANIFESTATIONS.",
        "bullets": [],
        "lore_text": "These warriors have spiralling, viridian tattoos that banish evil magics.",
        "phase_key": "combat"
       },
       {
        "name": "Growing Wildness",
        "timing": "Passive",
        "effect": "Add the current battle round number to this unit's control score.",
        "bullets": [],
        "lore_text": "The more these warriors immerse themselves in battle, the more untameable the land around them becomes."
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Surge Of Ghyran",
        "timing": "Passive",
        "effect": "If this unit is destroyed, before removing it from play, inflict D6 mortal damage on each enemy unit in combat with it.",
        "bullets": [],
        "lore_text": "These warriors have spiralling, viridian tattoos that banish evil magics."
       },
       {
        "name": "The Earth Rebels",
        "timing": "Once Per Turn (Army), Reaction: Opponent declared a CHARGE ability for a unit within 12\" of this unit",
        "effect": "Roll a dice. You can replace 1 of the dice in that charge roll with your dice roll.",
        "bullets": [],
        "lore_text": "The more these warriors immerse themselves in battle, the more untameable the land around them becomes.",
        "phase_key": "charge"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Watchers In The Green",
        "timing": "Any Hero Phase",
        "declare": "Pick a visible enemy unit within 12\" of this unit to be the target.",
        "effect": "For the rest of the turn, each time your opponent declares a command for the target, roll a dice as a reaction. On a 5+, unless your opponent spends 1 additional command point to use that command, the command has no effect, it still counts as having been used and the command points spent to use the command are still lost.",
        "bullets": [],
        "lore_text": "Where these warriors roam, strange faces stare out from the shadows, instilling paranoia in their foes.",
        "phase_key": "hero phase"
       },
       {
        "name": "Dandegryph Blowballs",
        "timing": "Enemy Combat Phase",
        "declare": "Pick an enemy unit in combat with this unit to be the target.",
        "effect": "Roll a dice. On a 3+, for the rest of the turn, for each unmodified hit roll of 1 for a combat attack made by the target, inflict 1 mortal damage on the target after the FIGHT ability has been resolved.",
        "bullets": [],
        "lore_text": "Grasping bunches of dandegryphs, with a puff of breath, the warriors release the flowers' downy seeds in a disorienting cloud that envelops the foe.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Blighted Wilds"
   },
   {
    "key": "bw-foresters",
    "name": "Path of the Foresters",
    "restricted": "non-HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Arboreal Concealment",
        "timing": "Passive",
        "effect": "Subtract 1 from hit rolls for shooting attacks that target this unit.",
        "bullets": [],
        "lore_text": "These warriors are experts at camouflaging themselves amongst the trees.",
        "phase_key": "shooting"
       },
       {
        "name": "Defensive Thicket",
        "timing": "Any Combat Phase",
        "effect": "If this unit did not charge this turn, roll a dice. On a 3+, for the rest of the turn, subtract 1 from wound rolls for combat attacks that target this unit.",
        "bullets": [],
        "lore_text": "These warriors keep the foe engaged but unable to leverage their full strength.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Fleet-Footed Fighters",
        "timing": "Enemy Movement Phase",
        "effect": "Roll a D3. If there are no enemy units within 9\" of this unit, roll a dice instead. On a 2+, this unit can move a number of inches equal to the roll. It can move through the combat ranges of enemy units but cannot end that move in combat.",
        "bullets": [],
        "keywords": "MOVE, RUN",
        "lore_text": "These warriors are experts at camouflaging themselves amongst the trees.",
        "phase_key": "movement"
       },
       {
        "name": "Bramblebarb Burstpods",
        "timing": "Any Charge Phase",
        "declare": "If this unit did not charge this turn, pick an enemy unit in combat with it to be the target.",
        "effect": "Inflict D3 mortal damage on the target.",
        "bullets": [],
        "lore_text": "Natural incendiary devices, the seeds of the bramblebarb can be primed to burst apart in a shower of needle-sharp spines.",
        "phase_key": "charge"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Vital Souls",
        "timing": "Once Per Battle, Your Movement Phase",
        "effect": "If this unit is not in combat, return up to D3 slain models to it with a combined Health characteristic of up to 12.",
        "bullets": [],
        "lore_text": "These warriors have spent so much time in the mystical wilds ofTliyria that they have become strangely inundated with life magic.",
        "phase_key": "movement,combat"
       },
       {
        "name": "Hunter's Call",
        "timing": "Passive",
        "effect": "Each time this unit makes a pile-in move, it moves as if it had FLY and can move 6\" instead of 3\".",
        "bullets": [],
        "lore_text": "With a trilling chirp, a member of this unit signals for the others to move swiftly and deftly in for the kill."
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Trap Mastery",
        "timing": "Any Combat Phase",
        "declare": "Pick an enemy unit in combat with this unit to be the target.",
        "effect": "Roll a dice. On a 3+, subtract 1 from the Attacks characteristic of the target's melee weapons for the rest of the turn.",
        "bullets": [],
        "lore_text": "This unit is expert at employing cunning ruses and feints in order to hinder their opponents in a melee.",
        "phase_key": "combat"
       },
       {
        "name": "Rooted In The Undergrowth",
        "timing": "Passive",
        "effect": "Ignore all modifiers to save rolls for this unit (positive and negative).",
        "bullets": [],
        "lore_text": "Specialising in all manner of survival techniques, these warriors are difficult to shift once they clear a position.",
        "phase_key": "combat"
       }
      ]
     }
    ],
    "hero": false,
    "source": "Blighted Wilds"
   },
   {
    "key": "bw-alchemist",
    "name": "Path of the Alchemist",
    "restricted": "HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Forager",
        "timing": "Once Per Battle, End of Any Turn",
        "declare": "Pick a terrain feature within 3\" of this unit to be the target.",
        "effect": "If the target is wholly within enemy territory, roll on the Exotic Ingredients table and add the corresponding ingredient to your roster. If the target is not wholly within enemy territory, roll on the Basic Ingredients table instead.",
        "bullets": [],
        "lore_text": "This eagle-eyed hero takes every opportunity to search the battlefield for rare ingredients.",
        "phase_key": "end of turn"
       },
       {
        "name": "Potion Pickpocket",
        "timing": "Any Combat Phase",
        "declare": "Pick an enemy HERO that has a GHYRANITE CONCOCTION and is in combat with this unit to be the target.",
        "effect": "Roll a dice. On a 3+, the target no longer has that GHYRANITE CONCOCTION and give this unit that GHYRANITE CONCOCTION. If this unit already has a GHYRANITE CONCOCTION, this unit must immediately use one of those Ghyranite Concoctions.",
        "bullets": [],
        "lore_text": "If they notice a glowing vial hanging by an enemy's waist, this hero will quickly snatch it for themselves.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Precious Ingredients",
        "timing": "End of Any Turn",
        "effect": "If this unit has a GHYRANITE CONCOCTION, this unit can immediately use the 'Retreat' ability as if it were your movement phase without any mortal damage being inflicted on it.",
        "bullets": [],
        "lore_text": "This warrior has no respect for knightly honour - nothing is as important as their potions.",
        "phase_key": "movement,end of turn"
       },
       {
        "name": "Explosive Concoctions",
        "timing": "Any Combat Phase",
        "declare": "Pick an enemy unit in combat with this unit to be the target.",
        "effect": "Inflict D3+3 mortal damage on the target.",
        "bullets": [],
        "keywords": "CORE, ATTACK, FIGHT",
        "lore_text": "The especially volatile potions brewed by this alchemist could kill a drake, let alone a man.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Portable Brew Station",
        "timing": "Your Hero Phase",
        "effect": "Pick a GHYRANITE CONCOCTION. If you have the ingredients listed in its recipe on your roster, you can immediately mix it. Remove those ingredients from your roster and give that GHYRANITE CONCOCTION to this unit.",
        "bullets": [],
        "lore_text": "This convenient contraption is perfect for cooking up concoctions on the go.",
        "phase_key": "hero phase"
       },
       {
        "name": "Impromptu Potions",
        "timing": "Your Shooting Phase",
        "declare": "Pick a visible enemy unit within 12\" of this unit to be the target.",
        "effect": "Roll a D3 and apply the corresponding effect: 1 Potion of Instant Corrosion: Inflict D3 mortal damage on the target. 2 Potion of Imprecision: Subtract 1 from hit rolls for the target's attacks for the rest of the turn. 3 Potion of Vulnerability: Ward rolls cannot be made for the target for the rest of the turn.",
        "bullets": [],
        "lore_text": "A veritable potion-making master, this hero can whip up mixtures on the fly to hurl at the enemy.",
        "phase_key": "shooting"
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Overcharged Elixirs",
        "timing": "Passive",
        "effect": "Add 1 to hit rolls and wound rolls for this unit's combat attacks while it has used a GHYRANITE CONCOCTION ability in the same turn.",
        "bullets": [],
        "lore_text": "This master alchemist can create the most potent of potions, but they have also become somewhat reliant on them.",
        "phase_key": "combat"
       },
       {
        "name": "Waste Not, Want Not",
        "timing": "Passive",
        "effect": "Each time this unit uses a GHYRANITE CONCOCTION ability, roll a dice as a reaction. On a 5+, do not remove the GHYRANITE CONCOCTION from your roster as part of the effect of that ability.",
        "bullets": [],
        "lore_text": "Through a mixture of skill, frugality and constant harvesting, this alchemist never runs out of ingredients."
       }
      ]
     }
    ],
    "hero": true,
    "source": "Blighted Wilds"
   },
   {
    "key": "bw-woodsman",
    "name": "Path of the Woodsman",
    "restricted": "INFANTRY HERO only",
    "ranks": [
     {
      "rank": "Aspiring",
      "options": [
       {
        "name": "Morale Boost",
        "timing": "Passive",
        "effect": "Add 2 to the control scores of friendly units while they are wholly within 12\" of this unit.",
        "bullets": [],
        "lore_text": "By humming songs they heard while travelling the realms, this scout lifts the spirits of their allies."
       },
       {
        "name": "Never A Stranger",
        "timing": "Passive",
        "effect": "Add 1 to save rolls for this unit while it is wholly within friendly territory.",
        "bullets": [],
        "lore_text": "Constantly wandering the wilderness, this hero feels at home in even the most remote regions of the realms.",
        "phase_key": "combat"
       }
      ]
     },
     {
      "rank": "Elite",
      "options": [
       {
        "name": "Knowledgeable Guide",
        "timing": "Your Movement Phase",
        "declare": "Pick this unit and up to 1 friendly unit within this unit's combat range to be the targets.",
        "effect": "For the rest of the turn, add 2\" to each target's MOVE characteristic while they are wholly outside friendly territory.",
        "bullets": [],
        "lore_text": "This warrior is well versed in leading troops through treacherous terrain.",
        "phase_key": "movement"
       },
       {
        "name": "Expert Of All Terrain",
        "timing": "Passive",
        "effect": "Ignore negative modifiers to:",
        "bullets": [
         "Run rolls and charge rolls for this unit.",
         "This unit's MOVE characteristic."
        ],
        "lore_text": "Neither steep mountain nor dense forest can stop the advance of this doughty scout.",
        "phase_key": "movement,charge"
       }
      ]
     },
     {
      "rank": "Mighty",
      "options": [
       {
        "name": "Navigator Extraordinaire",
        "timing": "Once Per Battle (Army), Deployment Phase",
        "declare": "Pick up to D3 friendly units to be the targets.",
        "effect": "Each target can use the 'Normal Move' ability as if it were your movement phase.",
        "bullets": [],
        "lore_text": "Having memorised trails, paths and shortcuts galore, this warrior is practically a walking map.",
        "phase_key": "movement,deployment"
       },
       {
        "name": "Traversal Gear",
        "timing": "Passive",
        "effect": "This unit can pass across terrain features as if it had FLY.",
        "bullets": [],
        "lore_text": "This veteran scout has assembled a versatile toolkit that allows them to cross any sort of terrain with ease."
       }
      ]
     },
     {
      "rank": "Legendary",
      "options": [
       {
        "name": "Nature's Ally",
        "timing": "Once Per Battle, Your Hero Phase",
        "declare": "Pick an objective or terrain feature within this unit's combat range to be the target.",
        "effect": "For the rest of the battle, friendly units have WARD (5+) while they are wholly within 12\" of the target.",
        "bullets": [],
        "lore_text": "On their travels, this scout has made pacts with - or simply dominated - many spirits of the deep wilds, whom they can call upon at sacred sites to aid their fellows.",
        "phase_key": "hero phase,combat"
       },
       {
        "name": "Master Of Hidden Paths",
        "timing": "Once Per Battle, Your Movement Phase",
        "declare": "Pick this unit and up to 1 other visible friendly unit wholly within 6\" of this unit to be the targets.",
        "effect": "Remove the targets from the battlefield and set them up again with each model contesting the same objective or terrain feature and not in combat. The targets cannot use CHARGE abilities for the rest of the turn.",
        "bullets": [],
        "lore_text": "There is no path unknown to this master scout - a fact their enemies often have cause to rue.",
        "phase_key": "movement"
       }
      ]
     }
    ],
    "hero": true,
    "source": "Blighted Wilds"
   }
  ],
  "heroic_traits": [
   {
    "name": "Blessed By The Old Magics",
    "timing": "Once Per Battle, Reaction: You declared a SPELL ability from the Lore of the Overgrown Wilds for a unit wholly within 6\" of this unit",
    "effect": "Change the casting roll for that spell to a value of 9 that cannot be modified. If that spell is unbound, inflict D6 mortal damage on the unit that used that UNBIND ability.",
    "bullets": "[]",
    "lore_text": "Thyria's ancient aetheric energies cling to this warrior - and sometimes they manifest in force.",
    "source_note": "Blighted Wilds: The Pride of Thyria",
    "phase_key": "hero phase"
   },
   {
    "name": "Grizzled Survivalist",
    "timing": "Passive",
    "effect": "Ignore positive modifiers to hit rolls and wound rolls for shooting attacks that target this unit.",
    "bullets": "[]",
    "lore_text": "A lifetime of traversing - and enduring - the Thyrian wilds has made this hero a challenging target.",
    "source_note": "Blighted Wilds: The Pride of Thyria",
    "phase_key": "shooting"
   },
   {
    "name": "Resolute Builder",
    "timing": "Passive",
    "effect": "While this unit is within 3\" of a friendly faction terrain feature or a terrain feature wholly within friendly territory, this unit has WARD (5+).",
    "bullets": "[]",
    "lore_text": "A skilled and determined artisan, this hero takes great pride in the masterworks they have raised amidst the hostile Thyrian environment.",
    "source_note": "Blighted Wilds: The Pride of Thyria",
    "phase_key": "combat"
   },
   {
    "name": "Arcane Disruptor",
    "timing": "Any Movement Phase",
    "declare": "Pick a MANIFESTATION within 6\" of this unit to be the target.",
    "effect": "Roll a dice. On a 5+, the target is banished and removed from play.",
    "bullets": "[]",
    "lore_text": "Something in this warrior's soul seems to disrupt the channels of magical force that run through Thyria.",
    "source_note": "Blighted Wilds: The Pride of Thyria",
    "phase_key": "hero phase,movement"
   },
   {
    "name": "As Strong As An Ironoak",
    "timing": "Passive",
    "effect": "Add 2 to this unit's control score for each damage point it has.",
    "bullets": "[]",
    "lore_text": "The more damage this hero takes, the more determined they are to hold their ground.",
    "source_note": "Blighted Wilds: The Pride of Thyria"
   },
   {
    "name": "Natural Terror",
    "timing": "Once Per Battle, Any Hero Phase",
    "declare": "Pick a visible enemy unit to be the target.",
    "effect": "Until the start of your next turn, while this unit is on the battlefield, the target has a maximum control score of 1.",
    "bullets": "[]",
    "lore_text": "One look from this hero can inspire dread in even the bravest of warriors.",
    "source_note": "Blighted Wilds: The Pride of Thyria",
    "phase_key": "hero phase"
   }
  ],
  "artefacts": [
   {
    "name": "Jadecurse Stave",
    "timing": "Passive",
    "effect": "Ward rolls cannot be made for damage points inflicted by this unit's combat attacks.",
    "bullets": "[]",
    "lore_text": "Grown in a dark glade by cruel druid-folk, this gnarled weapon can banish many forms of supernatural protection.",
    "source_note": "Blighted Wilds: Thyrian Wonders",
    "phase_key": "combat"
   },
   {
    "name": "Thorn-Studded Gauntlets",
    "timing": "End of Any Turn",
    "effect": "Inflict 1 mortal damage on each visible enemy unit within 6\" of this unit.",
    "bullets": "[]",
    "lore_text": "At the wearer's whim, needle-like thorns extend outwards from these ironoak gauntlets, piercing armour and spearing exposed flesh.",
    "source_note": "Blighted Wilds: Thyrian Wonders",
    "phase_key": "end of turn"
   },
   {
    "name": "Princeling's Bow",
    "timing": "Any Shooting Phase",
    "declare": "If this unit is not in combat, pick a visible enemy unit within 18\" of it to be the target.",
    "effect": "Roll 3 dice. For each 4+, inflict 1 mortal damage on the target.",
    "bullets": "[]",
    "lore_text": "Arrowsfired by this glistening green bow unerringly strike their target, just as they did for the aelven highborn of old.",
    "source_note": "Blighted Wilds: Thyrian Wonders",
    "phase_key": "shooting"
   },
   {
    "name": "Barkflesh Shield",
    "timing": "Passive",
    "effect": "Ignore the first damage point that would be allocated to this unit in each phase.",
    "bullets": "[]",
    "lore_text": "It is rumoured that this shield was carved from the hide of a fallen Treelord.",
    "source_note": "Blighted Wilds: Thyrian Wonders"
   },
   {
    "name": "Revivifying Philtre",
    "timing": "Once Per Battle, Your Hero Phase",
    "effect": "Heal (D3+3) this unit. For the rest of the turn, this unit has WARD (5+).",
    "bullets": "[]",
    "lore_text": "The thick green liquid sloshing in this resinous container is bitter and unpleasant, but its curative properties are undeniable.",
    "source_note": "Blighted Wilds: Thyrian Wonders",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Arcane Seedpod",
    "timing": "Once Per Battle, Your Movement Phase",
    "declare": "Pick a visible terrain feature within 9\" of this unit, then pick each enemy unit within 3\" of it to be the targets.",
    "effect": "The following effects apply until the start of your next turn:",
    "bullets": "[\"Subtract 1 from casting rolls and chanting rolls for each target.\",\"Halve each target's Move characteristic.\",\"The effects of the 'FLY' ability do not apply to the targets.\"]",
    "lore_text": "When tossed onto a site of power, this pod releases a cloud of magical gases that choke and disrupt those who breathe too deeply of them.",
    "source_note": "Blighted Wilds: Thyrian Wonders",
    "phase_key": "hero phase,movement"
   }
  ],
  "spell_lore": [
   {
    "name": "Thicket Shield",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible friendly unit wholly within 12\" of them and not in combat to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, while the target is wholly within 3\" of a terrain feature, it is not visible to enemy units more than 9\" away.",
    "bullets": "[]",
    "keywords": "SPELL, UNLIMITED",
    "lore_text": "At the wizard's command, dense vegetation grows up around their allies to hide them from view.",
    "casting_value": "6",
    "source_note": "Blighted Wilds: Lore of the Overgrown Wilds",
    "phase_key": "hero phase"
   },
   {
    "name": "Disrupt The Humours",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible enemy unit within 18\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, subtract 1 from contamination rolls and remediation rolls for the target.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "The wizard subtly affects the internal workings of the enemies' bodies, rendering them prone to disease.",
    "casting_value": "5",
    "source_note": "Blighted Wilds: Lore of the Overgrown Wilds",
    "phase_key": "hero phase"
   },
   {
    "name": "Healing Spiral",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible friendly unit wholly within 12\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, each time the target uses a FIGHT ability, after that ability has been resolved, Heal (X) the target, where X is the number of enemy models slain by combat attacks made as part of that FIGHT ability.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "Life and sacrifice are inherent to Ghyran, and one skilled in jade magic can have the latter pay for the former.",
    "casting_value": "7",
    "source_note": "Blighted Wilds: Lore of the Overgrown Wilds",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Awaken The Carnivores",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible terrain feature within 12\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, subtract 1 from save rolls for units (friendly and enemy) while they are within 3\" of the target.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "Pitcher plants, flytraps, fanged corpse-flowers and more: all come alive at the mage's urging, lashing out at nearby foes.",
    "casting_value": "7",
    "source_note": "Blighted Wilds: Lore of the Overgrown Wilds",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Shifting Lands",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly WIZARD to cast this spell, pick a visible terrain feature within 12\" of them to be the target, then make a casting roll of 2D6.",
    "effect": "Until the start of your next turn, enemy units cannot be set up within 12\" of the target as a result of an enemy ability.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "The mage compels natural landmarks to change their positions amid the tortuous jungle sprawl, further confusing enemy reinforcements.",
    "casting_value": "6",
    "source_note": "Blighted Wilds: Lore of the Overgrown Wilds",
    "phase_key": "hero phase,deployment"
   },
   {
    "name": "Forest Walk",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly Wizard to cast this spell, then make a casting roll of 2D6.",
    "effect": "Double the caster's Move characteristic until the start of your next turn.",
    "bullets": "[]",
    "keywords": "SPELL",
    "lore_text": "The Thyrian wilds briefly part before the wizard, easing their passage.",
    "casting_value": "6",
    "source_note": "Blighted Wilds: Lore of the Overgrown Wilds",
    "phase_key": "hero phase,movement"
   }
  ],
  "prayer_lore": [
   {
    "name": "Spring In Their Step",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible terrain feature within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn, add 1 to charge rolls for friendly units while they are within 3\" of the target. If the chanting roll was 6+, add 2 to charge rolls for those units instead of 1.",
    "bullets": "[]",
    "keywords": "PRAYER, UNLIMITED",
    "lore_text": "The priest causes wildflowers to spring up across the land; as they burst into bloom, the congregation is filled with vernal vigour.",
    "casting_value": "3",
    "source_note": "Blighted Wilds: Prayers of the Jade Soul",
    "phase_key": "hero phase,charge"
   },
   {
    "name": "Jade Revival",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible friendly unit that is not in combat and is wholly within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Return a number of slain models to the target unit with a combined Health characteristic of up to 4. If the chanting roll was 8+, return a number of slain models to the target unit with a combined Health characteristic of up to 8 instead.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "As the priest intones their litanies, warriors on the cusp of doom find themselves once more filled with vitality.",
    "casting_value": "4",
    "source_note": "Blighted Wilds: Prayers of the Jade Soul",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "The Angry Wilds",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible enemy unit within 18\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn, each time your opponent declares a command for the target, unless they spend 1 additional command point to use that command, the command has no effect, it still counts as having been used and the command points spent to use the command are still lost. If the chanting roll was 10+, the target cannot use commands until the start of your next turn.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "The priest's passionate invective is accompanied by hissing waters and creaking bark - unsettling, vengeful sounds that sap enemy warriors' discipline.",
    "casting_value": "5",
    "source_note": "Blighted Wilds: Prayers of the Jade Soul",
    "phase_key": "hero phase"
   },
   {
    "name": "Rooted Delusion",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible enemy unit within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn, the target has STRIKE-LAST. In addition, if the chanting roll was 8+, subtract 1 from wound rolls for the target's attacks until the start of your next turn.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "Foes who hear the priest's lays suddenly struggle to move, believing, beyond all sane measure, that their limbs have become tree trunks and they are rooted to the spot.",
    "casting_value": "4",
    "source_note": "Blighted Wilds: Prayers of the Jade Soul",
    "phase_key": "hero phase,combat"
   },
   {
    "name": "Regenerating Blossom",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible terrain feature within 12\" of them to be the target, then make a chanting roll ofD6.",
    "effect": "Heal (D3) each unit (friendly and enemy) within 3\" of the target. If the chanting roll was 8+, Heal (3) each unit (friendly and enemy) within 3\" of the target instead.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "As the priest chants, colourful flowers cascade from a nearby landmark, healing the wounds of all those touched by their bright petals.",
    "casting_value": "4",
    "source_note": "Blighted Wilds: Prayers of the Jade Soul",
    "phase_key": "hero phase"
   },
   {
    "name": "Soporific Soothing",
    "timing": "Your Hero Phase",
    "declare": "Pick a friendly PRIEST to chant this prayer, pick a visible enemy unit within 12\" of them to be the target, then make a chanting roll of D6.",
    "effect": "Until the start of your next turn, the target's attacks cannot score critical hits (treat them as regular hits instead). In addition, if the chanting roll was 9+, combat attacks that target that enemy unit score critical hits on unmodified hit rolls of 5+.",
    "bullets": "[]",
    "keywords": "PRAYER",
    "lore_text": "The priest's rhythmic chanting sees their enemies surrender to the cycle of life, leaving them vulnerable when blades clash.",
    "casting_value": "4",
    "source_note": "Blighted Wilds: Prayers of the Jade Soul",
    "phase_key": "hero phase,combat"
   }
  ],
  "battle_abilities": {
   "Deployment": [
    {
     "name": "Stalled Reinforcements",
     "timing": "Deployment Phase",
     "declare": "Pick a number of friendly units with a combined points value equal to or greater than the surplus value to be the targets.",
     "effect": "Set up those units in reserve as stalled reinforcements. They have now been deployed. If any stalled reinforcements are part of a regiment, the other units in that regiment can still be deployed using the 'Deploy Regiment' ability.",
     "bullets": "[]",
     "keywords": "DEPLOY",
     "lore_text": "It is a truism of war that large hosts can take time to fully deploy.",
     "phase_key": "deployment"
    },
    {
     "name": "Timely Arrival",
     "timing": "Once Per Turn (Army), Your Movement Phase",
     "declare": "You can use this ability from the second battle round onwards. Pick a friendly stalled reinforcement to be the target.",
     "effect": "Roll a dice. Subtract 1 from the roll if the target is a HERO or a reinforced unit and subtract 1 from the roll if the target is a MONSTER. On a 4+, set up the target in friendly territory, wholly within 6\" of a battlefield edge and more than 9\" from all enemy units. If it is not possible to set up the target, it remains in reserve as a stalled reinforcement.",
     "bullets": "[]",
     "lore_text": "Reserve units arrive to swing the pendulum of battle in their general's favour.",
     "phase_key": "movement,deployment"
    }
   ],
   "Determine the Underdog": [
    {
     "name": "Strategic Mastery",
     "timing": "Once Per Turn (Army), Start of Enemy Turn",
     "effect": "If your opponent seized the initiative this battle round and you have not seized the initiative this battle, roll a dice for each command point your opponent has. For each 5+, your opponent loses 1 command point and you gain 1 command point.",
     "bullets": "[]",
     "lore_text": "In times of dire need, the greatest tacticians step forward.",
     "phase_key": "hero phase"
    }
   ],
   "Blighted Wilds Abilities": [
    {
     "name": "Blighted Waters",
     "timing": "Once Per Turn (Army), Start of Enemy Turn",
     "declare": "Randomly pick a contaminated terrain feature. If that terrain feature has been remediated by your opponent's army, pick each friendly unit within 3\" of that terrain feature to be the targets. Otherwise, pick each unit within 3\" of that terrain feature to be the targets.",
     "effect": "Make a contamination roll of D3 for each target. On a 1, inflict 1 mortal damage on the target. On a 2+, the target has STRIKE-LAST for the rest of the turn.",
     "bullets": "[]",
     "lore_text": "Dark maladies have cursed the waters of Thyria, spreading sickness and rot throughout the land."
    },
    {
     "name": "Purify The Land",
     "timing": "Once Per Turn (Army), End of Any Turn",
     "declare": "Pick a friendly unit within 3\" of a contaminated terrain feature to use this ability, then pick that contaminated terrain feature to be the target.",
     "effect": "Make a remediation roll of D6. On a 3+:",
     "bullets": "[\"The target is remediated by your army for the rest of the battle and you no longer consider it to be contaminated.\",\"The unit using this ability gains 2 renown points\"]",
     "lore_text": "Whether through divine intervention, arcane talent or the skilled application of cleansing serums, these warriors have purified this pocket of contamination.",
     "phase_key": "end of turn"
    },
    {
     "name": "Boon Of Vitality",
     "timing": "Once Per Turn (Army), Any Movement Phase",
     "declare": "Pick a friendly unit that is not in combat and that is within 3\" of a terrain feature that has been remediated by your army to be the target.",
     "effect": "Roll a dice and apply the corresponding effect below. 1-2: No effect. 3: Add 1 to run rolls and charge rolls for the target until the start of your next turn. 4: Subtract 1 from wound rolls for attacks that target that friendly unit until the start of your next turn. 5: The target has WARD (5+) until the start of your next turn. 6: The target can immediately use the 'Rally' command as if it were your hero phase without any command points being spent. If it does so, you can make 3 additional rally rolls of D6.",
     "bullets": "[]",
     "lore_text": "Life magic blossoms in those areas that have been cleansed of corruption, filling those nearby with vim and vigour.",
     "phase_key": "hero phase,movement,charge,combat"
    }
   ],
   "Campaign Victory": [
    {
     "name": "Purifiers Of The Blighted Wilds",
     "timing": "Once Per Battle (Army), Your Hero Phase",
     "effect": "Heal (3) each friendly unit.",
     "bullets": "[]",
     "lore_text": "Vials of revitalising liquids are carried by your victorious warriors.",
     "phase_key": "hero phase"
    }
   ],
   "Battle Scars": [
    {
     "name": "Cyclical Melancholy",
     "timing": "Passive",
     "effect": "Subtract 10 from this unit's control score. Add 3 to the control scores of friendly units while they are wholly within this unit's combat range.",
     "bullets": "[]",
     "lore_text": "The pressures of buttle have left these warriors cantankerous and maudlin - though, on occasion, they can still prove surprisingly inspiring."
    },
    {
     "name": "Splinterskin",
     "timing": "Passive",
     "effect": "Add 1 to wound rolls for shooting attacks that target this unit if the attacking unit is within 12\" of this unit. Subtract 1 from wound rolls for shooting attacks that target this unit if the attacking unit is more than 12\" from this unit.",
     "bullets": "[]",
     "lore_text": "A bizarre oakflesh curse has seen these warriors' bodies grow tougher but brittle.",
     "phase_key": "shooting"
    },
    {
     "name": "Graspspite Musk",
     "timing": "Passive",
     "effect": "Roll a D3 instead of a D6 when making run rolls for this unit and when this unit uses the 'Redeploy' command. Each time an enemy unit in combat with this unit uses a RETREAT ability, roll a D6 instead of a D3 when determining the amount of mortal damage inflicted on that enemy unit by that ability.",
     "bullets": "[]",
     "lore_text": "These warriors' wounds exude an odour that is irresistible to the Thyrian graspspite. In an attempt to get close to them, the imps grab at their feet - and the feet of anyone nearby.",
     "phase_key": "movement"
    },
    {
     "name": "Aether-Rot",
     "timing": "Passive",
     "effect": "Subtract 1 from casting rolls and chanting rolls for units (friendly and enemy) while they are within 6\" of this unit.",
     "bullets": "[]",
     "lore_text": "The infection deep in these warriors' wounds has strange anti-magical properties.",
     "phase_key": "hero phase"
    },
    {
     "name": "Abject Apathy",
     "timing": "Passive",
     "effect": "Ignore the effects of STRIKE-FIRST and STRIKE-LAST on this unit.",
     "bullets": "[]",
     "lore_text": "A variant of the Shudderblight Plague has left these warriors indifferent to battle.",
     "phase_key": "combat"
    },
    {
     "name": "Monomaniacal Defenders",
     "timing": "Passive",
     "effect": "While this unit is damaged, it cannot make pile-in moves or use commands. Add 1 to save rolls for this unit while it is damaged.",
     "bullets": "[]",
     "lore_text": "When blood begins to flow, these warriors become fixated on defending their surroundings - as if Thyria itself has wormed into their souls.",
     "phase_key": "combat"
    },
    {
     "name": "Thin Blood, Stout Hearts",
     "timing": "Passive",
     "effect": "Add 1 to the Rend characteristic of melee weapons used for attacks that target this unit. Each time this unit uses the 'Rally' command, you can make 1 additional rally roll of D6.",
     "bullets": "[]",
     "lore_text": "Some anticoagulating disease from nearby Aquia has damned these warriors, but those who survive are determined to fight on.",
     "phase_key": "combat"
    },
    {
     "name": "Deepwood Mania",
     "timing": "Passive",
     "effect": "If the unmodified hit roll for an attack made by this unit is 1-4, the attack fails and the attack sequence ends. Th is unit's combat attacks score critical hits on unmodified hit rolls of 5+.",
     "bullets": "[]",
     "lore_text": "Too long fighting in the corrupted jungles has broken these warriors; their shots are hasty and their hacking blows furious but undisciplined.",
     "phase_key": "combat"
    },
    {
     "name": "Parasitic Clusters",
     "timing": "Passive",
     "effect": "Each time this unit is set up on the battlefield as a result of a friendly ability, including during deployment, it must be set up within 1\" of a battlefield edge and more than 9\" from all other units.",
     "bullets": "[]",
     "lore_text": "Hungry, fast-spreading fungal growths cover these warriors from head to toe, seeing them shunned by their peers.",
     "phase_key": "deployment"
    }
   ],
   "Battleplan Rewards": [
    {
     "name": "Sanitised",
     "timing": "Passive",
     "effect": "Add 1 to remediation rolls for friendly units.",
     "bullets": "[]",
     "lore_text": "Your warriors use the ritual ingredients they have recovered to great effect.",
     "source_note": "Reward: Thyria's Bounty"
    },
    {
     "name": "Expert Garrison",
     "timing": "Once Per Battle (Army), Any Combat Phase",
     "declare": "Pick a friendly unit wholly within 3\" of a terrain feature or objective to be the target.",
     "effect": "For the rest of the turn, add 1 to save rolls for the target while it is wholly within 3\" of a terrain feature or objective.",
     "bullets": "[]",
     "lore_text": "These warriors are highly skilled at fighting front defensive positions.",
     "phase_key": "combat",
     "source_note": "Reward: Forest Fortress"
    },
    {
     "name": "Tactical Repositioning",
     "timing": "Once Per Battle (Army), Enemy Hero Phase",
     "declare": "Pick a friendly unit that is not in combat to be the target.",
     "effect": "The target can move 2D6\". It cannot move into combat during any part of that move.",
     "bullets": "[]",
     "keywords": "MOVE, RUN",
     "lore_text": "These sure-footed warriors can shift their position at speed.",
     "phase_key": "hero phase",
     "source_note": "Reward: A Dense and Choking Maze"
    },
    {
     "name": "Wyrdron Seed",
     "timing": "Once Per Battle (Army), Any Shooting Phase",
     "declare": "Pick a visible enemy unit within 9\" of a friendly HERO to be the target.",
     "effect": "Roll a dice. On a 1-2, for the rest of the turn, subtract 1 from the number of dice rolled when making charge rolls for the target, to a minimum of 1. On a 3+, inflict an amount of mortal damage on the target equal to the roll.",
     "bullets": "[]",
     "lore_text": "When thrown at a foe, these unassuming seeds burst open to release fast-growing and sharp-thorned vines that can entangle limbs or shred skin.",
     "phase_key": "charge,shooting",
     "source_note": "Reward: Cursed Kernel"
    },
    {
     "name": "Defiant In The Face Of Danger",
     "timing": "Once Per Battle (Army), Any Hero Phase",
     "declare": "Pick an enemy unit to be the target.",
     "effect": "For the rest of the turn, other than the Companion weapon ability, weapon abilities for the target's attacks have no effect.",
     "bullets": "[]",
     "lore_text": "The determination of these warriors sees them brush aside the enemy's deadliest weapons.",
     "phase_key": "hero phase",
     "source_note": "Reward: Escort to the Wellspring Grove"
    },
    {
     "name": "Proven Survivors",
     "timing": "Once Per Battle (Army), Start of Any Turn",
     "declare": "Pick a friendly unit to be the target.",
     "effect": "The target has WARD (5+) for the rest of the turn.",
     "bullets": "[]",
     "lore_text": "These warriors have overcome some of the foulest perils that the Thyrian jungle can throw at them.",
     "phase_key": "combat",
     "source_note": "Reward: Nexuses of Contamination"
    },
    {
     "name": "Dauntles",
     "timing": "Once Per Battle (Army), Deployment Phase",
     "declare": "Pick up to D3 friendly units to be the targets.",
     "effect": "Each target can use the 'Normal Move' ability as if it were your movement phase.",
     "bullets": "[]",
     "lore_text": "Brimming with self-confidence, these warriors make the first decisive move.",
     "phase_key": "movement,deployment",
     "source_note": "Reward: Precarious Crossing"
    },
    {
     "name": "Spiteful Attitude",
     "timing": "Once Per Battle (Army), Any Combat Phase",
     "declare": "Pick a friendly unit to be the target.",
     "effect": "For the rest of the phase, subtract 1 from wound rolls for combat attacks that target that unit.",
     "bullets": "[]",
     "lore_text": "The contempt that these warriors have for their enemies is another layer of defence.",
     "phase_key": "combat",
     "source_note": "Reward: Emergency Foraging"
    },
    {
     "name": "One With Thyria",
     "timing": "Once Per Battle (Army), Enemy Hero Phase",
     "declare": "Pick an enemy HERO within 18\" of your general and visible to them to be the target.",
     "effect": "For the rest of the turn, subtract 1 from save rolls and ward rolls for the target.",
     "bullets": "[]",
     "lore_text": "Attuned as they are to the call ofThyria, your general entreats the land's spirits to aid them as they provide worthy tribute.",
     "phase_key": "hero phase,combat",
     "source_note": "Reward: The Call of Sacrifice"
    },
    {
     "name": "Empowered By Ghyran",
     "timing": "Once Per Battle (Army), Deployment Phase",
     "declare": "Pick a friendly non-BLADES OF KHORNE HERO to be the target.",
     "effect": "If the target is a WIZARD or PRIEST, add 1 to the target's power level for the rest of the battle. If the target is not a WIZARD or PRIEST, pick either the WIZARD (1) or PRIEST (1) keyword. The target has that keyword for the rest of the battle.",
     "bullets": "[]",
     "lore_text": "Having stood close to a ley line surging with power, this hero has been flooded with Ghyranite energy.",
     "phase_key": "deployment",
     "source_note": "Reward: Vital Alignment"
    },
    {
     "name": "Briarseed Blessings",
     "timing": "Once Per Battle (Army), Any Combat Phase",
     "declare": "Pick a friendly unit that charged this turn to be the target.",
     "effect": "Roll a D3 and apply the corresponding effect for the rest of the turn: 1: Add 1 to the Attacks characteristic of the target's melee weapons. 2: Add 1 to the Rend characteristic of the target's melee weapons. 3: Add 1 to the Damage characteristic of the target's melee weapons.",
     "bullets": "[]",
     "lore_text": "Eating one of these knobbly, enierald- green buds can grant a temporary rush of strength.",
     "phase_key": "combat",
     "source_note": "Reward: Creeping Rootstalks"
    }
   ]
  }
 }
};

export default BATTLEPACKS;
