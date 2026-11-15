// Replays a pasted New Recruit list through the import parser and resolves
// it against the real database, so the mapping can be checked end to end
// without clicking through the UI.
//
//   node scripts/checkImportList.mjs path/to/list.txt
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'frontend', 'src', 'importList.js'), 'utf8');
const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);

const text = readFileSync(process.argv[2], 'utf8');
const parsed = mod.parseArmyList(text);

const db = join(here, '..', 'backend', 'warscrolls.db');
const q = sql => JSON.parse(execFileSync('sqlite3', ['-json', db, sql]).toString() || '[]');
const factions = q('SELECT DISTINCT faction, faction_slug, grand_alliance FROM warscrolls');
const slug = factions.find(f => f.faction.toLowerCase() === parsed.faction.toLowerCase())?.faction_slug;
const alliance = factions.find(f => f.faction_slug === slug)?.grand_alliance;
const warscrolls = alliance
  ? q(`SELECT id, name, points, is_hero, unit_size, faction_slug FROM warscrolls WHERE faction_slug IN (SELECT DISTINCT faction_slug FROM warscrolls WHERE grand_alliance = '${alliance}')`)
  : [];

console.log('── parsed ──');
console.log({ listName: parsed.listName, points: parsed.points, battlepack: parsed.battlepack,
              faction: parsed.faction, formation: parsed.formation, meta: parsed.meta,
              arcaneTome: parsed.arcaneTome, lores: parsed.lores });
for (const reg of parsed.regiments) {
  console.log(`\n  [${reg.label}]`);
  for (const u of reg.units) {
    const flags = [u.general && 'GENERAL', u.reinforced && 'REINFORCED', u.isAnvilHero && 'ANVIL'].filter(Boolean).join(' ');
    console.log(`    ${u.name} (${u.points}) ${flags}`);
    if (u.path) console.log(`      path: ${u.path} → ${u.pathAbilities.join(' | ')}`);
    if (u.modelOptions.length) console.log(`      models: ${u.modelOptions.map(m => `${m.count}x ${m.name}`).join(', ')}`);
    if (u.enhancements.length) console.log(`      picks: ${u.enhancements.join(' | ')}`);
  }
}
if (parsed.warnings.length) { console.log('\n── warnings ──'); parsed.warnings.forEach(w => console.log('  !', w)); }

const resolved = mod.resolveArmyList(parsed, factions, warscrolls);
console.log('\n── resolved ──');
console.log('  faction slug:', resolved.factionSlug);
console.log('  roster:', JSON.stringify(resolved.roster));
for (const m of resolved.matched) console.log(`  ✓ ${m.name}${m.anvil ? ' (Anvil hero — no warscroll)' : ` → #${m.warscroll.id} ${m.warscroll.points}pts${m.isAlly ? ` [ALLY: ${m.warscroll.faction_slug}]` : ''}`}`);
for (const u of resolved.unmatched) console.log(`  ✗ ${u.name} (${u.points}) — no warscroll matched`);

// ── Path to Glory wizard mapping ────────────────────────────────────────
const w2src = readFileSync(join(here, '..', 'frontend', 'src', 'importToWizard.js'), 'utf8')
  .replace("from './importList'", `from "data:text/javascript,${encodeURIComponent(src)}"`);
const wiz = await import(`data:text/javascript,${encodeURIComponent(w2src)}`);

const steps = resolved.factionSlug ? (() => {
  const rows = q(`SELECT step_number, step_title FROM faction_apotheosis_steps WHERE faction_slug='${resolved.factionSlug}' ORDER BY step_number`);
  return rows.map(st => ({
    ...st,
    options: q(`SELECT id, name, option_group FROM faction_apotheosis_options WHERE faction_slug='${resolved.factionSlug}' AND step_number=${st.step_number} ORDER BY sort_order`),
  }));
})() : [];

// The wizard's own Path tables live in JS, not the DB — pull the names and
// rank options straight out of the component source.
const pageSrc = readFileSync(join(here, '..', 'frontend', 'src', 'components', 'ptgBattlepacks.js'), 'utf8');
const packs = JSON.parse(pageSrc.slice(pageSrc.indexOf('{'), pageSrc.lastIndexOf('}') + 1));
const paths = Object.values(packs).flatMap(p => p.paths || []);

const { state, report } = wiz.buildWizardState(parsed, resolved, { factions, apotheosisSteps: steps, paths });
console.log('\n── wizard state ──');
for (const [k, v] of Object.entries(state)) {
  const s = JSON.stringify(v);
  console.log(`  ${k}: ${s.length > 150 ? s.slice(0, 150) + '…' : s}`);
}
console.log('\n── filled ──'); report.filled.forEach(f => console.log('  ✓', f));
console.log('\n── skipped ──'); report.skipped.forEach(f => console.log('  !', f));
