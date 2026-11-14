// usage: node extractGhb.js <general-s-handbook.html> <out.js>
// Page saved from wahapedia.ru/aos4/the-rules/general-s-handbook-2026-27/.
// Builds the Matched Play page's data: battleplans (twist, abilities,
// scoring), battle tactics cards, season-rule abilities and the battlepack's
// core abilities. Text comes from a line dump of the page; ability blocks
// are parsed with scrapeRules.parseAbilityBlock and matched in by name.
const fs = require('fs');
const cheerio = require('cheerio');
const { parseAbilityBlock, normalizeText } = require('../scrapeRules');
const { resolvePhaseKeyString } = require('../phaseKey');

const html = fs.readFileSync(process.argv[2], 'utf8');
const $ = cheerio.load(html);
$('script,style,noscript').remove();
// abilities, in page order
const abilities = [];
$('.abBody').each((_, el) => {
  let blk = $(el).closest('.BreakInsideAvoid'); if (!blk.length) blk = $(el).parent();
  let ab;
  if (blk.find('.abBody').length > 1) { const w = $('<div></div>'); const h = $(el).prevAll('.abHeader').first(); if (h.length) w.append(h.clone()); w.append($(el).clone()); ab = parseAbilityBlock($, w, true); }
  else ab = parseAbilityBlock($, blk, true);
  if (ab) abilities.push(ab);
});
// line dump
$('.abBody').each((_, el) => { $(el).prepend('\n[[AB]] '); $(el).append('\n[[/AB]]\n'); });
$('h2,h3').each((_, el) => { $(el).prepend('\n\n### '); $(el).append('\n'); });
$('br').replaceWith('\n'); $('p,div,li,tr').each((_, el) => { $(el).append('\n'); });
const lines = $('body').text().replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);

