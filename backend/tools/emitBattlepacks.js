const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/rcs/campaigns.json', 'utf8'));
// tidy battle-ability groups
const rc = d['ravaged-coast'].battle_abilities;
rc['Battle Scars'] = rc['Untimely Arrival']; delete rc['Untimely Arrival'];
const bw = d['blighted-wilds'].battle_abilities;
const keep = {}; const rewards = [];
for (const [g, l] of Object.entries(bw)) {
  if (['Deployment', 'Determine the Underdog', 'Blighted Wilds Abilities'].includes(g)) keep[g] = l;
  else if (g === 'Thyrian Battle Scar Tables') keep['Battle Scars'] = l;
  else if (g === 'Campaign Victory') keep['Campaign Victory'] = l;
  else rewards.push(...l.map(a => ({ ...a, source_note: `Reward: ${g}` })));
}
keep['Battleplan Rewards'] = rewards;
d['blighted-wilds'].battle_abilities = keep;
const header = `// Path to Glory battlepack data for the Ravaged Coast and Blighted Wilds
// campaigns — generated from Wahapedia (aos4/the-rules/ravaged-coast and
// /blighted-wilds) with backend/scrapeRules.js's parseAbilityBlock and
// backend/phaseKey.js. Regenerate rather than hand-edit.
//   paths: same shape as PathToGloryWizard's PATHS (4 ranks x 2 options),
//     plus hero (true = a HERO Path, eligible for your general) and source.
//   heroic_traits / artefacts / spell_lore / prayer_lore: same shape as
//     /api/faction-rules items (bullets as a JSON string) — the battlepack's
//     universal tables, usable by any faction in that campaign.
//   battle_abilities: in-battle rules, grouped by section, for reference.
`;
fs.writeFileSync('/home/claude/aos-warscrolls/frontend/src/components/ptgBattlepacks.js', header + 'const BATTLEPACKS = ' + JSON.stringify(d, null, 1) + ';\n\nexport default BATTLEPACKS;\n');
console.log(Object.keys(keep), rewards.length);
