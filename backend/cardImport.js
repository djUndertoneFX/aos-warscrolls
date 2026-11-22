// Turns the text of a "warscroll cards" army printout (New Recruit's card
// view printed to PDF, read back by OCR in the browser) into the plain-text
// list format the import parser already understands (frontend/src/importList.js).
//
// A card printout has no roster block: no regiments, points or unit sizes.
// What it does have is one card per unit, each with a title, a weapon table
// ("Warhammer (x4)") and named abilities. So each card is identified by
// scoring it against the faction's warscrolls on all three — the title alone
// is not enough, because OCR regularly drops or garbles the spaced small-caps
// titles (it read "LIBERATORS" as nothing at all on the first sample) — and
// the model count comes from the weapon multipliers.

const loreNames = require('./data/aos-lore-names.json');

const compact = s => String(s || '')
  .toLowerCase()
  .replace(/[‐-―−]/g, '-')
  .replace(/[^a-z0-9]+/g, '');

// OCR runs two-column card layouts together ("SUMMON DAIS ARCANUM
// LIGHTNING BLAST"), so a long name may sit anywhere in a line; a short one
// must start or end it, or be all of it, to avoid matching inside prose.
const lineHas = (key, name) => key === name || (name.length >= 8
  ? key.includes(name)
  : (name.length >= 4 && (key.startsWith(name) || key.endsWith(name))));

const titleCase = s => String(s || '').toLowerCase()
  .replace(/(^|[\s\-(])([a-z])/g, (m, p, c) => p + c.toUpperCase())
  .replace(/\b(Of|The|And|In|On|With|A|An|To|For)\b/g, (m, w, off) => (off === 0 ? w : w.toLowerCase()));

const parseJson = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };

// A new card starts at its stat block ("MOVE / HEALTH" for units,
// "HEALTH / BANISHMENT" for manifestations) or at a section heading.
const STAT_RE = /^\s*(move|health)\b/i;
const SECTION_RE = /^\s*(battle traits?\b|battle formation\b|arcane tome\b|heroic traits?\b|artefacts?\b|spell lore\b|prayer lore\b|manifestation lore\b|regiments? of renown\b)/i;
const MULT_RE = /\(\s*[x×]\s*(\d+)\s*\)/i;

function segmentCards(lines) {
  const segs = [];
  let cur = null;
  let sinceStart = 99;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const section = SECTION_RE.exec(line);
    if (section || (STAT_RE.test(line) && sinceStart > 6)) {
      cur = { kind: section ? section[1].toLowerCase().replace(/\s+/g, ' ') : 'unit', lines: [] };
      segs.push(cur);
      sinceStart = 0;
    }
    if (!cur) { cur = { kind: 'preamble', lines: [] }; segs.push(cur); }
    cur.lines.push(line);
    sinceStart++;
  }
  return segs;
}

function lineKeys(seg) {
  const keys = seg.lines.map(compact).filter(Boolean);
  // Titles wrap ("ANVIL OF APOTHEOSIS: STORMCAST / ETERNALS HERO"), so the
  // first lines are also tried in joined pairs.
  const head = keys.slice(0, 14);
  const titles = new Set(head);
  for (let i = 0; i + 1 < head.length; i++) titles.add(head[i] + head[i + 1]);
  return { keys, titles };
}

function scoreWarscroll(w, seg, lk) {
  const name = compact(w.name);
  if (!name) return 0;
  let score = 0;
  if (lk.titles.has(name)) score += 20;
  else if (name.length >= 6 && [...lk.titles].some(t => t.includes(name))) score += 8;
  for (const wp of w._weapons) {
    const wn = compact(wp.name);
    if (wn.length >= 4 && lk.keys.some(k => k.startsWith(wn))) score += 4;
  }
  for (const ab of w._abilities) {
    const an = compact(ab.name);
    if (an.length >= 5 && lk.keys.some(k => k.includes(an))) score += 3;
  }
  return score;
}

// Models in the unit: each weapon line counts its "(xN)" (or 1), summed per
// weapon type; the unit is as big as its bigger table.
function modelCount(w, seg) {
  const sums = {};
  for (const line of seg.lines) {
    const k = compact(line);
    const wp = w._weapons.find(x => compact(x.name).length >= 4 && k.startsWith(compact(x.name)));
    if (!wp) continue;
    const m = MULT_RE.exec(line);
    sums[wp.type || 'x'] = (sums[wp.type || 'x'] || 0) + (m ? parseInt(m[1], 10) : 1);
  }
  const vals = Object.values(sums);
  return vals.length ? Math.max(...vals) : null;
}

