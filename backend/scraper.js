const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { getDb, initDb } = require('./db');

const IMAGE_DIR = process.env.IMAGE_DIR ||
  (process.env.DB_PATH
    ? path.join(path.dirname(process.env.DB_PATH), 'unit-images')
    : path.join(__dirname, 'unit-images'));

const LEXICANUM_BASE = 'https://ageofsigmar.lexicanum.com';

const BASE_URL = process.env.AOS_DATA_SRC || 'https://wh' + 'apedia.ru/aos4/factions';

const FACTIONS = [
  // Order
  { slug: 'stormcast-eternals',   name: 'Stormcast Eternals',   alliance: 'Order' },
  { slug: 'cities-of-sigmar',     name: 'Cities of Sigmar',     alliance: 'Order' },
  { slug: 'daughters-of-khaine',  name: 'Daughters of Khaine',  alliance: 'Order' },
  { slug: 'fyreslayers',          name: 'Fyreslayers',           alliance: 'Order' },
  { slug: 'idoneth-deepkin',      name: 'Idoneth Deepkin',       alliance: 'Order' },
  { slug: 'kharadron-overlords',  name: 'Kharadron Overlords',   alliance: 'Order' },
  { slug: 'lumineth-realm-lords', name: 'Lumineth Realm-lords',  alliance: 'Order' },
  { slug: 'seraphon',             name: 'Seraphon',              alliance: 'Order' },
  { slug: 'sylvaneth',            name: 'Sylvaneth',             alliance: 'Order' },
  // Chaos
  { slug: 'blades-of-khorne',     name: 'Blades of Khorne',      alliance: 'Chaos' },
  { slug: 'disciples-of-tzeentch',name: 'Disciples of Tzeentch', alliance: 'Chaos' },
  { slug: 'hedonites-of-slaanesh',name: 'Hedonites of Slaanesh', alliance: 'Chaos' },
  { slug: 'maggotkin-of-nurgle',  name: 'Maggotkin of Nurgle',   alliance: 'Chaos' },
  { slug: 'skaven',               name: 'Skaven',                alliance: 'Chaos' },
  { slug: 'slaves-to-darkness',   name: 'Slaves to Darkness',    alliance: 'Chaos' },
  // Death
  { slug: 'flesh-eater-courts',   name: 'Flesh-eater Courts',    alliance: 'Death' },
  { slug: 'nighthaunt',           name: 'Nighthaunt',            alliance: 'Death' },
  { slug: 'ossiarch-bonereapers', name: 'Ossiarch Bonereapers',  alliance: 'Death' },
  { slug: 'soulblight-gravelords',name: 'Soulblight Gravelords', alliance: 'Death' },
  // Destruction
  { slug: 'gloomspite-gitz',      name: 'Gloomspite Gitz',       alliance: 'Destruction' },
  { slug: 'ironjawz',             name: 'Ironjawz',              alliance: 'Destruction' },
  { slug: 'kruleboyz',            name: 'Kruleboyz',             alliance: 'Destruction' },
  { slug: 'ogor-mawtribes',       name: 'Ogor Mawtribes',        alliance: 'Destruction' },
  { slug: 'sons-of-behemat',      name: 'Sons of Behemat',       alliance: 'Destruction' },
];

