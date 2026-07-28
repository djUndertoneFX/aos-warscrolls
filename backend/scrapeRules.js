const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { getDb, initDb } = require('./db');

const BASE_URL = process.env.AOS_DATA_SRC || 'https://waha' + 'pedia.ru/aos4/factions';

const FACTIONS = [
  { slug: 'stormcast-eternals',    name: 'Stormcast Eternals',   alliance: 'Order' },
  { slug: 'cities-of-sigmar',      name: 'Cities of Sigmar',     alliance: 'Order' },
  { slug: 'daughters-of-khaine',   name: 'Daughters of Khaine',  alliance: 'Order' },
  { slug: 'fyreslayers',           name: 'Fyreslayers',           alliance: 'Order' },
  { slug: 'idoneth-deepkin',       name: 'Idoneth Deepkin',       alliance: 'Order' },
  { slug: 'kharadron-overlords',   name: 'Kharadron Overlords',   alliance: 'Order' },
  { slug: 'lumineth-realm-lords',  name: 'Lumineth Realm-lords',  alliance: 'Order' },
  { slug: 'seraphon',              name: 'Seraphon',              alliance: 'Order' },
  { slug: 'sylvaneth',             name: 'Sylvaneth',             alliance: 'Order' },
  { slug: 'blades-of-khorne',      name: 'Blades of Khorne',      alliance: 'Chaos' },
  { slug: 'disciples-of-tzeentch', name: 'Disciples of Tzeentch', alliance: 'Chaos' },
  { slug: 'hedonites-of-slaanesh', name: 'Hedonites of Slaanesh', alliance: 'Chaos' },
  { slug: 'maggotkin-of-nurgle',   name: 'Maggotkin of Nurgle',   alliance: 'Chaos' },
  { slug: 'skaven',                name: 'Skaven',                alliance: 'Chaos' },
  { slug: 'slaves-to-darkness',    name: 'Slaves to Darkness',    alliance: 'Chaos' },
  { slug: 'helsmiths-of-hashut',   name: 'Helsmiths of Hashut',   alliance: 'Chaos' },
  { slug: 'flesh-eater-courts',    name: 'Flesh-eater Courts',    alliance: 'Death' },
  { slug: 'nighthaunt',            name: 'Nighthaunt',            alliance: 'Death' },
  { slug: 'ossiarch-bonereapers',  name: 'Ossiarch Bonereapers',  alliance: 'Death' },
  { slug: 'soulblight-gravelords', name: 'Soulblight Gravelords', alliance: 'Death' },
  { slug: 'gloomspite-gitz',       name: 'Gloomspite Gitz',       alliance: 'Destruction' },
  { slug: 'ironjawz',              name: 'Ironjawz',              alliance: 'Destruction' },
  { slug: 'kruleboyz',             name: 'Kruleboyz',             alliance: 'Destruction' },
  { slug: 'ogor-mawtribes',        name: 'Ogor Mawtribes',        alliance: 'Destruction' },
  { slug: 'sons-of-behemat',       name: 'Sons of Behemat',       alliance: 'Destruction' },
];

const HOMOGLYPH_MAP = {
  'А':'A','В':'B','Е':'E','К':'K','М':'M',
  'Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X',
  'а':'a','е':'e','о':'o','р':'p','с':'c','у':'u','х':'x',
  'Α':'A','Ε':'E','Ο':'O','Ρ':'P',
  'α':'a','ε':'e','ο':'o','ρ':'p','υ':'u',
  'ɑ':'a','ᴀ':'A','ɡ':'g',
  '‘':"'",'’':"'",'“':'"','”':'"',
  '–':'-','—':'-',
};

