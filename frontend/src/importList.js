// Parses an army list pasted out of New Recruit (newrecruit.eu) into a
// structure the Army Builder and the Path to Glory wizard can both fill
// themselves in from.
//
// The format is plain text with no delimiters to speak of, so this reads it
// the way a person does: a header line, a short block of army-level facts,
// then regiment headings with units under them and bulleted options under
// those. Anything it can't place is kept in `unmatched` rather than thrown
// away, so the import dialog can tell you what didn't come across instead
// of silently dropping half your list.
//
//   P2G (1890 points) - Path to Glory: Ravaged Coast
//
//   Ogor Mawtribes
//   Maw-Cult Fanatics
//   Auxiliaries: 0
//   Drops: 3
//
//   Arcane Tome - Summon Krondspine Incarnate of Ghur
//   • Blood Feast
//
//   General's Regiment
//   Gobsprakk, the Mouth of Mork (240)
//   • General
//
//   Regiment 1
//   Anvil of Apotheosis: Ogor Mawtribes Hero (250)
//   • Gutmaster (250)
//   • Path of the Zealot (Paragon of Faith, Firebrand Exhortations)

// New Recruit emits typographic dashes and quotes (the sample list has a
// non-breaking hyphen inside "Maw‑Cult Fanatics"), which would never match
// the plain ASCII in the database. Every name is squashed through this
// before it is compared with anything.
export function normalizeName(s) {
  return String(s || '')
    .replace(/[‐-―−]/g, '-')   // ‐ ‑ ‒ – — ― −
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameKey(s) {
  return normalizeName(s).toLowerCase();
}

// Punctuation-insensitive form, for matching only. New Recruit writes
// "Gobsprakk, the Mouth of Mork"; the database has "gobsprakk the mouth of
// mork". Apostrophes, commas and hyphens differ this way often enough that
// comparing on letters and digits alone is the only reliable join.
export function looseKey(s) {
  return nameKey(s).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

const BULLET_RE = /^[•·▪*•▪-]\s+(.*)$/;
const UNIT_RE = /^(.+?)\s*\((\d+)\)\s*$/;
const HEADER_RE = /^(.*?)\s*\((\d+)\s*points?\)\s*(?:[-–—]\s*(.*))?$/i;
const REGIMENT_RE = /^(General'?s Regiment|Regiment\s*\d*|Auxiliar\w*(?:\s+Units)?|Terrain|Faction Terrain)\s*:?\s*$/i;
const FOOTER_RE = /^(created with|data version|exported|https?:)/i;
const META_RE = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/;

// "Path of the Zealot (Paragon of Faith, Firebrand Exhortations)" — the
// Path plus whichever rank abilities have been picked on it so far.
const PATH_RE = /^(Path of .+?)\s*\((.+)\)\s*$/i;
// "2x Musician", "1x Champion" — per-unit model options.
const MODEL_OPTION_RE = /^(\d+)\s*x\s*(.+)$/i;
// An Anvil of Apotheosis hero has no warscroll to match against; its name
// is whatever the Anvil built.
const ANVIL_RE = /^Anvil of Apotheosis\s*:\s*(.+)$/i;
// Army-level picks New Recruit writes as "<Kind> - <name>" or "<Kind>: <name>":
// "Battle Tactic Cards - Blazing Onslaught, Burning for Vengeance" (the GHB
// cards marked on the roster), "Spell Lore - Lore of the Underworlds",
// "Manifestation Lore - Infernal Sorceries", "Faction Terrain: Nexus of Grief".
const TACTICS_RE = /^Battle\s+Tactics?(?:\s+Cards?)?\s*[-–—:]\s*(.+)$/i;
const LORE_RE = /^(Spell|Prayer|Manifestation)\s+Lore\s*[-–—:]\s*(.+)$/i;
const TERRAIN_RE = /^Faction\s+Terrain\s*[-–—:]\s*(.+)$/i;
const splitNames = v => v.split(/\s*(?:,|\/|;|\band\b)\s*/i).map(normalizeName).filter(Boolean);

// Handles the army-level lines above; true if the line was one of them.
function applyArmyLine(out, line) {
  const tac = TACTICS_RE.exec(line);
  if (tac) { out.battleTactics.push(...splitNames(tac[1])); return 'tactics'; }
  const lore = LORE_RE.exec(line);
  if (lore) { out.loreChoices[`${lore[1].toLowerCase()}_lore`] = normalizeName(lore[2]); return 'lore-choice'; }
  const terr = TERRAIN_RE.exec(line);
  if (terr) { for (const n of splitNames(terr[1])) out.looseUnits.push({ name: n, heading: 'Faction Terrain' }); return 'terrain'; }
  return null;
}

/**
 * @param {string} text raw clipboard text from New Recruit
 * @returns {object} { listName, points, battlepack, faction, formation, meta,
 *                     arcaneTome, lores, regiments, warnings }
 */
export function parseArmyList(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/ /g, ' ').trimEnd());
  const out = {
    listName: '', points: null, battlepack: '', faction: '', formation: '',
    meta: {}, arcaneTome: '', lores: [], regiments: [], warnings: [],
    // battleTactics: GHB card names; loreChoices: { spell_lore, prayer_lore,
    // manifestation_lore } lore names; looseUnits: names with no points
    // (Faction Terrain, which costs nothing) for the resolver to match.
    battleTactics: [], loreChoices: {}, looseUnits: [],
  };
  if (!lines.some(l => l.trim())) {
    out.warnings.push('Nothing to import — the box was empty.');
    return out;
  }

  let i = 0;
  const nextContent = () => { while (i < lines.length && !lines[i].trim()) i++; };

  // ── Header: "<name> (<n> points) - <battlepack>"
  nextContent();
  const header = HEADER_RE.exec(lines[i]?.trim() || '');
  if (header) {
    out.listName = normalizeName(header[1]);
    out.points = parseInt(header[2], 10);
    out.battlepack = normalizeName(header[3] || '');
    i++;
  } else {
    out.warnings.push('No "<name> (N points)" header line found — list name and points limit were not set.');
  }

  // ── Army block: faction, battle formation, then "Key: value" facts. Ends
  //    at the first regiment heading or lore block.
  nextContent();
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (REGIMENT_RE.test(line) || /^arcane tome\b/i.test(line) || BULLET_RE.test(line) || UNIT_RE.test(line)) break;
    if (TACTICS_RE.test(line) || LORE_RE.test(line) || TERRAIN_RE.test(line)) break;
    const meta = META_RE.exec(line);
    if (meta) {
      out.meta[meta[1].trim()] = meta[2].trim();
    } else if (!out.faction) {
      out.faction = normalizeName(line);
    } else if (!out.formation) {
      out.formation = normalizeName(line);
    } else if (/^[A-Za-z][A-Za-z' ,\-–]+$/.test(line) && line.split(' ').length <= 8) {
      // A bare name after the formation — Faction Terrain, usually.
      out.looseUnits.push({ name: normalizeName(line), heading: '' });
    } else {
      out.warnings.push(`Ignored unrecognised line: "${line}"`);
    }
    i++;
  }

  // ── Body: lore blocks and regiments.
  let current = null;
  const openRegiment = label => {
    current = { label: normalizeName(label), units: [] };
    out.regiments.push(current);
    return current;
  };
  // Bullets belong to whatever was most recently opened — a unit if one is
  // open, otherwise the Arcane Tome block.
  let bulletTarget = null;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || FOOTER_RE.test(line)) continue;

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      const value = normalizeName(bullet[1]);
      if (bulletTarget === 'lore') { out.lores.push(value); continue; }
      if (bulletTarget === 'tactics') { out.battleTactics.push(...splitNames(value)); continue; }
      const unit = current?.units[current.units.length - 1];
      if (!unit) { out.warnings.push(`Ignored stray option: "${value}"`); continue; }
      applyUnitOption(unit, value);
      continue;
    }

    const armyLine = applyArmyLine(out, line);
    if (armyLine) { bulletTarget = armyLine === 'tactics' ? 'tactics' : null; continue; }

    if (/^arcane tome\b/i.test(line)) {
      out.arcaneTome = normalizeName(line.replace(/^arcane tome\s*[-–—:]?\s*/i, ''));
      bulletTarget = 'lore';
      continue;
    }

    if (REGIMENT_RE.test(line)) {
      // Faction Terrain under its own heading has no points to read; its
      // lines go to the resolver as loose names.
      if (/terrain/i.test(line)) { current = null; bulletTarget = 'terrain'; continue; }
      openRegiment(line); bulletTarget = 'unit'; continue;
    }

    const unitMatch = UNIT_RE.exec(line);
    if (unitMatch) {
      if (!current) openRegiment("General's Regiment");
      bulletTarget = 'unit';
      const rawName = normalizeName(unitMatch[1]);
      const anvil = ANVIL_RE.exec(rawName);
      current.units.push({
        name: anvil ? normalizeName(anvil[1]) : rawName,
        points: parseInt(unitMatch[2], 10),
        isAnvilHero: !!anvil,
        general: false,
        reinforced: false,
        modelOptions: [],
        path: null,
        pathAbilities: [],
        enhancements: [],
      });
      continue;
    }

    // A "Key: value" fact can appear after the header block too.
    const meta = META_RE.exec(line);
    if (meta) { out.meta[meta[1].trim()] = meta[2].trim(); continue; }

    // A bare name with no points — Faction Terrain (it costs nothing), with
    // or without its heading. The resolver matches it against the warscrolls
    // and only reports it if nothing fits.
    if (/^[A-Za-z][A-Za-z' ,\-–]+$/.test(line) && line.split(' ').length <= 8) {
      out.looseUnits.push({ name: normalizeName(line), heading: bulletTarget === 'terrain' ? 'Faction Terrain' : '' });
      continue;
    }

    out.warnings.push(`Ignored unrecognised line: "${line}"`);
  }

  return out;
}

