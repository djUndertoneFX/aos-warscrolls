// Replays every scraped Anvil of Apotheosis option through the wizard's
// effect parser and prints what each one resolves to, so a parser change
// can be eyeballed against the whole corpus (19 factions, ~700 options)
// instead of one faction at a time.
//
//   node scripts/checkApotheosisEffects.mjs            # only options that parse
//   node scripts/checkApotheosisEffects.mjs --unparsed # the ones that don't
//   node scripts/checkApotheosisEffects.mjs --grep=Ironjawz
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'frontend', 'src', 'apotheosisEffects.js'), 'utf8');
const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);

const db = join(here, '..', 'backend', 'warscrolls.db');
const rows = JSON.parse(execFileSync('sqlite3', ['-json', db,
  "SELECT faction_slug, step_number, name, effect FROM faction_apotheosis_options WHERE effect IS NOT NULL AND effect != ''"]).toString());

const args = process.argv.slice(2);
const wantUnparsed = args.includes('--unparsed');
const grep = (args.find(a => a.startsWith('--grep=')) || '').slice(7).toLowerCase();
// An option with none of these words in its effect text has nothing for the
// parser to find, so it isn't a miss worth reporting under --unparsed.
const LOOKS_MECHANICAL = /charac|keyword/i;

let parsed = 0, unparsed = 0;
for (const r of rows) {
  if (grep && !`${r.faction_slug} ${r.name}`.toLowerCase().includes(grep)) continue;
  const mods = mod.parseWarscrollMods(r.effect);
  if (mods.length) {
    parsed++;
    if (!wantUnparsed) {
      console.log(`\n${r.faction_slug} · step ${r.step_number} · ${r.name}`);
      console.log(`  ${r.effect.replace(/\s+/g, ' ').slice(0, 220)}`);
      for (const m of mods) console.log(`  -> ${JSON.stringify(m)}`);
    }
  } else if (LOOKS_MECHANICAL.test(r.effect)) {
    unparsed++;
    if (wantUnparsed) {
      console.log(`\n${r.faction_slug} · step ${r.step_number} · ${r.name}`);
      console.log(`  ${r.effect.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }
}
console.log(`\n${parsed} options produced mods; ${unparsed} mention a characteristic/keyword but produced none.`);
