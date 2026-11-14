// Turns an Anvil of Apotheosis option's scraped effect text into the
// concrete warscroll changes it describes, so picking an option on the
// Path to Glory wizard visibly moves the numbers on the warlord's
// warscroll (Attacks 4 -> 5, Health 5 -> 7) instead of only printing the
// option's rules text underneath it.
//
// Deliberately a best-effort text matcher, not a rules engine: the source
// is OCR'd battletome prose with real typos in it ("lo" for "to", "''" for
// a double-quote, "characleristic"). Every pattern below was written
// against the full corpus of scraped options (see
// scripts/checkApotheosisEffects.mjs, which replays all 19 factions'
// options through this parser), and anything that doesn't match returns
// nothing at all rather than guessing — an unparsed option just keeps the
// old behaviour of printing as rules text.

// Phrases that mean "this is an in-battle rule", not "this permanently
// changes the warscroll". A sentence carrying any of these is skipped
// entirely: "Add 2 to the Attacks characteristic of this unit's melee
// weapons WHILE IT IS WHOLLY WITHIN the creeping overgrowth" is an ability,
// not a stat change, and must never be baked into the printed profile.
const CONDITIONAL_RE = /\b(while|until|unless|for the rest of|this phase|this turn|that target|targeting|for each|in the first battle round|wholly within|within \d|roll |rolls? a|if the|if your hero|if this unit|friendly|instead of|you can|halve|each time|after this|when this|at the (start|end))\b/i;

// Characteristics that live on the stat wheel vs. in a weapon row.
const UNIT_STATS = ['Move', 'Health', 'Save', 'Control'];
const WEAPON_STATS = { attacks: 'atk', damage: 'dmg', rend: 'rnd', hit: 'hit', wound: 'wnd' };

