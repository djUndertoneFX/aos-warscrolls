/**
 * Shared "which phase is this ability really about" detection, used by both
 * scraper.js (unit abilities) and scrapeRules.js (Battle Traits/Formations/
 * Heroic Traits/Artefacts/Spell/Prayer/Manifestation Lore).
 *
 * Only relevant for ambiguous-timing abilities — Passive, Reaction, or a bare
 * "Once Per Turn/Battle/Battle Round" with no phase qualifier — where the
 * printed book still colours the card by the ONE (or few) phase(s) its
 * effect actually matters in, even though the timing itself doesn't say so.
 * Abilities whose timing already names a phase directly (e.g. "Any Combat
 * Phase") don't need any of this; they already render correctly from their
 * own timing text via WarscrollGW.js's getPhaseStyle(ab.phase_key ||
 * ab.timing), so callers should only invoke resolvePhaseKeyString() for the
 * ambiguous cases (see isAmbiguousTiming below).
 *
 * Canonical keys are literal PHASE_PRESETS-substring-matchable strings —
 * 'deployment', 'hero phase', 'movement', 'shooting', 'charge', 'combat',
 * 'end of turn' — matching the convention Battle Formations already stored
 * in faction_battle_formations.phase_key (confirmed live: 'hero phase' and
 * 'end of turn', WITH the space, not BattleBuddyPage.js's own internal
 * short keys 'hero'/'end_of_turn' — those only exist as a translation layer
 * inside BattleBuddyPage.js's withDiscoveredSplit). Keeping this file's
 * output in the same style means WarscrollGW.js's getPhaseStyle(ab.phase_key
 * || ab.timing) already works everywhere it's called, site-wide, with zero
 * frontend changes for the single-key case — only true multi-key values
 * (new in this session) need new rendering support.
 *
 * Multi-key values are comma-joined ("movement,charge") — unambiguous
 * against every single-key value above since none of those contain a comma.
 */

const PRESET_KEYS = ['deployment', 'hero phase', 'movement', 'shooting', 'charge', 'combat', 'end of turn'];

function isAmbiguousTiming(timing) {
  const t = (timing || '').toLowerCase();
  if (!t) return true;
  // A literal phase name anywhere in the timing wins regardless of what else
  // is in there — confirmed bug: Kharadron's "Your Movement Phase, Reaction:
  // You declared a non-CHARGE MOVE ability..." already names its own phase
  // directly, but the bare 'reaction' check below (checked first, before
  // this fix) flagged it ambiguous anyway and sent it through text-discovery,
  // which then mis-fired on "non-CHARGE move" as if it meant the charge
  // phase — the exact opposite of what "non-CHARGE" says.
  if (literalPhaseFromTiming(t)) return false;
  if (t.includes('passive')) return true;
  if (t.includes('reaction')) return true;
  // "Once Per Turn/Battle/Battle Round" with no phase name attached is
  // ambiguous (the literalPhaseFromTiming check above already handled the
  // case where one IS attached).
  if (/once per (turn|battle( round)?)/.test(t)) return true;
  return false;
}

// Direct "this timing literally names one phase" check — same substrings
// BattleBuddyPage.js's BATTLE_PHASES/abilityPhaseKey already use.
function literalPhaseFromTiming(timing) {
  const t = (timing || '').toLowerCase();
  if (!t) return null;
  if (t.includes('deployment')) return 'deployment';
  if (t.includes('hero phase')) return 'hero phase';
  if (t.includes('movement') || t.includes('move phase')) return 'movement';
  if (t.includes('shooting')) return 'shooting';
  if (t.includes('charge')) return 'charge';
  if (t.includes('combat')) return 'combat';
  if (t.includes('end of')) return 'end of turn';
  return null;
}

