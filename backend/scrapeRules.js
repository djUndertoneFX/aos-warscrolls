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

  const bodyText = bodyClone.text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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

  return {
    name,
    timing,
    declare: declareMatch ? normalizeText(declareMatch[1]) : '',
    effect:  normalizeText(effectIntro),
    bullets: JSON.stringify(bullets.map(b => normalizeText(b))),
    keywords: normalizeText(keywords),
    lore_text: loreText || null,
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
    .replace(/\s*-\s*[^-]+$/, '')
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
function collectSectionBlocks($, html, sectionTitle) {
  const results = []; // { formationName, sourceNote, block, skipNestGuard }
  let inSection = false;

  $('h2.outline_header3, div.datasheet, div.BreakInsideAvoid').each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const $el = $(el);

    if (tag === 'h2') {
      const text = $el.text().trim();
      inSection = text === sectionTitle;
      return;
    }

    if (!inSection) return;

    // A datasheet block means we've entered the warscroll units section — stop.
    if ($el.hasClass('datasheet')) { inSection = false; return; }

    if ($el.hasClass('BreakInsideAvoid')) {
      if ($el.parents('.BreakInsideAvoid').length > 0) return;
      if ($el.parents('.datasheet').length > 0) return; // nested inside a warscroll

      const abBodyCount = $el.find('.abBody').length;
      if (abBodyCount > 1) {
        const groupName = normalizeText($el.children('[class*="title"]').first().text()) || null;
        $el.children('.BreakInsideAvoid').each((__, child) => {
          const $child = $(child);
          if ($child.find('.abBody').length >= 1) {
            results.push({ formationName: groupName, sourceNote: null, block: child, skipNestGuard: true });
          }
        });
        return;
      }

      const formationName = normalizeText($el.find('h3.h2_pge').first().text());
      const sourceNote = extractSourceNote($el);
      results.push({ formationName, sourceNote, block: el, skipNestGuard: false });
    }
  });

  return results;
}

// Scrape all BreakInsideAvoid blocks under a heading, grouped by h3 sub-headings
function scrapeSection($, sectionTitle, factionSlug, factionName) {
  const results = [];
  for (const { formationName: groupName, sourceNote, block, skipNestGuard } of collectSectionBlocks($, null, sectionTitle)) {
    const ability = parseAbilityBlock($, block, skipNestGuard);
    if (ability) results.push({ ...ability, faction_slug: factionSlug, faction_name: factionName, group_name: groupName || null, source_note: sourceNote });
  }
  return results;
}

// ── Battle Formation phase-colour detection ──────────────────────────────
// Battle Formation abilities are always headed "Passive" on Wahapedia (they're
// permanent bonuses, not phase-triggered), so unlike other ability cards we
// can't just read ab.timing to pick a PHASE_PRESETS colour. The printed books
// still colour-code formation cards by the phase their effect is thematically
// tied to (confirmed against 4 known Idoneth Deepkin examples: Namarti Corps'
// "re-roll run AND charge rolls" is ambiguous between two phases so the book
// uses the neutral/passive black; Akhelian Beastmasters' "hit rolls for
// combat attacks" is Combat Phase red; Isharann Council's "casting rolls" is
// Hero Phase gold; Soul-raid Ambushers references the named ability
// "Unpredictable Tide", which is itself a Hero Phase battle trait, and
// inherits that same gold). This mirrors that reasoning: prefer an explicit
// non-Passive timing verbatim, else scan the formation's own text for a
// single unambiguous phase keyword group, else follow a quoted ability-name
// reference into the faction's own battle traits/heroic traits, else fall
// back to 'passive'. The returned key is a PHASE_PRESETS-compatible string
// (frontend/src/components/WarscrollGW.js) — keep the two in sync.
const PHASE_KEYWORD_GROUPS = [
  { key: 'hero phase', patterns: [/casting roll/, /\bunbind/, /\bdispel/, /prayer roll/, /ritual roll/, /lurelight/, /\bhero phase\b/, /command point/] },
  { key: 'movement',   patterns: [/run roll/, /\bretreat/, /movement phase/, /\bmove roll/] },
  { key: 'charge',     patterns: [/charge roll/, /charge phase/] },
  { key: 'shooting',   patterns: [/shooting attack/, /shoot phase/, /ranged attack/, /shooting phase/] },
  { key: 'combat',     patterns: [/combat attack/, /fight phase/, /\bpile in\b/, /combat phase/] },
  { key: 'end of turn', patterns: [/end of (the |any )?turn/, /end of (the )?battle round/] },
  { key: 'deployment', patterns: [/\bdeploy/, /set up.*battlefield edge/, /\breserves?\b/] },
];

