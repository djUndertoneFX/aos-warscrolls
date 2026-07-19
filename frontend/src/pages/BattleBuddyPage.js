import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AbilityCard } from '../components/WarscrollGW';

function parseJsonArray(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// ── AoS 4e battle-round phase ribbon. "match" reuses the same substring
// convention WarscrollGW's PHASE_PRESETS already uses against an ability's
// `timing` text — not exported from there, so duplicated here rather than
// reaching into that module's internals. ALWAYS_MATCH abilities (Passive,
// Reactions, Once Per Battle/Turn/Round) apply regardless of phase and are
// folded into every phase's list rather than only their own. ────────────────
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

function abilityTimingText(ab) {
  return (ab.timing || '').toLowerCase();
}
function abilityMatchesPhase(ab, phaseKey) {
  const t = abilityTimingText(ab);
  if (!t) return false;
  if (ALWAYS_MATCH.some(k => t.includes(k))) return true;
  const phase = BATTLE_PHASES.find(p => p.key === phaseKey);
  return phase ? phase.match.some(k => t.includes(k)) : false;
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
// Warscrolls page (server-backed via user_units, not localStorage). ───────
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
        const units = data.data || [];
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

// ── Built Army List source ─────────────────────────────────────────────────
function ArmyListSource({ side, state, setState, factionRules }) {
  const [lists, setLists] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get('/api/army-builder-lists').then(({ data }) => { if (!cancelled) setLists(data); }).catch(() => { if (!cancelled) setLists([]); });
    return () => { cancelled = true; };
  }, []);

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
    return <div className="bb-pane-empty">No saved lists yet — build one on the <Link to="/army-builder">Army Builder</Link> page first.</div>;
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
        artefacts: [blob.warlordPathAbility].filter(Boolean),
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
// Aggregates every ability in play for a side into the three sections, then
// filters down to whichever phase the ribbon has selected.
function collectFactionAbilities(state, factionRulesFor) {
  const rules = factionRulesFor(state.factionSlug);
  if (!rules) return [];
  const sel = state.selection;
  const pick = (arr, names) => (names === undefined || names === null ? arr : arr.filter(a => names.includes(a.name)));
  return [
    ...pick(rules.traits, null),
    ...(state.battleFormation ? rules.formations.filter(f => f.formation_name === state.battleFormation) : rules.formations),
    ...pick(rules.heroic_traits,      sel?.heroic_traits),
    ...pick(rules.artefacts,          sel?.artefacts),
    ...pick(rules.spell_lore,         sel?.spell_lore),
    ...pick(rules.prayer_lore,        sel?.prayer_lore),
    ...pick(rules.manifestation_lore, sel?.manifestation_lore),
  ];
}

function FightPane({ side, state, factionRulesFor, phaseKey }) {
  const unitAbilities = state.units.flatMap(u =>
    parseJsonArray(u.abilities).map(ab => ({ ...ab, _unitName: u.name }))
  ).filter(ab => abilityMatchesPhase(ab, phaseKey));
  const factionAbilities = collectFactionAbilities(state, factionRulesFor).filter(ab => abilityMatchesPhase(ab, phaseKey));

  return (
    <div className="bb-fight-pane">
      <div className="bb-fight-pane-title">{side === 'friendly' ? 'Friendly' : 'Enemy'}</div>

      <div className="bb-fight-section">
        <div className="bb-fight-section-title">Unit Abilities</div>
        {unitAbilities.length === 0 ? (
          <div className="bb-pane-empty">Nothing for this phase.</div>
        ) : (
          <div className="gw-abilities-grid bb-fight-grid">
            {unitAbilities.map((ab, i) => (
              <div key={i} className="bb-fight-ability">
                <div className="bb-fight-ability-unit">{ab._unitName}</div>
                <AbilityCard ab={{ ...ab, bullets: parseJsonArray(ab.bullets) }} keywords={[]} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="gw-formation-divider" />

      <div className="bb-fight-section">
        <div className="bb-fight-section-title">Faction Abilities</div>
        {factionAbilities.length === 0 ? (
          <div className="bb-pane-empty">Nothing for this phase.</div>
        ) : (
          <div className="gw-abilities-grid bb-fight-grid">
            {factionAbilities.map((ab, i) => (
              <AbilityCard key={i} ab={{ ...ab, bullets: parseJsonArray(ab.bullets) }} keywords={[]} />
            ))}
          </div>
        )}
      </div>

      <div className="gw-formation-divider" />

      <div className="bb-fight-section">
        <div className="bb-fight-section-title">Command Point Abilities</div>
        {!COMMAND_ABILITIES_AVAILABLE && (
          <div className="bb-pane-empty">Not tracked yet — the Core Rules Command Abilities aren't in the database, so this section is a placeholder for now.</div>
        )}
      </div>
    </div>
  );
}

function FightStage({ friendly, enemy, factionRulesFor }) {
  const [phaseKey, setPhaseKey] = useState(BATTLE_PHASES[0].key);
  const [dualView, setDualView] = useState(true);
  const [singleSide, setSingleSide] = useState('friendly');

  return (
    <div className="bb-fight-layout">
      <div className="bb-phase-ribbon">
        {BATTLE_PHASES.map(p => (
          <button
            key={p.key}
            className={`bb-phase-btn${phaseKey === p.key ? ' active' : ''}`}
            onClick={() => setPhaseKey(p.key)}
          >{p.label}</button>
        ))}
      </div>
      <div className="bb-fight-main">
        <div className="bb-fight-view-toggle">
          <button className={dualView ? 'active' : ''} onClick={() => setDualView(true)}>Dual View</button>
          <button className={!dualView ? 'active' : ''} onClick={() => setDualView(false)}>Single View</button>
          {!dualView && (
            <span className="bb-fight-single-side-toggle">
              <button className={singleSide === 'friendly' ? 'active' : ''} onClick={() => setSingleSide('friendly')}>Friendly</button>
              <button className={singleSide === 'enemy' ? 'active' : ''} onClick={() => setSingleSide('enemy')}>Enemy</button>
            </span>
          )}
        </div>
        {dualView ? (
          <div className="bb-fight-dual">
            <FightPane side="friendly" state={friendly} factionRulesFor={factionRulesFor} phaseKey={phaseKey} />
            <FightPane side="enemy" state={enemy} factionRulesFor={factionRulesFor} phaseKey={phaseKey} />
          </div>
        ) : (
          <FightPane side={singleSide} state={singleSide === 'friendly' ? friendly : enemy} factionRulesFor={factionRulesFor} phaseKey={phaseKey} />
        )}
      </div>
    </div>
  );
}

export default function BattleBuddyPage() {
  const [stage, setStage] = useState('select');
  const [friendly, setFriendly] = useState(makeBlankSide());
  const [enemy, setEnemy] = useState(makeBlankSide());
  const factionRules = useFactionRules();

  return (
    <div className="table-page bb-page">
      <div className="page-header">
        <div className="page-title">
          Battle Buddy
          <span>Age of Sigmar 4th Edition</span>
        </div>
        <div className="ab-stage-tabs">
          <button className={`ab-stage-tab${stage === 'select' ? ' active' : ''}`} onClick={() => setStage('select')}>Select Units</button>
          <button className={`ab-stage-tab${stage === 'fight' ? ' active' : ''}`} onClick={() => setStage('fight')}>Fight!</button>
        </div>
      </div>

      {stage === 'select' ? (
        <div className="bb-dual-view">
          <SourcePane side="friendly" state={friendly} setState={setFriendly} factionRules={factionRules} />
          <SourcePane side="enemy" state={enemy} setState={setEnemy} factionRules={factionRules} />
        </div>
      ) : (
        <FightStage friendly={friendly} enemy={enemy} factionRulesFor={factionRules.get} />
      )}
    </div>
  );
}