function normalizeText(str) {
  return str
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/./gu, ch => HOMOGLYPH_MAP[ch] != null ? HOMOGLYPH_MAP[ch] : ch)
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[\s]+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseAbilityBlock($, block, skipNestGuard = false) {
  // Skip nested blocks. Callers that already bound their own top-level-card
  // search to a local scope (rather than the whole page) pass skipNestGuard
  // — otherwise this unbounded check rejects every card that merely has
  // unrelated BreakInsideAvoid ancestors further up the page.
  if (!skipNestGuard && $(block).parents('.BreakInsideAvoid').length > 0) return null;

  const abBody = $(block).find('.abBody').first();
  if (!abBody.length) return null;

  const timing = normalizeText(
    $(block).find('.abHeader').first().clone().find('img').remove().end().text()
  );

  // Clone body to avoid mutating the DOM for name extraction
  const nameEl = abBody.find('b').first();
  const rawName = nameEl.clone().find('.ShowFluff').remove().end().text().replace(/:/g, '').trim();
  const name = normalizeText(rawName);
  if (!name || name === 'Effect' || name === 'KEYWORDS' || name === 'Declare') return null;

  // Capture flavour text before stripping it
  const loreText = normalizeText(abBody.find('.ShowFluff.legend4').text());

  // Convert block elements to newlines for text extraction
  const bodyClone = abBody.clone();
  bodyClone.find('.ShowFluff.legend4').remove();
  bodyClone.find('li').each((_, li) => {
    $(li).replaceWith('\n• ' + $(li).text().trim());
  });
  bodyClone.find('p, br, div').each((_, node) => {
    $(node).replaceWith('\n' + $(node).text());
  });

  // Trailing prose that follows a <ul> list (a sibling text node, not its own
  // <li>/<p>/<br>/<div>) gets no newline/space from the block-element pass
  // above and runs straight into the last list item's text with no
  // separator at all — same "missing space after . or :" gap fixed for
  // intro_text in scrapePathToGlory.js, applied here too since every ability
  // card site-wide goes through this parser.
  const bodyText = bodyClone.text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([.:])(?=[A-Z])/g, '$1 ')
    .trim();

  const declareMatch = bodyText.match(/Declare:\s*([\s\S]+?)(?=\n*Effect:)/i);
  const effectBlock  = bodyText.match(/Effect:\s*([\s\S]+)/i);

  let effectIntro = '';
  const bullets = [];
  if (effectBlock) {
    const lines = effectBlock[1].split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('•')) {
        bullets.push(line.slice(1).trim());
      } else if (!bullets.length) {
        effectIntro = effectIntro ? effectIntro + ' ' + line : line;
      }
    }
  }

  const keywords = $(block).find('.abKeywordsBodyText').text().trim();

  // Spell/prayer/manifestation-lore abilities carry a casting value (the 2D6
  // target number) in a small badge in the header's corner — not part of the
  // declare/effect text at all, so it needs its own selector.
  const castingValue = normalizeText($(block).find('.abSpellPointsN').first().text()) || null;

  return {
    name,
    timing,
    declare: declareMatch ? normalizeText(declareMatch[1]) : '',
    effect:  normalizeText(effectIntro),
    bullets: JSON.stringify(bullets.map(b => normalizeText(b))),
    keywords: normalizeText(keywords),
    lore_text: loreText || null,
    casting_value: castingValue,
  };
}

