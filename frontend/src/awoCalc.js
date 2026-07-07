// Average Wound Output calculator — AoS 4th edition standard rules

/**
 * Given a unit's weapons array and options_text, return a modified weapons array
 * with model_count set to reflect fractional/optional loadouts. Returns null if
 * nothing meaningful can be parsed (caller should fall back to original weapons).
 *
 * Handles:
 *   - "X/Y models must be armed with 1 of the following options: [block]" (e.g. Stormfiends)
 *   - "and 1 of the following options: [block]" – all-model pick-best (e.g. Stormdrake Guard)
 *   - "X/Y models can replace their A with B [and C]" (e.g. Liberators)
 *   - "X/Y models … in addition to their other weapons" (e.g. Rat Ogors)
 */
export function resolveWeaponLoadout(weapons, optionsText, unitSize, save, ward, rounding) {
  if (!optionsText || !weapons?.length) return null;
  const N = parseInt(unitSize) || 1;
  if (N < 1) return null;

  // Skip texts that are clearly not about weapon options
  if (/terrain abilities|only be taken in|no longer have current|comprise \d/i.test(optionsText)) return null;

  // ── Weapon lookup helpers ──────────────────────────────────────────────────
  const stripArticle = s => s.toLowerCase().replace(/^(a |an |the )/, '').trim();
  const wByNorm = new Map(weapons.map(w => [stripArticle(w.name), w]));
  // Also index by raw lowercase for weapons that start with articles
  for (const w of weapons) wByNorm.set(w.name.toLowerCase(), w);

  // Sorted longest-first for greedy matching
  const norms = [...new Set(wByNorm.keys())].sort((a, b) => b.length - a.length);

  const findW = text => {
    const t = stripArticle(text);
    return wByNorm.get(t) || wByNorm.get(text.toLowerCase().trim()) || null;
  };

  // Tokenize a run-on option block into groups using weapon names as anchors.
  // e.g. "Warpfire Projectors and Clubbing BlowsWindlaunchers and Clubbing Blows"
  // → [[WP, CB], [WL, CB]]
  const tokenize = text => {
    const groups = [];
    let rem = text.trim();
    while (rem.length > 0) {
      let hit = false;
      for (const n of norms) {
        if (rem.toLowerCase().startsWith(n)) {
          const w = wByNorm.get(n);
          if (!w) { rem = rem.slice(n.length); hit = true; break; }
          const group = [w];
          rem = rem.slice(n.length);
          // "and [weapon]" continuation
          const am = rem.match(/^ and (.+)/i);
          if (am) {
            for (const n2 of norms) {
              if (am[1].toLowerCase().startsWith(n2)) {
                const w2 = wByNorm.get(n2);
                if (w2) group.push(w2);
                rem = am[1].slice(n2.length);
                break;
              }
            }
          }
          groups.push(group);
          hit = true; break;
        }
      }
      if (!hit) rem = rem.slice(1);
    }
    return groups;
  };

  // ADO for a list of weapons at `mc` models
  const groupADO = (wList, mc) => wList.reduce((t, w) =>
    t + (calcWeaponADO({ ...w, model_count: mc }, N, save ?? 7, ward ?? null, rounding ?? 'overall') ?? 0), 0
  );

  // Pick the highest-ADO option from a set of options; return best option
  const pickBest = (opts, mc) => opts.reduce((b, opt) => {
    const a = groupADO(opt, mc); return a > b.ado ? { opt, ado: a } : b;
  }, { opt: opts[0], ado: -1 }).opt;

  const counts = new Map();        // weaponName → final model count
  const optWeps = new Set();       // all weapons mentioned in option blocks (mutex sets)
  let anyParsed = false;
  let baseReduction = 0;           // models removed from base loadout by "replace all weapons"

  // ── 1. "X/Y models must be armed with 1 of the following options:[block]" ──
  // Block ends at the next such clause or end of string
  const mustRe = /(\d+)\/(\d+) models? must be armed with 1 of the following options?:(.+?)(?=\d+\/\d+ models? must be|$)/gis;
  for (const m of optionsText.matchAll(mustRe)) {
    const mc = Math.round(N * parseInt(m[1]) / parseInt(m[2]));
    const opts = tokenize(m[3]);
    if (!opts.length) continue;
    opts.forEach(opt => opt.forEach(w => optWeps.add(w.name)));
    const best = pickBest(opts, mc);
    best.forEach(w => counts.set(w.name, (counts.get(w.name) ?? 0) + mc));
    anyParsed = true;
  }

  // ── 2. "and 1 of the following options:[block]" (all-model pick) ──
  const allChoiceRe = /and 1 of the following options?:(.+?)(?=\.|$)/gis;
  for (const m of optionsText.matchAll(allChoiceRe)) {
    const opts = tokenize(m[1]);
    if (!opts.length) continue;
    opts.forEach(opt => opt.forEach(w => optWeps.add(w.name)));
    const best = pickBest(opts, N);
    best.forEach(w => counts.set(w.name, N));
    anyParsed = true;
  }

  // ── 3. "X/Y models … replace their [A] with [B] [and C]" ──
  const replRe = /(\d+)\/(\d+) models?[^.]*?replace (?:their )?(.+?) with (?:an? |a )?(.+?)(?=\.|The champion|\d+\/\d+|$)/gim;
  for (const m of optionsText.matchAll(replRe)) {
    const rc = Math.round(N * parseInt(m[1]) / parseInt(m[2]));
    const fromTxt = m[3].trim();
    const toTxt   = m[4].trim();
    const isAll   = /^(their )?weapons?$/i.test(fromTxt);

    if (isAll) {
      baseReduction += rc;
    } else {
      const fw = findW(fromTxt);
      if (fw && !optWeps.has(fw.name)) {
        const prev = counts.get(fw.name) ?? N;
        counts.set(fw.name, Math.max(0, prev - rc));
      }
    }

    // Parse "to" weapons (may be "A and B")
    let tr = toTxt;
    for (let i = 0; i < 5 && tr.length > 0; i++) {
      let f = false;
      for (const n of norms) {
        if (tr.toLowerCase().startsWith(n)) {
          const w = wByNorm.get(n);
          if (w && !optWeps.has(w.name)) {
            counts.set(w.name, (counts.get(w.name) ?? 0) + rc);
          }
          tr = tr.slice(n.length).replace(/^[ ,]*(?:and )?/i, '');
          f = true; break;
        }
      }
      if (!f) break;
    }
    anyParsed = true;
  }

  // ── 4. "X/Y models … in addition to their other weapons" ──
  const addlRe = /(\d+)\/(\d+) models?[^.]*?(?:can be )?armed with (.+?) in addition/gim;
  for (const m of optionsText.matchAll(addlRe)) {
    const mc = Math.round(N * parseInt(m[1]) / parseInt(m[2]));
    const w = findW(m[3].trim());
    if (w) { counts.set(w.name, mc); anyParsed = true; }
  }

  // ── 5. "X model(s) in this unit [Name], who is/are armed with [weapon(s)]" ──
  // Handles named characters within multi-model units, each with exclusive weapons.
  // e.g. "1 model in this unit is Cado Ezechiar, who is armed with an Ezechiarian Greatsword."
  const namedModelRe = /(\d+) models? in this unit[^.]*?,? who (?:is|are) armed with (.+?)(?=\.|$)/gi;
  for (const m of optionsText.matchAll(namedModelRe)) {
    if (/in addition/i.test(m[0])) continue; // handled by addlRe
    const mc = parseInt(m[1]);
    const wepsFound = tokenize(m[2]).flat();
    if (!wepsFound.length) continue;
    for (const w of wepsFound) {
      counts.set(w.name, (counts.get(w.name) ?? 0) + mc);
      optWeps.add(w.name);
    }
    anyParsed = true;
  }

  if (!anyParsed) return null;

  return weapons
    .filter(w => {
      // Exclude non-chosen option weapons (in optWeps but not assigned a count)
      if (optWeps.has(w.name) && !counts.has(w.name)) return false;
      return true;
    })
    .map(w => ({
      ...w,
      model_count: counts.has(w.name)
        ? counts.get(w.name)
        : Math.max(0, N - baseReduction),
    }));
}

