// usage: node extract2.js
const fs = require('fs');
const cheerio = require('/home/claude/aos-warscrolls/backend/node_modules/cheerio');
const { parseAbilityBlock, normalizeText } = require('/home/claude/aos-warscrolls/backend/scrapeRules.js');
const { resolvePhaseKeyString } = require('/home/claude/aos-warscrolls/backend/phaseKey.js');

function events(file) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  $('script,style,noscript').remove();
  const ev = [];
  (function walk(node) {
    for (const c of node.children || []) {
      if (c.type === 'text') { const t = normalizeText(c.data); if (t) ev.push({ t: 'text', v: t }); }
      else if (c.type === 'tag') {
        if (c.name === 'h2' || c.name === 'h3') { ev.push({ t: 'h', v: normalizeText($(c).text()) }); continue; }
        if ($(c).hasClass('abBody')) {
          let blk = $(c).closest('.BreakInsideAvoid'); if (!blk.length) blk = $(c).parent();
          let ab;
          if (blk.find('.abBody').length > 1) { const w = $('<div></div>'); const hdr = $(c).prevAll('.abHeader').first(); if (hdr.length) w.append(hdr.clone()); w.append($(c).clone()); ab = parseAbilityBlock($, w, true); }
          else ab = parseAbilityBlock($, blk, true);
          if (ab) ev.push({ t: 'ab', v: ab });
          continue;
        }
        if ($(c).hasClass('abHeader')) continue;
        walk(c);
      }
    }
  })($('body')[0]);
  return ev;
}
const fixTxt = s => typeof s === 'string' ? s.replace(/\blf\b/g, 'If').replace(/\bl mortal/g, '1 mortal').replace(/bat tle/g, 'battle').replace(/\bunjt\b/g, 'unit').replace(/W1ZARD/g, 'WIZARD').replace(/un its/g, 'units').replace(/Jail into/g, 'fall into') : s;
const titleCase = n => n.replace(/[A-Za-z][A-Za-z']*/g, w => w[0] + w.slice(1).toLowerCase());
const pk = ab => { try { return resolvePhaseKeyString(ab) || undefined; } catch { return undefined; } };
function clean(ab, asString, note) {
  const o = {};
  for (const [k, v] of Object.entries(ab)) if (v !== '' && v != null) o[k] = fixTxt(v);
  let b = []; try { b = JSON.parse(ab.bullets || '[]').map(fixTxt); } catch {}
  o.bullets = asString ? JSON.stringify(b) : b;
  o.name = titleCase(o.name);
  if (note) o.source_note = note;
  const k = pk({ ...ab, ...o, bullets: JSON.stringify(b) }); if (k) o.phase_key = k;
  return o;
}
const RANK_RE = /^(ASPIRING|ELITE|MIGHTY|LEGENDARY)\b/i;
function build(file, cfg) {
  const ev = events(file);
  const idx = (h, from = 0) => ev.findIndex((e, i) => i >= from && e.t === 'h' && e.v.toLowerCase() === h.toLowerCase());
  const paths = [];
  for (const [from, to] of cfg.pathRanges) {
    const a = idx(from), b = idx(to, a + 1) === -1 ? ev.length : idx(to, a + 1);
    let cur = null, rank = null;
    for (let i = a; i < b; i++) {
      const e = ev[i];
      if (e.t === 'h') { if (/^Path of/i.test(e.v)) { cur = { key: cfg.prefix + e.v.toLowerCase().replace(/^path of (the )?/, '').replace(/\W+/g, '-').replace(/-$/, ''), name: titleCase(e.v).replace(/ Of | The /g, m => m.toLowerCase()), restricted: null, ranks: [], _pre: '' }; paths.push(cur); rank = null; } else if (cur && cur.ranks.length === 4) cur = null; continue; }
      if (!cur) continue;
      if (e.t === 'text') {
        const r = e.v.match(RANK_RE);
        if (r) { rank = { rank: r[1][0].toUpperCase() + r[1].slice(1).toLowerCase(), options: [] }; cur.ranks.push(rank); continue; }
        if (!cur.ranks.length) { cur._pre = (cur._pre + ' ' + e.v).trim(); const m = cur._pre.match(/^\((.+?)\)$/); if (m) cur.restricted = m[1].replace(/\s+/g, ' ').trim().replace('non- ', 'non-'); }
      }
      if (e.t === 'ab' && rank) rank.options.push(clean(e.v, false));
    }
  }
  for (const p of paths) { delete p._pre; p.ranks = p.ranks.slice(0, 4).map(r => ({ ...r, options: r.options.slice(0, 2) })); p.hero = !!p.restricted && !/non-/i.test(p.restricted) && /HERO/.test(p.restricted); p.source = cfg.name; }
  const groupAbs = (heading, note) => { const a = idx(heading); const out = []; for (let i = a + 1; i < ev.length && ev[i].t !== 'h'; i++) if (ev[i].t === 'ab') out.push(clean(ev[i].v, true, note)); return out; };
  const res = { key: cfg.key, name: cfg.name, paths };
  for (const [k, h] of Object.entries(cfg.groups)) res[k] = groupAbs(h, `${cfg.name}: ${titleCase(h)}`);
  // in-battle abilities between two headings, grouped by heading
  res.battle_abilities = {};
  const ba = idx(cfg.battleFrom), bb = idx(cfg.battleTo, ba + 1);
  let g = null;
  for (let i = ba; i < bb; i++) { const e = ev[i]; if (e.t === 'h') g = titleCase(e.v); if (e.t === 'ab' && g) (res.battle_abilities[g] = res.battle_abilities[g] || []).push(clean(e.v, true)); }
  return res;
}
const RC = build('/tmp/rc/rc.html', { key: 'ravaged-coast', name: 'Ravaged Coast', prefix: 'rc-', pathRanges: [['Path of the Brawler', 'Universal Enhancements and Lores']],
  groups: { heroic_traits: "Hallmarks of Hel's Claw", artefacts: 'Aqshian Artefacts', spell_lore: 'Lore of Magmic Fury', prayer_lore: 'Prayers of Aqshian Wrath' },
  battleFrom: 'Path to Glory Battles', battleTo: 'Battleplans' });
const BW = build('/tmp/bw/bw.html', { key: 'blighted-wilds', name: 'Blighted Wilds', prefix: 'bw-', pathRanges: [['Path of the Thyrian Druid', 'Universal Enhancements and Lores'], ['Path of the Alchemist', 'FAQ']],
  groups: { heroic_traits: 'The Pride of Thyria', artefacts: 'Thyrian Wonders', spell_lore: 'Lore of the Overgrown Wilds', prayer_lore: 'Prayers of the Jade Soul' },
  battleFrom: '1. Gather Your Armies', battleTo: 'Battleplans' });
for (const c of [RC, BW]) {
  console.log('==', c.name);
  for (const p of c.paths) console.log(' ', p.name, '|', p.restricted, '| hero', p.hero, '|', p.ranks.map(r => r.rank[0] + r.options.length).join(''));
  console.log('  HT', c.heroic_traits.length, 'ART', c.artefacts.length, 'SP', c.spell_lore.length, 'PR', c.prayer_lore.length);
  console.log('  battle:', Object.entries(c.battle_abilities).map(([k, v]) => `${k}(${v.length})`).join(', '));
}
fs.writeFileSync('/tmp/rcs/campaigns.json', JSON.stringify({ 'ravaged-coast': RC, 'blighted-wilds': BW }));