const PHASE_KEYWORD_GROUPS = [
  { key: 'hero phase', patterns: [/casting roll/, /\bunbind\b/, /\bdispel\b/, /\bbanish/, /prayer roll/, /ritual roll/, /lurelight/, /\bhero phase\b/, /command point/] },
  { key: 'movement',   patterns: [/run roll/, /\bretreat/, /movement phase/, /\bmove roll/, /ends? (a |its |their )?move\b/, /moves? (through|across)/, /move characteristic/, /declared? an? run/, /\brun ability\b/] },
  // "non-CHARGE move" (confirmed: Kharadron's Transport Skyfarers) means the
  // opposite of charge-relevant — excluded via a negative lookbehind rather
  // than just /\bcharge move\b/, which matched it as a false positive.
  { key: 'charge',     patterns: [/charge roll/, /charge phase/, /(?<!non-)\bcharge move\b/, /declared? an? charge/, /\bcharge ability\b/] },
  { key: 'shooting',   patterns: [/shooting attack/, /shoot phase/, /ranged attack/, /shooting phase/, /declared? an? shoot/, /\bshoot ability\b/] },
  {
    key: 'combat',
    // GENERIC_STAT_ROLL_PATTERNS (below) are also part of this group's own
    // patterns — kept as a separate array of pattern SOURCE STRINGS (not the
    // RegExp objects themselves, which the array-literal below constructs as
    // distinct instances that would never be === equal to these, silently
    // making the "exclude when shooting language present" filter downstream
    // a no-op) so detectPhaseKeysFromText can filter them out by comparing
    // re.source instead of object identity.
    patterns: [/combat attack/, /fight phase/, /\bpile in\b/, /combat phase/, /declared? an? fight/, /\bfight ability\b/,
               // Per explicit user instruction: a bare hit/wound/rend/save-roll modifier
               // with no other phase qualifier defaults to combat-phase-only, since that's
               // the dominant context for these and the book colours them that way.
               /\bhit rolls?\b/, /\bwound rolls?\b/, /rend characteristic/, /\bsave rolls?\b/],
    genericStatRollSources: ['\\bhit rolls?\\b', '\\bwound rolls?\\b', 'rend characteristic', '\\bsave rolls?\\b'],
  },
  { key: 'end of turn', patterns: [/end of (the |any )?turn/, /end of (the )?battle round/] },
  { key: 'deployment', patterns: [/\bdeploy/, /set up.*battlefield edge/, /\breserves?\b/] },
];

function detectPhaseKeysFromText(text) {
  const t = (text || '').toLowerCase();
  if (!t) return [];
  const hasShootingLanguage = /shooting attack|shoot phase|ranged attack|shooting phase|shoot ability|declared? an? shoot/.test(t);
  const matched = [];
  for (const grp of PHASE_KEYWORD_GROUPS) {
    if (grp.key === 'combat' && hasShootingLanguage) {
      // Explicit shooting language already present — don't ALSO tag combat
      // purely from a bare "hit rolls"/"wound rolls" mention; the shooting
      // group's own patterns (checked separately, above) handle that case.
      const nonStatPatterns = grp.patterns.filter(re => !grp.genericStatRollSources.includes(re.source));
      if (nonStatPatterns.some(re => re.test(t))) matched.push(grp.key);
      continue;
    }
    if (grp.patterns.some(re => re.test(t))) matched.push(grp.key);
  }
  return [...new Set(matched)];
}

function abilityOwnText(ability) {
  let bullets = [];
  try { bullets = Array.isArray(ability.bullets) ? ability.bullets : JSON.parse(ability.bullets || '[]'); } catch {}
  // Timing is included so Reaction triggers like "You declared a FIGHT
  // ability for this unit" (confirmed: Idoneth's Sweeping Blows) are caught —
  // those name the phase in the TRIGGER, not the effect.
  return [ability.timing, ability.declare, ability.effect, ...bullets].filter(Boolean).join(' ');
}

