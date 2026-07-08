/**
 * scrapeSpearheadWarscrolls.js
 *
 * Downloads GW spearhead PDFs per faction, extracts spearhead-specific unit
 * abilities, and stores them in warscrolls.spearhead_abilities (JSON).
 *
 * Format stored:
 *   { "Spearhead Name": [ { name, timing, lore_text, declare, effect, bullets }, ... ] }
 *
 * Run: node scrapeSpearheadWarscrolls.js
 */

const fetch    = require('node-fetch');
const cheerio  = require('cheerio');
const pdfParse = require('pdf-parse');
const { getDb, initDb } = require('./db');

const WAHAPEDIA_BASE = 'https://waha' + 'pedia.ru/aos4/factions';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── PDF URL collection ──────────────────────────────────────────────────────

async function getPdfUrlsForFaction(slug) {
  try {
    const res = await fetch(`${WAHAPEDIA_BASE}/${slug}/`, { headers: HEADERS, timeout: 12000 });
    if (!res.ok) return [];
    const $ = cheerio.load(await res.text());
    const urls = new Set();
    $('a[href*=spearhead][href*=.pdf]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) urls.add(href);
    });
    return [...urls];
  } catch { return []; }
}

async function downloadPdfText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, timeout: 40000 });
    if (!res.ok) return null;
    const data = await pdfParse(await res.buffer());
    return data.text;
  } catch (e) {
    console.warn(`  PDF error ${url.split('/').pop()}: ${e.message}`);
    return null;
  }
}

// ─── Text normalisation ───────────────────────────────────────────────────────

// Collapse letter-spacing artefacts: "A KHELI A N K ING" → "AKHELIANKING"
// (We strip spaces between uppercase letters entirely; word boundaries are lost
//  but the result is good enough for substring matching.)
function collapseCaps(text) {
  // Normalize curly/smart apostrophes to straight apostrophe so regex classes match uniformly
  let t = text.replace(/[‘’‚‛]/g, "'");
  for (let i = 0; i < 10; i++) {
    const prev = t;
    t = t.replace(/([A-Z']) ([A-Z'])/g, '$1$2');
    if (t === prev) break;
  }
  // Normalize multiple spaces to single (word boundaries leave double-spaces after collapse)
  t = t.replace(/ {2,}/g, ' ');
  // Join consecutive all-caps words split across lines — PDFs often put each word of a
  // multi-word ability name on its own line: "RAIDER'S\nRESOLVE:" → "RAIDER'S RESOLVE:"
  for (let i = 0; i < 5; i++) {
    const prev = t;
    t = t.replace(/([A-Z][A-Z'\-–]+)\n([A-Z][A-Z'\-–])/g, '$1 $2');
    if (t === prev) break;
  }
  return t;
}

