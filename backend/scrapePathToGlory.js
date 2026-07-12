// Scrapes the "Path to Glory: The Anvil of Apotheosis" section from each
// faction's Wahapedia page — the per-faction warlord-creation steps (Destiny
// Point budget, Archetypes, Origins/Flaws, Battle Mounts, Upgrades, etc).
// Only factions with a released AoS 4th-edition battletome publish this
// section; others are simply skipped (no row written), and the frontend
// falls back to the plain Warlord Warscroll form for those.
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { getDb, initDb } = require('./db');
const { FACTIONS, BASE_URL, normalizeText, parseAbilityBlock } = require('./scrapeRules');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// `.find('tr')` returns every descendant <tr>, including rows that belong to
// a nested table inside one of this table's cells — this filters down to
// rows that genuinely belong to $table itself.
function ownRows($, $table) {
  return $table.find('tr').filter((_, tr) => $(tr).closest('table').get(0) === $table.get(0));
}

// Step 2 ("Fill Out The Starting Warscroll") shows a real blank warscroll
// datasheet — Move/Wounds/Save/Bravery(Control) are literal asterisk-icon
// placeholders in the source (there's no fixed starting value for those;
// they're entirely built up via later Destiny Point purchases), but the
// starting weapon profile and keyword list ARE concrete fixed data.
function parseStartingWeapon($, stepBlock) {
  const $table = $(stepBlock).find('table.wTable').first();
  if (!$table.length) return null;
  const headerRow = ownRows($, $table).filter((_, tr) => $(tr).hasClass('wsHeaderRow')).first();
  const isRanged = /RANGED WEAPONS/i.test(headerRow.text());
  const statKeys = headerRow.children('td.wsHeaderCell').map((_, td) => normalizeText($(td).text()).toLowerCase()).get();
  let best = null;
  $table.find('tbody.bkg').children('tr.wsDataRow').each((_, tr) => {
    const cells = $(tr).children('td');
    if (!best || cells.length > $(best).children('td').length) best = tr;
  });
  if (!best) return null;
  const $cells = $(best).children('td');
  const cells = $cells.map((_, td) => normalizeText($(td).text())).get();
  const $nameCell = $cells.eq(2).clone();
  $nameCell.find('br').replaceWith(' — ');
  const name = normalizeText($nameCell.text());
  if (!name) return null;
  const stats = cells.slice(3);
  const weapon = { name, type: isRanged ? 'ranged' : 'melee' };
  statKeys.forEach((key, i) => { if (key) weapon[key] = stats[i] || ''; });
  return weapon;
}

function parseStartingKeywords($, stepBlock) {
  const text = $(stepBlock).find('.wsKeywordLine1, .wsKeywordLine2')
    .map((_, td) => normalizeText($(td).text())).get().join(', ');
  return text.split(',').map(k => normalizeText(k)).filter(Boolean);
}

// Pull the "-2DP" / "0DP" / "+4DP" cost badge out of a cloned subtree,
// removing it so it doesn't pollute subsequent plain-text extraction.
function extractCost($scope) {
  const badge = $scope.find('.dp-badge').first();
  if (!badge.length) return null;
  const text = normalizeText(badge.text());
  badge.remove();
  return text || null;
}

