// Imports Anvil of Apotheosis (Path to Glory warlord creation) data from
// saved Wahapedia faction pages, for when wahapedia.ru can't be fetched
// directly (e.g. from a cloud workspace). Each file is a full faction page
// (https://wahapedia.ru/aos4/factions/<slug>/); the faction is taken from a
// leading "<!--SLUG:<slug>-->" comment, or from --faction when one file is given.
//
//   node tools/importApotheosisHtml.js page1.html page2.html ...
//   node tools/importApotheosisHtml.js --faction ogor-mawtribes ogor.html
//
// Replaces that faction's rows in faction_apotheosis_steps/options, same as
// `node scrapePathToGlory.js --faction <slug>` would.
const fs = require('fs');
const { getDb, initDb } = require('../db');
const { FACTIONS } = require('../scrapeRules');
const { parseApotheosisHtml } = require('../scrapePathToGlory');

const args = process.argv.slice(2);
let forced = null;
if (args[0] === '--faction') { forced = args[1]; args.splice(0, 2); }
if (!args.length) { console.error('Usage: node tools/importApotheosisHtml.js [--faction slug] <page.html>...'); process.exit(1); }

initDb();
const db = getDb();
const delSteps = db.prepare('DELETE FROM faction_apotheosis_steps WHERE faction_slug = ?');
const delOptions = db.prepare('DELETE FROM faction_apotheosis_options WHERE faction_slug = ?');
const insertStep = db.prepare(`
  INSERT INTO faction_apotheosis_steps (faction_slug, faction_name, step_number, step_title, intro_text, starting_weapon, starting_keywords)
  VALUES (@faction_slug, @faction_name, @step_number, @step_title, @intro_text, @starting_weapon, @starting_keywords)
`);
const insertOption = db.prepare(`
  INSERT INTO faction_apotheosis_options
    (faction_slug, faction_name, step_number, option_group, name, cost, timing, declare, effect, bullets, keywords, lore_text, sort_order, sub_abilities, phase_key)
  VALUES
    (@faction_slug, @faction_name, @step_number, @option_group, @name, @cost, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @sort_order, @sub_abilities, @phase_key)
`);

for (const file of args) {
  const html = fs.readFileSync(file, 'utf8');
  const slug = forced || (html.match(/<!--SLUG:([^>]+?)-->/) || [])[1];
  const faction = FACTIONS.find(f => f.slug === slug);
  if (!faction) { console.warn(`${file}: unknown faction "${slug}", skipped`); continue; }
  const { steps, options } = parseApotheosisHtml(html, faction);
  if (!steps.length) { console.log(`${faction.name}: no Anvil of Apotheosis section, skipped`); continue; }
  db.transaction(() => {
    delSteps.run(slug);
    delOptions.run(slug);
    for (const s of steps) insertStep.run({
      faction_slug: slug,
      faction_name: faction.name,
      ...s,
      starting_weapon: s.starting_weapon ? JSON.stringify(s.starting_weapon) : null,
      starting_keywords: s.starting_keywords ? JSON.stringify(s.starting_keywords) : null,
    });
    for (const o of options) insertOption.run({
      ...o,
      option_group: o.option_group || null,
      cost: o.cost || null,
      timing: o.timing || null,
      declare: o.declare || null,
      effect: o.effect || null,
      bullets: JSON.stringify(o.bullets || []),
      keywords: JSON.stringify(o.keywords || []),
      lore_text: o.lore_text || null,
      sub_abilities: o.sub_abilities?.length ? JSON.stringify(o.sub_abilities) : null,
      phase_key: o.phase_key || null,
    });
  })();
  console.log(`${faction.name}: ${steps.length} steps, ${options.length} options`);
}
db.close();