function cardsToList(db, { pages = [], title = '' } = {}) {
  const text = pages.join('\n');
  const lines = text.split(/\r?\n/);
  const segs = segmentCards(lines);
  const notes = [];

  const factions = db.prepare('SELECT DISTINCT faction, faction_slug FROM warscrolls').all();
  let factionSlug = null;
  const traits = /battle traits?\s*:\s*(.+)/i.exec(text);
  if (traits) {
    const k = compact(traits[1]);
    factionSlug = (factions.find(f => compact(f.faction) === k) || factions.find(f => k.startsWith(compact(f.faction)) && compact(f.faction).length > 4))?.faction_slug || null;
  }

  const load = rows => rows.map(w => ({ ...w, _weapons: parseJson(w.weapons, []), _abilities: parseJson(w.abilities, []) }));
  const all = load(db.prepare('SELECT id, name, faction, faction_slug, unit_size, points, weapons, abilities, is_manifestation, is_legends FROM warscrolls').all());

  // Identify unit cards. The faction's own warscrolls are tried first; a
  // card that fits none of them is tried against everything (allies,
  // Regiments of Renown, universal manifestations).
  const found = [];
  const unitSegs = segs.filter(s => s.kind === 'unit');
  const bestOf = (cands, seg, lk) => {
    let best = null, bestScore = 0, tie = false;
    for (const w of cands) {
      const sc = scoreWarscroll(w, seg, lk) - (w.is_legends ? 1 : 0);
      if (sc > bestScore) { best = w; bestScore = sc; tie = false; }
      else if (sc === bestScore && sc > 0 && best && compact(best.name) !== compact(w.name)) tie = true;
    }
    return { best, bestScore, tie };
  };
  for (const seg of unitSegs) {
    const lk = lineKeys(seg);
    if ([...lk.titles].some(t => t.includes('anvilofapotheosis'))) {
      found.push({ seg, anvil: true });
      continue;
    }
    let pool = factionSlug ? all.filter(w => w.faction_slug === factionSlug) : all;
    let r = bestOf(pool, seg, lk);
    if ((!r.best || r.bestScore < 7) && factionSlug) r = bestOf(all, seg, lk);
    if (!r.best || r.bestScore < 7 || r.tie) {
      // An unnamed manifestation card ("HEALTH / BANISHMENT") doesn't matter:
      // manifestations come with the lore, not the roster.
      if (seg.lines.slice(0, 6).some(l => /banishment/i.test(l))) continue;
      const guess = seg.lines.slice(0, 8).find(l => /^[A-Z][A-Z' \-]{3,}$/.test(l) && !/^(MOVE|HEALTH|SAVE|CONTROL|BANISHMENT)\b/.test(l));
      notes.push(`Couldn't identify a card${guess ? ` titled "${titleCase(guess)}"` : ''} — add it by hand if it's part of the list.`);
      continue;
    }
    found.push({ seg, w: r.best });
  }

  // The faction, when the printout had no Battle Traits page: whichever the
  // identified units mostly belong to.
  if (!factionSlug) {
    const counts = {};
    for (const f of found) if (f.w && !f.w.is_manifestation) counts[f.w.faction_slug] = (counts[f.w.faction_slug] || 0) + 1;
    factionSlug = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  const factionName = factions.find(f => f.faction_slug === factionSlug)?.faction || '';

  // Battle formation: the ability names on the Battle Formation page.
  let formation = '';
  if (factionSlug) {
    const forms = db.prepare('SELECT formation_name, name FROM faction_battle_formations WHERE faction_slug = ?').all(factionSlug);
    const formSegs = segs.filter(s => s.kind === 'battle formation');
    const keys = (formSegs.length ? formSegs : segs).flatMap(s => s.lines.map(compact));
    const hit = forms.find(f => compact(f.name).length >= 5 && keys.some(k => k.includes(compact(f.name))));
    formation = hit?.formation_name || '';
  }

  // Heroic traits / artefacts printed as abilities on a hero's card.
  const enhancements = factionSlug
    ? db.prepare("SELECT section, name FROM faction_extra_rules WHERE faction_slug = ? AND section IN ('heroic_traits','artefacts')").all(factionSlug)
    : [];

  // Spells and prayers named anywhere (the Arcane Tome page, mostly).
  const lores = { spell_lore: null, prayer_lore: null, manifestation_lore: null };
  const spellsFound = [];
  const allKeys = segs.flatMap(s => s.lines.map(compact));
  const factionLores = (loreNames.lores || {})[factionSlug] || {};
  const universal = (loreNames.lores || {})['endless-spells'] || {};
  for (const [kind, list] of [...Object.entries(factionLores), ...Object.entries(universal)]) {
    for (const lore of list || []) {
      const hits = (lore.spells || []).filter(sp => allKeys.some(k => lineHas(k, compact(sp))));
      if (!hits.length) continue;
      spellsFound.push(...hits);
      if (!lores[kind] || hits.length > lores[kind].hits) lores[kind] = { name: lore.lore, hits: hits.length };
    }
  }

  // Anvil of Apotheosis picks: option names that appear as an ability or
  // weapon on the hero's card, plus its Chamber-style keyword.
  const anvilOpts = factionSlug
    ? db.prepare('SELECT step_number, name FROM faction_apotheosis_options WHERE faction_slug = ? AND step_number >= 2').all(factionSlug)
    : [];

  const out = [];
  const listName = String(title || '').replace(/\s*[-–—]\s*new recruit\s*$/i, '').trim() || 'Imported list';
  const unitLines = [];
  let total = 0;
  let anvilDone = false;
  for (const f of found) {
    const keys = f.seg.lines.map(compact);
    const enh = enhancements.filter(e => compact(e.name).length >= 5 && keys.some(k => k.includes(compact(e.name)))).map(e => titleCase(e.name));
    if (f.anvil) {
      if (anvilDone) continue;
      anvilDone = true;
      const keywordsLine = f.seg.lines.filter(l => /keywords/i.test(l)).join(' ').toLowerCase();
      const picks = [];
      for (const o of anvilOpts) {
        const n = compact(o.name);
        if (n.length < 4) continue;
        const onCard = keys.some(k => lineHas(k, n));
        const asKeyword = keywordsLine.includes(o.name.toLowerCase());
        if ((onCard || asKeyword) && !picks.includes(o.name)) picks.push(o.name);
      }
      // New Recruit always names it "<Faction> Hero"; the printed title
      // wraps mid-name, so it is rebuilt rather than read.
      const full = factionName ? `${factionName} Hero` : 'Hero';
      unitLines.unshift([`Anvil of Apotheosis: ${full} (0)`, '• General', ...picks.map(p => `• ${titleCase(p)}`), ...enh.map(e => `• ${e}`)]);
      notes.push('Anvil hero: archetype (Knight/Templar/Lord) and Path aren\'t on the card — set them in the wizard.');
      continue;
    }
    const w = f.w;
    // Manifestations come with the Manifestation Lore, not the roster.
    if (w.is_manifestation) continue;
    const size = parseInt(w.unit_size, 10) || 0;
    const models = modelCount(w, f.seg);
    const reinforced = !!(size > 1 && models && models >= size * 2);
    const pts = (parseInt(w.points, 10) || 0) * (reinforced ? 2 : 1);
    total += pts;
    const titleLine = f.seg.lines.slice(0, 14).find(l => compact(l) === compact(w.name));
    const name = titleLine ? titleCase(titleLine) : titleCase(w.name);
    unitLines.push([`${name} (${pts})`, ...(reinforced ? ['• Reinforced'] : []), ...enh.map(e => `• ${e}`)]);
  }

  out.push(`${listName} (${total} points) - ${anvilDone ? 'Path to Glory' : 'Imported from PDF'}`, '');
  if (factionName) out.push(factionName);
  if (formation) out.push(formation);
  out.push('');
  if (lores.spell_lore) out.push(`Spell Lore - ${lores.spell_lore.name}`);
  if (lores.prayer_lore) out.push(`Prayer Lore - ${lores.prayer_lore.name}`);
  if (lores.manifestation_lore) out.push(`Manifestation Lore - ${lores.manifestation_lore.name}`);
  const tome = [...new Set(spellsFound)];
  if (anvilDone && tome.length) {
    out.push(`Arcane Tome - ${titleCase(tome[0])}`);
    for (const s of tome.slice(1)) out.push(`• ${titleCase(s)}`);
  }
  out.push('', "General's Regiment");
  for (const u of unitLines) out.push(...u);

  if (!factionName) notes.push('Couldn\'t tell which faction this is.');
  notes.unshift('Read from a warscroll-card printout: there are no regiments in it, so every unit is put in one regiment. Check sizes and points before importing.');
  return { text: out.join('\n'), notes, units: found.length };
}

module.exports = { cardsToList, segmentCards };