// Collect all .BreakInsideAvoid blocks that belong to a section identified by
// an h2.outline_header3 whose text matches sectionTitle. Returns an array of
// { formationName, block } pairs.
//
// Each formation's <h3 class="h2_pge"> sub-heading is NESTED INSIDE the same
// outer .BreakInsideAvoid wrapper as its own ability content (wrapper > a[name]
// + h3 + nested .BreakInsideAvoid-with-abBody), not a preceding sibling. Using
// "whichever h3 was last seen while walking in document order" therefore always
// tags a block with the PREVIOUS formation's name, since the outer wrapper
// itself (which is what gets scraped as the ability block) is visited before
// its own child h3 is. Confirmed by re-fetching Idoneth Deepkin live and diffing
// against the DB: every formation_name was shifted back by one (Namarti Corps'
// row held Isharann Council's ability text, etc). Fixed by reading each block's
// OWN nested h3 directly instead of tracking traversal-order state — see
// feedback_scraper_formation_name_offbyone memory.
// Wahapedia marks a formation's h3 sub-heading with an <img class="tooltip">
// whose title reads e.g. "Expansion. Scourge of Ghyran - Idoneth Deepkin (4th
// edition)" when that formation comes from a supplement rather than the core
// battletome — core formations have no such image. Confirmed by inspecting
// live HTML across 6 factions: every faction's first N formations (its "core"
// set) carry no marker, every formation after that does, always tagged
// "Expansion. Scourge of Ghyran - ..." (or, for Stormcast, "Supplement.
// Battletome Supplement: Stormcast Eternals"). Strips the leading
// "Expansion. "/"Supplement. " and any "(4th edition)" suffix so the UI can
// show a short label, e.g. "Scourge of Ghyran".
function extractSourceNote($el) {
  const title = $el.find('h3.h2_pge img.tooltip').first().attr('title');
  if (!title) return null;
  return title
    .replace(/^(Expansion|Supplement)\.\s*/i, '')
    .replace(/\s*\(\d\w{0,2} edition\)\s*$/i, '')
    // Book titles are formatted "{Book Name} - {Faction Name}" — the faction
    // name is redundant with whichever faction's page you're already on.
    // Strip from the FIRST " - " onward (not "trailing non-hyphen run"):
    // two real faction names (Flesh-eater Courts, Lumineth Realm-lords)
    // contain their own internal hyphen, which a trailing-run match instead
    // cuts mid-name (e.g. "Scourge of Aqshy - Flesh-Eater Courts" ->
    // "Scourge of Aqshy - Flesh"). Confirmed no book name itself contains
    // " - " for either Expansion or Supplement titles across all 24
    // factions' live HTML, so the first occurrence is always the separator.
    .replace(/\s+-\s+.*$/, '')
    .trim() || null;
}

// Most top-level .BreakInsideAvoid blocks under a section heading wrap
// exactly one ability (one .abBody) — the common case. Idoneth Deepkin's
// Battle Traits are a confirmed exception: their "Tides" mechanic groups 3
// abilities under a shared label div (class contains "title", e.g.
// class="tide-title sea") with NO h3, one such group per column. Scraping
// only the top-level block's FIRST nested .abBody (the old behaviour)
// silently dropped the other two abilities per group. Spot-checked 5 other
// factions' Battle Traits (Stormcast, Nighthaunt, Kruleboyz, Slaves to
// Darkness, Ogor Mawtribes) — all had exactly 1 abBody per top-level block,
// so this appears to be Idoneth-specific flavour, but the fix below is
// general: any top-level block containing 2+ .abBody elements is expanded
// into one result per direct nested .BreakInsideAvoid child, grouped under
// the block's own "*title*"-class label (if any) instead of an h3.
// Flat sections (Heroic Traits/Artefacts/Spell/Prayer/Manifestation Lore)
// can ALSO carry named "themed sub-group" headers — e.g. Idoneth Deepkin's
// Heroic Traits has "Champions of the Tides" (core) and, tagged with an
// Expansion img.tooltip, a SECOND "Champions of the Tides" (Scourge of
// Aqshy) plus "Leaders of the Raid" (Scourge of Ghyran). Unlike Battle
// Formations' h3 (nested INSIDE its own ability wrapper, see extractSourceNote
// above), these h3s are a PRECEDING SIBLING of a plain <div class="Columns2">
// containing: a .PitchedBattleProfile summary table (name/points list, no
// ability content) followed by that group's actual ability blocks. A per-
// block descendant search (extractSourceNote) can never find a preceding
// sibling, which is why every ability in these groups previously scraped
// with source_note=null regardless of season — confirmed live on Idoneth
// (Abyssal Dweller/Adherent of Kir-Nadarr under the Aqshy-tagged group,
// Lord of Storm and Sea/Merciless Raider under the Ghyran-tagged one, all
// silently untagged). Tracked here as "last top-level h3.h2_pge seen, plus
// its member-name list read straight off the summary table" so it can be
// applied FORWARD to the blocks that follow, bounded by exact name match
// (not mere adjacency) so it can never bleed into a later ungrouped item.
function extractH3Marker($el) {
  const title = $el.find('img.tooltip').first().attr('title');
  const name = normalizeText($el.text()) || null;
  if (!title) return { name, sourceNote: null };
  const sourceNote = title
    .replace(/^(Expansion|Supplement)\.\s*/i, '')
    .replace(/\s*\(\d\w{0,2} edition\)\s*$/i, '')
    .replace(/\s+-\s+.*$/, '')
    .trim() || null;
  return { name, sourceNote };
}

