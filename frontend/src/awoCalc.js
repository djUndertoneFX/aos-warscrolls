// Average Wound Output calculator — AoS 4th edition standard rules

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
export function calcWeaponAWO(weapon, unitSize, presumedSave, presumedWard) {
  const attacks  = meanDice(weapon.attacks);
  const hit      = parseRoll(weapon.hit);
  const wound    = parseRoll(weapon.wound);
  const rend     = weapon.rend && weapon.rend !== '-' ? parseInt(weapon.rend, 10) : 0;
  const damage   = meanDice(weapon.damage);

  if (!attacks || !hit || !wound || !damage) return null;

  const totalAttacks = unitSize * attacks;

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
    const mortalDmg  = totalAttacks * critHitProb * damage;
    const normalWounds   = totalAttacks * normalHitProb * woundProb;
    const normalUnsaved  = normalWounds * (1 - saveProb) * (1 - wardProb) * damage;
    awo = mortalDmg + normalUnsaved;

  } else if (hasCritAutoWound(ability)) {
    // Crit (Auto-Wound): 6 to hit → auto-wound (skips wound roll), still saves/ward normally
    const wounds = totalAttacks * (critHitProb + normalHitProb * woundProb);
    const unsaved = wounds * (1 - saveProb) * (1 - wardProb);
    awo = unsaved * damage;

  } else {
    // Standard: hit → wound → save → ward → damage
    const hits    = totalAttacks * rollProb(hit);
    const wounds  = hits * woundProb;
    const unsaved = wounds * (1 - saveProb) * (1 - wardProb);
    awo = unsaved * damage;
  }

  return roundHalfUp(awo);
}