// Weapon-profile tables on this page always appear in duplicate (a wide
// layout + a narrow-screen layout) with identical data — dedupe by name.
function extractWeaponLines($, $scope) {
  const lines = [];
  const seen = new Set();
  $scope.find('table.customTable').each((_, tableEl) => {
    const $table = $(tableEl);
    const headerCells = $table.find('tr').first().find('td,th').map((_, td) => normalizeText($(td).text())).get();
    if (!headerCells.some(h => h === 'Atk') || !headerCells.some(h => h === 'Hit')) return;
    const hasRng = headerCells.some(h => h === 'Rng');
    const rows = $table.find('tr').slice(1).toArray();
    let i = 0;
    while (i < rows.length) {
      const $row = $(rows[i]);
      const cells = $row.find('td');
      // A name-only row (colspan) precedes its stat row on the "narrow" table variant.
      if (cells.length === 1 || ($row.find('td[colspan]').length && cells.length < (hasRng ? 6 : 5))) {
        i++;
        continue;
      }
      const vals = cells.map((_, td) => normalizeText($(td).text())).get();
      // Wide-table rows: [icon?, name, (rng), atk, hit, wnd, rnd, dmg]
      const nameCell = $row.find('td').filter((_, td) => normalizeText($(td).text()).length > 2 && !/^[\d+"-]+$/.test(normalizeText($(td).text()))).first();
      const name = nameCell.length ? normalizeText(nameCell.clone().find('span').remove().end().text()).split('\n')[0] : null;
      const nums = vals.filter(v => /^[\d+"-]+$|^-$/.test(v));
      if (name && nums.length >= 4) {
        const key = name + '|' + nums.join(',');
        if (!seen.has(key)) {
          seen.add(key);
          const parts = [];
          let idx = 0;
          if (hasRng) { parts.push(`Rng ${nums[idx++]}`); }
          parts.push(`Atk ${nums[idx++]}`, `Hit ${nums[idx++]}`, `Wnd ${nums[idx++]}`);
          if (nums[idx]) parts.push(`Rnd ${nums[idx++]}`);
          if (nums[idx]) parts.push(`Dmg ${nums[idx++]}`);
          lines.push(`${name} — ${parts.join(', ')}`);
        }
      }
      i++;
    }
  });
  return lines;
}

// Flatten a "simple" (non-abHeader) option's description into readable text:
// keeps keyword spans as plain uppercase text, converts block elements to
// newlines, and folds in any nested weapon-profile tables as bullet lines.
function flattenEffect($, $scope) {
  const weaponLines = extractWeaponLines($, $scope);
  const clone = $scope.clone();
  // Only strip `.customTable`s (weapon-profile / small reference tables,
  // already captured above or discarded) — NOT the unclassed decorative
  // "Corner" table that structurally wraps the whole card; removing that
  // would delete all of the card's actual prose along with it.
  clone.find('table.customTable').remove();
  clone.find('br, p, div').each((_, node) => { $(node).replaceWith('\n' + $(node).text()); });
  const text = normalizeText(clone.text().replace(/\n{2,}/g, '\n'));
  return { text, bullets: weaponLines };
}

// Category labels used as the .hi_custom text when the real option name is
// instead a bold "NAME: ..." lead-in inside the prose (e.g. Companions,
// Origins/Flaws use this; Archetypes/Warclans use the hi_custom text as-is).
const GENERIC_CARD_LABELS = new Set(['companion', 'battle mount', 'origin', 'flaw', 'war form', 'contraption', 'moulder-beast']);

// Parse a Step 3/4/6-style "Columns2" or single-card block: one or more
// option cards marked only by a `.hi_custom` name + `.dp-badge` cost pair —
// there is often no per-option DOM wrapper at all (2 options side-by-side in
// a Columns2 layout get separate cells, but 3+ options are just stacked
// inline in ONE shared box, delimited purely by these marker pairs). So
// rather than trying to scope by ancestor element, split the shared box's
// raw HTML at each `.hi_custom` marker and re-parse each chunk on its own.
function parseCardOptions($, block, group) {
  const options = [];
  const $block = $(block);
  const containers = new Set();
  $block.find('.hi_custom').each((_, nameEl) => {
    const $c = $(nameEl).closest('div.BreakInsideAvoid.Corner22');
    if ($c.length) containers.add($c.get(0));
  });

  for (const containerEl of containers) {
    const innerHtml = $(containerEl).html() || '';
    const chunks = innerHtml.split(/(?=<div class="hi_custom">)/).filter(c => c.includes('hi_custom'));
    for (const chunk of chunks) {
      // Splitting mid-flow can orphan a closing </div> (e.g. a per-option
      // "text-align" wrapper that closes after the marker but before the
      // prose that follows it) — that stray tag would prematurely close a
      // single wrapping element, truncating everything after it. Scoping to
      // <body> instead survives that: browsers/htmlparser2 just drop
      // unmatched closing tags rather than misplacing later content.
      const $frag = cheerio.load(chunk);
      const $scope = $frag('body');
      const cost = extractCost($scope);
      const $nameEl = $scope.find('.hi_custom').first();
      const categoryLabel = normalizeText($nameEl.text());
      $nameEl.remove();

      const { text: effect, bullets } = flattenEffect($frag, $scope);
      // Pull a leading "NAME: rest of text" pattern out as the real name when
      // the hi_custom label is just a generic category (Companion, Flaw, etc).
      let name = categoryLabel;
      let finalEffect = effect;
      const leadMatch = effect.match(/^([A-Z][A-Z0-9 '\-]{2,40}):\s*(.*)$/s);
      if (leadMatch && (GENERIC_CARD_LABELS.has(categoryLabel.toLowerCase()) || !categoryLabel)) {
        name = normalizeText(leadMatch[1]);
        finalEffect = normalizeText(leadMatch[2]);
      }
      if (!name) continue;
      options.push({ option_group: group, name, cost, timing: null, declare: null, effect: finalEffect, bullets, keywords: [], lore_text: null });
    }
  }
  return options;
}

// Parse a Step 7/8-style "Upgrade | Effect" table into one option per row.
function parseUpgradeTable($, table) {
  const options = [];
  const $table = $(table);
  const rows = ownRows($, $table).toArray();
  if (rows.length < 2) return options;
  const headerText = normalizeText($(rows[0]).text());
  if (!/upgrade/i.test(headerText) || !/effect/i.test(headerText)) return options;
  for (const row of rows.slice(1)) {
    const $cells = $(row).children('td');
    if ($cells.length < 2) continue;
    const $nameCell = $($cells[0]).clone();
    const cost = extractCost($nameCell);
    const name = normalizeText($nameCell.text());
    if (!name) continue;
    const $effectCell = $($cells[1]).clone();
    // Nested full ability cards (e.g. Mighty Biovoltaic Blast) — extract via
    // the shared ability parser, drop from the plain-text flatten pass.
    const abilityBlocks = [];
    $effectCell.find('.abBody').each((_, abBodyEl) => {
      const $wrap = $(abBodyEl).closest('.BreakInsideAvoid');
      const parsed = parseAbilityBlock($, $wrap.length ? $wrap.get(0) : $(abBodyEl).parent().get(0), true);
      if (parsed) abilityBlocks.push(parsed);
      ($wrap.length ? $wrap : $(abBodyEl)).remove();
    });
    const { text: effect, bullets } = flattenEffect($, $effectCell);
    const allBullets = [...bullets];
    for (const ab of abilityBlocks) {
      const abLine = `${ab.timing ? '[' + ab.timing + '] ' : ''}${ab.name}${ab.declare ? ' — Declare: ' + ab.declare : ''}${ab.effect ? ' Effect: ' + ab.effect : ''}`;
      allBullets.push(abLine.trim());
    }
    options.push({ option_group: null, name, cost, timing: null, declare: null, effect, bullets: allBullets, keywords: [], lore_text: null });
  }
  return options;
}

// Parse Step 5-style Origins/Flaws: real ability cards (abHeader carries
// "Passive -1DP" etc — cost lives inside the timing text and must be split out).
function parseAbilityCardOptions($, block, group) {
  const options = [];
  $(block).find('.BreakInsideAvoid').each((_, el) => {
    // Only top-level cards *within this block* — .parents() alone would
    // also match the many BreakInsideAvoid wrappers further up the page
    // (Corner22 boxes, Columns2 containers, etc), skipping every card.
    if ($(el).parentsUntil(block, '.BreakInsideAvoid').length) return;
    if (!$(el).find('.abBody').length) return;
    const $headerClone = $(el).find('.abHeader').first().clone();
    const cost = extractCost($headerClone);
    const parsed = parseAbilityBlock($, el, true);
    if (!parsed) return;
    options.push({
      option_group: group,
      name: parsed.name,
      cost,
      timing: normalizeText($headerClone.text()) || null,
      declare: parsed.declare || null,
      effect: parsed.effect || null,
      bullets: JSON.parse(parsed.bullets || '[]'),
      keywords: parsed.keywords ? parsed.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      lore_text: parsed.lore_text,
    });
  });
  return options;
}

// Step 1's fixed hero-tier reference table (Hero Type / Destiny Point Limit /
// Battle Profile Points Cost) — turn each data row into an option.
function parseReferenceTable($, table) {
  const options = [];
  const $table = $(table);
  const rows = ownRows($, $table).toArray();
  if (!rows.length) return options;
  const headers = $(rows[0]).children('td').map((_, td) => normalizeText($(td).text())).get();
  for (const row of rows.slice(1)) {
    const cells = $(row).children('td').map((_, td) => normalizeText($(td).text())).get();
    if (cells.length < 2 || !cells[0]) continue;
    const effect = headers.slice(1).map((h, i) => `${h}: ${cells[i + 1]}`).join(', ');
    options.push({ option_group: null, name: cells[0], cost: null, timing: null, declare: null, effect, bullets: [], keywords: [], lore_text: null });
  }
  return options;
}

function parseStepContent($, blocks) {
  const options = [];
  for (const b of blocks) {
    const $b = $(b);
    const before = options.length;
    if ($b.hasClass('Columns2')) {
      // Sub-headings (e.g. Origins / Flaws) split the column into named groups.
      const subHeadings = $b.find('h3.h2_pge');
      if (subHeadings.length) {
        subHeadings.each((_, h3) => {
          const group = normalizeText($(h3).text());
          const $groupScope = $(h3).closest('td, div.BreakInsideAvoid');
          options.push(...parseAbilityCardOptions($, $groupScope.get(0) || $b.get(0), group));
        });
      } else {
        options.push(...parseCardOptions($, b, null));
      }
      continue;
    }
    // Single BreakInsideAvoid block: could hold a reference table, an
    // Upgrade|Effect table, card-style options, or ability-card options.
    $b.find('table.customTable').each((_, table) => {
      if ($(table).parents('table.customTable').length) return; // skip nested weapon/regiment tables
      const headerText = normalizeText(ownRows($, $(table)).first().text());
      if (/^Upgrade\s*Effect/i.test(headerText)) {
        options.push(...parseUpgradeTable($, table));
      } else if (/Hero Type/i.test(headerText)) {
        options.push(...parseReferenceTable($, table));
      }
    });
    if (options.length === before && $b.find('.hi_custom').length) options.push(...parseCardOptions($, b, null));
    if (options.length === before && $b.find('.abBody').length) options.push(...parseAbilityCardOptions($, b, null));
  }
  return options;
}

async function scrapeFactionApotheosis(faction) {
  const url = `${BASE_URL}/${faction.slug}/`;
  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 20000,
    });
    if (!res.ok) { console.warn(`  HTTP ${res.status} for ${faction.name}, skipping.`); return null; }
    html = await res.text();
  } catch (err) {
    console.warn(`  Error fetching ${faction.name}: ${err.message}`);
    return null;
  }
  return parseApotheosisHtml(html, faction);
}

function parseApotheosisHtml(html, faction) {
  const $ = cheerio.load(html);
  const anchor = $('a[name^="Step-1"]').get(0);
  if (!anchor) return { steps: [], options: [] }; // no Anvil of Apotheosis section on this faction's page

  const container = $(anchor).closest('div.BreakInsideAvoid').parent();
  const kids = container.children().toArray();

  const steps = [];
  const options = [];
  let current = null; // { step_number, step_title, intro_text, blocks: [] }

  const flush = () => {
    if (!current) return;
    const isStartingWarscroll = /fill out the starting warscroll/i.test(current.step_title);
    const $blocks = $(current.blocks);
    steps.push({
      step_number: current.step_number,
      step_title: current.step_title,
      intro_text: current.intro_text,
      starting_weapon: isStartingWarscroll ? parseStartingWeapon($, $blocks) : null,
      starting_keywords: isStartingWarscroll ? parseStartingKeywords($, $blocks) : null,
    });
    const parsed = parseStepContent($, current.blocks).map((o, i) => ({
      ...o,
      step_number: current.step_number,
      faction_slug: faction.slug,
      faction_name: faction.name,
      sort_order: i,
    }));
    options.push(...parsed);
  };

  for (const kid of kids) {
    const $kid = $(kid);
    const isColumns2 = $kid.hasClass('Columns2');
    const h3 = isColumns2 ? $() : $kid.find('h3.h2_pge').first();
    const m = h3.length ? h3.text().trim().match(/^Step (\d+)\s*-\s*(.+)$/) : null;
    if (m) {
      flush();
      const introClone = $kid.clone();
      introClone.find('h3.h2_pge').first().remove();
      introClone.find('table').remove();
      introClone.find('br, p, div').each((_, node) => { $(node).replaceWith('\n' + $(node).text()); });
      const intro = normalizeText(introClone.text()).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' ');
      current = { step_number: parseInt(m[1], 10), step_title: normalizeText(m[2]), intro_text: intro || null, blocks: [kid] };
      continue;
    }
    if (current) current.blocks.push(kid);
  }
  flush();

  return { steps, options };
}

async function scrapeAllApotheosis(targetSlug = null) {
  initDb();
  const db = getDb();

  const factionsToScrape = targetSlug ? FACTIONS.filter(f => f.slug === targetSlug) : FACTIONS;
  if (!factionsToScrape.length) {
    console.error(`Unknown faction slug: ${targetSlug}`);
    db.close();
    return;
  }

  if (targetSlug) {
    db.prepare('DELETE FROM faction_apotheosis_steps WHERE faction_slug = ?').run(targetSlug);
    db.prepare('DELETE FROM faction_apotheosis_options WHERE faction_slug = ?').run(targetSlug);
  } else {
    db.prepare('DELETE FROM faction_apotheosis_steps').run();
    db.prepare('DELETE FROM faction_apotheosis_options').run();
  }

  const insertStep = db.prepare(`
    INSERT INTO faction_apotheosis_steps (faction_slug, faction_name, step_number, step_title, intro_text, starting_weapon, starting_keywords)
    VALUES (@faction_slug, @faction_name, @step_number, @step_title, @intro_text, @starting_weapon, @starting_keywords)
  `);
  const insertOption = db.prepare(`
    INSERT INTO faction_apotheosis_options
      (faction_slug, faction_name, step_number, option_group, name, cost, timing, declare, effect, bullets, keywords, lore_text, sort_order)
    VALUES
      (@faction_slug, @faction_name, @step_number, @option_group, @name, @cost, @timing, @declare, @effect, @bullets, @keywords, @lore_text, @sort_order)
  `);

  let totalSteps = 0, totalOptions = 0, factionsWithData = 0;

  for (const faction of factionsToScrape) {
    console.log(`\nScraping Anvil of Apotheosis: ${faction.name}...`);
    const result = await scrapeFactionApotheosis(faction);
    if (!result) { await sleep(1200); continue; }
    const { steps, options } = result;
    if (!steps.length) { console.log(`  (no Path to Glory section published)`); await sleep(1200); continue; }

    factionsWithData++;
    db.transaction(() => {
      for (const s of steps) insertStep.run({
        faction_slug: faction.slug,
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
      });
    })();
    console.log(`  ${steps.length} steps, ${options.length} options`);
    totalSteps += steps.length;
    totalOptions += options.length;
    await sleep(1200);
  }

  db.close();
  console.log(`\n✅ Anvil of Apotheosis scraping complete! ${factionsWithData} factions, ${totalSteps} steps, ${totalOptions} options saved.`);
}

if (require.main === module) {
  const factionArg = process.argv.includes('--faction')
    ? process.argv[process.argv.indexOf('--faction') + 1]
    : null;
  scrapeAllApotheosis(factionArg).catch(err => {
    console.error('Scraper failed:', err);
    process.exit(1);
  });
}

module.exports = { scrapeAllApotheosis, parseApotheosisHtml };