function collectSectionBlocks($, html, sectionTitle) {
  const results = []; // { formationName, sourceNote, block, skipNestGuard }
  let inSection = false;
  let pendingGroup = null; // { name, sourceNote, members: Set<UPPER NAME> } | null
  // A section-level source note (e.g. Cities of Sigmar's "Decorations for
  // Valour" h2 itself carries "Expansion. Scourge of Aqshy - ..."), distinct
  // from a per-item preceding-sibling h3 (pendingGroup above) — some dynamic
  // extra sections (see findExtraSectionTitles/scrapeFactionRules) mark the
  // WHOLE section as one flat group with no further per-item h3 at all, so
  // every item needs to inherit this instead.
  let sectionSourceNote = null;

  // Any h2 ends the current section, not just h2.outline_header3 — some
  // factions (confirmed: Helsmiths of Hashut, Skaven) follow the standard
  // Battle Traits/Heroic Traits/.../Prayer Lore run with sub-army sections
  // (e.g. "Taar's Grand Forgehost") that reuse those same h3 sub-heading
  // names but sit under a plain h2.outline_header, not outline_header3. The
  // old selector never matched those headers, so inSection stayed true and
  // leaked all of that sub-army's content into whichever top-level section
  // happened to be scraped last (observed: everything after "Prayer Lore"
  // through the Path to Glory/Spearhead headers got mislabeled prayer_lore).
  $('h2, h3.h2_pge, div.datasheet, div.BreakInsideAvoid').each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const $el = $(el);

    if (tag === 'h2') {
      const text = normalizeText($el.text());
      inSection = text === sectionTitle;
      pendingGroup = null;
      sectionSourceNote = inSection ? extractH3Marker($el).sourceNote : null;
      return;
    }

    if (!inSection) return;

    // A datasheet block means we've entered the warscroll units section — stop.
    if ($el.hasClass('datasheet')) { inSection = false; pendingGroup = null; return; }

    if (tag === 'h3') {
      // A formation/grouped-trait h3 nested inside its own ability wrapper is
      // already handled by that wrapper's own descendant search — only a
      // genuine preceding-sibling h3 (no BreakInsideAvoid ancestor) starts a
      // new pending group.
      if ($el.parents('.BreakInsideAvoid').length > 0) return;
      pendingGroup = { ...extractH3Marker($el), members: new Set() };
      return;
    }

    if ($el.hasClass('BreakInsideAvoid')) {
      if ($el.parents('.BreakInsideAvoid').length > 0) return;
      if ($el.parents('.datasheet').length > 0) return; // nested inside a warscroll

      // The summary table (name + points, no ability content) that follows a
      // pending group's h3 — capture its member names, don't emit a result.
      if (pendingGroup && $el.hasClass('PitchedBattleProfile')) {
        $el.find('.ShowBaseSize tr td:first-child').each((__, td) => {
          const n = normalizeText($(td).text()).toUpperCase();
          if (n && n !== 'NAME') pendingGroup.members.add(n);
        });
        return;
      }

      const abBodyCount = $el.find('.abBody').length;
      if (abBodyCount > 1) {
        const groupName = normalizeText($el.children('[class*="title"]').first().text()) || null;
        $el.children('.BreakInsideAvoid').each((__, child) => {
          const $child = $(child);
          if ($child.find('.abBody').length >= 1) {
            results.push({ formationName: groupName, sourceNote: null, block: child, skipNestGuard: true, pendingGroup, sectionSourceNote });
          }
        });
        return;
      }

      const formationName = normalizeText($el.find('h3.h2_pge').first().text());
      const sourceNote = extractSourceNote($el);
      results.push({ formationName, sourceNote, block: el, skipNestGuard: false, pendingGroup, sectionSourceNote });
    }
  });

  return results;
}

