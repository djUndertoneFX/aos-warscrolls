import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AbilityCard, getPhaseStyle } from './WarscrollGW';

function parseFormationBullets(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// "WAR MACHINE" -> "War Machine", for the Anti-X unit-type picker buttons —
// the applied ability text itself stays fully uppercase (matches every real
// scraped "Anti-X (+1 Rend)" weapon ability already in the database).
function titleCaseKeyword(s) {
  return s.replace(/\S+/g, w => w.charAt(0) + w.slice(1).toLowerCase());
}

// The 8 Mortal Realms. Descriptions below are general, widely-known setting
// lore written for this UI — NOT verbatim text quoted from a GW rulebook.
// We don't have a book excerpt describing each realm to draw authentic
// flavor text from; if one gets photographed, swap these in.
const REALMS = [
  { key: 'aqshy',  name: 'Aqshy',  epithet: 'the Realm of Fire', realmstone: 'Emberstone',
    desc: 'A realm of ceaseless war and raw aggression, its skies choked with ash and its rivers running molten. Aqshy grants strength and fury to those who call it home.' },
  { key: 'chamon', name: 'Chamon', epithet: 'the Realm of Metal', realmstone: 'Chamonite',
    desc: 'A realm of alchemy and artifice, where mountains of gold and seas of mercury reshape reality itself. Its magic favours makers of war-engines and wielders of arcane technology.' },
  { key: 'ghur',   name: 'Ghur',   epithet: 'the Realm of Beasts', realmstone: 'Amberbone',
    desc: 'A savage wilderness realm of monstrous beasts and endless hunts, where only the strong survive and predator and prey are locked in eternal struggle.' },
  { key: 'ghyran', name: 'Ghyran', epithet: 'the Realm of Life', realmstone: 'Cyclestone',
    desc: 'A verdant realm of overwhelming growth and rebirth, its jungles and swamps teeming with life — though also with the rot and pestilence that feed on it.' },
  { key: 'hysh',   name: 'Hysh',   epithet: 'the Realm of Light', realmstone: 'Aetherquartz',
    desc: 'A realm of order, knowledge, and illumination, where the light of civilisation battles endlessly against encroaching darkness and the perils of hubris.' },
  { key: 'shyish', name: 'Shyish', epithet: 'the Realm of Death', realmstone: 'Grave-sand',
    desc: 'A realm of ancient ruins and endless twilight, where time itself runs strangely and the dead do not always stay buried.' },
  { key: 'ulgu',   name: 'Ulgu',   epithet: 'the Realm of Shadow', realmstone: 'Falsestone',
    desc: 'A realm of deception and mist-shrouded illusion, where nothing is quite as it seems and shadow conceals both refuge and ambush.' },
  { key: 'azyr',   name: 'Azyr',   epithet: 'the Realm of Heavens', realmstone: 'Celestium',
    desc: 'The celestial realm of Sigmar and his Stormcast Eternals, a bastion of order among the stars from which the God-King directs the reconquest of the Mortal Realms.' },
];

// Generic starting Hero baseline shared by every Path to Glory warlord
// (Ascension battlepack core rules) — see the warlordMove/Health/Save/Control
// state comment in PathToGloryWizard for why this isn't scraped per-faction.
const GENERIC_WARLORD_PROFILE = { move: '6"', health: '5', save: '5+', control: '2' };

const STEPS = [
  'Select your Campaign',
  'Pick your Faction',
  'Train your Warlord',
  'Pick your Warlord Path',
  'Add your Starting units',
  'Add your Enhancements',
  'Add your Lores',
  'Pick your First Quest',
  'Prepare for Battle',
];

// GW currently publishes 3 Path to Glory battlepacks — only Ascension's core
// rules are implemented so far, so the other two are shown but disabled.
const CAMPAIGNS = [
  { key: 'ascension',    name: 'Ascension',                 desc: 'The core Path to Glory campaign — forge your warlord’s rise to legend.', available: true },
  { key: 'ravaged-coast', name: 'Ravaged Coast',             desc: 'A narrative Path to Glory battlepack.', available: false },
  { key: 'blighted-wilds', name: 'Blighted Wilds',           desc: 'A narrative Path to Glory battlepack.', available: false },
  { key: 'custom',        name: 'Foreign War of Aggression', desc: 'A custom, homebrew campaign of your own design.', available: true, custom: true },
];

// Starting points limit per campaign, per the core rules (Ascension: pg 237,
// "combined points value... cannot exceed 1000 points"). Add entries here
// once Ravaged Coast/Blighted Wilds limits are known — auto-fills the Army
// Roster's Points Limit field when that campaign is picked.
const CAMPAIGN_POINTS_LIMITS = {
  ascension: '1000',
};

// Per-faction Warlord-creation steps ("Path to Glory: The Anvil of
// Apotheosis") are fetched live from /api/apotheosis/:slug — scraped from
// each faction's own battletome section (backend/scrapePathToGlory.js).
// ~18 of 24 factions currently publish this (AoS 4e battletome-dependent);
// the rest fall back to the plain single-panel Warlord Warscroll form.

// The 4 Warlord Paths (core rules pgs 236-261) — Mage/Devout are restricted
// to Wizard/Priest warlords respectively. Warrior/Leader's full 4-rank
// ability data (pgs 256-257) is transcribed directly from the user's own
// photographs; Mage/Devout (pgs 258-261) haven't been photographed yet, so
// those two stay flavor-text-only until they are — same "no ranks means no
// rank-picker section" fallback as FACTION_PATHS entries without data.
const PATHS = [
  { key: 'warrior', name: 'Path of the Warrior', restricted: null,
    desc: 'Warlords who walk this Path pride their martial prowess and strength above all else.',
    ranks: [
      { rank: 'Aspiring', options: [
        { name: 'Berserker', timing: 'Passive', phase_key: 'charge', lore_text: 'This battle-hungry warrior is ever eager to get to grips with the foe.', effect: 'You can re-roll charge rolls for this Hero.' },
        { name: 'Well of Strength', timing: 'Once Per Battle, Any Combat Phase', lore_text: 'When faced with seemingly insurmountable odds, this warrior draws on hidden strength to rise to the challenge.', effect: 'Heal (D6) this Hero.' },
      ] },
      { rank: 'Elite', options: [
        { name: 'Martial Expertise', timing: 'Passive', phase_key: 'combat', lore_text: 'This warrior has honed their skills with their favoured weapon.', effect: "Add 1 to hit rolls for this Hero's combat attacks." },
        { name: 'Powerful Presence', timing: 'End of Any Turn', lore_text: 'So imposing is this warrior that enemies quail before them.', declare: 'Pick this Hero to use this ability if it is contesting an objective that you do not control.', effect: "Add D3 to this Hero's control score this turn." },
      ] },
      { rank: 'Mighty', options: [
        { name: 'Master-crafted Armour', timing: 'Passive', phase_key: 'combat', lore_text: 'This warrior now bears armour forged by the greatest smiths.', effect: 'Add 1 to save rolls for this Hero.' },
        { name: 'Master-crafted Weapons', timing: 'Passive', phase_key: 'combat', lore_text: "The craftsmanship of this warrior's weapons is peerless.", effect: "Add 1 to the Rend characteristic of this Hero's melee weapons." },
      ] },
      { rank: 'Legendary', options: [
        { name: 'Warrior Without Equal', timing: 'Passive', phase_key: 'combat', lore_text: 'This warrior is an unstoppable force upon the battlefield.', effect: 'This Hero has Ward (4+).' },
        { name: 'Unparalleled Duellist', timing: 'Passive', phase_key: 'combat', lore_text: 'In a blur of motion, this warrior strikes the foe before they can even raise a weapon in defence.', effect: 'This Hero has Strike-first.' },
      ] },
    ] },
  { key: 'leader', name: 'Path of the Leader', restricted: null,
    desc: 'The tactical acumen of this warlord is their greatest asset. Even in the heat of battle, they can spot weaknesses in the enemy line and exploit them without mercy.',
    ranks: [
      { rank: 'Aspiring', options: [
        { name: 'Tactical Acumen', timing: 'Once Per Battle, Enemy Movement Phase', lore_text: 'This warrior has a deep understanding of the flow of battle and the habits of not only their own fighters but also those of the foe.', declare: 'Pick a friendly unit wholly within 12" of this unit to be the target.', effect: "The target can use the 'Redeploy' command this phase and you do not need to spend any command points for it to do so." },
        { name: 'Conserved Strength', timing: 'End of Any Turn', lore_text: 'This champion manages their strength just as shrewdly as they command their warriors.', effect: 'Heal (1) this Hero.' },
      ] },
      { rank: 'Elite', options: [
        { name: 'Masterful Commander', timing: 'Start of the Battle Round', lore_text: 'With a keen mind, this champion surveys the battlefield and devises a plan of action.', effect: 'Roll a dice. On a 4+, you gain 1 command point.' },
        { name: 'Rousing Orator', timing: 'Passive', lore_text: 'The stirring rhetoric of this champion inspires the warriors they command.', effect: 'Add 1 to rally rolls for friendly units while they are wholly within 12" of this Hero.' },
      ] },
      { rank: 'Mighty', options: [
        { name: 'Defender of the Realm', timing: 'Passive', phase_key: 'combat', lore_text: 'This warrior defends their domain with great valour and might.', effect: 'This Hero has Strike-first while they are wholly within friendly territory.' },
        { name: 'Hardy Constitution', timing: 'Passive', phase_key: 'combat', lore_text: 'Only the most grievous of wounds can lay this warrior low.', effect: 'Add 2 to the Health characteristic of this Hero.' },
      ] },
      { rank: 'Legendary', options: [
        { name: 'Destined for Greatness', timing: 'Passive', phase_key: 'combat', lore_text: 'It is said the gods look favourably upon this one.', effect: 'This Hero has Ward (4+).' },
        { name: 'Inspiring Leader', timing: 'Passive', lore_text: 'So renowned is this legendary warrior that they inspire all under their command to give everything they have in battle.', effect: 'Add 3 to the control scores of other friendly units while they are contesting the same objective as this Hero.' },
      ] },
    ] },
  { key: 'mage', name: 'Path of the Mage', restricted: 'Wizard only',
    desc: 'To walk this Path, your warlord must already have some proficiency in the arcane arts. By the end, they will be able to shape the very realms.' },
  { key: 'devout', name: 'Path of the Devout', restricted: 'Priest only',
    desc: 'With an unshakable faith to guide them, this warlord has been chosen by their patron deity for a greater purpose (or so they claim!).' },
];

// The 6 core-rulebook Quests (pg 241), for "Pick your First Quest" — full
// text transcribed from the user's own photographs. lore_text is each
// quest's flavor sentence; effect covers the tracking condition, the
// completion threshold, and the reward all as one paragraph (matches how
// the book itself prints each quest as a single card, not split fields).
const QUESTS = [
  { name: 'Search for the Artefact', lore_text: 'You send your scouts far and wide in search of a powerful relic.',
    effect: 'At the end of each of your turns, you can pick a friendly Hero that is not within friendly territory, is not in combat and is within 1" of a terrain feature. If you do so, roll a dice. On a 4+, that Hero finds a clue and you gain 1 quest point. Once you have gained 3 or more quest points, you can complete this quest. When you do so, you can give 1 artefact of power to an eligible Hero on your Order of Battle.' },
  { name: 'Master Magical Lore', lore_text: 'A wizard in your army seeks to master a mighty spell to aid you in battle.',
    effect: "Each time you make a casting roll of 8+ for a Wizard, you gain 1 quest point. Once you have gained 3 or more quest points, you can complete this quest. When you do so, you can pick 1 spell from a spell lore available to your army's faction and add it to your own spell lore." },
  { name: 'Learn Ancient Scriptures', lore_text: 'You discover archaic texts relating to your deity that date back to the Age of Myth. Deciphering them will allow you to better enact their will in the Mortal Realms.',
    effect: "Each time a friendly Priest is given 4 or more ritual points, you gain 1 quest point. Once you have gained 5 or more quest points, you can complete this quest. When you do so, you can pick 1 prayer from a prayer lore available to your army's faction and add it to your own prayer lore." },
  { name: 'Harness Manifestation', lore_text: 'Your mystics seek to tame the power of a wild manifestation, but they are yet to control it fully.',
    effect: "When you embark on this quest, pick 1 spell or prayer from a manifestation lore available to your army's faction and add it to your own manifestation lore marked as 'Wild'. Each time that spell or prayer is used, roll a dice. On a 1-3, inflict an amount of mortal damage equal to the roll on the unit using the ability. On a 4+, you gain a number of quest points equal to the roll. Once you have gained 10 or more quest points, you can complete this quest. When you do so, the spell or prayer is no longer marked as 'Wild'." },
  { name: 'Seek Glory in Battle', lore_text: 'A band of warriors in your army seek to prove themselves in the fires of battle.',
    effect: 'When you embark on this quest, pick a unit on your Order of Battle to be the Glory Seekers. You can complete this quest the next time you win a major or minor victory and the Glory Seekers took part in the battle and were not destroyed. When you do so, the Glory Seekers earn D3+3 additional renown points.' },
  { name: 'Rise of a Champion', lore_text: 'An aspiring warrior under your command seeks to prove their mettle in the fires of battle.',
    effect: 'When you embark on this quest, pick 1 Hero on your Order of Battle that does not yet have a heroic trait to be your Rising Champion. You can complete this quest if an enemy Hero or Monster was slain by your Rising Champion. When you do so, you can give 1 heroic trait to your Rising Champion.' },
];

// Battletome-specific Warlord Paths, additional to the 4 core ones above —
// keyed by faction_slug, {key, name, restricted, desc, ranks} shape (ranks
// is the extra piece the 4 core PATHS above don't have yet: an array of
// {rank, options: [{name, timing, effect}, {name, timing, effect}]} for
// Aspiring/Elite/Mighty/Legendary, each a straight 1-of-2 pick). No
// battletome PtG section publishes this on Wahapedia (it's a separate
// in-book "Path to Glory" section, not the scraped Anvil of Apotheosis) —
// this one entry is transcribed directly from the user's own photographs
// of the Idoneth Deepkin battletome, pgs 90-91. Everything else stays
// empty/unsourced until photographed the same way.
const FACTION_PATHS = {
  'idoneth-deepkin': [
    {
      key: 'perpetual-deep',
      name: 'Path of the Perpetual Deep',
      restricted: 'Idoneth Deepkin Hero only',
      desc: null,
      ranks: [
        { rank: 'Aspiring', options: [
          { name: 'Blade of the Cythai', timing: 'Passive', phase_key: 'combat', lore_text: 'This warrior has been chosen to wield a rare heirloom blade of the Cythai – a weapon sharp enough to cut a god.', effect: "Add 1 to hit rolls for this unit's combat attacks." },
          { name: 'Blessing of Mathlann', timing: 'Passive', phase_key: 'combat', lore_text: 'This warrior bears the mark of the long-dead god, a sure sign of their fortune and favour.', effect: 'This unit has Ward (6+).' },
        ] },
        { rank: 'Elite', options: [
          { name: 'Void Strike', timing: 'Once Per Battle, Any Combat Phase', lore_text: 'With each swing of their blade, this hero unleashes an icy blast through the ethersea that freezes their foe’s blood in their veins.', effect: "This unit's melee weapons have Crit (Mortal) for the rest of the turn." },
          { name: 'Soul Stealer', timing: 'End of Any Turn', lore_text: 'This warrior is said to siphon the spirits of fallen foes to sustain them in battle.', effect: 'If this unit is in combat, Heal (D3) this unit.' },
        ] },
        { rank: 'Mighty', options: [
          { name: 'Rapid Attacker', timing: 'Passive', phase_key: 'charge', lore_text: 'This mighty warrior ruthlessly hunts down the foes of the Idoneth and is often the first to draw the blood of the enemy.', effect: 'Add 1 to the number of dice rolled when making charge rolls for this unit, to a maximum of 3.' },
          { name: 'Guardian of the Phalanx', timing: 'Once Per Battle, Any Combat Phase', lore_text: 'Those under the command of this hero have learnt to heed their orders meticulously and fight in well-disciplined cohesion.', effect: "For the rest of the turn, add 1 to save rolls for this unit and friendly Namarti units while they are within this unit's combat range." },
        ] },
        { rank: 'Legendary', options: [
          { name: 'Paragon of Battle', timing: 'Any Combat Phase', lore_text: 'This hero has honed their martial prowess across countless battles.', effect: "Pick 1 of this unit's melee weapons. Add D3 to the Attacks characteristic of that weapon for the rest of the turn." },
          { name: 'Ride the Maelstrom', timing: 'Once Per Battle, Your Hero Phase', lore_text: 'At the bidding of this legendary hero, an ethersea vortex is conjured around them and transports them across the battlefield in the blink of an eye.', effect: 'If this unit is not in combat, remove it from the battlefield and set it up again more than 9" from all enemy units.' },
        ] },
      ],
    },
  ],
};

// "Path of the Enclave" (non-Hero Idoneth Deepkin unit only, same
// battletome pgs 90-91) is the unit-side counterpart to Path of the
// Perpetual Deep above — but there's no wizard step for assigning Paths to
// rank-and-file units as they earn renown post-battle (this 9-step wizard
// only covers initial warlord/army creation), so it has nowhere to render
// yet. Data transcribed here so it isn't lost/re-asked-for; wire it up
// wherever unit renown tracking eventually lives.
const IDONETH_PATH_OF_THE_ENCLAVE = {
  name: 'Path of the Enclave',
  restricted: 'non-Hero Idoneth Deepkin unit only',
  ranks: [
    { rank: 'Aspiring', options: [
      { name: 'Reaping Strikes', timing: 'Once Per Battle, Any Combat Phase', lore_text: 'These warriors are veteran soul-raiders who have mastered the swift, clean kill.', effect: "For the rest of the turn, add 1 to wound rolls for this unit's combat attacks that target enemy Infantry units." },
      { name: 'Swift Sea-Raiders', timing: 'Passive', lore_text: 'Few can outmatch the pace of the Idoneth.', effect: "Add 1\" to this unit's Move characteristic." },
    ] },
    { rank: 'Elite', options: [
      { name: 'Deep Stalkers', timing: 'Passive', lore_text: 'Coiling tendrils of deep-sea shadow cling to these warriors, masking them from the enemy.', effect: 'If this unit is a non-reinforced, non-Monster unit, it is not visible to enemy units more than 12" from it. If this unit is a reinforced unit or a Monster, subtract 1 from hit rolls for attacks that target this unit made by units more than 12" from it.' },
      { name: 'The First Wave', timing: 'Deployment Phase', lore_text: 'These elite warriors have earned their name by striking at the very forefront of the Idoneth Phalanxes.', effect: "This unit can immediately use the 'Normal Move' ability as if it were your movement phase." },
    ] },
    { rank: 'Mighty', options: [
      { name: 'Fury of the Sea', timing: 'Passive', lore_text: 'Akin to the surging sea, these warriors race towards the enemy.', effect: 'Add 2 to charge rolls for this unit.' },
      { name: 'Fury of the Storm', timing: 'Passive', lore_text: "Channelling the ocean's rage, these warriors strike with shattering force.", effect: "This unit's melee weapons have Crit (2 Hits)." },
    ] },
    { rank: 'Legendary', options: [
      { name: 'The Crashing Wave', timing: 'Passive', lore_text: 'These warriors smash into their foes like a violent flood, giving them no time to react.', effect: 'This unit has Strike-First.' },
      { name: 'Guarded Stance', timing: 'Passive', lore_text: 'Blows are deflected with skilled parries while these veterans time their perfect strike.', effect: 'This unit has Ward (5+) against damage points inflicted by combat attacks if it has not used a Fight ability in the same phase.' },
    ] },
  ],
};

// Explicit [row, col] placement (1-indexed) for the faction grid, computed
// rather than hardcoded so it self-adjusts when a faction count changes
// (broke before: adding Helsmiths of Hashut as Chaos' 7th faction had no
// 7th coordinate in the old static per-alliance map, so it silently fell
// back to browser auto-flow and landed wherever, visually colliding with
// Death/Destruction's own explicit cells). Left 3 columns cascade Order
// then Death top-to-bottom; right 3 columns cascade Chaos then Destruction
// the same way — matches the book's own Order/Chaos/Death/Destruction
// grouping while tolerating any future per-alliance count change.
function computeFactionGridPositions(factionsByAlliance) {
  const listFor = alliance => factionsByAlliance.find(g => g.alliance === alliance)?.list || [];
  const leftList  = [...listFor('Order'), ...listFor('Death')];
  const rightList = [...listFor('Chaos'), ...listFor('Destruction')];
  const positions = {};
  const place = (list, colOffset) => {
    list.forEach((f, i) => {
      positions[f.faction_slug] = [Math.floor(i / 3) + 1, (i % 3) + 1 + colOffset];
    });
  };
  place(leftList, 0);
  place(rightList, 3);
  return positions;
}

// Tiny (24px-wide, ~400-byte) blur-up placeholders for the 5 scanned page
// images below, inlined as data URIs so they paint instantly with zero
// network round-trip — swapped for the real image once it finishes loading,
// instead of showing a blank box while the 15KB-600KB JPEG is in flight.
const DOC_MICRO = {
  warlord: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEBQL/xAAmEAABBAAEBgMBAAAAAAAAAAABAAIDEQQSIUEFEzEzUXEUgZEi/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAH/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwDfgeyP+OY1pB3GyobiACanZ+KeDNqBJlHjqmAyX3a+lAwYjmTsYJWOzHpSFw2/kR2/Nr4Qg64aLa7XfZUhtXr9LC4Xi5xIXiVohrt8vW/a1BiXEZszfxA6aw9ntCnfOXvYXOFNN0AUIP/Z',
  roster:  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGgAAAgIDAAAAAAAAAAAAAAAAAAQDBQECBv/EACkQAAIBAwMCBAcAAAAAAAAAAAECAwAREgQhMTJBBQZhwRNCUXGS0eH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABURAQEAAAAAAAAAAAAAAAAAAAAB/9oADAMBAAIRAxEAPwDoNEItOGQK5yYtc2PNMiZw23T9hel4Y9g1gSRyRf3qRxj8i/h/aglkYah4gBIhVw1wRY87H0oqCFmMqC1hfstqKBHwppJkkZXOGZFsiOPanUjlzzza4PGZ/VUvl7XINI5YkAuSNvqSauo9XGy8nf0qVW2p+IYw2QUBh0k3orE2piaIgXO47UUR/9k=',
  oob:     'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAECAwQG/8QAJBAAAQMDBAEFAAAAAAAAAAAAAQACEQMSIQQTMUFxBVGRofD/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOt3KbHPbaZB5hVuq3YJNvvaFXaG6qpUE3HGTP1wpbjpm75GFBk11M1HRAjGe58IWp7i6rTaTieIQgQw9/lIfpUTUaHOcZhxlLeaOygNQ+wtMxCFk9R1dMUXQXTGEIj/2Q==',
  army1:   'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEBQH/xAAnEAACAQEHAgcAAAAAAAAAAAABAgADBBESEyEiMQVRFCMyQWGBkf/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A37Jl2VWVVxYnLbn7x/imW43rr8iJsdZCzUssFl9yZTiJIGXT/JAM5tLUtuABw16vzzpCdJAqIBTUa8gwgQ2E+a4FNRzvA5lQXf6vqZnTLSCCzE4dds0FqobmAMBrX5qEd+0ItqqM6kX3CED/2Q==',
  army2:   'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEAgb/xAAlEAACAgECBQUBAAAAAAAAAAABAgARAwQhEhMxUXEFFDJhkYH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOpTVINTlwjHbITvfiabKWNFFrzJlysNZmDBVTiNNQvoI1SC1q1/wSCTX6NXyc0AhqoizX5CWZBbpfS+0ICEzZPeZldiMYY1+CNXhJtSTFEoGdnGzmxtAZUX4krfYQGarIVUHiO28JB6hq15JCu5P3CEf//Z',
};

// Single-pixel average color per scanned page — paints instantly via plain
// CSS (no image decode at all), shown behind the blur-up micro placeholder
// so there's never a blank box even before that ~400-byte data URI resolves.
const DOC_AVG_COLOR = {
  warlord: '#d3d5ce',
  roster:  '#cdcdc4',
  oob:     '#d1d3cc',
  army1:   '#d1d2cc',
  army2:   '#d1d2cb',
};

// The 4 documents a Path to Glory roster is built from. `images` point at
// scans of the official GW sheets (extracted from the PDFs the user
// provided) — used both for the tray thumbnail and the "Image" presentation.
// `micro`/`thumbMicro` are the blur-up placeholders above.
const DOCS = [
  { key: 'warlord', title: 'Warlord Warscroll', images: [{ src: '/ptg/warlord-warscroll.jpg', micro: DOC_MICRO.warlord, avgColor: DOC_AVG_COLOR.warlord }], thumb: '/ptg/warlord-warscroll-thumb.jpg', thumbMicro: DOC_MICRO.warlord, avgColor: DOC_AVG_COLOR.warlord },
  { key: 'roster',  title: 'Path to Glory Roster', images: [{ src: '/ptg/ptg-roster.jpg', micro: DOC_MICRO.roster, avgColor: DOC_AVG_COLOR.roster }], thumb: '/ptg/ptg-roster-thumb.jpg', thumbMicro: DOC_MICRO.roster, avgColor: DOC_AVG_COLOR.roster },
  { key: 'oob',     title: 'Order of Battle', images: [{ src: '/ptg/order-of-battle.jpg', micro: DOC_MICRO.oob, avgColor: DOC_AVG_COLOR.oob }], thumb: '/ptg/order-of-battle-thumb.jpg', thumbMicro: DOC_MICRO.oob, avgColor: DOC_AVG_COLOR.oob },
  { key: 'army',    title: 'Army Roster', images: [{ src: '/ptg/army-roster-1.jpg', micro: DOC_MICRO.army1, avgColor: DOC_AVG_COLOR.army1 }, { src: '/ptg/army-roster-2.jpg', micro: DOC_MICRO.army2, avgColor: DOC_AVG_COLOR.army2 }], thumb: '/ptg/army-roster-1-thumb.jpg', thumbMicro: DOC_MICRO.army1, avgColor: DOC_AVG_COLOR.army1 },
];

// Blur-up progressive image: an average-color fill paints instantly (plain
// CSS, no decode), the tiny inline `micro` placeholder swaps in as soon as
// it decodes (still ~instant, no network), then fades to the real `src`
// once that finishes loading.
function ProgressiveImg({ src, micro, avgColor, alt, className }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`ptg-progressive-img${className ? ' ' + className : ''}`} style={avgColor ? { backgroundColor: avgColor } : undefined}>
      <img src={micro} alt="" aria-hidden="true" className="ptg-progressive-img-micro" />
      <img
        src={src}
        alt={alt}
        className={`ptg-progressive-img-full${loaded ? ' ptg-progressive-img-loaded' : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </span>
  );
}

// All 5 PtG doc scans share the same source aspect ratio (the printed
// page). `.ptg-doc-full-img` sizes its box to a fixed height with
// object-fit:contain (see styles.css comment on that rule for why — avoids
// a scroll-inside-scroll problem), which means the image is pillarboxed or
// letterboxed inside that box depending on the modal's current width vs
// height. A field positioned by simple %-of-container coordinates would
// drift off the actual artwork by however wide those bars are. This hook
// computes the real visible image rect (in px, relative to the measured
// container) so the overlay can be positioned against the image itself,
// not the outer box — recalculated on resize since the bars' width changes
// with viewport/modal width.
const PTG_DOC_ASPECT = 1524 / 1985;
// Always fills the container's full WIDTH (touching both horizontal edges)
// and lets height follow from PTG_DOC_ASPECT — .ptg-doc-page-wrap sets the
// matching CSS `aspect-ratio` so the container's own clientHeight already
// comes out to cw/PTG_DOC_ASPECT with no JS needed to enforce it. No more
// letterbox/pillarbox branching: the box IS the container, so there's
// nothing left over to center. Whatever doesn't fit vertically is handled
// by an ancestor scrolling, not by shrinking the image — see the "reads
// too small" fix this replaced.
function useContainImageBox(containerRef) {
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      setBox({ left: 0, top: 0, width: cw, height: ch });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return box;
}

// A single overlaid text field — `spec` gives position/size as a % of the
// doc image's own dimensions (from useContainImageBox), so it tracks the
// artwork regardless of viewport size or pillarbox/letterbox bars.
// fontSize is expressed as a fraction of the image's rendered width for the
// same reason (a fixed rem value wouldn't scale with the image).
function OverlayField({ box, spec, children }) {
  if (!box.width) return null;
  const style = {
    position: 'absolute',
    left: box.left + (spec.left / 100) * box.width,
    top: box.top + (spec.top / 100) * box.height,
    width: spec.width != null ? (spec.width / 100) * box.width : undefined,
    height: spec.height != null ? (spec.height / 100) * box.height : undefined,
    fontSize: (spec.fontSize ?? 0.016) * box.width,
    textAlign: spec.align || 'left',
    transform: spec.centerX ? 'translateX(-50%)' : undefined,
  };
  return <div className="ptg-doc-overlay-field" style={style}>{children}</div>;
}

// The Officiant Warlord Warscroll's Abilities area — same position/size
// math as OverlayField (spec is left/top/width/height/fontSize, all % of
// the doc image), but renders real phase-banner ability cards grouped
// under a source header (COMPANION/ORIGIN/FLAW/etc.) instead of one plain
// text blob. Deliberately NOT the site's normal AbilityCard component:
// that one is sized in rem (fixed relative to the page), which would look
// wrong at whatever size this scanned image happens to be rendered at —
// everything here is sized in em off a single `fontSize` (in px, computed
// from spec.fontSize * box.width, same fraction-of-image-width convention
// as every other overlay field), so the cards scale exactly like the
// weapon tables and stat wheel do.
function OverlayAbilitiesBlock({ box, spec, groups }) {
  if (!box.width || !groups?.length) return null;
  const style = {
    position: 'absolute',
    left: box.left + (spec.left / 100) * box.width,
    top: box.top + (spec.top / 100) * box.height,
    width: (spec.width / 100) * box.width,
    height: spec.height != null ? (spec.height / 100) * box.height : undefined,
    fontSize: (spec.fontSize ?? 0.019) * box.width,
    overflowY: 'auto',
  };
  return (
    <div className="ptg-doc-overlay-abilities" style={style}>
      {groups.map((g, gi) => (
        <div key={gi} className="ptg-doc-overlay-ability-group">
          <div className="ptg-doc-overlay-ability-group-hdr">{g.header}</div>
          {g.abilities.map((a, ai) => {
            const ps = getPhaseStyle(a);
            return (
              <div key={ai} className="ptg-doc-overlay-ability" style={{ borderColor: ps.border }}>
                {a.timing && (
                  <div className="ptg-doc-overlay-ability-hdr" style={{ background: ps.hdrBg, color: ps.hdrTxt }}>
                    {a.timing.toUpperCase()}
                  </div>
                )}
                <div className="ptg-doc-overlay-ability-body">
                  <div className="ptg-doc-overlay-ability-name">{a.name}</div>
                  {a.declare && <div><strong>Declare: </strong>{a.declare}</div>}
                  {a.effect && <div><strong>Effect: </strong>{a.effect}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Field position tables below are first-pass estimates read off the scanned
// templates (frontend/public/ptg/*.jpg, all 1524x1985) — close, not
// pixel-calibrated. Expect to nudge individual `left`/`top`/`width` values
// after seeing them rendered against the real image.
function centerField(left, top, width, fontSize) {
  return { left, top, width, align: 'center', centerX: true, fontSize };
}

function buildWarlordOverlayFields(d) {
  const fields = [];
  fields.push({ spec: centerField(15.2, 10.0, 10, 0.026), value: d.warlordMove });
  fields.push({ spec: centerField(12.3, 13, 8, 0.026), value: d.warlordHealth });
  fields.push({ spec: centerField(19.5, 13, 8, 0.026), value: d.warlordSave });
  fields.push({ spec: centerField(15.2, 15.0, 10, 0.026), value: d.warlordControl });
  fields.push({ spec: centerField(56, 12.5, 55, 0.056), value: d.warlordName });

  const rangedRowTops = [24.6, 28.6, 32.6];
  (d.rangedWeapons || []).slice(0, 3).forEach((w, i) => {
    const top = rangedRowTops[i];
    const nameVal = [w.name, w.abilities].filter(Boolean).join('\n');
    fields.push({ spec: { left: 10, top, width: 44, fontSize: 0.016 }, value: nameVal });
    fields.push({ spec: centerField(55.5, top, 5.5, 0.016), value: w.rng });
    fields.push({ spec: centerField(61.5, top, 5.5, 0.016), value: w.atk });
    fields.push({ spec: centerField(67.5, top, 5.5, 0.016), value: w.hit });
    fields.push({ spec: centerField(73.5, top, 5.5, 0.016), value: w.wnd });
    fields.push({ spec: centerField(79.5, top, 5.5, 0.016), value: w.rnd });
    fields.push({ spec: centerField(86, top, 6, 0.016), value: w.dmg });
  });

  const meleeRowTops = [36.8, 40.8, 44.8, 48.8];
  (d.meleeWeapons || []).slice(0, 4).forEach((w, i) => {
    const top = meleeRowTops[i];
    const nameVal = [w.name, w.abilities].filter(Boolean).join('\n');
    fields.push({ spec: { left: 10, top, width: 51, fontSize: 0.016 }, value: nameVal });
    fields.push({ spec: centerField(62.5, top, 5.5, 0.016), value: w.atk });
    fields.push({ spec: centerField(68.5, top, 5.5, 0.016), value: w.hit });
    fields.push({ spec: centerField(74.5, top, 5.5, 0.016), value: w.wnd });
    fields.push({ spec: centerField(80.5, top, 5.5, 0.016), value: w.rnd });
    fields.push({ spec: centerField(87, top, 6, 0.016), value: w.dmg });
  });

  // Abilities — the scanned template's own big blank area below the weapon
  // tables (melee weapons' last row ends ~51%, pixel-measured) and above
  // the Keywords footer bar (85.84%-89.42%, pixel-measured via a black-bar
  // pixel scan). `height` clips overflow (scrolls in the Officiant view,
  // which is a real DOM element unlike print) rather than running text on
  // top of the Keywords bar once a hero has accumulated more abilities
  // than fit at a glance. Rendered as real phase-banner ability cards, not
  // plain text — see OverlayAbilitiesBlock/type:'abilities' in DocPage.
  fields.push({ spec: { left: 9, top: 52.5, width: 84, height: 31, fontSize: 0.019 }, value: d.warlordAbilityGroups, type: 'abilities' });

  // top:86.3 sits the first of 2 keyword lines right on the bar's own first
  // ruled line (was top:95 — well past the bar entirely, rendering below
  // it near the page's bottom margin; confirmed via PIL text simulation
  // against the real scan, see [[feedback_overlay_calibration_technique]]).
  const kwText = [d.warlordKeywordsLine1, d.warlordKeywordsLine2].filter(Boolean).join('\n');
  fields.push({ spec: { left: 24, top: 86.3, width: 68, fontSize: 0.015 }, value: kwText });
  return fields;
}

function buildRosterOverlayFields(d) {
  const fields = [];
  fields.push({ spec: { left: 27, top: 19, width: 20, fontSize: 0.022 }, value: d.armyName });
  fields.push({ spec: { left: 52, top: 19, width: 20, fontSize: 0.022 }, value: d.realmOfOrigin === 'custom' ? d.customRealmName : d.realmLabel });
  fields.push({ spec: centerField(76, 18, 16, 0.032), value: d.gloryPoints });
  fields.push({ spec: { left: 27, top: 27.5, width: 20, fontSize: 0.022 }, value: d.factionLabel });
  fields.push({ spec: { left: 52, top: 27.5, width: 20, fontSize: 0.022 }, value: d.battleFormation });

  fields.push({ spec: { left: 9, top: 41, width: 33, fontSize: 0.018 }, value: d.currentQuest });
  fields.push({ spec: { left: 44, top: 41, width: 20, fontSize: 0.018 }, value: d.questPoints });
  fields.push({ spec: { left: 9, top: 46.5, width: 33, fontSize: 0.018 }, value: d.questNotes });
  fields.push({ spec: { left: 44, top: 46.5, width: 20, fontSize: 0.018 }, value: d.questsCompleted });

  fields.push({ spec: { left: 53, top: 38, width: 42, fontSize: 0.015 }, value: d.background });
  fields.push({ spec: { left: 53, top: 46, width: 42, fontSize: 0.015 }, value: d.notableEvents });

  const loreCols = [
    { rows: d.spellLore, left: 9 },
    { rows: d.prayerLore, left: 40 },
    { rows: d.manifestationLore, left: 70 },
  ];
  for (const col of loreCols) {
    (col.rows || []).slice(0, 6).forEach((v, i) => {
      fields.push({ spec: { left: col.left, top: 72.5 + i * 4.15, width: 27, fontSize: 0.015 }, value: v });
    });
  }
  return fields;
}

function buildOobOverlayFields(d) {
  const fields = [];
  fields.push({ spec: { left: 8, top: 17.8, width: 26, fontSize: 0.02 }, value: d.warlordName });
  fields.push({ spec: { left: 37, top: 17.8, width: 24, fontSize: 0.02 }, value: d.warlordWarscroll });
  fields.push({ spec: { left: 64, top: 17.8, width: 14, fontSize: 0.02 }, value: d.warlordRank });
  fields.push({ spec: centerField(80, 17.8, 12, 0.02), value: d.warlordRenown });
  fields.push({ spec: { left: 8, top: 22.5, width: 26, fontSize: 0.018 }, value: d.warlordEnhancements });
  fields.push({ spec: { left: 37, top: 22.5, width: 24, fontSize: 0.018 }, value: d.warlordPathLabel });
  fields.push({ spec: { left: 64, top: 22.5, width: 29, fontSize: 0.018 }, value: d.warlordPathAbility });

  const unitBlockTops = [33.2, 46.2, 59.3, 72.3, 85.3];
  (d.oobUnits || []).slice(0, 5).forEach((u, i) => {
    const row1 = unitBlockTops[i];
    const row2 = row1 + 5;
    fields.push({ spec: { left: 8, top: row1, width: 26, fontSize: 0.018 }, value: u.name });
    fields.push({ spec: { left: 37, top: row1, width: 24, fontSize: 0.018 }, value: u.warscroll });
    fields.push({ spec: { left: 64, top: row1, width: 14, fontSize: 0.018 }, value: u.rank });
    fields.push({ spec: centerField(80, row1, 12, 0.018), value: u.renown });
    fields.push({ spec: { left: 8, top: row2, width: 26, fontSize: 0.016 }, value: u.enhancements });
    fields.push({ spec: { left: 37, top: row2, width: 38, fontSize: 0.016 }, value: u.pathAbility });
    fields.push({ spec: centerField(80, row2, 12, 0.016), value: u.reinforced });
  });
  return fields;
}

// Regiments Table 1 (5 slots: 5-row General's Regiment + two 4-row
// Regiments) live on Army Roster page 1; Regiments 4-5 + Auxiliary Units +
// totals + Notes live on page 2 — matches the printed 2-page split.
function buildArmyOverlayFields(d, pageIndex) {
  const fields = [];
  const regimentRow = (r, top) => {
    if (!r) return;
    fields.push({ spec: { left: 22, top, width: 37, fontSize: 0.017 }, value: r.name });
    fields.push({ spec: centerField(60, top, 8, 0.017), value: r.size });
    fields.push({ spec: { left: 69, top, width: 17, fontSize: 0.017 }, value: r.notes });
    fields.push({ spec: centerField(87, top, 9, 0.017), value: r.points });
  };

  if (pageIndex === 0) {
    fields.push({ spec: { left: 16, top: 15.8, width: 30, fontSize: 0.02 }, value: d.commander });
    fields.push({ spec: { left: 41, top: 15.8, width: 30, fontSize: 0.02 }, value: d.armyRosterName });
    fields.push({ spec: centerField(74, 15.8, 16, 0.02), value: d.pointsLimit });
    fields.push({ spec: { left: 16, top: 23.5, width: 30, fontSize: 0.02 }, value: d.armyRosterFaction });
    fields.push({ spec: { left: 41, top: 23.5, width: 30, fontSize: 0.02 }, value: d.armyRosterFormation });

    const reg1 = d.regiments[0];
    const reg1Tops = [40.7, 43.9, 47.1, 50.3, 53.5];
    (reg1?.units || []).slice(0, 5).forEach((u, i) => regimentRow(u, reg1Tops[i]));

    const reg2 = d.regiments[1];
    const reg2Tops = [60.9, 64.1, 67.3, 70.5];
    (reg2?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg2Tops[i]));

    const reg3 = d.regiments[2];
    const reg3Tops = [80.9, 84.1, 87.3, 90.5];
    (reg3?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg3Tops[i]));
  } else {
    const reg4 = d.regiments[3];
    const reg4Tops = [15.9, 19.1, 22.3, 25.5];
    (reg4?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg4Tops[i]));

    const reg5 = d.regiments[4];
    const reg5Tops = [33.4, 36.6, 39.8, 43];
    (reg5?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg5Tops[i]));

    fields.push({ spec: centerField(80, 50.3, 15, 0.02), value: d.regimentsTotal != null ? `${d.regimentsTotal}pts` : null });

    const auxTops = [61.3, 64.5, 67.7, 70.9, 74.1];
    (d.auxUnits || []).slice(0, 5).forEach((u, i) => regimentRow(u, auxTops[i]));

    fields.push({ spec: centerField(80, 80.3, 15, 0.02), value: d.auxTotal != null ? `${d.auxTotal}pts` : null });
    fields.push({ spec: centerField(80, 83, 15, 0.02), value: d.armyUnitsTotal != null ? `${d.armyUnitsTotal}pts` : null });
    fields.push({ spec: { left: 20, top: 87.5, width: 70, fontSize: 0.017 }, value: d.armyNotes });
  }
  return fields;
}

function buildOverlayFields(docKey, pageIndex, d) {
  switch (docKey) {
    case 'warlord': return buildWarlordOverlayFields(d);
    case 'roster':  return buildRosterOverlayFields(d);
    case 'oob':     return buildOobOverlayFields(d);
    case 'army':    return buildArmyOverlayFields(d, pageIndex);
    default: return [];
  }
}

// One doc page: the scan image plus its live-data overlay. A real component
// (not a plain render-helper closure like the rest of this file's
// render*() functions) because it needs its own useContainImageBox hook —
// hooks can't live in a function that's sometimes not called at all
// (this whole page is skipped whenever presentMode is 'replica').
function DocPage({ img, alt, docKey, pageIndex, data }) {
  const containerRef = useRef(null);
  const box = useContainImageBox(containerRef);
  const fields = buildOverlayFields(docKey, pageIndex, data).filter(f => f.value);
  return (
    <div className="ptg-doc-page-wrap" ref={containerRef} style={{ aspectRatio: PTG_DOC_ASPECT }}>
      <ProgressiveImg src={img.src} micro={img.micro} avgColor={img.avgColor} alt={alt} className="ptg-doc-full-img" />
      <div className="ptg-doc-overlay">
        {fields.map((f, i) => (
          f.type === 'abilities'
            ? <OverlayAbilitiesBlock key={i} box={box} spec={f.spec} groups={f.value} />
            : <OverlayField key={i} box={box} spec={f.spec}>{f.value}</OverlayField>
        ))}
      </div>
    </div>
  );
}

function DocThumb({ doc, active, onClick }) {
  return (
    <button
      className={`ptg-doc-thumb${active ? ' ptg-doc-thumb-active' : ''}`}
      onClick={() => onClick(doc.key)}
      title={`Click to edit your ${doc.title}`}
    >
      <div className="ptg-doc-thumb-header">{doc.title}</div>
      <div className="ptg-doc-thumb-img-wrap">
        <ProgressiveImg src={doc.thumb} micro={doc.thumbMicro} avgColor={doc.avgColor} alt={doc.title} className="ptg-doc-thumb-img" />
      </div>
    </button>
  );
}

function PresentToggle({ mode, onChange }) {
  return (
    <div className="ptg-present-toggle">
      <button className={mode === 'image' ? 'ptg-present-active' : ''} onClick={() => onChange('image')}>Officiant</button>
      <button className={mode === 'replica' ? 'ptg-present-active' : ''} onClick={() => onChange('replica')}>Non Corporeal</button>
    </div>
  );
}

// Closes a dropdown on outside click; shared by the Realm/Faction/Formation pulldowns below.
function useCloseOnOutsideClick(ref, open, onClose) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, ref, onClose]);
}

// Realm of Origin — the 8 Mortal Realms plus a free-text "Custom" option.
// Hovering an option shows its summary/flavor text in a footer panel.
function RealmDropdown({ value, customValue, onChange, onCustomChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);
  useCloseOnOutsideClick(ref, open, () => { setOpen(false); setHovered(null); });

  const selectedRealm = REALMS.find(r => r.key === value);
  const label = value === 'custom' ? (customValue.trim() || 'Custom…') : (selectedRealm ? selectedRealm.name : 'Select a realm…');
  const shown = REALMS.find(r => r.key === (hovered || value));

  return (
    <div className="faction-dropdown" ref={ref}>
      <button type="button" className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu ptg-realm-menu">
          {REALMS.map(r => (
            <div
              key={r.key}
              className={`faction-dropdown-item${value === r.key ? ' selected' : ''}`}
              onMouseEnter={() => setHovered(r.key)}
              onMouseLeave={() => setHovered(null)}
              onMouseDown={() => { onChange(r.key); setOpen(false); setHovered(null); }}
            >
              {r.name}
            </div>
          ))}
          <div
            className={`faction-dropdown-item${value === 'custom' ? ' selected' : ''}`}
            onMouseEnter={() => setHovered(null)}
            onMouseDown={() => { onChange('custom'); setOpen(false); setHovered(null); }}
          >
            Custom…
          </div>
          {shown && (
            <div className="ptg-realm-tooltip">
              <div className="ptg-realm-tooltip-title">{shown.name}, <em>{shown.epithet}</em></div>
              <div className="ptg-realm-tooltip-desc">{shown.desc}</div>
              <div className="ptg-realm-tooltip-stone">Realmstone: <strong>{shown.realmstone}</strong></div>
            </div>
          )}
        </div>
      )}
      {value === 'custom' && (
        <input
          className="ptg-campaign-name-input"
          type="text"
          placeholder="Name your realm…"
          value={customValue}
          onChange={e => onCustomChange(e.target.value)}
        />
      )}
    </div>
  );
}

// Reorders an already-alphabetized list into column-major order for a 2-col
// grid: first half fills column 1 top-to-bottom, second half fills column 2 —
// achieved by interleaving the two halves since the grid itself fills row-major.
function toTwoColumnOrder(arr) {
  const half = Math.ceil(arr.length / 2);
  const out = [];
  for (let i = 0; i < half; i++) {
    out.push(arr[i]);
    if (arr[i + half]) out.push(arr[i + half]);
  }
  return out;
}

// Faction picker for the Path to Glory Roster — a two-column pulldown so all
// ~24 factions are visible at once, no scrolling required.
function FactionPulldown({ factions, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useCloseOnOutsideClick(ref, open, () => setOpen(false));
  const selected = factions.find(f => f.faction_slug === value);
  const colMajorFactions = React.useMemo(() => toTwoColumnOrder(factions), [factions]);
  return (
    <div className="faction-dropdown" ref={ref}>
      <button type="button" className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span>{selected ? selected.faction : 'Select a faction…'}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu faction-dropdown-menu-2col">
          {colMajorFactions.map(f => (
            <div
              key={f.faction_slug}
              className={`faction-dropdown-item${value === f.faction_slug ? ' selected' : ''}`}
              onMouseDown={() => { onChange(f.faction_slug); setOpen(false); }}
            >
              {f.faction}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Battle Formation picker — populated from that faction's actual battle
// formations once a faction is known; hovering an option shows its ability.
function FormationDropdown({ formations, value, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);
  useCloseOnOutsideClick(ref, open, () => { setOpen(false); setHovered(null); });
  const selected = formations.find(f => f.formation_name === value);
  const shown = formations.find(f => f.formation_name === (hovered || value));
  return (
    <div className="faction-dropdown" ref={ref}>
      <button type="button" className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)} disabled={loading}>
        <span>{loading ? 'Loading…' : (selected ? selected.formation_name : (formations.length ? 'Select a formation…' : 'No formations found'))}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu">
          {formations.map(f => (
            <div
              key={f.id}
              className={`faction-dropdown-item${value === f.formation_name ? ' selected' : ''}`}
              onMouseEnter={() => setHovered(f.formation_name)}
              onMouseLeave={() => setHovered(null)}
              onMouseDown={() => { onChange(f.formation_name); setOpen(false); setHovered(null); }}
            >
              {f.formation_name}
              {f.source_note && <span className="gw-formation-source-note"> ({f.source_note})</span>}
            </div>
          ))}
        </div>
      )}
      {open && shown && (
        <div className="ptg-formation-popup">
          <div className="ptg-formation-popup-label">
            {shown.formation_name}
            {shown.source_note && <span className="gw-formation-source-note"> ({shown.source_note})</span>}
          </div>
          <AbilityCard ab={{ ...shown, bullets: parseFormationBullets(shown.bullets) }} keywords={[]} />
        </div>
      )}
    </div>
  );
}

// Generic "list of editable rows" state helper — used for weapon tables,
// Order of Battle units, and Army Roster unit rows.
function useRowList(initial = []) {
  const [rows, setRows] = useState(initial);
  const add = (extra = {}) => setRows(r => [...r, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...extra }]);
  const update = (id, field, value) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  const remove = id => setRows(r => r.filter(x => x.id !== id));
  return [rows, add, update, remove, setRows];
}

const STORAGE_KEY = 'aos-ptg-recruit-wizard';

export default function PathToGloryWizard({ onClose, factions = [] }) {
  // Read once per mount — resumes wherever the user left off last time they
  // opened this wizard (localStorage persists it across close/reopen).
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } })();

  const [step, setStep] = useState(() => saved.step ?? 0);
  const [activeDoc, setActiveDoc] = useState(() => saved.activeDoc ?? null); // null | 'warlord' | 'roster' | 'oob' | 'army'
  const [presentMode, setPresentMode] = useState(() => saved.presentMode ?? 'replica'); // 'image' | 'replica'
  // Whole-modal layout, spans all 9 main steps + their sub-steps and the
  // doc tray — 'single' is the original one-thing-at-a-time layout
  // unchanged; 'dual' moves the doc tray + a live preview of whichever doc
  // is active into a persistent right-hand column (.ptg-wizard-dual-right)
  // while the step flow stays visible on the left. Only actually renders as
  // a side-by-side grid above the CSS breakpoint (desktop-width, see
  // .ptg-wizard-dual in styles.css) — below it, the same markup stacks
  // vertically instead of disappearing, and the toggle button itself is
  // hidden by CSS so iPad/phone users never see an option that wouldn't fit.
  const [wizardViewMode, setWizardViewMode] = useState(() => saved.wizardViewMode ?? 'single');
  // Clicking a blown-up doc image (single view or dual view's preview
  // panel) opens this — a further popup that maximizes both viewport
  // dimensions (not just width like the inline preview) so there's little
  // to no scrolling at all, not persisted (purely a transient "zoomed in"
  // view of whichever doc is currently active).
  const [docLightboxOpen, setDocLightboxOpen] = useState(false);
  const modalRef = useRef(null);
  // Warlord Warscroll print preview — same "gold print ready" light-theme
  // step as Army Builder's Army Roster print button (ArmyBuilderPage.js),
  // reusing its .ab-roster-print-* CSS since it's purely generic despite the
  // name. Only meaningful in Non Corporeal (replica) mode; Officiant (image)
  // mode prints straight from the on-screen scan, no preview step needed.
  const [warlordPrintPreview, setWarlordPrintPreview] = useState(false);

  // ── Step 0: Campaign ──
  const [campaign, setCampaign] = useState(() => saved.campaign ?? null);
  const [customCampaignName, setCustomCampaignName] = useState(() => saved.customCampaignName ?? '');

  // ── Step 1: Faction ──
  const [selectedFaction, setSelectedFaction] = useState(() => saved.selectedFaction ?? null);

  // ── Step 2: Pick your Warlord (faction-specific sub-steps, when known) ──
  const [warlordSubStep, setWarlordSubStep] = useState(() => saved.warlordSubStep ?? 0);

  // ── Warlord Warscroll ──
  const [warlordName, setWarlordName] = useState(() => saved.warlordName ?? '');
  const [warlordKeywordsLine1, setWarlordKeywordsLine1] = useState(() => saved.warlordKeywordsLine1 ?? '');
  const [warlordKeywordsLine2, setWarlordKeywordsLine2] = useState(() => saved.warlordKeywordsLine2 ?? '');
  const [rangedWeapons, addRanged, updateRanged, removeRanged, setRangedWeapons] = useRowList(saved.rangedWeapons ?? []);
  const [meleeWeapons, addMelee, updateMelee, removeMelee, setMeleeWeapons] = useRowList(saved.meleeWeapons ?? []);
  // Every Path to Glory warlord starts from the same generic Hero baseline
  // (6" Move, 5 Health, 5+ Save, 2 Control, no Ward) before Destiny Point
  // purchases customize them in later steps — Wahapedia omits these from the
  // per-faction page (they print as asterisk placeholders there, see
  // parseStartingWeapon's comment in scrapePathToGlory.js) since they're not
  // faction-specific, so the wizard fills them in itself rather than
  // scraping them. Still freely editable in case a faction ever differs.
  const [warlordMove, setWarlordMove] = useState(() => saved.warlordMove ?? '');
  const [warlordHealth, setWarlordHealth] = useState(() => saved.warlordHealth ?? '');
  const [warlordSave, setWarlordSave] = useState(() => saved.warlordSave ?? '');
  const [warlordControl, setWarlordControl] = useState(() => saved.warlordControl ?? '');
  // "Set a Destiny Point Limit" step's 3 options, by index — defaults to the
  // 3rd/highest tier (Ethersea Regent-equivalent: most destiny points, most
  // battle profile points) rather than nothing picked, since the paper form
  // doesn't really have a "no limit chosen" state either.
  const [destinyPointChoice, setDestinyPointChoice] = useState(() => saved.destinyPointChoice ?? 2);
  // "Choose an Archetype" is likewise a genuine single-choice pick (always
  // exactly 1 of the options shown) — defaults to the first archetype
  // listed (Akhelian for Idoneth Deepkin, whatever a faction lists first
  // otherwise) rather than nothing chosen. Picking one rewrites the
  // starting warscroll's weapon/keywords via applyArchetypeChoice below.
  const [archetypeChoice, setArchetypeChoice] = useState(() => saved.archetypeChoice ?? 0);
  // "Choose a Companion" is "up to 1" — genuinely optional, unlike Archetype
  // — so -1 ("Skip Companion") is the sensible default rather than forcing
  // one of the real options. companionChoice is an index into that step's
  // options array, or -1 for skipped.
  const [companionChoice, setCompanionChoice] = useState(() => saved.companionChoice ?? -1);
  // "Pick Your Hero's Origin And/Or Flaw" is up to 1 of EACH, independently
  // — not a single-select group like the others above — so each click just
  // toggles that option on/off within its own group (Origins vs Flaws)
  // rather than forcing a pick or auto-advancing. Keyed by option_group name
  // ("Origins"/"Flaws"), value is the index within that group or null.
  const [originFlawChoice, setOriginFlawChoice] = useState(() => saved.originFlawChoice ?? {});
  // "Choose a Battle Mount" is "up to 1", same shape as Companion — index
  // into that step's options array, or -1 for "Skip Battle Mount".
  const [mountChoice, setMountChoice] = useState(() => saved.mountChoice ?? -1);
  // "Pick any Other Upgrades" is true multi-select ("pick any number", not
  // mutually exclusive) — an array of selected option indices, toggled
  // independently, empty by default.
  const [otherUpgradesChoice, setOtherUpgradesChoice] = useState(() => saved.otherUpgradesChoice ?? []);
  // "Pick any Battle Mount Upgrades" — same shape/semantics as Other
  // Upgrades above (true multi-select, any number, no mutual exclusivity).
  const [battleMountUpgradesChoice, setBattleMountUpgradesChoice] = useState(() => saved.battleMountUpgradesChoice ?? []);
  // Some Other/Battle Mount Upgrade options (e.g. Idoneth's "Focused Hunter")
  // let the player pick which unit-type keyword their hero's weapon gets
  // Anti-X (+1 Rend) against — INFANTRY/CAVALRY/MONSTER/WAR MACHINE/WIZARD/
  // PRIEST (occasionally +HERO) — a pattern repeated near-verbatim across
  // ~13 factions' Anvil of Apotheosis pages. Keyed by option id (in case a
  // faction ever has more than one such option); defaults to the option's
  // first-listed keyword (INFANTRY everywhere seen so far) the moment it's
  // selected. See applyUpgradeWeaponEffect below for how this actually
  // writes "Anti-X (+1 Rend)" onto the targeted weapon's Abilities text.
  const [antiXChoiceByOption, setAntiXChoiceByOption] = useState(() => saved.antiXChoiceByOption ?? {});

  // Per-faction snapshots of the warlord fields above (+ sub-step position),
  // keyed by faction slug — so switching faction A → B → back to A restores
  // exactly where you left off on A, instead of either re-running the
  // auto-fill (clobbering edits) or leaving B's leftover data in place.
  // A faction with no snapshot yet gets auto-filled fresh the first time.
  const [warlordSnapshotsByFaction, setWarlordSnapshotsByFaction] = useState(() => saved.warlordSnapshotsByFaction ?? {});
  const prevSelectedFactionRef = useRef(selectedFaction);

  // ── Path to Glory Roster ──
  const [armyName, setArmyName] = useState(() => saved.armyName ?? '');
  const [heraldryImage, setHeraldryImage] = useState(() => saved.heraldryImage ?? null);
  const [realmOfOrigin, setRealmOfOrigin] = useState(() => saved.realmOfOrigin ?? '');
  const [customRealmName, setCustomRealmName] = useState(() => saved.customRealmName ?? '');
  const [faction, setFaction] = useState(() => saved.faction ?? '');
  const [battleFormation, setBattleFormation] = useState(() => saved.battleFormation ?? '');
  const [gloryPoints, setGloryPoints] = useState(() => saved.gloryPoints ?? '0');
  const [gloryRounds, addGloryRound, updateGloryRoundRow, removeGloryRound] = useRowList(saved.gloryRounds ?? []);
  const [currentQuest, setCurrentQuest] = useState(() => saved.currentQuest ?? '');
  const [questPoints, setQuestPoints] = useState(() => saved.questPoints ?? '');
  const [questNotes, setQuestNotes] = useState(() => saved.questNotes ?? '');
  const [questsCompleted, setQuestsCompleted] = useState(() => saved.questsCompleted ?? '');
  const [background, setBackground] = useState(() => saved.background ?? '');
  const [notableEvents, setNotableEvents] = useState(() => saved.notableEvents ?? '');
  const [spellLore, setSpellLore] = useState(() => saved.spellLore ?? Array(6).fill(''));
  const [prayerLore, setPrayerLore] = useState(() => saved.prayerLore ?? Array(6).fill(''));
  const [manifestationLore, setManifestationLore] = useState(() => saved.manifestationLore ?? Array(6).fill(''));
  const setLoreRow = (setter) => (i, value) => setter(rows => rows.map((r, ri) => ri === i ? value : r));
  // Step 7 "Add your Lores" — clicking a real faction lore card toggles it
  // into (or out of) the same spellLore/prayerLore/manifestationLore arrays
  // the Roster doc's Arcane Tome already edits as free text; adding drops it
  // into the first empty of the 6 slots, removing clears whichever slot it
  // was in. A full lore (no empty slot left) silently no-ops on add, same
  // as the physical form having no room.
  const toggleLoreCard = (rows, setter, name) => {
    if (rows.includes(name)) { setter(prev => prev.map(r => r === name ? '' : r)); return; }
    const idx = rows.findIndex(r => !r.trim());
    if (idx === -1) return;
    setter(prev => prev.map((r, i) => i === idx ? name : r));
  };

  // Effective faction slug driving the Roster's Faction dropdown default and
  // the Battle Formation lookup: explicit Roster pick wins, else fall back
  // to whatever was chosen back in Step 2.
  const effectiveFactionSlug = faction || selectedFaction || '';

  // Adding/editing a round's glory points ADDS the delta to the running
  // total (not overwrite), so manual spending between rounds is preserved.
  const gloryRoundsSum = gloryRounds.reduce((sum, r) => sum + (parseInt(r.value, 10) || 0), 0);
  const prevGloryRoundsSumRef = useRef(gloryRoundsSum);
  useEffect(() => {
    const delta = gloryRoundsSum - prevGloryRoundsSumRef.current;
    if (delta !== 0) setGloryPoints(gp => String((parseInt(gp, 10) || 0) + delta));
    prevGloryRoundsSumRef.current = gloryRoundsSum;
  }, [gloryRoundsSum]);

  // All faction-info slides for the currently-known faction — Battle
  // Formations (Roster's "Battle Formation" dropdown), plus Heroic Traits/
  // Artefacts (Step 6 Enhancements) and Spell/Prayer/Manifestation Lore
  // (Step 7 Lores). One fetch, same shape GET /api/faction-rules/:slug
  // already returns for WarscrollsPage's purple-bullet info dots.
  const [factionRules, setFactionRules] = useState({ formations: [], heroic_traits: [], artefacts: [], spell_lore: [], prayer_lore: [], manifestation_lore: [] });
  const [formationsLoading, setFormationsLoading] = useState(false);
  useEffect(() => {
    if (!effectiveFactionSlug) { setFactionRules({ formations: [], heroic_traits: [], artefacts: [], spell_lore: [], prayer_lore: [], manifestation_lore: [] }); return; }
    setFormationsLoading(true);
    axios.get(`/api/faction-rules/${effectiveFactionSlug}`)
      .then(res => setFactionRules(res.data))
      .catch(() => setFactionRules({ formations: [], heroic_traits: [], artefacts: [], spell_lore: [], prayer_lore: [], manifestation_lore: [] }))
      .finally(() => setFormationsLoading(false));
  }, [effectiveFactionSlug]);
  const formations = factionRules.formations ?? [];

  // Path to Glory "Anvil of Apotheosis" warlord-creation steps, scraped
  // per-faction (only ~18 of 24 factions currently publish this — it's tied
  // to that faction's AoS 4e battletome). Empty array means unsourced;
  // "Train your Warlord" falls back to the plain Warlord Warscroll form.
  const [apotheosisSteps, setApotheosisSteps] = useState([]);
  const [apotheosisLoading, setApotheosisLoading] = useState(false);
  useEffect(() => {
    if (!effectiveFactionSlug) { setApotheosisSteps([]); return; }
    setApotheosisLoading(true);
    axios.get(`/api/apotheosis/${effectiveFactionSlug}`)
      .then(res => setApotheosisSteps(res.data.steps ?? []))
      .catch(() => setApotheosisSteps([]))
      .finally(() => setApotheosisLoading(false));
  }, [effectiveFactionSlug]);

  // Step 5 "Add your Starting Units" — every real troop choice belonging to
  // the known faction (server-side faction_slug filter; terrain/
  // manifestations excluded client-side since they're not the kind of
  // "unit" this step's Train/Reinforce picker is for).
  const [factionUnits, setFactionUnits] = useState([]);
  const [factionUnitsLoading, setFactionUnitsLoading] = useState(false);
  useEffect(() => {
    if (!effectiveFactionSlug) { setFactionUnits([]); return; }
    setFactionUnitsLoading(true);
    axios.get('/api/warscrolls', { params: { faction: effectiveFactionSlug, pageSize: 9999 } })
      .then(res => setFactionUnits((res.data.data ?? []).filter(r => !r.is_terrain && !r.is_manifestation)))
      .catch(() => setFactionUnits([]))
      .finally(() => setFactionUnitsLoading(false));
  }, [effectiveFactionSlug]);

  // { [warscrollId]: { train, reinforce } } — Train/Reinforce counts for
  // the starting roster, same shape/semantics as Army Builder's own
  // `roster` state (ArmyBuilderPage.js): reinforced = 2x models AND 2x
  // points. Both setters derive entirely from `prev` inside the functional
  // updater (never the outer closure) so two rapid clicks before a
  // re-render can't drop one — see [[feedback_react_stale_closure_gotchas]].
  const [startingUnits, setStartingUnits] = useState(() => saved.startingUnits ?? {});
  const bumpStartingUnitCount = (id, field, delta) => {
    setStartingUnits(prev => {
      const prevSel = prev[id] ?? { train: 0, reinforce: 0 };
      const n = Math.max(0, (prevSel[field] || 0) + delta);
      const nextSel = { ...prevSel, [field]: n };
      const next = { ...prev };
      if ((nextSel.train || 0) + (nextSel.reinforce || 0) > 0) next[id] = nextSel;
      else delete next[id];
      return next;
    });
  };
  const startingUnitsTotal = React.useMemo(() => {
    let sum = 0;
    for (const [id, sel] of Object.entries(startingUnits)) {
      const unit = factionUnits.find(u => String(u.id) === String(id));
      if (!unit) continue;
      const pts = parseInt(unit.points, 10) || 0;
      sum += (sel.train || 0) * pts + (sel.reinforce || 0) * pts * 2;
    }
    return sum;
  }, [startingUnits, factionUnits]);

  // Applies the chosen Archetype on top of the faction's baseline starting
  // warscroll (Step 2's starting_weapon/starting_keywords) — always
  // re-derives from that baseline rather than editing in place, so
  // switching between archetypes lands on the right result instead of
  // stacking a previous pick's changes on top. `step2`/`step3` are the raw
  // step objects from GET /api/apotheosis/:slug (step3.options is the
  // Archetype list). Weapon overrides come from bullet lines shaped like
  // "Thalassic Weapon — Atk 5, Hit 3+, Wnd 4+, Rnd 1, Dmg 2"; keyword
  // grants come from effect text shaped like "has the X and Y keywords".
  const applyArchetypeChoice = (step2, step3, idx) => {
    const baseWeapon = step2?.starting_weapon;
    const baseKwLine1 = step2?.starting_keywords?.[0] || [];
    const opt = step3?.options?.[idx];
    if (baseWeapon) {
      const reset = rows => rows.map(r => r.name?.trim().toLowerCase() === baseWeapon.name.trim().toLowerCase()
        ? { ...r, rng: baseWeapon.rng || '', atk: baseWeapon.atk || '', hit: baseWeapon.hit || '', wnd: baseWeapon.wnd || '', rnd: baseWeapon.rnd || '', dmg: baseWeapon.dmg || '' }
        : r);
      setMeleeWeapons(reset);
      setRangedWeapons(reset);
    }
    const addedKeywords = [];
    if (opt) {
      const bullets = Array.isArray(opt.bullets) ? opt.bullets : JSON.parse(opt.bullets || '[]');
      for (const b of bullets) {
        const m = b.match(/^(.+?)\s*[—-]\s*Atk\s+([^,]+),\s*Hit\s+([^,]+),\s*Wnd\s+([^,]+),\s*Rnd\s+([^,]+),\s*Dmg\s+(.+)$/i);
        if (!m) continue;
        const [, wname, atk, hit, wnd, rnd, dmg] = m;
        const override = rows => rows.map(r => r.name?.trim().toLowerCase() === wname.trim().toLowerCase()
          ? { ...r, atk: atk.trim(), hit: hit.trim(), wnd: wnd.trim(), rnd: rnd.trim(), dmg: dmg.trim() }
          : r);
        setMeleeWeapons(override);
        setRangedWeapons(override);
      }
      const kwMatch = (opt.effect || '').match(/has the ([A-Z][A-Z0-9 ]*?(?:\s*\(\d+\))?)(?:\s+and\s+(?:the\s+)?([A-Z][A-Z0-9 ]*?(?:\s*\(\d+\))?))?\s+keywords?/);
      if (kwMatch) {
        if (kwMatch[1]) addedKeywords.push(kwMatch[1].trim());
        if (kwMatch[2]) addedKeywords.push(kwMatch[2].trim());
      }
    }
    setWarlordKeywordsLine1([...baseKwLine1, ...addedKeywords].join(', '));
  };

  // Parses a "Name — [Rng X",] Atk N, Hit N+, Wnd N+, Rnd N, Dmg N" bullet
  // into a full weapon row — same spirit as applyArchetypeChoice's own
  // weapon regex above, but for a brand NEW weapon (Companions, Battle
  // Mounts add one to the table) rather than overriding stats on an
  // existing one, so it also captures the optional Rng segment ranged
  // weapons carry (melee weapon bullets omit it entirely).
  const parseNewWeaponBullet = b => {
    const m = /^(.+?),?\s*[—-]\s*(?:Rng\s+([^,]+),\s*)?Atk\s+([^,]+),\s*Hit\s+([^,]+),\s*Wnd\s+([^,]+),\s*Rnd\s+([^,]+),\s*Dmg\s+(.+)$/i.exec(b || '');
    if (!m) return null;
    const [, name, rng, atk, hit, wnd, rnd, dmg] = m;
    return { name: name.trim(), rng: rng?.trim() || '', atk: atk.trim(), hit: hit.trim(), wnd: wnd.trim(), rnd: rnd.trim(), dmg: dmg.trim() };
  };

  // A Companion/Battle Mount pick can add a whole new weapon to the
  // warlord's table (e.g. Idoneth's "Shoal of Zephyrfish" Companion — a
  // genuine ranged weapon, Rng 10"/Atk 8/Hit 4+/Wnd 5+/Rnd 1/Dmg 1), not
  // just abilities/stat changes. Added to rangedWeapons when the bullet
  // carries a Rng segment, meleeWeapons otherwise. Re-picking a different
  // option (or skipping) removes whichever weapon(s) the PREVIOUS pick
  // added, by name, before adding the new one's — so switching never
  // leaves a stale duplicate behind.
  const applyOptionWeapons = (prevOpt, newOpt) => {
    const weaponsOf = opt => {
      if (!opt) return [];
      const bullets = Array.isArray(opt.bullets) ? opt.bullets : JSON.parse(opt.bullets || '[]');
      return bullets.map(parseNewWeaponBullet).filter(Boolean);
    };
    const prevWeapons = weaponsOf(prevOpt);
    const newWeapons = weaponsOf(newOpt);
    if (prevWeapons.length) {
      const prevNames = new Set(prevWeapons.map(w => w.name.toLowerCase()));
      const strip = rows => rows.filter(r => !prevNames.has(r.name?.trim().toLowerCase()));
      setMeleeWeapons(strip);
      setRangedWeapons(strip);
    }
    for (const w of newWeapons) {
      if (w.rng) addRanged(w); else addMelee(w);
    }
  };

  // Fires only on a genuine change of Step 1's faction pick (not on every
  // render, and not on re-clicking the same faction — the ref comparison
  // below is what distinguishes those). Snapshots the warlord fields we're
  // leaving behind under the OLD faction, then either restores a prior
  // snapshot for the NEW faction (if we've visited it before this session)
  // or, for a genuinely new faction, resets to blank and auto-fills the
  // starting weapon/keywords/temp name from the source data.
  useEffect(() => {
    const prevFaction = prevSelectedFactionRef.current;
    const changed = prevFaction !== selectedFaction;

    if (changed && prevFaction) {
      const leaving = { warlordName, warlordKeywordsLine1, warlordKeywordsLine2, rangedWeapons, meleeWeapons, warlordMove, warlordHealth, warlordSave, warlordControl, warlordSubStep, destinyPointChoice, archetypeChoice, companionChoice, originFlawChoice, mountChoice, otherUpgradesChoice, battleMountUpgradesChoice, antiXChoiceByOption };
      setWarlordSnapshotsByFaction(prev => ({ ...prev, [prevFaction]: leaving }));
    }
    prevSelectedFactionRef.current = selectedFaction;

    if (!changed || !selectedFaction) return;

    const existing = warlordSnapshotsByFaction[selectedFaction];
    if (existing) {
      setWarlordName(existing.warlordName ?? '');
      setWarlordKeywordsLine1(existing.warlordKeywordsLine1 ?? '');
      setWarlordKeywordsLine2(existing.warlordKeywordsLine2 ?? '');
      setRangedWeapons(existing.rangedWeapons ?? []);
      setMeleeWeapons(existing.meleeWeapons ?? []);
      setWarlordMove(existing.warlordMove ?? '');
      setWarlordHealth(existing.warlordHealth ?? '');
      setWarlordSave(existing.warlordSave ?? '');
      setWarlordControl(existing.warlordControl ?? '');
      setWarlordSubStep(existing.warlordSubStep ?? 0);
      setDestinyPointChoice(existing.destinyPointChoice ?? 2);
      setArchetypeChoice(existing.archetypeChoice ?? 0);
      setCompanionChoice(existing.companionChoice ?? -1);
      setOriginFlawChoice(existing.originFlawChoice ?? {});
      setMountChoice(existing.mountChoice ?? -1);
      setOtherUpgradesChoice(existing.otherUpgradesChoice ?? []);
      setBattleMountUpgradesChoice(existing.battleMountUpgradesChoice ?? []);
      setAntiXChoiceByOption(existing.antiXChoiceByOption ?? {});

      // Snapshots saved before starting-warscroll auto-fill existed have
      // nothing in these fields even though this faction has apotheosis data
      // — patch them in without touching anything the user may have already
      // customized (a snapshot with any of these already set is left alone).
      const staleSnapshot = !existing.warlordMove && !existing.warlordKeywordsLine1
        && !(existing.rangedWeapons?.length) && !(existing.meleeWeapons?.length);
      if (staleSnapshot) {
        axios.get(`/api/apotheosis/${selectedFaction}`).then(res => {
          const steps = res.data.steps ?? [];
          const step2 = steps.find(s => /fill out the starting warscroll/i.test(s.step_title));
          if (!step2) return;
          if (step2.starting_weapon) {
            const w = step2.starting_weapon;
            const row = { name: w.name, rng: w.rng || '', atk: w.atk || '', hit: w.hit || '', wnd: w.wnd || '', rnd: w.rnd || '', dmg: w.dmg || '' };
            if (w.type === 'ranged') addRanged(row); else addMelee(row);
          }
          if (step2.starting_keywords?.length) {
            setWarlordKeywordsLine1((step2.starting_keywords[0] || []).join(', '));
            setWarlordKeywordsLine2((step2.starting_keywords[1] || []).join(', '));
          }
          setWarlordMove(GENERIC_WARLORD_PROFILE.move);
          setWarlordHealth(GENERIC_WARLORD_PROFILE.health);
          setWarlordSave(GENERIC_WARLORD_PROFILE.save);
          setWarlordControl(GENERIC_WARLORD_PROFILE.control);
          const step3 = steps.find(s => /choose an archetype/i.test(s.step_title));
          if (step3?.options?.length) applyArchetypeChoice(step2, step3, 0);
        }).catch(() => {});
      }
      return;
    }

    // Never visited this faction before — clean slate, then auto-fill from
    // whatever concrete starting data the source actually provides, plus the
    // generic Move/Health/Save/Control baseline every warlord starts with.
    let cancelled = false;
    setWarlordName('');
    setWarlordKeywordsLine1('');
    setWarlordKeywordsLine2('');
    setRangedWeapons([]);
    setMeleeWeapons([]);
    setWarlordMove('');
    setWarlordHealth('');
    setWarlordSave('');
    setWarlordControl('');
    setWarlordSubStep(0);
    setDestinyPointChoice(2);
    setArchetypeChoice(0);
    setCompanionChoice(-1);
    setOriginFlawChoice({});
    setMountChoice(-1);
    setOtherUpgradesChoice([]);
    setBattleMountUpgradesChoice([]);
    setAntiXChoiceByOption({});
    axios.get(`/api/apotheosis/${selectedFaction}`).then(res => {
      if (cancelled) return;
      const steps = res.data.steps ?? [];
      const step2 = steps.find(s => /fill out the starting warscroll/i.test(s.step_title));
      if (step2?.starting_weapon) {
        const w = step2.starting_weapon;
        const row = { name: w.name, rng: w.rng || '', atk: w.atk || '', hit: w.hit || '', wnd: w.wnd || '', rnd: w.rnd || '', dmg: w.dmg || '' };
        if (w.type === 'ranged') addRanged(row); else addMelee(row);
      }
      if (step2?.starting_keywords?.length) {
        setWarlordKeywordsLine1((step2.starting_keywords[0] || []).join(', '));
        setWarlordKeywordsLine2((step2.starting_keywords[1] || []).join(', '));
      }
      if (step2) {
        setWarlordMove(GENERIC_WARLORD_PROFILE.move);
        setWarlordHealth(GENERIC_WARLORD_PROFILE.health);
        setWarlordSave(GENERIC_WARLORD_PROFILE.save);
        setWarlordControl(GENERIC_WARLORD_PROFILE.control);
      }
      const step3 = steps.find(s => /choose an archetype/i.test(s.step_title));
      if (step3?.options?.length) applyArchetypeChoice(step2, step3, 0);
      const factionObj = factions.find(f => f.faction_slug === selectedFaction);
      setWarlordName(`${factionObj ? factionObj.faction : selectedFaction} Hero`);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedFaction]); // eslint-disable-line

  // One-time migration, mount only: the effect above only backfills a
  // faction when you SWITCH to it during this session — a returning user
  // who already had a faction selected when the wizard loaded never
  // triggers that "changed" check at all, so their saved-before-this-fix
  // blank Move/Health/Save/Control/keywords would otherwise stay blank
  // forever. Runs once against whatever faction was already active at
  // mount; a no-op for anyone whose starting warscroll is already filled.
  const mountFactionRef = useRef(saved.selectedFaction ?? null);
  useEffect(() => {
    const mountFaction = mountFactionRef.current;
    if (!mountFaction) return;
    const needsBackfill = !warlordMove && !warlordKeywordsLine1 && rangedWeapons.length === 0 && meleeWeapons.length === 0;
    if (!needsBackfill) return;
    axios.get(`/api/apotheosis/${mountFaction}`).then(res => {
      const steps = res.data.steps ?? [];
      const step2 = steps.find(s => /fill out the starting warscroll/i.test(s.step_title));
      if (!step2) return;
      if (step2.starting_weapon) {
        const w = step2.starting_weapon;
        const row = { name: w.name, rng: w.rng || '', atk: w.atk || '', hit: w.hit || '', wnd: w.wnd || '', rnd: w.rnd || '', dmg: w.dmg || '' };
        if (w.type === 'ranged') addRanged(row); else addMelee(row);
      }
      if (step2.starting_keywords?.length) {
        setWarlordKeywordsLine1((step2.starting_keywords[0] || []).join(', '));
        setWarlordKeywordsLine2((step2.starting_keywords[1] || []).join(', '));
      }
      setWarlordMove(GENERIC_WARLORD_PROFILE.move);
      setWarlordHealth(GENERIC_WARLORD_PROFILE.health);
      setWarlordSave(GENERIC_WARLORD_PROFILE.save);
      setWarlordControl(GENERIC_WARLORD_PROFILE.control);
      const step3 = steps.find(s => /choose an archetype/i.test(s.step_title));
      if (step3?.options?.length) applyArchetypeChoice(step2, step3, 0);
    }).catch(() => {});
  }, []); // eslint-disable-line

  const heraldryInputRef = useRef(null);
  const handleHeraldryFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 300;
        let { width, height } = img;
        if (width > height) { if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; } }
        else { if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        setHeraldryImage(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ── Order of Battle ──
  const [warlordWarscroll, setWarlordWarscroll] = useState(() => saved.warlordWarscroll ?? '');
  const [warlordRank, setWarlordRank] = useState(() => saved.warlordRank ?? 'Aspiring');
  const [warlordRenown, setWarlordRenown] = useState(() => saved.warlordRenown ?? '5');
  const [warlordEnhancements, setWarlordEnhancements] = useState(() => saved.warlordEnhancements ?? '');
  const [warlordPath, setWarlordPath] = useState(() => saved.warlordPath ?? null);
  const [warlordPathAbility, setWarlordPathAbility] = useState(() => saved.warlordPathAbility ?? '');
  // Rank-ability picks for whichever Path is currently chosen (only
  // faction Paths carry real rank data so far — see FACTION_PATHS above).
  // { [rankName]: chosenOptionIndex }. Reset whenever the Path itself
  // changes (a different Path's ranks are a different set of choices, not
  // meant to carry over) and mirrored into warlordPathAbility's free-text
  // field as a readable summary, same field the Order of Battle doc's
  // Warlord row already shows.
  const [warlordPathRankChoices, setWarlordPathRankChoices] = useState(() => saved.warlordPathRankChoices ?? {});
  const pickWarlordPath = key => {
    setWarlordPath(key);
    setWarlordPathRankChoices({});
    setWarlordPathAbility('');
  };
  const pickPathRankOption = (pathRanks, rank, optIdx) => {
    setWarlordPathRankChoices(prev => {
      const next = { ...prev, [rank]: optIdx };
      const summary = pathRanks
        .map(r => (next[r.rank] != null ? r.options[next[r.rank]]?.name : null))
        .filter(Boolean)
        .join(', ');
      setWarlordPathAbility(summary);
      return next;
    });
  };
  const [oobUnits, addOobUnit, updateOobUnit, removeOobUnit, setOobUnits] = useRowList(saved.oobUnits ?? []);
  const oobTotalPoints = oobUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);

  // Step 6 "Add your Enhancements" — pick 1 from each enhancement table
  // (Heroic Traits, Artefacts of Power) and assign it to an eligible Hero.
  // "warlord" or an oobUnits row id; the chosen name is written straight
  // into that target's own Enhancements text field (Warlord Warscroll form
  // or the Order of Battle unit row) — see applyEnhancementPick below.
  const [heroicTraitChoice, setHeroicTraitChoice] = useState(() => saved.heroicTraitChoice ?? null);
  const [heroicTraitAssignee, setHeroicTraitAssignee] = useState(() => saved.heroicTraitAssignee ?? 'warlord');
  const [artefactChoice, setArtefactChoice] = useState(() => saved.artefactChoice ?? null);
  const [artefactAssignee, setArtefactAssignee] = useState(() => saved.artefactAssignee ?? 'warlord');

  // Adds/removes a single enhancement-name tag on whichever target's
  // Enhancements text field it belongs to ('warlord' or an oobUnits row
  // id), same comma-joined-tag approach as the weapon-ability tagging in
  // applyUpgradeWeaponEffect above — safe to call repeatedly since it only
  // ever touches its own tag, never the rest of what's typed there.
  const setEnhancementTag = (target, tag, add) => {
    if (!target || !tag) return;
    const apply = text => {
      const tags = (text || '').split(',').map(s => s.trim()).filter(Boolean).filter(t => t !== tag);
      if (add) tags.push(tag);
      return tags.join(', ');
    };
    if (target === 'warlord') setWarlordEnhancements(apply);
    else setOobUnits(rows => rows.map(r => r.id === target ? { ...r, enhancements: apply(r.enhancements) } : r));
  };

  const pickHeroicTrait = idx => {
    const prevOpt = heroicTraitChoice != null ? factionRules.heroic_traits?.[heroicTraitChoice] : null;
    if (prevOpt) setEnhancementTag(heroicTraitAssignee, prevOpt.name, false);
    setHeroicTraitChoice(idx);
    const opt = factionRules.heroic_traits?.[idx];
    if (opt) setEnhancementTag(heroicTraitAssignee, opt.name, true);
  };
  const reassignHeroicTrait = newTarget => {
    const opt = heroicTraitChoice != null ? factionRules.heroic_traits?.[heroicTraitChoice] : null;
    if (opt) { setEnhancementTag(heroicTraitAssignee, opt.name, false); setEnhancementTag(newTarget, opt.name, true); }
    setHeroicTraitAssignee(newTarget);
  };
  const pickArtefact = idx => {
    const prevOpt = artefactChoice != null ? factionRules.artefacts?.[artefactChoice] : null;
    if (prevOpt) setEnhancementTag(artefactAssignee, prevOpt.name, false);
    setArtefactChoice(idx);
    const opt = factionRules.artefacts?.[idx];
    if (opt) setEnhancementTag(artefactAssignee, opt.name, true);
  };
  const reassignArtefact = newTarget => {
    const opt = artefactChoice != null ? factionRules.artefacts?.[artefactChoice] : null;
    if (opt) { setEnhancementTag(artefactAssignee, opt.name, false); setEnhancementTag(newTarget, opt.name, true); }
    setArtefactAssignee(newTarget);
  };

  // ── Army Roster ──
  const [commander, setCommander] = useState(() => saved.commander ?? '');
  const [armyRosterName, setArmyRosterName] = useState(() => saved.armyRosterName ?? '');
  const [pointsLimit, setPointsLimit] = useState(() => saved.pointsLimit ?? '');
  const [armyRosterFaction, setArmyRosterFaction] = useState(() => saved.armyRosterFaction ?? '');
  const [armyRosterFormation, setArmyRosterFormation] = useState(() => saved.armyRosterFormation ?? '');
  const [regiments, setRegiments] = useState(() => saved.regiments ?? [{ id: 'r1', units: [] }]);
  const [auxUnits, addAuxUnit, updateAuxUnit, removeAuxUnit] = useRowList(saved.auxUnits ?? []);
  const [armyNotes, setArmyNotes] = useState(() => saved.armyNotes ?? '');

  const addRegiment = () => setRegiments(rs => [...rs, { id: `${Date.now()}-${rs.length}`, units: [] }]);
  const removeRegiment = rid => setRegiments(rs => rs.filter(r => r.id !== rid));
  const addRegimentUnit = rid => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: [...r.units, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', size: '', notes: '', points: '' }] }
    : r));
  const updateRegimentUnit = (rid, uid, field, value) => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: r.units.map(u => u.id === uid ? { ...u, [field]: value } : u) }
    : r));
  const removeRegimentUnit = (rid, uid) => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: r.units.filter(u => u.id !== uid) }
    : r));
  const regimentsTotal = regiments.reduce((sum, r) => sum + r.units.reduce((s, u) => s + (parseInt(u.points, 10) || 0), 0), 0);
  const auxTotal = auxUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);
  const armyUnitsTotal = regimentsTotal + auxTotal;

  // Step 9 "Prepare for Battle" — auto-fills the Army Roster doc from
  // everything picked earlier in the wizard: Faction/Battle Formation off
  // the Roster doc's own fields, Army Name if not already set, and every
  // Order of Battle row becomes a regiment unit (matched back against
  // factionUnits by name for its real size/points, since oobUnits itself is
  // free-text with no points field). The Warlord always seeds Regiment 1;
  // each additional Hero row starts its own new regiment (matches the
  // physical sheet's "General's Regiment 1 / Regiment 2.../Hero" shape),
  // non-Hero rows join whichever regiment is currently open. Fully replaces
  // Regiments each run (safe to re-run after adding more OOB units) but
  // never touches Auxiliary Units, which stays manually edited.
  const prepareArmyRoster = () => {
    setArmyRosterFaction(factions.find(f => f.faction_slug === selectedFaction)?.faction || '');
    setArmyRosterFormation(battleFormation || '');
    if (!armyRosterName?.trim() && armyName?.trim()) setArmyRosterName(armyName);

    const warlordUnit = warlordName?.trim() ? {
      id: `${Date.now()}-warlord`,
      name: warlordName,
      size: '1',
      notes: [warlordEnhancements, PATHS.find(p => p.key === warlordPath)?.name].filter(Boolean).join('; '),
      points: '',
    } : null;

    let current = { id: `${Date.now()}-0`, units: warlordUnit ? [warlordUnit] : [] };
    const newRegiments = [current];

    oobUnits.forEach(row => {
      const warscrollName = (row.warscroll || row.name || '').trim();
      if (!warscrollName) return;
      const match = factionUnits.find(fu => fu.name === warscrollName);
      const unit = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: warscrollName,
        size: match?.unit_size || '',
        notes: [row.enhancements, row.pathAbility].filter(Boolean).join('; '),
        points: match?.points || '',
      };
      if (match?.is_hero && current.units.length > 0) {
        current = { id: `${Date.now()}-${newRegiments.length}-${Math.random().toString(36).slice(2)}`, units: [] };
        newRegiments.push(current);
      }
      current.units.push(unit);
    });
    setRegiments(newRegiments);
  };

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        if (docLightboxOpen) setDocLightboxOpen(false);
        else if (warlordPrintPreview) setWarlordPrintPreview(false);
        else onClose();
        return;
      }
      if (activeDoc) return; // arrow keys only navigate wizard steps, not while editing a document
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setStep(s => Math.max(0, s - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setStep(s => Math.min(STEPS.length - 1, s + 1)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, activeDoc, warlordPrintPreview, docLightboxOpen]);

  useEffect(() => {
    const h = e => {
      // The doc lightbox renders as its own backdrop OUTSIDE modalRef (by
      // design, so it can cover the full viewport) — without this guard,
      // clicking its backdrop to close IT was also read as an outside
      // click on the whole wizard, closing the entire "Recruit Your
      // Forces" flow instead of just the zoomed popup.
      if (docLightboxOpen) return;
      if (modalRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose, docLightboxOpen]);

  // Persist the whole wizard on every change, so closing and reopening resumes here.
  useEffect(() => {
    const snapshot = {
      step, activeDoc, presentMode, wizardViewMode, campaign, customCampaignName, selectedFaction, warlordSubStep,
      warlordName, warlordKeywordsLine1, warlordKeywordsLine2, rangedWeapons, meleeWeapons,
      warlordMove, warlordHealth, warlordSave, warlordControl, warlordSnapshotsByFaction, destinyPointChoice, archetypeChoice, companionChoice, originFlawChoice, mountChoice, otherUpgradesChoice, battleMountUpgradesChoice, antiXChoiceByOption,
      armyName, heraldryImage, realmOfOrigin, customRealmName, faction, battleFormation, gloryPoints, gloryRounds,
      currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
      spellLore, prayerLore, manifestationLore,
      warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, warlordPathRankChoices, oobUnits,
      commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
      startingUnits, heroicTraitChoice, heroicTraitAssignee, artefactChoice, artefactAssignee,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  }, [
    step, activeDoc, presentMode, campaign, customCampaignName, selectedFaction, warlordSubStep,
    warlordName, warlordKeywordsLine1, warlordKeywordsLine2, rangedWeapons, meleeWeapons,
    warlordMove, warlordHealth, warlordSave, warlordControl, warlordSnapshotsByFaction, destinyPointChoice, archetypeChoice, companionChoice, originFlawChoice, mountChoice, otherUpgradesChoice, battleMountUpgradesChoice, antiXChoiceByOption,
    armyName, heraldryImage, realmOfOrigin, customRealmName, faction, battleFormation, gloryPoints, gloryRounds,
    currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
    spellLore, prayerLore, manifestationLore,
    warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, warlordPathRankChoices, oobUnits,
    commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
    startingUnits, heroicTraitChoice, heroicTraitAssignee, artefactChoice, artefactAssignee,
  ]);

  const renderWeaponTable = (title, rows, add, update, remove, hasRange) => (
    <div className="ptg-warscroll-table-block">
      <div className="ptg-warscroll-table-title">{title}</div>
      {rows.length > 0 && (
        <div className={`ptg-warscroll-table${hasRange ? ' ptg-warscroll-table-ranged' : ''}`}>
          <div className="ptg-warscroll-table-head">
            <span>Weapon</span>
            {hasRange && <span>Rng</span>}
            <span>Atk</span><span>Hit</span><span>Wnd</span><span>Rnd</span><span>Dmg</span><span />
          </div>
          {rows.map(r => (
            <div className="ptg-warscroll-table-row" key={r.id}>
              <input value={r.name || ''} onChange={e => update(r.id, 'name', e.target.value)} placeholder="Weapon" />
              {hasRange && <input value={r.rng || ''} onChange={e => update(r.id, 'rng', e.target.value)} />}
              <input value={r.atk || ''} onChange={e => update(r.id, 'atk', e.target.value)} />
              <input value={r.hit || ''} onChange={e => update(r.id, 'hit', e.target.value)} />
              <input value={r.wnd || ''} onChange={e => update(r.id, 'wnd', e.target.value)} />
              <input value={r.rnd || ''} onChange={e => update(r.id, 'rnd', e.target.value)} />
              <input value={r.dmg || ''} onChange={e => update(r.id, 'dmg', e.target.value)} />
              <button className="ptg-oob-row-remove" onClick={() => remove(r.id)} title="Remove weapon">✕</button>
              <input
                className="ptg-warscroll-table-abilities"
                value={r.abilities || ''}
                onChange={e => update(r.id, 'abilities', e.target.value)}
                placeholder="Weapon Abilities"
              />
            </div>
          ))}
        </div>
      )}
      <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => add()}>+ Add Weapon</button>
    </div>
  );

  // Shared between the Warlord Warscroll doc editor and the "Pick your
  // Warlord" wizard step, so filling it out in either place stays in sync.
  const renderWarlordForm = () => (
    <>
      <div className="ptg-field">
        <label>Warlord Name</label>
        <input type="text" value={warlordName} onChange={e => setWarlordName(e.target.value)} placeholder="e.g. Iladrien the Bright" />
      </div>
      <div className="ptg-warlord-characteristics">
        <div className="ptg-field"><label>Move</label><input type="text" value={warlordMove} onChange={e => setWarlordMove(e.target.value)} placeholder="—" /></div>
        <div className="ptg-field"><label>Health</label><input type="text" value={warlordHealth} onChange={e => setWarlordHealth(e.target.value)} placeholder="—" /></div>
        <div className="ptg-field"><label>Save</label><input type="text" value={warlordSave} onChange={e => setWarlordSave(e.target.value)} placeholder="—" /></div>
        <div className="ptg-field"><label>Control</label><input type="text" value={warlordControl} onChange={e => setWarlordControl(e.target.value)} placeholder="—" /></div>
      </div>
      {renderWeaponTable('Ranged Weapons', rangedWeapons, addRanged, updateRanged, removeRanged, true)}
      {renderWeaponTable('Melee Weapons', meleeWeapons, addMelee, updateMelee, removeMelee, false)}
      {chosenOptionsSummary.length > 0 && (
        <div className="ptg-warlord-choices-summary">
          {chosenOptionsSummary.map((c, i) => (
            <div key={i} className="ptg-warlord-choice-row">
              <span className="ptg-warlord-choice-label">{c.label}:</span> {c.value}
            </div>
          ))}
        </div>
      )}
      <div className="ptg-field">
        <label>Keywords</label>
        <input type="text" value={warlordKeywordsLine1} onChange={e => setWarlordKeywordsLine1(e.target.value)} placeholder="HERO, INFANTRY, …" />
        <input type="text" value={warlordKeywordsLine2} onChange={e => setWarlordKeywordsLine2(e.target.value)} placeholder="ORDER, IDONETH DEEPKIN, AELF, …" />
      </div>
    </>
  );

  // Step 6 "Add your Enhancements" — one enhancement table (Heroic Traits
  // or Artefacts of Power), single-select pick + an assignee dropdown
  // ('warlord' or any Order of Battle unit added so far). Mirrors the
  // single-select AbilityCard button treatment from renderApotheosisStep.
  const assigneeOptions = [{ value: 'warlord', label: warlordName?.trim() || 'Warlord' },
    ...oobUnits.filter(u => u.name?.trim()).map(u => ({ value: u.id, label: u.name }))];
  const renderEnhancementTable = (title, options, choiceIdx, assignee, onPick, onReassign) => (
    <div className="ptg-enhancement-table">
      <div className="ptg-apotheosis-group-title">{title}</div>
      {(options ?? []).length === 0 ? (
        <div className="ptg-wizard-body-placeholder">No {title} sourced for this faction yet.</div>
      ) : (
        <>
          <div className="ptg-field ptg-enhancement-assignee">
            <label>Assign to</label>
            <select value={assignee} onChange={e => onReassign(e.target.value)}>
              {assigneeOptions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className="ptg-apotheosis-options-grid">
            {options.map((opt, i) => (
              <button
                key={i}
                type="button"
                className={`ptg-apotheosis-option-btn${choiceIdx === i ? ' ptg-apotheosis-option-selected' : ''}`}
                onClick={() => onPick(i)}
              >
                <AbilityCard ab={{ ...opt, bullets: parseFormationBullets(opt.bullets) }} keywords={[]} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // Step 7 "Add your Lores" — one column (Spell/Prayer/Manifestation),
  // real faction cards as toggle buttons, filling into the same 6-slot
  // arrays the Roster doc's Arcane Tome shows. Filled slot count doubles as
  // a lightweight "x/6" progress readout.
  const renderLoreColumn = (title, options, rows, setter) => {
    const filled = rows.filter(r => r.trim()).length;
    return (
      <div className="ptg-lore-column">
        <div className="ptg-apotheosis-group-title">{title} <span className="ptg-lore-count">({filled}/6)</span></div>
        {(options ?? []).length === 0 ? (
          <div className="ptg-wizard-body-placeholder">No {title} sourced for this faction yet.</div>
        ) : (
          <div className="ptg-apotheosis-options-grid">
            {options.map((opt, i) => {
              const selected = rows.includes(opt.name);
              return (
                <button
                  key={i}
                  type="button"
                  className={`ptg-apotheosis-option-btn${selected ? ' ptg-apotheosis-option-selected' : ''}`}
                  onClick={() => toggleLoreCard(rows, setter, opt.name)}
                >
                  <AbilityCard ab={{ ...opt, bullets: parseFormationBullets(opt.bullets) }} keywords={[]} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // "-3DP" -> -3, "+4DP" -> +4, "0DP"/null -> 0. Sign is always explicit in
  // the scraped cost badge text except for the zero case, where it doesn't matter.
  const parseDpAmount = costStr => {
    if (!costStr) return 0;
    const m = String(costStr).match(/([+-]?)(\d+)/);
    if (!m) return 0;
    const n = parseInt(m[2], 10);
    return m[1] === '+' ? n : -n;
  };

  // Running Destiny Point remaining/total across every stateful choice in
  // "Train Your Warlord" — total starts at the chosen DP-limit tier's value
  // and grows with Flaw bonuses (flaws grant extra points to spend
  // elsewhere, per the step's own intro text); remaining is total minus the
  // sum of every consuming pick's cost magnitude — a spend-down, not an
  // accumulator, matching how the paper form tracks it.
  const dpTally = React.useMemo(() => {
    if (!apotheosisSteps.length) return null;
    const dpStepData        = apotheosisSteps.find(s => /destiny point limit/i.test(s.step_title || ''));
    const archetypeStepData = apotheosisSteps.find(s => /choose an archetype/i.test(s.step_title || ''));
    const companionStepData = apotheosisSteps.find(s => /choose a companion/i.test(s.step_title || ''));
    const originFlawStepData = apotheosisSteps.find(s => /origin.*flaw/i.test(s.step_title || ''));
    const mountStepData     = apotheosisSteps.find(s => /choose a battle mount/i.test(s.step_title || ''));
    const mountUpgradesStepData = apotheosisSteps.find(s => /pick any battle mount upgrades/i.test(s.step_title || ''));
    const otherUpgradesStepData = apotheosisSteps.find(s => /pick any other upgrades/i.test(s.step_title || ''));

    let total = 0;
    const dpMatch = /DESTINY POINT LIMIT:\s*(\d+)/i.exec(dpStepData?.options?.[destinyPointChoice]?.effect || '');
    if (dpMatch) total = parseInt(dpMatch[1], 10);

    let spent = 0;
    const applyCost = costStr => {
      const amt = parseDpAmount(costStr);
      if (amt > 0) total += amt; else spent += -amt;
    };

    if (archetypeStepData?.options?.[archetypeChoice]) applyCost(archetypeStepData.options[archetypeChoice].cost);
    if (companionChoice >= 0 && companionStepData?.options?.[companionChoice]) applyCost(companionStepData.options[companionChoice].cost);
    if (mountChoice >= 0 && mountStepData?.options?.[mountChoice]) applyCost(mountStepData.options[mountChoice].cost);
    if (originFlawStepData) {
      const byGroup = {};
      for (const o of originFlawStepData.options) { (byGroup[o.option_group] ??= []).push(o); }
      const originIdx = originFlawChoice?.Origins;
      const flawIdx = originFlawChoice?.Flaws;
      if (originIdx != null && byGroup.Origins?.[originIdx]) applyCost(byGroup.Origins[originIdx].cost);
      if (flawIdx != null && byGroup.Flaws?.[flawIdx]) applyCost(byGroup.Flaws[flawIdx].cost);
    }
    if (mountUpgradesStepData) {
      for (const idx of battleMountUpgradesChoice) {
        if (mountUpgradesStepData.options[idx]) applyCost(mountUpgradesStepData.options[idx].cost);
      }
    }
    if (otherUpgradesStepData) {
      for (const idx of otherUpgradesChoice) {
        if (otherUpgradesStepData.options[idx]) applyCost(otherUpgradesStepData.options[idx].cost);
      }
    }

    return { spent, total, remaining: total - spent };
  }, [apotheosisSteps, destinyPointChoice, archetypeChoice, companionChoice, mountChoice, originFlawChoice, battleMountUpgradesChoice, otherUpgradesChoice]);

  // Resolves the same stateful "Train Your Warlord" picks dpTally sums
  // costs from, but as a readable name list — shown on the Warlord
  // Warscroll panel so the choices made across all those sub-steps stay
  // visible in one place instead of only living in the wizard's own tabs.
  const chosenOptionsSummary = React.useMemo(() => {
    if (!apotheosisSteps.length) return [];
    const companionStepData = apotheosisSteps.find(s => /choose a companion/i.test(s.step_title || ''));
    const originFlawStepData = apotheosisSteps.find(s => /origin.*flaw/i.test(s.step_title || ''));
    const mountStepData = apotheosisSteps.find(s => /choose a battle mount/i.test(s.step_title || ''));
    const mountUpgradesStepData = apotheosisSteps.find(s => /pick any battle mount upgrades/i.test(s.step_title || ''));
    const otherUpgradesStepData = apotheosisSteps.find(s => /pick any other upgrades/i.test(s.step_title || ''));

    const lines = [];
    if (companionChoice >= 0 && companionStepData?.options?.[companionChoice]) {
      lines.push({ label: 'Companion', value: companionStepData.options[companionChoice].name });
    }
    if (originFlawStepData) {
      const byGroup = {};
      for (const o of originFlawStepData.options) { (byGroup[o.option_group] ??= []).push(o); }
      const originIdx = originFlawChoice?.Origins;
      const flawIdx = originFlawChoice?.Flaws;
      if (originIdx != null && byGroup.Origins?.[originIdx]) lines.push({ label: 'Origin', value: byGroup.Origins[originIdx].name });
      if (flawIdx != null && byGroup.Flaws?.[flawIdx]) lines.push({ label: 'Flaw', value: byGroup.Flaws[flawIdx].name });
    }
    if (mountChoice >= 0 && mountStepData?.options?.[mountChoice]) {
      lines.push({ label: 'Battle Mount', value: mountStepData.options[mountChoice].name });
    }
    if (mountUpgradesStepData && battleMountUpgradesChoice.length) {
      const names = battleMountUpgradesChoice.map(i => mountUpgradesStepData.options[i]?.name).filter(Boolean);
      if (names.length) lines.push({ label: 'Battle Mount Upgrades', value: names.join(', ') });
    }
    if (otherUpgradesStepData && otherUpgradesChoice.length) {
      const names = otherUpgradesChoice.map(i => otherUpgradesStepData.options[i]?.name).filter(Boolean);
      if (names.length) lines.push({ label: 'Other Upgrades', value: names.join(', ') });
    }
    return lines;
  }, [apotheosisSteps, companionChoice, originFlawChoice, mountChoice, battleMountUpgradesChoice, otherUpgradesChoice]);

  // Extracts a structured ability from an Other/Battle Mount Upgrade
  // option's own embedded "[Timing] NAME — Declare: ... Effect: ..." bullet
  // text (e.g. Idoneth's "Mighty Biovoltaic Blast", "Clamping Bite") —
  // these are genuine standalone abilities baked into one bullet string
  // rather than the structured sub_abilities column Companions/Battle
  // Mounts use. Returns null for upgrades that are pure stat tweaks with no
  // bullet at all (e.g. "Formidable Bulk"), which is most of them.
  const parseInlineAbilityBullet = b => {
    const m = /^\[([^\]]+)\]\s*(.+?)\s*[—-]\s*(.+)$/s.exec(b || '');
    if (!m) return null;
    const [, timing, name, rest] = m;
    const declMatch = /^Declare:\s*(.+?)\s*Effect:\s*(.+)$/s.exec(rest);
    if (declMatch) return { name: name.trim(), timing: timing.trim(), declare: declMatch[1].trim(), effect: declMatch[2].trim() };
    const effMatch = /^Effect:\s*(.+)$/s.exec(rest);
    return { name: name.trim(), timing: timing.trim(), declare: '', effect: (effMatch ? effMatch[1] : rest).trim() };
  };

  // Every rules-text ability the warlord has actually accumulated through
  // the wizard, grouped by where it came from — for printing into the
  // Officiant Warlord Warscroll's big blank Abilities area below the
  // weapon tables (see buildWarlordOverlayFields). Pure stat tweaks (e.g.
  // "Add 1 to Health") aren't included since they're already reflected on
  // the stat wheel/weapon tables directly, not a separate rules text block
  // a real warscroll would print.
  const warlordAbilityGroups = React.useMemo(() => {
    const groups = [];
    const push = (header, abilities) => { if (abilities.length) groups.push({ header, abilities }); };

    const companionStepData = apotheosisSteps.find(s => /choose a companion/i.test(s.step_title || ''));
    const originFlawStepData = apotheosisSteps.find(s => /origin.*flaw/i.test(s.step_title || ''));
    const mountStepData = apotheosisSteps.find(s => /choose a battle mount/i.test(s.step_title || ''));
    const mountUpgradesStepData = apotheosisSteps.find(s => /pick any battle mount upgrades/i.test(s.step_title || ''));
    const otherUpgradesStepData = apotheosisSteps.find(s => /pick any other upgrades/i.test(s.step_title || ''));

    const subAbilitiesOf = opt => {
      if (!opt) return [];
      const subs = Array.isArray(opt.sub_abilities) ? opt.sub_abilities : JSON.parse(opt.sub_abilities || '[]');
      return subs.map(s => ({ name: s.name, timing: s.timing, declare: s.declare, effect: s.effect, phase_key: s.phase_key }));
    };

    if (companionChoice >= 0) push('Companion', subAbilitiesOf(companionStepData?.options?.[companionChoice]));

    if (originFlawStepData) {
      const byGroup = {};
      for (const o of originFlawStepData.options) { (byGroup[o.option_group] ??= []).push(o); }
      const origin = originFlawChoice?.Origins != null ? byGroup.Origins?.[originFlawChoice.Origins] : null;
      const flaw = originFlawChoice?.Flaws != null ? byGroup.Flaws?.[originFlawChoice.Flaws] : null;
      if (origin) push('Origin', [{ name: origin.name, timing: origin.timing, declare: origin.declare, effect: origin.effect, phase_key: origin.phase_key }]);
      if (flaw) push('Flaw', [{ name: flaw.name, timing: flaw.timing, declare: flaw.declare, effect: flaw.effect, phase_key: flaw.phase_key }]);
    }

    if (mountChoice >= 0) push('Battle Mount', subAbilitiesOf(mountStepData?.options?.[mountChoice]));

    // Every picked upgrade prints — the ones with a real embedded ability
    // (e.g. "Mighty Biovoltaic Blast") print THAT; a pure stat tweak (e.g.
    // "Tactical Acumen", "Focused Hunter") prints its own name/effect
    // directly instead (defaulting to a Passive banner, since mechanically
    // that's what an always-on stat change is) rather than being skipped —
    // the wheel/weapon tables already reflect the stat change itself, but
    // the player still wants to see WHAT was picked and WHY on the sheet.
    const upgradeAbilities = opt => {
      const bullets = Array.isArray(opt?.bullets) ? opt.bullets : JSON.parse(opt?.bullets || '[]');
      const embedded = bullets.map(parseInlineAbilityBullet).filter(Boolean);
      if (embedded.length) return embedded;
      if (!opt) return [];
      return [{ name: opt.name, timing: opt.timing || 'Passive', declare: opt.declare, effect: opt.effect, phase_key: opt.phase_key }];
    };
    if (mountUpgradesStepData) {
      push('Battle Mount Upgrades', battleMountUpgradesChoice.flatMap(i => upgradeAbilities(mountUpgradesStepData.options[i])));
    }
    if (otherUpgradesStepData) {
      push('Other Upgrades', otherUpgradesChoice.flatMap(i => upgradeAbilities(otherUpgradesStepData.options[i])));
    }

    const enhancements = [];
    if (heroicTraitChoice != null && factionRules.heroic_traits?.[heroicTraitChoice]) {
      const t = factionRules.heroic_traits[heroicTraitChoice];
      enhancements.push({ name: t.name, timing: t.timing, declare: t.declare, effect: t.effect, phase_key: t.phase_key });
    }
    if (artefactChoice != null && factionRules.artefacts?.[artefactChoice]) {
      const a = factionRules.artefacts[artefactChoice];
      enhancements.push({ name: a.name, timing: a.timing, declare: a.declare, effect: a.effect, phase_key: a.phase_key });
    }
    push('Enhancements', enhancements);

    const selectedPathObj = PATHS.find(p => p.key === warlordPath) || (FACTION_PATHS[selectedFaction] ?? []).find(p => p.key === warlordPath);
    if (selectedPathObj?.ranks) {
      const pathAbilities = selectedPathObj.ranks
        .map(r => (warlordPathRankChoices[r.rank] != null ? { ...r.options[warlordPathRankChoices[r.rank]], name: `${r.rank}: ${r.options[warlordPathRankChoices[r.rank]].name}` } : null))
        .filter(Boolean);
      push(selectedPathObj.name, pathAbilities);
    }

    return groups;
  }, [apotheosisSteps, companionChoice, originFlawChoice, mountChoice, battleMountUpgradesChoice, otherUpgradesChoice, heroicTraitChoice, artefactChoice, factionRules, warlordPath, warlordPathRankChoices, selectedFaction]);

  // "Anti-X (+1 Rend)"/"Charge (+1 Damage)" Other/Battle Mount Upgrade
  // options grant their bonus to a specific weapon (or weapon group) named
  // right in the option's own effect text — "Your hero's Warblade has...",
  // "...non-Companion melee weapons have...", "...Choppa or Hacka has...".
  // Parsed generically rather than hardcoded per faction, so any faction
  // using this same phrasing picks up the behavior for free. Best-effort
  // text matching, same spirit as applyArchetypeChoice above — not a full
  // parser, just enough to cover the phrasings actually seen on scraped
  // Anvil of Apotheosis pages. Returns null (safe no-op downstream) when the
  // phrasing doesn't match, e.g. Lumineth's "Pick 1 of your hero's melee
  // weapons. That weapon has..." two-part choice.
  const parseWeaponTargetPhrase = effectText => {
    const m = /hero'?s\s+((?:non-)?(?:companion\s+)?[a-z' ]+?)\s+(?:has|have)\b/i.exec(effectText || '');
    if (!m) return null;
    let phrase = m[1].trim();
    const nonCompanion = /^non-companion\s+/i.test(phrase);
    const companionOnly = !nonCompanion && /^companion\s+/i.test(phrase);
    phrase = phrase.replace(/^non-companion\s+/i, '').replace(/^companion\s+/i, '').trim().toLowerCase();
    const isGenericMelee = /^melee weapons?$/.test(phrase);
    const isGenericAny = /^weapons?$/.test(phrase);
    const altNames = (!isGenericMelee && !isGenericAny && /\bor\b/.test(phrase))
      ? phrase.split(/\s+or\s+/).map(s => s.trim())
      : [phrase];
    return { isGenericMelee, isGenericAny, nonCompanion, companionOnly, altNames };
  };

  // Weapon name(s) granted by the currently-picked Companion — resolves the
  // "Companion weapons"/"non-Companion melee weapons" phrasing above.
  const companionWeaponNames = React.useMemo(() => {
    if (companionChoice < 0 || !apotheosisSteps.length) return [];
    const companionStepData = apotheosisSteps.find(s => /choose a companion/i.test(s.step_title || ''));
    const opt = companionStepData?.options?.[companionChoice];
    if (!opt) return [];
    const bullets = Array.isArray(opt.bullets) ? opt.bullets : JSON.parse(opt.bullets || '[]');
    return bullets
      .map(b => /^(.+?)\s*[—-]\s*Atk/.exec(b)?.[1]?.trim().toLowerCase())
      .filter(Boolean);
  }, [apotheosisSteps, companionChoice]);

  const weaponMatchesTarget = (row, target, listIsMelee) => {
    const name = (row.name || '').trim().toLowerCase();
    if (!name || !target) return false;
    const isCompanionWeapon = companionWeaponNames.includes(name);
    if (target.companionOnly) return isCompanionWeapon;
    if (target.nonCompanion && isCompanionWeapon) return false;
    if (target.isGenericAny) return true;
    if (target.isGenericMelee) return listIsMelee;
    return target.altNames.includes(name);
  };

  // Adds/removes one ability-text tag on whichever weapon row(s) `target`
  // resolves to, replacing any existing tag sharing the same `family` prefix
  // (so re-picking Focused Hunter's unit type swaps the old keyword out
  // instead of stacking) without touching the rest of that weapon's freely
  // typed Abilities text.
  const setWeaponAbilityTag = (target, family, tagValue, add) => {
    if (!target) return;
    const updateList = listIsMelee => rows => rows.map(r => {
      if (!weaponMatchesTarget(r, target, listIsMelee)) return r;
      const tags = (r.abilities || '').split(',').map(s => s.trim()).filter(Boolean)
        .filter(t => !t.toLowerCase().startsWith(family.toLowerCase()));
      if (add) tags.push(tagValue);
      return { ...r, abilities: tags.join(', ') };
    });
    setMeleeWeapons(updateList(true));
    setRangedWeapons(updateList(false));
  };

  const isAntiXOption = opt => /anti-x\s*\(\+1 rend\)/i.test(opt.effect || '');
  const isChargeDamageOption = opt => /charge\s*\(\+1 damage\)/i.test(opt.effect || '');

  const ANTI_X_FALLBACK_KEYWORDS = ['INFANTRY', 'CAVALRY', 'MONSTER', 'WAR MACHINE', 'WIZARD', 'PRIEST'];
  const parseAntiXKeywords = effectText => {
    const m = /keywords?:\s*([^.]+)\./i.exec(effectText || '');
    if (!m) return ANTI_X_FALLBACK_KEYWORDS;
    const list = m[1].replace(/\bor\b/gi, ',').split(',')
      .map(s => s.trim().toUpperCase().replace(/WAR MACH\w*NE/, 'WAR MACHINE'))
      .filter(s => s && !/^A FACTION KEYWORD$/.test(s));
    return list.length ? list : ANTI_X_FALLBACK_KEYWORDS;
  };

  // Applies (or removes) an Anti-X/Charge Other/Battle Mount Upgrade
  // option's actual weapon effect the instant it's toggled. Every other
  // upgrade on these two steps stays purely informational (matches how
  // Duellist/Ornate Armour/etc. already behave — this wizard doesn't try to
  // enforce every stat change onto the table), but these two effects repeat
  // near-identically across enough factions to be worth wiring up for real.
  const applyUpgradeWeaponEffect = (opt, adding) => {
    if (isChargeDamageOption(opt)) {
      setWeaponAbilityTag(parseWeaponTargetPhrase(opt.effect), 'charge (+1 damage)', 'Charge (+1 Damage)', adding);
    } else if (isAntiXOption(opt)) {
      const keyword = antiXChoiceByOption[opt.id] || parseAntiXKeywords(opt.effect)[0];
      setWeaponAbilityTag(parseWeaponTargetPhrase(opt.effect), 'anti-', `Anti-${keyword} (+1 Rend)`, adding);
    }
  };

  // Shared render for "Pick any Other Upgrades"/"Pick any Battle Mount
  // Upgrades" cards (true multi-select, toggled independently) — `toggle`
  // is called with the option's new selected state so each step's own
  // choice-array setter stays local to its branch above. Anti-X options get
  // an extra row of mutually-exclusive unit-type buttons beneath the card,
  // shown only while that option is selected, defaulting to the first
  // keyword the option itself lists (INFANTRY on every faction seen so
  // far). The toggle button and the unit-type buttons are siblings, not
  // nested, so native <button> keyboard/click semantics keep working for
  // both without a stopPropagation dance.
  const renderMultiToggleOption = (oi, opt, card, selected, toggle) => {
    const antiX = isAntiXOption(opt);
    const keywords = antiX ? parseAntiXKeywords(opt.effect) : null;
    const chosenKeyword = antiX ? (antiXChoiceByOption[opt.id] || keywords[0]) : null;
    return (
      <div key={oi} className="ptg-apotheosis-option-wrap">
        <button
          type="button"
          className={`ptg-apotheosis-option-btn${selected ? ' ptg-apotheosis-option-selected' : ''}`}
          onClick={() => {
            const nowSelected = !selected;
            toggle(nowSelected);
            applyUpgradeWeaponEffect(opt, nowSelected);
          }}
        >
          {card}
        </button>
        {antiX && selected && (
          <div className="ptg-anti-x-picker">
            {keywords.map(kw => (
              <button
                key={kw}
                type="button"
                className={`ptg-anti-x-picker-btn${chosenKeyword === kw ? ' ptg-anti-x-picker-btn-selected' : ''}`}
                onClick={() => {
                  setAntiXChoiceByOption(prev => ({ ...prev, [opt.id]: kw }));
                  setWeaponAbilityTag(parseWeaponTargetPhrase(opt.effect), 'anti-', `Anti-${kw} (+1 Rend)`, true);
                }}
              >
                {titleCaseKeyword(kw)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // One "Anvil of Apotheosis" step's content — an intro line plus its
  // options rendered as ability cards (reusing AbilityCard so cost badges,
  // phase-colored timing banners, and Declare/Effect all look identical to
  // every other rules text on the site, whether the option is a full
  // ability-shaped Origin/Flaw or a plain name+cost+effect upgrade row).
  // "Set a Destiny Point Limit" and "Choose an Archetype" are both genuine
  // single-choice picks (always exactly 1 of the options shown, no partial
  // bookkeeping) — clickable buttons that advance to the next sub-step
  // immediately, same as flipping a physical card over. Archetype
  // additionally rewrites the starting warscroll's weapon/keywords via
  // applyArchetypeChoice. "Choose a Companion" is "up to 1" (genuinely
  // optional) — same single-select button treatment, but with an explicit
  // "Skip Companion" option prepended and selected by default instead of
  // forcing one of the real picks.
  const renderApotheosisStep = stepData => {
    const isDpStep = /destiny point limit/i.test(stepData.step_title || '');
    const isArchetypeStep = /choose an archetype/i.test(stepData.step_title || '');
    const isCompanionStep = /choose a companion/i.test(stepData.step_title || '');
    const isMountStep = /choose a battle mount/i.test(stepData.step_title || '');
    // Up to 1 origin AND up to 1 flaw, independently — a plain toggle per
    // group (click a selected card to deselect it back to "none"), not a
    // forced/auto-advancing single choice like the steps above.
    const isOriginFlawStep = /origin.*flaw/i.test(stepData.step_title || '');
    // True multi-select ("pick any number") — every card toggles
    // independently, no mutual exclusivity, no auto-advance. Same treatment
    // for both upgrade steps.
    const isOtherUpgradesStep = /pick any other upgrades/i.test(stepData.step_title || '');
    const isMountUpgradesStep = /pick any battle mount upgrades/i.test(stepData.step_title || '');
    const isSingleSelect = isDpStep || isArchetypeStep || isCompanionStep || isMountStep;
    return (
    <>
      {stepData.intro_text && <p className="ptg-apotheosis-intro">{stepData.intro_text}</p>}
      {stepData.options.length === 0 ? (
        <div className="ptg-wizard-body-placeholder">No selectable options for this step — see the intro text above.</div>
      ) : (
        (() => {
          const groups = [];
          const byGroup = {};
          for (const opt of stepData.options) {
            const key = opt.option_group || '';
            if (!byGroup[key]) { byGroup[key] = { group: opt.option_group, items: [] }; groups.push(byGroup[key]); }
            byGroup[key].items.push(opt);
          }
          return groups.map((g, gi) => (
            <div key={gi} className="ptg-apotheosis-group">
              {g.group && <div className="ptg-apotheosis-group-title">{g.group}</div>}
              <div className="ptg-apotheosis-options-grid">
                {isCompanionStep && gi === 0 && (
                  <button
                    type="button"
                    className={`ptg-apotheosis-option-btn ptg-apotheosis-skip-btn${companionChoice === -1 ? ' ptg-apotheosis-option-selected' : ''}`}
                    onClick={() => {
                      applyOptionWeapons(stepData.options[companionChoice], null);
                      setCompanionChoice(-1);
                      setWarlordSubStep(s => Math.min(warlordSteps.length - 1, s + 1));
                    }}
                  >
                    Skip Companion
                  </button>
                )}
                {isMountStep && gi === 0 && (
                  <button
                    type="button"
                    className={`ptg-apotheosis-option-btn ptg-apotheosis-skip-btn${mountChoice === -1 ? ' ptg-apotheosis-option-selected' : ''}`}
                    onClick={() => {
                      applyOptionWeapons(stepData.options[mountChoice], null);
                      setMountChoice(-1);
                      setWarlordSubStep(s => Math.min(warlordSteps.length - 1, s + 1));
                    }}
                  >
                    Skip Battle Mount
                  </button>
                )}
                {isMountUpgradesStep && gi === 0 && (
                  <button
                    type="button"
                    className={`ptg-apotheosis-option-btn ptg-apotheosis-skip-btn${battleMountUpgradesChoice.length === 0 ? ' ptg-apotheosis-option-selected' : ''}`}
                    onClick={() => {
                      setBattleMountUpgradesChoice([]);
                      setWarlordSubStep(s => Math.min(warlordSteps.length - 1, s + 1));
                    }}
                  >
                    Skip Battle Mount Upgrades
                  </button>
                )}
                {g.items.map((opt, oi) => {
                  const subAbilities = Array.isArray(opt.sub_abilities) ? opt.sub_abilities : JSON.parse(opt.sub_abilities || '[]');
                  const card = (
                    <>
                      <AbilityCard
                        ab={{ ...opt, bullets: Array.isArray(opt.bullets) ? opt.bullets : JSON.parse(opt.bullets || '[]') }}
                        keywords={Array.isArray(opt.keywords) ? opt.keywords : JSON.parse(opt.keywords || '[]')}
                      />
                      {subAbilities.length > 0 && (
                        <div className="ptg-apotheosis-sub-abilities">
                          {subAbilities.map((sub, si) => (
                            <AbilityCard key={si} ab={sub} keywords={sub.keywords || []} />
                          ))}
                        </div>
                      )}
                    </>
                  );
                  if (!isSingleSelect && !isOriginFlawStep && !isOtherUpgradesStep && !isMountUpgradesStep) return <React.Fragment key={oi}>{card}</React.Fragment>;

                  if (isOriginFlawStep) {
                    const selected = originFlawChoice?.[g.group] === oi;
                    return (
                      <button
                        key={oi}
                        type="button"
                        className={`ptg-apotheosis-option-btn${selected ? ' ptg-apotheosis-option-selected' : ''}`}
                        onClick={() => {
                          setOriginFlawChoice(prev => ({ ...prev, [g.group]: prev?.[g.group] === oi ? null : oi }));
                        }}
                      >
                        {card}
                      </button>
                    );
                  }

                  if (isOtherUpgradesStep) {
                    const selected = otherUpgradesChoice.includes(oi);
                    return renderMultiToggleOption(oi, opt, card, selected, nowSelected => {
                      setOtherUpgradesChoice(prev => nowSelected ? [...prev, oi] : prev.filter(x => x !== oi));
                    });
                  }

                  if (isMountUpgradesStep) {
                    const selected = battleMountUpgradesChoice.includes(oi);
                    return renderMultiToggleOption(oi, opt, card, selected, nowSelected => {
                      setBattleMountUpgradesChoice(prev => nowSelected ? [...prev, oi] : prev.filter(x => x !== oi));
                    });
                  }

                  const selected = isDpStep ? oi === destinyPointChoice
                    : isArchetypeStep ? oi === archetypeChoice
                    : isMountStep ? oi === mountChoice
                    : oi === companionChoice;
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={`ptg-apotheosis-option-btn${selected ? ' ptg-apotheosis-option-selected' : ''}`}
                      onClick={() => {
                        if (isDpStep) {
                          setDestinyPointChoice(oi);
                        } else if (isArchetypeStep) {
                          setArchetypeChoice(oi);
                          const step2 = apotheosisSteps.find(s => /fill out the starting warscroll/i.test(s.step_title));
                          applyArchetypeChoice(step2, stepData, oi);
                        } else if (isMountStep) {
                          applyOptionWeapons(stepData.options[mountChoice], stepData.options[oi]);
                          setMountChoice(oi);
                        } else {
                          applyOptionWeapons(stepData.options[companionChoice], stepData.options[oi]);
                          setCompanionChoice(oi);
                        }
                        setWarlordSubStep(s => Math.min(warlordSteps.length - 1, s + 1));
                      }}
                    >
                      {card}
                    </button>
                  );
                })}
              </div>
            </div>
          ));
        })()
      )}
    </>
    );
  };

  // Everything the Officiant (image) view's overlays can draw from, bundled
  // once per render rather than threading ~30 individual props down through
  // DocPage/buildOverlayFields.
  const officiantData = {
    warlordName, warlordMove, warlordHealth, warlordSave, warlordControl,
    rangedWeapons, meleeWeapons, warlordKeywordsLine1, warlordKeywordsLine2, warlordAbilityGroups,
    armyName, realmOfOrigin, customRealmName,
    realmLabel: REALMS.find(r => r.key === realmOfOrigin)?.name || '',
    gloryPoints, battleFormation,
    factionLabel: factions.find(f => f.faction_slug === effectiveFactionSlug)?.faction || '',
    currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
    spellLore, prayerLore, manifestationLore,
    warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements,
    warlordPathLabel: PATHS.find(p => p.key === warlordPath)?.name || '',
    warlordPathAbility, oobUnits,
    commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation,
    regiments, auxUnits, armyNotes, regimentsTotal, auxTotal, armyUnitsTotal,
  };

  const renderImageView = doc => (
    <div
      className={`ptg-doc-image-view ptg-doc-image-view-zoomable${doc.key === 'warlord' ? ' ab-roster-print-target' : ''}`}
      onClick={() => setDocLightboxOpen(true)}
      title="Click to zoom"
    >
      {doc.images.map((img, i) => (
        <DocPage key={img.src} img={img} alt={doc.title} docKey={doc.key} pageIndex={i} data={officiantData} />
      ))}
    </div>
  );

  // Same doc, same DocPage/overlay pipeline, just sized to fill as much of
  // the actual browser viewport as possible (both dimensions, not just
  // width) — see .ptg-doc-lightbox-frame in styles.css. onClick={} with
  // stopPropagation on the frame itself keeps a click INSIDE the image from
  // bubbling to the backdrop's close handler.
  const renderDocLightbox = () => {
    const doc = DOCS.find(d => d.key === activeDoc);
    if (!doc) return null;
    return (
      <div className="ptg-doc-lightbox-backdrop" onClick={() => setDocLightboxOpen(false)}>
        <button className="gw-close ptg-doc-lightbox-close" onClick={() => setDocLightboxOpen(false)} title="Close (Esc)">✕</button>
        <div className="ptg-doc-lightbox-frame" onClick={e => e.stopPropagation()}>
          {doc.images.map((img, i) => (
            <DocPage key={img.src} img={img} alt={doc.title} docKey={doc.key} pageIndex={i} data={officiantData} />
          ))}
        </div>
      </div>
    );
  };

  const handleWarlordPrintClick = () => {
    if (presentMode === 'replica') setWarlordPrintPreview(true);
    else window.print();
  };

  const campaignLabel = campaign === 'custom'
    ? (customCampaignName.trim() || 'Foreign War of Aggression')
    : CAMPAIGNS.find(c => c.key === campaign)?.name;

  const ALLIANCE_ORDER = ['Order', 'Chaos', 'Death', 'Destruction'];
  const factionsByAlliance = ALLIANCE_ORDER
    .map(alliance => ({ alliance, list: factions.filter(f => f.grand_alliance === alliance) }))
    .filter(g => g.list.length > 0);
  const factionGridPositions = computeFactionGridPositions(factionsByAlliance);

  const warlordSteps = apotheosisSteps.length ? apotheosisSteps.map(s => s.step_title) : null;

  const renderDocEditor = ({ showBackButton = true } = {}) => {
          const doc = DOCS.find(d => d.key === activeDoc);
          if (activeDoc === 'warlord' && warlordPrintPreview) {
            return (
              <>
                <div className="ptg-doc-editor-header">
                  <div className="ptg-doc-editor-title">Print Preview</div>
                  <div className="ab-roster-print-actions">
                    <button className="ptg-wizard-nav-btn" onClick={() => setWarlordPrintPreview(false)}>‹ Cancel</button>
                    <button className="ptg-wizard-nav-btn ab-roster-print-confirm" onClick={() => window.print()}>🖨 Print</button>
                  </div>
                </div>
                <div className="ptg-doc-editor-body ab-roster-print-target ab-roster-print-ready ptg-warlord-print-ready">
                  {renderWarlordForm()}
                </div>
              </>
            );
          }
          return (
            <>
              <div className="ptg-doc-editor-header">
                {showBackButton
                  ? <button className="ptg-wizard-nav-btn" onClick={() => { setWarlordPrintPreview(false); setActiveDoc(null); }}>‹ Back to War Room</button>
                  : <span />}
                <div className="ptg-doc-editor-title">{doc.title}</div>
                <PresentToggle mode={presentMode} onChange={setPresentMode} />
              </div>

              <div className="ptg-doc-editor-body">
                {presentMode === 'image' ? renderImageView(doc) : (
                  <>
                    {activeDoc === 'warlord' && renderWarlordForm()}

                    {activeDoc === 'roster' && (
                      <>
                        <div className="ptg-roster-header-grid">
                          <div className="ptg-field ptg-roster-heraldry">
                            <label>Heraldry</label>
                            <div
                              className="ptg-heraldry-box"
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => { e.preventDefault(); handleHeraldryFile(e.dataTransfer.files[0]); }}
                              onClick={() => heraldryInputRef.current?.click()}
                              style={heraldryImage ? { backgroundImage: `url(${heraldryImage})` } : undefined}
                              title="Click or drag an image here"
                            >
                              {!heraldryImage && <span className="ptg-heraldry-hint">Drop image<br />or click</span>}
                              <input
                                ref={heraldryInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => handleHeraldryFile(e.target.files[0])}
                              />
                            </div>
                          </div>
                          <div className="ptg-field ptg-roster-armyname"><label>Army Name</label><input type="text" value={armyName} onChange={e => setArmyName(e.target.value)} placeholder="e.g. The Sundered Vanguard" /></div>
                          <div className="ptg-field ptg-roster-realm">
                            <label>Realm of Origin</label>
                            <RealmDropdown value={realmOfOrigin} customValue={customRealmName} onChange={setRealmOfOrigin} onCustomChange={setCustomRealmName} />
                          </div>
                          <div className="ptg-field ptg-roster-glory"><label>Glory Points</label><input type="text" value={gloryPoints} onChange={e => setGloryPoints(e.target.value)} /></div>
                          <div className="ptg-field ptg-roster-rounds">
                            <label>Glory Points / Round</label>
                            <div className="ptg-glory-rounds">
                              {gloryRounds.map((r, i) => (
                                <div className="ptg-glory-round-row" key={r.id}>
                                  <span className="ptg-glory-round-num">R{i + 1}</span>
                                  <input value={r.value || ''} onChange={e => updateGloryRoundRow(r.id, 'value', e.target.value)} />
                                  <button className="ptg-oob-row-remove" onClick={() => removeGloryRound(r.id)} title="Remove round">✕</button>
                                </div>
                              ))}
                              <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addGloryRound({ value: '' })}>+ Round</button>
                              <div className="ptg-glory-rounds-total">Total Earned: {gloryRoundsSum}</div>
                            </div>
                          </div>
                          <div className="ptg-field ptg-roster-faction">
                            <label>Faction</label>
                            <FactionPulldown factions={factions} value={effectiveFactionSlug} onChange={setFaction} />
                          </div>
                          <div className="ptg-field ptg-roster-formation">
                            <label>Battle Formation</label>
                            {effectiveFactionSlug ? (
                              <FormationDropdown formations={formations} value={battleFormation} onChange={setBattleFormation} loading={formationsLoading} />
                            ) : (
                              <input type="text" value={battleFormation} onChange={e => setBattleFormation(e.target.value)} placeholder="Pick a faction first…" />
                            )}
                          </div>
                        </div>

                        <div className="ptg-roster-lower-grid">
                          <div className="ptg-quest-log-block">
                            <div className="ptg-quest-log-title">Quest Log</div>
                            <div className="ptg-quest-log-grid">
                              <div className="ptg-field"><label>Current Quest</label><input type="text" value={currentQuest} onChange={e => setCurrentQuest(e.target.value)} /></div>
                              <div className="ptg-field"><label>Quest Points</label><input type="text" value={questPoints} onChange={e => setQuestPoints(e.target.value)} /></div>
                              <div className="ptg-field"><label>Notes</label><input type="text" value={questNotes} onChange={e => setQuestNotes(e.target.value)} /></div>
                              <div className="ptg-field"><label>Quests Completed</label><input type="text" value={questsCompleted} onChange={e => setQuestsCompleted(e.target.value)} /></div>
                            </div>
                          </div>
                          <div className="ptg-roster-side-stack">
                            <div className="ptg-field"><label>Background</label><textarea rows={4} value={background} onChange={e => setBackground(e.target.value)} /></div>
                            <div className="ptg-field"><label>Notable Events</label><textarea rows={4} value={notableEvents} onChange={e => setNotableEvents(e.target.value)} /></div>
                          </div>
                        </div>

                        <div className="ptg-arcane-tome-title">Arcane Tome</div>
                        <div className="ptg-arcane-tome-grid">
                          {[{ label: 'Spell Lore', rows: spellLore, setter: setSpellLore },
                            { label: 'Prayer Lore', rows: prayerLore, setter: setPrayerLore },
                            { label: 'Manifestation Lore', rows: manifestationLore, setter: setManifestationLore }].map(col => (
                            <div className="ptg-arcane-tome-col" key={col.label}>
                              <div className="ptg-arcane-tome-col-header">{col.label}</div>
                              {col.rows.map((v, i) => (
                                <input key={i} value={v} placeholder={`${i + 1}.`} onChange={e => setLoreRow(col.setter)(i, e.target.value)} />
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {activeDoc === 'oob' && (
                      <>
                        <div className="ptg-oob-cap">
                          Starting units + Warlord must total <strong>1000 points</strong> or fewer.{' '}
                          <span className={oobTotalPoints > 1000 ? 'ptg-oob-over' : ''}>Current total: {oobTotalPoints}pts</span>
                        </div>

                        <div className="ptg-oob-warlord-block">
                          <div className="ptg-oob-warlord-title">Warlord</div>
                          <div className="ptg-oob-row-grid-4">
                            <div className="ptg-field"><label>Name</label><input value={warlordName} onChange={e => setWarlordName(e.target.value)} /></div>
                            <div className="ptg-field"><label>Warscroll</label><input value={warlordWarscroll} onChange={e => setWarlordWarscroll(e.target.value)} /></div>
                            <div className="ptg-field"><label>Rank</label><input value={warlordRank} onChange={e => setWarlordRank(e.target.value)} /></div>
                            <div className="ptg-field"><label>Renown</label><input value={warlordRenown} onChange={e => setWarlordRenown(e.target.value)} /></div>
                          </div>
                          <div className="ptg-oob-row-grid-3">
                            <div className="ptg-field"><label>Enhancements</label><input value={warlordEnhancements} onChange={e => setWarlordEnhancements(e.target.value)} /></div>
                            <div className="ptg-field">
                              <label>Path</label>
                              <select value={warlordPath || ''} onChange={e => setWarlordPath(e.target.value || null)}>
                                <option value="">…</option>
                                {PATHS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                              </select>
                            </div>
                            <div className="ptg-field"><label>Path Abilities</label><input value={warlordPathAbility} onChange={e => setWarlordPathAbility(e.target.value)} /></div>
                          </div>
                        </div>

                        <div className="ptg-oob-units-title">Units</div>
                        {oobUnits.length === 0 && <div className="ptg-oob-empty">No units added yet.</div>}
                        {oobUnits.map(u => (
                          <div className="ptg-oob-unit-block" key={u.id}>
                            <div className="ptg-oob-row-grid-4">
                              <div className="ptg-field"><label>Unit Name</label><input value={u.name || ''} onChange={e => updateOobUnit(u.id, 'name', e.target.value)} /></div>
                              <div className="ptg-field"><label>Warscroll</label><input value={u.warscroll || ''} onChange={e => updateOobUnit(u.id, 'warscroll', e.target.value)} /></div>
                              <div className="ptg-field"><label>Rank</label><input value={u.rank || ''} onChange={e => updateOobUnit(u.id, 'rank', e.target.value)} /></div>
                              <div className="ptg-field">
                                <label>Renown</label>
                                <div className="ptg-oob-renown-row">
                                  <input value={u.renown || ''} onChange={e => updateOobUnit(u.id, 'renown', e.target.value)} />
                                  <button className="ptg-oob-row-remove" onClick={() => removeOobUnit(u.id)} title="Remove unit">✕</button>
                                </div>
                              </div>
                            </div>
                            <div className="ptg-oob-row-grid-3b">
                              <div className="ptg-field"><label>Enhancements</label><input value={u.enhancements || ''} onChange={e => updateOobUnit(u.id, 'enhancements', e.target.value)} /></div>
                              <div className="ptg-field"><label>Path Abilities</label><input value={u.pathAbility || ''} onChange={e => updateOobUnit(u.id, 'pathAbility', e.target.value)} /></div>
                              <div className="ptg-field"><label>Reinforced?</label><input value={u.reinforced || ''} onChange={e => updateOobUnit(u.id, 'reinforced', e.target.value)} /></div>
                            </div>
                            <div className="ptg-field ptg-oob-pts-field"><label>Pts</label><input value={u.points || ''} onChange={e => updateOobUnit(u.id, 'points', e.target.value)} style={{ maxWidth: '90px' }} /></div>
                          </div>
                        ))}
                        <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addOobUnit({ name: '', warscroll: '', rank: 'Aspiring', renown: '0', points: '', enhancements: '', pathAbility: '', reinforced: '' })}>+ Add Unit</button>
                      </>
                    )}

                    {activeDoc === 'army' && (
                      <>
                        <div className="ptg-army-header-grid">
                          <div className="ptg-field ptg-army-commander"><label>Commander</label><input type="text" value={commander} onChange={e => setCommander(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-name"><label>Army Name</label><input type="text" value={armyRosterName} onChange={e => setArmyRosterName(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-points-limit"><label>Points Limit</label><input type="text" value={pointsLimit} onChange={e => setPointsLimit(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-faction"><label>Faction</label><input type="text" value={armyRosterFaction} onChange={e => setArmyRosterFaction(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-formation"><label>Battle Formation</label><input type="text" value={armyRosterFormation} onChange={e => setArmyRosterFormation(e.target.value)} /></div>
                        </div>

                        {regiments.map((r, ri) => (
                          <div className="ptg-regiment-block" key={r.id}>
                            <div className="ptg-regiment-header">
                              <span>{ri === 0 ? "General's Regiment 1" : `Regiment ${ri + 1}`}</span>
                              {regiments.length > 1 && <button className="ptg-oob-row-remove" onClick={() => removeRegiment(r.id)} title="Remove regiment">✕</button>}
                            </div>
                            <div className="ptg-regiment-table-head">
                              <span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span><span />
                            </div>
                            {r.units.map(u => (
                              <div className="ptg-regiment-table-row" key={u.id}>
                                <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'name', e.target.value)} />
                                <input placeholder="Size" value={u.size || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'size', e.target.value)} />
                                <input placeholder="Notes" value={u.notes || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'notes', e.target.value)} />
                                <input placeholder="Pts" value={u.points || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'points', e.target.value)} />
                                <button className="ptg-oob-row-remove" onClick={() => removeRegimentUnit(r.id, u.id)} title="Remove unit">✕</button>
                              </div>
                            ))}
                            <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addRegimentUnit(r.id)}>+ Add Unit</button>
                          </div>
                        ))}
                        <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={addRegiment}>+ Add Regiment</button>
                        <div className="ptg-oob-cap">Regiments Total: {regimentsTotal}pts</div>

                        <div className="ptg-regiment-block">
                          <div className="ptg-regiment-header"><span>Auxiliary Units</span></div>
                          <div className="ptg-regiment-table-head">
                            <span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span><span />
                          </div>
                          {auxUnits.map(u => (
                            <div className="ptg-regiment-table-row" key={u.id}>
                              <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateAuxUnit(u.id, 'name', e.target.value)} />
                              <input placeholder="Size" value={u.size || ''} onChange={e => updateAuxUnit(u.id, 'size', e.target.value)} />
                              <input placeholder="Notes" value={u.notes || ''} onChange={e => updateAuxUnit(u.id, 'notes', e.target.value)} />
                              <input placeholder="Pts" value={u.points || ''} onChange={e => updateAuxUnit(u.id, 'points', e.target.value)} />
                              <button className="ptg-oob-row-remove" onClick={() => removeAuxUnit(u.id)} title="Remove unit">✕</button>
                            </div>
                          ))}
                          <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addAuxUnit({ name: '', size: '', notes: '', points: '' })}>+ Add Unit</button>
                        </div>
                        <div className="ptg-oob-cap">Auxiliary Units Total: {auxTotal}pts</div>
                        <div className="ptg-oob-cap"><strong>Units Total: {armyUnitsTotal}pts</strong></div>

                        <div className="ptg-field"><label>Notes</label><textarea rows={3} value={armyNotes} onChange={e => setArmyNotes(e.target.value)} /></div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          );
  };

  const renderStepFlow = () => (
          <>
            <div className="ptg-wizard-steps">
              {STEPS.map((label, i) => (
                <button
                  key={i}
                  className={`ptg-wizard-step${i === step ? ' ptg-wizard-step-active' : ''}${i < step ? ' ptg-wizard-step-done' : ''}`}
                  onClick={() => setStep(i)}
                  title={label}
                >
                  <span className="ptg-wizard-step-num">{i + 1}</span>
                  <span className="ptg-wizard-step-label">{label}</span>
                </button>
              ))}
            </div>

            <div className="ptg-wizard-body">
              <div className="ptg-wizard-body-title">{step + 1}. {STEPS[step]}</div>
              {step === 0 ? (
                <>
                  <div className="ptg-campaign-grid">
                    {CAMPAIGNS.map(c => (
                      <button
                        key={c.key}
                        className={`ptg-campaign-card${campaign === c.key ? ' ptg-campaign-selected' : ''}`}
                        disabled={!c.available}
                        onClick={() => {
                          setCampaign(c.key);
                          if (CAMPAIGN_POINTS_LIMITS[c.key]) setPointsLimit(CAMPAIGN_POINTS_LIMITS[c.key]);
                          setStep(s => Math.min(STEPS.length - 1, s + 1));
                        }}
                      >
                        <div className="ptg-campaign-name">{c.name}</div>
                        <div className="ptg-campaign-desc">{c.desc}</div>
                        {!c.available && <div className="ptg-campaign-soon">Coming Soon</div>}
                      </button>
                    ))}
                  </div>
                  {campaign === 'custom' && (
                    <input
                      className="ptg-campaign-name-input"
                      type="text"
                      placeholder="Name your campaign…"
                      value={customCampaignName}
                      onChange={e => setCustomCampaignName(e.target.value)}
                    />
                  )}
                </>
              ) : step === 1 ? (
                <div className="ptg-faction-grid">
                  {factionsByAlliance.flatMap(g => g.list.map((f, i) => {
                    const pos = factionGridPositions[f.faction_slug];
                    return (
                      <button
                        key={f.faction_slug}
                        className={`ptg-faction-badge alliance-${f.grand_alliance}${selectedFaction === f.faction_slug ? ' ptg-faction-badge-selected' : ''}`}
                        style={pos ? { gridRow: pos[0], gridColumn: pos[1] } : undefined}
                        onClick={() => { setSelectedFaction(f.faction_slug); setStep(s => Math.min(STEPS.length - 1, s + 1)); }}
                      >
                        {f.faction}
                      </button>
                    );
                  }))}
                </div>
              ) : step === 2 ? (
                <div className="ptg-step-warlord ptg-step-warlord-split">
                  <div className="ptg-step-warlord-left">
                    {warlordSteps ? (
                      <>
                        <div className="ptg-warlord-substeps">
                          {warlordSteps.map((label, i) => (
                            <button
                              key={i}
                              className={`ptg-warlord-substep${i === warlordSubStep ? ' ptg-warlord-substep-active' : ''}${i < warlordSubStep ? ' ptg-warlord-substep-done' : ''}`}
                              onClick={() => setWarlordSubStep(i)}
                            >
                              <span className="ptg-warlord-substep-num">{i + 1}</span>
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="ptg-step-warlord-title">{warlordSubStep + 1}. {warlordSteps[warlordSubStep]}</div>
                        {/^fill out the starting warscroll$/i.test(warlordSteps[warlordSubStep] || '')
                          ? (
                            <div className="ptg-wizard-body-placeholder">
                              <p>We've Filled out this step for you.<br /><br />Name your Hero!!</p>
                            </div>
                          )
                          : (apotheosisLoading
                            ? <div className="ptg-wizard-body-placeholder">Loading…</div>
                            : renderApotheosisStep(apotheosisSteps[warlordSubStep]))}
                        <div className="ptg-wizard-nav">
                          <button className="ptg-wizard-nav-btn" onClick={() => setWarlordSubStep(s => Math.max(0, s - 1))} disabled={warlordSubStep === 0}>
                            ‹ Back
                          </button>
                          <button className="ptg-wizard-nav-btn" onClick={() => setWarlordSubStep(s => Math.min(warlordSteps.length - 1, s + 1))} disabled={warlordSubStep === warlordSteps.length - 1}>
                            Next ›
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="ptg-wizard-body-placeholder">
                        {apotheosisLoading ? 'Loading…' : 'No Anvil of Apotheosis data sourced for this faction yet — fill out the warscroll to the right directly.'}
                      </div>
                    )}
                  </div>
                  <div className="ptg-step-warlord-right">
                    <div className="ptg-step-warlord-title-row">
                      {dpTally && (
                        <div
                          className={`ptg-dp-tally${dpTally.remaining < 0 ? ' ptg-dp-tally-over' : ''}`}
                          title="Destiny Points remaining / available — right-click to unselect every DP-spending pick"
                          onContextMenu={e => {
                            e.preventDefault();
                            setCompanionChoice(-1);
                            setOriginFlawChoice({});
                            setMountChoice(-1);
                            setBattleMountUpgradesChoice([]);
                            setOtherUpgradesChoice([]);
                          }}
                        >
                          <span className="ptg-dp-tally-lbl">DP</span>
                          <span className="ptg-dp-tally-val">{dpTally.remaining}/{dpTally.total}</span>
                        </div>
                      )}
                      <div className="ptg-step-warlord-title">Warlord Warscroll</div>
                    </div>
                    {renderWarlordForm()}
                  </div>
                </div>
              ) : step === 3 ? (
                <div className="ptg-path-step">
                  <div className="ptg-apotheosis-group-title">Core</div>
                  <div className="ptg-apotheosis-options-grid">
                    {PATHS.map(p => (
                      <button
                        key={p.key}
                        type="button"
                        className={`ptg-apotheosis-option-btn${warlordPath === p.key ? ' ptg-apotheosis-option-selected' : ''}`}
                        onClick={() => pickWarlordPath(p.key)}
                      >
                        <div className="gw-ability-card">
                          <div className="gw-ability-body">
                            <div className="gw-ability-name">
                              {p.name}
                              {p.restricted && <span className="gw-ability-source-note" title="Restriction">({p.restricted})</span>}
                            </div>
                            <p className="gw-ability-para">{p.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="ptg-path-section-divider" />

                  <div className="ptg-apotheosis-group-title">Faction</div>
                  {(FACTION_PATHS[selectedFaction] ?? []).length > 0 ? (
                    <div className="ptg-apotheosis-options-grid">
                      {FACTION_PATHS[selectedFaction].map(p => (
                        <button
                          key={p.key}
                          type="button"
                          className={`ptg-apotheosis-option-btn${warlordPath === p.key ? ' ptg-apotheosis-option-selected' : ''}`}
                          onClick={() => pickWarlordPath(p.key)}
                        >
                          <div className="gw-ability-card">
                            <div className="gw-ability-body">
                              <div className="gw-ability-name">
                                {p.name}
                                {p.restricted && <span className="gw-ability-source-note" title="Restriction">({p.restricted})</span>}
                              </div>
                              <p className="gw-ability-para">{p.desc}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="ptg-wizard-body-placeholder">
                      No faction-specific Warlord Paths sourced for {factions.find(f => f.faction_slug === selectedFaction)?.faction || 'this faction'} yet.
                    </div>
                  )}

                  {(() => {
                    const selectedPathObj = PATHS.find(p => p.key === warlordPath)
                      || (FACTION_PATHS[selectedFaction] ?? []).find(p => p.key === warlordPath);
                    if (!selectedPathObj?.ranks) return null;
                    return (
                      <>
                        <div className="ptg-path-section-divider" />
                        <div className="ptg-apotheosis-group-title">{selectedPathObj.name} — Rank Abilities</div>
                        {selectedPathObj.ranks.map((r, ri) => (
                          <div key={ri} className="ptg-apotheosis-group">
                            <div className="ptg-apotheosis-group-title">{r.rank}</div>
                            <div className="ptg-apotheosis-options-grid">
                              {r.options.map((opt, oi) => (
                                <button
                                  key={oi}
                                  type="button"
                                  className={`ptg-apotheosis-option-btn${warlordPathRankChoices[r.rank] === oi ? ' ptg-apotheosis-option-selected' : ''}`}
                                  onClick={() => pickPathRankOption(selectedPathObj.ranks, r.rank, oi)}
                                >
                                  <AbilityCard ab={{ ...opt, bullets: [] }} keywords={[]} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              ) : step === 4 ? (
                <div className="ptg-units-step">
                  <div className="ptg-units-step-header">
                    <span>Starting units for {factions.find(f => f.faction_slug === selectedFaction)?.faction || 'this faction'}</span>
                    <span className="ab-points-block">
                      <span className={`ab-points-value ab-points-current${startingUnitsTotal > (parseInt(pointsLimit, 10) || 1000) ? ' ab-points-over' : ''}`}>{startingUnitsTotal}</span>
                      <span className="ab-points-sep"> / </span>
                      <span className="ab-points-value">{parseInt(pointsLimit, 10) || 1000}</span>
                      <span className="ab-points-label"> pts</span>
                    </span>
                  </div>
                  {factionUnitsLoading ? (
                    <div className="ptg-wizard-body-placeholder">Loading…</div>
                  ) : factionUnits.length === 0 ? (
                    <div className="ptg-wizard-body-placeholder">No warscrolls found for this faction.</div>
                  ) : (
                    <table className="ptg-units-table">
                      <thead>
                        <tr>
                          <th className="ab-count-th">Units</th>
                          <th className="ab-count-th">Reinf.</th>
                          <th>Name</th>
                          <th>Pts</th>
                          <th>Keywords</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...factionUnits].sort((a, b) => a.name.localeCompare(b.name)).map(u => {
                          const sel = startingUnits[u.id] ?? { train: 0, reinforce: 0 };
                          return (
                            <tr key={u.id}>
                              <td className="col-count">
                                <div className="ab-count-stepper">
                                  <button type="button" className="ab-count-btn" onClick={() => bumpStartingUnitCount(u.id, 'train', -1)}>−</button>
                                  <span className="ab-count-value">{sel.train || 0}</span>
                                  <button type="button" className="ab-count-btn" onClick={() => bumpStartingUnitCount(u.id, 'train', 1)}>+</button>
                                </div>
                              </td>
                              <td className="col-count">
                                {u.is_hero ? (
                                  <span className="ab-count-na" title="Heroes can't be reinforced">—</span>
                                ) : (
                                  <div className="ab-count-stepper">
                                    <button type="button" className="ab-count-btn" onClick={() => bumpStartingUnitCount(u.id, 'reinforce', -1)}>−</button>
                                    <span className="ab-count-value">{sel.reinforce || 0}</span>
                                    <button type="button" className="ab-count-btn" onClick={() => bumpStartingUnitCount(u.id, 'reinforce', 1)}>+</button>
                                  </div>
                                )}
                              </td>
                              <td className="ptg-units-name">{u.name}</td>
                              <td className="ptg-units-pts">{u.points || '—'}</td>
                              <td className="ptg-units-keywords">{(u.keywords || '').split(',').slice(0, 6).join(', ')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : step === 5 ? (
                <div className="ptg-enhancements-step">
                  {renderEnhancementTable('Heroic Traits', factionRules.heroic_traits, heroicTraitChoice, heroicTraitAssignee, pickHeroicTrait, reassignHeroicTrait)}
                  <div className="ptg-path-section-divider" />
                  {renderEnhancementTable('Artefacts of Power', factionRules.artefacts, artefactChoice, artefactAssignee, pickArtefact, reassignArtefact)}
                </div>
              ) : step === 6 ? (
                <div className="ptg-lores-step">
                  {renderLoreColumn('Spell Lore', factionRules.spell_lore, spellLore, setSpellLore)}
                  <div className="ptg-path-section-divider" />
                  {renderLoreColumn('Prayer Lore', factionRules.prayer_lore, prayerLore, setPrayerLore)}
                  <div className="ptg-path-section-divider" />
                  {renderLoreColumn('Manifestation Lore', factionRules.manifestation_lore, manifestationLore, setManifestationLore)}
                </div>
              ) : step === 7 ? (
                <div className="ptg-quest-step">
                  <div className="ptg-apotheosis-group-title">Quest</div>
                  <div className="ptg-apotheosis-options-grid">
                    {QUESTS.map((q, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`ptg-apotheosis-option-btn${currentQuest === q.name ? ' ptg-apotheosis-option-selected' : ''}`}
                        onClick={() => setCurrentQuest(q.name)}
                      >
                        <AbilityCard ab={{ ...q, bullets: [] }} keywords={[]} />
                      </button>
                    ))}
                  </div>

                  <div className="ptg-path-section-divider" />

                  <div className="ptg-quest-log-grid">
                    <div className="ptg-field"><label>Current Quest</label><input type="text" value={currentQuest} onChange={e => setCurrentQuest(e.target.value)} placeholder="e.g. Search for the Artefact" /></div>
                    <div className="ptg-field"><label>Quest Points</label><input type="text" value={questPoints} onChange={e => setQuestPoints(e.target.value)} /></div>
                    <div className="ptg-field"><label>Notes</label><input type="text" value={questNotes} onChange={e => setQuestNotes(e.target.value)} /></div>
                    <div className="ptg-field"><label>Quests Completed</label><input type="text" value={questsCompleted} onChange={e => setQuestsCompleted(e.target.value)} /></div>
                  </div>
                </div>
              ) : step === 8 ? (
                <div className="ptg-prepare-step">
                  <div className="ptg-wizard-body-placeholder">
                    Fills in the Army Roster document's Faction, Battle Formation, Army Name, and every Regiment from your Warlord and Order of Battle picks so far — matched back against the faction's real warscrolls for size/points where possible. Safe to run again after adding more units; Auxiliary Units are left alone either way.
                  </div>
                  <button type="button" className="ptg-apotheosis-skip-btn" onClick={prepareArmyRoster}>
                    Auto-fill Army Roster from Order of Battle
                  </button>
                  <div className="ptg-prepare-summary">
                    <div><span>Warlord</span><strong>{warlordName || '—'}</strong></div>
                    <div><span>Order of Battle units</span><strong>{oobUnits.length}</strong></div>
                    <div><span>Army Roster regiments</span><strong>{regiments.length} ({armyUnitsTotal}pts)</strong></div>
                  </div>
                  <button type="button" className="ptg-wizard-nav-btn" onClick={() => { setWarlordPrintPreview(false); setActiveDoc('army'); }}>
                    Open Army Roster to review ›
                  </button>
                </div>
              ) : (
                <div className="ptg-wizard-body-placeholder">Coming soon.</div>
              )}
            </div>

            <div className="ptg-wizard-nav">
              <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
                ‹ Back
              </button>
              <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>
                Next ›
              </button>
            </div>
          </>
  );

  return (
    <>
      <div className="gw-overlay" />
      <div className={`ptg-wizard${wizardViewMode === 'dual' ? ' ptg-wizard-dual-mode' : ''}`} ref={modalRef} role="dialog" aria-modal="true" aria-label={'Recruit Your Forces!'}>
        <div className="gw-view-toggle ptg-wizard-view-toggle">
          <button
            type="button"
            className={`gw-view-mode-btn${wizardViewMode === 'single' ? ' gw-view-mode-btn-active' : ''}`}
            onClick={() => setWizardViewMode('single')}
            title="Single view"
          ><span className="gw-view-icon gw-view-icon-single"><i /></span></button>
          <button
            type="button"
            className={`gw-view-mode-btn${wizardViewMode === 'dual' ? ' gw-view-mode-btn-active' : ''}`}
            onClick={() => setWizardViewMode('dual')}
            title="Dual view — documents alongside every step"
          ><span className="gw-view-icon gw-view-icon-split"><i /><i /></span></button>
        </div>
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>
        {activeDoc === 'warlord' && !warlordPrintPreview && (
          <button className="ab-roster-print-btn" onClick={handleWarlordPrintClick} title="Print">🖨 Print</button>
        )}

        <div className="ptg-wizard-banner">
          Path to Glory!{campaignLabel && <span className="ptg-wizard-banner-campaign"> — {campaignLabel}</span>}
        </div>

        {wizardViewMode === 'dual' ? (
          <div className="ptg-wizard-dual">
            <div className="ptg-wizard-dual-left">
              <div className="ptg-wizard-header">
                <div className="ptg-wizard-title">{'Recruit Your Forces!'}</div>
              </div>
              {renderStepFlow()}
            </div>
            <div className="ptg-wizard-dual-right">
              <div className="ptg-doc-tray">
                {DOCS.map(doc => (
                  <DocThumb key={doc.key} doc={doc} active={activeDoc === doc.key} onClick={key => { setWarlordPrintPreview(false); setActiveDoc(key); }} />
                ))}
              </div>
              <div className="ptg-wizard-dual-preview">
                {activeDoc ? renderDocEditor({ showBackButton: false }) : (
                  <div className="ptg-wizard-body-placeholder">Select a document above to view it here.</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="ptg-wizard-header">
              <div className="ptg-wizard-title">{'Recruit Your Forces!'}</div>
            </div>

            <div className="ptg-doc-tray">
              {DOCS.map(doc => (
                <DocThumb key={doc.key} doc={doc} active={activeDoc === doc.key} onClick={key => { setWarlordPrintPreview(false); setActiveDoc(key); }} />
              ))}
            </div>

            {activeDoc ? renderDocEditor() : renderStepFlow()}
          </>
        )}
      </div>
      {docLightboxOpen && renderDocLightbox()}
    </>
  );
}
