// AoS 4th Edition Battle Simulation Engine

function d6() {
  return Math.floor(Math.random() * 6) + 1;
}

// Parse a dice expression like "D3", "D6", "2D6", or a fixed number into a roller function
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

// Parse a threshold like "3+" or "4" -> minimum roll needed
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

// Roll total attacks for a weapon across all alive models — one roll per model
function rollTotalAttacks(weapon, modelsAlive) {
  const roller = parseDice(weapon.attacks);
  let total = 0;
  for (let i = 0; i < modelsAlive; i++) total += roller();
  return total;
}

// Detect critical hit special abilities from weapon name/ability text
function detectCritAbility(weapon) {
  const combined = ((weapon.name || '') + ' ' + (weapon.ability || weapon.abilities || '')).toLowerCase();
  if (combined.includes('crit (mortal)') || combined.includes('crit(mortal)')) return 'mortal';
  if (combined.includes('crit (auto-wound)') || combined.includes('crit(auto-wound)') ||
      combined.includes('auto-wound')) return 'auto-wound';
  if (combined.includes('crit (2 hits)') || combined.includes('crit(2 hits)') ||
      combined.includes('2 hits')) return '2hits';
  return null;
}

function hasChargeBonus(weapon) {
  const combined = ((weapon.name || '') + ' ' + (weapon.ability || weapon.abilities || '')).toLowerCase();
  return combined.includes('charge') && combined.includes('+1 damage');
}

// Side state — tracks models alive and wound on the current front model
function makeSide(unit, modelCount) {
  const hpPerModel = parseInt(unit.health) || 1;
  return {
    modelsAlive: modelCount,
    modelCount,       // original total
    hpPerModel,
    currentModelHp: hpPerModel,  // HP remaining on the frontmost model
    modelsKilled: 0,
  };
}

// Apply damage to a side, cascading through models. Returns a log of events.
function applyDamage(side, damage, push) {
  let dmgLeft = damage;
  while (dmgLeft > 0 && side.modelsAlive > 0) {
    if (dmgLeft >= side.currentModelHp) {
      dmgLeft -= side.currentModelHp;
      side.modelsAlive--;
      side.modelsKilled++;
      side.currentModelHp = side.hpPerModel;
      if (side.modelsAlive > 0) {
        push(`        Model slain! ${side.modelsAlive} model${side.modelsAlive !== 1 ? 's' : ''} remaining.${dmgLeft > 0 ? ` (${dmgLeft} damage overflows to next model)` : ''}`, 'damage');
      } else {
        push(`        Model slain! Unit destroyed!`, 'damage');
      }
    } else {
      side.currentModelHp -= dmgLeft;
      dmgLeft = 0;
    }
  }
}

