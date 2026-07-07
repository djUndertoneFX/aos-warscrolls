/**
 * analyzeWeaponModelCounts.js
 *
 * Fetches all AoS 4 faction pages from Wahapedia and looks for warscrolls
 * where a weapon likely belongs to only a subset of a unit's models.
 *
 * Detection strategies:
 *   1. Weapon-row cell[0]/cell[1] text containing a model count or "Champion"
 *   2. Options/description text containing patterns like:
 *        "1 in every N models", "1 in N", "N model(s) can", "Champion",
 *        "Companion", near a weapon name
 *   3. Short-row weapons (wsDataRow_short) — Wahapedia sometimes uses
 *        these for champion/optional weapons
 *
 * Output: sorted table of candidates for manual review, then a ready-to-paste
 * JSON block for weaponModelOverrides.json.
 *
 * Usage:  node analyzeWeaponModelCounts.js
 *         node analyzeWeaponModelCounts.js --faction fyreslayers
 */

const fetch  = require('node-fetch');
const cheerio = require('cheerio');

const TARGET_FACTION = process.argv.includes('--faction')
  ? process.argv[process.argv.indexOf('--faction') + 1]
  : null;

const FACTIONS = [
  { slug: 'stormcast-eternals',    name: 'Stormcast Eternals',    alliance: 'Order' },
  { slug: 'cities-of-sigmar',      name: 'Cities of Sigmar',      alliance: 'Order' },
  { slug: 'daughters-of-khaine',   name: 'Daughters of Khaine',   alliance: 'Order' },
  { slug: 'fyreslayers',           name: 'Fyreslayers',            alliance: 'Order' },
  { slug: 'idoneth-deepkin',       name: 'Idoneth Deepkin',        alliance: 'Order' },
  { slug: 'kharadron-overlords',   name: 'Kharadron Overlords',    alliance: 'Order' },
  { slug: 'lumineth-realm-lords',  name: 'Lumineth Realm-lords',   alliance: 'Order' },
  { slug: 'seraphon',              name: 'Seraphon',               alliance: 'Order' },
  { slug: 'sylvaneth',             name: 'Sylvaneth',              alliance: 'Order' },
  { slug: 'blades-of-khorne',      name: 'Blades of Khorne',       alliance: 'Chaos' },
  { slug: 'disciples-of-tzeentch', name: 'Disciples of Tzeentch',  alliance: 'Chaos' },
  { slug: 'hedonites-of-slaanesh', name: 'Hedonites of Slaanesh',  alliance: 'Chaos' },
  { slug: 'maggotkin-of-nurgle',   name: 'Maggotkin of Nurgle',    alliance: 'Chaos' },
  { slug: 'skaven',                name: 'Skaven',                 alliance: 'Chaos' },
  { slug: 'slaves-to-darkness',    name: 'Slaves to Darkness',     alliance: 'Chaos' },
  { slug: 'flesh-eater-courts',    name: 'Flesh-eater Courts',     alliance: 'Death' },
  { slug: 'nighthaunt',            name: 'Nighthaunt',             alliance: 'Death' },
  { slug: 'ossiarch-bonereapers',  name: 'Ossiarch Bonereapers',   alliance: 'Death' },
  { slug: 'soulblight-gravelords', name: 'Soulblight Gravelords',  alliance: 'Death' },
  { slug: 'gloomspite-gitz',       name: 'Gloomspite Gitz',        alliance: 'Destruction' },
  { slug: 'ironjawz',              name: 'Ironjawz',               alliance: 'Destruction' },
  { slug: 'kruleboyz',             name: 'Kruleboyz',              alliance: 'Destruction' },
  { slug: 'ogor-mawtribes',        name: 'Ogor Mawtribes',         alliance: 'Destruction' },
  { slug: 'sons-of-behemat',       name: 'Sons of Behemat',        alliance: 'Destruction' },
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
function normalize(str) {
  return str.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/./gu, ch => HOMOGLYPH_MAP[ch] ?? ch)
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Returns a snippet of `text` around the first occurrence of `needle` (case-insensitive).
function snippet(text, needle, radius = 80) {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end   = Math.min(text.length, idx + needle.length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : '');
}

// Model-count patterns to search for near weapon names in raw text.
// Returns { modelCount: number|'champion'|'companion', evidence: string } or null.
function detectModelCount(rawText, weaponName) {
  const name = weaponName.toLowerCase();

  // Pattern A: "1 in every N models" / "1 in N models" near weapon name
  //   e.g. "1 in every 5 models can replace their Warhammer"
  const patternA = /(\d+)\s+in\s+(?:every\s+)?(\d+)\s+models?\b[^.]{0,120}/gi;
  for (const m of rawText.matchAll(patternA)) {
    const fullMatch = m[0].toLowerCase();
    if (fullMatch.includes(name) || (radius => {
      const pos = rawText.toLowerCase().indexOf(m[0].toLowerCase());
      const ctx = rawText.slice(Math.max(0, pos - 150), pos + m[0].length + 150).toLowerCase();
      return ctx.includes(name);
    })()) {
      return {
        modelCount: parseInt(m[1], 10),
        evidence: snippet(rawText, m[0]) || m[0].slice(0, 160),
        source: 'fraction',
      };
    }
  }

  // Pattern B: "N model(s) can be armed with / is armed with / replace" near weapon name
  const patternB = /(\d+)\s+models?\s+(?:can\s+)?(?:be\s+)?(?:armed\s+with|replace|carry)[^.]{0,120}/gi;
  for (const m of rawText.matchAll(patternB)) {
    const fullMatch = m[0].toLowerCase();
    const pos = rawText.toLowerCase().indexOf(m[0].toLowerCase());
    const ctx = rawText.slice(Math.max(0, pos - 150), pos + m[0].length + 150).toLowerCase();
    if (fullMatch.includes(name) || ctx.includes(name)) {
      return {
        modelCount: parseInt(m[1], 10),
        evidence: snippet(rawText, m[0]) || m[0].slice(0, 160),
        source: 'N-model',
      };
    }
  }

  // Pattern C: "Champion" / "Musician" / "Standard Bearer" armed with weapon
  const patternC = /(?:champion|leader|musician|standard bearer|icon bearer|hornblower)\b[^.]{0,120}/gi;
  for (const m of rawText.matchAll(patternC)) {
    const fullMatch = m[0].toLowerCase();
    const pos = rawText.toLowerCase().indexOf(m[0].toLowerCase());
    const ctx = rawText.slice(Math.max(0, pos - 150), pos + m[0].length + 150).toLowerCase();
    if (fullMatch.includes(name) || ctx.includes(name)) {
      return {
        modelCount: 1,
        evidence: snippet(rawText, m[0]) || m[0].slice(0, 160),
        source: 'champion',
      };
    }
  }

  // Pattern D: "Companion" near weapon name
  const patternD = /companion\b[^.]{0,120}/gi;
  for (const m of rawText.matchAll(patternD)) {
    const pos = rawText.toLowerCase().indexOf(m[0].toLowerCase());
    const ctx = rawText.slice(Math.max(0, pos - 150), pos + m[0].length + 150).toLowerCase();
    if (ctx.includes(name)) {
      return {
        modelCount: 1,
        evidence: snippet(rawText, m[0]) || m[0].slice(0, 160),
        source: 'companion',
      };
    }
  }

  return null;
}

async function analyzeFaction(faction) {
  const url = `https://wahapedia.ru/aos4/factions/${faction.slug}/warscrolls.html`;
  process.stdout.write(`  ${faction.name}… `);

  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 20000,
    });
    if (!res.ok) { console.log(`HTTP ${res.status}, skipping`); return []; }
    html = await res.text();
  } catch (e) { console.log(`error: ${e.message}`); return []; }

  const $ = cheerio.load(html);
  const candidates = [];

  $('.datasheet').each((_, el) => {
    const nameEl = $(el).find('.wsHeaderIn').first().clone();
    nameEl.find('a').remove();
    const rawName = nameEl.text().replace(/\s+/g, ' ').trim();
    const name = normalize(rawName.replace(/^[^a-zA-Z0-9]+/, ''));
    if (!name || name.length > 100) return;

    const unitSizeMatch = $(el).text().match(/Unit Size[^\d]*(\d+)/i);
    const unitSize = unitSizeMatch ? parseInt(unitSizeMatch[1], 10) : 1;

    // Skip single-model units — all weapons always belong to the 1 model
    if (unitSize <= 1) return;

    // Gather all weapon names (including short rows which may be champion weapons)
    const allWeaponRows = [];
    $(el).find('.wTable').each((_, table) => {
      const headerRow = $(table).find('tr.wsHeaderRow').first();
      const isRanged = headerRow.find('.wsHeaderCellName_RangedWeapons').length > 0;
      const isMelee  = headerRow.find('.wsHeaderCellName_MeleeWeapons').length > 0;
      if (!isRanged && !isMelee) return;

      $(table).find('tr.wsDataRow').each((_, row) => {
        const cells = $(row).find('td');
        const isShort = $(row).hasClass('wsDataRow_short');
        const weaponName = normalize($(cells[2]).contents()
          .filter((_, n) => n.type === 'text').first().text().trim());
        if (!weaponName) return;

        // Also capture cell[0] and cell[1] text — may contain model count labels
        const cell0text = normalize($(cells[0]).text().trim());
        const cell1text = normalize($(cells[1]).text().trim());

        allWeaponRows.push({ weaponName, isShort, cell0: cell0text, cell1: cell1text });
      });
    });

    // Multi-weapon units only — single weapon units are always fine
    if (allWeaponRows.length <= 1) return;

    const rawText = normalize($(el).text());

    for (const wr of allWeaponRows) {
      const { weaponName, isShort, cell0, cell1 } = wr;

      // Strategy 1: short weapon rows are often champion/optional weapons
      if (isShort) {
        candidates.push({
          faction: faction.name,
          unit: name,
          unitSize,
          weapon: weaponName,
          modelCount: '?',
          confidence: 'medium',
          evidence: `short weapon row (wsDataRow_short)${cell0 ? '; cell0: ' + cell0 : ''}${cell1 ? '; cell1: ' + cell1 : ''}`,
        });
        continue;
      }

      // Strategy 2: cell[0] or cell[1] has a digit or "champion" keyword
      const cellText = (cell0 + ' ' + cell1).toLowerCase();
      if (/\d/.test(cellText) || /champion|leader|musician|companion/.test(cellText)) {
        candidates.push({
          faction: faction.name,
          unit: name,
          unitSize,
          weapon: weaponName,
          modelCount: cellText.match(/\d+/)?.[0] ?? '1',
          confidence: 'high',
          evidence: `cell text: "${(cell0 + ' ' + cell1).trim()}"`,
        });
        continue;
      }

      // Strategy 3: options text pattern matching
      const detected = detectModelCount(rawText, weaponName);
      if (detected) {
        candidates.push({
          faction: faction.name,
          unit: name,
          unitSize,
          weapon: weaponName,
          modelCount: detected.modelCount,
          confidence: detected.source === 'fraction' ? 'high' : 'medium',
          evidence: `[${detected.source}] ${detected.evidence}`,
        });
      }
    }
  });

  console.log(`${candidates.length} candidates`);
  return candidates;
}