// Scrape all BreakInsideAvoid blocks under a heading, grouped by h3 sub-headings
function scrapeSection($, sectionTitle, factionSlug, factionName) {
  const results = [];
  for (const { formationName: groupName, sourceNote, block, skipNestGuard, pendingGroup, sectionSourceNote } of collectSectionBlocks($, null, sectionTitle)) {
    const ability = parseAbilityBlock($, block, skipNestGuard);
    if (!ability) continue;
    // Fall back chain: (1) the block's own descendant h3 (Battle Formations'
    // nested pattern), (2) a pending preceding-sibling h3 group's sourceNote,
    // ONLY when this block's own name is one of that group's captured
    // members — an exact match, not mere adjacency, so a later ungrouped
    // item can never inherit a stale group's tag — (3) the section's own h2-
    // level marker (e.g. Cities of Sigmar's "Decorations for Valour" h2
    // itself carries the Expansion tooltip, with no further per-item h3 at
    // all). Deliberately NOT propagating pendingGroup.name into group_name:
    // Wahapedia reuses the identical sub-group name across editions
    // (Idoneth's core "Champions of the Tides" and its Scourge of Aqshy
    // "Champions of the Tides" are two distinct member sets under the same
    // text) — group_name is read elsewhere (FactionTraitsSlide) as a
    // display-grouping key, and colliding two same-named-but-different
    // groups into one column would wrongly merge them.
    let finalGroupName = groupName || null;
    let finalSourceNote = sourceNote;
    if (!finalSourceNote && pendingGroup && pendingGroup.members.has(ability.name.toUpperCase())) {
      finalSourceNote = pendingGroup.sourceNote;
    }
    if (!finalSourceNote) finalSourceNote = sectionSourceNote;
    results.push({ ...ability, faction_slug: factionSlug, faction_name: factionName, group_name: finalGroupName, source_note: finalSourceNote });
  }
  return results;
}

// Wahapedia can publish EXTRA h2.outline_header3 sections beyond the 5 fixed
// ones scrapeFactionRules already knows by name, under a faction/supplement-
// specific title that can't be hardcoded — confirmed on Cities of Sigmar:
// "Ironweld Innovations" (battletome mechanic) and "Decorations for Valour"
// (a Scourge of Aqshy non-Hero enhancement table, h2 itself carrying the
// Expansion marker). These were previously invisible to the whole scraper —
// scrapeSection only ever gets called with one of the 5 known titles, so an
// unknown h2 boundary just never became `inSection` for anything. Found via
// a user-provided PDF cross-check: several factions' Scourge of Aqshy non-
// Hero enhancement tables (e.g. "Monstrous Traits", "Brands of the Dark
// Gods", "Noble Pursuits") were entirely missing from the DB for exactly
// this reason. Returns each such title in document order so the caller can
// scrapeSection() each one generically — the same collectSectionBlocks
// machinery already handles arbitrary section titles, h3 sub-grouping, and
// section-level source notes without any title-specific code.
const KNOWN_SECTION_TITLES = new Set([
  'Battle Traits', 'Battle Formations', 'Heroic Traits', 'Artefacts of Power',
  'Spell Lore', 'Prayer Lore', 'Manifestation Lore',
]);
function findExtraSectionTitles($) {
  const titles = [];
  $('h2.outline_header3').each((_, el) => {
    const title = normalizeText($(el).text());
    if (title && !KNOWN_SECTION_TITLES.has(title) && !titles.includes(title)) titles.push(title);
  });
  return titles;
}

