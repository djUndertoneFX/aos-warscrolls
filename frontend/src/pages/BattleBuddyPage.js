import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AbilityCard } from '../components/WarscrollGW';

// Space reserved for a unit's thumbnail when it fits (image width + gap) —
// shared between the actual CSS layout and the layout-impact measurement
// below, so what gets measured matches what actually renders.
const UNIT_THUMB_RESERVED_PX = 76;

// Unit Abilities cards embed the unit's thumbnail on the right IF doing so
// doesn't push the card's own text past 1 extra wrapped line versus its
// current (full-width, no-thumbnail) layout — measured directly via
// scrollHeight rather than guessed from character counts, so it accounts for
// the card's real font/line-height/existing bullets. Runs once per card via
// a synchronous layout-effect measure/revert (no visible flicker: the
// thumbnail starts absent and only appears once we know it fits).
function UnitAbilityCard({ ab, hasImage }) {
  const cardWrapRef = useRef(null);
  const [fits, setFits] = useState(false);
  const measuredRef = useRef(false);

  useLayoutEffect(() => {
    if (!hasImage || measuredRef.current) return;
    measuredRef.current = true;
    const el = cardWrapRef.current?.querySelector('.gw-ability-card');
    if (!el) return;
    const naturalHeight = el.scrollHeight;
    const prevWidth = el.style.width;
    el.style.width = `calc(100% - ${UNIT_THUMB_RESERVED_PX}px)`;
    const shrunkHeight = el.scrollHeight;
    el.style.width = prevWidth;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18;
    setFits(Math.round((shrunkHeight - naturalHeight) / lineHeight) <= 1);
  }, [hasImage]);

  const showThumb = hasImage && fits;

  return (
    <div className="bb-fight-ability">
      <div className="bb-fight-ability-unit">{ab._unitName}</div>
      <div className="bb-fight-ability-row" ref={cardWrapRef}>
        {/* ab.bullets is already a real array (it came from the OUTER
            JSON.parse of warscrolls.abilities, unlike faction-ability cards
            whose bullets are a raw unparsed JSON string) */}
        <AbilityCard ab={ab} keywords={[]} />
        {showThumb && (
          <div className="bb-unit-thumb">
            <img src={`/api/unit-image/${ab._unitId}`} alt={ab._unitName} className="bb-unit-thumb-img" />
            <img src={`/api/unit-image/${ab._unitId}`} alt="" aria-hidden="true" className="bb-unit-thumb-zoom-img" />
          </div>
        )}
      </div>
    </div>
  );
}

