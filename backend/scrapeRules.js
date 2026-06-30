const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { getDb, initDb } = require('./db');

const BASE_URL = 'https://wahapedia.ru/aos4/factions';

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

function parseAbilityBlock($, block) {
  // Skip nested blocks
  if ($(block).parents('.BreakInsideAvoid').length > 0) return null;

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

  // Convert block elements to newlines for text extraction
  const bodyClone = abBody.clone();
  bodyClone.find('.ShowFluff.legend4').remove(); // strip flavour text
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
  };
}

// Collect all .BreakInsideAvoid blocks that belong to a section identified by
// an h2.outline_header3 whose text matches sectionTitle. Returns an array of
// cheerio elements. Also optionally calls onFormationName(name) each time an
// h3.h2_pge sub-heading is encountered within the section.
function collectSectionBlocks($, html, sectionTitle) {
  const results = []; // { formationName, block }
  let inSection = false;
  let currentFormation = '';

  // Walk every element in document order using a flat selector
  $('h2.outline_header3, h3.h2_pge, div.BreakInsideAvoid').each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const $el = $(el);

    if (tag === 'h2') {
      const text = $el.text().trim();
      inSection = text === sectionTitle;
      currentFormation = ''; // reset sub-section on any h2
      return;
    }

    if (!inSection) return;

    if (tag === 'h3') {
      currentFormation = normalizeText($el.text());
      return;
    }

    if ($el.hasClass('BreakInsideAvoid')) {
      // Skip nested blocks
      if ($el.parents('.BreakInsideAvoid').length > 0) return;
      results.push({ formationName: currentFormation, block: el });
    }
  });

  return results;
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
      return { traits: [], formations: [] };
    }
    html = await res.text();
  } catch (err) {
    console.warn(`  Error fetching ${faction.name}: ${err.message}`);
    return { traits: [], formations: [] };
  }

  const $ = cheerio.load(html);

  // --- Battle Traits ---
  const traits = [];
  const traitBlocks = collectSectionBlocks($, html, 'Battle Traits');
  for (const { block } of traitBlocks) {
    const ability = parseAbilityBlock($, block);
    if (ability) {
      traits.push({ ...ability, faction_slug: faction.slug, faction_name: faction.name });
    }
  }

  // --- Battle Formations ---
  const formations = [];
  const formationBlocks = collectSectionBlocks($, html, 'Battle Formations');
  for (const { formationName, block } of formationBlocks) {
    const ability = parseAbilityBlock($, block);
    if (ability) {
      formations.push({
        ...ability,
        faction_slug: faction.slug,
        faction_name: faction.name,
        formation_name: formationName || 'General',
      });
    }
  }

  console.log(`  ${faction.name}: ${traits.length} traits, ${formations.length} formations`);
  return { traits, formations };
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
    console.log(`Patching rules for: ${factionsToScrape[0].name}\n`);
  } else {
    db.prepare('DELETE FROM faction_battle_traits').run();
    db.prepare('DELETE FROM faction_battle_formations').run();
    console.log('Cleared existing rules data.\n');
  }

  const insertTrait = db.prepare(`
    INSERT INTO faction_battle_traits
      (faction_slug, faction_name, name, timing, declare, effect, bullets, keywords)
    VALUES
      (@faction_slug, @faction_name, @name, @timing, @declare, @effect, @bullets, @keywords)
  `);

  const insertFormation = db.prepare(`
    INSERT INTO faction_battle_formations
      (faction_slug, faction_name, formation_name, name, timing, declare, effect, bullets, keywords)
    VALUES
      (@faction_slug, @faction_name, @formation_name, @name, @timing, @declare, @effect, @bullets, @keywords)
  `);

  let totalTraits = 0;
  let totalFormations = 0;

  for (const faction of factionsToScrape) {
    console.log(`\nScraping ${faction.name}...`);
    const { traits, formations } = await scrapeFactionRules(faction);

    db.transaction(() => {
      for (const t of traits) insertTrait.run(t);
      for (const f of formations) insertFormation.run(f);
    })();

    totalTraits += traits.length;
    totalFormations += formations.length;

    await sleep(1500);
  }

  db.close();
  console.log(`\n✅ Rules scraping complete! ${totalTraits} battle traits, ${totalFormations} battle formation abilities saved.`);
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

module.exports = { scrapeAllRules };