const titleCase = n => n.replace(/[A-Za-z][A-Za-z'’]*/g, w => w[0] + w.slice(1).toLowerCase());
const fixTxt = s => typeof s === 'string' ? s.replace(/\bypu\b/g, 'you') : s;
let abCursor = 0;
function takeAbility(nameLine) {
  const name = nameLine.replace(/^\[\[AB\]\]\s*/, '').split(':')[0].trim();
  const i = abilities.findIndex((a, k) => k >= abCursor && a.name.toUpperCase() === name.toUpperCase());
  if (i === -1) return null;
  abCursor = i + 1;
  const a = abilities[i];
  const o = {};
  for (const [k, v] of Object.entries(a)) if (v !== '' && v != null) o[k] = fixTxt(v);
  o.name = titleCase(o.name);
  const pk = (() => { try { return resolvePhaseKeyString(a); } catch { return null; } })(); if (pk) o.phase_key = pk;
  return o;
}
const findLine = (re, from = 0) => lines.findIndex((l, i) => i >= from && re.test(l));

// ── battleplans ──
const BP_NAMES = ['Into the Fire', 'Bloodstained Coasts', 'Avalanche of Ash', 'Caverns of Slaughter', 'What’s Yours is Ours', 'Hidden Under Ash-clouds',
  'Warped Ruins', 'Curse of the Gnaw', 'Seize the Embers', 'Treacherous Ground', 'Escape From the Coast', 'Power of the Realms'];
const mapsStart = findLine(/^### Battleplan Maps$/i);
const battleplans = [];
BP_NAMES.forEach((name, n) => {
  const s = findLine(new RegExp('^### ' + name.replace(/[’']/g, "['’]") + '$', 'i'), mapsStart);
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i++) if (/^### /.test(lines[i]) && !/^### FAQ/.test(lines[i])) { e = i; break; }
  const body = lines.slice(s + 1, e);
  const bp = { name, table: n < 6 ? 1 : 2, roll: (n % 6) + 1, twist: '', abilities: [], scoring: [], notes: [] };
  let mode = 'twist';
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if (/^\[\[AB\]\]/.test(l)) { const a = takeAbility(l); if (a) bp.abilities.push(a); while (i < body.length && body[i] !== '[[/AB]]') i++; continue; }
    if (/^(Passive|KEYWORDS|Once Per|Your |Any |Enemy |End of|Start of|Deployment Phase|Reaction)/.test(l) && mode !== 'scoring') continue;
    if (/^Each player scores victory points/i.test(l)) { mode = 'scoring'; continue; }
    if (/^(Obscuring|Terrain|Place of Power|Area Terrain|or Obstacle|Battleplan \d|Show|Q:|A:|FAQ|Errata)/.test(l)) { if (mode === 'scoring') mode = 'done'; continue; }
    if (mode === 'twist') bp.twist = (bp.twist + ' ' + l).trim();
    else if (mode === 'scoring') bp.scoring.push(l);
  }
  bp.twist = bp.twist.replace(/^TWIST:\s*/, '');
  battleplans.push(bp);
});

// ── battle tactics cards ──
const cards = [];
for (let c = 1; c <= 6; c++) {
  const s = findLine(new RegExp('^BATTLE TACTICS CARD ' + c + '$'));
  const e = c < 6 ? findLine(new RegExp('^BATTLE TACTICS CARD ' + (c + 1) + '$'), s) : findLine(/^### Battleplan Maps$/i, s);
  const body = lines.slice(s + 1, e).filter(l => !/^(### FAQ|Show|Q:|A:|FAQ|Errata)/.test(l));
  const card = { name: body[0].replace(/^### /, ''), flavor: body[1], setup: '', tactics: [] };
  let cur = null;
  for (let i = 2; i < body.length; i++) {
    const l = body[i];
    const m = l.match(/^(AFFRAY|STRIKE|DOMINATION):\s*(.+)$/);
    if (m) { cur = { tier: titleCase(m[1]), name: titleCase(m[2]), flavor: body[i + 1], condition: '', vp: null }; card.tactics.push(cur); i++; continue; }
    if (/^VICTORY$/.test(l) || /^POINTS$/.test(l)) continue;
    if (!cur) { card.setup = (card.setup + ' ' + l).trim(); continue; }
    const vp = l.match(/^(.*?)(\d+)$/);
    if (vp && !cur.vp && body[i + 1] === 'VICTORY') { if (vp[1].trim()) cur.condition = (cur.condition + ' ' + vp[1]).trim(); cur.vp = parseInt(vp[2], 10); continue; }
    if (/^Errata|^Battle Tactics Card|^In the /.test(l)) continue;
    if (cur.vp == null) {
      if (cur.condition.endsWith(':')) cur._list = true;
      cur.condition = (cur.condition + (cur._list && /^[A-Z][a-z]/.test(l) ? '\n• ' : ' ') + l).trim();
    }
  }
  card.tactics.forEach(t => delete t._list);
  card.setup = card.setup.replace(/\s+abilities but/, ' abilities but');
  cards.push(card);
}

// ── season rules + the battlepack's own abilities ──
abCursor = 0;
const section = (fromRe, toRe) => { const s = findLine(fromRe); const e = findLine(toRe, s + 1); const out = []; for (let i = s; i < e; i++) if (/^\[\[AB\]\]/.test(lines[i])) { const a = takeAbility(lines[i]); if (a) out.push(a); } return out; };
const season = section(/^### Season Rules 2026-27$/, /^### Battle Tactics 2026-27$/);

const out = { source: 'General’s Handbook 2026-27', battleplans, tactics_cards: cards, season_abilities: season };
const header = `// Matched Play (General's Handbook 2026-27) data, generated by
// backend/tools/extractGhb.js from Wahapedia's page. Regenerate, don't hand-edit.
`;
fs.writeFileSync(process.argv[3], header + 'const GHB = ' + JSON.stringify(out, null, 1) + ';\n\nexport default GHB;\n');
for (const b of battleplans) console.log(`T${b.table}/${b.roll} ${b.name}: ab=${b.abilities.map(a => a.name).join(',')} scoring=${b.scoring.length} twist=${b.twist.slice(0, 60)}`);
for (const c of cards) console.log(`CARD ${c.name}: setup=${c.setup.slice(0, 40)} | ${c.tactics.map(t => `${t.tier}:${t.name}(${t.vp}) ${t.condition.slice(0, 30)}`).join(' | ')}`);
console.log('season', season.map(a => a.name));
