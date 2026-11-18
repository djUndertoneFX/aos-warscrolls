// Turns a parsed + resolved New Recruit list (see importList.js) into the
// Path to Glory wizard's own saved state, so an imported list arrives with
// as many of the wizard's steps already filled in as the list actually
// says something about.
//
// Kept apart from the page component so it can be replayed headlessly
// against the real database — see scripts/checkImportList.mjs.

import { nameKey, looseKey } from './importList';

// "Path to Glory: Ravaged Coast" / "Ravaged Coast" / "Matched Play" → the
// wizard's own campaign key. Anything unrecognised falls back to Ascension,
// which is the core campaign and the one whose rules are fully implemented.
export function campaignKeyFor(battlepack) {
  const k = nameKey(battlepack);
  if (/ravaged coast/.test(k)) return 'ravaged-coast';
  if (/blighted wilds/.test(k)) return 'blighted-wilds';
  if (/ascension|path to glory/.test(k)) return 'ascension';
  return 'ascension';
}

const RANK_ORDER = ['Aspiring', 'Elite', 'Mighty', 'Legendary'];

// Finds the option whose name the list wrote, inside one Anvil step's
// option list. Exact name first, then punctuation-insensitive — the source
// data is OCR'd and its apostrophes and hyphens don't always agree with
// New Recruit's.
function findOptionIndex(options, name) {
  if (!options?.length || !name) return -1;
  const exact = options.findIndex(o => nameKey(o.name) === nameKey(name));
  if (exact >= 0) return exact;
  return options.findIndex(o => looseKey(o.name) === looseKey(name));
}

/**
 * @param {object} parsed    parseArmyList() output
 * @param {object} resolved  resolveArmyList() output
 * @param {object} ctx       { factions, apotheosisSteps, paths }
 *   apotheosisSteps: GET /api/apotheosis/:slug steps for the list's faction
 *   paths: every Path the wizard knows, [{key, name, ranks:[{rank, options}]}]
 * @returns {object} { state, report } — `state` is a partial wizard
 *   snapshot to merge over the existing one; `report` says what landed and
 *   what didn't, for the import dialog to show.
 */
