/**
 * Merge a freshly scraped database into backend/warscrolls.db WITHOUT renumbering units.
 *
 * Why: scraper.js / scrapeRules.js rebuild their tables from scratch (DELETE + INSERT),
 * which gives every unit a new id. Users' friendly/enemy marks and saved lists point at
 * those ids, and the spearhead-only columns (spearhead_abilities, spearhead_abilities_v2,
 * image_path, spearhead) are not written by the scraper, so a straight rescrape loses them.
 *
 * This script matches units by (faction_slug, name), updates changed fields in place
 * (keeping ids and the non-scraped columns), inserts new units, removes units that are
 * gone, replaces the faction rules tables, and writes a report of what changed.
 *
 * Usage (run by rescrape.bat):  node rescrapeMerge.js <path-to-scraped.db>
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const srcPath = process.argv[2];
const livePath = path.join(__dirname, 'warscrolls.db');
const reportTxt = path.join(__dirname, '..', 'rescrape-report.txt');
const reportJson = path.join(__dirname, '..', 'rescrape-report.json');

if (!srcPath || !fs.existsSync(srcPath)) {
  console.error('Usage: node rescrapeMerge.js <scraped.db>');
  process.exit(1);
}

// Columns the unit scraper writes. Everything else on a row is left alone.
const SCRAPE_COLS = [
  'name', 'faction', 'faction_slug', 'grand_alliance',
  'move', 'health', 'control', 'save', 'ward',
  'points', 'unit_size', 'base_size',
  'keywords', 'abilities', 'weapons',
  'flavor_text', 'options_text',
  'is_hero', 'is_monster', 'is_cavalry', 'is_infantry', 'is_beast',
  'is_unique', 'is_war_machine', 'is_terrain', 'is_manifestation', 'is_legends', 'url',
];
// Fields worth calling out in the report when they change.
const NOTABLE = ['points', 'move', 'health', 'control', 'save', 'ward', 'unit_size', 'keywords', 'abilities', 'weapons', 'is_legends'];

// If a faction comes back with far fewer units than before, assume the scrape of that
// faction failed (blocked page, layout change) and don't delete anything from it.
const MIN_KEEP_RATIO = 0.6;

const RULE_TABLES = ['faction_battle_traits', 'faction_battle_formations', 'faction_extra_rules'];

const src = new Database(srcPath, { readonly: true });
const live = new Database(livePath);
live.pragma('journal_mode = WAL');

const key = (r) => `${r.faction_slug}|${String(r.name).toLowerCase().trim()}`;
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

const report = {
  ranAt: now,
  newUnits: [],
  removedUnits: [],
  changedUnits: [],
  skippedFactions: [],
  rules: {},
};

// ── Units ─────────────────────────────────────────────────────────────────────
const srcRows = src.prepare(`SELECT id, ${SCRAPE_COLS.join(', ')} FROM warscrolls ORDER BY id`).all();
const liveRows = live.prepare(`SELECT id, ${SCRAPE_COLS.join(', ')} FROM warscrolls ORDER BY id`).all();

const countBy = (rows) => rows.reduce((m, r) => m.set(r.faction_slug, (m.get(r.faction_slug) || 0) + 1), new Map());
const srcCounts = countBy(srcRows);
const liveCounts = countBy(liveRows);
const unsafeFactions = new Set();
for (const [slug, n] of liveCounts) {
  const got = srcCounts.get(slug) || 0;
  if (got < n * MIN_KEEP_RATIO) {
    unsafeFactions.add(slug);
    report.skippedFactions.push({ faction: slug, before: n, scraped: got });
  }
}

const group = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
const srcByKey = group(srcRows);
const liveByKey = group(liveRows);

const setClause = SCRAPE_COLS.map((c) => `${c} = @${c}`).join(', ');
const updateStmt = live.prepare(`UPDATE warscrolls SET ${setClause}, scraped_at = @scraped_at WHERE id = @id`);
const insertStmt = live.prepare(
  `INSERT INTO warscrolls (${SCRAPE_COLS.join(', ')}, scraped_at) VALUES (${SCRAPE_COLS.map((c) => '@' + c).join(', ')}, @scraped_at)`
);
const deleteStmt = live.prepare('DELETE FROM warscrolls WHERE id = ?');

const pick = (r) => Object.fromEntries(SCRAPE_COLS.map((c) => [c, r[c]]));
const label = (r) => ({ name: r.name, faction: r.faction, points: r.points });

const tx = live.transaction(() => {
  // Updates + inserts
  for (const [k, sList] of srcByKey) {
    const lList = liveByKey.get(k) || [];
    sList.forEach((s, i) => {
      const l = lList[i];
      if (!l) {
        insertStmt.run({ ...pick(s), scraped_at: now });
        report.newUnits.push(label(s));
        return;
      }
      const diff = SCRAPE_COLS.filter((c) => String(s[c] ?? '') !== String(l[c] ?? ''));
      if (diff.length) {
        updateStmt.run({ ...pick(s), scraped_at: now, id: l.id });
        const notable = diff.filter((c) => NOTABLE.includes(c));
        const entry = { name: s.name, faction: s.faction, fields: diff };
        if (diff.includes('points')) entry.points = { from: l.points, to: s.points };
        if (notable.length || diff.length) report.changedUnits.push(entry);
      }
    });
  }
  // Removals
  for (const [k, lList] of liveByKey) {
    const sList = srcByKey.get(k) || [];
    lList.slice(sList.length).forEach((l) => {
      if (unsafeFactions.has(l.faction_slug)) return;
      deleteStmt.run(l.id);
      report.removedUnits.push(label(l));
    });
  }

  // Regiment of Renown flag (same rule as scraper.js)
  live.exec('UPDATE warscrolls SET is_regiment_of_renown = 0');
  live.exec(`
    UPDATE warscrolls SET is_regiment_of_renown = 1
    WHERE LOWER(name) IN (
      SELECT LOWER(name) FROM warscrolls GROUP BY LOWER(name) HAVING COUNT(DISTINCT faction_slug) >= 3
    )
  `);

  // ── Faction rules tables: replace per faction (unless that faction's scrape looks broken) ──
  for (const tbl of RULE_TABLES) {
    const cols = live.prepare(`PRAGMA table_info(${tbl})`).all().map((c) => c.name).filter((c) => c !== 'id');
    const srcCols = new Set(src.prepare(`PRAGMA table_info(${tbl})`).all().map((c) => c.name));
    const useCols = cols.filter((c) => srcCols.has(c));
    const nameOf = (r) => [r.formation_name, r.section, r.group_name, r.name].filter(Boolean).join(' / ');
    const sAll = src.prepare(`SELECT ${useCols.join(', ')} FROM ${tbl}`).all();
    const lAll = live.prepare(`SELECT ${useCols.join(', ')} FROM ${tbl}`).all();
    const slugs = new Set([...sAll, ...lAll].map((r) => r.faction_slug));
    const ins = live.prepare(`INSERT INTO ${tbl} (${useCols.join(', ')}) VALUES (${useCols.map((c) => '@' + c).join(', ')})`);
    const del = live.prepare(`DELETE FROM ${tbl} WHERE faction_slug = ?`);
    const tReport = { added: [], removed: [], changed: [], skipped: [] };
    for (const slug of slugs) {
      const s = sAll.filter((r) => r.faction_slug === slug);
      const l = lAll.filter((r) => r.faction_slug === slug);
      if (s.length < l.length * MIN_KEEP_RATIO) { tReport.skipped.push({ faction: slug, before: l.length, scraped: s.length }); continue; }
      const sig = (r) => JSON.stringify(useCols.filter((c) => c !== 'scraped_at').map((c) => r[c]));
      const lNames = new Map(l.map((r) => [nameOf(r), sig(r)]));
      const sNames = new Map(s.map((r) => [nameOf(r), sig(r)]));
      const same = l.length === s.length && [...sNames].every(([n, g]) => lNames.get(n) === g);
      if (same) continue;
      for (const n of sNames.keys()) if (!lNames.has(n)) tReport.added.push(`${slug}: ${n}`);
      for (const n of lNames.keys()) if (!sNames.has(n)) tReport.removed.push(`${slug}: ${n}`);
      for (const [n, g] of sNames) if (lNames.has(n) && lNames.get(n) !== g) tReport.changed.push(`${slug}: ${n}`);
      del.run(slug);
      for (const r of s) ins.run({ ...r, scraped_at: now });
    }
    report.rules[tbl] = tReport;
  }
});

tx();
live.pragma('wal_checkpoint(TRUNCATE)');
live.close();
src.close();

// ── Report ────────────────────────────────────────────────────────────────────
const lines = [];
lines.push(`Rescrape merge — ${now}`);
lines.push(`New units: ${report.newUnits.length}`);
report.newUnits.forEach((u) => lines.push(`  + [${u.faction}] ${u.name}${u.points ? ` (${u.points} pts)` : ''}`));
lines.push(`Removed units: ${report.removedUnits.length}`);
report.removedUnits.forEach((u) => lines.push(`  - [${u.faction}] ${u.name}`));
lines.push(`Changed units: ${report.changedUnits.length}`);
report.changedUnits.forEach((u) => lines.push(`  ~ [${u.faction}] ${u.name}: ${u.fields.join(', ')}${u.points ? ` (points ${u.points.from} -> ${u.points.to})` : ''}`));
if (report.skippedFactions.length) {
  lines.push('Factions NOT pruned (scrape returned too few units — check them):');
  report.skippedFactions.forEach((f) => lines.push(`  ! ${f.faction}: had ${f.before}, scraped ${f.scraped}`));
}
for (const [tbl, r] of Object.entries(report.rules)) {
  lines.push(`${tbl}: +${r.added.length} -${r.removed.length} ~${r.changed.length}${r.skipped.length ? ` (skipped ${r.skipped.map((s) => s.faction).join(', ')})` : ''}`);
  r.added.forEach((n) => lines.push(`  + ${n}`));
  r.removed.forEach((n) => lines.push(`  - ${n}`));
  r.changed.forEach((n) => lines.push(`  ~ ${n}`));
}
fs.writeFileSync(reportTxt, lines.join('\n') + '\n');
fs.writeFileSync(reportJson, JSON.stringify(report, null, 2));
console.log(lines.slice(0, 4).join('\n'));
console.log(`\nFull report: ${reportTxt}`);