function runSingleBattle(friendly, enemy, friendlyFirst, friendlyModelCount, enemyModelCount) {
  const steps = [];
  const push = (msg, type = 'normal') => steps.push({ msg, type });

  const fSave = parseSaveValue(friendly.save);
  const eSave = parseSaveValue(enemy.save);

  const fSide = makeSide(friendly, friendlyModelCount);
  const eSide = makeSide(enemy, enemyModelCount);

  const fMeleeWeapons  = parseWeapons(friendly.weapons).filter(w => w.type === 'melee');
  const eMeleeWeapons  = parseWeapons(enemy.weapons).filter(w => w.type === 'melee');
  const fRangedWeapons = parseWeapons(friendly.weapons).filter(w => w.type === 'ranged');
  const eRangedWeapons = parseWeapons(enemy.weapons).filter(w => w.type === 'ranged');

  push(`══════════════════════════════════`, 'divider');
  push(`SIMULACRUM: ${friendly.name} vs. ${enemy.name}`, 'title');
  push(`Initiative: ${friendlyFirst ? 'Friendly charges' : 'Enemy charges'}`, 'info');
  push(`Friendly — ${friendly.name}: ${friendlyModelCount} model${friendlyModelCount !== 1 ? 's' : ''} × ${fSide.hpPerModel} HP = ${friendlyModelCount * fSide.hpPerModel} total HP, Save: ${friendly.save}`, 'info');
  push(`Enemy   — ${enemy.name}: ${enemyModelCount} model${enemyModelCount !== 1 ? 's' : ''} × ${eSide.hpPerModel} HP = ${enemyModelCount * eSide.hpPerModel} total HP, Save: ${enemy.save}`, 'info');
  push(`══════════════════════════════════`, 'divider');

  const fight = ({ attackerName, attackerSide, sideState, meleeWeapons, rangedWeapons, defSave, charged, defSide, isShootingPhase }) => {
    const weapons = isShootingPhase ? rangedWeapons : meleeWeapons;
    if (weapons.length === 0 || sideState.modelsAlive === 0) return;

    const prefix = attackerSide === 'friendly' ? '[FRIENDLY]' : '[ENEMY]  ';
    if (isShootingPhase) {
      push(`  ${prefix} ${attackerName} (${sideState.modelsAlive} model${sideState.modelsAlive !== 1 ? 's' : ''}) — SHOOT!`, 'fight');
    } else {
      push(`  ${prefix} ${attackerName} (${sideState.modelsAlive} model${sideState.modelsAlive !== 1 ? 's' : ''}) — FIGHT!${charged ? '  ⚡ (Charging!)' : ''}`, 'fight');
    }

    for (const weapon of weapons) {
      if (defSide.modelsAlive === 0) break;

      const chargeBonus = !isShootingPhase && hasChargeBonus(weapon) && charged;
      const critType = detectCritAbility(weapon);

      // Roll attacks per model alive — this is the dice pool
      const numAttacks = rollTotalAttacks(weapon, sideState.modelsAlive);
      const hitNeeded   = parseThreshold(weapon.hit);
      const woundNeeded = parseThreshold(weapon.wound);
      const rend        = parseRend(weapon.rend);
      const saveNeeded  = defSave + rend;

      push(`    Weapon: "${weapon.name}" [${sideState.modelsAlive} model${sideState.modelsAlive !== 1 ? 's' : ''} × ${weapon.attacks} Atk = ${numAttacks} dice | Hit:${weapon.hit}, Wnd:${weapon.wound}, Rnd:${weapon.rend || '-'}, Dmg:${weapon.damage}${chargeBonus ? ' +1 Dmg (charge)' : ''}]`, 'weapon');

      for (let a = 1; a <= numAttacks; a++) {
        if (defSide.modelsAlive === 0) break;

        const hitRoll = d6();
        const isCrit  = hitRoll === 6;
        const isHit   = hitRoll >= hitNeeded;

        if (!isHit) {
          push(`      Attack ${a}: Hit ${hitRoll} vs ${hitNeeded}+  →  Miss`, 'miss');
          continue;
        }

        // Critical — Mortal damage (no wound or save)
        if (isCrit && critType === 'mortal') {
          const roller = parseDice(weapon.damage);
          const dmgVal = roller() + (chargeBonus ? 1 : 0);
          push(`      Attack ${a}: Hit 6  →  CRITICAL! ✦ Mortal — ${dmgVal} damage (no save)`, 'crit');
          applyDamage(defSide, dmgVal, push);
          push(`        Defender: ${defSide.modelsAlive}/${defSide.modelCount} models remain`, 'hp');
          continue;
        }

        // Critical — Auto-wound (skip wound roll)
        if (isCrit && critType === 'auto-wound') {
          push(`      Attack ${a}: Hit 6  →  CRITICAL! ✦ Auto-wounds (skip wound roll)`, 'crit');
          const saveRoll = d6();
          const saved = saveRoll >= saveNeeded;
          push(`        Save: ${saveRoll} vs ${saveNeeded}+ (base ${defSave}+, Rend ${rend})  →  ${saved ? 'Saved' : 'Failed!'}`, saved ? 'saved' : 'damage');
          if (!saved) {
            const roller = parseDice(weapon.damage);
            const dmgVal = roller() + (chargeBonus ? 1 : 0);
            applyDamage(defSide, dmgVal, push);
            push(`        Defender: ${defSide.modelsAlive}/${defSide.modelCount} models remain`, 'hp');
          }
          continue;
        }

        // Critical — 2 Hits
        const hitCount = isCrit && critType === '2hits' ? 2 : 1;
        if (isCrit && critType === '2hits') {
          push(`      Attack ${a}: Hit 6  →  CRITICAL! ✦ 2 hits!`, 'crit');
        } else {
          push(`      Attack ${a}: Hit ${hitRoll} vs ${hitNeeded}+  →  Hit!${isCrit ? ' (Critical)' : ''}`, 'hit');
        }

        for (let h = 0; h < hitCount; h++) {
          if (defSide.modelsAlive === 0) break;
          const hLabel = hitCount > 1 ? `Hit ${h + 1}: ` : '';

          const woundRoll = d6();
          const isWound   = woundRoll >= woundNeeded;
          if (!isWound) {
            push(`        ${hLabel}Wound: ${woundRoll} vs ${woundNeeded}+  →  No wound`, 'miss');
            continue;
          }
          push(`        ${hLabel}Wound: ${woundRoll} vs ${woundNeeded}+  →  Wound!`, 'wound');

          const saveRoll = d6();
          const saved    = saveRoll >= saveNeeded;
          push(`        ${hLabel}Save: ${saveRoll} vs ${saveNeeded}+ (base ${defSave}+, Rend ${rend})  →  ${saved ? 'Saved' : 'Failed!'}`, saved ? 'saved' : 'damage');

          if (!saved) {
            const roller = parseDice(weapon.damage);
            const dmgVal = roller() + (chargeBonus ? 1 : 0);
            applyDamage(defSide, dmgVal, push);
            push(`        ${hLabel}Defender: ${defSide.modelsAlive}/${defSide.modelCount} models  (${defSide.currentModelHp}/${defSide.hpPerModel} HP on current model)`, 'hp');
          }
        }
      }
    }
  };

  let round = 1;
  const MAX_ROUNDS = 20;

  while (fSide.modelsAlive > 0 && eSide.modelsAlive > 0 && round <= MAX_ROUNDS) {
    push(``, 'spacer');
    push(`══ BATTLE ROUND ${round} ══`, 'round');

    const isFirstRound = round === 1;
    const fCharged = isFirstRound && friendlyFirst;
    const eCharged = isFirstRound && !friendlyFirst;

    const hasShooting = fRangedWeapons.length > 0 || eRangedWeapons.length > 0;
    if (hasShooting) {
      push(`  — Shooting Phase —`, 'phase');
      fight({ attackerName: friendly.name, attackerSide: 'friendly', sideState: fSide, meleeWeapons: fMeleeWeapons, rangedWeapons: fRangedWeapons, defSave: eSave, charged: false, defSide: eSide, isShootingPhase: true });
      if (eSide.modelsAlive > 0)
        fight({ attackerName: enemy.name, attackerSide: 'enemy', sideState: eSide, meleeWeapons: eMeleeWeapons, rangedWeapons: eRangedWeapons, defSave: fSave, charged: false, defSide: fSide, isShootingPhase: true });
    }

    if (fSide.modelsAlive > 0 && eSide.modelsAlive > 0) {
      push(`  — Combat Phase —`, 'phase');
      if (friendlyFirst) {
        fight({ attackerName: friendly.name, attackerSide: 'friendly', sideState: fSide, meleeWeapons: fMeleeWeapons, rangedWeapons: fRangedWeapons, defSave: eSave, charged: fCharged, defSide: eSide, isShootingPhase: false });
        if (eSide.modelsAlive > 0)
          fight({ attackerName: enemy.name, attackerSide: 'enemy', sideState: eSide, meleeWeapons: eMeleeWeapons, rangedWeapons: eRangedWeapons, defSave: fSave, charged: eCharged, defSide: fSide, isShootingPhase: false });
      } else {
        fight({ attackerName: enemy.name, attackerSide: 'enemy', sideState: eSide, meleeWeapons: eMeleeWeapons, rangedWeapons: eRangedWeapons, defSave: fSave, charged: eCharged, defSide: fSide, isShootingPhase: false });
        if (fSide.modelsAlive > 0)
          fight({ attackerName: friendly.name, attackerSide: 'friendly', sideState: fSide, meleeWeapons: fMeleeWeapons, rangedWeapons: fRangedWeapons, defSave: eSave, charged: fCharged, defSide: eSide, isShootingPhase: false });
      }
    }

    push(``, 'spacer');
    push(`  End of Round ${round}:  Friendly ${fSide.modelsAlive}/${fSide.modelCount} models  |  Enemy ${eSide.modelsAlive}/${eSide.modelCount} models`, 'status');
    round++;
  }

  push(``, 'spacer');
  push(`══════════════════════════════════`, 'divider');

  let winner;
  const rounds = round - 1;

  if (fSide.modelsAlive > 0 && eSide.modelsAlive === 0) {
    winner = { side: 'friendly', unit: friendly, modelsAlive: fSide.modelsAlive, modelsKilled: fSide.modelsKilled, modelCount: fSide.modelCount, damageOnCurrent: fSide.hpPerModel - fSide.currentModelHp, hpPerModel: fSide.hpPerModel };
    push(`FRIENDLY UNIT "${friendly.name}" STANDS VICTORIOUS!`, 'victory');
    push(`${fSide.modelsAlive} of ${fSide.modelCount} models survive. ${fSide.modelsKilled} model${fSide.modelsKilled !== 1 ? 's' : ''} lost. ${fSide.currentModelHp < fSide.hpPerModel ? `(${fSide.hpPerModel - fSide.currentModelHp} damage on surviving champion)` : ''}`, 'victory');
  } else if (eSide.modelsAlive > 0 && fSide.modelsAlive === 0) {
    winner = { side: 'enemy', unit: enemy, modelsAlive: eSide.modelsAlive, modelsKilled: eSide.modelsKilled, modelCount: eSide.modelCount, damageOnCurrent: eSide.hpPerModel - eSide.currentModelHp, hpPerModel: eSide.hpPerModel };
    push(`ENEMY UNIT "${enemy.name}" STANDS VICTORIOUS!`, 'victory');
    push(`${eSide.modelsAlive} of ${eSide.modelCount} models survive. ${eSide.modelsKilled} model${eSide.modelsKilled !== 1 ? 's' : ''} lost. ${eSide.currentModelHp < eSide.hpPerModel ? `(${eSide.hpPerModel - eSide.currentModelHp} damage on surviving champion)` : ''}`, 'victory');
  } else if (fSide.modelsAlive > 0 && eSide.modelsAlive > 0) {
    winner = { side: 'draw', fModels: fSide.modelsAlive, eModels: eSide.modelsAlive, rounds: MAX_ROUNDS };
    push(`STALEMATE — Battle lasted ${MAX_ROUNDS} rounds with no victor!`, 'draw');
    push(`Friendly: ${fSide.modelsAlive}/${fSide.modelCount} models  |  Enemy: ${eSide.modelsAlive}/${eSide.modelCount} models`, 'draw');
  } else {
    winner = { side: 'mutual' };
    push(`MUTUAL DESTRUCTION — Both units destroyed in Round ${rounds}!`, 'draw');
  }

  return { winner, steps, fSide, eSide, rounds };
}