function parseJsonArray(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// ── AoS 4e battle-round phase ribbon. "match" reuses the same substring
// convention WarscrollGW's PHASE_PRESETS already uses against an ability's
// `timing` text — not exported from there, so duplicated here rather than
// reaching into that module's internals. The phase buttons are FILTERS, not
// sorts: a phase's list is exactly the abilities coded to that phase, full
// stop — Passive/Reaction/Once-Per-Turn|Battle|Battle-Round abilities are
// pulled into their own "always available" bucket instead (see
// splitAbilitiesForPhase), shown under a divider on every phase rather than
// mixed into the phase-specific list. ───────────────────────────────────────
const BATTLE_PHASES = [
  { key: 'deployment', label: 'Deployment',      match: ['deployment'] },
  { key: 'hero',       label: 'Hero Phase',       match: ['hero phase'] },
  { key: 'movement',   label: 'Movement Phase',   match: ['movement', 'move phase'] },
  { key: 'shooting',   label: 'Shooting Phase',   match: ['shooting'] },
  { key: 'charge',     label: 'Charge Phase',     match: ['charge'] },
  { key: 'combat',     label: 'Combat Phase',     match: ['combat'] },
  { key: 'end_of_turn',label: 'End of Turn',      match: ['end of turn', 'end of any turn', 'end of battle'] },
];
const ALWAYS_MATCH = ['passive', 'reaction', 'any phase', 'once per turn', 'once per battle', 'once per battle round', 'start of battle round'];

// Site-wide global phase colors, copied from WarscrollGW's PHASE_PRESETS
// (not exported there) — used to color the ribbon buttons themselves.
const PHASE_COLORS = {
  deployment:   { hdrBg: '#280858', hdrTxt: '#c8b8f8', border: '#6040c0' },
  hero:         { hdrBg: '#7a6010', hdrTxt: '#ffffff', border: '#c8a020' },
  movement:     { hdrBg: '#0e4020', hdrTxt: '#a0f0b8', border: '#208848' },
  shooting:     { hdrBg: '#0c2a60', hdrTxt: '#b8d8ff', border: '#2060c8' },
  charge:       { hdrBg: '#6a2c00', hdrTxt: '#ffd898', border: '#c86010' },
  combat:       { hdrBg: '#6a0808', hdrTxt: '#ffd8d8', border: '#c02020' },
  end_of_turn:  { hdrBg: '#202020', hdrTxt: '#c0c0c0', border: '#505050' },
};

// Deliberately `ab.timing` only, NOT `ab.phase_key` — phase_key (present on
// Battle Formations) is a pre-computed *thematic* color hint for badge
// tinting elsewhere in the app, not a statement of which phase the ability
// can actually be used in. Using it here misclassified Passive formation
// abilities (like Akhelian Beastmasters' Ferocious Predators, phase_key
// "combat" for flavor even though its rules text is Passive) as
// combat-phase-specific instead of always-available.
function abilityPhaseKey(ab) {
  const t = (ab.timing || '').toLowerCase();
  if (!t) return null;
  const phase = BATTLE_PHASES.find(p => p.match.some(k => t.includes(k)));
  return phase ? phase.key : null;
}
function abilityIsAlwaysAvailable(ab) {
  const t = (ab.timing || '').toLowerCase();
  return !!t && ALWAYS_MATCH.some(k => t.includes(k));
}

// ab.phase_key (backend/phaseKey.js) is a comma-joined list of PHASE_PRESETS-
// style strings — e.g. "combat" or "movement,charge" or "hero phase,combat,
// shooting" — populated for any ambiguous-timing (Passive/Reaction/bare
// Once-Per-X) ability whose effect text still ties it to one or more actual
// phases (confirmed examples: Idoneth's Armour of the Cythai modifies combat
// rolls despite Passive timing; Hunter of Souls is picked at deployment but
// its anti-X bonus applies in combat AND shooting). Translated here into
// this file's own short BATTLE_PHASES keys for bucketing purposes; the raw
// string is left untouched on the ability object so AbilityCard's own
// getPhaseStyle(ab) can build the matching split banner independently.
function discoveredPhaseKeys(ab) {
  if (!ab.phase_key) return [];
  return ab.phase_key.split(',').map(k => k.trim().toLowerCase())
    .map(k => BATTLE_PHASES.find(p => p.match.some(m => k.includes(m)))?.key)
    .filter(Boolean);
}

// Splits a flat ability list into "exactly this phase" vs "always available"
// for a given ribbon selection — the two buckets a FightPane section renders.
// Mutually exclusive: an ability like "Once Per Turn (Army), Any Combat
// Phase" carries both a specific-phase word (combat) and an always-available
// one (once per turn) — treated as combat-phase-specific, not duplicated
// into the always-available bucket too, since it does have one real phase.
//
// An ambiguous-timing ability with discovered phase key(s) (see
// discoveredPhaseKeys — e.g. Ferocious Predators' text ties it to the combat
// phase even though its own timing is bare "Passive"; Hunter of Souls covers
// BOTH deployment and combat/shooting) shows up under EVERY one of its
// discovered phases, not just one — same split banner colouring regardless
// of which phase view it's currently showing under (AbilityCard reads the
// full multi-key ab.phase_key itself, unaffected by which bucket this put it in).
function splitAbilitiesForPhase(abilities, phaseKey) {
  const withKeys = abilities.map(ab => {
    const literal = abilityPhaseKey(ab);
    if (literal) return { ab, keys: [literal] };
    if (!abilityIsAlwaysAvailable(ab)) return { ab, keys: [], drop: true };
    const discovered = discoveredPhaseKeys(ab);
    return { ab, keys: discovered };
  });
  const inPhase = withKeys.filter(x => x.keys.includes(phaseKey)).map(x => x.ab);
  const always = withKeys.filter(x => x.keys.length === 0 && !x.drop).map(x => x.ab);
  return { inPhase, always };
}

// ── Static reference: the four Core Rules Command Abilities every army can
// use, regardless of faction. Unlike everything else in this app these
// aren't scraped from anywhere — no command-abilities table/scrape exists
// yet (checked backend/db.js and scrapeRules.js) — so this section is a
// placeholder rather than guessed-at rules text, since getting this wrong
// would actively mislead someone using it mid-game. ─────────────────────────
const COMMAND_ABILITIES_AVAILABLE = false;

const SOURCES = [
  { key: 'warscrolls',     label: 'Warscrolls' },
  { key: 'army_list',      label: 'Built Army List' },
  { key: 'spearhead',      label: 'Spearhead' },
  { key: 'path_to_glory',  label: 'Path to Glory' },
];

function makeBlankSide() {
  return {
    source: 'warscrolls',
    loading: false,
    error: null,
    units: [],
    factionSlug: null,
    factionName: null,
    battleFormation: null,
    factionRules: null,   // full /api/faction-rules/:slug response
    // Explicit selections, when the source actually has them (army_list /
    // path_to_glory) — null fields mean "no selection data, show everything
    // for the faction" rather than "nothing selected".
    selection: null,      // { heroic_traits: [names], artefacts: [names], spell_lore: [names], prayer_lore: [names], manifestation_lore: [names] } | null
  };
}

// ── Faction rules fetch/cache — shared across both panes so picking the
// same faction on both sides (mirror matches, proxy games) doesn't double-
// fetch. ─────────────────────────────────────────────────────────────────
function useFactionRules() {
  const cache = useRef({});
  const [, force] = useState(0);
  const fetchFor = useCallback(async (slug) => {
    if (!slug || cache.current[slug]) return cache.current[slug] ?? null;
    cache.current[slug] = null; // placeholder to dedupe concurrent calls
    try {
      const { data } = await axios.get(`/api/faction-rules/${slug}`);
      cache.current[slug] = data;
      force(n => n + 1);
      return data;
    } catch {
      return null;
    }
  }, []);
  return { get: slug => cache.current[slug] ?? null, fetchFor };
}

// ── Warscrolls source: whatever's currently flagged Friendly/Enemy on the
// Warscrolls page (server-backed via user_units, not localStorage), further
// narrowed by that page's Friendly/Enemy Faction dropdowns (which ARE only
// in localStorage, under 'aos-filters' — see WarscrollsPage.js's FILTER_KEY).
// Mirrors WarscrollsPage's own combined-filter behavior exactly: either
// dropdown alone restricts BOTH sides' flagged units, not just its own side
// (see feedback_backend_faction_filter_combined memory) — so without this,
// Battle Buddy would show flagged units the Warscrolls table itself has
// already filtered out.
function activeFactionSlugsFromWarscrollsFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem('aos-filters')) || {};
    return [saved.faction, saved.enemyFaction].filter(Boolean);
  } catch { return []; }
}

