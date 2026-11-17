import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import axios from 'axios';
import { AbilityCard, getPhaseStyle } from './WarscrollGW';
import {
  parseWarscrollMods, addToCharacteristic, subtractFromCharacteristic,
  weaponRowMatchesTarget, describeMod,
} from '../apotheosisEffects';

import BATTLEPACKS from './ptgBattlepacks';
import { ShareButton } from '../shareLink';
import FACTION_PATHS_SCRAPED from './ptgFactionPaths';

function parseFormationBullets(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// Same section classifier WarscrollsPage.js/ArmyBuilderPage.js each keep
// their own copy of, duplicated here so the Starting Units step's list can
// group into the identical Heroes/Infantry/Cavalry/... sections instead of
// one flat alphabetical list.
function unitTypeLabel(row) {
  if (row.is_hero)          return 'Heroes';
  if (row.is_infantry)      return 'Infantry';
  if (row.is_cavalry)       return 'Cavalry';
  if (row.is_beast)         return 'Beasts';
  if (row.is_monster)       return 'Monsters';
  if (row.is_war_machine)   return 'War Machines';
  if (row.is_terrain)       return 'Faction Terrain';
  if (row.is_manifestation) return 'Manifestations';
  return 'Other';
}

// "namarti reavers" -> "Namarti Reavers" — unlike titleCaseKeyword below,
// this actually uppercases whatever the first letter already is rather than
// preserving it, since warscroll names are stored all-lowercase (see
// WarscrollsPage's own table) rather than titleCaseKeyword's all-uppercase
// assumption.
function titleCaseWords(s) {
  return (s || '').replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// "WAR MACHINE" -> "War Machine", for the Anti-X unit-type picker buttons —
// the applied ability text itself stays fully uppercase (matches every real
// scraped "Anti-X (+1 Rend)" weapon ability already in the database).
function titleCaseKeyword(s) {
  return s.replace(/\S+/g, w => w.charAt(0) + w.slice(1).toLowerCase());
}

// Core rules pg 253: a unit only earns its first rank once it has 5+ renown
// points — 0-4 has no rank at all, printed blank on the Order of Battle,
// not "Aspiring" by default.
function rankForRenown(renown) {
  const n = parseInt(renown, 10);
  if (!Number.isFinite(n) || n < 5) return '';
  if (n < 15) return 'Aspiring';
  if (n < 30) return 'Elite';
  if (n < 45) return 'Mighty';
  return 'Legendary';
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
  'Pick your Battle Formation',
  'Train your Warlord',
  'Pick your Warlord Path',
  'Add your Starting units',
  'Add your Enhancements',
  'Add your Lores',
  'Pick your First Quest',
  'Assign your Regiments',
  'Set Paths & Ranks',
  'Prepare for Battle',
  'Apply Wounds', // Ravaged Coast only — see stepCount
];
const WOUNDS_STEP = STEPS.indexOf('Apply Wounds');

// Ravaged Coast aftermath step 4 — battle wounds and battle scars
// (wahapedia.ru/aos4/the-rules/ravaged-coast/, "Tend to Battle Wounds and
// Battle Scars"). A unit's first time reaching each band gives it that band's
// scar (roll D6 on its table); a unit has at most 1 of each type, and scars
// stay even after wounds are healed. 18+ wounds: it succumbs.
const RC_SCAR_TIERS = [
  { key: 'serious',  name: 'Serious',  min: 5,  table: [
    { roll: '1-2', name: 'Smouldering Scars', effect: 'At the end of the battle, roll a dice. On a 5+, this unit suffers D3 battle wounds.' },
    { roll: '3-4', name: 'Unyielding Blisters', effect: 'Damage points allocated to this unit cannot be healed.' },
    { roll: '5-6', name: 'Scorched Limbs', effect: 'Subtract 1 from run rolls and charge rolls for this unit.' },
  ] },
  { key: 'severe',   name: 'Severe',   min: 9,  table: [
    { roll: '1-2', name: 'Blood-deep Corruption', effect: 'This unit cannot use RUN or RETREAT abilities.' },
    { roll: '3-4', name: 'Warp-rust', effect: "Each time you declare a FIGHT ability for this unit, as a reaction, roll a dice. On a 4+, for the rest of the turn, this unit's non-Companion melee weapons cannot be affected by weapon abilities." },
    { roll: '5-6', name: 'Endless Chittering', effect: 'Each time you declare a command for this unit, as a reaction, roll a dice. On a 4+, that command has no effect, it still counts as having been used and the command points spent to use it are still lost.' },
  ] },
  { key: 'critical', name: 'Critical', min: 13, table: [
    { roll: '1-2', name: 'Hissing Wheezes', effect: 'This unit has STRIKE-LAST.' },
    { roll: '3-4', name: 'Ash-blighted', effect: "Subtract 1 from the Attacks characteristic of this unit's weapons." },
    { roll: '5-6', name: 'Raging Agonies', effect: 'Each time you declare a non-CORE ability for this unit, as a reaction, roll a dice. On a 5+, that ability has no effect.' },
  ] },
];
const RC_SUCCUMB_AT = 18;

// Renown thresholds in rank order — index into this is how far up a Path's
// rank abilities a unit has actually unlocked (see rankForRenown).
const RANK_ORDER = ['Aspiring', 'Elite', 'Mighty', 'Legendary'];

// GW currently publishes 3 Path to Glory battlepacks. Ascension's rules are
// hand-transcribed above; Ravaged Coast and Blighted Wilds come from
// ptgBattlepacks.js (their Paths, universal enhancements and lores, and
// in-battle rules) plus the BATTLEPACK_RULES summaries below.
const CAMPAIGNS = [
  { key: 'ascension',    name: 'Ascension',                 desc: 'The core Path to Glory campaign — forge your warlord’s rise to legend.', available: true },
  { key: 'ravaged-coast', name: 'Ravaged Coast',             desc: 'Aqshy’s Ravaged Coast — hunt emberstone, which replaces glory and renown for growing your army.', available: true },
  { key: 'blighted-wilds', name: 'Blighted Wilds',           desc: 'Thyria, western Ghyran — purge the corruption. Glory points, renown, battle scars and battleplan rewards.', available: true },
  { key: 'custom',        name: 'Foreign War of Aggression', desc: 'A custom, homebrew campaign of your own design.', available: true, custom: true },
];

// Starting points limit per campaign, per the core rules (Ascension: pg 237,
// "combined points value... cannot exceed 1000 points"). Add entries here
// once Ravaged Coast/Blighted Wilds limits are known — auto-fills the Army
// Roster's Points Limit field when that campaign is picked.
const CAMPAIGN_POINTS_LIMITS = {
  ascension: '1000',
  'ravaged-coast': '1000',
  'blighted-wilds': '1000',
};

// Every Path the wizard knows, for name/rank lookups by key (keys are
// prefixed per battlepack: rc-, bw-, so they never collide).
const BATTLEPACK_PATHS = Object.values(BATTLEPACKS).flatMap(b => b.paths);

// ── Reading a unit's Path and rank back off its Path abilities ──
// The Order of Battle's Rank column is otherwise derived from renown alone
// (rankForRenown), which leaves it blank below 5 points — so an imported
// roster, which arrives at 0 renown with its Path abilities intact, printed
// "Focused Sorcery, Overspilling Power" with nothing in Rank beside it. The
// abilities themselves say which Path they belong to and how far up it the
// unit has climbed, so read it from them.
//
// Matching is punctuation- and case-insensitive: New Recruit writes "First
// to the Fight", the scraped tables have "First To The Fight".
function abilityKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Scores every known Path against the listed abilities and returns the one
// matching most of them, with the highest rank any match sits at. Ties go to
// the path declared on the row (`preferKey`), then to the first found.
export function derivePathAndRank(abilityText, allPaths, preferKey = '') {
  const names = String(abilityText || '').split(',').map(a => abilityKey(a)).filter(Boolean);
  if (!names.length) return null;
  let best = null;
  for (const path of allPaths) {
    if (!path?.ranks?.length) continue;
    let matched = 0;
    let topRank = -1;
    path.ranks.forEach(r => {
      const hit = (r.options || []).some(o => names.includes(abilityKey(o.name)));
      if (!hit) return;
      matched += 1;
      topRank = Math.max(topRank, RANK_ORDER.indexOf(r.rank));
    });
    if (!matched) continue;
    const preferred = preferKey && path.key === preferKey;
    if (!best || matched > best.matched || (matched === best.matched && preferred && !best.preferred)) {
      best = { name: path.name, rank: RANK_ORDER[topRank] || '', matched, preferred };
    }
  }
  return best;
}

// "Path of the Brawler - Elite" for the Rank column. Falls back to whatever
// rank the row already carries when the abilities match nothing known, so a
// hand-typed ability never blanks out a rank the renown had earned.
export function pathRankLabel(row, allPaths) {
  const found = derivePathAndRank(row?.pathAbility, allPaths, row?.path || '');
  if (!found) return row?.rank || '';
  return [found.name, found.rank || row?.rank].filter(Boolean).join(' - ');
}

// ── Applying Anvil of Apotheosis picks ──
// Pulled out of the wizard's memos so the read-only preview can run the
// identical maths: a shared sheet has to show the numbers the owner sees,
// not the base profile sitting underneath the picks. The wizard's memos
// below are now thin wrappers over these, so there is one implementation.
export function apotheosisModsFrom(apotheosisSteps, c) {
  if (!apotheosisSteps?.length) return [];
  const stepBy = re => apotheosisSteps.find(st => re.test(st.step_title || ''));
  const archetypeStepData = stepBy(/(?:choose|pick) an archetype/i);
  const companionStepData = stepBy(/choose a companion/i);
  const originFlawStepData = stepBy(/origin.*flaw/i);
  const mountStepData = stepBy(/^(?:choose|pick) a battle mount$/i);
  const mountUpgradesStepData = stepBy(/^(?:pick any |battle any )?battle mount upgrades$/i);
  const otherUpgradesStepData = stepBy(/pick any other upgrades/i);

  // Order matters: a later pick's "set" wins over an earlier one's, and
  // this is the order the player makes them in (Archetype first, loose
  // upgrades last), which is also the order the source presents them.
  const picked = [];
  if (archetypeStepData?.options?.[c.archetypeChoice]) picked.push(archetypeStepData.options[c.archetypeChoice]);
  if (c.companionChoice >= 0 && companionStepData?.options?.[c.companionChoice]) picked.push(companionStepData.options[c.companionChoice]);
  if (originFlawStepData) {
    const byGroup = {};
    for (const o of originFlawStepData.options) { (byGroup[o.option_group] ??= []).push(o); }
    for (const group of ['Origins', 'Flaws']) {
      const idx = c.originFlawChoice?.[group];
      if (idx != null && byGroup[group]?.[idx]) picked.push(byGroup[group][idx]);
    }
  }
  if (c.mountChoice >= 0 && mountStepData?.options?.[c.mountChoice]) picked.push(mountStepData.options[c.mountChoice]);
  for (const i of (c.battleMountUpgradesChoice || [])) if (mountUpgradesStepData?.options?.[i]) picked.push(mountUpgradesStepData.options[i]);
  for (const i of (c.otherUpgradesChoice || [])) if (otherUpgradesStepData?.options?.[i]) picked.push(otherUpgradesStepData.options[i]);

  return picked
    .map(opt => ({ opt, mods: parseWarscrollMods(opt.effect) }))
    .filter(entry => entry.mods.length > 0);
}

export function applyStatMods(base, modSources) {
  const out = { ...base };
  const sources = { move: [], health: [], save: [], control: [] };
  const setBy = {};
  const addDelta = {};
  for (const { opt, mods } of modSources) {
    for (const m of mods) {
      if (m.kind !== 'stat') continue;
      if (m.op === 'set') {
        out[m.stat] = m.value;
        setBy[m.stat] = opt.name;
        addDelta[m.stat] = 0; // a later "set" discards the earlier adds it replaces
      } else if (m.op === 'add') {
        const next = addToCharacteristic(out[m.stat], m.value);
        if (next == null) continue;
        out[m.stat] = next;
        addDelta[m.stat] = (addDelta[m.stat] || 0) + m.value;
      } else if (m.op === 'prefix') {
        if (!String(out[m.stat] || '').startsWith(m.value)) out[m.stat] = `${m.value}${out[m.stat] || ''}`;
      }
      sources[m.stat].push(`${opt.name} — ${describeMod(m)}`);
    }
  }
  return { ...out, sources, setBy, addDelta };
}

export function applyKeywordMods(line1, modSources) {
  let parts = (line1 || '').split(',').map(k => k.trim()).filter(Boolean);
  const head = k => k.replace(/\s*\(.*$/, '').trim().toUpperCase();
  const has = k => parts.some(p => p.toUpperCase() === k.toUpperCase());
  const addKeyword = k => {
    if (has(k)) return;
    // "WIZARD (1)" replaces an existing "WIZARD (2)" rather than sitting
    // beside it; a bare keyword with no value just appends.
    const i = /\(/.test(k) ? parts.findIndex(p => head(p) === head(k)) : -1;
    if (i >= 0) parts[i] = k; else parts.push(k);
  };
  for (const { mods } of modSources) {
    for (const m of mods) {
      if (m.kind === 'keywordNumber') {
        const i = parts.findIndex(p => head(p) === m.keyword.toUpperCase());
        const current = i >= 0 ? parseInt(/(\d+)/.exec(parts[i])?.[1] ?? '0', 10) : 0;
        const value = m.op === 'add' ? current + m.value : m.value;
        if (i >= 0) parts[i] = `${m.keyword} ${value}`; else parts.push(`${m.keyword} ${value}`);
      } else if (m.kind === 'powerLevel') {
        // The hero's WIZARD (n) — or PRIEST (n) if it isn't a Wizard.
        const i = ['WIZARD', 'PRIEST'].map(k => parts.findIndex(p => head(p) === k)).find(x => x >= 0) ?? -1;
        if (i >= 0) {
          const current = parseInt(/\((\d+)\)/.exec(parts[i])?.[1] ?? '0', 10);
          parts[i] = `${head(parts[i])} (${m.op === 'add' ? current + m.value : m.value})`;
        }
      } else if (m.kind === 'keyword' && m.op === 'replace') {
        const i = parts.findIndex(p => p.toUpperCase() === m.from.toUpperCase());
        if (i >= 0) parts.splice(i, 1);
        m.to.forEach(addKeyword);
      } else if (m.kind === 'keyword' && m.op === 'add') {
        m.keywords.forEach(addKeyword);
      }
    }
  }
  return parts.join(', ');
}

export function applyWeaponMods(rows, listIsMelee, modSources, companionNames = []) {
  if (!modSources.length) return rows;
  return rows.map(row => {
    const next = { ...row, __mods: {}, __setBy: {}, __addDelta: {} };
    for (const { opt, mods } of modSources) {
      // An "X or add N to Y" option is a choice between two weapons — only
      // the branch naming a weapon this hero actually has applies, and only
      // one branch of the group ever does.
      const usedGroups = new Set();
      for (const m of mods) {
        if (m.kind !== 'weapon') continue;
        if (!weaponRowMatchesTarget(next, m.target, listIsMelee, companionNames)) continue;
        if (m.exclusiveGroup) {
          if (usedGroups.has(m.exclusiveGroup)) continue;
          usedGroups.add(m.exclusiveGroup);
        }
        if (m.op === 'set') {
          next[m.field] = m.value;
          next.__setBy[m.field] = opt.name;
          next.__addDelta[m.field] = 0;
        } else {
          const bumped = addToCharacteristic(next[m.field], m.value);
          if (bumped == null) continue;
          next[m.field] = bumped;
          next.__addDelta[m.field] = (next.__addDelta[m.field] || 0) + m.value;
        }
        (next.__mods[m.field] ??= []).push(`${opt.name} — ${describeMod(m)}`);
      }
    }
    return next;
  });
}

export function wardFromKeywords(line) {
  return (/\bWARD\s*\((\d+\+?)\)/i.exec(line || '') || [])[1] || '';
}

// Short summaries of each battlepack's roster-building and aftermath rules,
// shown on the Select your Campaign step and alongside the relevant steps.
// The full in-battle rules (BATTLEPACKS[key].battle_abilities) render as
// ability cards underneath.
const BATTLEPACK_RULES = {
  'ravaged-coast': {
    roster: [
      'Starting roster: 1000 points (groups can agree higher). No single unit may cost more than 350 points (except Sons of Behemat Heroes).',
      'Pick a faction and up to 1 battle formation, then a general (a single-model Hero who leads their own regiment).',
      'General’s regiment: up to 4 non-Hero units with the general’s faction keyword. Up to 4 more regiments, each led by a Hero of the same Grand Alliance with up to 3 non-Hero units of that Hero’s faction.',
      'Auxiliary units allowed (the player with fewer gets +1 command point each battle round). Units can start reinforced.',
      'No Regiment of Renown, faction terrain or enhancements at the start. Unique units can’t take enhancements or Paths (and are discouraged).',
      'Your general starts at the Aspiring rank and picks a Path (and 1 of its 2 Aspiring abilities) straight away.',
      'Starting spells/prayers: 1 Unlimited spell and 1 Unlimited prayer from your faction’s lores, plus 1 more spell the first time a Wizard joins the roster and 1 more prayer the first time a Priest does. The Arcane Tome holds 6 spells/prayers in total.',
    ],
    aftermath: [
      'Gain emberstone shards: win = 3, loss = D3, draw = D3 (re-roll once). +D3 for a Hateful Shores battleplan. +1 per emberstone token your army ended the battle with. Renown points convert at 5 : 1.',
      'Manage your roster: promote a Hero, retire units (refunds 1–5 shards by points value), move/remove enhancements, change your general (they suffer D3 battle wounds), change a unit’s Path (drop 1 rank).',
      'Spend shards (each action once per aftermath): embark on a Path / Aspiring 1, Elite 2, Mighty 4, Legendary 6. Enhancement 3, spell or prayer 2. Recruit a unit 2 / 3 / 4 / 6 / 8 / 10 / 15 (by 100-point bands, 601+ = 15). Faction terrain 3, emberstone-enhanced weapon 2, Ravaged Coast Regiment of Renown 2.',
      'Tend to battle wounds and battle scars.',
      'Battleplans unlock in order: Scorched Outskirts → Gnaw’s Edge (once a player has gained 20+ shards) → Hateful Shores (after a Gnaw’s Edge win) → Raid on Hel’s Claw (once both players have a Hateful Shores win). Winning a major victory at Hel’s Claw ends the campaign.',
    ],
  },
  'blighted-wilds': {
    roster: [
      'Suggested starting roster: 1000 points (or each player starts with a Spearhead army in the general’s regiment).',
      'Pick a faction (Armies of Renown allowed) and up to 1 battle formation, then a general (a single-model Hero who leads their own regiment).',
      'General’s regiment: up to 4 non-Hero units with the general’s faction keyword. Up to 4 more regiments, each led by a Hero of the same Grand Alliance with up to 3 non-Hero units of that Hero’s faction.',
      'Only Regiments of Ghyran can be used as Regiments of Renown (max 1). 1 faction terrain feature and 1 Landmark of Ghyran allowed. Auxiliary units and reinforced units allowed.',
      'Your general starts with 5 renown points at the Aspiring rank and picks a Path straight away. Paths from other battlepacks (e.g. Ravaged Coast) can be picked too.',
      'Enhancements: pick 1 heroic trait and 1 artefact of power (from your battletome or The Pride of Thyria / Thyrian Wonders), plus 1 from each unique enhancement table your faction has.',
      'Starting lores: up to 3 spells from 1 spell lore, up to 3 prayers from 1 prayer lore, and up to 3 Summon spells/prayers from 1 manifestation lore (universal manifestation lores allowed). Arcane Tome: 6 non-Summon + 3 Summon slots.',
    ],
    aftermath: [
      'Earn glory points (cumulative, by the opponent’s army size <1000 / 1000–1250 / 1251–1500 / 1501–2000 / >2000): fought a battle 60/110/150/180/200, major victory +30/40/50/55/60, minor victory +20/30/40/45/50, your general not slain +10/15/20/25/30.',
      'Gain renown: each unit that fought and survived D3, destroyed units 1, your favoured warriors (not your general) D6, plus bonus renown from ‘Purify the Land’. Ranks: Aspiring 5–14, Elite 15–29, Mighty 30–44, Legendary 45+.',
      'Manage your roster: promote a Hero, add a Landmark of Ghyran, add 1 new unit or reinforce 1 unit (costs glory points equal to its points), retire units (refund half their points), move/remove enhancements, change your general (D3 battle wounds), change a unit’s Path. Max 5 regiments.',
      'Tend to battle wounds and battle scars: heal resting units, determine battle wounds and scars, heal battle wounds.',
      'Each battleplan also has a reward for the winner (see Battleplan Rewards below).',
    ],
  },
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
  // Mage, Devout and the two Unit Paths (Defender, Attacker): rank data from
  // the core rules' Path to Glory: Ascension (wahapedia.ru/aos4/the-rules/ascension/).
  { key: 'mage', name: 'Path of the Mage', restricted: 'Wizard only',
    desc: 'To walk this Path, your warlord must already have some proficiency in the arcane arts. By the end, they will be able to shape the very realms.',
    ranks: [
      { rank: 'Aspiring', options: [
        {"name": "Dedicated Practitioner", "timing": "Passive", "lore_text": "Uncounted hours poring over esoteric texts has granted this wizard a deep insight into the nature of magic.", "effect": "Add 1 to casting rolls for this WIZARD.", "phase_key": "hero phase"},
        {"name": "Eldritch Ward", "timing": "Passive", "lore_text": "This mage can weave excess magical energies into a cloak of mystic protection.", "effect": "If a casting roll of 10+ is made for this WIZARD, they have WARD (5+) until the start of your next turn.", "phase_key": "hero phase,combat"},
      ] },
      { rank: 'Elite', options: [
        {"name": "Mystic Shield", "timing": "Your Hero Phase", "lore_text": "The caster’s allies are bathed in an unearthly glow that protects them from harm.", "declare": "Pick a visible friendly unit wholly within 12\" of this WIZARD to be the target. Then, make a casting roll of 2D6.", "effect": "The target has WARD (6+) this turn.", "casting_value": "6", "keywords": "SPELL", "phase_key": "hero phase,combat"},
        {"name": "Arcane Conduit", "timing": "Your Hero Phase", "lore_text": "The caster focuses on channelling the motes of magic that suffuse the realms.", "declare": "Make a casting roll of 2D6.", "effect": "Until the end of the phase, add 1 to casting rolls for friendly units.", "casting_value": "3", "keywords": "SPELL", "phase_key": "hero phase"},
      ] },
      { rank: 'Mighty', options: [
        {"name": "Magical Might", "timing": "Reaction: You declared a SPELL ability for this WIZARD", "lore_text": "This wizard is invigorated through the harnessing of magic.", "effect": "If that spell is cast, after resolving the effects of that spell, Heal (D3) this WIZARD."},
        {"name": "Arcane Familiar", "timing": "Once Per Phase, Reaction: You declared a SPELL for this WIZARD", "lore_text": "A small creature follows this wizard and serves as a focus for their power.", "used_by": "This WIZARD.", "effect": "Re-roll 1 of the dice in the casting roll.", "phase_key": "hero phase"},
      ] },
      { rank: 'Legendary', options: [
        {"name": "Eldritch Cataclysm", "timing": "Your Hero Phase", "lore_text": "A storm of raw magic sweeps across the enemy lines causing absolute havoc.", "declare": "Pick a visible enemy unit within 15\" of this WIZARD to be the target. Then, make a casting roll of 2D6.", "effect": "Roll a dice for each model in the target unit. For each 4+, inflict 1 mortal damage on that unit.", "casting_value": "8", "keywords": "SPELL", "phase_key": "hero phase"},
        {"name": "Sunder the Earth", "timing": "Your Hero Phase", "lore_text": "The ground before the caster splits and a gaping fissure snakes forth.", "declare": "Pick a point on the battlefield within 18\" of this WIZARD. Then, make a casting roll of 2D6.", "effect": "Draw a line between that point and the closest point on this WIZARD’s base. Inflict D3 mortal damage on each unit the line crosses (roll for each).", "casting_value": "8", "keywords": "SPELL", "phase_key": "hero phase"},
      ] },
    ] },
  { key: 'devout', name: 'Path of the Devout', restricted: 'Priest only',
    desc: 'With an unshakable faith to guide them, this warlord has been chosen by their patron deity for a greater purpose (or so they claim!).',
    ranks: [
      { rank: 'Aspiring', options: [
        {"name": "Focused Meditation", "timing": "Deployment Phase", "lore_text": "On the eve of battle, this mysterious priest isolates themselves to prepare for the fight to come.", "effect": "This PRIEST gains D3 ritual points.", "phase_key": "deployment"},
        {"name": "Divine Blessing", "timing": "Passive", "lore_text": "It is said this one courts the attention of their deity and walks the realms as their holy envoy.", "effect": "This PRIEST has WARD (6+).", "phase_key": "combat"},
      ] },
      { rank: 'Elite', options: [
        {"name": "Righteous Conviction", "timing": "Your Hero Phase", "lore_text": "The priest calls upon their deity to bless their allies with strength.", "declare": "Make a chanting roll of D6.", "effect": "Pick a visible friendly unit wholly within 12\" of this PRIEST. Until the start of your next turn, add 1 to wound rolls for combat attacks made by that unit.", "casting_value": "4", "keywords": "PRAYER", "phase_key": "hero phase,combat"},
        {"name": "Resurrection", "timing": "Once Per Battle, Your Hero Phase", "lore_text": "A fallen hero is brought back from death, their vitality fully restored.", "declare": "Make a chanting roll of D6.", "effect": "Pick a friendly INFANTRY HERO that has been slain and return them to the battlefield. Set up that HERO wholly within 3\" of this PRIEST.", "casting_value": "7", "keywords": "PRAYER", "phase_key": "hero phase"},
      ] },
      { rank: 'Mighty', options: [
        {"name": "Master of Ceremonies", "timing": "Passive", "lore_text": "This priest has dedicated their life to their craft.", "effect": "Each time you make a chanting roll for this PRIEST, you can roll 2 dice and pick 1 to be the roll."},
        {"name": "Hallowed Champion", "timing": "Passive", "lore_text": "The faith of this priest is nigh on tangible to those around them.", "effect": "Friendly units have WARD (6+) while they are wholly within 12\" of this PRIEST.", "phase_key": "combat"},
      ] },
      { rank: 'Legendary', options: [
        {"name": "Ritual of Death", "timing": "Your Hero Phase", "lore_text": "Thunder rumbles in the skies above as the wrath of a god is wrought upon their enemies.", "declare": "Make a chanting roll of D6.", "effect": "Inflict 1 mortal damage on each enemy unit on the battlefield. Inflict D3 mortal damage instead if the chanting roll was 9+ (roll for each).", "casting_value": "6", "keywords": "PRAYER", "phase_key": "hero phase"},
        {"name": "Ritual of Life", "timing": "Your Hero Phase", "lore_text": "Responding to the fervent dedication of the priest, the gods themselves shower those who fight in their name with their blessings.", "declare": "Make a chanting roll of D6.", "effect": "Pick each friendly unit on the battlefield to Heal (1). Heal (D3) instead if the chanting roll was 9+ (roll for each).", "casting_value": "8", "keywords": "PRAYER", "phase_key": "hero phase"},
      ] },
    ] },
  // Unit Paths (non-HERO units only) — hero: false keeps them off Hero lists.
  { key: 'defender', name: 'Path of the Defender', restricted: 'non-Hero units only', hero: false,
    ranks: [
      { rank: 'Aspiring', options: [
        {"name": "Hardened Resolve", "timing": "End of Any Turn", "lore_text": "Even when grievous wounds have been wrought upon their flesh, these warriors do not rest.", "effect": "Heal (1) this unit.", "phase_key": "end of turn"},
        {"name": "Steel Discipline", "timing": "Passive", "lore_text": "Even in the heat of this battle, these warriors keep a calm disposition, falling back in formation to strengthen the line elsewhere.", "effect": "When this unit uses a RETREAT ability, no mortal damage is inflicted on it.", "phase_key": "movement"},
      ] },
      { rank: 'Elite', options: [
        {"name": "Uncanny Survivability", "timing": "Passive", "lore_text": "These warriors have emerged unscathed from attacks that should have seen them slain.", "effect": "This unit has WARD (6+).", "phase_key": "combat"},
        {"name": "Unbreakable Formation", "timing": "Once Per Battle, Any Combat Phase", "lore_text": "These warriors brace for impact and let the enemy crash into them as a wave does against a sheer cliff.", "effect": "Subtract 2 from the Rend characteristic of weapons used for attacks that target this unit this phase.", "phase_key": "combat"},
      ] },
      { rank: 'Mighty', options: [
        {"name": "Mighty Custodians", "timing": "Passive", "lore_text": "These warriors would gladly sell their lives before letting the enemy lay claim to their lands.", "effect": "Add 3 to the control score of this unit while it is contesting an objective you control."},
        {"name": "Battle-scarred Veterans", "timing": "Passive", "lore_text": "These warriors shrug off any flesh wounds and minor injuries.", "effect": "Before allocating damage points to this unit, remove 1 damage point in its damage pool."},
      ] },
      { rank: 'Legendary', options: [
        {"name": "Warriors of Renown", "timing": "Passive", "lore_text": "Veterans of a dozen or more battles, these legendary warriors are famed for their resilience and sheer grit.", "effect": "This unit has WARD (5+).", "phase_key": "combat"},
        {"name": "Indomitable Defenders", "timing": "Passive", "lore_text": "No quarter is given to those who would intrude upon the domain of these legendary warriors.", "effect": "This unit has STRIKE-FIRST while it is wholly within friendly territory or contesting an objective you control.", "phase_key": "combat"},
      ] },
    ] },
  { key: 'attacker', name: 'Path of the Attacker', restricted: 'non-Hero units only', hero: false,
    ranks: [
      { rank: 'Aspiring', options: [
        {"name": "Full-on Attack", "timing": "Once Per Battle, Any Combat Phase", "lore_text": "These warriors have forged a bond in the crucible of battle, and they instinctively know when to press home their assault.", "effect": "Add 1 to hit rolls for attacks made by this unit this phase.", "phase_key": "combat"},
        {"name": "Battle Fury", "timing": "Passive", "lore_text": "Nothing can stop these warriors as they charge headlong into the fray.", "effect": "This unit can use CHARGE abilities even if it used a RUN ability in the same turn.", "phase_key": "movement"},
      ] },
      { rank: 'Elite', options: [
        {"name": "Hunter’s Eye", "timing": "Once Per Battle, Deployment Phase", "lore_text": "These elite warriors race forward, eager to be the first to draw the blood of their quarry.", "declare": "Pick an enemy unit.", "effect": "That unit gains the QUARRY keyword. Add 1 to wound rolls for attacks made by this unit that target the QUARRY unit.", "phase_key": "combat,deployment"},
        {"name": "Monster Killers", "timing": "Passive", "lore_text": "These legendary warriors are expert in the slaughter of monstrous foes.", "effect": "Add 1 to the Damage characteristic of this unit’s melee weapons for attacks that target a MONSTER."},
      ] },
      { rank: 'Mighty', options: [
        {"name": "Mighty Conquerors", "timing": "Passive", "lore_text": "These fighters rest not until the lands of the enemy have been laid to ruin.", "effect": "Add 3 to the control score of this unit while it is contesting an objective controlled by your opponent."},
        {"name": "Frenzy", "timing": "Passive", "lore_text": "When battle is met and the sounds of clashing blades ring out, these mighty warriors focus on nothing but the next kill.", "effect": "This unit has WARD (5+) if it used a FIGHT ability in the same phase.", "phase_key": "combat"},
      ] },
      { rank: 'Legendary', options: [
        {"name": "Weapon Masters", "timing": "Passive", "lore_text": "These legendary warriors are renowned for their combat prowess.", "effect": "Add 1 to the Attacks characteristic of this unit’s melee weapons.", "phase_key": "combat"},
        {"name": "Honed Gear", "timing": "Passive", "lore_text": "These warriors learned long ago that well-maintained arms bite deepest.", "effect": "Add 1 to the Rend characteristic of this unit’s melee weapons.", "phase_key": "combat"},
      ] },
    ] },
];
// Core Paths split: Hero Paths (Warrior/Leader/Mage/Devout) and Unit Paths.
const CORE_HERO_PATHS = PATHS.filter(p => p.hero !== false);
const CORE_UNIT_PATHS = PATHS.filter(p => p.hero === false);

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
const FACTION_PATHS_HAND = {
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

// Every faction's own Paths: the scraped Wahapedia set (a Hero Path plus
// Unit Path(s) per faction — hero: true / false; Sons of Behemat's LITTLE /
// BIG Paths have no flag and are offered to both), with any hand-transcribed
// Path of the same name (Idoneth's Perpetual Deep, from dj's battletome
// photos) taking its place so saved picks keep their key.
const FACTION_PATHS = Object.fromEntries(
  [...new Set([...Object.keys(FACTION_PATHS_SCRAPED), ...Object.keys(FACTION_PATHS_HAND)])].map(slug => {
    const hand = (FACTION_PATHS_HAND[slug] || []).map(p => ({ hero: true, ...p }));
    const handNames = new Set(hand.map(p => p.name.toLowerCase()));
    const scraped = (FACTION_PATHS_SCRAPED[slug] || []).filter(p => !handNames.has(p.name.toLowerCase()));
    return [slug, [...hand, ...scraped]];
  })
);
// A Path's fit for a unit: hero: true = Heroes only, false = non-Heroes only.
const pathFitsUnit = (p, isHero) => (p.hero === undefined ? true : !!p.hero === isHero);

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
  warlordMinimal: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAfABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDqZJkW5kjMqqVbGCOgpwnjIK/aI8em2kMDS3UxEkg+boHYDp6CgWr5/wBdL/39b/GkBSvkilXCSqzdgKKuPa7ZULSMw9C7H+dFAixbZ+0z5/vf0qUbuQaz1+0x38kyXKGBv+WRi5B/3s/0qfz367l/I0DFvWMaB+mOaKoardt9mYErkDsDRQI//9k=',
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
  warlordMinimal: '#d6d8d1',
  roster:  '#cdcdc4',
  oob:     '#d1d3cc',
  army1:   '#d1d2cc',
  army2:   '#d1d2cb',
};

// The 4 documents a Path to Glory roster is built from. `images` point at
// scans of the official GW sheets (extracted from the PDFs the user
// provided) — used both for the tray thumbnail and the "Image" presentation.
// `micro`/`thumbMicro` are the blur-up placeholders above.
export const DOCS = [
  // Two Warlord Warscroll scans: `images` (minimal, only 2 weapon rows per
  // table, default) and `imagesFull` (the original 3 ranged/4 melee row
  // scan, used only when a hero actually has more weapons than the minimal
  // template has room for) — see buildWarlordOverlayFields/warlordDocVariant.
  { key: 'warlord', title: 'Warlord Warscroll',
    images: [{ src: '/ptg/warlord-warscroll-minimal.jpg', micro: DOC_MICRO.warlordMinimal, avgColor: DOC_AVG_COLOR.warlordMinimal }],
    imagesFull: [{ src: '/ptg/warlord-warscroll.jpg', micro: DOC_MICRO.warlord, avgColor: DOC_AVG_COLOR.warlord }],
    thumb: '/ptg/warlord-warscroll-thumb.jpg', thumbMicro: DOC_MICRO.warlord, avgColor: DOC_AVG_COLOR.warlord },
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
    // Printing the Warlord Warscroll (window.print(), see
    // handleWarlordPrintClick) resizes this container via @media print CSS
    // (.ab-roster-print-target goes position:absolute + width:100%, which
    // resolves against the page instead of the modal once .ptg-wizard is
    // forced position:static for print) — a real layout change, but
    // ResizeObserver's callback lands in a normal React update, which isn't
    // guaranteed to flush to the DOM before the browser takes its print
    // snapshot. Every overlay field's position is a raw pixel value baked
    // from this hook's box.width/height at the moment it last rendered, so
    // a stale (on-screen-sized) box under a now-print-sized image is exactly
    // the "text drifts off its mark, worse toward the bottom of the page"
    // misalignment reported after printing. 'beforeprint' is guaranteed to
    // fire before that snapshot; flushSync forces the resulting re-render to
    // actually land in the DOM before the handler returns, instead of
    // racing the print engine.
    const onBeforePrint = () => flushSync(compute);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      ro.disconnect();
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [containerRef]);
  return box;
}

// A single overlaid text field — `spec` gives position/size as a % of the
// doc image's own dimensions (from useContainImageBox), so it tracks the
// artwork regardless of viewport size or pillarbox/letterbox bars.
// fontSize is expressed as a fraction of the image's rendered width for the
// same reason (a fixed rem value wouldn't scale with the image).
function overlayFieldStyle(box, spec) {
  const heightPx = spec.height != null ? (spec.height / 100) * box.height : undefined;
  const transforms = [];
  if (spec.centerX) transforms.push('translateX(-50%)');
  // centerY treats `top` as the field's vertical CENTER (mirrors centerX's
  // treatment of `left`) instead of its top edge — translateY(-50%) shifts
  // by half of the element's OWN rendered height, so it self-adjusts to
  // whatever `height` resolves to rather than needing a second number.
  if (spec.centerY) transforms.push('translateY(-50%)');
  return {
    position: 'absolute',
    left: box.left + (spec.left / 100) * box.width,
    top: box.top + (spec.top / 100) * box.height,
    width: spec.width != null ? (spec.width / 100) * box.width : undefined,
    height: heightPx,
    fontSize: (spec.fontSize ?? 0.016) * box.width,
    textAlign: spec.align || 'left',
    // Single-line vertical centering trick — only when centerY is explicitly
    // asked for, so this never fights the weapon-row textarea's multi-line
    // Name+Abilities cell (which sets an explicit height for a different
    // reason and would get its lines squashed onto one by a matched
    // line-height).
    lineHeight: (heightPx != null && spec.centerY) ? `${heightPx}px` : undefined,
    transform: transforms.length ? transforms.join(' ') : undefined,
  };
}

function OverlayField({ box, spec, children }) {
  if (!box.width) return null;
  if (spec.fit) return <OverlayFitField box={box} spec={spec}>{children}</OverlayFitField>;
  return <div className="ptg-doc-overlay-field" style={overlayFieldStyle(box, spec)}>{children}</div>;
}

// A field with a fixed box (spec.height) whose text shrinks until it fits,
// down to 45% of its normal size, instead of spilling onto the rows below
// (long Notes on the Army Roster). Vertically centred in its box.
function OverlayFitField({ box, spec, children }) {
  const ref = useRef(null);
  const inner = useRef(null);
  const base = (spec.fontSize ?? 0.016) * box.width;
  const [scale, setScale] = useState(1);
  const text = String(children ?? '');
  useEffect(() => { setScale(1); }, [text, box.width, box.height]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !inner.current) return;
    if (inner.current.offsetHeight > el.clientHeight + 1 && scale > 0.45) setScale(sc => Math.max(0.45, +(sc - 0.05).toFixed(2)));
  }, [scale, text, box.width, box.height]);
  const style = {
    ...overlayFieldStyle(box, spec),
    fontSize: base * scale,
    lineHeight: 1.08,
    display: 'flex',
    alignItems: 'center',
    justifyContent: spec.align === 'center' ? 'center' : 'flex-start',
  };
  return (
    <div ref={ref} className="ptg-doc-overlay-field" style={style}>
      <span ref={inner} style={{ display: 'block', flexShrink: 0, width: '100%', textAlign: spec.align || 'left' }}>{text}</span>
    </div>
  );
}

// The Officiant (image) view's editable counterpart to OverlayField — same
// position/size math, but a real form control wired to the same state
// setters renderWarlordForm's Non Corporeal inputs use, so a value typed
// here and a value typed there are the exact same piece of state. `multiline`
// picks textarea vs input: only the weapon Name+Abilities cell needs it
// (those are two separately-stored fields joined by '\n' for display, see
// buildWarlordOverlayFields), split back apart on change at the first
// newline. Click stopPropagation keeps interacting with the field from
// bubbling to the page wrapper's "click anywhere to zoom" handler.
function OverlayEditableField({ box, spec, value, onChange, multiline, placeholder }) {
  if (!box.width) return null;
  const style = overlayFieldStyle(box, spec);
  const common = {
    className: 'ptg-doc-overlay-input',
    style,
    value: value ?? '',
    placeholder,
    onClick: e => e.stopPropagation(),
    onChange: e => onChange(e.target.value),
  };
  return multiline
    ? <textarea {...common} rows={2} />
    : <input {...common} type="text" />;
}

// Merges consecutive groups that each carry exactly 1 ability (e.g. Origin's
// single pick, Flaw's single pick) into one paired row with a small source
// label per column, instead of each getting its own full-width header
// followed by a solo card with a wasted second column. Groups with 2+
// abilities (or a singleton with no singleton neighbor) render unchanged.
function packAbilityGroups(groups) {
  const out = [];
  let i = 0;
  while (i < groups.length) {
    const g = groups[i];
    const next = groups[i + 1];
    if (g.abilities.length === 1 && next?.abilities.length === 1) {
      out.push({ paired: true, columns: [
        { source: g.header, ability: g.abilities[0] },
        { source: next.header, ability: next.abilities[0] },
      ] });
      i += 2;
    } else {
      out.push(g);
      i += 1;
    }
  }
  return out;
}

function OverlayAbilityMiniCard({ a }) {
  const ps = getPhaseStyle(a);
  return (
    <div className="ptg-doc-overlay-ability" style={{ borderColor: ps.border }}>
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
//
// The area has a fixed height (spec.height, the scanned template's own
// blank space) and no scrollbar — a scrolling area over a printed page
// reads as broken, and this component's own scroll never worked right
// nested inside the doc's absolutely-positioned overlay anyway. Instead,
// trailing groups that don't fully fit are dropped entirely (never
// rendered clipped mid-card) via a measure-and-shrink pass below.
function OverlayAbilitiesBlock({ box, spec, groups }) {
  const packed = React.useMemo(() => packAbilityGroups(groups || []), [groups]);
  const packedKey = packed.map(g => g.paired
    ? `p:${g.columns[0].ability.name}+${g.columns[1].ability.name}`
    : `${g.header}:${g.abilities.map(a => a.name).join(',')}`).join('|');

  const containerRef = useRef(null);
  const [fitCount, setFitCount] = useState(packed.length);

  useEffect(() => { setFitCount(packed.length); }, [packedKey]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || fitCount <= 0) return;
    // overflow:hidden clips visually but scrollHeight still reports the
    // true unclipped content height, and clientHeight the visible box —
    // shrink one group at a time until everything shown actually fits.
    if (el.scrollHeight > el.clientHeight + 1) {
      setFitCount(c => Math.max(0, c - 1));
    }
  }, [fitCount, packedKey, box.width, box.height]);

  if (!box.width || !packed.length) return null;
  const style = {
    position: 'absolute',
    left: box.left + (spec.left / 100) * box.width,
    top: box.top + (spec.top / 100) * box.height,
    width: (spec.width / 100) * box.width,
    height: spec.height != null ? (spec.height / 100) * box.height : undefined,
    fontSize: (spec.fontSize ?? 0.019) * box.width,
    overflow: 'hidden',
  };
  const visible = packed.slice(0, fitCount);
  return (
    <div ref={containerRef} className="ptg-doc-overlay-abilities" style={style}>
      {visible.map((g, gi) => g.paired ? (
        <div key={gi} className="ptg-doc-overlay-ability-group ptg-doc-overlay-ability-group-paired">
          {g.columns.map((c, ci) => (
            <div key={ci} className="ptg-doc-overlay-ability-paircol">
              <div className="ptg-doc-overlay-ability-group-hdr">{c.source}</div>
              <OverlayAbilityMiniCard a={c.ability} />
            </div>
          ))}
        </div>
      ) : (
        <div key={gi} className="ptg-doc-overlay-ability-group">
          <div className="ptg-doc-overlay-ability-group-hdr">{g.header}</div>
          {g.abilities.map((a, ai) => <OverlayAbilityMiniCard key={ai} a={a} />)}
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

// Two scanned templates share the same wheel/name/keywords layout (pixel-
// confirmed: weapon-table column x-positions and the Keywords bar both land
// within a fraction of a percent of each other between the two scans) but
// differ in printed weapon-row count: the default "minimal" template only
// has room for 2 ranged + 2 melee rows, freeing up far more of the page for
// the Abilities area below; the "full" template (the original asset) has
// room for 3 ranged + 4 melee. Callers pick the variant per-hero (see
// warlordDocVariant in PathToGloryWizard's officiantData) — minimal unless
// the hero actually has more than 2 of either weapon type.
// Splits a weapon's combined "name\nabilities" cell (see nameVal below) back
// into its two underlying fields on edit — line 1 is always the name, any
// remaining lines (a user could legitimately hit Enter more than once) are
// rejoined as the abilities text, matching how they're re-joined for display.
function splitWeaponNameCell(raw, update, id) {
  const idx = raw.indexOf('\n');
  if (idx === -1) { update(id, 'name', raw); update(id, 'abilities', ''); }
  else { update(id, 'name', raw.slice(0, idx)); update(id, 'abilities', raw.slice(idx + 1)); }
}

function buildWarlordOverlayFields(d) {
  const minimal = d.warlordDocVariant === 'minimal';
  const fields = [];
  fields.push({ spec: centerField(15.5, 10.0, 10, 0.026), value: d.warlordMove, editable: d.setWarlordMove });
  fields.push({ spec: centerField(12.3, 12.6, 8, 0.026), value: d.warlordHealth, editable: d.setWarlordHealth });
  fields.push({ spec: centerField(18.9, 12.6, 8, 0.026), value: d.warlordSave, editable: d.setWarlordSave });
  fields.push({ spec: centerField(15.5, 15.0, 10, 0.026), value: d.warlordControl, editable: d.setWarlordControl });
  // The small circle at the wheel's top-right is the Ward pip. Nothing ever
  // wrote to it, so an upgrade granting WARD (6+) — Uncanny Fortune, say —
  // showed up in the keywords line and left the pip blank. Not editable: the
  // value is read off whichever pick grants the keyword (see warlordWard),
  // the same way a stat an option pins is read-only. Position scanned off
  // the template (circle centre 21.7%, 9.4%).
  fields.push({ spec: centerField(21.7, 9.4, 5, 0.022), value: d.warlordWard });
  fields.push({ spec: centerField(56, 12.5, 55, 0.056), value: d.warlordName, editable: d.setWarlordName });

  // Minimal template's 2 rows are pixel-measured (row band luminance scan):
  // header ends ~23.9%, row 1 spans 23.93%-27.51%, row 2 27.51%-31.10%.
  const rangedRowTops = minimal ? [24.6, 28.2] : [24.6, 28.6, 32.6];
  (d.rangedWeapons || []).slice(0, rangedRowTops.length).forEach((w, i) => {
    const top = rangedRowTops[i];
    const nameVal = [w.name, w.abilities].filter(Boolean).join('\n');
    const upd = d.updateRanged;
    fields.push({ spec: { left: 10, top, width: 44, fontSize: 0.016 }, value: nameVal, multiline: true,
      editable: upd && (val => splitWeaponNameCell(val, upd, w.id)) });
    fields.push({ spec: centerField(55.5, top, 5.5, 0.016), value: w.rng, editable: upd && (val => upd(w.id, 'rng', val)) });
    fields.push({ spec: centerField(61.5, top, 5.5, 0.016), value: w.atk, editable: upd && (val => upd(w.id, 'atk', val)) });
    fields.push({ spec: centerField(67.5, top, 5.5, 0.016), value: w.hit, editable: upd && (val => upd(w.id, 'hit', val)) });
    fields.push({ spec: centerField(73.5, top, 5.5, 0.016), value: w.wnd, editable: upd && (val => upd(w.id, 'wnd', val)) });
    fields.push({ spec: centerField(79.5, top, 5.5, 0.016), value: w.rnd, editable: upd && (val => upd(w.id, 'rnd', val)) });
    fields.push({ spec: centerField(86, top, 6, 0.016), value: w.dmg, editable: upd && (val => upd(w.id, 'dmg', val)) });
  });

  // Minimal melee: header ends ~32.5%, row 1 spans 32.52%-36.15%, row 2
  // 36.15%-39.73% (same pixel-scan method as ranged above).
  const meleeRowTops = minimal ? [33.2, 36.8] : [36.8, 40.8, 44.8, 48.8];
  (d.meleeWeapons || []).slice(0, meleeRowTops.length).forEach((w, i) => {
    const top = meleeRowTops[i];
    const nameVal = [w.name, w.abilities].filter(Boolean).join('\n');
    const upd = d.updateMelee;
    fields.push({ spec: { left: 10, top, width: 51, fontSize: 0.016 }, value: nameVal, multiline: true,
      editable: upd && (val => splitWeaponNameCell(val, upd, w.id)) });
    fields.push({ spec: centerField(62.5, top, 5.5, 0.016), value: w.atk, editable: upd && (val => upd(w.id, 'atk', val)) });
    fields.push({ spec: centerField(68.5, top, 5.5, 0.016), value: w.hit, editable: upd && (val => upd(w.id, 'hit', val)) });
    fields.push({ spec: centerField(74.5, top, 5.5, 0.016), value: w.wnd, editable: upd && (val => upd(w.id, 'wnd', val)) });
    fields.push({ spec: centerField(80.5, top, 5.5, 0.016), value: w.rnd, editable: upd && (val => upd(w.id, 'rnd', val)) });
    fields.push({ spec: centerField(87, top, 6, 0.016), value: w.dmg, editable: upd && (val => upd(w.id, 'dmg', val)) });
  });

  // Abilities — the scanned template's own big blank area below the weapon
  // tables and above the Keywords footer bar (85.84%-89.42%, pixel-measured
  // via a black-bar pixel scan, identical on both templates). `height`
  // clips overflow (see OverlayAbilitiesBlock's own shrink-to-fit pass)
  // rather than running text on top of the Keywords bar. Rendered as real
  // phase-banner ability cards, not plain text — see OverlayAbilitiesBlock/
  // type:'abilities' in DocPage. Minimal's melee table's last (grey) row
  // visually ends ~39.73% (pixel-measured) — top is pushed down ~1.8% past
  // that (one line of the abilities area's own text height at its 0.019
  // fontSize/1.25 line-height, so the gap reads as "one row of text" rather
  // than an arbitrary number) instead of butting the weapon table directly,
  // per direct user report that it read as cramped. Full template's melee
  // table ends ~51%, further down, so it gets a much taller abilities area.
  // width:82 (not 84) so the box's right edge lands at 91% — pixel-measured
  // as the RANGED/MELEE WEAPONS header bars' own right edge on both
  // templates (left edge measured at 8.98%, matching this box's left:9
  // already) — the ability cards' right edge now lines up with the weapon
  // tables' right edge above them instead of overshooting it.
  const abilitiesSpec = minimal
    ? { left: 9, top: 41.5, width: 82, height: 41.5, fontSize: 0.019 }
    : { left: 9, top: 52.5, width: 82, height: 31, fontSize: 0.019 };
  fields.push({ spec: abilitiesSpec, value: d.warlordAbilityGroups, type: 'abilities' });

  // top:86.3 sits the first of 2 keyword lines right on the bar's own first
  // ruled line (was top:95 — well past the bar entirely, rendering below
  // it near the page's bottom margin; confirmed via PIL text simulation
  // against the real scan, see [[feedback_overlay_calibration_technique]]).
  // Rendered as two independent fields (rather than one \n-joined block)
  // so each ruled line's vertical position can be nudged on its own.
  fields.push({ spec: { left: 24, top: 86.1, width: 68, fontSize: 0.015 }, value: d.warlordKeywordsLine1, editable: d.setWarlordKeywordsLine1 });
  fields.push({ spec: { left: 24, top: 87.9, width: 68, fontSize: 0.015 }, value: d.warlordKeywordsLine2, editable: d.setWarlordKeywordsLine2 });
  return fields;
}

// Same treatment as buildOobOverlayFields: positions below are read off the
// actual scan (ptg-roster.jpg, 1524x1985) rather than the original rough
// guesses. The top section (Heraldry row through Notable Events) is a
// direct visual read of each box's edges; the Arcane Tome's 6 lore rows are
// luminance-scanned (alternating shaded/unshaded row bands in the Spell
// Lore column, x 20-35%) since the original 4.15%-per-row spacing drifted
// further off the real ~4.71%-per-row spacing with every row down the list
// — by row 6 that 0.56%-per-row error compounds to over 2.5% (~50px),
// visibly landing a lore entry between two printed rows instead of in one.
function buildRosterOverlayFields(d) {
  const fields = [];
  fields.push({ spec: centerFieldXY(37, 21.16, 20, 0.022), value: d.armyName });
  fields.push({ spec: centerFieldXY(62, 21.16, 20, 0.022), value: d.realmOfOrigin === 'custom' ? d.customRealmName : d.realmLabel });
  fields.push({ spec: centerFieldXY(84, 25.60, 16, 0.032), value: d.gloryPoints });
  fields.push({ spec: centerFieldXY(37, 29.97, 20, 0.022), value: d.factionLabel });
  fields.push({ spec: centerFieldXY(62, 29.97, 20, 0.022), value: d.battleFormation });

  fields.push({ spec: centerFieldXY(19, 41.61, 23, 0.018), value: d.currentQuest });
  fields.push({ spec: centerFieldXY(40, 41.61, 17, 0.018), value: d.questPoints });
  fields.push({ spec: centerFieldXY(19, 46.90, 23, 0.018), value: d.questNotes });
  fields.push({ spec: centerFieldXY(40, 46.90, 17, 0.018), value: d.questsCompleted });

  fields.push({ spec: centerFieldXY(72, 40.10, 42, 0.015), value: d.background });
  fields.push({ spec: centerFieldXY(72, 47.66, 42, 0.015), value: d.notableEvents });

  // Columns (2026-11-16, measured off dj's screenshot): box centres x 26.2 /
  // 50.1 / 76.1%, nudged +0.5 to clear the printed row numbers; the printed
  // page is slanted, so Prayer boxes sit 0.35% and Manifestation boxes 0.75%
  // higher than Spell boxes (dy).
  const loreCols = [
    { rows: d.spellLore, left: 26.7, width: 20.5, dy: 0 },
    { rows: d.prayerLore, left: 50.6, width: 20.5, dy: -0.35 },
    { rows: d.manifestationLore, left: 76.6, width: 24, dy: -0.75 },
  ];
  const loreRowTops = [70.38, 75.06, 79.80, 84.46, 89.17, 93.88];
  for (const col of loreCols) {
    (col.rows || []).slice(0, 6).forEach((v, i) => {
      fields.push({ spec: fitFieldXY(col.left, loreRowTops[i] + col.dy, col.width, 0.015, 3.1), value: v });
    });
  }
  return fields;
}

// Row centers below are derived from a luminance scan of the actual scanned
// template (order-of-battle.jpg, 1524x1985) finding each field's label
// underline, then adding a fixed offset down into that field's own blank
// box (+23px/1985 for a Name/Warscroll/Rank/Renown-shaped row, +35px/1985
// for the taller Enhancements/Path Abilities/Reinforced?-shaped row below
// it) — the two offsets were cross-checked against a direct visual read of
// the box edges and agreed to a couple px, so it's the box's real vertical
// center, not the label line the previous top values were sitting text on
// top of. Every field also now centers on both axes (centerFieldXY) per
// direct request — these are handwriting-style boxes, not left-justified
// prose fields like Background/Notes elsewhere.
function centerFieldXY(left, top, width, fontSize) {
  return { left, top, width, align: 'center', centerX: true, centerY: true, fontSize };
}
// A box centred on (left, top) that is `height`% tall, whose text shrinks
// (and wraps) until it fits instead of overflowing — see OverlayFitField.
function fitFieldXY(left, top, width, fontSize, height = 3) {
  return { ...centerFieldXY(left, top, width, fontSize), height, fit: true };
}
// X-centers below are from a second luminance scan (horizontal this time,
// through each row's box interior) — the row1 Renown column and row2's
// Path Abilities/Reinforced? columns had drifted furthest from their real
// box centers (up to ~2.4%/36px), which is exactly the "Reinforced text
// isn't centered in its field" symptom: the text WAS centered on its own
// coordinate, just not on the box's true center.
// The unit key a sheet field reports for the Warlord (an Anvil-built Hero
// has no warscroll of its own in the database; the preview builds one).
export const WARLORD_UNIT_KEY = '__warlord';

function buildOobOverlayFields(d, pageIndex = 0) {
  const fields = [];
  // Page 1 carries the Warlord; every page holds 5 units (extra Order of
  // Battle pages are added when there are more than 5 — see docPageImages).
  const onFirstPage = pageIndex === 0;
  // "Wounds" in the gutter right of each Renown box (page margin 93.3–99.5%):
  // a small label, then the unit's battle wounds (Apply Wounds step) under it.
  const pushWounds = (rowCentre, wounds) => {
    fields.push({ spec: fitFieldXY(96.4, rowCentre - 1.0, 5.8, 0.0105, 1.3), value: 'Wounds' });
    const n = parseInt(wounds, 10);
    fields.push({ spec: fitFieldXY(96.4, rowCentre + 0.7, 5.8, 0.018, 2), value: n > 0 ? String(n) : '' });
  };
  // Row1 nudged +1.1% down from the box's measured geometric center per
  // direct feedback ("should be a bit lower") — a deliberate offset from
  // true-center, not a remeasurement.
  const warlordRow1 = 20.14;
  // Boxes re-measured 2026-11-16 (centre x, width as % of the sheet): row 1
  // Name 21.8/27, Warscroll 48.9/22, Rank 71.4/18.5, Renown 87.5/8.5; the
  // Warlord's row 2 is Enhancements 21.8/27, Path 49.8/26, Path Abilities
  // 78.5/26. Every box is ~3.2% tall and shrinks its text to fit.
  if (onFirstPage) {
    // Every field in a row reports the whole row (unit + all its abilities),
    // so hovering any of them peeks the warscroll and every ability card.
    const wRow = { unit: WARLORD_UNIT_KEY, abilities: [d.warlordEnhancements, d.warlordPathAbility].filter(Boolean).join(', ') };
    fields.push({ spec: fitFieldXY(21.8, warlordRow1, 27, 0.02), value: d.warlordName, row: wRow });
    fields.push({ spec: fitFieldXY(48.9, warlordRow1, 22, 0.02), value: d.warlordWarscroll });
    fields.push({ spec: fitFieldXY(71.4, warlordRow1, 18.5, 0.02), value: d.warlordRank });
    fields.push({ spec: fitFieldXY(87.5, warlordRow1, 8.5, 0.02), value: d.warlordRenown });
    fields.push({ spec: fitFieldXY(21.8, 25.3, 27, 0.018), value: d.warlordEnhancements, row: wRow });
    fields.push({ spec: fitFieldXY(49.8, 25.3, 26, 0.018), value: d.warlordPathLabel, row: wRow });
    fields.push({ spec: fitFieldXY(78.5, 25.3, 26, 0.018), value: d.warlordPathAbility, row: wRow });
    pushWounds(warlordRow1, d.warlordWounds);
  }

  // Row1 (Unit Name/Warscroll/Rank/Renown) centers per unit block, each
  // +1.1% lower than the box's measured center (same deliberate nudge as
  // the Warlord row above). Row2 (Enhancements/Path Abilities/Reinforced?)
  // sits at the box-measured center unchanged — only row1 was flagged as
  // needing to move.
  const unitRow1Tops = [36.3, 48.89, 61.49, 74.08, 86.68];
  const unitRow2Tops = [41.56, 54.15, 66.75, 79.34, 91.94];
  (d.oobUnits || []).slice(pageIndex * 5, pageIndex * 5 + 5).forEach((u, i) => {
    const row1 = unitRow1Tops[i];
    const row2 = unitRow2Tops[i];
    // Unit row 2: Enhancements 21.8/27, Path Abilities 59.3/42.5, Reinforced? 87.5/8.5.
    const uRow = { unit: u.warscroll || u.name, abilities: [u.enhancements, u.pathAbility].filter(Boolean).join(', ') };
    fields.push({ spec: fitFieldXY(21.8, row1, 27, 0.018), value: u.name, row: uRow });
    fields.push({ spec: fitFieldXY(48.9, row1, 22, 0.018), value: u.warscroll, row: uRow });
    fields.push({ spec: fitFieldXY(71.4, row1, 18.5, 0.018), value: u.rank, row: uRow });
    fields.push({ spec: fitFieldXY(87.5, row1, 8.5, 0.018), value: u.renown });
    pushWounds(row1, u.wounds);
    fields.push({ spec: fitFieldXY(21.8, row2, 27, 0.016), value: u.enhancements, row: uRow });
    fields.push({ spec: fitFieldXY(59.3, row2, 42.5, 0.016), value: u.pathAbility, row: uRow });
    fields.push({ spec: fitFieldXY(87.5, row2, 8.5, 0.014), value: u.reinforced });
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
    // Columns measured off the printed Army Roster: Warscroll Name 22.4–47.8%,
    // Size 49.8–56.1%, Notes 58.5–83.5%, Points 85.5–91.8% of the width; each
    // row's writing line is ~2.3% of the height, starting just above `top`.
    const y = top - 1.15; // `top` is the row's centre; boxes are 2.3% tall
    const rRow = { unit: r.sourceUnitId === 'warlord' ? WARLORD_UNIT_KEY : r.name, abilities: r.notes || '' };
    fields.push({ spec: { left: 23.4, top: y, width: 24.2, height: 2.3, fontSize: 0.017, fit: true }, value: r.name, row: rRow });
    fields.push({ spec: { ...centerField(52.95, y, 6.3, 0.017), height: 2.3, fit: true }, value: r.size });
    fields.push({ spec: { left: 59.4, top: y, width: 23.9, height: 2.3, fontSize: 0.016, fit: true }, value: r.notes, row: rRow });
    fields.push({ spec: { ...centerField(88.65, y, 6.3, 0.017), height: 2.3, fit: true }, value: r.points });
  };

  if (pageIndex === 0) {
    // Header boxes (centres measured off the template): Commander / Army
    // Name 6.8–39% / 40.8–73% wide, 16.3–20.8% high; Faction / Battle
    // Formation same columns, 25–29.6% high; Points Limit 74.6–92.9% wide,
    // 16.3–29.6% high.
    fields.push({ spec: fitFieldXY(22.9, 18.6, 30, 0.02, 4), value: d.commander });
    fields.push({ spec: fitFieldXY(56.9, 18.6, 30, 0.02, 4), value: d.armyRosterName });
    fields.push({ spec: fitFieldXY(83.75, 23, 16, 0.03, 12), value: d.pointsLimit });
    fields.push({ spec: fitFieldXY(22.9, 27.3, 30, 0.02, 4), value: d.armyRosterFaction });
    fields.push({ spec: fitFieldXY(56.9, 27.3, 30, 0.02, 4), value: d.armyRosterFormation });

    const reg1 = d.regiments[0];
    // Row centres measured off the template's General/Unit badges (rows are
    // 3.02% apart); regimentRow takes the centre.
    const reg1Tops = [42.0, 45.02, 48.04, 51.06, 54.08];
    (reg1?.units || []).slice(0, 5).forEach((u, i) => regimentRow(u, reg1Tops[i]));

    const reg2 = d.regiments[1];
    const reg2Tops = [63.41, 66.43, 69.45, 72.47];
    (reg2?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg2Tops[i]));

    const reg3 = d.regiments[2];
    const reg3Tops = [82.3, 85.32, 88.34, 91.36];
    (reg3?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg3Tops[i]));
  } else {
    const reg4 = d.regiments[3];
    const reg4Tops = [16.75, 19.8, 22.82, 25.84];
    (reg4?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg4Tops[i]));

    const reg5 = d.regiments[4];
    const reg5Tops = [35.64, 38.69, 41.71, 44.74];
    (reg5?.units || []).slice(0, 4).forEach((u, i) => regimentRow(u, reg5Tops[i]));

    // Totals boxes (centres measured: Regiments 50.6%, Auxiliary 76.85%, Units 79.85%).
    fields.push({ spec: fitFieldXY(80, 50.6, 22, 0.02, 2.6), value: d.regimentsTotal != null ? `${d.regimentsTotal}pts` : null });

    const auxTops = [59.57, 62.62, 65.64, 68.66, 71.71];
    (d.auxUnits || []).slice(0, 5).forEach((u, i) => regimentRow(u, auxTops[i]));

    fields.push({ spec: fitFieldXY(80, 76.85, 22, 0.02, 2.6), value: d.auxTotal != null ? `${d.auxTotal}pts` : null });
    fields.push({ spec: fitFieldXY(80, 79.85, 22, 0.02, 2.6), value: d.armyUnitsTotal != null ? `${d.armyUnitsTotal}pts` : null });
    fields.push({ spec: { left: 20, top: 87.5, width: 70, fontSize: 0.017 }, value: d.armyNotes });
  }
  return fields;
}

function buildOverlayFields(docKey, pageIndex, d) {
  switch (docKey) {
    case 'warlord': return buildWarlordOverlayFields(d);
    case 'roster':  return buildRosterOverlayFields(d);
    case 'oob':     return buildOobOverlayFields(d, pageIndex);
    case 'army':    return buildArmyOverlayFields(d, pageIndex);
    default: return [];
  }
}

// One doc page: the scan image plus its live-data overlay. A real component
// (not a plain render-helper closure like the rest of this file's
// render*() functions) because it needs its own useContainImageBox hook —
// hooks can't live in a function that's sometimes not called at all
// (this whole page is skipped whenever presentMode is 'replica').
// onUnitHover / onUnitLeave / onUnitClick (share preview): fields tagged with
// a `unit` (unit names on the Order of Battle and Army Roster) get an
// invisible hotspot that reports the unit name.
// Fields carry their whole row ({ unit, abilities }: the unit's name and the
// comma-separated Enhancements / Path Abilities / Notes text), so any field
// of a row reports all of it.
export function DocPage({ img, alt, docKey, pageIndex, data, onRowHover, onRowLeave, onRowClick }) {
  const containerRef = useRef(null);
  const box = useContainImageBox(containerRef);
  // Editable fields stay even when empty (there'd otherwise be nothing to
  // click into to type a first value); read-only fields with nothing to
  // show are dropped as before.
  const fields = buildOverlayFields(docKey, pageIndex, data).filter(f => f.value || f.editable);
  return (
    <div className="ptg-doc-page-wrap" ref={containerRef} style={{ aspectRatio: PTG_DOC_ASPECT }}>
      <ProgressiveImg src={img.src} micro={img.micro} avgColor={img.avgColor} alt={alt} className="ptg-doc-full-img" />
      <div className="ptg-doc-overlay">
        {fields.map((f, i) => (
          f.editable
            ? <OverlayEditableField key={i} box={box} spec={f.spec} value={f.value} onChange={f.editable} multiline={f.multiline} />
            : f.type === 'abilities'
            ? <OverlayAbilitiesBlock key={i} box={box} spec={f.spec} groups={f.value} />
            : <OverlayField key={i} box={box} spec={f.spec}>{f.value}</OverlayField>
        ))}
        {(onRowHover || onRowClick) && box.width > 0 && fields.filter(f => f.row).map((f, i) => (
          <div
            key={`hot-${i}`}
            className="ptg-doc-unit-hotspot"
            style={{ ...overlayFieldStyle(box, f.spec), ...(f.spec.height != null ? {} : { height: box.height * 0.022 }) }}
            onMouseEnter={e => onRowHover?.(f.row, e)}
            onMouseLeave={() => onRowLeave?.(f.row)}
            onClick={e => onRowClick?.(f.row, e)}
          />
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

// storageKey: which localStorage slot this wizard reads/writes — your own
// roster uses STORAGE_KEY; the Enemy Roster opens in its own slot so viewing
// or editing the enemy never touches your build. enemyName marks the wizard
// as the enemy's (red frame + banner). onSnapshot(snapshot) fires on every
// autosave so the page can push enemy edits back to that saved roster.
export default function PathToGloryWizard({ onClose, factions = [], storageKey = STORAGE_KEY, enemyName = null, onRename = null, onImport = null, onSnapshot = null, onShare = null }) {
  // Read once per mount — resumes wherever the user left off last time they
  // opened this wizard (localStorage persists it across close/reopen).
  const saved = (() => { try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; } })();
  // WarscrollsPage.js's own Hide toggles ('aos-filters') — read once as the
  // Starting Units step's default so it opens already matching whatever the
  // player left Hide: Scourge/Regiments of Renown/Legends set to on the main
  // table, per-page override afterward same as every other page.
  const sharedFilterDefaults = (() => { try { return JSON.parse(localStorage.getItem('aos-filters')) || {}; } catch { return {}; } })();

  // Steps v2 added 'Pick your Battle Formation' at 2; older saves shift up one.
  const [step, setStep] = useState(() => { const st = saved.step ?? 0; return (saved.stepsVersion ?? 1) < 2 && st >= 2 ? st + 1 : st; });
  // The roster's name is shown in the banner and, when the page passes
  // `onRename`, is editable there — clicking it turns it into an input and
  // committing renames the saved roster. A local draft keeps typing
  // responsive; the committed value comes back down as a new `enemyName`.
  const bannerName = (enemyName || '').replace(/^Enemy:\s*/, '');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(bannerName);
  const nameInputRef = useRef(null);
  useEffect(() => { if (!editingName) setNameDraft(bannerName); }, [bannerName, editingName]);
  useEffect(() => {
    if (editingName && nameInputRef.current) { nameInputRef.current.focus(); nameInputRef.current.select(); }
  }, [editingName]);
  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== bannerName && onRename) onRename(next);
    else setNameDraft(bannerName);
    setEditingName(false);
  };
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
  // Dual view's right-hand column follows whichever step the left-hand flow
  // is on, so the relevant doc is already in view instead of making the
  // user hunt for it in the tray above. Only fires on a `step`/view-mode
  // change (not on every render) so a manual pick from the doc tray while
  // sitting on one step (e.g. peeking at the Army Roster mid-Quest) isn't
  // immediately stomped. Steps 0-1 (Campaign/Faction) have no obvious
  // matching doc, so they're left out of the map and whatever's already
  // active stays put.
  useEffect(() => {
    if (wizardViewMode !== 'dual') return;
    const STEP_DOC = { 2: 'warlord', 3: 'warlord', 4: 'oob', 5: 'roster', 6: 'roster', 7: 'roster', 8: 'army' };
    const doc = STEP_DOC[step];
    if (doc) { setWarlordPrintPreview(false); setActiveDoc(doc); }
  }, [step, wizardViewMode]); // eslint-disable-line
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
  // The picked battlepack's data (Ravaged Coast / Blighted Wilds), or null
  // for Ascension and custom campaigns — drives the Paths, Enhancements,
  // Lores and step-8 (Quest / Emberstone / Glory) content below.
  const bp = BATTLEPACKS[campaign] || null;
  // Apply Wounds is the last step, and only Ravaged Coast has it.
  const stepCount = campaign === 'ravaged-coast' ? STEPS.length : WOUNDS_STEP;
  const lastStepRef = useRef(stepCount - 1);
  lastStepRef.current = stepCount - 1;
  useEffect(() => { if (step > stepCount - 1) setStep(stepCount - 1); }, [step, stepCount]);
  const stepLabels = STEPS.slice(0, stepCount).map((l, i) => (i !== 8 ? l
    : campaign === 'ravaged-coast' ? 'Emberstone Vault'
    : campaign === 'blighted-wilds' ? 'Glory & Renown'
    : l));
  // Ravaged Coast battle wounds / scars on the Warlord (Order of Battle rows
  // keep theirs on the row: wounds, scars, drained).
  const [warlordWounds, setWarlordWounds] = useState(() => saved.warlordWounds ?? 0);
  const [warlordScars, setWarlordScars] = useState(() => saved.warlordScars ?? {});
  const [warlordDrained, setWarlordDrained] = useState(() => saved.warlordDrained ?? false);
  // Ravaged Coast: emberstone shards currently in the vault, and gained over
  // the whole campaign (the roster tracks both).
  const [emberstoneVault, setEmberstoneVault] = useState(() => saved.emberstoneVault ?? '0');
  const [emberstoneTotal, setEmberstoneTotal] = useState(() => saved.emberstoneTotal ?? '0');
  const [customCampaignName, setCustomCampaignName] = useState(() => saved.customCampaignName ?? '');
  // "Allow other campaign paths": campaign keys whose Paths are offered on
  // top of this campaign's own (e.g. a Warlord carried over from Ascension
  // keeping Path of the Warrior in Ravaged Coast). Off by default.
  const [extraPathCampaigns, setExtraPathCampaigns] = useState(() => (Array.isArray(saved.extraPathCampaigns) ? saved.extraPathCampaigns : []));

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
  // Same 3 Hide toggles as WarscrollsPage/ArmyBuilderPage (Other Factions
  // doesn't apply — this list is already scoped to one faction).
  const [unitsHideLegends, setUnitsHideLegends] = useState(() => saved.unitsHideLegends ?? sharedFilterDefaults.hideLegends ?? true);
  // Scourge units are matched-play only: never offered in Path to Glory.
  const unitsHideScourge = true;
  const [unitsHideRoR, setUnitsHideRoR] = useState(() => saved.unitsHideRoR ?? sharedFilterDefaults.hideRoR ?? false);
  // Narrows both unit tables to the rows actually carrying a Train/Reinforce
  // count — the faction lists run to 40+ warscrolls, so once the picking is
  // done this is how you read back what you chose without scrolling. Off by
  // default: on an empty roster it would hide everything.
  const [unitsOnlyAdded, setUnitsOnlyAdded] = useState(() => saved.unitsOnlyAdded ?? false);
  useEffect(() => {
    if (!effectiveFactionSlug) { setFactionUnits([]); return; }
    setFactionUnitsLoading(true);
    axios.get('/api/warscrolls', { params: {
      faction: effectiveFactionSlug, pageSize: 9999,
      ...(unitsHideLegends ? { isLegends: '0' } : {}),
      ...(unitsHideScourge ? { hideScourgeOfGhyran: '1' } : {}),
      ...(unitsHideRoR     ? { hideRoR: '1' } : {}),
    } })
      .then(res => setFactionUnits((res.data.data ?? []).filter(r => !r.is_terrain && !r.is_manifestation)))
      .catch(() => setFactionUnits([]))
      .finally(() => setFactionUnitsLoading(false));
  }, [effectiveFactionSlug, unitsHideLegends, unitsHideScourge, unitsHideRoR]);

  // Step 5's "Add unit from other faction in grand alliance" section — a
  // Path to Glory starting roster may take units from any faction sharing
  // the warlord's Grand Alliance, so the step carries a second,
  // collapsed-by-default picker: choose one of those other factions and
  // its units list and add exactly like the home faction's do (same
  // startingUnits map, same Train/Reinforce counts, same points total).
  const [allyPickerOpen, setAllyPickerOpen] = useState(() => saved.allyPickerOpen ?? false);
  const [allyFaction, setAllyFaction] = useState(() => saved.allyFaction ?? '');
  const [allyUnitsLoading, setAllyUnitsLoading] = useState(false);
  // Keyed by faction slug and ACCUMULATED rather than replaced as the
  // pulldown moves — a unit picked from one allied faction has to keep
  // resolving (for the points total and the Order of Battle) after the
  // pulldown moves on to another faction, and across a reload. Only the
  // fields those lookups and the table actually read are kept, since this
  // rides along in the wizard's localStorage payload.
  const [allyUnitsByFaction, setAllyUnitsByFaction] = useState(() => saved.allyUnitsByFaction ?? {});

  const allyFactionOptions = React.useMemo(() => {
    const home = factions.find(f => f.faction_slug === effectiveFactionSlug);
    if (!home) return [];
    return factions.filter(f => f.grand_alliance === home.grand_alliance && f.faction_slug !== home.faction_slug);
  }, [factions, effectiveFactionSlug]);

  useEffect(() => {
    if (!allyFaction) return;
    setAllyUnitsLoading(true);
    axios.get('/api/warscrolls', { params: {
      faction: allyFaction, pageSize: 9999,
      ...(unitsHideLegends ? { isLegends: '0' } : {}),
      ...(unitsHideScourge ? { hideScourgeOfGhyran: '1' } : {}),
      ...(unitsHideRoR     ? { hideRoR: '1' } : {}),
    } })
      .then(res => {
        const slim = (res.data.data ?? [])
          .filter(r => !r.is_terrain && !r.is_manifestation)
          .map(u => ({
            id: u.id, name: u.name, points: u.points, keywords: u.keywords,
            faction_slug: u.faction_slug, faction: u.faction,
            is_hero: u.is_hero, is_infantry: u.is_infantry, is_cavalry: u.is_cavalry,
            is_beast: u.is_beast, is_monster: u.is_monster, is_war_machine: u.is_war_machine,
          }));
        setAllyUnitsByFaction(prev => {
          // Browsing through several allied factions would otherwise leave
          // every list it touched in localStorage forever — keep only the
          // one on screen and the ones something was actually picked from.
          const next = { [allyFaction]: slim };
          for (const [slug, units] of Object.entries(prev)) {
            if (slug === allyFaction) continue;
            if (units.some(u => startingUnitsRef.current[u.id])) next[slug] = units;
          }
          return next;
        });
      })
      .catch(() => setAllyUnitsByFaction(prev => ({ ...prev, [allyFaction]: prev[allyFaction] ?? [] })))
      .finally(() => setAllyUnitsLoading(false));
  }, [allyFaction, unitsHideLegends, unitsHideScourge, unitsHideRoR]);

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
  // Read by the allied-faction fetch's cache prune, which must see the
  // CURRENT picks without taking startingUnits as a dependency (that would
  // re-fetch the whole allied unit list on every + / − click).
  const startingUnitsRef = useRef(startingUnits);
  useEffect(() => { startingUnitsRef.current = startingUnits; }, [startingUnits]);

  // Every unit a startingUnits pick can refer to: the home faction's list
  // plus every allied faction's list still cached. Looking picks up in
  // here rather than in factionUnits alone is what lets an allied unit
  // keep its points and its Order of Battle row after the allied-faction
  // pulldown has moved on to a different faction.
  const startingUnitPool = React.useMemo(
    () => [...factionUnits, ...Object.values(allyUnitsByFaction).flat()],
    [factionUnits, allyUnitsByFaction],
  );

  const startingUnitsTotal = React.useMemo(() => {
    let sum = 0;
    for (const [id, sel] of Object.entries(startingUnits)) {
      const unit = startingUnitPool.find(u => String(u.id) === String(id));
      if (!unit) continue;
      const pts = parseInt(unit.points, 10) || 0;
      sum += (sel.train || 0) * pts + (sel.reinforce || 0) * pts * 2;
    }
    return sum;
  }, [startingUnits, startingUnitPool]);

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
          const step3 = steps.find(s => /(?:choose|pick) an archetype/i.test(s.step_title));
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
      const step3 = steps.find(s => /(?:choose|pick) an archetype/i.test(s.step_title));
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
  // StrictMode double-invokes mount effects in development, and this one's
  // fetch resolves after both invocations have already passed the
  // needsBackfill check — so without a ref guard it adds the faction's
  // starting weapon twice, which is exactly what an imported list (whose
  // snapshot names a faction but carries no weapons) hits every time.
  const mountBackfillRan = useRef(false);
  useEffect(() => {
    const mountFaction = mountFactionRef.current;
    if (!mountFaction || mountBackfillRan.current) return;
    mountBackfillRan.current = true;
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
      const step3 = steps.find(s => /(?:choose|pick) an archetype/i.test(s.step_title));
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

  // Keeps the Order of Battle's Units list in sync with the Starting Units
  // step's Train/Reinforce counts — nothing wired the two together before,
  // so ticking a unit up there silently went nowhere. Each row this creates
  // carries a hidden sourceUnitId tag so the reconciliation below only ever
  // touches rows IT owns; anything added by hand via "+ Add Unit" (no tag)
  // is left alone. Lowering a count trims from the END of that unit's rows,
  // keeping the earliest-created ones — those are the copies most likely to
  // have already had Rank/Renown/Enhancements hand-edited, so they survive
  // in preference to a same-named row added a moment ago.
  useEffect(() => {
    // Train and Reinforce are independent, additive counts — same semantics
    // as Army Builder's own roster state (see startingUnitsTotal above:
    // train*pts + reinforce*pts*2), not "how many of my trained units are
    // also reinforced". A unit with train=0/reinforce=1 is one reinforced
    // unit and nothing else, so the target row count is the SUM of both,
    // not train alone — ticking Reinforce with no Train previously added
    // zero rows here, which is exactly why reinforced-only picks never
    // showed up on the Order of Battle.
    const totalFor = sel => (sel?.train || 0) + (sel?.reinforce || 0);
    setOobUnits(prev => {
      const stillPicked = new Set(Object.keys(startingUnits).filter(id => totalFor(startingUnits[id]) > 0));
      let next = prev.filter(r => !r.sourceUnitId || stillPicked.has(r.sourceUnitId));
      for (const [unitId, sel] of Object.entries(startingUnits)) {
        const target = totalFor(sel);
        const existing = next.filter(r => r.sourceUnitId === unitId);
        if (existing.length === target) continue;
        if (existing.length < target) {
          const unit = startingUnitPool.find(u => String(u.id) === String(unitId));
          if (!unit) continue;
          const toAdd = target - existing.length;
          const displayName = titleCaseWords(unit.name);
          const added = Array.from({ length: toAdd }, (_, i) => ({
            id: `su-${unitId}-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
            sourceUnitId: unitId,
            name: displayName, warscroll: displayName.toUpperCase(), rank: rankForRenown('0'), renown: '0',
            points: unit.points, enhancements: '', pathAbility: '', reinforced: '',
          }));
          next = [...next, ...added];
        } else {
          const keepIds = new Set(existing.slice(0, target).map(r => r.id));
          next = next.filter(r => r.sourceUnitId !== unitId || keepIds.has(r.id));
        }
      }
      // Reinforced marker + doubled points go on the LAST `reinforce` rows
      // of each unit (Train rows fill the slots first) — re-derived fresh
      // every pass rather than stored, so dialing Train/Reinforce up or
      // down just moves the split point instead of needing to track which
      // specific row is "the" reinforced one.
      const countsByUnit = {};
      return next.map(r => {
        if (!r.sourceUnitId) return r;
        const sel = startingUnits[r.sourceUnitId];
        const unit = startingUnitPool.find(u => String(u.id) === String(r.sourceUnitId));
        if (!sel || !unit) return r;
        const idx = countsByUnit[r.sourceUnitId] ?? 0;
        countsByUnit[r.sourceUnitId] = idx + 1;
        const shouldBeReinforced = idx >= (sel.train || 0);
        const basePts = parseInt(unit.points, 10) || 0;
        const reinforced = shouldBeReinforced ? 'Reinforced' : '';
        const points = String(shouldBeReinforced ? basePts * 2 : basePts);
        return (reinforced === r.reinforced && points === r.points) ? r : { ...r, reinforced, points };
      });
    });
  }, [startingUnits, startingUnitPool]); // eslint-disable-line

  // Step 6 "Add your Enhancements" — pick 1 from each enhancement table
  // (Heroic Traits, Artefacts of Power) and assign it to an eligible Hero.
  // "warlord" or an oobUnits row id; the chosen name is written straight
  // into that target's own Enhancements text field (Warlord Warscroll form
  // or the Order of Battle unit row) — see applyEnhancementPick below.
  const [heroicTraitChoice, setHeroicTraitChoice] = useState(() => saved.heroicTraitChoice ?? null);
  const [heroicTraitAssignee, setHeroicTraitAssignee] = useState(() => saved.heroicTraitAssignee ?? 'warlord');
  const [artefactChoice, setArtefactChoice] = useState(() => saved.artefactChoice ?? null);
  const [artefactAssignee, setArtefactAssignee] = useState(() => saved.artefactAssignee ?? 'warlord');
  // "Pick 1 of the following…" enhancements (e.g. Idoneth's Hunter of
  // Souls: Anti-CAVALRY / Anti-INFANTRY / Anti-MONSTER) — which bullet was
  // picked, by enhancement name. Defaults to the first bullet on pick, like
  // Focused Hunter's unit-type buttons.
  const [enhancementSubChoice, setEnhancementSubChoice] = useState(() => saved.enhancementSubChoice ?? {});

  // Adds/removes a single enhancement-name tag on whichever target's
  // Enhancements text field it belongs to ('warlord' or an oobUnits row
  // id), same comma-joined-tag approach as the weapon-ability tagging in
  // applyUpgradeWeaponEffect above — safe to call repeatedly since it only
  // ever touches its own tag, never the rest of what's typed there. `base`
  // is the enhancement's own name: any earlier "<base> (<choice>)" variant
  // of it is replaced too, so re-picking a sub-option swaps rather than stacks.
  const setEnhancementTag = (target, tag, add, base = tag) => {
    if (!target || !tag) return;
    const apply = text => {
      const tags = (text || '').split(',').map(s => s.trim()).filter(Boolean)
        .filter(t => t !== tag && t !== base && !t.startsWith(`${base} (`));
      if (add) tags.push(tag);
      return tags.join(', ');
    };
    if (target === 'warlord') setWarlordEnhancements(apply);
    else setOobUnits(rows => rows.map(r => r.id === target ? { ...r, enhancements: apply(r.enhancements) } : r));
  };

  // The tables list the faction's enhancements followed by the battlepack's
  // universal ones, so picks index into the combined list.
  const heroicTraitOptions = [...(factionRules.heroic_traits || []), ...(BATTLEPACKS[campaign]?.heroic_traits || [])];
  const artefactOptions = [...(factionRules.artefacts || []), ...(BATTLEPACKS[campaign]?.artefacts || [])];

  // "Pick 1 of the following …" enhancements: their bullets are the choices.
  const enhancementChoices = opt => {
    if (!opt || !/pick (?:1|one) of the following/i.test(opt.effect || '')) return null;
    const bullets = Array.isArray(opt.bullets) ? opt.bullets : (() => { try { return JSON.parse(opt.bullets || '[]'); } catch { return []; } })();
    const list = bullets.map(b => (typeof b === 'string' ? b : b?.text || b?.name || '')).map(t => t.trim()).filter(Boolean);
    return list.length ? list : null;
  };
  const enhancementChoiceOf = opt => {
    const list = enhancementChoices(opt);
    if (!list) return null;
    const c = enhancementSubChoice[opt.name];
    return list.includes(c) ? c : list[0];
  };
  const enhancementTagFor = (opt, choice = enhancementChoiceOf(opt)) => (choice ? `${opt.name} (${choice})` : opt.name);

  const pickHeroicTrait = idx => {
    const prevOpt = heroicTraitChoice != null ? heroicTraitOptions[heroicTraitChoice] : null;
    if (prevOpt) setEnhancementTag(heroicTraitAssignee, enhancementTagFor(prevOpt), false, prevOpt.name);
    setHeroicTraitChoice(idx);
    const opt = heroicTraitOptions[idx];
    if (opt) setEnhancementTag(heroicTraitAssignee, enhancementTagFor(opt), true, opt.name);
  };
  const reassignHeroicTrait = newTarget => {
    const opt = heroicTraitChoice != null ? heroicTraitOptions[heroicTraitChoice] : null;
    if (opt) { setEnhancementTag(heroicTraitAssignee, enhancementTagFor(opt), false, opt.name); setEnhancementTag(newTarget, enhancementTagFor(opt), true, opt.name); }
    setHeroicTraitAssignee(newTarget);
  };
  const pickArtefact = idx => {
    const prevOpt = artefactChoice != null ? artefactOptions[artefactChoice] : null;
    if (prevOpt) setEnhancementTag(artefactAssignee, enhancementTagFor(prevOpt), false, prevOpt.name);
    setArtefactChoice(idx);
    const opt = artefactOptions[idx];
    if (opt) setEnhancementTag(artefactAssignee, enhancementTagFor(opt), true, opt.name);
  };
  const reassignArtefact = newTarget => {
    const opt = artefactChoice != null ? artefactOptions[artefactChoice] : null;
    if (opt) { setEnhancementTag(artefactAssignee, enhancementTagFor(opt), false, opt.name); setEnhancementTag(newTarget, enhancementTagFor(opt), true, opt.name); }
    setArtefactAssignee(newTarget);
  };
  // Picking one of a "Pick 1 of the following" enhancement's options.
  const pickEnhancementSubChoice = (opt, assignee, choice) => {
    setEnhancementSubChoice(prev => ({ ...prev, [opt.name]: choice }));
    setEnhancementTag(assignee, enhancementTagFor(opt, choice), true, opt.name);
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
  // The Warlord's points: the "Battle Profile Points Cost" of the Destiny
  // Point tier picked in Train your Warlord (Anvil of Apotheosis step 1);
  // for a faction without an Anvil, the points of the warscroll the Warlord
  // was built from. '' when unknown.
  const warlordPoints = React.useMemo(() => {
    const dpStep = apotheosisSteps.find(st => /destiny point limit/i.test(st.step_title || ''));
    const m = /BATTLE PROFILE POINTS COST:\s*(\d+)/i.exec(dpStep?.options?.[destinyPointChoice]?.effect || '');
    if (m) return m[1];
    const ws = (warlordWarscroll || '').trim().toLowerCase();
    const match = ws && startingUnitPool.find(fu => (fu.name || '').toLowerCase() === ws);
    return match?.points ? String(match.points) : '';
  }, [apotheosisSteps, destinyPointChoice, warlordWarscroll, startingUnitPool]);
  // Keep the Warlord's row in the regiments priced as the tier changes.
  useEffect(() => {
    if (!warlordPoints) return;
    setRegiments(rs => (rs.some(r => r.units.some(u => u.sourceUnitId === 'warlord' && String(u.points) !== warlordPoints))
      ? rs.map(r => ({ ...r, units: r.units.map(u => (u.sourceUnitId === 'warlord' ? { ...u, points: warlordPoints } : u)) }))
      : rs));
  }, [warlordPoints, regiments]);
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
  // Is this Order of Battle row a Hero? Matched back against the real
  // warscroll it came from (startingUnitPool), since oobUnits itself is
  // free text with no type flags. A hand-typed row with no matching
  // warscroll counts as a non-Hero — it just joins the open regiment.
  const oobRowWarscrollName = row => (row.warscroll || row.name || '').trim();
  const oobRowWarscroll = row => {
    const name = oobRowWarscrollName(row).toLowerCase();
    if (!name) return null;
    return startingUnitPool.find(fu => (fu.name || '').toLowerCase() === name) || null;
  };
  const isHeroRow = row => !!oobRowWarscroll(row)?.is_hero;

  // The default regiment layout: the Warlord leads the General's Regiment,
  // then every Order of Battle row in list order — each Hero opening a new
  // regiment, every non-Hero filling out whichever regiment is currently
  // open. This is the shape the physical Army Roster sheet expects
  // ("General's Regiment 1 / Regiment 2 / ..."), and the starting point the
  // "Assign your Regiments" step lets the player drag away from.
  // sourceUnitId ties each row back to what produced it ('warlord', or an
  // oobUnits row id) so re-running this can keep what was dragged.
  const buildDefaultRegiments = () => {
    const uid = tag => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const warlordUnit = warlordName?.trim() ? {
      id: uid('ru'),
      sourceUnitId: 'warlord',
      name: warlordName,
      size: '1',
      notes: [warlordEnhancements, (PATHS.find(p => p.key === warlordPath) || BATTLEPACK_PATHS.find(p => p.key === warlordPath))?.name].filter(Boolean).join('; '),
      points: warlordPoints,
    } : null;

    let current = { id: uid('r'), units: warlordUnit ? [warlordUnit] : [] };
    const built = [current];

    oobUnits.forEach(row => {
      const warscrollName = oobRowWarscrollName(row);
      if (!warscrollName) return;
      const match = oobRowWarscroll(row);
      const unit = {
        id: uid('ru'),
        sourceUnitId: row.id,
        name: warscrollName,
        size: match?.unit_size || '',
        notes: [row.enhancements, row.pathAbility].filter(Boolean).join('; '),
        points: row.points || match?.points || '',
      };
      if (match?.is_hero && current.units.length > 0) {
        current = { id: uid('r'), units: [] };
        built.push(current);
      }
      current.units.push(unit);
    });
    return built;
  };

  // What the regiment layout was last reconciled against — any change to
  // the Warlord's name or the set of Order of Battle rows means the layout
  // has units missing from it, or units in it that are gone.
  const rosterSignature = `${warlordName || ''}#${oobUnits.map(u => `${u.id}:${oobRowWarscrollName(u)}`).join('|')}`;
  const [regimentsSeedSig, setRegimentsSeedSig] = useState(() => saved.regimentsSeedSig ?? '');

  // ── Paths & Ranks, per Order of Battle unit ───────────────────────────
  // The Warlord already picks a Path back in step 4; this is the same
  // machinery for everybody else on the Order of Battle. A unit only
  // unlocks a Path rank's abilities once its Renown has earned it that
  // rank (Aspiring at 5, Elite at 15, Mighty at 30, Legendary at 45 — see
  // rankForRenown), so higher ranks render locked rather than hidden, to
  // show what the unit is working towards.
  // Which Paths a given unit may walk. A battlepack brings its own Paths
  // and they replace the core four (the book's own rule — see the step 4
  // picker), split into Hero Paths and the Unit Paths a non-Hero earns
  // during the campaign; without one, only Heroes have Paths at all.
  // Blighted Wilds additionally allows Ravaged Coast's Paths.
  // Campaigns whose Paths could be borrowed: every real campaign except the
  // one picked (and Ravaged Coast under Blighted Wilds, which already
  // includes it). Ascension's Paths are the core four, all Hero Paths.
  const otherPathCampaigns = CAMPAIGNS.filter(c => !c.custom && c.key !== campaign
    && !(campaign === 'blighted-wilds' && c.key === 'ravaged-coast')
    && !(!bp && c.key === 'ascension'));
  const otherCampaignPathGroups = () => otherPathCampaigns
    .filter(c => extraPathCampaigns.includes(c.key))
    .map(c => ({
      key: c.key,
      name: c.name,
      paths: c.key === 'ascension' ? PATHS.map(pth => ({ ...pth, hero: pth.hero !== false })) : (BATTLEPACKS[c.key]?.paths || []),
    }));
  const pathsForUnit = isHero => {
    const fromBattlepack = bp
      ? [
          ...bp.paths.filter(pth => !!pth.hero === isHero),
          ...(campaign === 'blighted-wilds'
            ? BATTLEPACKS['ravaged-coast'].paths.filter(pth => !!pth.hero === isHero)
            : []),
        ]
      : (isHero ? CORE_HERO_PATHS : CORE_UNIT_PATHS);
    const seen = new Set(fromBattlepack.map(pth => pth.key));
    const fromOther = otherCampaignPathGroups()
      .flatMap(g => g.paths)
      .filter(pth => !!pth.hero === isHero)
      .filter(pth => (seen.has(pth.key) ? false : (seen.add(pth.key), true)));
    return [...fromBattlepack, ...fromOther, ...(FACTION_PATHS[selectedFaction] ?? []).filter(p => pathFitsUnit(p, isHero))];
  };
  // Everything pathRankLabel can match an ability against: the core four,
  // both battlepacks', and the selected faction's own.
  const allKnownPaths = React.useMemo(
    () => [...PATHS, ...BATTLEPACK_PATHS, ...(FACTION_PATHS[selectedFaction] ?? [])],
    [selectedFaction],
  );
  const findPathByKey = key => (
    PATHS.find(pth => pth.key === key)
    || BATTLEPACK_PATHS.find(pth => pth.key === key)
    || (FACTION_PATHS[selectedFaction] ?? []).find(pth => pth.key === key)
    || null
  );

  const setOobUnitRenown = (rowId, value) => setOobUnits(rows => rows.map(r => (
    r.id === rowId ? { ...r, renown: value, rank: rankForRenown(value) } : r
  )));
  // Switching Path clears that unit's rank picks — a different Path's
  // ranks are a different set of choices, not meant to carry over (same
  // rule pickWarlordPath follows for the Warlord).
  const setOobUnitPath = (rowId, key) => setOobUnits(rows => rows.map(r => (
    r.id === rowId ? { ...r, path: key || '', pathRankChoices: {}, pathAbility: '' } : r
  )));
  // The readable summary written back into pathAbility is what the Order
  // of Battle document actually prints, so the picks show up on the sheet
  // rather than only inside the wizard.
  const pickOobUnitRankOption = (rowId, pathObj, rank, optIdx) => setOobUnits(rows => rows.map(r => {
    if (r.id !== rowId) return r;
    const choices = { ...(r.pathRankChoices || {}), [rank]: optIdx };
    const summary = (pathObj.ranks || [])
      .map(rr => (choices[rr.rank] != null ? rr.options[choices[rr.rank]]?.name : null))
      .filter(Boolean)
      .join(', ');
    return { ...r, pathRankChoices: choices, pathAbility: summary };
  }));

  const prepareArmyRoster = () => {
    setArmyRosterFaction(factions.find(f => f.faction_slug === selectedFaction)?.faction || '');
    setArmyRosterFormation(battleFormation || '');
    if (!armyRosterName?.trim() && armyName?.trim()) setArmyRosterName(armyName);
    setRegiments(buildDefaultRegiments());
    setRegimentsSeedSig(rosterSignature);
  };

  // Brings the regiment layout back in line with the roster WITHOUT
  // discarding what the player dragged: rows whose unit is gone are
  // dropped, rows already placed stay exactly where they are, and anything
  // new is slotted into the regiment the default layout would have given
  // it. Runs when the player opens the step (not continuously), so a
  // half-finished drag can't be reshuffled underneath them.
  const reconcileRegiments = () => {
    const defaults = buildDefaultRegiments();
    const defaultIndexBySource = new Map();
    defaults.forEach((reg, ri) => reg.units.forEach(u => defaultIndexBySource.set(u.sourceUnitId, ri)));

    setRegiments(prev => {
      const live = new Set(defaultIndexBySource.keys());
      // Keep rows whose unit is still on the roster, plus hand-typed rows —
      // but not an entirely blank one. The Army Roster's own "+ Add Unit"
      // seeds empty rows for you to type into, and those were coming
      // through here as an "UNNAMED UNIT" line with no points.
      const isBlankRow = u => !u.sourceUnitId
        && !(u.name || '').trim() && !(u.size || '').trim()
        && !(u.notes || '').trim() && !(u.points || '').trim();
      const next = prev.map(r => ({
        ...r,
        units: r.units.filter(u => !isBlankRow(u) && (!u.sourceUnitId || live.has(u.sourceUnitId))),
      }));
      const placed = new Set(next.flatMap(r => r.units.map(u => u.sourceUnitId)).filter(Boolean));

      for (const [sourceId, regIndex] of defaultIndexBySource) {
        if (placed.has(sourceId)) continue;
        const unit = defaults[regIndex].units.find(u => u.sourceUnitId === sourceId);
        while (next.length <= regIndex) next.push({ id: `r-${Date.now()}-${next.length}`, units: [] });
        next[regIndex] = { ...next[regIndex], units: [...next[regIndex].units, unit] };
      }
      // An emptied regiment in the middle would otherwise print as a blank
      // block on the Army Roster; the first one always stays.
      const trimmed = next.filter((r, i) => i === 0 || r.units.length > 0);
      return trimmed.length ? trimmed : [{ id: 'r1', units: [] }];
    });
    setRegimentsSeedSig(rosterSignature);
  };

  // Drag and drop between/within regiments. The dragged row is identified
  // by its own id alone — regiment ids are looked up at drop time, so a
  // row dropped back into a list it was already in reorders instead of
  // duplicating.
  const [draggedRegUnitId, setDraggedRegUnitId] = useState(null);
  const moveRegimentUnit = (unitId, targetRegId, beforeUnitId = null) => {
    if (!unitId) return;
    setRegiments(rs => {
      let moving = null;
      const stripped = rs.map(r => ({
        ...r,
        units: r.units.filter(u => {
          if (u.id !== unitId) return true;
          moving = u;
          return false;
        }),
      }));
      if (!moving) return rs;
      return stripped.map(r => {
        if (r.id !== targetRegId) return r;
        if (!beforeUnitId || beforeUnitId === unitId) return { ...r, units: [...r.units, moving] };
        const at = r.units.findIndex(u => u.id === beforeUnitId);
        if (at < 0) return { ...r, units: [...r.units, moving] };
        return { ...r, units: [...r.units.slice(0, at), moving, ...r.units.slice(at)] };
      });
    });
  };

  // Auto-arrange on arrival, and whenever the roster has changed since the
  // last time this step saw it. Gated on the step rather than running
  // continuously so a unit added later can't reshuffle a layout the player
  // is in the middle of dragging on another screen.
  useEffect(() => {
    if (step !== 9) return;
    // Which rows are Heroes — and so which ones open a regiment of their
    // own — is resolved by matching each Order of Battle row back against
    // its warscroll. Run before those have loaded and every unit lands in
    // one regiment, and the signature stamp below means it never re-runs.
    if (factionUnitsLoading) return;
    if (oobUnits.length > 0 && startingUnitPool.length === 0) return;
    if (regimentsSeedSig === rosterSignature) return;
    reconcileRegiments();
  }, [step, rosterSignature, factionUnitsLoading, startingUnitPool.length]); // eslint-disable-line

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
      if (e.key === 'ArrowRight') { e.preventDefault(); setStep(s => Math.min(lastStepRef.current, s + 1)); }
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
      stepsVersion: 2, step, activeDoc, presentMode, wizardViewMode, campaign, customCampaignName, selectedFaction, warlordSubStep,
      warlordName, warlordKeywordsLine1, warlordKeywordsLine2, rangedWeapons, meleeWeapons,
      warlordMove, warlordHealth, warlordSave, warlordControl, warlordSnapshotsByFaction, destinyPointChoice, archetypeChoice, companionChoice, originFlawChoice, mountChoice, otherUpgradesChoice, battleMountUpgradesChoice, antiXChoiceByOption,
      armyName, heraldryImage, realmOfOrigin, customRealmName, faction, battleFormation, gloryPoints, gloryRounds,
      currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
      spellLore, prayerLore, manifestationLore,
      warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, warlordPathRankChoices, oobUnits,
      commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
      startingUnits, allyPickerOpen, allyFaction, allyUnitsByFaction, regimentsSeedSig,
      heroicTraitChoice, heroicTraitAssignee, artefactChoice, artefactAssignee, enhancementSubChoice,
      unitsHideLegends, unitsHideScourge, unitsHideRoR, unitsOnlyAdded,
      emberstoneVault, emberstoneTotal, extraPathCampaigns, warlordWounds, warlordScars, warlordDrained,
    };
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); } catch {}
    if (onSnapshot) onSnapshot(snapshot);
  }, [
    step, activeDoc, presentMode, campaign, customCampaignName, selectedFaction, warlordSubStep,
    warlordName, warlordKeywordsLine1, warlordKeywordsLine2, rangedWeapons, meleeWeapons,
    warlordMove, warlordHealth, warlordSave, warlordControl, warlordSnapshotsByFaction, destinyPointChoice, archetypeChoice, companionChoice, originFlawChoice, mountChoice, otherUpgradesChoice, battleMountUpgradesChoice, antiXChoiceByOption,
    armyName, heraldryImage, realmOfOrigin, customRealmName, faction, battleFormation, gloryPoints, gloryRounds,
    currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
    spellLore, prayerLore, manifestationLore,
    warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, warlordPathRankChoices, oobUnits,
    commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
    startingUnits, allyPickerOpen, allyFaction, allyUnitsByFaction, regimentsSeedSig,
    heroicTraitChoice, heroicTraitAssignee, artefactChoice, artefactAssignee, enhancementSubChoice,
    emberstoneVault, emberstoneTotal, extraPathCampaigns, warlordWounds, warlordScars, warlordDrained,
  ]);

  // One weapon-profile cell. The value shown is the effective one (base
  // plus every Anvil of Apotheosis pick); a cell an option changed is
  // tinted and carries a tooltip naming the option(s) responsible, and a
  // cell an option pins to a fixed value is read-only while it's picked.
  const statCell = (row, field, update) => {
    const reasons = row.__mods?.[field];
    const locked = !!row.__setBy?.[field];
    return (
      <input
        className={reasons ? `ptg-stat-modified${locked ? ' ptg-stat-locked' : ''}` : undefined}
        title={reasons ? reasons.join('\n') : undefined}
        readOnly={locked}
        value={row[field] || ''}
        onChange={e => update(row.id, field, e.target.value)}
      />
    );
  };

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
              {hasRange && statCell(r, 'rng', update)}
              {statCell(r, 'atk', update)}
              {statCell(r, 'hit', update)}
              {statCell(r, 'wnd', update)}
              {statCell(r, 'rnd', update)}
              {statCell(r, 'dmg', update)}
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

  // One characteristic on the stat wheel — same effective-value treatment
  // as statCell above (tinted + tooltipped when a pick changed it,
  // read-only while a pick pins it to a fixed value).
  const renderStatField = (label, statKey, setBase) => {
    const reasons = effectiveWarlordStats.sources[statKey];
    const locked = !!effectiveWarlordStats.setBy[statKey];
    return (
      <div className="ptg-field" title={reasons.length ? reasons.join('\n') : undefined}>
        <label>{label}</label>
        <input
          type="text"
          className={reasons.length ? `ptg-stat-modified${locked ? ' ptg-stat-locked' : ''}` : undefined}
          readOnly={locked}
          value={effectiveWarlordStats[statKey] ?? ''}
          onChange={e => setStatRebased(setBase, statKey)(e.target.value)}
          placeholder="—"
        />
      </div>
    );
  };

  // Shared between the Warlord Warscroll doc editor and the "Pick your
  // Warlord" wizard step, so filling it out in either place stays in sync.
  const renderWarlordForm = () => (
    <>
      <div className="ptg-field">
        <label>Warlord Name</label>
        <input type="text" value={warlordName} onChange={e => setWarlordName(e.target.value)} placeholder="e.g. Iladrien the Bright" />
      </div>
      <div className="ptg-warlord-characteristics">
        {renderStatField('Move', 'move', setWarlordMove)}
        {renderStatField('Health', 'health', setWarlordHealth)}
        {renderStatField('Save', 'save', setWarlordSave)}
        {renderStatField('Control', 'control', setWarlordControl)}
      </div>
      {renderWeaponTable('Ranged Weapons', effectiveRangedWeapons, addRanged, updateRangedRebased, removeRanged, true)}
      {renderWeaponTable('Melee Weapons', effectiveMeleeWeapons, addMelee, updateMeleeRebased, removeMelee, false)}
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
        <input
          type="text"
          className={effectiveKeywordsLine1 !== warlordKeywordsLine1 ? 'ptg-stat-modified' : undefined}
          title={effectiveKeywordsLine1 !== warlordKeywordsLine1 ? 'Rewritten by your Anvil of Apotheosis picks — deselect them to edit' : undefined}
          readOnly={effectiveKeywordsLine1 !== warlordKeywordsLine1}
          value={effectiveKeywordsLine1}
          onChange={e => setWarlordKeywordsLine1(e.target.value)}
          placeholder="HERO, INFANTRY, …"
        />
        <input type="text" value={warlordKeywordsLine2} onChange={e => setWarlordKeywordsLine2(e.target.value)} placeholder="ORDER, IDONETH DEEPKIN, AELF, …" />
      </div>
    </>
  );

  // One unit's row on the "Set Paths & Ranks" step — the Warlord and every
  // Order of Battle unit render through the same card, differing only in
  // which piece of state they read and write (the Warlord has its own
  // dedicated fields; everyone else lives on their oobUnits row).
  // Non-Heroes get the renown/rank half only: Paths are a Hero thing.
  // Rank is picked directly (some campaigns, e.g. Ravaged Coast, have no
  // renown); typing a renown still moves it to the matching rank. The rank
  // decides which Path ranks are unlocked.
  const renderPathCard = ({ key, title, subtitle, reinforced, isHero, renown, onRenown, rank, onRank, pathKey, onPath, rankChoices, onPick }) => {
    const pathObj = findPathByKey(pathKey);
    const unlocked = RANK_ORDER.indexOf(rank) + 1;
    const pathOptions = pathsForUnit(isHero);
    return (
      <div className="ptg-path-unit-card" key={key}>
        <div className="ptg-path-unit-head">
          <div className="ptg-path-unit-title">
            <div>
              <span className="ptg-path-unit-name">{title.toUpperCase()}</span>
              <span className="ptg-path-unit-role">{subtitle}</span>
            </div>
            {reinforced && <span className="ptg-unit-reinforced-tag">Reinforced</span>}
          </div>
          <div className="ptg-field ptg-path-unit-renown">
            <label>Renown</label>
            <input value={renown || ''} onChange={e => onRenown(e.target.value)} />
          </div>
          <div className="ptg-field ptg-path-unit-rank">
            <label>Rank</label>
            <select value={RANK_ORDER.includes(rank) ? rank : ''} onChange={e => onRank(e.target.value)}>
              <option value="">-</option>
              {RANK_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {pathOptions.length > 0 && (
            <div className="ptg-field ptg-path-unit-path">
              <label>Path</label>
              <select value={pathKey || ''} onChange={e => onPath(e.target.value)}>
                <option value="">…</option>
                {pathOptions.map(p => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {pathObj && !pathObj.ranks && (
          <div className="ptg-wizard-body-placeholder">
            No rank abilities sourced for {pathObj.name} yet.
          </div>
        )}
        {pathObj?.ranks && pathObj.ranks.map((r, ri) => {
          const locked = ri >= unlocked;
          return (
            <div key={r.rank} className={`ptg-apotheosis-group${locked ? ' ptg-path-rank-locked' : ''}`}>
              <div className="ptg-apotheosis-group-title">
                {r.rank}
                {locked && <span className="ptg-lore-count"> (locked — set Rank to {r.rank} or higher)</span>}
              </div>
              <div className="ptg-apotheosis-options-grid">
                {r.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    disabled={locked}
                    className={`ptg-apotheosis-option-btn${rankChoices?.[r.rank] === oi ? ' ptg-apotheosis-option-selected' : ''}`}
                    onClick={() => onPick(pathObj, r.rank, oi)}
                  >
                    <AbilityCard ab={{ ...opt, bullets: [] }} keywords={[]} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Step 5's unit list — rendered once for the warlord's own faction and
  // again for whichever Grand Alliance ally the player expands, both
  // writing into the same startingUnits map (warscroll ids are unique
  // across factions, so an allied pick can't collide with a home one).
  const renderStartingUnitsTable = (units, loading, emptyMessage) => {
    if (loading) return <div className="ptg-wizard-body-placeholder">Loading…</div>;
    if (units.length === 0) return <div className="ptg-wizard-body-placeholder">{emptyMessage}</div>;
    const shown = unitsOnlyAdded
      ? units.filter(u => {
          const sel = startingUnits[u.id];
          return ((sel?.train || 0) + (sel?.reinforce || 0)) > 0;
        })
      : units;
    if (shown.length === 0) {
      return <div className="ptg-wizard-body-placeholder">Nothing added from this faction yet — untick &ldquo;Only added units&rdquo; to pick some.</div>;
    }
    return (
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
          {/* The list already comes back faction/type/name-ordered (see
              /api/warscrolls' typeOrder, same query every other page uses)
              — no client re-sort, so a section header per unitTypeLabel
              change lines up with real, contiguous groups instead of
              firing every row. */}
          {shown.map((u, i) => {
            const sel = startingUnits[u.id] ?? { train: 0, reinforce: 0 };
            const typeChanged = i === 0 || unitTypeLabel(shown[i - 1]) !== unitTypeLabel(u);
            return (
              <React.Fragment key={u.id}>
                {typeChanged && (
                  <tr className="separator-type">
                    <td colSpan={5}>{unitTypeLabel(u)}</td>
                  </tr>
                )}
                <tr>
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
                  <td className="ptg-units-name">{(u.name || '').toUpperCase()}</td>
                  <td className="ptg-units-pts">{u.points || '—'}</td>
                  <td className="ptg-units-keywords">{(u.keywords || '').split(',').slice(0, 6).join(', ')}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  // How many units the roster currently takes from OTHER factions in the
  // Grand Alliance — shown on the collapsed section's header so a pick
  // made there isn't invisible once it's folded away again.
  const allyPickedCount = React.useMemo(() => {
    const allyIds = new Set(Object.values(allyUnitsByFaction).flat().map(u => String(u.id)));
    return Object.entries(startingUnits)
      .filter(([id]) => allyIds.has(String(id)))
      .reduce((n, [, sel]) => n + (sel.train || 0) + (sel.reinforce || 0), 0);
  }, [startingUnits, allyUnitsByFaction]);

  // Step 6 "Add your Enhancements" — one enhancement table (Heroic Traits
  // or Artefacts of Power), single-select pick + an assignee dropdown
  // ('warlord' or any Order of Battle unit added so far). Mirrors the
  // single-select AbilityCard button treatment from renderApotheosisStep.
  // Enhancements can only go on Heroes that aren't UNIQUE (core rules), so
  // the list is the Warlord plus Order of Battle rows whose warscroll is a
  // non-unique Hero. A current assignee that no longer qualifies stays
  // listed, flagged, so the pick isn't silently moved.
  const canTakeEnhancement = row => {
    const ws = oobRowWarscroll(row);
    return !!ws?.is_hero && !ws.is_unique && !/\bUNIQUE\b/i.test(ws.keywords || '');
  };
  const assigneeOptionsFor = current => [{ value: 'warlord', label: warlordName?.trim() || 'Warlord' },
    ...oobUnits.filter(u => u.name?.trim() && (canTakeEnhancement(u) || u.id === current))
      .map(u => ({ value: u.id, label: canTakeEnhancement(u) ? u.name : `${u.name} (not allowed: Heroes that aren't Unique only)` }))];
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
              {assigneeOptionsFor(assignee).map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className="ptg-apotheosis-options-grid">
            {options.map((opt, i) => {
              const choices = enhancementChoices(opt);
              const chosen = choices ? enhancementChoiceOf(opt) : null;
              return (
                <div key={i} className="ptg-apotheosis-option-wrap">
                  <button
                    type="button"
                    className={`ptg-apotheosis-option-btn${choiceIdx === i ? ' ptg-apotheosis-option-selected' : ''}`}
                    onClick={() => onPick(i)}
                  >
                    <AbilityCard ab={{ ...opt, bullets: parseFormationBullets(opt.bullets) }} keywords={[]} />
                  </button>
                  {choices && choiceIdx === i && (
                    <div className="ptg-anti-x-picker">
                      {choices.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`ptg-anti-x-picker-btn${chosen === c ? ' ptg-anti-x-picker-btn-selected' : ''}`}
                          onClick={() => pickEnhancementSubChoice(opt, assignee, c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
    const archetypeStepData = apotheosisSteps.find(s => /(?:choose|pick) an archetype/i.test(s.step_title || ''));
    const companionStepData = apotheosisSteps.find(s => /choose a companion/i.test(s.step_title || ''));
    const originFlawStepData = apotheosisSteps.find(s => /origin.*flaw/i.test(s.step_title || ''));
    const mountStepData     = apotheosisSteps.find(s => /^(?:choose|pick) a battle mount$/i.test(s.step_title || ''));
    const mountUpgradesStepData = apotheosisSteps.find(s => /^(?:pick any |battle any )?battle mount upgrades$/i.test(s.step_title || ''));
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
    const mountStepData = apotheosisSteps.find(s => /^(?:choose|pick) a battle mount$/i.test(s.step_title || ''));
    const mountUpgradesStepData = apotheosisSteps.find(s => /^(?:pick any |battle any )?battle mount upgrades$/i.test(s.step_title || ''));
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

  // Every rules-text ability the warlord has actually accumulated through
  // the wizard, grouped by where it came from — for printing into the
  // Officiant Warlord Warscroll's big blank Abilities area below the
  // weapon tables (see buildWarlordOverlayFields). Pure stat tweaks (e.g.
  // "Add 1 to Health") aren't included since they're already reflected on
  // the stat wheel/weapon tables directly, not a separate rules text block
  // a real warscroll would print.
  const warlordAbilityGroups = React.useMemo(() => computeWarlordAbilityGroups({
    apotheosisSteps, companionChoice, originFlawChoice, mountChoice, battleMountUpgradesChoice, otherUpgradesChoice,
    heroicTraitOptions, artefactOptions, heroicTraitChoice, artefactChoice, heroicTraitAssignee, artefactAssignee,
    enhancementSubChoice, warlordPath, warlordPathRankChoices, selectedFaction,
  }), [apotheosisSteps, companionChoice, originFlawChoice, mountChoice, battleMountUpgradesChoice, otherUpgradesChoice, heroicTraitChoice, artefactChoice, heroicTraitAssignee, artefactAssignee, enhancementSubChoice, factionRules, warlordPath, warlordPathRankChoices, selectedFaction]);

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

  // ── Live warscroll from the Anvil of Apotheosis picks ─────────────────
  //
  // Every option currently picked has its scraped effect text parsed into
  // the concrete warscroll changes it describes (see
  // ../apotheosisEffects.js) and those are layered over the base warscroll
  // on each render rather than written into it. Base = the faction's
  // starting warscroll plus whatever the player typed; effective = base +
  // every current pick, and the effective numbers are what both the form
  // and the printed warscroll show.
  //
  // Deriving rather than baking in is what makes switching Battle Mount,
  // changing Archetype, or deselecting an upgrade land on the right
  // numbers — the alternative (apply on select, reverse on deselect)
  // silently stacks a previous pick's changes on top of the new one's the
  // moment a reverse is missed.
  //
  // Two effects stay imperative on purpose and are skipped by the parser
  // (its ALREADY_HANDLED_RE): Anti-X, whose keyword the player picks
  // separately below, and the Path-rank-scaling Attacks bonus, which has
  // its own keep-in-sync effect. Both already write into the base weapon
  // rows and persist there, so deriving them too would double them up on
  // any roster saved before this.
  const apotheosisModSources = React.useMemo(
    () => apotheosisModsFrom(apotheosisSteps, {
      archetypeChoice, companionChoice, originFlawChoice, mountChoice,
      battleMountUpgradesChoice, otherUpgradesChoice,
    }),
    [apotheosisSteps, archetypeChoice, companionChoice, originFlawChoice, mountChoice, battleMountUpgradesChoice, otherUpgradesChoice],
  );

  // Stat wheel. `sources` drives the "what changed this" tooltip, `setBy`
  // marks a characteristic an option pins to a fixed value (typing into it
  // would be ignored, so the field is made read-only instead), and
  // `addDelta` is what a typed edit on an added-to field is rebased by.
  const effectiveWarlordStats = React.useMemo(
    () => applyStatMods({ move: warlordMove, health: warlordHealth, save: warlordSave, control: warlordControl }, apotheosisModSources),
    [apotheosisModSources, warlordMove, warlordHealth, warlordSave, warlordControl],
  );

  // Weapon rows. Returns copies carrying three bookkeeping fields the
  // renderers use and nothing else reads: __mods (which cells an option
  // changed, for highlighting), __setBy (cells pinned to a fixed value)
  // and __addDelta (for rebasing a typed edit back onto the base row).
  const buildEffectiveWeapons = React.useCallback(
    (rows, listIsMelee) => applyWeaponMods(rows, listIsMelee, apotheosisModSources, companionWeaponNames),
    [apotheosisModSources, companionWeaponNames],
  );

  const effectiveMeleeWeapons = React.useMemo(() => buildEffectiveWeapons(meleeWeapons, true), [buildEffectiveWeapons, meleeWeapons]);
  const effectiveRangedWeapons = React.useMemo(() => buildEffectiveWeapons(rangedWeapons, false), [buildEffectiveWeapons, rangedWeapons]);

  // Keyword line 1 (HERO, INFANTRY, …) is the one Battle Mounts and
  // upgrades rewrite; line 2 is the alliance/faction line and never
  // changes. Every operation here is idempotent — applying the same mod to
  // an already-updated line is a no-op — because an Archetype's keywords
  // are ALSO written straight into the base line by applyArchetypeChoice,
  // and re-deriving them must not duplicate them.
  const effectiveKeywordsLine1 = React.useMemo(
    () => applyKeywordMods(warlordKeywordsLine1, apotheosisModSources),
    [apotheosisModSources, warlordKeywordsLine1],
  );

  // A typed edit on a field an option is adding to should set the TOTAL
  // the player typed, so the delta is subtracted back out and stored as
  // the new base. Fields an option pins to a fixed value ignore edits —
  // the option owns them until it is deselected.
  const setStatRebased = (setBase, statKey) => typed => {
    if (effectiveWarlordStats.setBy[statKey]) return;
    const delta = effectiveWarlordStats.addDelta[statKey] || 0;
    setBase(delta ? (subtractFromCharacteristic(typed, delta) ?? typed) : typed);
  };
  const updateWeaponRebased = (update, effectiveRows) => (id, field, value) => {
    const row = effectiveRows.find(r => r.id === id);
    if (row?.__setBy?.[field]) return;
    const delta = row?.__addDelta?.[field] || 0;
    update(id, field, delta ? (addToCharacteristic(value, -delta) ?? value) : value);
  };
  const updateMeleeRebased = updateWeaponRebased(updateMelee, effectiveMeleeWeapons);
  const updateRangedRebased = updateWeaponRebased(updateRanged, effectiveRangedWeapons);

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

  // "...add a number equal to the number of ranks this unit has earned on
  // its Path to the Attacks characteristic of its <Weapon Name>." (e.g.
  // Prodigy of the Asydrazor) — scales off the hero's own Rank field
  // (Aspiring=1, Elite=2, Mighty=3, Legendary=4, matching the option's own
  // worked example of Legendary -> +4). rankScalingRef remembers how much
  // was last added per option so it can both undo cleanly on deselect and
  // true up the delta if Rank changes while still selected, without ever
  // needing to know the weapon's own base Attacks value.
  const rankScalingRef = useRef({}); // optId -> { weaponName, appliedBonus }
  // Not end-anchored — the phrase sits mid-sentence, followed by a "For
  // example, ..." clause spelling out the worked example, not end of string.
  const parseRankScalingAttackWeapon = effectText =>
    /ranks this unit has earned on its Path to the Attacks characteristic of its ([A-Za-z' ]+?)\./i.exec(effectText || '')?.[1]?.trim() || null;
  const RANK_NUMBER = { aspiring: 1, elite: 2, mighty: 3, legendary: 4 };
  const rankScalingBonus = () => RANK_NUMBER[(warlordRank || '').trim().toLowerCase()] ?? 1;
  const bumpWeaponAttacks = (weaponName, amount) => {
    if (!weaponName || !amount) return;
    const target = weaponName.toLowerCase();
    const bump = rows => rows.map(r => {
      if ((r.name || '').trim().toLowerCase() !== target) return r;
      const cur = parseInt(r.atk, 10);
      return Number.isFinite(cur) ? { ...r, atk: String(cur + amount) } : r;
    });
    setMeleeWeapons(bump);
    setRangedWeapons(bump);
  };
  const applyRankScalingAttack = (opt, adding) => {
    const weaponName = parseRankScalingAttackWeapon(opt.effect);
    if (!weaponName) return;
    if (adding) {
      const bonus = rankScalingBonus();
      bumpWeaponAttacks(weaponName, bonus);
      rankScalingRef.current[opt.id] = { weaponName, appliedBonus: bonus };
    } else {
      const prev = rankScalingRef.current[opt.id];
      if (prev) { bumpWeaponAttacks(prev.weaponName, -prev.appliedBonus); delete rankScalingRef.current[opt.id]; }
    }
  };
  // Keeps a rank-scaling bonus in sync if Rank changes while its granting
  // option is still selected (e.g. Aspiring -> Elite bumps Thalassic
  // Weapon's Attacks by 1 more, no need to reselect the option).
  useEffect(() => {
    const bonus = rankScalingBonus();
    Object.values(rankScalingRef.current).forEach(entry => {
      if (entry.appliedBonus !== bonus) {
        bumpWeaponAttacks(entry.weaponName, bonus - entry.appliedBonus);
        entry.appliedBonus = bonus;
      }
    });
  }, [warlordRank]); // eslint-disable-line

  // The two mechanical effects that still have to be applied imperatively
  // when an option is toggled, because neither is a pure function of the
  // option's own text: Anti-X/Charge write a tag into the weapon's freely
  // typed Abilities string, and the rank-scaling Attacks bonus depends on
  // the hero's Rank field. Everything else an option does to the warscroll
  // — stat wheel, weapon profiles, keywords — is derived on every render
  // instead (see apotheosisModSources / effectiveWarlordStats above), so
  // it needs no toggle-time bookkeeping at all.
  const applyUpgradeWeaponEffect = (opt, adding) => {
    if (isChargeDamageOption(opt)) {
      setWeaponAbilityTag(parseWeaponTargetPhrase(opt.effect), 'charge (+1 damage)', 'Charge (+1 Damage)', adding);
    } else if (isAntiXOption(opt)) {
      const keyword = antiXChoiceByOption[opt.id] || parseAntiXKeywords(opt.effect)[0];
      setWeaponAbilityTag(parseWeaponTargetPhrase(opt.effect), 'anti-', `Anti-${keyword} (+1 Rend)`, adding);
    } else if (parseRankScalingAttackWeapon(opt.effect)) {
      applyRankScalingAttack(opt, adding);
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
    const isArchetypeStep = /(?:choose|pick) an archetype/i.test(stepData.step_title || '');
    const isCompanionStep = /choose a companion/i.test(stepData.step_title || '');
    const isMountStep = /^(?:choose|pick) a battle mount$/i.test(stepData.step_title || '');
    // Up to 1 origin AND up to 1 flaw, independently — a plain toggle per
    // group (click a selected card to deselect it back to "none"), not a
    // forced/auto-advancing single choice like the steps above.
    const isOriginFlawStep = /origin.*flaw/i.test(stepData.step_title || '');
    // True multi-select ("pick any number") — every card toggles
    // independently, no mutual exclusivity, no auto-advance. Same treatment
    // for both upgrade steps.
    const isOtherUpgradesStep = /pick any other upgrades/i.test(stepData.step_title || '');
    const isMountUpgradesStep = /^(?:pick any |battle any )?battle mount upgrades$/i.test(stepData.step_title || '');
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
                          const prevIdx = originFlawChoice?.[g.group];
                          setOriginFlawChoice(prev => ({ ...prev, [g.group]: prev?.[g.group] === oi ? null : oi }));
                          // Origins/Flaws are a single-select radio within their group, not
                          // a toggle list like Other/Mount Upgrades — switching to a
                          // different option (e.g. Prodigy of the Asydrazor) needs the old
                          // pick's mechanical effect undone before the new one applies.
                          if (selected) {
                            applyUpgradeWeaponEffect(opt, false);
                          } else {
                            if (prevIdx != null && g.items[prevIdx]) applyUpgradeWeaponEffect(g.items[prevIdx], false);
                            applyUpgradeWeaponEffect(opt, true);
                          }
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

  // Minimal Warlord Warscroll template only has room for 2 ranged + 2 melee
  // weapon rows — fall back to the original (full, 3 ranged/4 melee) scan
  // only once a hero actually outgrows it. See buildWarlordOverlayFields.
  const warlordDocVariant = (rangedWeapons.length > 2 || meleeWeapons.length > 2) ? 'full' : 'minimal';

  // Everything the Officiant (image) view's overlays can draw from, bundled
  // once per render rather than threading ~30 individual props down through
  // DocPage/buildOverlayFields.
  const officiantData = {
    warlordName,
    warlordMove: effectiveWarlordStats.move,
    warlordHealth: effectiveWarlordStats.health,
    warlordSave: effectiveWarlordStats.save,
    warlordControl: effectiveWarlordStats.control,
    rangedWeapons: effectiveRangedWeapons,
    meleeWeapons: effectiveMeleeWeapons,
    warlordKeywordsLine1: effectiveKeywordsLine1,
    // Ward comes in as a granted keyword — "WARD (6+)" — so the pip reads it
    // back off the effective keyword line rather than being its own field.
    warlordWard: wardFromKeywords(effectiveKeywordsLine1),
    warlordKeywordsLine2, warlordAbilityGroups,
    warlordDocVariant,
    // Same setters/updaters renderWarlordForm's Non Corporeal inputs use —
    // lets the Officiant (image) view's overlay fields edit the identical
    // state directly on the scan (see OverlayEditableField/
    // buildWarlordOverlayFields), instead of that being replica-form-only.
    // Rebasing setters, so editing a number straight on the scan sets the
    // TOTAL the player typed rather than fighting the picks layered on top
    // of it (see setStatRebased/updateWeaponRebased).
    setWarlordName,
    setWarlordMove: setStatRebased(setWarlordMove, 'move'),
    setWarlordHealth: setStatRebased(setWarlordHealth, 'health'),
    setWarlordSave: setStatRebased(setWarlordSave, 'save'),
    setWarlordControl: setStatRebased(setWarlordControl, 'control'),
    setWarlordKeywordsLine1, setWarlordKeywordsLine2,
    updateRanged: updateRangedRebased, updateMelee: updateMeleeRebased,
    armyName, realmOfOrigin, customRealmName,
    realmLabel: REALMS.find(r => r.key === realmOfOrigin)?.name || '',
    gloryPoints, battleFormation,
    factionLabel: factions.find(f => f.faction_slug === effectiveFactionSlug)?.faction || '',
    currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
    spellLore, prayerLore, manifestationLore,
    warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements,
    warlordPathLabel: (PATHS.find(p => p.key === warlordPath) || BATTLEPACK_PATHS.find(p => p.key === warlordPath))?.name || '',
    warlordPathAbility, warlordWounds,
    // Display-only: the Rank column prints "<Path> - <Rank>" read off the
    // row's Path abilities (see pathRankLabel). The stored rows keep their
    // renown-derived rank untouched — this never writes back.
    oobUnits: oobUnits.map(u => ({ ...u, rank: pathRankLabel(u, allKnownPaths) })),
    commander, armyRosterName,
    // Ravaged Coast has no fixed limit — the roster's limit is what's on it.
    pointsLimit: campaign === 'ravaged-coast' ? String(armyUnitsTotal) : pointsLimit,
    // Fall back to the picks made earlier in the wizard until Prepare for
    // Battle (or a hand edit) fills these in.
    armyRosterFaction: armyRosterFaction || factions.find(f => f.faction_slug === effectiveFactionSlug)?.faction || '',
    armyRosterFormation: armyRosterFormation || battleFormation,
    regiments, auxUnits, armyNotes, regimentsTotal, auxTotal, armyUnitsTotal,
  };

  // The doc's page images; the Order of Battle gets an extra page for every
  // 5 units past the first 5.
  const docPageImages = doc => {
    if (doc.key === 'warlord' && warlordDocVariant === 'full') return doc.imagesFull;
    if (doc.key === 'oob') {
      const pages = Math.max(1, Math.ceil(oobUnits.length / 5));
      return Array.from({ length: pages }, () => doc.images[0]);
    }
    return doc.images;
  };

  const renderImageView = doc => {
    const images = docPageImages(doc);
    return (
      <div
        className={`ptg-doc-image-view ptg-doc-image-view-zoomable${doc.key === 'warlord' ? ' ab-roster-print-target' : ''}`}
        onClick={() => setDocLightboxOpen(true)}
        title="Click to zoom"
      >
        {images.map((img, i) => (
          <DocPage key={`${img.src}-${i}`} img={img} alt={doc.title} docKey={doc.key} pageIndex={i} data={officiantData} />
        ))}
      </div>
    );
  };

  // Same doc, same DocPage/overlay pipeline, just sized to fill as much of
  // the actual browser viewport as possible (both dimensions, not just
  // width) — see .ptg-doc-lightbox-frame in styles.css. onClick={} with
  // stopPropagation on the frame itself keeps a click INSIDE the image from
  // bubbling to the backdrop's close handler.
  const renderDocLightbox = () => {
    const doc = DOCS.find(d => d.key === activeDoc);
    if (!doc) return null;
    const images = docPageImages(doc);
    return (
      <div className="ptg-doc-lightbox-backdrop" onClick={() => setDocLightboxOpen(false)}>
        <button className="gw-close ptg-doc-lightbox-close" onClick={() => setDocLightboxOpen(false)} title="Close (Esc)">✕</button>
        <div className="ptg-doc-lightbox-frame" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <DocPage key={`${img.src}-${i}`} img={img} alt={doc.title} docKey={doc.key} pageIndex={i} data={officiantData} />
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
                    <button
                      className="ptg-wizard-nav-btn ptg-back-to-wizard"
                      title="Return to the numbered steps to keep editing this army"
                      onClick={() => { setWarlordPrintPreview(false); setActiveDoc(null); }}
                    >‹ Back to the Wizard</button>
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
                  ? <button
                      className="ptg-wizard-nav-btn ptg-back-to-wizard"
                      title="Return to the numbered steps to keep editing this army"
                      onClick={() => { setWarlordPrintPreview(false); setActiveDoc(null); }}
                    >‹ Back to the Wizard</button>
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
                            <div className="ptg-field"><label>Name</label><input value={warlordName ? warlordName.toUpperCase() : ''} onChange={e => setWarlordName(e.target.value.toUpperCase())} /></div>
                            <div className="ptg-field"><label>Warscroll</label><input value={warlordWarscroll ? warlordWarscroll.toUpperCase() : ''} onChange={e => setWarlordWarscroll(e.target.value.toUpperCase())} /></div>
                            <div className="ptg-field"><label>Rank</label><input value={warlordRank} readOnly title="Derived from Renown — earned at 5+ points" /></div>
                            <div className="ptg-field"><label>Renown</label><input value={warlordRenown} onChange={e => { const v = e.target.value; setWarlordRenown(v); setWarlordRank(rankForRenown(v)); }} /></div>
                          </div>
                          <div className="ptg-oob-row-grid-3">
                            <div className="ptg-field"><label>Enhancements</label><input value={warlordEnhancements} onChange={e => setWarlordEnhancements(e.target.value)} /></div>
                            <div className="ptg-field">
                              <label>Path</label>
                              <select value={warlordPath || ''} onChange={e => setWarlordPath(e.target.value || null)}>
                                <option value="">…</option>
                                {CORE_HERO_PATHS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
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
                              <div className="ptg-field"><label>Unit Name</label><input value={u.name ? u.name.toUpperCase() : ''} onChange={e => updateOobUnit(u.id, 'name', e.target.value.toUpperCase())} /></div>
                              <div className="ptg-field"><label>Warscroll</label><input value={u.warscroll ? u.warscroll.toUpperCase() : ''} onChange={e => updateOobUnit(u.id, 'warscroll', e.target.value.toUpperCase())} /></div>
                              <div className="ptg-field"><label>Rank</label><input value={u.rank || ''} readOnly title="Derived from Renown — earned at 5+ points" /></div>
                              <div className="ptg-field">
                                <label>Renown</label>
                                <div className="ptg-oob-renown-row">
                                  <input value={u.renown || ''} onChange={e => { const v = e.target.value; updateOobUnit(u.id, 'renown', v); updateOobUnit(u.id, 'rank', rankForRenown(v)); }} />
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
                          <div className="ptg-field ptg-army-points-limit"><label>Points Limit</label>{campaign === 'ravaged-coast'
                            ? <input type="text" value={armyUnitsTotal} readOnly title="Ravaged Coast: the total of the units on your roster" />
                            : <input type="text" value={pointsLimit} onChange={e => setPointsLimit(e.target.value)} />}</div>
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

  // "Paths from:" checkboxes — one per campaign. The campaign being played
  // (and Ravaged Coast under Blighted Wilds, which its rules allow) is
  // always on; ticking another adds its Paths, e.g. for units carried over
  // from Ascension. Shared by the Warlord Path and Set Paths & Ranks steps.
  const renderCampaignPathToggles = () => {
    const builtIn = c => !otherPathCampaigns.some(o => o.key === c.key);
    return (
      <div className="ptg-other-paths">
        <span className="ptg-other-paths-lbl">Allow campaign paths:</span>
        {CAMPAIGNS.filter(c => !c.custom).map(c => (
          <label key={c.key} className="ptg-other-paths-opt" title={builtIn(c) ? 'Always allowed in this campaign' : `Also offer ${c.name}'s Paths`}>
            <input
              type="checkbox"
              checked={builtIn(c) || extraPathCampaigns.includes(c.key)}
              disabled={builtIn(c)}
              onChange={e => setExtraPathCampaigns(list => (e.target.checked
                ? [...list.filter(k => k !== c.key), c.key]
                : list.filter(k => k !== c.key)))}
            />
            {c.name}
          </label>
        ))}
      </div>
    );
  };

  // A titled grid of Path cards (battlepack Paths) — same card/selection
  // look as the Core and Faction groups on the Paths step.
  const renderPathGroup = (title, list) => (
    <div className="ptg-apotheosis-group">
      {title && <div className="ptg-apotheosis-group-title">{title}</div>}
      <div className="ptg-apotheosis-options-grid">
        {list.map(p => (
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
                <p className="gw-ability-para">{p.desc || p.ranks.map(r => r.options.map(o => o.name).join(' / ')).join(' · ')}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Battlepack rules reference: the roster/aftermath summaries plus the
  // battlepack's in-battle abilities as cards. `which` picks the parts.
  const renderBattlepackRules = (which = ['roster', 'aftermath', 'battle']) => {
    if (!bp) return null;
    const r = BATTLEPACK_RULES[bp.key] || {};
    return (
      <div className="ptg-bp-rules">
        {which.includes('roster') && r.roster && (
          <details className="ptg-bp-details" open>
            <summary>{bp.name}: building your roster</summary>
            <ul className="ptg-bp-list">{r.roster.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </details>
        )}
        {which.includes('aftermath') && r.aftermath && (
          <details className="ptg-bp-details">
            <summary>{bp.name}: the aftermath sequence</summary>
            <ul className="ptg-bp-list">{r.aftermath.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </details>
        )}
        {which.includes('battle') && Object.entries(bp.battle_abilities || {}).map(([g, list]) => (
          <details className="ptg-bp-details" key={g}>
            <summary>{bp.name}: {g} ({list.length})</summary>
            <div className="ptg-apotheosis-options-grid">
              {list.map((ab, i) => <div key={i} className="ptg-bp-card"><AbilityCard ab={{ ...ab, bullets: parseFormationBullets(ab.bullets) }} keywords={[]} /></div>)}
            </div>
          </details>
        ))}
      </div>
    );
  };

  // One unit on the Apply Wounds step: battle wounds (−/+ or typed), the scar
  // bands it has reached with a pick / 🎲 roll for each, and Drained (Heroes).
  const renderWoundsCard = ({ key, title, subtitle, reinforced, isHero, wounds, onWounds, scars, onScars, drained, onDrained }) => {
    const n = Math.max(0, parseInt(wounds, 10) || 0);
    const setN = v => onWounds(Math.max(0, Math.min(99, v)));
    const band = n >= RC_SUCCUMB_AT ? 'Succumbs' : [...RC_SCAR_TIERS].reverse().find(t => n >= t.min)?.name || 'None';
    const pickScar = (tier, idx) => onScars(prev => ({ ...prev, [tier]: idx }));
    const rollScar = tier => { const d = 1 + Math.floor(Math.random() * 6); pickScar(tier, Math.floor((d - 1) / 2)); return d; };
    return (
      <div className={`ptg-wounds-card${n >= RC_SUCCUMB_AT ? ' ptg-wounds-card-dead' : ''}`} key={key}>
        <div className="ptg-wounds-head">
          <div className="ptg-path-unit-title">
            <div>
              <span className="ptg-path-unit-name">{String(title || 'Unnamed unit').toUpperCase()}</span>
              <span className="ptg-path-unit-role">{subtitle}</span>
            </div>
            {reinforced && <span className="ptg-unit-reinforced-tag">Reinforced</span>}
          </div>
          <div className="ptg-wounds-counter">
            <label>Battle Wounds</label>
            <div className="ptg-wounds-stepper">
              <button type="button" onClick={() => setN(n - 1)} disabled={n === 0}>−</button>
              <input value={n} inputMode="numeric" onChange={e => setN(parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)} />
              <button type="button" onClick={() => setN(n + 1)}>+</button>
            </div>
          </div>
          <div className={`ptg-wounds-band ptg-wounds-band-${band.toLowerCase()}`}>{band === 'None' ? 'No scar yet' : band === 'Succumbs' ? 'Succumbs to injuries' : `${band} scar band`}</div>
          {isHero && (
            <label className="ptg-wounds-drained" title="Failed a healing ritual (rolled a 1): −1 to casting, chanting and hit rolls until the end of your next battle">
              <input type="checkbox" checked={!!drained} onChange={e => onDrained(e.target.checked)} /> Drained
            </label>
          )}
        </div>
        {n >= RC_SUCCUMB_AT && (
          <div className="ptg-wounds-warning">18+ battle wounds: this unit succumbs to its injuries — remove it from the roster (its enhancements are lost).{subtitle === 'Warlord' ? ' Pick another Hero to be your general.' : ''}</div>
        )}
        {RC_SCAR_TIERS.filter(t => n >= t.min || scars?.[t.key] != null).map(t => {
          const chosen = scars?.[t.key];
          return (
            <div key={t.key} className="ptg-wounds-scar">
              <div className="ptg-wounds-scar-title">
                {t.name} battle scar
                <button type="button" className="ptg-wounds-roll" title="Roll a D6 on this table" onClick={() => rollScar(t.key)}>🎲 Roll D6</button>
                {chosen != null && <button type="button" className="ptg-wounds-clear" title="Clear this scar (if it was entered by mistake)" onClick={() => onScars(prev => { const c = { ...prev }; delete c[t.key]; return c; })}>clear</button>}
              </div>
              <div className="ptg-apotheosis-options-grid">
                {t.table.map((sc, i) => (
                  <button key={sc.name} type="button" className={`ptg-apotheosis-option-btn${chosen === i ? ' ptg-apotheosis-option-selected' : ''}`} onClick={() => pickScar(t.key, i)}>
                    <AbilityCard ab={{ name: `${sc.roll}: ${sc.name}`, timing: 'Passive', effect: sc.effect, bullets: [] }} keywords={[]} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStepFlow = () => (
          <>
            <div className="ptg-wizard-steps">
              {stepLabels.map((label, i) => (
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
              <div className="ptg-wizard-body-title">{step + 1}. {stepLabels[step]}</div>
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
                          // Battlepacks stay on this step so their rules
                          // summary (below the cards) can be read first.
                          if (!BATTLEPACKS[c.key]) setStep(s => Math.min(WOUNDS_STEP - 1, s + 1));
                        }}
                      >
                        <div className="ptg-campaign-name">{c.name}</div>
                        <div className="ptg-campaign-desc">{c.desc}</div>
                        {!c.available && <div className="ptg-campaign-soon">Coming Soon</div>}
                      </button>
                    ))}
                  </div>
                  {renderBattlepackRules()}
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
                        onClick={() => { setSelectedFaction(f.faction_slug); setStep(s => Math.min(stepCount - 1, s + 1)); }}
                      >
                        {f.faction}
                      </button>
                    );
                  }))}
                </div>
              ) : step === 2 ? (
                <div className="ptg-formation-step">
                  <p className="ptg-apotheosis-intro">Pick up to 1 battle formation for your army. It goes on your Path to Glory Roster and Army Roster.</p>
                  {formationsLoading ? (
                    <div className="ptg-wizard-body-placeholder">Loading…</div>
                  ) : !(factionRules.formations || []).length ? (
                    <div className="ptg-wizard-body-placeholder">{selectedFaction ? 'No battle formations found for this faction.' : 'Pick a faction first.'}</div>
                  ) : (
                    <div className="ptg-apotheosis-options-grid">
                      {factionRules.formations.map(fm => (
                        <button
                          key={fm.id || fm.formation_name}
                          type="button"
                          className={`ptg-apotheosis-option-btn${battleFormation === fm.formation_name ? ' ptg-apotheosis-option-selected' : ''}`}
                          onClick={() => {
                            const next = battleFormation === fm.formation_name ? '' : fm.formation_name;
                            setBattleFormation(next);
                            setArmyRosterFormation(next);
                          }}
                        >
                          <div className="ptg-formation-step-name">{fm.formation_name}</div>
                          <AbilityCard ab={{ ...fm, bullets: parseFormationBullets(fm.bullets) }} keywords={[]} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : step === 3 ? (
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
              ) : step === 4 ? (
                <div className="ptg-path-step">
                  {bp ? (
                    <>
                      {renderPathGroup(`${bp.name} — Hero Paths`, bp.paths.filter(p => p.hero))}
                      {campaign === 'blighted-wilds' && renderPathGroup('Ravaged Coast — Hero Paths (allowed in Blighted Wilds)', BATTLEPACKS['ravaged-coast'].paths.filter(p => p.hero))}
                      <details className="ptg-bp-details">
                        <summary>{bp.name} — Unit Paths (non-Hero units, earned during the campaign)</summary>
                        {renderPathGroup(null, bp.paths.filter(p => !p.hero))}
                      </details>
                    </>
                  ) : (<>
                  <div className="ptg-apotheosis-group-title">Core</div>
                  <div className="ptg-apotheosis-options-grid">
                    {CORE_HERO_PATHS.map(p => (
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
                  </>)}

                  {renderCampaignPathToggles()}
                  {otherCampaignPathGroups().map(g => (
                    <React.Fragment key={g.key}>
                      {renderPathGroup(`${g.name} — Hero Paths`, g.paths.filter(p => p.hero))}
                      {g.paths.some(p => !p.hero) && (
                        <details className="ptg-bp-details">
                          <summary>{g.name} — Unit Paths (non-Hero units)</summary>
                          {renderPathGroup(null, g.paths.filter(p => !p.hero))}
                        </details>
                      )}
                    </React.Fragment>
                  ))}

                  <div className="ptg-path-section-divider" />

                  <div className="ptg-apotheosis-group-title">Faction</div>
                  {(() => {
                    const fp = FACTION_PATHS[selectedFaction] ?? [];
                    const factionName = factions.find(f => f.faction_slug === selectedFaction)?.faction || 'this faction';
                    if (!fp.length) return <div className="ptg-wizard-body-placeholder">No faction Paths published for {factionName}.</div>;
                    const heroPaths = fp.filter(p => pathFitsUnit(p, true));
                    const unitPaths = fp.filter(p => p.hero === false);
                    return (
                      <>
                        {renderPathGroup(null, heroPaths)}
                        {unitPaths.length > 0 && (
                          <details className="ptg-bp-details">
                            <summary>{factionName} — Unit Paths (non-Hero units, set on Set Paths &amp; Ranks)</summary>
                            {renderPathGroup(null, unitPaths)}
                          </details>
                        )}
                      </>
                    );
                  })()}

                  {(() => {
                    const selectedPathObj = PATHS.find(p => p.key === warlordPath)
                      || BATTLEPACK_PATHS.find(p => p.key === warlordPath)
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
                                  <AbilityCard ab={{ ...opt, bullets: Array.isArray(opt.bullets) ? opt.bullets : [] }} keywords={[]} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              ) : step === 5 ? (
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
                  {/* Hide toggles shared with Warscrolls/Army Builder (Other Factions
                      doesn't apply — this list is already one faction only; Scourge
                      units are never shown in Path to Glory). */}
                  <div className="cb-group cb-group-right ptg-units-hide-row">
                    <div className="cb-group-header">Hide:</div>
                    <label className="cb-item">
                      <input type="checkbox" checked={unitsHideRoR} onChange={e => setUnitsHideRoR(e.target.checked)} />
                      <span>Regiments of Renown</span>
                    </label>
                    <label className="cb-item">
                      <input type="checkbox" checked={unitsHideLegends} onChange={e => setUnitsHideLegends(e.target.checked)} />
                      <span>Legends</span>
                    </label>
                    <label className="cb-item ptg-units-only-added" title="Show only the units you've added to this roster">
                      <input type="checkbox" checked={unitsOnlyAdded} onChange={e => setUnitsOnlyAdded(e.target.checked)} />
                      <span>Filter to added Units</span>
                    </label>
                  </div>
                  {campaign === 'ravaged-coast' && (() => {
                    const over = startingUnitPool.filter(u => {
                      const sel = startingUnits[u.id];
                      if (!sel) return false;
                      const pts = parseInt(u.points, 10) || 0;
                      return (sel.train > 0 && pts > 350) || (sel.reinforce > 0 && pts * 2 > 350);
                    });
                    return (
                      <div className={`ptg-wizard-body-placeholder${over.length ? ' ptg-bp-warning' : ''}`}>
                        Ravaged Coast: no single unit in your starting army can cost more than 350 points (except Sons of Behemat Heroes).
                        {over.length > 0 && <> Over the cap: {over.map(u => u.name).join(', ')}.</>}
                      </div>
                    );
                  })()}
                  {renderStartingUnitsTable(factionUnits, factionUnitsLoading, 'No warscrolls found for this faction.')}

                  {/* A Path to Glory starting roster can include units from any
                      faction in the warlord's own Grand Alliance — collapsed by
                      default because most rosters never use it, and the home
                      faction's list is the one the step is really about. */}
                  <div className={`ptg-ally-section${allyPickerOpen ? ' ptg-ally-section-open' : ''}`}>
                    <button
                      type="button"
                      className="ptg-ally-toggle"
                      aria-expanded={allyPickerOpen}
                      onClick={() => setAllyPickerOpen(o => !o)}
                    >
                      <span className="ptg-ally-chevron" aria-hidden="true">{allyPickerOpen ? '▾' : '▸'}</span>
                      <span>Add unit from other faction in grand alliance</span>
                      {allyPickedCount > 0 && <span className="ptg-ally-count">{allyPickedCount} added</span>}
                    </button>
                    {allyPickerOpen && (
                      allyFactionOptions.length === 0 ? (
                        <div className="ptg-wizard-body-placeholder">Pick a faction in step 1 first.</div>
                      ) : (
                        <div className="ptg-ally-body">
                          <div className="ptg-field ptg-ally-field">
                            <label>Faction</label>
                            <select value={allyFaction} onChange={e => setAllyFaction(e.target.value)}>
                              <option value="">Choose a faction…</option>
                              {allyFactionOptions.map(f => (
                                <option key={f.faction_slug} value={f.faction_slug}>{f.faction}</option>
                              ))}
                            </select>
                          </div>
                          {allyFaction && renderStartingUnitsTable(
                            allyUnitsByFaction[allyFaction] ?? [],
                            allyUnitsLoading,
                            'No warscrolls found for this faction.',
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : step === 6 ? (
                <div className="ptg-enhancements-step">
                  {campaign === 'ravaged-coast' && (
                    <div className="ptg-wizard-body-placeholder">Ravaged Coast armies start with no enhancements — these are bought with emberstone shards (3 each) in the aftermath sequence. Pick one here to note what you’re saving for.</div>
                  )}
                  {/* Battlepack universal tables are appended after the
                      faction's own, so existing picks (stored by index)
                      keep pointing at the same card. */}
                  {renderEnhancementTable('Heroic Traits', heroicTraitOptions, heroicTraitChoice, heroicTraitAssignee, pickHeroicTrait, reassignHeroicTrait)}
                  <div className="ptg-path-section-divider" />
                  {renderEnhancementTable('Artefacts of Power', artefactOptions, artefactChoice, artefactAssignee, pickArtefact, reassignArtefact)}
                </div>
              ) : step === 7 ? (
                <div className="ptg-lores-step">
                  {bp && <ul className="ptg-bp-list">{(BATTLEPACK_RULES[bp.key]?.roster || []).filter(t => /spell|lore/i.test(t)).map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  {renderLoreColumn('Spell Lore', [...(factionRules.spell_lore || []), ...(bp?.spell_lore || [])], spellLore, setSpellLore)}
                  <div className="ptg-path-section-divider" />
                  {renderLoreColumn('Prayer Lore', [...(factionRules.prayer_lore || []), ...(bp?.prayer_lore || [])], prayerLore, setPrayerLore)}
                  <div className="ptg-path-section-divider" />
                  {renderLoreColumn('Manifestation Lore', factionRules.manifestation_lore, manifestationLore, setManifestationLore)}
                </div>
              ) : step === 8 && campaign === 'ravaged-coast' ? (
                <div className="ptg-quest-step">
                  <div className="ptg-wizard-body-placeholder">Ravaged Coast has no quests — your army grows by gathering emberstone shards and spending them in the aftermath sequence.</div>
                  <div className="ptg-quest-log-grid">
                    <div className="ptg-field"><label>Emberstone Vault</label><input type="text" value={emberstoneVault} onChange={e => setEmberstoneVault(e.target.value)} /></div>
                    <div className="ptg-field"><label>Total Shards Gained</label><input type="text" value={emberstoneTotal} onChange={e => setEmberstoneTotal(e.target.value)} /></div>
                  </div>
                  {renderBattlepackRules(['aftermath', 'battle'])}
                </div>
              ) : step === 8 && campaign === 'blighted-wilds' ? (
                <div className="ptg-quest-step">
                  <div className="ptg-wizard-body-placeholder">Blighted Wilds has no quests — each battleplan has its own reward instead (below). Track glory points and your general’s renown here.</div>
                  <div className="ptg-quest-log-grid">
                    <div className="ptg-field"><label>Glory Points</label><input type="text" value={gloryPoints} onChange={e => setGloryPoints(e.target.value)} /></div>
                    <div className="ptg-field"><label>General’s Renown</label><input type="text" value={warlordRenown} onChange={e => setWarlordRenown(e.target.value)} /></div>
                  </div>
                  {renderBattlepackRules(['aftermath', 'battle'])}
                </div>
              ) : step === 8 ? (
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
              ) : step === 9 ? (
                <div className="ptg-regiments-step">
                  <div className="ptg-units-step-header">
                    <span>Regiments</span>
                    <span className="ab-points-block">
                      <span className="ab-points-value">{regimentsTotal}</span>
                      <span className="ab-points-label"> pts in regiments</span>
                    </span>
                  </div>
                  <p className="ptg-apotheosis-intro">
                    Your Warlord leads the General&rsquo;s Regiment and every other Hero opens one of
                    their own, with the rest of the roster filling the slots below them in order.
                    Drag any unit onto another regiment, or onto a different row, to rearrange.
                  </p>
                  <div className="ptg-regiment-actions">
                    <button type="button" className="ptg-wizard-nav-btn" onClick={reconcileRegiments}>
                      Pull in new units
                    </button>
                    <button
                      type="button"
                      className="ptg-wizard-nav-btn"
                      onClick={() => { setRegiments(buildDefaultRegiments()); setRegimentsSeedSig(rosterSignature); }}
                      title="Discards any rearranging and rebuilds the default order"
                    >
                      Reset to default order
                    </button>
                    <button type="button" className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={addRegiment}>+ Add Regiment</button>
                  </div>
                  {regiments.map((r, ri) => (
                    <div
                      className="ptg-regiment-block ptg-regiment-dropzone"
                      key={r.id}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); moveRegimentUnit(draggedRegUnitId, r.id); setDraggedRegUnitId(null); }}
                    >
                      <div className="ptg-regiment-header">
                        <span>{ri === 0 ? "General's Regiment 1" : `Regiment ${ri + 1}`}</span>
                        <span className="ptg-regiment-pts">
                          {r.units.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0)}pts
                        </span>
                        {regiments.length > 1 && (
                          <button className="ptg-oob-row-remove" onClick={() => removeRegiment(r.id)} title="Remove regiment">✕</button>
                        )}
                      </div>
                      {r.units.length === 0 ? (
                        <div className="ptg-regiment-empty">Drag a unit here</div>
                      ) : r.units.map(u => (
                        <div
                          className={`ptg-regiment-drag-row${draggedRegUnitId === u.id ? ' ptg-regiment-dragging' : ''}`}
                          key={u.id}
                          draggable
                          onDragStart={e => { setDraggedRegUnitId(u.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragEnd={() => setDraggedRegUnitId(null)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation(); // else the regiment's own drop handler appends it to the end instead
                            moveRegimentUnit(draggedRegUnitId, r.id, u.id);
                            setDraggedRegUnitId(null);
                          }}
                        >
                          <span className="ptg-regiment-grip" aria-hidden="true">⠿</span>
                          <span className="ptg-regiment-unit-name">{(u.name || 'Unnamed unit').toUpperCase()}</span>
                          <span className="ptg-regiment-unit-meta">{u.size ? `${u.size} models` : ''}</span>
                          <span className="ptg-regiment-unit-meta">{u.notes}</span>
                          <span className="ptg-regiment-unit-pts">{u.points ? `${u.points}pts` : '—'}</span>
                          <button className="ptg-oob-row-remove" onClick={() => removeRegimentUnit(r.id, u.id)} title="Remove from regiment">✕</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : step === 10 ? (
                <div className="ptg-paths-step">
                  <p className="ptg-apotheosis-intro">
                    Renown earns a unit its rank — Aspiring at 5, Elite at 15, Mighty at 30, Legendary
                    at 45 — and each rank unlocks one ability from that unit&rsquo;s Path. Heroes walk a
                    Path of their own; everyone else just tracks renown and rank. Rank can also be
                    picked directly — for campaigns without renown, such as Ravaged Coast.
                  </p>

                  {renderCampaignPathToggles()}

                  {renderPathCard({
                    key: 'warlord',
                    title: warlordName?.trim() || 'Warlord',
                    subtitle: 'Warlord',
                    isHero: true,
                    renown: warlordRenown,
                    onRenown: v => { setWarlordRenown(v); setWarlordRank(rankForRenown(v)); },
                    rank: warlordRank,
                    onRank: setWarlordRank,
                    pathKey: warlordPath,
                    onPath: key => pickWarlordPath(key || null),
                    rankChoices: warlordPathRankChoices,
                    onPick: (pathObj, rank, oi) => pickPathRankOption(pathObj.ranks, rank, oi),
                  })}

                  {oobUnits.length === 0 && (
                    <div className="ptg-wizard-body-placeholder">
                      No units on the Order of Battle yet — add some in &ldquo;Add your Starting units&rdquo;.
                    </div>
                  )}
                  {oobUnits.map(row => renderPathCard({
                    key: row.id,
                    title: oobRowWarscrollName(row) || 'Unnamed unit',
                    subtitle: isHeroRow(row) ? 'Hero' : 'Unit',
                    reinforced: !!(row.reinforced || '').trim(),
                    isHero: isHeroRow(row),
                    renown: row.renown,
                    onRenown: v => setOobUnitRenown(row.id, v),
                    rank: row.rank ?? rankForRenown(row.renown),
                    onRank: v => setOobUnits(rows => rows.map(r => (r.id === row.id ? { ...r, rank: v } : r))),
                    pathKey: row.path,
                    onPath: key => setOobUnitPath(row.id, key),
                    rankChoices: row.pathRankChoices || {},
                    onPick: (pathObj, rank, oi) => pickOobUnitRankOption(row.id, pathObj, rank, oi),
                  }))}
                </div>
              ) : step === 11 ? (
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
              ) : step === WOUNDS_STEP && campaign === 'ravaged-coast' ? (
                <div className="ptg-wounds-step">
                  <p className="ptg-apotheosis-intro">
                    After each battle: units destroyed in it suffer D3 battle wounds; each unit that ended the battle with an
                    emberstone token suffers 1 on a 1–4. A unit gets a scar the first time it reaches 5 (Serious), 9 (Severe) and
                    13 (Critical) wounds — roll D6 on that table; at most 1 of each type, and scars stay after wounds are healed.
                    At 18 it succumbs and leaves the roster. Up to 2 Heroes may try a healing ritual: on a 2+ remove that many wounds
                    from a unit; on a 1 the Hero is drained (−1 to casting, chanting and hit rolls) until the end of your next battle.
                  </p>
                  {renderWoundsCard({
                    key: 'warlord', title: warlordName?.trim() || 'Warlord', subtitle: 'Warlord', isHero: true,
                    wounds: warlordWounds, onWounds: setWarlordWounds,
                    scars: warlordScars, onScars: setWarlordScars,
                    drained: warlordDrained, onDrained: setWarlordDrained,
                  })}
                  {oobUnits.filter(r => (r.name || r.warscroll || '').trim()).map(row => renderWoundsCard({
                    key: row.id, title: oobRowWarscrollName(row), subtitle: isHeroRow(row) ? 'Hero' : 'Unit', isHero: isHeroRow(row),
                    reinforced: !!(row.reinforced || '').trim(),
                    wounds: row.wounds ?? 0,
                    onWounds: v => setOobUnits(rows => rows.map(r => (r.id === row.id ? { ...r, wounds: typeof v === 'function' ? v(r.wounds ?? 0) : v } : r))),
                    scars: row.scars || {},
                    onScars: v => setOobUnits(rows => rows.map(r => (r.id === row.id ? { ...r, scars: typeof v === 'function' ? v(r.scars || {}) : v } : r))),
                    drained: !!row.drained,
                    onDrained: v => setOobUnits(rows => rows.map(r => (r.id === row.id ? { ...r, drained: v } : r))),
                  }))}
                </div>
              ) : (
                <div className="ptg-wizard-body-placeholder">Coming soon.</div>
              )}
            </div>

            <div className="ptg-wizard-nav">
              <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
                ‹ Back
              </button>
              <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.min(stepCount - 1, s + 1))} disabled={step >= stepCount - 1}>
                Next ›
              </button>
            </div>
          </>
  );

  return (
    <>
      <div className="gw-overlay" />
      <div className={`ptg-wizard${wizardViewMode === 'dual' ? ' ptg-wizard-dual-mode' : ''}${enemyName ? ' ptg-wizard-enemy' : ''}${onImport ? ' ptg-wizard-importable' : ''}`} ref={modalRef} role="dialog" aria-modal="true" aria-label={enemyName ? `Enemy roster: ${enemyName}` : 'Recruit Your Forces!'}>
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
        {/* Import is reachable from the page header too, but once you're in
            the wizard the header is covered — and the enemy wizard is the
            only place an enemy list can be imported straight into. */}
        {onImport && (
          <button
            className="ab-roster-print-btn ptg-wizard-import-btn"
            onClick={onImport}
            title={enemyName
              ? 'Paste an army list exported from New Recruit — it is saved as a roster and becomes your enemy'
              : 'Paste an army list exported from New Recruit — it is saved as a roster and opened here'}
          >Import List</button>
        )}
        {activeDoc === 'warlord' && !warlordPrintPreview && (
          <button className="ab-roster-print-btn" onClick={handleWarlordPrintClick} title="Print">🖨 Print</button>
        )}
        {/* Share sits beside Print on the Warlord sheet, and in Print's spot
            on the Army Roster sheet (which has no Print). */}
        {onShare && ((activeDoc === 'warlord' && !warlordPrintPreview) || activeDoc === 'army') && (
          <ShareButton
            wrapperClassName={`ab-roster-share-wrap${activeDoc === 'warlord' ? ' ab-roster-share-wrap-beside-print' : ''}`}
            className="ab-roster-print-btn"
            onShare={mode => onShare({ view: 'wizard', doc: activeDoc, mode: presentMode }, mode)}
          />
        )}

        <div className="ptg-wizard-banner">
          Path to Glory!{campaignLabel && <span className="ptg-wizard-banner-campaign"> — {campaignLabel}</span>}
          {enemyName && (
            <span className="ptg-wizard-banner-enemy"> — Enemy:{' '}
              {editingName ? (
                <input
                  ref={nameInputRef}
                  className="ptg-wizard-banner-name-input"
                  value={nameDraft}
                  size={Math.max(8, nameDraft.length + 1)}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation(); // the wizard closes on Esc — handle it here instead
                    if (e.key === 'Enter') commitName();
                    if (e.key === 'Escape') { setNameDraft(bannerName); setEditingName(false); }
                  }}
                  onBlur={commitName}
                />
              ) : onRename ? (
                <span
                  className="ptg-wizard-banner-name ptg-wizard-banner-name-editable"
                  title="Click to rename this roster"
                  onClick={() => setEditingName(true)}
                >{bannerName}</span>
              ) : (
                <span className="ptg-wizard-banner-name">{bannerName}</span>
              )}
            </span>
          )}
        </div>

        {wizardViewMode === 'dual' ? (
          <div className="ptg-wizard-dual">
            <div className="ptg-wizard-dual-left">
              <div className="ptg-wizard-header">
                <div className="ptg-wizard-title">{enemyName ? 'Face Thy Enemies!' : 'Recruit Your Forces!'}</div>
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
              <div className="ptg-wizard-title">{enemyName ? 'Face Thy Enemies!' : 'Recruit Your Forces!'}</div>
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

// ── Read-only preview ──
// Builds the same `data` object DocPage consumes, but from a saved roster
// blob instead of live wizard state, so a shared link can draw the sheets
// without the wizard (and without an account). Deliberately omits every
// set*/update* key: with no setters the overlay fields all render read-only,
// which is exactly what a preview should be.
// Extracts a structured ability from an upgrade option's embedded
// "[Timing] NAME — Declare: ... Effect: ..." bullet (module scope: used by
// computeWarlordAbilityGroups for the wizard and the share preview).
function parseInlineAbilityBullet(b) {
  // Split on the "Declare:"/"Effect:" keyword rather than on a dash. Only
  // about 4 in 10 of these bullets actually carry the dash — the rest run
  // straight from the name into "Effect:" ("[Passive] LOVES A GOOD FIGHT
  // Effect: ...") — so a dash-anchored split returned null for the
  // majority and the warscroll printed the option's own pointer text
  // ("Add the following ability to your hero's warscroll:") with nothing
  // after it. Anchoring on the keyword also stops a hyphenated ability
  // name splitting itself in half ("BACKUP THRUSTER-ENDRINS").
  const m = /^\[([^\]]+)\]\s*(.+?)\s*(?:[—–-]\s*)?(?=Declare:|Effect:)(.*)$/s.exec(b || '')
    || /^\[([^\]]+)\]\s*(.+?)\s*[—–-]\s*(.+)$/s.exec(b || '');
  if (!m) return null;
  const [, timing, name, rest] = m;
  const declMatch = /^Declare:\s*(.+?)\s*Effect:\s*(.+)$/s.exec(rest);
  if (declMatch) return { name: name.trim(), timing: timing.trim(), declare: declMatch[1].trim(), effect: declMatch[2].trim() };
  const effMatch = /^Effect:\s*(.+)$/s.exec(rest);
  return { name: name.trim(), timing: timing.trim(), declare: '', effect: (effMatch ? effMatch[1] : rest).trim() };
}

// The Warlord sheet's ability blocks (Companion, Origin/Flaw, Battle Mount,
// upgrades, Enhancements on the Warlord, the Path's picked ranks). Module
// scope so the wizard and the share preview draw the same list.
// Every Path a roster of this faction could use (core + battlepacks + the
// faction's own), for looking up a row's Path by key outside the wizard.
export function allPathsForFaction(slug) {
  return [...PATHS, ...BATTLEPACK_PATHS, ...(FACTION_PATHS[slug] ?? [])];
}

// Every ability a sheet might name — Path rank abilities (core, battlepack
// and the faction's), the faction's and battlepack's Heroic Traits and
// Artefacts, and the Warlord's own groups — keyed for loose name matching,
// so the preview can show the card behind a name typed on the sheet.
export function buildAbilityLookup({ factionSlug = '', factionRules = {}, campaign = '', warlordAbilityGroups = [] }) {
  const m = new Map();
  const add = (ab, kind) => {
    const k = abilityKey(ab?.name);
    if (!k || m.has(k)) return;
    let bullets = ab.bullets;
    if (typeof bullets === 'string') { try { bullets = JSON.parse(bullets); } catch { bullets = []; } }
    m.set(k, { ...ab, bullets, _kind: kind });
  };
  for (const p of allPathsForFaction(factionSlug)) {
    for (const r of p.ranks || []) for (const o of r.options || []) add(o, `${p.name} · ${r.rank}`);
  }
  for (const o of [...(factionRules.heroic_traits || []), ...(BATTLEPACKS[campaign]?.heroic_traits || [])]) add(o, 'Heroic Trait');
  for (const o of [...(factionRules.artefacts || []), ...(BATTLEPACKS[campaign]?.artefacts || [])]) add(o, 'Artefact');
  for (const g of warlordAbilityGroups) for (const a of g.abilities || []) add({ ...a, name: String(a.name || '').replace(/^[A-Za-z]+: /, '') }, g.header);
  return m;
}

// Splits a sheet field ("Hunter of Souls (Mortal Wounds), Reaping Strikes;
// Path of the Enclave") into the ability cards it names; unknown names
// (a Path's own name, free text) are skipped. A "(choice)" suffix is the
// enhancement's sub-pick and is added to the card's effect.
export function abilitiesInText(text, lookup) {
  const out = [];
  const seen = new Set();
  // Split on , and ; outside brackets — a sub-pick like "Hunter of Souls
  // (Anti-INFANTRY (+1 Rend))" carries its own nested brackets.
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of String(text || '')) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const open = part.indexOf('(');
    const pm = open > 0 && part.endsWith(')') ? [part, part.slice(0, open).trim(), part.slice(open + 1, -1).trim()] : null;
    const base = pm ? pm[1] : part;
    const ab = lookup.get(abilityKey(base)) || lookup.get(abilityKey(part));
    if (!ab || seen.has(abilityKey(part))) continue;
    seen.add(abilityKey(part));
    out.push(pm && lookup.get(abilityKey(base)) ? { ...ab, effect: `${ab.effect || ''} Chosen: ${pm[2]}.`.trim() } : ab);
  }
  return out;
}

// An Order of Battle row's Path, rank and picked rank abilities: from the
// row's own Path picks, else read back off its Path Abilities text.
export function oobPathSummary(row, allPaths) {
  const path = allPaths.find(p => p.key === row?.path);
  const choices = row?.pathRankChoices || {};
  let abilities = [];
  let rank = '';
  if (path) {
    for (const r of path.ranks || []) {
      const o = choices[r.rank] != null ? r.options?.[choices[r.rank]] : null;
      if (o) { abilities.push(o); rank = r.rank; }
    }
  }
  let pathName = path?.name || '';
  if (!abilities.length && row?.pathAbility) {
    const found = derivePathAndRank(row.pathAbility, allPaths, row.path || '');
    const fromPath = found && allPaths.find(p => p.name === found.name);
    const names = row.pathAbility.split(',').map(abilityKey).filter(Boolean);
    abilities = names.map(n => {
      for (const p of fromPath ? [fromPath, ...allPaths] : allPaths) {
        for (const r of p.ranks || []) { const o = (r.options || []).find(x => abilityKey(x.name) === n); if (o) return o; }
      }
      return null;
    }).filter(Boolean);
    pathName = pathName || found?.name || '';
    rank = found?.rank || '';
  }
  if (!pathName && !abilities.length) return null;
  return { pathName, rank: rank || (row?.rank && row.rank !== '-' ? row.rank : ''), abilities };
}

export function enhancementChoicesFor(opt) {
  if (!opt || !/pick (?:1|one) of the following/i.test(opt.effect || '')) return null;
  const bullets = Array.isArray(opt.bullets) ? opt.bullets : (() => { try { return JSON.parse(opt.bullets || '[]'); } catch { return []; } })();
  const list = bullets.map(b => (typeof b === 'string' ? b : b?.text || b?.name || '')).map(t => t.trim()).filter(Boolean);
  return list.length ? list : null;
}
export function enhancementChoiceFor(opt, enhancementSubChoice = {}) {
  const list = enhancementChoicesFor(opt);
  if (!list) return null;
  const c = enhancementSubChoice[opt.name];
  return list.includes(c) ? c : list[0];
}
export function computeWarlordAbilityGroups({
  apotheosisSteps = [], companionChoice = -1, originFlawChoice = {}, mountChoice = -1,
  battleMountUpgradesChoice = [], otherUpgradesChoice = [],
  heroicTraitOptions = [], artefactOptions = [], heroicTraitChoice = null, artefactChoice = null,
  heroicTraitAssignee = 'warlord', artefactAssignee = 'warlord', enhancementSubChoice = {},
  warlordPath = '', warlordPathRankChoices = {}, selectedFaction = '',
}) {
  const groups = [];
  const push = (header, abilities) => { if (abilities.length) groups.push({ header, abilities }); };

  const companionStepData = apotheosisSteps.find(s => /choose a companion/i.test(s.step_title || ''));
  const originFlawStepData = apotheosisSteps.find(s => /origin.*flaw/i.test(s.step_title || ''));
  const mountStepData = apotheosisSteps.find(s => /^(?:choose|pick) a battle mount$/i.test(s.step_title || ''));
  const mountUpgradesStepData = apotheosisSteps.find(s => /^(?:pick any |battle any )?battle mount upgrades$/i.test(s.step_title || ''));
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
  // Only enhancements actually on the Warlord print on the Warlord sheet.
  const enhancementCard = o => {
    const choice = enhancementChoiceFor(o, enhancementSubChoice);
    return { name: o.name, timing: o.timing, declare: o.declare, effect: choice ? `${o.effect} ${choice}.` : o.effect, phase_key: o.phase_key };
  };
  if (heroicTraitChoice != null && heroicTraitOptions[heroicTraitChoice] && heroicTraitAssignee === 'warlord') {
    enhancements.push(enhancementCard(heroicTraitOptions[heroicTraitChoice]));
  }
  if (artefactChoice != null && artefactOptions[artefactChoice] && artefactAssignee === 'warlord') {
    enhancements.push(enhancementCard(artefactOptions[artefactChoice]));
  }
  push('Enhancements', enhancements);

  const selectedPathObj = PATHS.find(p => p.key === warlordPath) || BATTLEPACK_PATHS.find(p => p.key === warlordPath) || (FACTION_PATHS[selectedFaction] ?? []).find(p => p.key === warlordPath);
  if (selectedPathObj?.ranks) {
    const pathAbilities = selectedPathObj.ranks
      .map(r => (warlordPathRankChoices[r.rank] != null ? { ...r.options[warlordPathRankChoices[r.rank]], name: `${r.rank}: ${r.options[warlordPathRankChoices[r.rank]].name}` } : null))
      .filter(Boolean);
    push(selectedPathObj.name, pathAbilities);
  }

  return groups;
}

export function buildPreviewDocData(state = {}, factions = [], apotheosisSteps = [], factionRules = {}) {
  const g = (k, dflt = '') => (state[k] ?? dflt);
  const modSources = apotheosisModsFrom(apotheosisSteps, {
    archetypeChoice: g('archetypeChoice', -1),
    companionChoice: g('companionChoice', -1),
    originFlawChoice: g('originFlawChoice', {}),
    mountChoice: g('mountChoice', -1),
    battleMountUpgradesChoice: g('battleMountUpgradesChoice', []),
    otherUpgradesChoice: g('otherUpgradesChoice', []),
  });

  const stats = applyStatMods(
    { move: g('warlordMove'), health: g('warlordHealth'), save: g('warlordSave'), control: g('warlordControl') },
    modSources,
  );
  const keywordsLine1 = applyKeywordMods(g('warlordKeywordsLine1'), modSources);
  const ranged = applyWeaponMods(g('rangedWeapons', []), false, modSources);
  const melee = applyWeaponMods(g('meleeWeapons', []), true, modSources);

  const regiments = g('regiments', []);
  const auxUnits = g('auxUnits', []);
  const regimentsTotal = regiments.reduce((sum, r) => sum + (r.units || []).reduce((t, u) => t + (parseInt(u.points, 10) || 0), 0), 0);
  const auxTotal = auxUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);

  const factionSlug = g('faction') || g('selectedFaction') || '';
  const allPaths = [...PATHS, ...BATTLEPACK_PATHS, ...(FACTION_PATHS[factionSlug] ?? [])];
  const warlordPath = g('warlordPath');
  const campaign = g('campaign');
  const factionName = factions.find(f => f.faction_slug === factionSlug)?.faction || '';
  // Same ability list the wizard's Warlord sheet draws (it isn't stored).
  const warlordAbilityGroups = computeWarlordAbilityGroups({
    apotheosisSteps,
    companionChoice: g('companionChoice', -1), originFlawChoice: g('originFlawChoice', {}), mountChoice: g('mountChoice', -1),
    battleMountUpgradesChoice: g('battleMountUpgradesChoice', []), otherUpgradesChoice: g('otherUpgradesChoice', []),
    heroicTraitOptions: [...(factionRules.heroic_traits || []), ...(BATTLEPACKS[campaign]?.heroic_traits || [])],
    artefactOptions: [...(factionRules.artefacts || []), ...(BATTLEPACKS[campaign]?.artefacts || [])],
    heroicTraitChoice: g('heroicTraitChoice', null), artefactChoice: g('artefactChoice', null),
    heroicTraitAssignee: g('heroicTraitAssignee', 'warlord'), artefactAssignee: g('artefactAssignee', 'warlord'),
    enhancementSubChoice: g('enhancementSubChoice', {}),
    warlordPath, warlordPathRankChoices: g('warlordPathRankChoices', {}), selectedFaction: factionSlug,
  });

  return {
    warlordName: g('warlordName'),
    warlordMove: stats.move, warlordHealth: stats.health, warlordSave: stats.save, warlordControl: stats.control,
    rangedWeapons: ranged, meleeWeapons: melee,
    warlordKeywordsLine1: keywordsLine1,
    warlordWard: wardFromKeywords(keywordsLine1),
    warlordKeywordsLine2: g('warlordKeywordsLine2'),
    warlordAbilityGroups,
    warlordDocVariant: (ranged.length > 2 || melee.length > 2) ? 'full' : 'minimal',
    armyName: g('armyName'), realmOfOrigin: g('realmOfOrigin'), customRealmName: g('customRealmName'),
    realmLabel: REALMS.find(r => r.key === g('realmOfOrigin'))?.name || '',
    gloryPoints: g('gloryPoints'), battleFormation: g('battleFormation'),
    factionLabel: factionName,
    currentQuest: g('currentQuest'), questPoints: g('questPoints'), questNotes: g('questNotes'),
    questsCompleted: g('questsCompleted'), background: g('background'), notableEvents: g('notableEvents'),
    spellLore: g('spellLore'), prayerLore: g('prayerLore'), manifestationLore: g('manifestationLore'),
    warlordWarscroll: g('warlordWarscroll'), warlordRank: g('warlordRank'), warlordRenown: g('warlordRenown'),
    warlordEnhancements: g('warlordEnhancements'),
    warlordPathLabel: allPaths.find(x => x.key === warlordPath)?.name || '',
    warlordPathAbility: g('warlordPathAbility'), warlordWounds: g('warlordWounds', 0),
    oobUnits: g('oobUnits', []).map(u => ({ ...u, rank: pathRankLabel(u, allPaths), pathSummary: oobPathSummary(u, allPaths) })),
    factionSlug, campaign,
    warlordPoints: (() => {
      const dpStep = apotheosisSteps.find(st => /destiny point limit/i.test(st.step_title || ''));
      const m = /BATTLE PROFILE POINTS COST:\s*(\d+)/i.exec(dpStep?.options?.[g('destinyPointChoice', 2)]?.effect || '');
      return m ? m[1] : (g('regiments', []).flatMap(r => r.units || []).find(u => u.sourceUnitId === 'warlord')?.points || '');
    })(),
    abilityLookup: buildAbilityLookup({ factionSlug, factionRules, campaign, warlordAbilityGroups }),
    commander: g('commander'), armyRosterName: g('armyRosterName'),
    // As in the wizard: Ravaged Coast's limit is the roster's own total, and
    // Faction / Battle Formation fall back to the wizard's picks.
    pointsLimit: campaign === 'ravaged-coast' ? String(regimentsTotal + auxTotal) : g('pointsLimit'),
    armyRosterFaction: g('armyRosterFaction') || factionName, armyRosterFormation: g('armyRosterFormation') || g('battleFormation'),
    regiments, auxUnits, armyNotes: g('armyNotes'),
    regimentsTotal, auxTotal, armyUnitsTotal: regimentsTotal + auxTotal,
  };
}