// The community data source mixes Cyrillic and Greek homoglyphs into English text.
// All keys use \uXXXX escapes so the source file stays ASCII-safe.
const HOMOGLYPH_MAP = {
  // Cyrillic uppercase
  '\u0410':'A','\u0412':'B','\u0415':'E','\u041a':'K','\u041c':'M',
  '\u041d':'H','\u041e':'O','\u0420':'P','\u0421':'C','\u0422':'T','\u0425':'X',
  // Cyrillic lowercase
  '\u0430':'a','\u0435':'e','\u043e':'o','\u0440':'p','\u0441':'c','\u0443':'u','\u0445':'x',
  // Greek uppercase lookalikes
  '\u0391':'A','\u0395':'E','\u039f':'O','\u03a1':'P',
  // Greek lowercase lookalikes
  '\u03b1':'a','\u03b5':'e','\u03bf':'o','\u03c1':'p','\u03c5':'u',
  // Other Latin lookalikes
  '\u0251':'a','\u1d00':'A','\u0261':'g',
  // Smart quotes -> straight quotes
  '\u2018':"'",'\u2019':"'",'\u201c':'"','\u201d':'"',
  // En/em dash -> hyphen
  '\u2013':'-','\u2014':'-',
};
function normalizeName(str) {
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')           // strip combining diacritical marks
    .replace(/./gu, ch => HOMOGLYPH_MAP[ch] != null ? HOMOGLYPH_MAP[ch] : ch)
    .replace(/[^\x20-\x7E]/g, ' ')             // replace remaining non-ASCII with space
    .replace(/[\s]+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeFaction(faction) {
  const url = `${BASE_URL}/${faction.slug}/warscrolls.html`;
  console.log(`  Fetching: ${url}`);

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    });
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} for ${faction.name}, skipping.`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    console.warn(`  Error fetching ${faction.name}: ${err.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const units = [];

  // Each warscroll is a div with class "datasheet"
  $('.datasheet').each((i, el) => {
    // Unit name is in .wsHeaderIn. The HTML mixes bare text nodes with child
    // elements, so we pad each child element with spaces before extracting
    // text — this ensures both parts join with a space rather than merging.
    const nameEl = $(el).find('.wsHeaderIn').first();
    nameEl.find('a').remove();
    nameEl.children().each((_, child) => {
      const $c = $(child);
      $c.replaceWith(' ' + $c.text().trim() + ' ');
    });
    const rawName = nameEl.text().replace(/\s+/g, ' ').trim();
    const name = normalizeName(rawName.replace(/^[^a-zA-Z0-9]+/, ''));
    if (!name || name.length > 100) return;

    // Skip Regiments of Renown / allied units whose nails-header names a DIFFERENT faction.
    // We only skip if the header positively identifies another faction — not if it's absent or
    // uses non-standard text, so unique heroes with unusual headers still get included.
    const nailsText = $(el).find('.nails-header').first().text().toUpperCase();
    if (nailsText) {
      const belongsHere = nailsText.includes(faction.name.toUpperCase());
      const belongsElsewhere = !belongsHere && FACTIONS.some(f => nailsText.includes(f.name.toUpperCase()));
      if (belongsElsewhere) {
        console.log(`    [skip] "${name}" — header says "${nailsText.trim()}" (not ${faction.name})`);
        return;
      }
    }

    // Parse weapons from each .wTable
    const weapons = [];
    $(el).find('.wTable').each((_, table) => {
      const headerRow = $(table).find('tr.wsHeaderRow').first();
      const isRanged = headerRow.find('.wsHeaderCellName_RangedWeapons').length > 0;
      const isMelee  = headerRow.find('.wsHeaderCellName_MeleeWeapons').length > 0;
      if (!isRanged && !isMelee) return;

      $(table).find('tr.wsDataRow').not('.wsDataRow_short').each((_, row) => {
        const cells = $(row).find('td');
        // Weapon name: first text node of cell[2]
        const weaponName = $(cells[2]).contents()
          .filter((_, n) => n.type === 'text').first().text().trim();
        if (!weaponName) return;

        if (isRanged && cells.length >= 9) {
          // Some units (e.g. monsters) put all weapons in a single "ranged" table.
          // Classify by the actual range value: a real distance = ranged, dash/blank = melee.
          const rangeVal = $(cells[3]).text().trim();
          const actualType = (rangeVal && rangeVal !== '-' && rangeVal !== '—') ? 'ranged' : 'melee';
          weapons.push({
            type: actualType,
            name: weaponName,
            range:   actualType === 'ranged' ? rangeVal : '-',
            attacks: $(cells[4]).text().trim(),
            hit:     $(cells[5]).text().trim(),
            wound:   $(cells[6]).text().trim(),
            rend:    $(cells[7]).text().trim(),
            damage:  $(cells[8]).text().trim(),
          });
        } else if (isMelee && cells.length >= 8) {
          weapons.push({
            type: 'melee',
            name: weaponName,
            range: '-',
            attacks: $(cells[3]).text().trim(),
            hit:     $(cells[4]).text().trim(),
            wound:   $(cells[5]).text().trim(),
            rend:    $(cells[6]).text().trim(),
            damage:  $(cells[7]).text().trim(),
          });
        }
      });
    });

    // Parse abilities from .BreakInsideAvoid blocks
    const abilities = [];
    const seenAbilityNames = new Set();
    $(el).find('.BreakInsideAvoid').each((_, block) => {
      // Skip if this block is nested inside another .BreakInsideAvoid (avoids double-parse)
      if ($(block).parents('.BreakInsideAvoid').length > 0) return;
      const abBody = $(block).find('.abBody').first();
      if (!abBody.length) return;
      const timing = $(block).find('.abHeader').first().clone().find('img').remove().end().text().trim();
      const firstBold = abBody.find('b').first().text().replace(/:/g, '').trim();
      if (!firstBold || firstBold === 'Effect' || firstBold === 'KEYWORDS') return;
      if (seenAbilityNames.has(firstBold)) return;
      seenAbilityNames.add(firstBold);

      // Convert list items to bullet markers, preserve line breaks at block boundaries
      abBody.find('li').each((_, li) => {
        $(li).replaceWith('\n• ' + $(li).text().trim());
      });
      abBody.find('p, br, div').each((_, node) => {
        $(node).replaceWith('\n' + $(node).text());
      });
      const bodyText = abBody.text()
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // Extract Declare section (text between "Declare:" and "Effect:")
      const declareMatch = bodyText.match(/Declare:\s*([\s\S]+?)(?=\n*Effect:)/i);
      // Extract Effect section
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

      abilities.push({
        name:    firstBold,
        timing,
        declare: declareMatch ? declareMatch[1].replace(/\s+/g, ' ').trim() : '',
        effect:  effectIntro,
        bullets,
      });
    });

    // Flavor text: lore prose stored in .ShowFluff / .wsLegend
    const flavorEl = $(el).find('.ShowFluff').first();
    const flavorText = flavorEl.length
      ? flavorEl.text().replace(/\s+/g, ' ').trim()
      : '';

    // Options text: weapon choices / unit composition are in .wsDescription
    // (a block that sits between the weapon tables and ability blocks)
    const descEl = $(el).find('.wsDescription').first();
    const optionsText = descEl.length
      ? descEl.text().replace(/\s+/g, ' ').trim()
      : '';

    // Stats from the AoS profile block
    const move    = $(el).find('.wsMove').first().text().trim();
    const health  = $(el).find('.wsWounds').first().text().trim();
    const save    = $(el).find('.wsSave').first().text().trim();
    const control = $(el).find('.wsBravery').first().text().trim();
    const ward    = $(el).find('.wsWard').first().text().trim();

    // Points and unit size from pitched battle profile text
    const profileText = $(el).find('.ShowPitchedBattleProfile').text();
    const pointsMatch = profileText.match(/Points[^:]*:\s*(\d+)/i)
      || $(el).text().match(/Points<\/span>[^:]*:\s*(\d+)/);
    const rawText = $(el).text();
    const pointsNum = rawText.match(/Points[^\d]*(\d+)/);
    const sizeNum   = rawText.match(/Unit Size[^\d]*(\d+)/i);
    const baseMatch = rawText.match(/Base size[^:]*:\s*([^\s,;]+)/i);

    // Keywords from wsKeywordLine1 and wsKeywordLine2.
    // Multi-word faction names are stored as separate .kwb elements
    // (e.g. "IDONETH" + "DEEPKIN"). Merge consecutive tokens that together
    // match a known faction name so they display as one keyword.
    function parseKwLine(selector) {
      const fullText = $(el).find(selector).text();
      return fullText.split(',').map(k => {
        const trimmed = k.trim();
        if (!trimmed) return '';
        // Preserve "(N)" or "(N+)" suffix (e.g. WIZARD (2), PRIEST (1), WARD (5+))
        const m = trimmed.match(/^(.+?)\s*\((\d+\+?)\)\s*$/);
        if (m) return normalizeName(m[1]).toUpperCase() + ` (${m[2]})`;
        return normalizeName(trimmed).toUpperCase();
      }).filter(Boolean);
    }
    const kwLine1 = parseKwLine('.wsKeywordLine1');
    const kwLine2 = parseKwLine('.wsKeywordLine2');
    // Real AoS keywords never contain bare digits — filter out composition notes like "CHAMPION 18"
    // Strip trailing (N)/(N+) suffix before checking, so "WIZARD (2)" is preserved
    const allKeywords = [...new Set([...kwLine1, ...kwLine2])].filter(k => k && !/\d/.test(k.replace(/\s*\(\d+\+?\)\s*$/, '')));
    const keywords = allKeywords.join(', ');

    const kwText = allKeywords.join(' ');
    const isHero            = /\bHERO\b/.test(kwText);
    const isMonster         = /\bMONSTER\b/.test(kwText);
    const isCavalry         = /\bCAVALRY\b/.test(kwText);
    const isInfantry        = /\bINFANTRY\b/.test(kwText);
    const isBeast           = /\bBEAST\b/.test(kwText);
    const isUnique          = /\bUNIQUE\b/.test(kwText);
    const isWarMachine      = /\bWAR\s+MACHINE\b/.test(kwText);
    const isTerrain         = /\bFACTION\s+TERRAIN\b/.test(kwText);
    const isManifestation   = /\bMANIFESTATION\b/.test(kwText);
    const isLegends         = /Warhammer Legends/i.test(rawText);

    units.push({
      name,
      faction: faction.name,
      faction_slug: faction.slug,
      grand_alliance: faction.alliance,
      move,
      health,
      save,
      control,
      ward,
      points: pointsNum ? pointsNum[1] : '',
      unit_size: sizeNum ? sizeNum[1] : '',
      base_size: baseMatch ? baseMatch[1].trim() : '',
      keywords,
      abilities:    JSON.stringify(abilities),
      weapons:      JSON.stringify(weapons),
      flavor_text:  flavorText,
      options_text: optionsText,
      is_hero:          isHero          ? 1 : 0,
      is_monster:       isMonster       ? 1 : 0,
      is_cavalry:       isCavalry       ? 1 : 0,
      is_infantry:      isInfantry      ? 1 : 0,
      is_beast:         isBeast         ? 1 : 0,
      is_unique:        isUnique        ? 1 : 0,
      is_war_machine:   isWarMachine    ? 1 : 0,
      is_terrain:       isTerrain       ? 1 : 0,
      is_manifestation: isManifestation ? 1 : 0,
      is_legends:       isLegends       ? 1 : 0,
      url,
    });
  });

  console.log(`  Found ${units.length} units for ${faction.name}`);
  return units;
}