function WarscrollsSource({ side, state, setState, factionRules }) {
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const { data: userUnits } = await axios.get('/api/user-units');
        const flag = side === 'friendly' ? 'is_friendly' : 'is_enemy';
        const ids = userUnits.filter(u => u[flag]).map(u => u.warscroll_id);
        if (ids.length === 0) {
          if (!cancelled) setState(s => ({ ...s, loading: false, units: [], factionSlug: null, factionName: null }));
          return;
        }
        const { data } = await axios.get(`/api/warscrolls?ids=${ids.join(',')}&pageSize=300&sortBy=faction`);
        if (cancelled) return;
        // user_units doesn't carry faction_slug, so the faction filter can only
        // be applied here, against the /api/warscrolls response.
        const activeFactionSlugs = activeFactionSlugsFromWarscrollsFilters();
        const units = activeFactionSlugs.length > 0
          ? (data.data || []).filter(u => activeFactionSlugs.includes(u.faction_slug))
          : (data.data || []);
        const slug = units[0]?.faction_slug ?? null;
        const name = units[0]?.faction ?? null;
        setState(s => ({ ...s, loading: false, units, factionSlug: slug, factionName: name, battleFormation: null, selection: null }));
        if (slug) factionRules.fetchFor(slug);
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: 'Failed to load flagged units.' }));
      }
    })();
    return () => { cancelled = true; };
  }, [side]); // eslint-disable-line

  if (state.loading) return <div className="bb-pane-empty">Loading…</div>;
  if (state.error) return <div className="bb-pane-empty">{state.error}</div>;
  if (state.units.length === 0) {
    return (
      <div className="bb-pane-empty">
        No units flagged {side === 'friendly' ? 'Friendly' : 'Enemy'} on the <Link to="/warscrolls">Warscrolls</Link> page yet.
      </div>
    );
  }
  return <UnitList units={state.units} />;
}

// ── Built Army List source — Army Builder's List/Enemy List pulldowns save
// into the same table tagged by list_type ('own' vs 'enemy'); this side's
// pool is picked to match, same as the Warscrolls source's flag filtering. ──
function ArmyListSource({ side, state, setState, factionRules }) {
  const [lists, setLists] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const wantType = side === 'friendly' ? 'own' : 'enemy';

  useEffect(() => {
    let cancelled = false;
    axios.get('/api/army-builder-lists').then(({ data }) => {
      if (!cancelled) setLists(data.filter(l => (l.list_type || 'own') === wantType));
    }).catch(() => { if (!cancelled) setLists([]); });
    return () => { cancelled = true; };
  }, [wantType]);

  const load = async (id) => {
    setLoadingId(id);
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const { data: full } = await axios.get(`/api/army-builder-lists/${id}`);
      const blob = full.data || {};
      const unitIds = Object.keys(blob.roster || {});
      let units = [];
      if (unitIds.length > 0) {
        const { data: uData } = await axios.get(`/api/warscrolls?ids=${unitIds.join(',')}&pageSize=300&sortBy=faction`);
        units = uData.data || [];
      }
      const heroAssignments = blob.heroAssignments || {};
      const collectAssigned = key => [...new Set(Object.values(heroAssignments).map(h => h?.[key]).filter(Boolean))];
      const selection = {
        heroic_traits:      collectAssigned('heroic_traits'),
        artefacts:           collectAssigned('artefacts'),
        spell_lore:          collectAssigned('spell_lore'),
        prayer_lore:         collectAssigned('prayer_lore'),
        manifestation_lore:  collectAssigned('manifestation_lore'),
      };
      setState(s => ({
        ...s, loading: false,
        units,
        factionSlug: blob.faction || full.faction_slug || null,
        factionName: full.faction_name || null,
        battleFormation: blob.battleFormation || null,
        selection,
      }));
      if (blob.faction) factionRules.fetchFor(blob.faction);
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Failed to load that list.' }));
    } finally {
      setLoadingId(null);
    }
  };

  if (lists === null) return <div className="bb-pane-empty">Loading…</div>;
  if (lists.length === 0) {
    return (
      <div className="bb-pane-empty">
        No saved {wantType === 'enemy' ? 'Enemy Lists' : 'lists'} yet — build one on the <Link to="/army-builder">Army Builder</Link> page first
        {wantType === 'enemy' ? ' (the Enemy List pulldown)' : ''}.
      </div>
    );
  }
  return (
    <div className="bb-source-list">
      {lists.map(l => (
        <div key={l.id} className="bb-source-list-row">
          <span className="bb-source-list-name">{l.name}</span>
          <span className="bb-source-list-faction">{l.faction_name || '—'}</span>
          <button type="button" className="bb-load-btn" disabled={loadingId === l.id} onClick={() => load(l.id)}>
            {loadingId === l.id ? 'Loading…' : (state.units.length > 0 && state.loadedListId === l.id ? 'Loaded' : 'Load')}
          </button>
        </div>
      ))}
      {state.units.length > 0 && <UnitList units={state.units} />}
    </div>
  );
}

