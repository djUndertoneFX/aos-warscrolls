// AoS 4th Edition Battle Simulation Engine

function d6() {
  return Math.floor(Math.random() * 6) + 1;
}

// Parse a dice expression like "D3", "D6", "2D6", or a fixed number
function parseDice(val) {
  const s = String(val || '1').trim();
  if (s === '-' || s === '') return () => 0;
  if (/^\d+$/.test(s)) { const n = parseInt(s); return () => n; }
  if (s.toUpperCase() === 'D3') return () => Math.ceil(d6() / 2);
  if (s.toUpperCase() === 'D6') return () => d6();
  const m = s.match(/^(\d+)D(\d+)$/i);
  if (m) {
    const count = parseInt(m[1]), sides = parseInt(m[2]);
    return () => { let t = 0; for (let i = 0; i < count; i++) t += Math.floor(Math.random() * sides) + 1; return t; };
  }
  const n = parseInt(s);
  return () => (isNaN(n) ? 1 : n);
}

// Parse a threshold like "3+" or "4" -> the minimum roll needed
function parseThreshold(val) {
  const m = String(val || '7').match(/(\d+)/);
  return m ? parseInt(m[1]) : 7;
}

// Parse rend: "-" or "" = 0, "1" = 1
function parseRend(val) {
  const s = String(val || '0').trim();
  if (s === '-' || s === '') return 0;
  const n = parseInt(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

// Parse save like "4+" -> 4
function parseSaveValue(val) {
  const m = String(val || '7+').match(/(\d+)/);
  return m ? parseInt(m[1]) : 7;
}

function parseWeapons(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

// Detect critical hit special abilities from weapon name/ability text
function detectCritAbility(weapon) {
  const combined = ((weapon.name || '') + ' ' + (weapon.ability || weapon.abilities || '')).toLowerCase();
  if (combined.includes('crit (mortal)') || combined.includes('crit(mortal)')) return 'mortal';
  if (combined.includes('crit (auto-wound)') || combined.includes('crit(auto-wound)') ||
      combined.includes('crit (autowound)') || combined.includes('auto-wound')) return 'auto-wound';
  if (combined.includes('crit (2 hits)') || combined.includes('crit(2 hits)') ||
      combined.includes('2 hits')) return '2hits';
  return null;
}

function hasChargeBonus(weapon) {
  const combined = ((weapon.name || '') + ' ' + (weapon.ability || weapon.abilities || '')).toLowerCase();
  return combined.includes('charge') && combined.includes('+1 damage');
}

// Roll dice expression and return result + display string
function rollDiceExpr(val) {
  const roller = parseDice(val);
  const result = roller();
  const s = String(val || '1').trim();
  if (/^[Dd]\d+$/.test(s) || /^\d+[Dd]\d+$/.test(s)) {
    return { result, display: `${result} (rolled ${s})` };
  }
  return { result, display: String(result) };
}

function runSingleBattle(friendly, enemy, friendlyFirst) {
  const steps = [];
  const push = (msg, type = 'normal') => steps.push({ msg, type });

  const fSave = parseSaveValue(friendly.save);
  const eSave = parseSaveValue(enemy.save);
  const fMaxHp = parseInt(friendly.health) || 1;
  const eMaxHp = parseInt(enemy.health) || 1;
  let fHp = fMaxHp;
  let eHp = eMaxHp;

  const fMeleeWeapons = parseWeapons(friendly.weapons).filter(w => w.type === 'melee');
  const eMeleeWeapons = parseWeapons(enemy.weapons).filter(w => w.type === 'melee');
  const fRangedWeapons = parseWeapons(friendly.weapons).filter(w => w.type === 'ranged');
  const eRangedWeapons = parseWeapons(enemy.weapons).filter(w => w.type === 'ranged');

  push(`══════════════════════════════════`, 'divider');
  push(`SIMULACRUM: ${friendly.name} vs. ${enemy.name}`, 'title');
  push(`Initiative: ${friendlyFirst ? 'Friendly unit charges' : 'Enemy unit charges'}`, 'info');
  push(`Friendly — ${friendly.name}: ${fMaxHp} HP, Save: ${friendly.save}`, 'info');
  push(`Enemy   — ${enemy.name}: ${eMaxHp} HP, Save: ${enemy.save}`, 'info');
  push(`══════════════════════════════════`, 'divider');

  // Execute attacks for one fighter against a defender
  const fight = ({ attackerName, attackerSide, meleeWeapons, rangedWeapons, defSave, charged, applyDmg, getDefHp, defMaxHp, isShootingPhase }) => {
    const prefix = attackerSide === 'friendly' ? '[FRIENDLY]' : '[ENEMY]  ';
    const weapons = isShootingPhase ? rangedWeapons : meleeWeapons;
    if (weapons.length === 0) return;

    if (isShootingPhase) {
      push(`  ${prefix} ${attackerName} — SHOOT!`, 'fight');
    } else {
      push(`  ${prefix} ${attackerName} — FIGHT!${charged ? '  ⚡ (Charging!)' : ''}`, 'fight');
    }

    for (const weapon of weapons) {
      if (getDefHp() <= 0) break;

      const { result: numAttacks } = rollDiceExpr(weapon.attacks);
      const hitNeeded = parseThreshold(weapon.hit);
      const woundNeeded = parseThreshold(weapon.wound);
      const rend = parseRend(weapon.rend);
      const saveNeeded = defSave + rend;
      const critType = detectCritAbility(weapon);
      const chargeBonus = !isShootingPhase && hasChargeBonus(weapon) && charged;

      push(`    Weapon: "${weapon.name}" [Atk:${numAttacks}, Hit:${weapon.hit}, Wnd:${weapon.wound}, Rnd:${weapon.rend || '-'}, Dmg:${weapon.damage}${chargeBonus ? ' +1 Dmg (charge)' : ''}]`, 'weapon');

      for (let a = 1; a <= numAttacks; a++) {
        if (getDefHp() <= 0) break;

        // Hit roll
        const hitRoll = d6();
        const isCrit = hitRoll === 6;
        const isHit = hitRoll >= hitNeeded;

        if (!isHit) {
          push(`      Attack ${a}: Hit roll ${hitRoll} vs ${hitNeeded}+  →  Miss`, 'miss');
          continue;
        }

        // Critical hit abilities
        if (isCrit && critType === 'mortal') {
          const { result: dmgRaw, display: dmgDisp } = rollDiceExpr(weapon.damage);
          const dmgVal = dmgRaw + (chargeBonus ? 1 : 0);
          push(`      Attack ${a}: Hit roll 6  →  CRITICAL HIT! ✦ Mortal damage — ${dmgDisp}${chargeBonus ? '+1' : ''} = ${dmgVal} damage (no save!)`, 'crit');
          applyDmg(dmgVal);
          push(`        Defender HP: ${Math.max(0, getDefHp())} / ${defMaxHp}`, 'hp');
          continue;
        }

        if (isCrit && critType === 'auto-wound') {
          push(`      Attack ${a}: Hit roll 6  →  CRITICAL HIT! ✦ Auto-wounds! (skip wound roll)`, 'crit');
          const saveRoll = d6();
          const saved = saveRoll >= saveNeeded;
          push(`        Save roll: ${saveRoll} vs ${saveNeeded}+ (base ${defSave}+, Rend ${rend})  →  ${saved ? 'Saved' : 'Failed!'}`, saved ? 'saved' : 'damage');
          if (!saved) {
            const { result: dmgRaw, display: dmgDisp } = rollDiceExpr(weapon.damage);
            const dmgVal = dmgRaw + (chargeBonus ? 1 : 0);
            applyDmg(dmgVal);
            push(`        ${dmgDisp}${chargeBonus ? '+1' : ''} = ${dmgVal} damage dealt!  Defender HP: ${Math.max(0, getDefHp())} / ${defMaxHp}`, 'hp');
          }
          continue;
        }

        if (isCrit && critType === '2hits') {
          push(`      Attack ${a}: Hit roll 6  →  CRITICAL HIT! ✦ Scores 2 hits!`, 'crit');
        } else {
          push(`      Attack ${a}: Hit roll ${hitRoll} vs ${hitNeeded}+  →  Hit!${isCrit ? '  (Critical)' : ''}`, 'hit');
        }

        const hitCount = isCrit && critType === '2hits' ? 2 : 1;

        for (let h = 0; h < hitCount; h++) {
          if (getDefHp() <= 0) break;
          const hLabel = hitCount > 1 ? `Hit ${h + 1}: ` : '';

          // Wound roll
          const woundRoll = d6();
          const isWound = woundRoll >= woundNeeded;

          if (!isWound) {
            push(`        ${hLabel}Wound roll: ${woundRoll} vs ${woundNeeded}+  →  No wound`, 'miss');
            continue;
          }
          push(`        ${hLabel}Wound roll: ${woundRoll} vs ${woundNeeded}+  →  Wound!`, 'wound');

          // Save roll
          const saveRoll = d6();
          const saved = saveRoll >= saveNeeded;
          push(`        ${hLabel}Save roll:  ${saveRoll} vs ${saveNeeded}+ (base ${defSave}+, Rend ${rend})  →  ${saved ? 'Saved' : 'Failed!'}`, saved ? 'saved' : 'damage');

          if (!saved) {
            const { result: dmgRaw, display: dmgDisp } = rollDiceExpr(weapon.damage);
            const dmgVal = dmgRaw + (chargeBonus ? 1 : 0);
            applyDmg(dmgVal);
            push(`        ${hLabel}${dmgDisp}${chargeBonus ? '+1' : ''} = ${dmgVal} damage dealt!  Defender HP: ${Math.max(0, getDefHp())} / ${defMaxHp}`, 'hp');
          }
        }
      }
    }
  };

  let round = 1;
  const MAX_ROUNDS = 20;

  while (fHp > 0 && eHp > 0 && round <= MAX_ROUNDS) {
    push(``, 'spacer');
    push(`══ BATTLE ROUND ${round} ══`, 'round');

    const isFirstRound = round === 1;
    const fCharged = isFirstRound && friendlyFirst;
    const eCharged = isFirstRound && !friendlyFirst;

    // Shooting phase: both units shoot (ranged weapons)
    const hasShooting = fRangedWeapons.length > 0 || eRangedWeapons.length > 0;
    if (hasShooting) {
      push(`  — Shooting Phase —`, 'phase');
      // Shoot simultaneously (order doesn't matter for ranged since we're not checking alive mid-shoot here)
      fight({ attackerName: friendly.name, attackerSide: 'friendly', meleeWeapons: fMeleeWeapons, rangedWeapons: fRangedWeapons, defSave: eSave, charged: false, applyDmg: (d) => { eHp = Math.max(0, eHp - d); }, getDefHp: () => eHp, defMaxHp: eMaxHp, isShootingPhase: true });
      if (eHp > 0) {
        fight({ attackerName: enemy.name, attackerSide: 'enemy', meleeWeapons: eMeleeWeapons, rangedWeapons: eRangedWeapons, defSave: fSave, charged: false, applyDmg: (d) => { fHp = Math.max(0, fHp - d); }, getDefHp: () => fHp, defMaxHp: fMaxHp, isShootingPhase: true });
      }
    }

    // Combat phase
    if (fHp > 0 && eHp > 0) {
      push(`  — Combat Phase —`, 'phase');
      if (friendlyFirst) {
        fight({ attackerName: friendly.name, attackerSide: 'friendly', meleeWeapons: fMeleeWeapons, rangedWeapons: fRangedWeapons, defSave: eSave, charged: fCharged, applyDmg: (d) => { eHp = Math.max(0, eHp - d); }, getDefHp: () => eHp, defMaxHp: eMaxHp, isShootingPhase: false });
        if (eHp > 0) {
          fight({ attackerName: enemy.name, attackerSide: 'enemy', meleeWeapons: eMeleeWeapons, rangedWeapons: eRangedWeapons, defSave: fSave, charged: eCharged, applyDmg: (d) => { fHp = Math.max(0, fHp - d); }, getDefHp: () => fHp, defMaxHp: fMaxHp, isShootingPhase: false });
        }
      } else {
        fight({ attackerName: enemy.name, attackerSide: 'enemy', meleeWeapons: eMeleeWeapons, rangedWeapons: eRangedWeapons, defSave: fSave, charged: eCharged, applyDmg: (d) => { fHp = Math.max(0, fHp - d); }, getDefHp: () => fHp, defMaxHp: fMaxHp, isShootingPhase: false });
        if (fHp > 0) {
          fight({ attackerName: friendly.name, attackerSide: 'friendly', meleeWeapons: fMeleeWeapons, rangedWeapons: fRangedWeapons, defSave: eSave, charged: fCharged, applyDmg: (d) => { eHp = Math.max(0, eHp - d); }, getDefHp: () => eHp, defMaxHp: eMaxHp, isShootingPhase: false });
        }
      }
    }

    push(``, 'spacer');
    push(`  End of Round ${round}:  Friendly ${Math.max(0, fHp)}/${fMaxHp} HP  |  Enemy ${Math.max(0, eHp)}/${eMaxHp} HP`, 'status');
    round++;
  }

  // Outcome
  push(``, 'spacer');
  push(`══════════════════════════════════`, 'divider');

  let winner;
  if (fHp > 0 && eHp <= 0) {
    winner = { side: 'friendly', unit: friendly, hpRemaining: fHp, maxHp: fMaxHp, damageTaken: fMaxHp - fHp };
    push(`FRIENDLY UNIT "${friendly.name}" STANDS VICTORIOUS!`, 'victory');
    push(`With ${winner.hpRemaining} HP remaining (${winner.damageTaken} damage taken over ${round - 1} round${round - 1 !== 1 ? 's' : ''})`, 'victory');
  } else if (eHp > 0 && fHp <= 0) {
    winner = { side: 'enemy', unit: enemy, hpRemaining: eHp, maxHp: eMaxHp, damageTaken: eMaxHp - eHp };
    push(`ENEMY UNIT "${enemy.name}" STANDS VICTORIOUS!`, 'victory');
    push(`With ${winner.hpRemaining} HP remaining (${winner.damageTaken} damage taken over ${round - 1} round${round - 1 !== 1 ? 's' : ''})`, 'victory');
  } else if (fHp > 0 && eHp > 0) {
    winner = { side: 'draw', fHp, eHp, rounds: MAX_ROUNDS };
    push(`STALEMATE — Battle lasted ${MAX_ROUNDS} rounds with no victor!`, 'draw');
    push(`Friendly: ${fHp}/${fMaxHp} HP remaining  |  Enemy: ${eHp}/${eMaxHp} HP remaining`, 'draw');
  } else {
    winner = { side: 'mutual' };
    push(`MUTUAL DESTRUCTION — Both units fell in Round ${round - 1}!`, 'draw');
  }

  return { winner, steps, fHpFinal: Math.max(0, fHp), eHpFinal: Math.max(0, eHp), fMaxHp, eMaxHp, rounds: round - 1 };
}

// Run N battles and return aggregate + last single-battle steps
function runMultiBattle(friendly, enemy, friendlyFirst, count) {
  let fWins = 0, eWins = 0, draws = 0, mutuals = 0;
  let lastResult = null;

  for (let i = 0; i < count; i++) {
    lastResult = runSingleBattle(friendly, enemy, friendlyFirst);
    const s = lastResult.winner.side;
    if (s === 'friendly') fWins++;
    else if (s === 'enemy') eWins++;
    else if (s === 'mutual') mutuals++;
    else draws++;
  }

  const steps = [];
  const push = (msg, type = 'normal') => steps.push({ msg, type });
  push(`MULTI-BATTLE RESULTS — ${count.toLocaleString()} battles`, 'title');
  push(`══════════════════════════════════`, 'divider');
  push(`Friendly wins:  ${fWins}  (${((fWins / count) * 100).toFixed(1)}%)`, 'info');
  push(`Enemy wins:     ${eWins}  (${((eWins / count) * 100).toFixed(1)}%)`, 'info');
  push(`Draws:          ${draws + mutuals}  (${(((draws + mutuals) / count) * 100).toFixed(1)}%)`, 'info');
  push(`══════════════════════════════════`, 'divider');

  let winner;
  if (fWins > eWins) {
    winner = { side: 'friendly', unit: friendly, winRate: fWins / count };
  } else if (eWins > fWins) {
    winner = { side: 'enemy', unit: enemy, winRate: eWins / count };
  } else {
    winner = { side: 'draw' };
  }

  return { winner, steps, isMultiBattle: true, fWins, eWins, draws: draws + mutuals, count };
}

export function simulateBattle(friendly, enemy, { count = 1, friendlyFirst = true } = {}) {
  if (count === 1) {
    return runSingleBattle(friendly, enemy, friendlyFirst);
  }
  return runMultiBattle(friendly, enemy, friendlyFirst, count);
}