// ── Phase-colour detection for ambiguous-timing abilities ────────────────
// Battle Formations are always headed "Passive" on Wahapedia (they're
// permanent bonuses, not phase-triggered) — and it turns out Battle Traits/
// Heroic Traits/Artefacts/Lores have the exact same issue for any entry
// that's genuinely Passive/Reaction/bare-Once-Per-X (confirmed: several
// Idoneth artefacts modify combat rolls but were rendering as plain
// uncoloured Passive cards, since only formations ever got this treatment
// before). The printed books still colour-code these cards by the phase
// their effect is thematically tied to (confirmed against known Idoneth
// examples across all these categories — see backend/phaseKey.js's own
// header comment and MANUAL_OVERRIDES for the specific confirmed cases).
// Shared with scraper.js (unit abilities) so the same detection applies
// everywhere an ability can show up, not just here.
const { isAmbiguousTiming, literalPhaseFromTiming, resolvePhaseKeyString } = require('./phaseKey');

async function scrapeFactionRules(faction) {
  const url = `${BASE_URL}/${faction.slug}/`;
  console.log(`  Fetching: ${url}`);

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 20000,
    });
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} for ${faction.name}, skipping.`);
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.warn(`  Error fetching ${faction.name}: ${err.message}`);
    return null;
  }

  const $ = cheerio.load(html);
  const s = faction.slug, n = faction.name;

  // Battle Traits — group_name is usually null (most traits stand alone), but
  // some factions (confirmed: Idoneth Deepkin's "Tides" traits) group several
  // traits under a shared column-header label instead of an h3 — see
  // collectSectionBlocks' multi-abBody expansion.
  const traits = scrapeSection($, 'Battle Traits', s, n);

  // Battle Formations — keep group_name as formation_name for the existing table shape
  const formations = scrapeSection($, 'Battle Formations', s, n)
    .map(a => ({ ...a, formation_name: a.group_name || 'General', group_name: undefined }));

  // Extra sections → faction_extra_rules table
  const heroicTraits       = scrapeSection($, 'Heroic Traits',       s, n).map(a => ({ ...a, section: 'heroic_traits' }));
  const artefacts          = scrapeSection($, 'Artefacts of Power',  s, n).map(a => ({ ...a, section: 'artefacts' }));
  const spellLore          = scrapeSection($, 'Spell Lore',          s, n).map(a => ({ ...a, section: 'spell_lore' }));
  const prayerLore         = scrapeSection($, 'Prayer Lore',         s, n).map(a => ({ ...a, section: 'prayer_lore' }));
  const manifestationLore  = scrapeSection($, 'Manifestation Lore',  s, n).map(a => ({ ...a, section: 'manifestation_lore' }));

  // Any further h2.outline_header3 section beyond the 5 known ones above —
  // faction/supplement-specific tables (a Scourge of Aqshy/Ghyran non-Hero
  // enhancement table, a battletome-unique mechanic, a White Dwarf
  // supplement, etc.) with no fixed name to hardcode. group_name carries the
  // section's own heading text so the frontend can render each one under
  // its real printed name instead of a generic bucket.
  const otherSections = findExtraSectionTitles($).flatMap(title =>
    scrapeSection($, title, s, n).map(a => ({ ...a, section: 'other', group_name: title }))
  );

  const extraRules = [...heroicTraits, ...artefacts, ...spellLore, ...prayerLore, ...manifestationLore, ...otherSections];

  // Resolve each ambiguous-timing ability's thematic phase colour — needs
  // every category already scraped so a quoted ability-name reference (e.g.
  // "the 'Unpredictable Tide' ability") can be looked up by name regardless
  // of which section it actually lives in.
  const nameToTiming = new Map();
  for (const a of [...traits, ...formations, ...extraRules]) {
    if (a.name) nameToTiming.set(a.name.toUpperCase(), a.timing);
  }
  const resolveFor = (item, table, section) => {
    if (!isAmbiguousTiming(item.timing)) { item.phase_key = null; return; }
    item.phase_key = resolvePhaseKeyString(item, { nameToTiming, factionSlug: s, table, section });
  };
  for (const t of traits)      resolveFor(t, 'traits');
  for (const f of formations)  resolveFor(f, 'formations');
  for (const e of extraRules)  resolveFor(e, 'extra_rules', e.section);

  console.log(
    `  ${n}: ${traits.length} traits, ${formations.length} formations,` +
    ` ${heroicTraits.length} heroic, ${artefacts.length} artefacts,` +
    ` ${spellLore.length} spell, ${prayerLore.length} prayer, ${manifestationLore.length} manifestation`
  );
  return { traits, formations, extraRules };
}

async function scrapeAllRules(targetSlug = null) {
  initDb();
  const db = getDb();

  const factionsToScrape = targetSlug
    ? FACTIONS.filter(f => f.slug === targetSlug)
    : FACTIONS;

  if (!factionsToScrape.length) {
    console.error(`Unknown faction slug: ${targetSlug}`);
    db.close();
    return;
  }

  if (targetSlug) {
    db.prepare('DELETE FROM faction_battle_traits WHERE faction_slug = ?').run(targetSlug);
    db.prepare('DELETE FROM faction_battle_formations WHERE faction_slug = ?').run(targetSlug);
    db.prepare('DELETE FROM faction_extra_rules WHERE faction_slug = ?').run(targetSlug);
    console.log(`Patching rules for: ${factionsToScrape[0].name}\n`);
  } else {
    db.prepare('DELETE FROM faction_battle_traits').run();
    db.prepare('DELETE FROM faction_battle_formations').run();
    db.prepare('DELETE FROM faction_extra_rules').run();
    console.log('Cleared existing rules data.\n');
  }

  const insertTrait = db.prepare(`
    INSERT INTO faction_battle_traits
      (faction_slug, faction_name, name, timing, declare, effect, bullets, keywords, lore_text, group_name, source_note, phase_key)
    VALUES
      (@faction_slug, @faction_name, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @group_name, @source_note, @phase_key)
  `);

  const insertFormation = db.prepare(`
    INSERT INTO faction_battle_formations
      (faction_slug, faction_name, formation_name, name, timing, declare, effect, bullets, keywords, lore_text, source_note, phase_key)
    VALUES
      (@faction_slug, @faction_name, @formation_name, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @source_note, @phase_key)
  `);

  const insertExtra = db.prepare(`
    INSERT INTO faction_extra_rules
      (faction_slug, faction_name, section, group_name, name, timing, declare, effect, bullets, keywords, lore_text, casting_value, source_note, phase_key)
    VALUES
      (@faction_slug, @faction_name, @section, @group_name, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @casting_value, @source_note, @phase_key)
  `);

  let totals = { traits: 0, formations: 0, extra: 0 };

  for (const faction of factionsToScrape) {
    console.log(`\nScraping ${faction.name}...`);
    const result = await scrapeFactionRules(faction);
    if (!result) { await sleep(1500); continue; }

    const { traits, formations, extraRules } = result;
    db.transaction(() => {
      for (const t of traits)      insertTrait.run(t);
      for (const f of formations)  insertFormation.run(f);
      for (const e of extraRules)  insertExtra.run(e);
    })();

    totals.traits     += traits.length;
    totals.formations += formations.length;
    totals.extra      += extraRules.length;

    await sleep(1500);
  }

  db.close();
  console.log(`\n✅ Rules scraping complete! ${totals.traits} traits, ${totals.formations} formations, ${totals.extra} extra rules saved.`);
}

if (require.main === module) {
  const factionArg = process.argv.includes('--faction')
    ? process.argv[process.argv.indexOf('--faction') + 1]
    : null;
  scrapeAllRules(factionArg).catch(err => {
    console.error('Scraper failed:', err);
    process.exit(1);
  });
}

module.exports = { scrapeAllRules, FACTIONS, BASE_URL, normalizeText, parseAbilityBlock, collectSectionBlocks };