// ── Spearhead source ────────────────────────────────────────────────────────
function SpearheadSource({ side, state, setState, factionRules }) {
  const [spearheads, setSpearheads] = useState(null);
  const [allUnits, setAllUnits] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: rules }, { data: unitsRes }] = await Promise.all([
          axios.get('/api/spearheads'),
          axios.get('/api/warscrolls?spearheadOnly=1&sortBy=faction&sortDir=asc&pageSize=9999&page=1'),
        ]);
        if (cancelled) return;
        setSpearheads(rules);
        setAllUnits(unitsRes.data || []);
        // Prefill from whatever the Spearhead page itself has saved, if
        // anything — the only place this pairing is remembered at all
        // (no server-side concept of a "current spearhead" exists).
        try {
          const raw = JSON.parse(localStorage.getItem('aos-sp-filters'));
          const already = side === 'friendly' ? raw?.yourSpearhead : raw?.opponentSpearhead;
          if (already && rules.some(r => r.name === already)) pick(already, rules, unitsRes.data || []);
        } catch {}
      } catch {
        if (!cancelled) { setSpearheads([]); setAllUnits([]); }
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const pick = (name, rulesList, unitsList) => {
    const rules = (rulesList ?? spearheads).find(r => r.name === name);
    const units = (unitsList ?? allUnits).filter(u => (u.spearhead || '').split('|').includes(name));
    setState(s => ({
      ...s,
      units,
      factionSlug: rules?.faction_slug ?? null,
      factionName: units[0]?.faction ?? null,
      battleFormation: null,
      selection: null,
      spearheadName: name,
    }));
    if (rules?.faction_slug) factionRules.fetchFor(rules.faction_slug);
  };

  if (spearheads === null) return <div className="bb-pane-empty">Loading…</div>;
  return (
    <div className="bb-source-list">
      <select
        className="bb-spearhead-select"
        value={state.spearheadName || ''}
        onChange={e => e.target.value && pick(e.target.value)}
      >
        <option value="">— Choose a Spearhead —</option>
        {spearheads.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
      {state.units.length > 0 && <UnitList units={state.units} />}
    </div>
  );
}

// ── Path to Glory source ────────────────────────────────────────────────────
function PathToGlorySource({ side, state, setState, factionRules }) {
  const [rosters, setRosters] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const autoLoadedRef = useRef(false);

  const load = useCallback(async (id) => {
    setLoadingId(id);
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const { data: full } = await axios.get(`/api/ptg-rosters/${id}`);
      const blob = full.data || {};
      const regimentUnitIds = (blob.regiments || []).flatMap(r => r.units || []);
      const auxIds = (blob.auxUnits || []).map(u => u.warscrollId || u.id).filter(Boolean);
      const unitIds = [...new Set([...regimentUnitIds, ...auxIds])];
      let units = [];
      if (unitIds.length > 0) {
        const { data: uData } = await axios.get(`/api/warscrolls?ids=${unitIds.join(',')}&pageSize=300&sortBy=faction`);
        units = uData.data || [];
      }
      const selection = {
        heroic_traits: [],
        // warlordEnhancements/warlordPathAbility are free-text fields on the
        // printed roster (not structured picks from the faction-rules DB —
        // there's no real "Path Ability" table to match against), so they
        // can't be name-matched into rules.artefacts like the lores below.
        // Surfaced separately as plain text under their own sub-heading.
        artefacts: (blob.warlordEnhancements || '').split(',').map(s => s.trim()).filter(Boolean),
        pathAbilityText: blob.warlordPathAbility || '',
        spell_lore: (blob.spellLore || []).filter(Boolean),
        prayer_lore: (blob.prayerLore || []).filter(Boolean),
        manifestation_lore: (blob.manifestationLore || []).filter(Boolean),
      };
      setState(s => ({
        ...s, loading: false,
        units,
        factionSlug: blob.faction || full.faction_slug || null,
        factionName: full.faction_name || null,
        battleFormation: blob.battleFormation || null,
        selection,
        loadedRosterId: id,
      }));
      if (blob.faction) factionRules.fetchFor(blob.faction);
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Failed to load that roster.' }));
    } finally {
      setLoadingId(null);
    }
  }, [setState, factionRules]);

  useEffect(() => {
    let cancelled = false;
    axios.get('/api/ptg-rosters').then(({ data }) => { if (!cancelled) setRosters(data); }).catch(() => { if (!cancelled) setRosters([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (rosters && rosters.length === 1 && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      load(rosters[0].id);
    }
  }, [rosters, load]);

  if (rosters === null) return <div className="bb-pane-empty">Loading…</div>;
  if (rosters.length === 0) {
    return <div className="bb-pane-empty">No Path to Glory rosters yet — create one on the <Link to="/path-to-glory">Path to Glory</Link> page first.</div>;
  }
  return (
    <div className="bb-source-list">
      {rosters.length > 1 && rosters.map(r => (
        <div key={r.id} className="bb-source-list-row">
          <span className="bb-source-list-name">{r.name}</span>
          <span className="bb-source-list-faction">{r.faction_name || '—'}</span>
          <button type="button" className="bb-load-btn" disabled={loadingId === r.id} onClick={() => load(r.id)}>
            {loadingId === r.id ? 'Loading…' : (state.loadedRosterId === r.id ? 'Loaded' : 'Load')}
          </button>
        </div>
      ))}
      {state.units.length > 0 && <UnitList units={state.units} />}
    </div>
  );
}

function UnitList({ units }) {
  return (
    <div className="bb-unit-list">
      {units.map(u => (
        <div key={u.id} className="bb-unit-row">
          <span className="bb-unit-row-name">{u.name}</span>
          <span className="bb-unit-row-pts">{u.points}pts</span>
        </div>
      ))}
    </div>
  );
}

function SourcePane({ side, state, setState, factionRules }) {
  return (
    <div className="bb-pane">
      <div className="bb-pane-title">{side === 'friendly' ? 'Friendly' : 'Enemy'}</div>
      <div className="bb-source-row">
        {SOURCES.map(s => (
          <button
            key={s.key}
            className={`bb-source-btn${state.source === s.key ? ' active' : ''}`}
            onClick={() => setState(prev => ({ ...makeBlankSide(), source: s.key }))}
          >{s.label}</button>
        ))}
      </div>
      {state.source === 'warscrolls'    && <WarscrollsSource    side={side} state={state} setState={setState} factionRules={factionRules} />}
      {state.source === 'army_list'     && <ArmyListSource      side={side} state={state} setState={setState} factionRules={factionRules} />}
      {state.source === 'spearhead'     && <SpearheadSource     side={side} state={state} setState={setState} factionRules={factionRules} />}
      {state.source === 'path_to_glory' && <PathToGlorySource   side={side} state={state} setState={setState} factionRules={factionRules} />}
    </div>
  );
}

// ── Fight! stage ─────────────────────────────────────────────────────────────
// Faction Abilities used to be one flat merged list — now kept as separate
// per-category sections (matching the book's own section names) so each can
// get its own sub-heading and collapse triangle instead of one undifferentiated
// wall of cards.
const FACTION_SECTIONS = [
  { key: 'traits',             label: 'Battle Traits' },
  { key: 'formations',         label: 'Battle Formations' },
  { key: 'heroic_traits',      label: 'Heroic Traits' },
  { key: 'artefacts',          label: 'Artefacts of Power' },
  { key: 'spell_lore',         label: 'Spell Lore' },
  { key: 'prayer_lore',        label: 'Prayer Lore' },
  { key: 'manifestation_lore', label: 'Manifestations' },
];

function collectFactionSections(state, factionRulesFor) {
  const rules = factionRulesFor(state.factionSlug);
  if (!rules) return [];
  const sel = state.selection;
  const pick = (arr, names) => (names === undefined || names === null ? arr : arr.filter(a => names.includes(a.name)));
  return FACTION_SECTIONS.map(s => {
    let abilities;
    if (s.key === 'formations') {
      abilities = state.battleFormation ? rules.formations.filter(f => f.formation_name === state.battleFormation) : rules.formations;
    } else if (s.key === 'traits') {
      abilities = rules.traits; // Battle Traits aren't narrowed by a selection, unlike Heroic Traits/Artefacts/Lores
    } else {
      abilities = pick(rules[s.key], sel?.[s.key]);
    }
    return { ...s, abilities: abilities || [] };
  });
}

// Some Battle Traits are grouped under a shared column-header label instead of
// standing alone (confirmed: Idoneth Deepkin's "Tides of the Sea"/"Tides of
// the Storm") — the book prints these as two (or more) light-blue/gold-banner
// columns in a fixed order, not a flat list. Mirrors WarscrollGW.js's
// TraitGroupColumn/FactionTraitsSlide grouping so it reads the same here.
function groupTraits(abilities) {
  const ungrouped = abilities.filter(t => !t.group_name);
  const groups = [];
  const nameToGroup = {};
  for (const t of abilities) {
    if (!t.group_name) continue;
    if (!nameToGroup[t.group_name]) {
      nameToGroup[t.group_name] = { name: t.group_name, items: [] };
      groups.push(nameToGroup[t.group_name]);
    }
    nameToGroup[t.group_name].items.push(t);
  }
  return { groups, ungrouped };
}

// Shared collapse-triangle wrapper for every "section with a separator" in the
// Fight view — Unit/Faction/Command Point Abilities, and each Faction
// Abilities sub-heading. Local (uncontrolled) open/closed state per instance,
// so friendly/enemy panes (and each sub-section) collapse independently.
function CollapsibleSection({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bb-collapsible">
      <button type="button" className="bb-collapsible-header" onClick={() => setOpen(o => !o)}>
        <span className={`bb-collapse-triangle${open ? ' open' : ''}`}>▶</span>
        <span className="bb-collapsible-title">{title}</span>
        {count != null && <span className="bb-collapsible-count">{count}</span>}
      </button>
      {open && <div className="bb-collapsible-body">{children}</div>}
    </div>
  );
}

// Renders one of the ability sections: the phase-specific list, then
// (if any) a divider and the "Passive / Any Phase" list that's the same
// regardless of which ribbon phase is selected.
function AbilitySection({ title, inPhase, always, renderCard, defaultOpen = true }) {
  const hasAny = inPhase.length > 0 || always.length > 0;
  if (!hasAny) {
    return (
      <div className="bb-fight-section">
        <div className="bb-fight-section-title">{title}</div>
        <div className="bb-pane-empty">Nothing for this phase.</div>
      </div>
    );
  }
  return (
    <CollapsibleSection title={title} count={inPhase.length + always.length} defaultOpen={defaultOpen}>
      {inPhase.length > 0 && (
        <div className="gw-abilities-grid bb-fight-grid">{inPhase.map(renderCard)}</div>
      )}
      {inPhase.length > 0 && always.length > 0 && <div className="gw-formation-divider" />}
      {always.length > 0 && (
        <>
          <div className="bb-fight-section-subtitle">Passive / Any Phase</div>
          <div className="gw-abilities-grid bb-fight-grid">{always.map(renderCard)}</div>
        </>
      )}
    </CollapsibleSection>
  );
}

// Battle Traits get grouped-column rendering (book order + banner headers)
// instead of a flat card grid — same idea as AbilitySection but splitting
// each of inPhase/always by group_name first.
function BattleTraitsSection({ inPhase, always, renderCard }) {
  const hasAny = inPhase.length > 0 || always.length > 0;
  if (!hasAny) {
    return (
      <div className="bb-fight-section">
        <div className="bb-fight-section-title">Battle Traits</div>
        <div className="bb-pane-empty">Nothing for this phase.</div>
      </div>
    );
  }
  const renderBucket = (list) => {
    const { groups, ungrouped } = groupTraits(list);
    return (
      <>
        {groups.length > 0 && (
          <div className="gw-trait-groups" style={{ gridTemplateColumns: `repeat(${groups.length}, 1fr)` }}>
            {groups.map((group, gi) => (
              <div className="gw-trait-group" data-col={gi % 2 === 0 ? 'a' : 'b'} key={gi}>
                <div className="gw-trait-group-header">{group.name}</div>
                <div className="gw-abilities-grid">{group.items.map(renderCard)}</div>
              </div>
            ))}
          </div>
        )}
        {groups.length > 0 && ungrouped.length > 0 && <div className="gw-formation-divider" />}
        {ungrouped.length > 0 && (
          <div className="gw-abilities-grid bb-fight-grid">{ungrouped.map(renderCard)}</div>
        )}
      </>
    );
  };
  return (
    <CollapsibleSection title="Battle Traits" count={inPhase.length + always.length}>
      {inPhase.length > 0 && renderBucket(inPhase)}
      {inPhase.length > 0 && always.length > 0 && <div className="gw-formation-divider" />}
      {always.length > 0 && (
        <>
          <div className="bb-fight-section-subtitle">Passive / Any Phase</div>
          {renderBucket(always)}
        </>
      )}
    </CollapsibleSection>
  );
}

// Groups Battle Formation abilities by formation_name so the card's actual
// source is visible (e.g. "Outflank the Enemy" belongs to the "Deep-sea
// Stalkers" formation) — previously rendered as one undifferentiated flat
// list with no indication of which named formation granted each ability.
function groupFormations(abilities) {
  const groups = [];
  const nameToGroup = {};
  for (const item of abilities) {
    const gName = item.formation_name || 'General';
    if (!nameToGroup[gName]) {
      nameToGroup[gName] = { name: gName, sourceNote: item.source_note || null, items: [] };
      groups.push(nameToGroup[gName]);
    }
    nameToGroup[gName].items.push(item);
  }
  return groups;
}

function BattleFormationsSection({ inPhase, always, renderCard }) {
  const hasAny = inPhase.length > 0 || always.length > 0;
  if (!hasAny) {
    return (
      <div className="bb-fight-section">
        <div className="bb-fight-section-title">Battle Formations</div>
        <div className="bb-pane-empty">Nothing for this phase.</div>
      </div>
    );
  }
  const renderBucket = (list) => (
    <div className="bb-formation-groups">
      {groupFormations(list).map((group, gi) => (
        <div className="bb-formation-group" key={gi}>
          {group.name !== 'General' && (
            <div className="gw-formation-group-header">
              {group.name}
              {group.sourceNote && <span className="gw-formation-source-note"> ({group.sourceNote})</span>}
            </div>
          )}
          <div className="gw-abilities-grid bb-fight-grid">{group.items.map(renderCard)}</div>
        </div>
      ))}
    </div>
  );
  return (
    <CollapsibleSection title="Battle Formations" count={inPhase.length + always.length}>
      {inPhase.length > 0 && renderBucket(inPhase)}
      {inPhase.length > 0 && always.length > 0 && <div className="gw-formation-divider" />}
      {always.length > 0 && (
        <>
          <div className="bb-fight-section-subtitle">Passive / Any Phase</div>
          {renderBucket(always)}
        </>
      )}
    </CollapsibleSection>
  );
}

function FactionAbilitiesGroup({ state, factionRulesFor, phaseKey, renderCard }) {
  const sections = collectFactionSections(state, factionRulesFor);
  const pathText = (state.selection?.pathAbilityText || '').trim();
  const hasAnySection = sections.some(s => s.abilities.length > 0) || pathText;
  if (!hasAnySection) return <div className="bb-pane-empty">Nothing for this phase.</div>;

  return (
    <>
      {sections.map(s => {
        const split = splitAbilitiesForPhase(s.abilities, phaseKey);
        if (s.key === 'traits') {
          return <BattleTraitsSection key={s.key} inPhase={split.inPhase} always={split.always} renderCard={renderCard} />;
        }
        if (s.key === 'formations') {
          return <BattleFormationsSection key={s.key} inPhase={split.inPhase} always={split.always} renderCard={renderCard} />;
        }
        return (
          <AbilitySection key={s.key} title={s.label} inPhase={split.inPhase} always={split.always} renderCard={renderCard} />
        );
      })}
      {pathText && (
        <CollapsibleSection title="Path Abilities">
          <div className="bb-path-ability-text">{pathText}</div>
        </CollapsibleSection>
      )}
    </>
  );
}

// Splits a side's selected units into normal army units vs. Regiment of
// Renown units (is_regiment_of_renown, see scraper.js's
// recomputeRegimentOfRenown — inferred from being shared across 3+
// factions, since Wahapedia has no explicit flag for this), each with
// Faction Terrain sorted last within its own group. RoR units get their own
// "Regiment of Renown" sub-heading rather than mixing anonymously into the
// normal Unit Abilities list.
function splitUnitsByRoR(units) {
  const sortTerrainLast = list => [...list].sort((a, b) => (a.is_terrain ? 1 : 0) - (b.is_terrain ? 1 : 0));
  return {
    normal: sortTerrainLast(units.filter(u => !u.is_regiment_of_renown)),
    ror: sortTerrainLast(units.filter(u => u.is_regiment_of_renown)),
  };
}

function unitsToAbilities(units) {
  return units.flatMap(u => parseJsonArray(u.abilities).map(ab => ({ ...ab, _unitName: u.name, _unitId: u.id })));
}

function FightPane({ side, state, factionRulesFor, phaseKey }) {
  const { normal: normalUnits, ror: rorUnits } = splitUnitsByRoR(state.units);
  const unitSplit = splitAbilitiesForPhase(unitsToAbilities(normalUnits), phaseKey);
  const rorSplit = splitAbilitiesForPhase(unitsToAbilities(rorUnits), phaseKey);

  // Which of this side's units actually have a resolvable thumbnail —
  // fetched once as a batch (existing /api/unit-images-exist, same one the
  // ImageLightbox uses to skip imageless units) rather than probing each
  // card's own <img> individually.
  const allUnitIds = [...normalUnits, ...rorUnits].map(u => u.id).filter(Boolean);
  const [imageIds, setImageIds] = useState(new Set());
  useEffect(() => {
    if (allUnitIds.length === 0) { setImageIds(new Set()); return; }
    let cancelled = false;
    axios.post('/api/unit-images-exist', { ids: allUnitIds })
      .then(({ data }) => { if (!cancelled) setImageIds(new Set(data.ids || [])); })
      .catch(() => { if (!cancelled) setImageIds(new Set()); });
    return () => { cancelled = true; };
  }, [allUnitIds.join(',')]); // eslint-disable-line

  const renderUnitCard = (ab, i) => <UnitAbilityCard key={i} ab={ab} hasImage={imageIds.has(ab._unitId)} />;
  const renderFactionCard = (ab, i) => (
    <AbilityCard key={i} ab={{ ...ab, bullets: parseJsonArray(ab.bullets) }} keywords={[]} />
  );

  return (
    <div className="bb-fight-pane">
      <div className="bb-fight-pane-title">{side === 'friendly' ? 'Friendly' : 'Enemy'}</div>

      <AbilitySection title="Unit Abilities" inPhase={unitSplit.inPhase} always={unitSplit.always} renderCard={renderUnitCard} />
      {rorUnits.length > 0 && (
        <>
          <div className="gw-formation-divider" />
          <AbilitySection title="Regiment of Renown" inPhase={rorSplit.inPhase} always={rorSplit.always} renderCard={renderUnitCard} />
        </>
      )}
      <div className="gw-formation-divider" />
      <CollapsibleSection title="Faction Abilities">
        <FactionAbilitiesGroup state={state} factionRulesFor={factionRulesFor} phaseKey={phaseKey} renderCard={renderFactionCard} />
      </CollapsibleSection>
      <div className="gw-formation-divider" />

      <CollapsibleSection title="Command Point Abilities">
        {!COMMAND_ABILITIES_AVAILABLE && (
          <div className="bb-pane-empty">Not tracked yet — the Core Rules Command Abilities aren't in the database, so this section is a placeholder for now.</div>
        )}
      </CollapsibleSection>
    </div>
  );
}

// Shared between the "Vertical" layout's top bar and the "Toggle" layout's
// full-panel phase picker — every phase button is always fully filled with
// that phase's own site-wide global color + white text (outline-only inactive
// buttons read too low-contrast); the active phase is marked with a brighter
// border + lift instead of a color/fill change.
function PhaseRibbon({ phaseKey, setPhaseKey, onPick, horizontal }) {
  return (
    <div className={`bb-phase-ribbon${horizontal ? ' bb-phase-ribbon-horizontal' : ''}`}>
      {BATTLE_PHASES.map(p => {
        const c = PHASE_COLORS[p.key];
        const active = phaseKey === p.key;
        return (
          <button
            key={p.key}
            className={`bb-phase-btn${active ? ' active' : ''}`}
            style={{ background: c.hdrBg, color: '#ffffff', borderColor: active ? '#ffffff' : c.border }}
            onClick={() => { setPhaseKey(p.key); onPick && onPick(); }}
          >{p.label}</button>
        );
      })}
    </div>
  );
}

function FightStage({ friendly, enemy, factionRulesFor, phaseKey, setPhaseKey }) {
  const [viewMode, setViewMode] = useState('single');
  const [singleSide, setSingleSide] = useState('friendly');
  // Toggle = one panel (phase picker OR abilities) full-screen at a time,
  // swapped via a button. Vertical = phases in a bar up top, then a divider,
  // then abilities below — both visible together.
  const [layoutMode, setLayoutMode] = useState('vertical');
  const [togglePanel, setTogglePanel] = useState('phases');

  const abilityContent = viewMode === 'dual' ? (
    <div className="bb-fight-dual">
      <FightPane side="friendly" state={friendly} factionRulesFor={factionRulesFor} phaseKey={phaseKey} />
      <FightPane side="enemy" state={enemy} factionRulesFor={factionRulesFor} phaseKey={phaseKey} />
    </div>
  ) : (
    <div className="bb-fight-single">
      <FightPane side={singleSide} state={singleSide === 'friendly' ? friendly : enemy} factionRulesFor={factionRulesFor} phaseKey={phaseKey} />
    </div>
  );

  return (
    <div className="bb-fight-wrap">
      <div className="bb-fight-controls">
        <div className="bb-fight-view-toggle">
          <button className={viewMode === 'single' ? 'active' : ''} onClick={() => setViewMode('single')}>Single View</button>
          <button className={viewMode === 'dual' ? 'active' : ''} onClick={() => setViewMode('dual')}>Dual View</button>
          {viewMode === 'single' && (
            <span className="bb-fight-single-side-toggle">
              <button className={singleSide === 'friendly' ? 'active' : ''} onClick={() => setSingleSide('friendly')}>Friendly</button>
              <button className={singleSide === 'enemy' ? 'active' : ''} onClick={() => setSingleSide('enemy')}>Enemy</button>
            </span>
          )}
        </div>
        <div className="bb-fight-layout-toggle">
          <button className={layoutMode === 'toggle' ? 'active' : ''} onClick={() => setLayoutMode('toggle')}>Toggle</button>
          <button className={layoutMode === 'vertical' ? 'active' : ''} onClick={() => setLayoutMode('vertical')}>Vertical</button>
        </div>
      </div>

      {layoutMode === 'vertical' ? (
        <div className="bb-fight-vertical">
          <PhaseRibbon phaseKey={phaseKey} setPhaseKey={setPhaseKey} horizontal />
          <div className="bb-fight-hr" />
          <div className="bb-fight-main">{abilityContent}</div>
        </div>
      ) : (
        <div className="bb-fight-toggle">
          <button className="bb-swap-btn" onClick={() => setTogglePanel(p => p === 'phases' ? 'warscroll' : 'phases')}>
            ⇄ Swap to {togglePanel === 'phases' ? 'Warscrolls' : 'Phases'}
          </button>
          {togglePanel === 'phases' ? (
            <div className="bb-phase-picker-big">
              <PhaseRibbon phaseKey={phaseKey} setPhaseKey={setPhaseKey} onPick={() => setTogglePanel('warscroll')} />
            </div>
          ) : (
            <div className="bb-fight-main">{abilityContent}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BattleBuddyPage() {
  const [stage, setStage] = useState('select');
  const [friendly, setFriendly] = useState(makeBlankSide());
  const [enemy, setEnemy] = useState(makeBlankSide());
  const factionRules = useFactionRules();

  // Fight stage's phase selection lives up here (not inside FightStage) so it
  // survives toggling back to Step 1 and returning to Step 2 — only reset to
  // Hero Phase when the actual matchup (which units are on the table for
  // either side) changes, not on every stage switch.
  const [phaseKey, setPhaseKey] = useState('hero');
  const matchupSig = `${friendly.units.map(u => u.id).sort((a, b) => a - b).join(',')}||${enemy.units.map(u => u.id).sort((a, b) => a - b).join(',')}`;
  const matchupSigRef = useRef(null);
  useEffect(() => {
    if (matchupSigRef.current !== null && matchupSigRef.current !== matchupSig) {
      setPhaseKey('hero');
    }
    matchupSigRef.current = matchupSig;
  }, [matchupSig]);

  return (
    <div className="table-page bb-page">
      <div className="page-header bb-header">
        <div className="page-title">
          Battle Buddy
          <span>Age of Sigmar 4th Edition</span>
        </div>
        <div className="bb-steps">
          <span className="bb-steps-label">Steps:</span>
          <button className={`bb-step-btn${stage === 'select' ? ' active' : ''}`} onClick={() => setStage('select')}><strong>1:</strong> Select Units</button>
          <button className={`bb-step-btn${stage === 'fight' ? ' active' : ''}`} onClick={() => setStage('fight')}><strong>2:</strong> Fight!</button>
        </div>
      </div>

      {stage === 'select' ? (
        <div className="bb-dual-view">
          <SourcePane side="friendly" state={friendly} setState={setFriendly} factionRules={factionRules} />
          <SourcePane side="enemy" state={enemy} setState={setEnemy} factionRules={factionRules} />
        </div>
      ) : (
        <FightStage friendly={friendly} enemy={enemy} factionRulesFor={factionRules.get} phaseKey={phaseKey} setPhaseKey={setPhaseKey} />
      )}
    </div>
  );
}
