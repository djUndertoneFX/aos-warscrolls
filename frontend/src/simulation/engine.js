// AoS 4th Edition Battle Simulation Engine

function d6() {
  return Math.floor(Math.random() * 6) + 1;
}

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

function parseThreshold(val) {
  const m = String(val || '7').match(/(\d+)/);
  return m ? parseInt(m[1]) : 7;
}

function parseRend(val) {
  const s = String(val || '0').trim();
  if (s === '-' || s === '') return 0;
  const n = parseInt(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseSaveValue(val) {
  const m = String(val || '7+').match(/(\d+)/);
  return m ? parseInt(m[1]) : 7;
}

function parseWeapons(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

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

function makeSide(unit, modelCount) {
  const hpPerModel = parseInt(unit.health) || 1;
  return {
    modelsAlive: modelCount,
    modelCount,
    hpPerModel,
    currentModelHp: hpPerModel,
    modelsKilled: 0,
  };
}

// Apply damage cascading through models; returns number of models newly killed this hit
function applyDamage(side, damage, push) {
  let dmgLeft = damage;
  while (dmgLeft > 0 && side.modelsAlive > 0) {
    if (dmgLeft >= side.currentModelHp) {
      dmgLeft -= side.currentModelHp;
      side.modelsAlive--;
      side.modelsKilled++;
      side.currentModelHp = side.hpPerModel;
      if (side.modelsAlive > 0) {
        push(`              ☠ Model slain! ${side.modelsAlive} model${side.modelsAlive !== 1 ? 's' : ''} remaining${dmgLeft > 0 ? ` (${dmgLeft} dmg overflows)` : ''}.`, 'damage');
      } else {
        push(`              ☠ Model slain! Unit destroyed!`, 'damage');
      }
    } else {
      side.currentModelHp -= dmgLeft;
      dmgLeft = 0;
    }
  }
}

// Execute attacks for one unit's weapon against a defender.
// Shows: batch dice summary first, then per-attack detail.
function resolveWeapon(weapon, sideState, defSide, defSave, charged, isShootingPhase, push) {
  if (defSide.modelsAlive === 0 || sideState.modelsAlive === 0) return;

  const critType    = detectCritAbility(weapon);
  const chargeBonus = !isShootingPhase && hasChargeBonus(weapon) && charged;
  const hitNeeded   = parseThreshold(weapon.hit);
  const woundNeeded = parseThreshold(weapon.wound);
  const rend        = parseRend(weapon.rend);
  const saveNeeded  = defSave + rend;

  // Roll the full attack pool — one roll per model per weapon.attacks
  const attackRoller = parseDice(weapon.attacks);
  const attacksPerModel = [];
  for (let m = 0; m < sideState.modelsAlive; m++) attacksPerModel.push(attackRoller());
  const totalAttacks = attacksPerModel.reduce((a, b) => a + b, 0);

  push(`    Weapon: "${weapon.name}"  [${sideState.modelsAlive} model${sideState.modelsAlive !== 1 ? 's' : ''} × ${weapon.attacks} Atk = ${totalAttacks} dice | Hit:${weapon.hit}, Wnd:${weapon.wound}, Rnd:${weapon.rend || '-'}, Dmg:${weapon.damage}${chargeBonus ? ' +1 Dmg (charge)' : ''}]`, 'weapon');

  // ── Phase 1: Roll ALL hit dice ───────────────────────────────────────────
  const hitRolls = [];
  for (let a = 0; a < totalAttacks; a++) hitRolls.push(d6());

  const crits  = hitRolls.filter(r => r === 6);
  const hits   = hitRolls.filter(r => r >= hitNeeded);
  const misses = hitRolls.filter(r => r < hitNeeded);

  push(`      Hit rolls (${totalAttacks}):  ${hitRolls.slice().sort((a,b)=>b-a).join(', ')}`, 'roll-summary');
  push(`        → ${hits.length} hit${hits.length !== 1 ? 's' : ''}${crits.length > 0 ? ` (${crits.length} crit${crits.length !== 1 ? 's' : ''})` : ''}  ·  ${misses.length} miss${misses.length !== 1 ? 'es' : ''}`, 'roll-result');

  if (hits.length === 0) return;

  // ── Phase 2: Roll ALL wound dice (for non-auto hits) ────────────────────
  // Separate crits by ability — mortals skip everything, auto-wounds skip wound roll
  let mortalCrits     = critType === 'mortal'     ? crits.length : 0;
  let autoWoundCrits  = critType === 'auto-wound' ? crits.length : 0;
  let doubleHitCrits  = critType === '2hits'      ? crits.length : 0;
  let normalHits      = hits.length - crits.length + (doubleHitCrits > 0 ? crits.length : 0); // crits still hit normally unless mortal/auto
  if (critType === 'mortal' || critType === 'auto-wound') normalHits = hits.length - crits.length;

  // Extra hits from 2-hit crits
  const extraHitsFromCrits = doubleHitCrits; // each crit scores an extra hit
  const totalWoundDice = normalHits + extraHitsFromCrits + autoWoundCrits; // auto-wound crits go straight to wound pool

  let woundRolls = [];
  let wounds = 0;
  if (totalWoundDice > 0) {
    for (let w = 0; w < totalWoundDice; w++) woundRolls.push(d6());
    wounds = woundRolls.filter(r => r >= woundNeeded).length;
    push(`      Wound rolls (${totalWoundDice}):  ${woundRolls.slice().sort((a,b)=>b-a).join(', ')}`, 'roll-summary');
    push(`        → ${wounds} wound${wounds !== 1 ? 's' : ''}  ·  ${totalWoundDice - wounds} fail${totalWoundDice - wounds !== 1 ? 's' : ''}`, 'roll-result');
  }

  // ── Phase 3: Roll ALL save dice ─────────────────────────────────────────
  const totalSaveDice = wounds + autoWoundCrits;
  let saveRolls = [];
  let unsaved = 0;
  if (totalSaveDice > 0) {
    for (let s = 0; s < totalSaveDice; s++) saveRolls.push(d6());
    const saved = saveRolls.filter(r => r >= saveNeeded).length;
    unsaved = totalSaveDice - saved;
    push(`      Save rolls  (${totalSaveDice}, vs ${saveNeeded}+):  ${saveRolls.slice().sort((a,b)=>b-a).join(', ')}`, 'roll-summary');
    push(`        → ${saved} saved  ·  ${unsaved} unsaved`, 'roll-result');
  }

  // Mortal crit damage — no save, no wound
  if (mortalCrits > 0) {
    push(`      Crit mortals (${mortalCrits}):  ${mortalCrits} automatic unsaved mortal hit${mortalCrits !== 1 ? 's' : ''}`, 'crit');
  }

  const totalUnsaved = unsaved + mortalCrits;
  if (totalUnsaved === 0) {
    push(`      All attacks saved or missed — no damage this weapon.`, 'saved');
    return;
  }

  // ── Phase 4: Per-unsaved-wound detail ───────────────────────────────────
  push(`      ── Damage Detail (${totalUnsaved} unsaved hit${totalUnsaved !== 1 ? 's' : ''}) ──`, 'phase');

  for (let i = 0; i < totalUnsaved; i++) {
    if (defSide.modelsAlive === 0) break;
    const dmgRoller = parseDice(weapon.damage);
    const dmgRaw    = dmgRoller();
    const dmgVal    = dmgRaw + (chargeBonus ? 1 : 0);
    const isMortal  = i >= unsaved; // mortal crits come after regular unsaved
    push(`        Hit ${i + 1}${isMortal ? ' (Mortal Crit)' : ''}:  ${dmgVal} damage${chargeBonus ? ' (+1 charge)' : ''}  →  Defender ${defSide.modelsAlive}/${defSide.modelCount} models, ${defSide.currentModelHp}/${defSide.hpPerModel} HP on front model`, 'hp');
    applyDamage(defSide, dmgVal, push);
  }
}

function runSingleBattle(friendly, enemy, friendlyFirst, friendlyModelCount, enemyModelCount) {
  const steps = [];
  const push  = (msg, type = 'normal') => steps.push({ msg, type });

  const fSave = parseSaveValue(friendly.save);
  const eSave = parseSaveValue(enemy.save);
  const fSide = makeSide(friendly, friendlyModelCount);
  const eSide = makeSide(enemy, enemyModelCount);

  const fMelee  = parseWeapons(friendly.weapons).filter(w => w.type === 'melee');
  const eMelee  = parseWeapons(enemy.weapons).filter(w => w.type === 'melee');
  const fRanged = parseWeapons(friendly.weapons).filter(w => w.type === 'ranged');
  const eRanged = parseWeapons(enemy.weapons).filter(w => w.type === 'ranged');

  push(`══════════════════════════════════`, 'divider');
  push(`SIMULACRUM: ${friendly.name} vs. ${enemy.name}`, 'title');
  push(`Initiative: ${friendlyFirst ? 'Friendly charges' : 'Enemy charges'}`, 'info');
  push(`Friendly — ${friendly.name}: ${friendlyModelCount} model${friendlyModelCount !== 1 ? 's' : ''} × ${fSide.hpPerModel} HP, Save: ${friendly.save}`, 'info');
  push(`Enemy   — ${enemy.name}: ${enemyModelCount} model${enemyModelCount !== 1 ? 's' : ''} × ${eSide.hpPerModel} HP, Save: ${enemy.save}`, 'info');
  push(`══════════════════════════════════`, 'divider');

  const fightUnit = (attackerName, attackerSide, sideState, weapons, defSide, defSave, charged, isShootingPhase) => {
    if (sideState.modelsAlive === 0 || weapons.length === 0) return;
    const prefix = attackerSide === 'friendly' ? '[FRIENDLY]' : '[ENEMY]  ';
    const phase  = isShootingPhase ? 'SHOOT' : 'FIGHT';
    push(`  ${prefix} ${attackerName} (${sideState.modelsAlive} model${sideState.modelsAlive !== 1 ? 's' : ''}) — ${phase}!${!isShootingPhase && charged ? '  ⚡ Charging!' : ''}`, 'fight');
    for (const weapon of weapons) {
      if (defSide.modelsAlive === 0) break;
      resolveWeapon(weapon, sideState, defSide, defSave, charged, isShootingPhase, push);
    }
  };

  let round = 1;
  const MAX_ROUNDS = 20;

  while (fSide.modelsAlive > 0 && eSide.modelsAlive > 0 && round <= MAX_ROUNDS) {
    push(``, 'spacer');
    push(`══ BATTLE ROUND ${round} ══`, 'round');

    const first = round === 1;
    const fCharged = first && friendlyFirst;
    const eCharged = first && !friendlyFirst;

    if (fRanged.length > 0 || eRanged.length > 0) {
      push(`  — Shooting Phase —`, 'phase');
      fightUnit(friendly.name, 'friendly', fSide, fRanged, eSide, eSave, false, true);
      if (eSide.modelsAlive > 0)
        fightUnit(enemy.name, 'enemy', eSide, eRanged, fSide, fSave, false, true);
    }

    if (fSide.modelsAlive > 0 && eSide.modelsAlive > 0) {
      push(`  — Combat Phase —`, 'phase');
      if (friendlyFirst) {
        fightUnit(friendly.name, 'friendly', fSide, fMelee, eSide, eSave, fCharged, false);
        if (eSide.modelsAlive > 0)
          fightUnit(enemy.name, 'enemy', eSide, eMelee, fSide, fSave, eCharged, false);
      } else {
        fightUnit(enemy.name, 'enemy', eSide, eMelee, fSide, fSave, eCharged, false);
        if (fSide.modelsAlive > 0)
          fightUnit(friendly.name, 'friendly', fSide, fMelee, eSide, eSave, fCharged, false);
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
    push(`${fSide.modelsAlive} of ${fSide.modelCount} models survive  ·  ${fSide.modelsKilled} model${fSide.modelsKilled !== 1 ? 's' : ''} lost${fSide.currentModelHp < fSide.hpPerModel ? `  ·  ${fSide.hpPerModel - fSide.currentModelHp} dmg on surviving model` : ''}`, 'victory');
  } else if (eSide.modelsAlive > 0 && fSide.modelsAlive === 0) {
    winner = { side: 'enemy', unit: enemy, modelsAlive: eSide.modelsAlive, modelsKilled: eSide.modelsKilled, modelCount: eSide.modelCount, damageOnCurrent: eSide.hpPerModel - eSide.currentModelHp, hpPerModel: eSide.hpPerModel };
    push(`ENEMY UNIT "${enemy.name}" STANDS VICTORIOUS!`, 'victory');
    push(`${eSide.modelsAlive} of ${eSide.modelCount} models survive  ·  ${eSide.modelsKilled} model${eSide.modelsKilled !== 1 ? 's' : ''} lost${eSide.currentModelHp < eSide.hpPerModel ? `  ·  ${eSide.hpPerModel - eSide.currentModelHp} dmg on surviving model` : ''}`, 'victory');
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
    const r = runSingleBattle(friendly, enemy, friendlyFirst, friendlyModelCount, enemyModelCount);
    const s = r.winner.side;
    if (s === 'friendly') fWins++;
    else if (s === 'enemy') eWins++;
    else draws++;
  }

  const steps = [];
  const push  = (msg, type = 'normal') => steps.push({ msg, type });
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
  if (count === 1) return runSingleBattle(friendly, enemy, friendlyFirst, friendlyModelCount, enemyModelCount);
  return runMultiBattle(friendly, enemy, friendlyFirst, count, friendlyModelCount, enemyModelCount);
}