function norm(s) {
  return (s || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ─── Timing phrases ───────────────────────────────────────────────────────────

const TIMING_PHRASES = [
  'Once Per Battle Round, Start of Battle Round',
  'Once Per Battle Round, Start of Your Turn',
  'Once Per Battle Round, Any Combat Phase',
  'Once Per Battle Round, Your Hero Phase',
  'Once Per Battle Round, Your Movement Phase',
  'Once Per Battle (Army), Any Combat Phase',
  'Once Per Battle (Army), Any Charge Phase',
  'Once Per Battle (Army), Your Hero Phase',
  'Once Per Battle (Army), Your Movement Phase',
  'Once Per Battle (Army), Your Shooting Phase',
  'Once Per Battle (Army), Start of Any Turn',
  'Once Per Battle (Army), Start of Battle Round',
  'Once Per Battle, Any Combat Phase',
  'Once Per Battle, Any Charge Phase',
  'Once Per Battle, Your Hero Phase',
  'Once Per Battle, Your Movement Phase',
  'Once Per Battle, Your Shooting Phase',
  'Once Per Battle, Start of Any Turn',
  'Once Per Battle, Start of Battle Round',
  'Once Per Battle, Deployment Phase',
  'Once Per Turn (Army), Your Hero Phase',
  'Once Per Turn (Army), Your Movement Phase',
  'Once Per Turn (Army), Your Shooting Phase',
  'Once Per Turn (Army), Any Combat Phase',
  'Once Per Turn (Army), Any Charge Phase',
  'Once Per Turn (Army), Enemy Shooting Phase',
  'Once Per Turn (Army), Start of Any Turn',
  'Once Per Turn, Your Hero Phase',
  'Once Per Turn, Your Movement Phase',
  'Once Per Turn, Your Shooting Phase',
  'Once Per Turn, Any Combat Phase',
  'Once Per Turn, Any Charge Phase',
  'Once Per Turn, Enemy Shooting Phase',
  'Once Per Turn, Enemy Combat Phase',
  'Start of Any Battle Round',
  'Start of Battle Round',
  'Start of Any Turn',
  'Start of the First Battle Round',
  'End of Any Turn',
  'End of Any Battle Round',
  'Any Combat Phase',
  'Any Charge Phase',
  'Your Combat Phase',
  'Your Shooting Phase',
  'Your Movement Phase',
  'Your Hero Phase',
  'Your Charge Phase',
  'Enemy Combat Phase',
  'Enemy Shooting Phase',
  'Enemy Movement Phase',
  'Enemy Charge Phase',
  'Deployment Phase',
  'Passive',
  'Reaction:',
];

const TIMING_SORTED = [...TIMING_PHRASES].sort((a, b) => b.length - a.length);
const TIMING_RE = new RegExp(
  '(' + TIMING_SORTED.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'i'
);

// ─── Ability extraction ───────────────────────────────────────────────────────

// Ability name pattern: ALL CAPS, at least 3 chars, followed by ": "
// We apply it to the collapsed-caps text.
// Use (?<![a-z]) instead of \b so apostrophes inside names don't create false boundaries.
// Allow multi-word all-caps names: "RAIDER'S RESOLVE:", "CREST OF THE WAVE:"
// Each word must be all-caps (A-Z plus apostrophe/hyphen). Only a single literal space between words.
const ABILITY_NAME_RE = /(?<![a-z])([A-Z][A-Z'''\-–()\/]*(?:[ ][A-Z][A-Z'''\-–()\/]*)*)\s*:/g;

// Strings that look like ability names but aren't
const NOT_ABILITY_WORDS = [
  'MELEWEAPONS','MELEEW','RANGEDWEAPONS','RANGEDW','KEYWORDS','KEYWORD',
  'SAVE','MOVE','HEALTH','CONTROL','SPEARHEAD','WARSCROLL',
  'BATTLETRAITS','REGIMENTABILITIES','ENHANCEMENTS','ENHANCEMENT',
  'GENERAL','UNITS','UNIT','ATTACKS','HIT','WOUND','REND','DAMAGE','ABILITY',
  'RANGE','COMPANION','DECLARE','EFFECT','PASSIVE','REACTION','CHARGE',
  'ARMOR','WARD','MELEE','RANGED','ANTI','CRIT','SHOOTINCOMBAT',
  'REGIMENTABILITIES','BATTLETRAITS','ENHANCEMENTS',
  // Spearhead section headers (after collapseCaps they look like)
  'SPEARHEADBATTLEPACK','SPEARHEADRULES',
];
const NOT_ABILITY = new Set(NOT_ABILITY_WORDS);

function isAbilityName(name) {
  const upper = name.toUpperCase().replace(/[\s'''\-]/g, '');
  if (NOT_ABILITY.has(upper)) return false;
  if (name.length < 3) return false;
  if ((name.match(/[A-Z]/g) || []).length < 2) return false;
  if (/^\d/.test(name)) return false;
  // Reject PDF noise: "KEYWORDS KEYWORDS SOMENAME" from two-column warscroll keyword sections
  if (/\bKEYWORDS?\b/.test(name.toUpperCase())) return false;
  // Single-word fragments that are common timing/section words
  const words = name.trim().split(/\s+/);
  const TIMING_WORDS = new Set(['ANY','YOUR','ONCE','PER','TURN','PHASE','ARMY','PASSIVE','START','END','OF','THE','A','AN','IN','AT']);
  if (words.every(w => TIMING_WORDS.has(w.toUpperCase()))) return false;
  return true;
}

// Return only the portion of text after the first SPEARHEAD WARSCROLL header.
// Everything before that is spearhead faction rules (battle traits etc.), not unit abilities.
function stripSpearheadRulesSection(text) {
  const headerRe = /(?:•\s*)?SPEAR\s*HEA\s*D\s*WARSCR\s*OLL\s*(?:•)?/i;
  const match = headerRe.exec(text);
  return match ? text.slice(match.index) : text;
}

function parseAbilities(text) {
  const abilities = [];
  // Strip spearhead rules section so we only parse unit warscroll abilities
  const unitText  = stripSpearheadRulesSection(text);
  // Work on collapsed-caps version for ability name matching
  const collapsed = collapseCaps(unitText);

  const matches = [];
  let m;
  ABILITY_NAME_RE.lastIndex = 0;
  while ((m = ABILITY_NAME_RE.exec(collapsed)) !== null) {
    // Post-process: reinsert space where a possessive apostrophe was collapsed with the next word
    // e.g. "RAIDERS'RESOLVE" → "RAIDERS' RESOLVE"
    let name = m[1].trim().replace(/([A-Z]['''])([A-Z])/g, '$1 $2');
    if (!isAbilityName(name)) continue;
    matches.push({ name, start: m.index, bodyStart: m.index + m[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const { name, bodyStart } = matches[i];
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].start : collapsed.length;
    const rawBody = norm(collapsed.slice(bodyStart, bodyEnd));

    // Extract timing
    let timing = '';
    let body   = rawBody;
    const timingMatch = TIMING_RE.exec(rawBody);
    if (timingMatch) {
      timing = timingMatch[1].trim();
      const idx = rawBody.lastIndexOf(timingMatch[1].trim());
      if (idx > rawBody.length * 0.4) {
        body = rawBody.slice(0, idx).trim();
      }
    }

    // Split on Declare: / Effect:
    let lore_text = '', declare = '', effect = '', bullets = [];
    const declareIdx = body.search(/\bDeclare\s*:/i);
    const effectIdx  = body.search(/\bEffect\s*:/i);

    if (declareIdx !== -1 && effectIdx !== -1) {
      lore_text = norm(body.slice(0, declareIdx));
      declare   = norm(body.slice(declareIdx + 8, effectIdx));
      effect    = norm(body.slice(effectIdx + 7));
    } else if (effectIdx !== -1) {
      lore_text = norm(body.slice(0, effectIdx));
      effect    = norm(body.slice(effectIdx + 7));
    } else if (declareIdx !== -1) {
      lore_text = norm(body.slice(0, declareIdx));
      declare   = norm(body.slice(declareIdx + 8));
    } else {
      effect = body;
    }

    // Pull bullet points
    const bulletRe = /[•·]\s*([^\n•·]+)/g;
    let bm;
    while ((bm = bulletRe.exec(effect)) !== null) bullets.push(bm[1].trim());
    if (bullets.length) effect = effect.replace(/[•·]\s*[^\n•·]+/g, '').trim();

    if (!name || (!effect && !declare && !lore_text)) continue;

    abilities.push({
      name:      name.trim(),
      timing:    timing || 'Passive',
      lore_text: lore_text.trim(),
      declare:   declare.trim(),
      effect:    effect.trim(),
      bullets,
    });
  }

  return abilities;
}

// ─── Unit → ability matching ──────────────────────────────────────────────────

// Normalize an ability name for loose comparison: strip spaces, hyphens, apostrophes.
// PDF letter-spacing collapse often produces "BIOVOLTAICBARRIER" from "BIOVOLTAIC BARRIER".
function normAbilityName(s) {
  return s.toUpperCase().replace(/[\s\-''’]/g, '');
}

// Score how likely an ability belongs to a given unit.
// Higher = more confident.
function scoreAbilityForUnit(ability, unit) {
  let score = 0;

  const abilityFullText = [ability.name, ability.lore_text, ability.declare, ability.effect]
    .join(' ').toUpperCase();

  // Name matches a regular ability for this unit — compare normalized to handle
  // letter-spacing collapse producing "BIOVOLTAICBARRIER" vs "BIOVOLTAIC BARRIER" (+15)
  const regularAbilities = JSON.parse(unit.abilities || '[]');
  const abilityNorm = normAbilityName(ability.name);
  for (const ra of regularAbilities) {
    if (ra.name && normAbilityName(ra.name) === abilityNorm) {
      score += 15;
      break;
    }
  }

  // Unit name appears in ability text (+8)
  const unitNameNorm = unit.name.toUpperCase();
  if (abilityFullText.includes(unitNameNorm)) score += 8;

  // Unit keyword appears in ability text (+2 per keyword)
  const keywords = (unit.keywords || '').toUpperCase().split(',').map(k => k.trim()).filter(Boolean);
  for (const kw of keywords) {
    if (kw.length > 3 && abilityFullText.includes(kw)) score += 2;
  }

  return score;
}

// Assign a list of extracted abilities to a list of units.
// Returns: Map<unitId, ability[]>
function assignAbilitiesToUnits(abilities, units) {
  const assignments = new Map(units.map(u => [u.id, []]));

  for (const ability of abilities) {
    let bestUnit = null;
    let bestScore = 0;

    for (const unit of units) {
      const score = scoreAbilityForUnit(ability, unit);
      if (score > bestScore) {
        bestScore = score;
        bestUnit  = unit;
      }
    }

    // Minimum score threshold: if nothing matches, skip
    if (bestUnit && bestScore > 0) {
      // If the name matched a regular ability (normalized), use the properly-spaced
      // canonical name from the regular warscroll (fixes "BIOVOLTAICBARRIER" → "BIOVOLTAIC BARRIER")
      const regularAbilities = JSON.parse(bestUnit.abilities || '[]');
      const abilityNorm = normAbilityName(ability.name);
      const matched = regularAbilities.find(ra => ra.name && normAbilityName(ra.name) === abilityNorm);
      if (matched && matched.name !== ability.name) {
        ability.name = matched.name;
      }
      assignments.get(bestUnit.id).push(ability);
    } else {
      console.log(`    ⚠ unassigned: "${ability.name}" (score 0)`);
    }
  }

  return assignments;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  initDb();
  const db = getDb();

  const FACTIONS = [
    'stormcast-eternals','cities-of-sigmar','daughters-of-khaine','fyreslayers','idoneth-deepkin',
    'kharadron-overlords','lumineth-realm-lords','seraphon','sylvaneth',
    'blades-of-khorne','disciples-of-tzeentch','hedonites-of-slaanesh','maggotkin-of-nurgle',
    'skaven','slaves-to-darkness',
    'flesh-eater-courts','nighthaunt','ossiarch-bonereapers','soulblight-gravelords',
    'gloomspite-gitz','ironjawz','kruleboyz','ogor-mawtribes','sons-of-behemat',
  ];

  // Load all spearhead→unit mappings from DB
  // spearheads table has name, faction_slug
  // warscrolls.spearhead has pipe-separated spearhead names
  const spearheadRows = db.prepare(`SELECT name, faction_slug FROM spearheads`).all();

  // Build: spearheadName → [unit DB rows]
  const spearheadUnits = new Map(); // spearheadName → unit rows
  for (const sp of spearheadRows) {
    const unitRows = db.prepare(
      `SELECT id, name, abilities, keywords, faction_slug FROM warscrolls
       WHERE spearhead LIKE ?`
    ).all(`%${sp.name}%`);
    spearheadUnits.set(sp.name, unitRows);
  }

  // Collect unique PDF URLs
  const allPdfUrls = new Set();
  console.log('Collecting PDF URLs...');
  for (const slug of FACTIONS) {
    const urls = await getPdfUrlsForFaction(slug);
    urls.forEach(u => allPdfUrls.add(u));
    process.stdout.write('.');
    await sleep(300);
  }
  console.log(`\nFound ${allPdfUrls.size} unique PDFs.\n`);

  // Process each PDF
  // pdfResults: Map<unitId, Map<spearheadName, ability[]>>
  const unitSpAbilities = new Map(); // unitId → { spName: ability[] }

  for (const pdfUrl of allPdfUrls) {
    const fname = pdfUrl.split('/').pop();
    console.log(`\nProcessing: ${fname}`);

    const text = await downloadPdfText(pdfUrl);
    if (!text) { console.log('  ⚠ Failed'); continue; }

    // Determine which spearheads this PDF covers by looking for spearhead names in the PDF text.
    const collapsedText = collapseCaps(text).toUpperCase();
    const relevantSpearheads = [];
    for (const [spName, units] of spearheadUnits.entries()) {
      // Spearhead name with spaces collapsed
      const spKey = spName.replace(/\s+/g, '').toUpperCase();
      // Also try just checking if some units from the spearhead appear in the PDF
      const unitMatchCount = units.filter(u => {
        const uKey = u.name.replace(/\s+/g, '').toUpperCase();
        return collapsedText.includes(uKey);
      }).length;
      if (unitMatchCount >= 2) {
        relevantSpearheads.push({ spName, units });
      }
    }

    if (relevantSpearheads.length === 0) {
      console.log('  ⚠ No matching spearheads found in PDF');
      continue;
    }

    // Extract all abilities from the full PDF text (after stripping spearhead rules section)
    const rawAbilities = parseAbilities(text);
    // De-duplicate by name (same ability can appear multiple times in multi-spearhead PDFs)
    const seen = new Set();
    const allAbilities = rawAbilities.filter(a => {
      const key = a.name.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`  Abilities found: ${allAbilities.length} (${rawAbilities.length} raw)`);
    if (allAbilities.length === 0) continue;

    // For each relevant spearhead, assign abilities to its units
    for (const { spName, units } of relevantSpearheads) {
      console.log(`  Spearhead: ${spName} (${units.length} units)`);
      const assignments = assignAbilitiesToUnits(allAbilities, units);

      for (const [unitId, abilities] of assignments.entries()) {
        if (abilities.length === 0) continue;
        const unit = units.find(u => u.id === unitId);
        console.log(`    ${unit.name}: ${abilities.map(a => a.name).join(', ')}`);

        if (!unitSpAbilities.has(unitId)) unitSpAbilities.set(unitId, {});
        const existing = unitSpAbilities.get(unitId);
        if (!existing[spName]) existing[spName] = abilities;
      }
    }

    await sleep(600);
  }

  // Write to DB
  const TARGET_COL = 'spearhead_abilities';
  console.log(`\n\nWriting to database (${TARGET_COL})...`);
  let updated = 0;
  for (const [unitId, spAbilities] of unitSpAbilities.entries()) {
    if (Object.keys(spAbilities).length === 0) continue;

    // Merge with any existing v2 data (start fresh each run since v2 is the clean column)
    db.prepare(`UPDATE warscrolls SET ${TARGET_COL}=? WHERE id=?`)
      .run(JSON.stringify(spAbilities), unitId);
    updated++;
  }

  db.close();
  console.log(`\n✅ Done. Updated ${updated} warscroll(s).`);
}

run().catch(e => { console.error(e); process.exit(1); });