// One "• ..." line under a unit. Everything that isn't a recognised flag is
// kept as an enhancement — for an ordinary unit that means its artefact or
// heroic trait; for an Anvil of Apotheosis hero it is the list of Anvil
// picks (archetype, origin, flaw, upgrades), which the Path to Glory import
// matches back against that faction's real Anvil options.
function applyUnitOption(unit, value) {
  if (/^general$/i.test(value)) { unit.general = true; return; }
  if (/^reinforced$/i.test(value)) { unit.reinforced = true; return; }

  const path = PATH_RE.exec(value);
  if (path) {
    unit.path = normalizeName(path[1]);
    unit.pathAbilities = path[2].split(',').map(normalizeName).filter(Boolean);
    return;
  }

  const model = MODEL_OPTION_RE.exec(value);
  if (model) {
    unit.modelOptions.push({ count: parseInt(model[1], 10), name: normalizeName(model[2]) });
    return;
  }

  // "Gutmaster (250)" — an Anvil archetype carries its own cost; keep the
  // name only, the points are already in the hero's total.
  const costed = /^(.+?)\s*\((\d+)\)\s*$/.exec(value);
  unit.enhancements.push(costed ? normalizeName(costed[1]) : value);
}

/**
 * Resolves the parsed names against real data.
 *
 * @param {object} parsed     result of parseArmyList
 * @param {Array}  factions   [{faction, faction_slug, grand_alliance}]
 * @param {Array}  warscrolls the candidate warscrolls to match units against
 * @returns {object} { factionSlug, roster, rosterOrder, matched, unmatched }
 *   roster is the {warscrollId: {train, reinforce}} shape the Army Builder
 *   and the Path to Glory starting-units step both already use.
 */