async function main() {
  const factions = TARGET_FACTION
    ? FACTIONS.filter(f => f.slug === TARGET_FACTION)
    : FACTIONS;

  console.log(`\nAnalyzing ${factions.length} faction(s) for partial-model weapons…\n`);

  const all = [];
  for (const faction of factions) {
    const results = await analyzeFaction(faction);
    all.push(...results);
    await sleep(600);
  }

  // De-duplicate by unit+weapon (same pair may appear from multiple strategies)
  const seen = new Set();
  const deduped = all.filter(c => {
    const key = `${c.unit}||${c.weapon}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  console.log(`\n${'─'.repeat(100)}`);
  console.log(`CANDIDATES (${deduped.length} total)\n`);

  // Group by faction
  const byFaction = {};
  for (const c of deduped) {
    (byFaction[c.faction] = byFaction[c.faction] || []).push(c);
  }

  for (const [faction, rows] of Object.entries(byFaction)) {
    console.log(`\n── ${faction.toUpperCase()} ──`);
    for (const r of rows) {
      console.log(`  ${r.unit} (size ${r.unitSize})`);
      console.log(`    Weapon    : ${r.weapon}`);
      console.log(`    Model cnt : ${r.modelCount}  [confidence: ${r.confidence}]`);
      console.log(`    Evidence  : ${r.evidence.slice(0, 200)}`);
    }
  }

  // Emit ready-to-paste JSON block for weaponModelOverrides.json
  console.log(`\n${'─'.repeat(100)}`);
  console.log('SUGGESTED weaponModelOverrides.json entries (review before applying):\n');
  const overrides = {};
  for (const c of deduped) {
    if (!overrides[c.unit]) overrides[c.unit] = {};
    overrides[c.unit][c.weapon] = typeof c.modelCount === 'number' ? c.modelCount : '?';
  }
  console.log(JSON.stringify(overrides, null, 2));
}

main().catch(console.error);