function timingToPhaseKey(timing) {
  if (!timing) return null;
  const t = timing.toLowerCase();
  if (t.includes('passive')) return null; // uninformative — caller should fall through to text detection
  if (t.includes('hero phase')) return 'hero phase';
  if (t.includes('movement') || t.includes('move phase')) return 'movement';
  if (t.includes('charge')) return 'charge';
  if (t.includes('shooting')) return 'shooting';
  if (t.includes('combat')) return 'combat';
  if (t.includes('end of')) return 'end of turn';
  if (t.includes('deployment')) return 'deployment';
  return null;
}

function detectPhaseFromText(text) {
  const t = text.toLowerCase();
  const matched = new Set();
  for (const grp of PHASE_KEYWORD_GROUPS) {
    if (grp.patterns.some(re => re.test(t))) matched.add(grp.key);
  }
  return matched.size === 1 ? [...matched][0] : null; // null = none or ambiguous
}

function formationOwnText(formation) {
  let bullets = [];
  try { bullets = JSON.parse(formation.bullets || '[]'); } catch {}
  return [formation.declare, formation.effect, ...bullets].filter(Boolean).join(' ');
}

function resolveFormationPhaseKey(formation, nameToTiming) {
  const directKey = timingToPhaseKey(formation.timing);
  if (directKey) return directKey;

  const ownText = formationOwnText(formation);
  const textKey = detectPhaseFromText(ownText);
  if (textKey) return textKey;

  // Follow a quoted ability-name reference (e.g. "the 'Unpredictable Tide'
  // ability") into the faction's own battle traits/heroic traits/other
  // formations to inherit a known timing.
  const refs = [...ownText.matchAll(/['‘’]([A-Z][A-Za-z' -]{2,40})['‘’]/g)].map(m => m[1].toUpperCase());
  for (const ref of refs) {
    const refTiming = nameToTiming.get(ref);
    if (!refTiming) continue;
    const refKey = timingToPhaseKey(refTiming) || detectPhaseFromText(refTiming);
    if (refKey) return refKey;
  }

  return 'passive';
}

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
  const extraRules = [...heroicTraits, ...artefacts, ...spellLore, ...prayerLore, ...manifestationLore];

  // Resolve each formation's thematic phase colour — needs traits/heroic
  // traits/other formations already scraped so quoted ability-name
  // references (see resolveFormationPhaseKey) can be looked up by name.
  const nameToTiming = new Map();
  for (const a of [...traits, ...heroicTraits, ...formations]) {
    if (a.name) nameToTiming.set(a.name.toUpperCase(), a.timing);
  }
  for (const f of formations) {
    f.phase_key = resolveFormationPhaseKey(f, nameToTiming);
  }

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
      (faction_slug, faction_name, name, timing, declare, effect, bullets, keywords, lore_text, group_name)
    VALUES
      (@faction_slug, @faction_name, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @group_name)
  `);

  const insertFormation = db.prepare(`
    INSERT INTO faction_battle_formations
      (faction_slug, faction_name, formation_name, name, timing, declare, effect, bullets, keywords, lore_text, source_note, phase_key)
    VALUES
      (@faction_slug, @faction_name, @formation_name, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @source_note, @phase_key)
  `);

  const insertExtra = db.prepare(`
    INSERT INTO faction_extra_rules
      (faction_slug, faction_name, section, group_name, name, timing, declare, effect, bullets, keywords, lore_text)
    VALUES
      (@faction_slug, @faction_name, @section, @group_name, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text)
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

module.exports = { scrapeAllRules, FACTIONS, BASE_URL, normalizeText, parseAbilityBlock };