async function scrapeAll(targetSlug = null) {
  initDb();
  const db = getDb();

  if (targetSlug) {
    // Patch mode: delete only the target faction and re-insert it
    const faction = FACTIONS.find(f => f.slug === targetSlug);
    if (!faction) { console.error(`Unknown faction slug: ${targetSlug}`); db.close(); return; }
    db.prepare('DELETE FROM warscrolls WHERE faction_slug = ?').run(targetSlug);
    console.log(`Patching faction: ${faction.name}\n`);
  } else {
    db.prepare('DELETE FROM warscrolls').run();
    console.log('Cleared existing warscroll data.\n');
  }

  const insert = db.prepare(`
    INSERT INTO warscrolls (
      name, faction, faction_slug, grand_alliance,
      move, health, control, save, ward,
      points, unit_size, base_size,
      keywords, abilities, weapons,
      flavor_text, options_text,
      is_hero, is_monster, is_cavalry, is_infantry, is_beast,
      is_unique, is_war_machine, is_terrain, is_manifestation, is_legends, url
    ) VALUES (
      @name, @faction, @faction_slug, @grand_alliance,
      @move, @health, @control, @save, @ward,
      @points, @unit_size, @base_size,
      @keywords, @abilities, @weapons,
      @flavor_text, @options_text,
      @is_hero, @is_monster, @is_cavalry, @is_infantry, @is_beast,
      @is_unique, @is_war_machine, @is_terrain, @is_manifestation, @is_legends, @url
    )
  `);

  let totalUnits = 0;
  const factionsToScrape = targetSlug ? FACTIONS.filter(f => f.slug === targetSlug) : FACTIONS;

  for (const faction of factionsToScrape) {
    console.log(`\nScraping ${faction.name}...`);
    const units = await scrapeFaction(faction);

    const insertMany = db.transaction((units) => {
      for (const u of units) insert.run(u);
    });
    insertMany(units);
    totalUnits += units.length;

    await sleep(1500);
  }

  db.close();
  console.log(`\n✅ Scraping complete! Saved ${totalUnits} warscrolls to database.`);
}