function runMultiBattle(friendly, enemy, friendlyFirst, count, friendlyModelCount, enemyModelCount) {
  let fWins = 0, eWins = 0, draws = 0;

  for (let i = 0; i < count; i++) {
    const result = runSingleBattle(friendly, enemy, friendlyFirst, friendlyModelCount, enemyModelCount);
    const s = result.winner.side;
    if (s === 'friendly') fWins++;
    else if (s === 'enemy') eWins++;
    else draws++;
  }

  const steps = [];
  const push = (msg, type = 'normal') => steps.push({ msg, type });
  push(`MULTI-BATTLE RESULTS — ${count.toLocaleString()} battles`, 'title');
  push(`Friendly: ${friendlyModelCount} model${friendlyModelCount !== 1 ? 's' : ''}  ·  Enemy: ${enemyModelCount} model${enemyModelCount !== 1 ? 's' : ''}`, 'info');
  push(`══════════════════════════════════`, 'divider');
  push(`Friendly wins:  ${fWins}  (${((fWins / count) * 100).toFixed(1)}%)`, 'info');
  push(`Enemy wins:     ${eWins}  (${((eWins / count) * 100).toFixed(1)}%)`, 'info');
  push(`Draws:          ${draws}  (${((draws / count) * 100).toFixed(1)}%)`, 'info');
  push(`══════════════════════════════════`, 'divider');

  const winner = fWins > eWins
    ? { side: 'friendly', unit: friendly, winRate: fWins / count, fWins, eWins, draws, count }
    : eWins > fWins
    ? { side: 'enemy', unit: enemy, winRate: eWins / count, fWins, eWins, draws, count }
    : { side: 'draw', fWins, eWins, draws, count };

  return { winner, steps, isMultiBattle: true, fWins, eWins, draws, count };
}

export function simulateBattle(friendly, enemy, { count = 1, friendlyFirst = true, friendlyModelCount = 1, enemyModelCount = 1 } = {}) {
  if (count === 1) {
    return runSingleBattle(friendly, enemy, friendlyFirst, friendlyModelCount, enemyModelCount);
  }
  return runMultiBattle(friendly, enemy, friendlyFirst, count, friendlyModelCount, enemyModelCount);
}
