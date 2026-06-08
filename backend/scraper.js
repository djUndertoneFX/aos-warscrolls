/**
 * Wahapedia AoS4 Warscroll Scraper
 * Scrapes warscroll data from wahapedia.ru for all AoS4 factions.
 *
 * Usage: node scraper.js
 *
 * Note: Be respectful — adds a delay between requests.
 * Wahapedia data is community-maintained and free to use for personal projects.
 */

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
  { slug: 'beasts-of-chaos',      name: 'Beasts of Chaos',       alliance: 'Chaos' },
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
  { slug: 'bonesplitterz',        name: 'Bonesplitterz',         alliance: 'Destruction' },
  { slug: 'gloomspite-gitz',      name: 'Gloomspite Gitz',       alliance: 'Destruction' },
  { slug: 'ironjawz',             name: 'Ironjawz',              alliance: 'Destruction' },
  { slug: 'kruleboyz',            name: 'Kruleboyz',             alliance: 'Destruction' },
  { slug: 'ogor-mawtribes',       name: 'Ogor Mawtribes',        alliance: 'Destruction' },
  { slug: 'sons-of-behemat',      name: 'Sons of Behemat',       alliance: 'Destruction' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseStatBlock($, unitEl) {
  const stats = {};
  // Characteristics table
  const statRow = $(unitEl).find('.ws-stats-table tr, .unit-stats tr, table.stats tr').first();
  
  // Try multiple selectors for different wahapedia layouts
  const getText = (selector) => {
    const el = $(unitEl).find(selector);
    return el.length ? el.first().text().trim() : null;
  };

  // Parse the stat block from common Wahapedia HTML patterns
  $(unitEl).find('td, th').each((i, el) => {
    const label = $(el).text().trim().toUpperCase();
    const next = $(el).next('td');
    if (!next.length) return;
    const val = next.text().trim();
    if (label === 'MOVE' || label === 'M') stats.move = val;
    if (label === 'HEALTH' || label === 'W' || label === 'WOUNDS') stats.health = val;
    if (label === 'CONTROL' || label === 'BRA' || label === 'BRAVERY') stats.control = val;
    if (label === 'SAVE' || label === 'SV') stats.save = val;
    if (label === 'WARD') stats.ward = val;
  });

  return stats;
}

async function scrapeFaction(faction) {
  const url = `${BASE_URL}/${faction.slug}/warscrolls.html`;
  console.log(`  Fetching: ${url}`);

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AoS-Warscroll-App/1.0; personal project)',
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

  // Wahapedia uses div.warscroll or article.warscroll containers
  // Each unit block typically has a h3/h4 with the unit name and a stats table
  const unitBlocks = $('.warscroll, .unit-card, article.unit, div[id^="ws-"]');

  if (unitBlocks.length === 0) {
    // Fallback: try to find units by header pattern
    $('h3, h4').each((i, el) => {
      const name = $(el).text().trim();
      if (!name || name.length > 80) return;
      
      // Grab surrounding context
      const container = $(el).parent();
      const text = container.text();

      const stats = parseStatBlock($, container);

      // Extract points
      const pointsMatch = text.match(/Points?:\s*(\d+)/i);
      const sizeMatch = text.match(/Unit Size?:\s*([\d\s\-]+)/i);
      const baseMatch = text.match(/Base size?:\s*([^\n.]+)/i);

      // Extract keywords from uppercase word clusters
      const keywordsMatch = text.match(/Keywords?:([^\n]+)/i);
      const keywords = keywordsMatch
        ? keywordsMatch[1].split(/[,·]/).map(k => k.trim()).filter(Boolean).join(', ')
        : '';

      const isHero = /\bHERO\b/.test(text);
      const isMonster = /\bMONSTER\b/.test(text);
      const isCavalry = /\bCAVALRY\b/.test(text);
      const isInfantry = /\bINFANTRY\b/.test(text);
      const isUnique = /\bUNIQUE\b/.test(text);
      const isLegends = /Warhammer Legends/i.test(text);

      units.push({
        name,
        faction: faction.name,
        faction_slug: faction.slug,
        grand_alliance: faction.alliance,
        move: stats.move || '',
        health: stats.health || '',
        control: stats.control || '',
        save: stats.save || '',
        ward: stats.ward || '',
        points: pointsMatch ? pointsMatch[1] : '',
        unit_size: sizeMatch ? sizeMatch[1].trim() : '',
        base_size: baseMatch ? baseMatch[1].trim() : '',
        keywords,
        abilities: '',
        is_hero: isHero ? 1 : 0,
        is_monster: isMonster ? 1 : 0,
        is_cavalry: isCavalry ? 1 : 0,
        is_infantry: isInfantry ? 1 : 0,
        is_unique: isUnique ? 1 : 0,
        is_legends: isLegends ? 1 : 0,
        url,
      });
    });
  } else {
    unitBlocks.each((i, el) => {
      const name = $(el).find('h2, h3, h4, .unit-name, .ws-title').first().text().trim();
      if (!name) return;

      const text = $(el).text();
      const stats = parseStatBlock($, el);

      const pointsMatch = text.match(/Points?:\s*([\d\/]+)/i);
      const sizeMatch = text.match(/Unit Size?:\s*([\d\s\-]+)/i);
      const baseMatch = text.match(/Base size?:\s*([^\n.]+)/i);
      const keywordsMatch = text.match(/Keywords?:([^\n]+)/i);
      const keywords = keywordsMatch
        ? keywordsMatch[1].split(/[,·]/).map(k => k.trim()).filter(Boolean).join(', ')
        : '';

      const isHero = /\bHERO\b/.test(text);
      const isMonster = /\bMONSTER\b/.test(text);
      const isCavalry = /\bCAVALRY\b/.test(text);
      const isInfantry = /\bINFANTRY\b/.test(text);
      const isUnique = /\bUNIQUE\b/.test(text);
      const isLegends = /Warhammer Legends/i.test(text);

      units.push({
        name,
        faction: faction.name,
        faction_slug: faction.slug,
        grand_alliance: faction.alliance,
        move: stats.move || '',
        health: stats.health || '',
        control: stats.control || '',
        save: stats.save || '',
        ward: stats.ward || '',
        points: pointsMatch ? pointsMatch[1] : '',
        unit_size: sizeMatch ? sizeMatch[1].trim() : '',
        base_size: baseMatch ? baseMatch[1].trim() : '',
        keywords,
        abilities: '',
        is_hero: isHero ? 1 : 0,
        is_monster: isMonster ? 1 : 0,
        is_cavalry: isCavalry ? 1 : 0,
        is_infantry: isInfantry ? 1 : 0,
        is_unique: isUnique ? 1 : 0,
        is_legends: isLegends ? 1 : 0,
        url,
      });
    });
  }

  console.log(`  Found ${units.length} units for ${faction.name}`);
  return units;
}

async function scrapeAll() {
  initDb();
  const db = getDb();

  // Clear existing warscroll data
  db.prepare('DELETE FROM warscrolls').run();
  console.log('Cleared existing warscroll data.\n');

  const insert = db.prepare(`
    INSERT INTO warscrolls (
      name, faction, faction_slug, grand_alliance,
      move, health, control, save, ward,
      points, unit_size, base_size,
      keywords, abilities,
      is_hero, is_monster, is_cavalry, is_infantry,
      is_unique, is_legends, url
    ) VALUES (
      @name, @faction, @faction_slug, @grand_alliance,
      @move, @health, @control, @save, @ward,
      @points, @unit_size, @base_size,
      @keywords, @abilities,
      @is_hero, @is_monster, @is_cavalry, @is_infantry,
      @is_unique, @is_legends, @url
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

    // Be polite — 1.5s delay between factions
    await sleep(1500);
  }

  db.close();
  console.log(`\n✅ Scraping complete! Saved ${totalUnits} warscrolls to database.`);
}

scrapeAll().catch(err => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