export function resolveArmyList(parsed, factions, warscrolls) {
  const factionSlug = matchFaction(parsed.faction, factions);
  // Indexed both ways: an exact-name hit always wins, and the
  // punctuation-stripped index is the fallback. A loose key that two
  // different warscrolls share is dropped from the fallback index rather
  // than resolving arbitrarily to whichever was seen first.
  const byName = new Map();
  const byLoose = new Map();
  const looseClashes = new Set();
  for (const w of warscrolls || []) {
    const k = nameKey(w.name);
    if (!byName.has(k)) byName.set(k, w);
    const lk = looseKey(w.name);
    if (byLoose.has(lk) && byLoose.get(lk).id !== w.id) looseClashes.add(lk);
    else byLoose.set(lk, w);
  }
  for (const lk of looseClashes) byLoose.delete(lk);

  const roster = {};
  const rosterOrder = [];
  const matched = [];
  const unmatched = [];

  for (const reg of parsed.regiments) {
    for (const unit of reg.units) {
      if (unit.isAnvilHero) { matched.push({ ...unit, warscroll: null, anvil: true, regiment: reg.label }); continue; }
      const w = byName.get(nameKey(unit.name))
        || byLoose.get(looseKey(unit.name))
        || fuzzyUnit(unit.name, byName, byLoose);
      if (!w) { unmatched.push(unit); continue; }
      const id = String(w.id);
      // The same warscroll can appear in more than one regiment; the
      // roster map counts them together the way the UI's steppers do.
      const sel = roster[id] || { train: 0, reinforce: 0 };
      if (unit.reinforced) sel.reinforce += 1; else sel.train += 1;
      roster[id] = sel;
      if (!rosterOrder.includes(id)) rosterOrder.push(id);
      matched.push({ ...unit, warscroll: w, regiment: reg.label, isAlly: !!factionSlug && w.faction_slug !== factionSlug });
    }
  }

  // Faction Terrain and other point-less lines: added when they name a real
  // warscroll, reported otherwise.
  for (const lu of parsed.looseUnits || []) {
    const w = byName.get(nameKey(lu.name)) || byLoose.get(looseKey(lu.name));
    if (!w) { unmatched.push({ name: lu.name, points: 0, loose: true }); continue; }
    const id = String(w.id);
    const sel = roster[id] || { train: 0, reinforce: 0 };
    sel.train += 1;
    roster[id] = sel;
    if (!rosterOrder.includes(id)) rosterOrder.push(id);
    matched.push({ name: lu.name, warscroll: w, regiment: lu.heading || 'Faction Terrain', isAlly: false, enhancements: [] });
  }

  return { factionSlug, roster, rosterOrder, matched, unmatched };
}

function matchFaction(name, factions) {
  if (!name) return null;
  const k = nameKey(name);
  const exact = (factions || []).find(f => nameKey(f.faction) === k || nameKey(f.faction_slug) === k);
  if (exact) return exact.faction_slug;
  const slugged = k.replace(/[^a-z0-9]+/g, '-');
  return (factions || []).find(f => f.faction_slug === slugged)?.faction_slug || null;
}

// New Recruit occasionally names a unit slightly differently from Wahapedia
// (a trailing weapon option, "with ...", a plural). Falls back to a unique
// prefix match before giving up — never an ambiguous one, since silently
// importing the wrong warscroll is worse than reporting it unmatched.
function fuzzyUnit(name, byName, byLoose) {
  const k = looseKey(name);
  const stripped = k.replace(/\s+with\s+.*$/, '').trim();
  if (stripped !== k && byLoose.has(stripped)) return byLoose.get(stripped);
  const candidates = [...byLoose.keys()].filter(key => key.startsWith(k) || k.startsWith(key));
  return candidates.length === 1 ? byLoose.get(candidates[0]) : null;
}
