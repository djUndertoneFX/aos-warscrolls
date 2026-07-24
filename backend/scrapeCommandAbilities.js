/**
 * Scrapes the Core Rules "Commands" (Command Point abilities) from
 * Wahapedia's core-rules page — not faction-specific, one universal set
 * every army can use. Battle Buddy's Command Point Abilities section was a
 * placeholder ("not tracked yet") until this existed; see BattleBuddyPage.js.
 *
 * Reuses the same .BreakInsideAvoid/.abHeader/.abBody block structure (and
 * the same collectSectionBlocks/parseAbilityBlock helpers) faction rule
 * pages already use — confirmed identical markup on this page, just under
 * plain h2 headings ("2.0 Hero Phase Commands" etc.) instead of a faction's
 * outline_header3 ones.
 *
 * Run: node scrapeCommandAbilities.js
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { getDb, initDb } = require('./db');
const { collectSectionBlocks, parseAbilityBlock } = require('./scrapeRules');
const { isAmbiguousTiming, resolvePhaseKeyString } = require('./phaseKey');

const CORE_RULES_URL = process.env.AOS_CORE_RULES_URL || 'https://waha' + 'pedia.ru/aos4/the-rules/the-core-rules/';

// Exact h2 text on the page (includes the book's own numbering) — matched
// verbatim by collectSectionBlocks, same convention as faction sections.
const SECTIONS = [
  '2.0 Hero Phase Commands',
  '3.0 Movement Phase Commands',
  '4.0 Shooting Phase Commands',
  '5.0 Charge Phase Commands',
  '6.0 Attacking (Shooting and Combat) Commands',
  '7.0 Defensive Commands',
  '8.0 End of Turn Commands',
];

async function scrapeCommandAbilities() {
  initDb();
  const db = getDb();

  console.log(`Fetching: ${CORE_RULES_URL}`);
  let html;
  try {
    const res = await fetch(CORE_RULES_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 20000,
    });
    if (!res.ok) { console.error(`HTTP ${res.status}`); db.close(); return; }
    html = await res.text();
  } catch (err) {
    console.error('Fetch error:', err.message);
    db.close();
    return;
  }

  const $ = cheerio.load(html);
  const all = [];
  const nameToTiming = new Map();

  for (const section of SECTIONS) {
    let count = 0;
    for (const { block, skipNestGuard } of collectSectionBlocks($, null, section)) {
      const ability = parseAbilityBlock($, block, skipNestGuard);
      if (!ability) continue;
      // Command-point cost badge — not part of any other scraped ability
      // type, so parseAbilityBlock doesn't extract it; grabbed here instead.
      const cpCost = $(block).find('.abCommandPointsN').first().text().trim() || null;
      const entry = { ...ability, section, cp_cost: cpCost };
      all.push(entry);
      nameToTiming.set(entry.name.toUpperCase(), entry.timing);
      count++;
    }
    console.log(`  ${section}: ${count}`);
  }

  // Most commands' own timing already names a phase directly ("Any Hero
  // Phase", "Enemy Movement Phase") — only the Reaction-timed ones (e.g.
  // "Reaction: You declared a RUN ability") need the same ambiguous-timing
  // detection every other ability category now gets (see backend/phaseKey.js).
  for (const entry of all) {
    entry.phase_key = isAmbiguousTiming(entry.timing)
      ? resolvePhaseKeyString(entry, { nameToTiming, table: 'core_commands' })
      : null;
  }

  db.prepare('DELETE FROM core_command_abilities').run();
  const insert = db.prepare(`
    INSERT INTO core_command_abilities
      (section, name, timing, declare, effect, bullets, keywords, lore_text, cp_cost, phase_key)
    VALUES
      (@section, @name, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @cp_cost, @phase_key)
  `);
  const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(r); });
  insertMany(all);

  db.close();
  console.log(`\n✅ Command abilities scraped: ${all.length} saved.`);
}

if (require.main === module) {
  scrapeCommandAbilities().catch(err => {
    console.error('Scraper failed:', err);
    process.exit(1);
  });
}

module.exports = { scrapeCommandAbilities };