/**
 * Manual overrides for named exceptions text-detection can't (or shouldn't
 * be trusted to) reliably infer — either because the connection is pure game
 * knowledge not present in the ability's own text (Phantasmal Ruin's charge-
 * phase relevance, Surrender to the Sea's remove-from-play triggers), or
 * because it needs a phase the ability's own category wouldn't suggest
 * (Hunter of Souls' deployment-time pick). Confirmed against the actual
 * printed book, not guessed — see the 2026-07-24 Battle Buddy bug-report
 * session. Keyed by faction_slug -> table -> (section, for extra_rules) ->
 * ability name (uppercase, matching how names are stored).
 */
const MANUAL_OVERRIDES = {
  'idoneth-deepkin': {
    extra_rules: {
      heroic_traits: {
        // Declare (pick an Anti-X keyword) happens once, at deployment; the
        // chosen Anti-X bonus is then live for every combat/shooting attack
        // against that unit type for the rest of the battle.
        'HUNTER OF SOULS': ['deployment', 'combat', 'shooting'],
      },
    },
    // Unit abilities (warscrolls.abilities) — keyed by ability name only;
    // names are distinctive enough across this faction's units.
    unit_abilities: {
      // Terrain damage triggers off ANY move through it — a charge move is
      // still a move, so this is relevant in both the Movement and Charge
      // phases even though the text only literally says "move".
      'PHANTASMAL RUIN': ['movement', 'charge'],
      // "Removed from play" can happen via Banish Manifestation (hero
      // phase) or by being destroyed through combat or shooting damage —
      // none of which the ability's own text names explicitly.
      'SURRENDER TO THE SEA': ['hero phase', 'combat', 'shooting'],
    },
  },
};

function lookupOverride(table, factionSlug, name, section) {
  const faction = MANUAL_OVERRIDES[factionSlug];
  if (!faction) return null;
  if (table === 'extra_rules') return faction.extra_rules?.[section]?.[name] || null;
  if (table === 'unit_abilities') return faction.unit_abilities?.[name] || null;
  if (table === 'traits') return faction.traits?.[name] || null;
  if (table === 'formations') return faction.formations?.[name] || null;
  return null;
}

/**
 * Resolves the phase key(s) for one ambiguous-timing ability, as a single
 * comma-joined string ready to store directly in a phase_key column (or
 * embed in a unit-ability JSON object) — e.g. "combat" or "movement,charge".
 * Returns null when nothing is discovered (render as plain generic
 * Passive/Reaction/etc, the existing default — no regression for the vast
 * majority of untouched abilities).
 *
 * `nameToTiming` (Map<UPPERCASE name, timing string>) lets a reference like
 * "the 'Unpredictable Tide' ability" resolve by looking up that other
 * ability's own timing — same trick the old formation-only resolver used,
 * generalized here for every ability type.
 */
function resolvePhaseKeyString(ability, { nameToTiming = new Map(), factionSlug, table, section } = {}) {
  const override = lookupOverride(table, factionSlug, (ability.name || '').toUpperCase(), section);
  if (override) return override.join(',');

  const ownText = abilityOwnText(ability);
  const textKeys = detectPhaseKeysFromText(ownText);
  if (textKeys.length > 0) return textKeys.join(',');

  // Follow a quoted ability-name reference into a sibling ability's own
  // timing (e.g. Fade Like Mist -> "the 'Unpredictable Tide' ability").
  const refs = [...ownText.matchAll(/['‘’]([A-Z][A-Za-z' -]{2,40})['‘’]/g)].map(m => m[1].toUpperCase());
  for (const ref of refs) {
    const refTiming = nameToTiming.get(ref);
    if (!refTiming) continue;
    const direct = literalPhaseFromTiming(refTiming);
    if (direct) return direct;
    const refKeys = detectPhaseKeysFromText(refTiming);
    if (refKeys.length > 0) return refKeys.join(',');
  }

  return null;
}

module.exports = {
  PRESET_KEYS,
  isAmbiguousTiming,
  literalPhaseFromTiming,
  detectPhaseKeysFromText,
  abilityOwnText,
  resolvePhaseKeyString,
  MANUAL_OVERRIDES,
};