export function buildWizardState(parsed, resolved, ctx = {}) {
  const { factions = [], apotheosisSteps = [], paths = [] } = ctx;
  const report = { filled: [], skipped: [...(parsed.warnings || [])] };
  const state = {};

  const factionObj = factions.find(f => f.faction_slug === resolved.factionSlug);
  if (resolved.factionSlug) {
    state.selectedFaction = resolved.factionSlug;
    state.faction = resolved.factionSlug;
    state.armyRosterFaction = factionObj?.faction || parsed.faction;
    report.filled.push(`Faction: ${factionObj?.faction || parsed.faction}`);
  } else if (parsed.faction) {
    report.skipped.push(`Faction "${parsed.faction}" didn't match any known faction — pick it in step 2.`);
  }

  state.campaign = campaignKeyFor(parsed.battlepack);
  report.filled.push(`Campaign: ${parsed.battlepack || 'Ascension'}`);

  if (parsed.listName) {
    state.armyName = parsed.listName;
    state.armyRosterName = parsed.listName;
    report.filled.push(`Army name: ${parsed.listName}`);
  }
  if (parsed.points) {
    state.pointsLimit = String(parsed.points);
    report.filled.push(`Points limit: ${parsed.points}`);
  }
  if (parsed.formation) {
    state.battleFormation = parsed.formation;
    state.armyRosterFormation = parsed.formation;
    report.filled.push(`Battle formation: ${parsed.formation}`);
  }
  if (parsed.arcaneTome) {
    state.manifestationLore = [parsed.arcaneTome];
    report.filled.push(`Arcane Tome: ${parsed.arcaneTome}`);
  }
  if (parsed.lores?.length) {
    state.spellLore = parsed.lores.slice(0, 6);
    report.filled.push(`${parsed.lores.length} lore entries`);
  }

  // ── Starting units ────────────────────────────────────────────────────
  state.startingUnits = resolved.roster;
  const unitCount = Object.values(resolved.roster).reduce((n, s) => n + (s.train || 0) + (s.reinforce || 0), 0);
  if (unitCount) report.filled.push(`${unitCount} starting units`);

  // Units from elsewhere in the Grand Alliance go into the step's ally
  // picker, keyed by their own faction so the list keeps resolving.
  const allies = resolved.matched.filter(m => m.isAlly && m.warscroll);
  if (allies.length) {
    const bySlug = {};
    for (const a of allies) (bySlug[a.warscroll.faction_slug] ??= []).push(a.warscroll);
    state.allyUnitsByFaction = bySlug;
    state.allyFaction = allies[0].warscroll.faction_slug;
    state.allyPickerOpen = true;
    const names = [...new Set(allies.map(a => a.warscroll.faction_slug))].join(', ');
    report.filled.push(`${allies.length} Grand Alliance ally unit(s) from ${names}`);
  }
  for (const u of resolved.unmatched) {
    report.skipped.push(u.loose ? `Ignored unrecognised line: "${u.name}"` : `No warscroll matched "${u.name}" (${u.points}pts) — add it by hand in step 6.`);
  }

  // ── Order of Battle rows, one per unit the list names ─────────────────
  const uid = tag => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const oobUnits = [];
  const anvilHero = resolved.matched.find(m => m.anvil);
  for (const m of resolved.matched) {
    if (m.anvil) continue;
    const displayName = titleCase(m.warscroll.name);
    oobUnits.push({
      id: uid('su'),
      sourceUnitId: String(m.warscroll.id),
      name: displayName,
      warscroll: displayName.toUpperCase(),
      rank: '', renown: '0',
      points: String(m.reinforced ? (parseInt(m.warscroll.points, 10) || 0) * 2 : (m.warscroll.points || '')),
      enhancements: m.enhancements.join(', '),
      pathAbility: m.pathAbilities.join(', '),
      reinforced: m.reinforced ? 'Reinforced' : '',
      path: matchPathKey(m.path, paths),
      pathRankChoices: matchRankChoices(m.path, m.pathAbilities, paths),
    });
  }
  state.oobUnits = oobUnits;

  // ── Regiments, in the order the list laid them out ─────────────────────
  const regiments = [];
  for (const reg of parsed.regiments) {
    const units = [];
    for (const u of reg.units) {
      const m = resolved.matched.find(x => x.name === u.name && x.regiment === reg.label);
      if (!m) continue;
      const row = m.anvil ? null : oobUnits.find(o => o.sourceUnitId === String(m.warscroll.id) && !units.some(x => x.id === o.id));
      units.push({
        id: uid('ru'),
        sourceUnitId: m.anvil ? 'warlord' : (row?.id || String(m.warscroll.id)),
        name: m.anvil ? u.name : titleCase(m.warscroll.name),
        size: m.anvil ? '1' : String(m.warscroll.unit_size || ''),
        notes: [u.enhancements.join('; '), u.path].filter(Boolean).join(' — '),
        points: String(u.points || ''),
      });
    }
    regiments.push({ id: uid('r'), units });
  }
  if (regiments.length) {
    state.regiments = regiments;
    // Leave the signature blank so the Assign your Regiments step pulls in
    // anything the import couldn't place rather than treating this as
    // already reconciled.
    state.regimentsSeedSig = '';
    report.filled.push(`${regiments.length} regiments`);
  }

  // ── The Anvil of Apotheosis warlord ───────────────────────────────────
  if (anvilHero) {
    state.warlordName = anvilHero.name;
    report.filled.push(`Warlord: ${anvilHero.name}`);
    const anvil = applyAnvilPicks(anvilHero, apotheosisSteps, report);
    Object.assign(state, anvil);

    const pathKey = matchPathKey(anvilHero.path, paths);
    if (pathKey) {
      state.warlordPath = pathKey;
      state.warlordPathRankChoices = matchRankChoices(anvilHero.path, anvilHero.pathAbilities, paths);
      state.warlordPathAbility = anvilHero.pathAbilities.join(', ');
      report.filled.push(`Warlord path: ${anvilHero.path}`);
    } else if (anvilHero.path) {
      report.skipped.push(`Warlord path "${anvilHero.path}" isn't one the wizard knows yet.`);
    }
  }

  const general = resolved.matched.find(m => m.general);
  if (general) state.commander = general.anvil ? general.name : titleCase(general.warscroll.name);

  return { state, report };
}