// Parse a stat string like "3+", "4+" → the integer threshold (3, 4…)
function parseRoll(val) {
  if (!val || val === '-') return null;
  const m = String(val).match(/(\d+)\+?/);
  return m ? parseInt(m[1], 10) : null;
}

// Expected mean of a dice expression, rounded per round-half-up rule
function meanDice(val) {
  if (!val || val === '-') return 0;
  const s = String(val).trim();
  if (s === 'D3')  return 2;           // (1+2+3)/3 = 2.0 exact
  if (s === 'D6')  return 4;           // 3.5 → rounds up to 4
  if (s === '2D6') return 7;           // 7.0 exact
  if (s === 'D3+1') return 3;          // 2+1
  if (s === 'D6+1') return 5;          // 3.5+1 = 4.5 → 5
  if (s === 'D6+2') return 6;          // 3.5+2 = 5.5 → 6
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Round-half-up (≥0.5 rounds up)
function roundHalfUp(x) {
  return Math.floor(x + 0.5);
}

// Probability of rolling at least `threshold` on a D6 (capped 1..6)
function rollProb(threshold) {
  if (!threshold || threshold <= 1) return 1;
  if (threshold > 6) return 0;
  return (7 - threshold) / 6;
}

// Detect weapon special abilities
function hasCritAutoWound(ability) {
  return /crit\s*\(auto.?wound\)/i.test(ability || '');
}
function hasCritMortal(ability) {
  return /crit\s*\(mortal\)/i.test(ability || '');
}

/**
 * Calculate Average Wound Output for a single weapon row.
 *
 * @param {object} weapon   - weapon data object from JSON
 * @param {number} unitSize - number of models in the unit
 * @param {number} presumedSave  - enemy save value (e.g. 5 for 5+)
 * @param {number|null} presumedWard - enemy ward value, or null for none
 * @returns {number} AWO rounded integer, or null if data is insufficient
 */
export { calcWeaponADO as calcWeaponAWO }; // backwards-compat alias
export function calcWeaponADO(weapon, unitSize, presumedSave, presumedWard, roundingMode = 'overall') {
  const r = roundingMode === 'discrete' ? roundHalfUp : x => x;
  const attacks  = meanDice(weapon.attacks);
  const hit      = parseRoll(weapon.hit);
  const wound    = parseRoll(weapon.wound);
  const rend     = weapon.rend && weapon.rend !== '-' ? parseInt(weapon.rend, 10) : 0;
  const damage   = meanDice(weapon.damage);

  if (!attacks || !hit || !wound || !damage) return null;

  // model_count overrides unit size when only a subset of models carries this weapon
  const modelCount = (weapon.model_count != null && weapon.model_count < unitSize)
    ? weapon.model_count : unitSize;
  const totalAttacks = modelCount * attacks;

  // Hit probabilities
  const critHitProb    = 1 / 6;
  const normalHitProb  = Math.max(0, rollProb(hit) - critHitProb); // hitValue..5 (excludes 6)

  // Wound probability
  const woundProb = rollProb(wound);

  // Save: effective threshold = presumedSave + rend; >6 means auto-fail (prob=0)
  const effectiveSave = presumedSave + rend;
  const saveProb = effectiveSave > 6 ? 0 : rollProb(effectiveSave);

  // Ward
  const wardProb = presumedWard ? rollProb(presumedWard) : 0;

  const ability = weapon.ability || '';

  let awo;

  if (hasCritMortal(ability)) {
    // Crit (Mortal): 6 to hit → mortal wounds = Damage, bypasses saves & ward
    // Non-crit hits still resolve through wound/save/ward normally
    // Mortal wounds skip wound roll and save, but ward still applies
    const critHits       = r(totalAttacks * critHitProb);
    const mortalDmg      = r(critHits * damage * (1 - wardProb));
    const normalHits     = r(totalAttacks * normalHitProb);
    const normalWounds   = r(normalHits * woundProb);
    const normalUnsaved  = r(r(normalWounds * (1 - saveProb)) * (1 - wardProb));
    const normalDmg      = r(normalUnsaved * damage);
    awo = mortalDmg + normalDmg;

  } else if (hasCritAutoWound(ability)) {
    // Crit (Auto-Wound): 6 to hit → auto-wound (skips wound roll), still saves/ward normally
    const critHits   = r(totalAttacks * critHitProb);
    const normalHits = r(totalAttacks * normalHitProb);
    const wounds     = r(critHits + r(normalHits * woundProb));
    const unsaved    = r(r(wounds * (1 - saveProb)) * (1 - wardProb));
    awo = r(unsaved * damage);

  } else {
    // Standard: hit → wound → save → ward → damage
    const hits    = r(totalAttacks * rollProb(hit));
    const wounds  = r(hits * woundProb);
    const unsaved = r(r(wounds * (1 - saveProb)) * (1 - wardProb));
    awo = r(unsaved * damage);
  }

  return roundHalfUp(awo);
}