// ── Image scraping from Lexicanum ────────────────────────────────────────────

function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9 ']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeImages() {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  const db = getDb();

  console.log('\n📷 Scraping unit images from Lexicanum...');

  let html;
  try {
    const res = await fetch(`${LEXICANUM_BASE}/wiki/List_of_units`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      compress: true,
    });
    if (!res.ok) {
      console.error(`  Lexicanum fetch failed: HTTP ${res.status}`);
      db.close();
      return;
    }
    html = await res.text();
  } catch (err) {
    console.error('  Lexicanum fetch error:', err.message);
    db.close();
    return;
  }

  const $ = cheerio.load(html);

  // Build map: normalizedName -> imageUrl
  const imageMap = {};
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;

    // Image is usually in first cell, name in second
    let imgSrc = null;
    const img = $(cells[0]).find('img').first();
    if (img.length) {
      imgSrc = img.attr('src') || img.attr('data-src') || '';
      if (imgSrc && !imgSrc.startsWith('http')) {
        imgSrc = LEXICANUM_BASE + imgSrc;
      }
    }

    // Get unit name from the row — try second cell first, then first cell text
    let unitName = $(cells[1]).text().trim() || $(cells[0]).text().trim();
    // Strip any sub-text in parens like "(Legend)"
    unitName = unitName.replace(/\s*\(.*?\)\s*/g, '').trim();

    if (unitName && imgSrc && imgSrc.includes('/mediawiki/')) {
      const key = normalizeName(unitName);
      if (key && !imageMap[key]) {
        imageMap[key] = imgSrc;
      }
    }
  });

  console.log(`  Found ${Object.keys(imageMap).length} image entries on Lexicanum`);

  // Load all warscrolls from DB
  const warscrolls = db.prepare('SELECT id, name FROM warscrolls').all();
  const updateStmt = db.prepare('UPDATE warscrolls SET image_path = ? WHERE id = ?');

  let matched = 0;
  let downloaded = 0;

  for (const ws of warscrolls) {
    const key = normalizeName(ws.name);
    let imgUrl = imageMap[key];

    // Fallback: try partial match
    if (!imgUrl) {
      for (const [k, v] of Object.entries(imageMap)) {
        if (k.startsWith(key) || key.startsWith(k)) {
          imgUrl = v;
          break;
        }
      }
    }

    if (!imgUrl) continue;
    matched++;

    const imgPath = path.join(IMAGE_DIR, `${ws.id}.jpg`);

    // Skip download if already exists
    if (!fs.existsSync(imgPath)) {
      try {
        const imgRes = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `${LEXICANUM_BASE}/wiki/List_of_units`,
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'same-origin',
          },
          compress: true,
        });
        if (imgRes.ok) {
          const buf = await imgRes.buffer();
          fs.writeFileSync(imgPath, buf);
          downloaded++;
          await sleep(200); // polite delay
        } else {
          console.warn(`  Image fetch failed for "${ws.name}": HTTP ${imgRes.status}`);
          continue;
        }
      } catch (err) {
        console.warn(`  Image download error for "${ws.name}": ${err.message}`);
        continue;
      }
    } else {
      downloaded++; // already on disk
    }

    updateStmt.run(imgPath, ws.id);
  }

  db.close();
  console.log(`  Matched ${matched} units, images saved for ${downloaded}`);
}

// ── Entry points ──────────────────────────────────────────────────────────────

if (require.main === module) {
  const factionArg = process.argv.includes('--faction')
    ? process.argv[process.argv.indexOf('--faction') + 1]
    : null;
  scrapeAll(factionArg).catch(err => {
    console.error('Scraper failed:', err);
    process.exit(1);
  });
}

module.exports = { scrapeImages };
