const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { getDb, initDb } = require('./db');

const BASE_URL = 'https://wahapedia.ru/aos4/factions';

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

// Wahapedia (a Russian site) mixes Cyrillic homoglyphs into English text.
// Normalize to pure printable ASCII so SQLite LIKE searches work correctly.
const CYRILLIC_MAP = {
  'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X',
  'а':'a','е':'e','о':'o','р':'p','с':'c','у':'y','х':'x',
  '’':"'",'‘':"'",'“':'"','u201D':'"',
};
function normalizeName(str) {
  // First apply known homoglyph map, then strip anything still outside printable ASCII
  return str
    .replace(/./gu, ch => CYRILLIC_MAP[ch] ?? ch)
    .replace(/[^\x20-\x7E]/g, '');
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
    // Unit name is in .wsHeaderIn — strip the inner search-link anchor
    const nameEl = $(el).find('.wsHeaderIn').first();
    nameEl.find('a').remove();
    const name = normalizeName(nameEl.text().trim().replace(/^[^a-zA-Z0-9]+/, ''));
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
          weapons.push({
            type: 'ranged',
            name: weaponName,
            range:   $(cells[3]).text().trim(),
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
    $(el).find('.BreakInsideAvoid').each((_, block) => {
      const abBody = $(block).find('.abBody').first();
      if (!abBody.length) return;
      const timing = $(block).find('.abHeader').first().clone().find('img').remove().end().text().trim();
      const firstBold = abBody.find('b').first().text().replace(/:/g, '').trim();
      if (!firstBold || firstBold === 'Effect' || firstBold === 'KEYWORDS') return;
      const bodyText = abBody.text().replace(/\s+/g, ' ').trim();
      const effectMatch = bodyText.match(/Effect:\s*(.+)/i);
      abilities.push({
        name: firstBold,
        timing,
        effect: effectMatch ? effectMatch[1].trim() : '',
      });
    });

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
    const baseMatch = rawText.match(/Base size[^:]*:\s*([^\n<]+)/i);

    // Keywords from wsKeywordLine1 and wsKeywordLine2
    const kwLine1 = $(el).find('.wsKeywordLine1 .kwb').map((_, e) => $(e).text().trim()).get();
    const kwLine2 = $(el).find('.wsKeywordLine2 .kwb').map((_, e) => $(e).text().trim()).get();
    const allKeywords = [...new Set([...kwLine1, ...kwLine2])].filter(Boolean);
    const keywords = allKeywords.join(', ');

    const kwText = allKeywords.join(' ');
    const isHero       = /\bHERO\b/.test(kwText);
    const isMonster    = /\bMONSTER\b/.test(kwText);
    const isCavalry    = /\bCAVALRY\b/.test(kwText);
    const isInfantry   = /\bINFANTRY\b/.test(kwText);
    const isUnique     = /\bUNIQUE\b/.test(kwText);
    const isWarMachine = /\bWAR\s+MACHINE\b/.test(kwText);
    const isTerrain    = /\bFACTION\s+TERRAIN\b/.test(kwText);
    const isLegends    = /Warhammer Legends/i.test(rawText);

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
      abilities: JSON.stringify(abilities),
      weapons:   JSON.stringify(weapons),
      is_hero:        isHero       ? 1 : 0,
      is_monster:     isMonster    ? 1 : 0,
      is_cavalry:     isCavalry    ? 1 : 0,
      is_infantry:    isInfantry   ? 1 : 0,
      is_unique:      isUnique     ? 1 : 0,
      is_war_machine: isWarMachine ? 1 : 0,
      is_terrain:     isTerrain    ? 1 : 0,
      is_legends:     isLegends    ? 1 : 0,
      url,
    });
  });

  console.log(`  Found ${units.length} units for ${faction.name}`);
  return units;
}

async function scrapeAll() {
  initDb();
  const db = getDb();

  db.prepare('DELETE FROM warscrolls').run();
  console.log('Cleared existing warscroll data.\n');

  const insert = db.prepare(`
    INSERT INTO warscrolls (
      name, faction, faction_slug, grand_alliance,
      move, health, control, save, ward,
      points, unit_size, base_size,
      keywords, abilities, weapons,
      is_hero, is_monster, is_cavalry, is_infantry,
      is_unique, is_war_machine, is_terrain, is_legends, url
    ) VALUES (
      @name, @faction, @faction_slug, @grand_alliance,
      @move, @health, @control, @save, @ward,
      @points, @unit_size, @base_size,
      @keywords, @abilities, @weapons,
      @is_hero, @is_monster, @is_cavalry, @is_infantry,
      @is_unique, @is_war_machine, @is_terrain, @is_legends, @url
    )
  `);

  let totalUnits = 0;

  for (const faction of FACTIONS) {
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

scrapeAll().catch(err => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