// Matches each of the hero's bulleted Anvil picks against the real options
// on that faction's Anvil of Apotheosis steps, so the wizard's step 3 comes
// up with the same archetype, origin, flaw and upgrades already selected.
function applyAnvilPicks(hero, steps, report) {
  const out = {};
  if (!steps?.length) {
    if (hero.enhancements.length) {
      report.skipped.push(`No Anvil of Apotheosis data for this faction — the warlord's ${hero.enhancements.length} picks were left as notes.`);
    }
    return out;
  }
  const stepBy = re => steps.find(st => re.test(st.step_title || ''));
  // The destiny point limit is a named tier on its own step (Ogor
  // Mawtribes calls them Gutbully/Gutmaster/Gutlord), and New Recruit
  // prints it as a costed bullet alongside the rest of the picks.
  const dpStep = stepBy(/destiny point limit/i);
  const archetypeStep = stepBy(/(?:choose|pick) an archetype/i);
  const companionStep = stepBy(/choose a companion/i);
  const originFlawStep = stepBy(/origin.*flaw/i);
  const mountStep = stepBy(/^(?:choose|pick) a battle mount$/i);
  const mountUpgradesStep = stepBy(/^(?:pick any |battle any )?battle mount upgrades$/i);
  const otherUpgradesStep = stepBy(/pick any other upgrades/i);

  const remaining = [...hero.enhancements];
  const take = (step, onFound) => {
    if (!step?.options?.length) return;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const idx = findOptionIndex(step.options, remaining[i]);
      if (idx < 0) continue;
      onFound(idx, remaining[i]);
      remaining.splice(i, 1);
    }
  };

  take(dpStep, idx => { out.destinyPointChoice = idx; });
  take(archetypeStep, idx => { out.archetypeChoice = idx; });
  take(companionStep, idx => { out.companionChoice = idx; });
  take(mountStep, idx => { out.mountChoice = idx; });

  if (originFlawStep?.options?.length) {
    const byGroup = {};
    for (const o of originFlawStep.options) (byGroup[o.option_group] ??= []).push(o);
    const choice = {};
    for (const [group, options] of Object.entries(byGroup)) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        const idx = findOptionIndex(options, remaining[i]);
        if (idx < 0) continue;
        choice[group] = idx;
        remaining.splice(i, 1);
        break;
      }
    }
    if (Object.keys(choice).length) out.originFlawChoice = choice;
  }

  const multi = (step, key) => {
    if (!step?.options?.length) return;
    const picked = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const idx = findOptionIndex(step.options, remaining[i]);
      if (idx < 0) continue;
      picked.push(idx);
      remaining.splice(i, 1);
    }
    if (picked.length) out[key] = picked.sort((a, b) => a - b);
  };
  multi(mountUpgradesStep, 'battleMountUpgradesChoice');
  multi(otherUpgradesStep, 'otherUpgradesChoice');

  const placed = hero.enhancements.length - remaining.length;
  if (placed) report.filled.push(`${placed} Anvil of Apotheosis picks`);
  for (const name of remaining) {
    report.skipped.push(`Anvil pick "${name}" didn't match any option on this faction's Anvil steps.`);
  }
  return out;
}

function matchPathKey(pathName, paths) {
  if (!pathName) return '';
  const p = (paths || []).find(x => nameKey(x.name) === nameKey(pathName))
    || (paths || []).find(x => looseKey(x.name) === looseKey(pathName));
  return p?.key || '';
}

// "(Paragon of Faith, Firebrand Exhortations)" → {Aspiring: 0, Elite: 1},
// matching each named ability against the options on that Path's ranks.
function matchRankChoices(pathName, abilities, paths) {
  const path = (paths || []).find(x => nameKey(x.name) === nameKey(pathName || ''))
    || (paths || []).find(x => looseKey(x.name) === looseKey(pathName || ''));
  if (!path?.ranks || !abilities?.length) return {};
  const choices = {};
  for (const ability of abilities) {
    for (const r of path.ranks) {
      const idx = findOptionIndex(r.options, ability);
      if (idx >= 0 && choices[r.rank] == null) { choices[r.rank] = idx; break; }
    }
  }
  return choices;
}

// Warscroll names are stored all-lowercase; the wizard's own rows show them
// title-cased (same helper the Order of Battle sync uses).
function titleCase(s) {
  return String(s || '').replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export { RANK_ORDER };