// The source concatenates sentences with no space after the full stop
// ("...to 12".Change the Health...") and runs a whole block of them on
// after a colon ("...changes to your hero's warscroll:Change the Move
// characteristic to 10"."), so a plain split on /\.\s+/ would merge a
// Battle Mount's five separate stat changes into one sentence and then
// drop all of them the moment one of them tripped CONDITIONAL_RE.
//
// The colon split is deliberately limited to the handful of words a new
// sentence actually starts with there: splitting on every colon followed
// by a capital would also cut "Replace the INFANTRY keyword with the
// following keywords: MONSTER, FLY." in half, leaving the Replace with no
// keywords to replace INFANTRY with.
function splitSentences(text) {
  return String(text || '')
    .split(/(?<=\.)\s*(?=[A-Z])|(?<=\.)\s+|:\s*(?=(?:In addition|Add|Change|Replace|Pick|Your hero|This unit)\b)/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Adds `delta` to the last number in a characteristic value, keeping
// whatever decoration sits around it: 6" + 2 -> 8", 3+ - 1 -> 2+,
// D6+6" + 2 -> D6+8". Returns null when there's no number to move.
export function addToCharacteristic(value, delta) {
  const m = /^(.*?)(\d+)([^\d]*)$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, prefix, num, suffix] = m;
  return `${prefix}${Math.max(0, parseInt(num, 10) + delta)}${suffix}`;
}

// Inverse of addToCharacteristic — used when the player types a new total
// into a field that an option is adding to, so the typed number becomes
// the new effective value and the delta is subtracted back out of the base.
export function subtractFromCharacteristic(value, delta) {
  return addToCharacteristic(value, -delta);
}

// Normalises a weapon-target phrase ("your hero's Choppa or Hacka",
// "non-Companion melee weapons", "this unit's Companion melee weapons")
// into the shape the wizard's weaponMatchesTarget() consumes.
export function parseWeaponTarget(rawPhrase) {
  let phrase = String(rawPhrase || '').replace(/[.,;:]+$/, '').trim();
  // "that weapon" / "1 of your hero's melee weapons" are player picks the
  // wizard can't resolve on its own — better to leave them as rules text
  // than to guess a weapon row. Tested before the leading article is
  // stripped, or "that weapon" would read as the generic "weapon".
  if (!phrase || /^(that|the chosen|1 of)\b/i.test(phrase)) return null;
  phrase = phrase
    .replace(/^(?:the|their|its)\s+/i, '')
    .replace(/^(?:your|our|this)\s+(?:hero|unit)(?:'s|’s|s)?\s+/i, '')
    .replace(/^(?:your|our|this)\s+(?:hero|unit)\s*/i, '')
    .trim();
  if (!phrase) return null;

  const nonCompanion = /^non-companion\s+/i.test(phrase);
  const companionOnly = !nonCompanion && /^companion\s+/i.test(phrase);
  phrase = phrase.replace(/^non-companion\s+/i, '').replace(/^companion\s+/i, '').trim().toLowerCase();

  const isGenericMelee = /^melee weapons?$/.test(phrase);
  const isGenericRanged = /^(?:ranged|missile) weapons?$/.test(phrase);
  const isGenericAny = /^weapons?$/.test(phrase);
  const altNames = (isGenericMelee || isGenericRanged || isGenericAny)
    ? []
    : phrase.split(/\s+or\s+/).map(s => s.trim()).filter(Boolean);
  return { isGenericMelee, isGenericRanged, isGenericAny, nonCompanion, companionOnly, altNames };
}

// True when a weapon row is one the target phrase is talking about.
// `companionNames` is the lowercased list of weapon names the currently
// picked Companion granted, so "non-Companion melee weapons" can exclude
// them. Name comparison tolerates a trailing "weapon"/"weapons" on either
// side ("Huge Fang-filled Gobs weapon" vs the row's "Huge Fang-filled
// Gobs") without stripping it blindly — "Thalassic Weapon" is itself a
// real weapon name.
export function weaponRowMatchesTarget(row, target, listIsMelee, companionNames = []) {
  const name = String(row?.name || '').trim().toLowerCase();
  if (!name || !target) return false;
  const isCompanion = companionNames.includes(name);
  if (target.companionOnly) return isCompanion;
  if (target.nonCompanion && isCompanion) return false;
  if (target.isGenericAny) return true;
  if (target.isGenericMelee) return listIsMelee;
  if (target.isGenericRanged) return !listIsMelee;
  const bare = s => s.replace(/\s+weapons?$/i, '').trim();
  return target.altNames.some(alt => alt === name || bare(alt) === bare(name));
}

function pushStatMod(mods, stat, op, value, extra = {}) {
  const key = stat.toLowerCase();
  if (!UNIT_STATS.some(s => s.toLowerCase() === key)) return;
  mods.push({ kind: 'stat', stat: key, op, value, ...extra });
}

// "Change the Move characteristic to 12"", "Your hero has a Save
// characteristic of 5+", "The Hit characteristic of your hero's Cult Blade
// is 2+", "...Talons have a Damage characteristic of 3".
function parseSetMods(sentence, mods) {
  // Weapon form first — it names the weapon before or after the stat, and
  // its matches must not be re-read as unit-stat changes below.
  const weaponSetRe = /(?:the\s+)?(Attacks|Damage|Rend|Hit|Wound)\s+charac\w*\s+of\s+(.+?)\s+is\s+(\d+\+?)/gi;
  let m;
  while ((m = weaponSetRe.exec(sentence))) {
    const target = parseWeaponTarget(m[2]);
    if (target) mods.push({ kind: 'weapon', field: WEAPON_STATS[m[1].toLowerCase()], op: 'set', value: m[3], target });
  }
  // "<weapon> have/has a Damage characteristic of 3"
  const weaponHasRe = /(.+?)\s+(?:has|have)\s+an?\s+(Attacks|Damage|Rend|Hit|Wound)\s+charac\w*\s+of\s+(\d+\+?)/gi;
  while ((m = weaponHasRe.exec(sentence))) {
    const target = parseWeaponTarget(m[1].replace(/^.*?\b(?:only\.|\.)\s*/i, ''));
    if (target) mods.push({ kind: 'weapon', field: WEAPON_STATS[m[2].toLowerCase()], op: 'set', value: m[3], target });
  }
  // Unit stat wheel. "to|lo" covers the OCR'd "lo"; "of" covers "has a
  // Save characteristic of 5+"; "is" covers "Save characteristic is 2+".
  const statSetRe = /\b(Move|Health|Save|Control)\s+charac\w*\s+(?:to|lo|of|is)\s+((?:D\d+\+)?\d+\s*(?:\+|''|"|”)?)/gi;
  while ((m = statSetRe.exec(sentence))) {
    pushStatMod(mods, m[1], 'set', m[2].replace(/''/, '"').replace(/\s+/g, ''));
  }
}

// "Add 1 to your hero's Health characteristic", "Add 2" to your hero's
// Move characteristic", "Subtract 1 from the Attacks characteristic of
// this unit's Companion melee weapons", "Add 1 to the Attacks
// characteristic of your hero's Troggoth Club or add 2 to the Attacks
// characteristic of your hero's Boss Weapon" (an either/or the applier
// resolves against whichever weapon the hero actually has).
function parseDeltaMods(sentence, mods) {
  const exclusiveGroup = /\bor\s+add\s+\d/i.test(sentence) ? `x${mods.length}-${sentence.length}` : null;

  const weaponDeltaRe = /\b(Add|Subtract)\s+(\d+)\s+(?:to|lo|from)\s+the\s+(Attacks|Damage|Rend|Hit|Wound)\s+charac\w*\s+of\s+(.+?)(?=\.|$|,\s|\s+or\s+(?:add|subtract)\s+\d)/gi;
  let m;
  while ((m = weaponDeltaRe.exec(sentence))) {
    const target = parseWeaponTarget(m[4]);
    if (!target) continue;
    const delta = (m[1].toLowerCase() === 'subtract' ? -1 : 1) * parseInt(m[2], 10);
    mods.push({ kind: 'weapon', field: WEAPON_STATS[m[3].toLowerCase()], op: 'add', value: delta, target, exclusiveGroup });
  }

  // Unit stat wheel. The gap between "to/from" and the characteristic name
  // is bounded and must not name somebody else's profile (a FLAGSHIP, a
  // friendly SKYVESSEL) — those are army-level rules, not this hero's.
  const statDeltaRe = /\b(Add|Subtract)\s+(\d+)\s*(?:''|"|”)?\s+(?:to|lo|from)\s+([^.]{0,32}?)\b(Move|Health|Save|Control)\s+charac\w*/gi;
  while ((m = statDeltaRe.exec(sentence))) {
    if (/flagship|skyvessel|friendly|regiment/i.test(m[3])) continue;
    if (/attacks|damage|rend|hit|wound/i.test(m[3])) continue;
    pushStatMod(mods, m[4], 'add', (m[1].toLowerCase() === 'subtract' ? -1 : 1) * parseInt(m[2], 10));
  }
}

// "Replace the INFANTRY keyword with the CAVALRY keyword", "...with the
// following keywords: MONSTER, FLY", "Add the SQUIG, MOONCLAN and FLY
// keywords", "Your hero has FLY", "Your hero has WARD (6+)".
// "CAVALRY only. Add 'D3+' in front of your hero's Move characteristic."
// — not a number change at all, a random element bolted onto the front of
// the printed value (6" becomes D3+6").
function parsePrefixMods(sentence, mods) {
  const m = /\bAdd\s+['‘’"]?([A-Z0-9+]+?)['‘’"]?\s+in\s+front\s+of\s+[^.]{0,32}?\b(Move|Health|Save|Control)\s+charac\w*/i.exec(sentence);
  if (m) pushStatMod(mods, m[2], 'prefix', m[1]);
}

function parseKeywordMods(sentence, mods) {
  // Two forms, and the "following keywords:" one has to be tried first —
  // as an optional group inside the other pattern the lazy name capture
  // just swallows the words "following keywords:" themselves.
  let m = /\bReplace\s+(?:the|rhe|your hero'?s?|their)\s+([A-Z][A-Z' -]*?)\s+keyword\s+with\s+the\s+following\s+keywords?:\s*(.+?)\s*\.?$/.exec(sentence)
    || /\bReplace\s+(?:the|rhe|your hero'?s?|their)\s+([A-Z][A-Z' -]*?)\s+keyword\s+with\s+the\s+(.+?)(?:\s+keywords?)?\s*\.?$/.exec(sentence);
  if (m) {
    const to = m[2].replace(/\s+and\s+/gi, ',').split(',').map(s => s.trim().replace(/\s+keywords?$/i, '')).filter(Boolean);
    if (to.length) mods.push({ kind: 'keyword', op: 'replace', from: m[1].trim(), to });
    return;
  }
  m = /\bAdd\s+the\s+([A-Z][A-Z0-9'() +-]*(?:(?:,|\s+and)\s+[A-Z][A-Z0-9'() +-]*)*)\s+keywords?\b/.exec(sentence);
  if (m) {
    const add = m[1].replace(/\s+and\s+/g, ',').split(',').map(s => s.trim()).filter(Boolean);
    if (add.length) mods.push({ kind: 'keyword', op: 'add', keywords: add });
    return;
  }
  // "Your hero has FLY." / "Your hero has WARD (6+)." / "...has the
  // WIZARD (1) keyword" — a grant, not a replacement.
  const grantRe = /\b(?:your hero|this unit)\s+has\s+(?:the\s+)?((?:FLY|WARD|WIZARD|PRIEST)(?:\s*\(\d\+?\))?)(?:\s+and\s+(?:the\s+)?((?:FLY|WARD|WIZARD|PRIEST)(?:\s*\(\d\+?\))?))?/gi;
  while ((m = grantRe.exec(sentence))) {
    const add = [m[1], m[2]].filter(Boolean).map(s => s.replace(/\s+/g, ' ').trim());
    if (add.length) mods.push({ kind: 'keyword', op: 'add', keywords: add });
  }
  // "Change the number after your hero's RELENTLESS DISCIPLINE keyword to
  // 6" / "Add 2 to the number after this unit's RELENTLESS DISCIPLINE
  // keyword" — a keyword whose printed value the pick moves.
  m = /\b(?:Change|Add\s+(\d+)\s+to)\s+the\s+number\s+after\s+(?:the|your hero'?s?|this unit'?s?|their)\s+([A-Z][A-Z0-9' ]*?)\s+keyword\s+(?:to|lo|is)\s+(\d+)/i.exec(sentence)
    || /\bAdd\s+(\d+)\s+to\s+the\s+number\s+after\s+(?:the|your hero'?s?|this unit'?s?|their)\s+([A-Z][A-Z0-9' ]*?)\s+keyword/i.exec(sentence)
    || /\bThe\s+number\s+after\s+(?:the|your hero'?s?|this unit'?s?|their)\s+([A-Z][A-Z0-9' ]*?)\s+keyword\s+is\s+(\d+)/i.exec(sentence);
  if (m) {
    const groups = m.slice(1).filter(g => g !== undefined);
    const keyword = groups.find(g => /[A-Z]{3}/.test(g));
    const nums = groups.filter(g => /^\d+$/.test(g));
    if (keyword && nums.length) {
      // Two numbers means the "Add N to ... keyword to M" shape never seen
      // in the corpus; one number plus an "Add" verb means a delta.
      const isDelta = /^Add\b/i.test(sentence);
      mods.push({ kind: 'keywordNumber', keyword: keyword.trim(), op: isDelta ? 'add' : 'set', value: parseInt(nums[nums.length - 1], 10) });
    }
    return;
  }

  m = /\bgains?\s+the\s+([A-Z][A-Z0-9'() ]*?)(?:\s+and\s+([A-Z][A-Z0-9'() ]*?))?\s+keywords?\b/.exec(sentence);
  if (m) {
    const add = [m[1], m[2]].filter(Boolean).map(s => s.trim());
    if (add.length) mods.push({ kind: 'keyword', op: 'add', keywords: add });
  }
}

// Effect phrasings the wizard already applies through its own bespoke
// handlers (a keyword the player picks for Anti-X, an Attacks bonus that
// scales off the hero's Path rank) — parsing them here too would apply
// them twice.
const ALREADY_HANDLED_RE = /anti-x\s*\(\+1 rend\)|charge\s*\(\+1 damage\)|ranks this unit has earned on its Path/i;

/**
 * @param {string} effectText an option's scraped `effect` column
 * @returns {Array} mods — {kind:'stat'|'weapon'|'keyword', ...}
 */
export function parseWarscrollMods(effectText) {
  const text = String(effectText || '');
  if (!text) return [];
  const mods = [];
  for (const sentence of splitSentences(text)) {
    if (CONDITIONAL_RE.test(sentence)) continue;
    if (ALREADY_HANDLED_RE.test(sentence)) continue;
    parseSetMods(sentence, mods);
    parseDeltaMods(sentence, mods);
    parseKeywordMods(sentence, mods);
    parsePrefixMods(sentence, mods);
  }
  // A 'set' and an 'add' on the same stat from one option (none seen so
  // far, but cheap to be deterministic about): the set is the newer value
  // the source is printing, so it is applied first and the add stacks on
  // top — which is the order the applier walks them in anyway.
  return mods;
}

// Human-readable one-liner for the "what changed this number" tooltip on
// the warscroll.
export function describeMod(mod) {
  if (mod.kind === 'stat') {
    const label = UNIT_STATS.find(s => s.toLowerCase() === mod.stat) || mod.stat;
    return mod.op === 'set' ? `${label} ${mod.value}` : `${label} ${mod.value > 0 ? '+' : ''}${mod.value}`;
  }
  if (mod.kind === 'weapon') {
    const label = Object.keys(WEAPON_STATS).find(k => WEAPON_STATS[k] === mod.field) || mod.field;
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    return mod.op === 'set' ? `${cap} ${mod.value}` : `${cap} ${mod.value > 0 ? '+' : ''}${mod.value}`;
  }
  if (mod.kind === 'keyword') {
    return mod.op === 'replace' ? `${mod.from} → ${mod.to.join(', ')}` : `+${mod.keywords.join(', ')}`;
  }
  return '';
}
