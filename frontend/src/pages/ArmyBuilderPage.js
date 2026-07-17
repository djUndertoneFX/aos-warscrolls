import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import WarscrollGW, { AbilityCard } from '../components/WarscrollGW';
import { useSettings } from '../SettingsContext';
import { useAuth } from '../AuthContext';
import { calcWeaponADO, resolveWeaponLoadout } from '../awoCalc';

function parseBullets(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function sumADO(weapons, unitSize, save, ward, rounding) {
  let total = 0, any = false;
  for (const w of weapons) {
    const v = calcWeaponADO(w, unitSize || 1, save, ward, rounding);
    if (v !== null) { total += v; any = true; }
  }
  return any ? total : null;
}

// Tri-state cycle: false → true → false (left-click), false → 'exclude' → false (right-click)
function nextTriState(cur, isRight) {
  if (isRight) return cur === 'exclude' ? false : 'exclude';
  return cur === true ? false : true;
}
function triParam(val) {
  if (val === true)      return '1';
  if (val === 'exclude') return '-1';
  return undefined;
}

// Touch devices have no right-click, so a sortable column header can never
// reach the "clear sort" action that onContextMenu gives desktop users —
// a touch-and-hold (~550ms without lifting/dragging) triggers the same
// reset instead. A quick tap still sorts normally; one shared timer/ref
// pair (not per-column) is fine since only one column can be touched at a
// time — call this once per table, not inside a per-column .map().
function useColumnLongPress(onLongPressCol, onClickCol) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  const start = (colKey) => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => { firedRef.current = true; onLongPressCol(colKey); }, 550);
  };
  const cancel = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const click = (colKey, e) => { if (firedRef.current) { e.preventDefault(); return; } onClickCol(colKey, e); };
  return { start, cancel, click };
}

function TriCheckbox({ value, onChange, label }) {
  const isExclude = value === 'exclude';
  const isInclude = value === true;
  return (
    <span
      className={`cb-item tri-checkbox${isExclude ? ' cb-exclude' : ''}`}
      onClick={() => onChange(nextTriState(value, false))}
      onContextMenu={e => { e.preventDefault(); onChange(nextTriState(value, true)); }}
    >
      <span className={`tri-check${isInclude ? ' tri-include' : isExclude ? ' tri-exclude' : ''}`}>
        {isInclude ? '✓' : isExclude ? '✕' : ''}
      </span>
      <span>{label}</span>
    </span>
  );
}

const SORTABLE_COLS = [
  { key: 'name',          label: 'Unit Name', abbr: null },
  { key: 'faction',       label: 'Faction',   abbr: null },
  { key: 'grand_alliance',label: 'Alliance',  abbr: null },
  { key: 'points',        label: 'Points',    abbr: 'Pts' },
  { key: 'unit_size',     label: 'Models',    abbr: 'Mdl' },
  { key: 'move',          label: 'Move',      abbr: 'Mv',   statGroup: 'start' },
  { key: 'health',        label: 'Health',    abbr: 'HP',   statGroup: true },
  { key: 'control',       label: 'Control',   abbr: 'Ctrl', statGroup: true },
  { key: 'save',          label: 'Save',      abbr: 'Sv',   statGroup: 'end' },
  { key: 'ward',          label: 'Ward',      abbr: 'Wd',   statGroup: false },
];

function AllianceBadge({ alliance }) {
  return <span className={`alliance-badge alliance-${alliance}`}>{alliance}</span>;
}

// Army Roster scanned pages — same assets/blur-up placeholders as Path to
// Glory's doc tray (see [[ptg_asset_extraction]]), reused here so the
// preview thumbnail and Image-mode view render instantly with no network
// round-trip before the real JPEG decodes.
const ARMY_ROSTER_MICRO = {
  page1: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEBQH/xAAnEAACAQEHAgcAAAAAAAAAAAABAgADBBESEyEiMQVRFCMyQWGBkf/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A37Jl2VWVVxYnLbn7x/imW43rr8iJsdZCzUssFl9yZTiJIGXT/JAM5tLUtuABw16vzzpCdJAqIBTUa8gwgQ2E+a4FNRzvA5lQXf6vqZnTLSCCzE4dds0FqobmAMBrX5qEd+0ItqqM6kX3CED/2Q==',
  page2: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEAgb/xAAlEAACAgECBQUBAAAAAAAAAAABAgARAwQhEhMxUXEFFDJhkYH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOpTVINTlwjHbITvfiabKWNFFrzJlysNZmDBVTiNNQvoI1SC1q1/wSCTX6NXyc0AhqoizX5CWZBbpfS+0ICEzZPeZldiMYY1+CNXhJtSTFEoGdnGzmxtAZUX4krfYQGarIVUHiO28JB6hq15JCu5P3CEf//Z',
};
const ARMY_ROSTER_AVG_COLOR = { page1: '#d1d2cc', page2: '#d1d2cb' };

// The official Army Roster sheet has a FIXED capacity: General's Regiment 1
// gets 1 General + 4 Unit slots, Regiments 2-5 each get 1 Hero + 3 Unit
// slots, and Auxiliary Units gets 5 plain Unit slots — measured directly off
// the printed page (see ptg_asset_extraction memory) rather than guessed.
const REGIMENT_SLOTS = [
  { label: "General's Regiment 1", heroLabel: 'General', unitCount: 4 },
  { label: 'Regiment 2', heroLabel: 'Hero', unitCount: 3 },
  { label: 'Regiment 3', heroLabel: 'Hero', unitCount: 3 },
  { label: 'Regiment 4', heroLabel: 'Hero', unitCount: 3 },
  { label: 'Regiment 5', heroLabel: 'Hero', unitCount: 3 },
];
const AUX_SLOT_COUNT = 5;

// Pixel-measured (via PIL band-detection on the actual JPEGs) position of
// every row/field on the printed sheet, expressed as % of image width/height
// — used to overlay live text on top of the scanned page in Image mode.
// Column X-ranges are shared by every regiment/aux row on both pages.
const ROSTER_ROW_COLS = {
  name:  { left: 20.6, width: 27.2 },
  size:  { left: 47.8, width: 6.2 },
  notes: { left: 54,   width: 29.5 },
  points:{ left: 83.5, width: 12.5 },
};
const ROSTER_LAYOUT = {
  header: {
    commander:       { page: 0, top: 19,   left: 6.5,  width: 32 },
    armyName:        { page: 0, top: 19,   left: 39.4, width: 34.5 },
    pointsLimit:     { page: 0, top: 24.5, left: 74.5, width: 17.9 },
    faction:         { page: 0, top: 29,   left: 6.5,  width: 32 },
    battleFormation: { page: 0, top: 29,   left: 39.4, width: 34.5 },
  },
  regiments: [
    { page: 0, general: 41.91, units: [44.99, 48.01, 51.03, 54.06] },
    { page: 0, general: 63.32, units: [66.40, 69.42, 72.44] },
    { page: 0, general: 82.22, units: [85.29, 88.31, 91.34] },
    { page: 1, general: 16.73, units: [19.80, 22.82, 25.84] },
    { page: 1, general: 35.62, units: [38.69, 41.71, 44.74] },
  ],
  regimentsTotal: { page: 1, top: 50.23 },
  aux: [59.55, 62.62, 65.64, 68.66, 71.69].map(top => ({ page: 1, top })),
  auxTotal: { page: 1, top: 77.23 },
  unitsTotal: { page: 1, top: 79.70 },
  notes: { page: 1, top: 89, height: 8 },
};

// ── Roster-slot instance keys: "<unitId>:train:<i>" / "<unitId>:reinforce:<i>"
// — one key per physically selected unit copy, stable across re-renders as
// long as train/reinforce counts for that unit don't change. ──────────────
function instanceUnit(key, unitsById) {
  const [unitId] = key.split(':');
  return unitsById[unitId];
}
function instanceReinforced(key) {
  return key.split(':')[1] === 'reinforce';
}
function instancePoints(key, unitsById) {
  const unit = instanceUnit(key, unitsById);
  if (!unit) return 0;
  const pts = parseInt(unit.points, 10) || 0;
  return instanceReinforced(key) ? pts * 2 : pts;
}
function instanceSize(key, unitsById) {
  const unit = instanceUnit(key, unitsById);
  if (!unit) return '';
  const size = parseInt(unit.unit_size, 10) || 0;
  if (!size) return '';
  return instanceReinforced(key) ? size * 2 : size;
}
function instanceName(key, unitsById) {
  const unit = instanceUnit(key, unitsById);
  return unit ? unit.name : '(unknown unit)';
}
function instanceNotes(key) {
  return instanceReinforced(key) ? 'Reinforced' : '';
}

function makeEmptySlots() {
  return {
    regiments: REGIMENT_SLOTS.map(r => ({ general: null, units: Array(r.unitCount).fill(null) })),
    aux: Array(AUX_SLOT_COUNT).fill(null),
  };
}
function cloneSlots(slots) {
  return {
    regiments: slots.regiments.map(r => ({ general: r.general, units: [...r.units] })),
    aux: [...slots.aux],
  };
}
// Locates where an instance key currently lives within `slots`.
function findSlotRef(slots, key) {
  for (let ri = 0; ri < slots.regiments.length; ri++) {
    if (slots.regiments[ri].general === key) return { kind: 'general', regimentIdx: ri };
    const ui = slots.regiments[ri].units.indexOf(key);
    if (ui !== -1) return { kind: 'unit', regimentIdx: ri, unitIdx: ui };
  }
  const ai = slots.aux.indexOf(key);
  if (ai !== -1) return { kind: 'aux', unitIdx: ai };
  return null;
}
function getSlotValueAt(slots, ref) {
  if (!ref) return null;
  if (ref.kind === 'general') return slots.regiments[ref.regimentIdx].general;
  if (ref.kind === 'unit') return slots.regiments[ref.regimentIdx].units[ref.unitIdx];
  return slots.aux[ref.unitIdx];
}
function setSlotValueAt(slots, ref, value) {
  const next = cloneSlots(slots);
  if (ref.kind === 'general') next.regiments[ref.regimentIdx].general = value;
  else if (ref.kind === 'unit') next.regiments[ref.regimentIdx].units[ref.unitIdx] = value;
  else next.aux[ref.unitIdx] = value;
  return next;
}
// Swaps whatever is at `sourceKey`'s current slot with whatever is at `targetRef`.
function swapIntoSlot(slots, sourceKey, targetRef) {
  const sourceRef = findSlotRef(slots, sourceKey);
  if (!sourceRef) return slots;
  const targetValue = getSlotValueAt(slots, targetRef);
  let next = setSlotValueAt(slots, sourceRef, targetValue);
  next = setSlotValueAt(next, targetRef, sourceKey);
  return next;
}

function ProgressiveImg({ src, micro, avgColor, alt, className }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`ptg-progressive-img${className ? ' ' + className : ''}`} style={avgColor ? { backgroundColor: avgColor } : undefined}>
      <img src={micro} alt="" aria-hidden="true" className="ptg-progressive-img-micro" />
      <img
        src={src}
        alt={alt}
        className={`ptg-progressive-img-full${loaded ? ' ptg-progressive-img-loaded' : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </span>
  );
}

function unitTypeLabel(row) {
  if (row.is_hero)          return 'Heroes';
  if (row.is_infantry)      return 'Infantry';
  if (row.is_cavalry)       return 'Cavalry';
  if (row.is_beast)         return 'Beasts';
  if (row.is_monster)       return 'Monsters';
  if (row.is_war_machine)   return 'War Machines';
  if (row.is_terrain)       return 'Faction Terrain';
  if (row.is_manifestation) return 'Manifestations';
  return 'Other';
}

function TypeTags({ row }) {
  const tags = [];
  if (row.is_hero)          tags.push('Hero');
  if (row.is_infantry)      tags.push('Infantry');
  if (row.is_cavalry)       tags.push('Cavalry');
  if (row.is_beast)         tags.push('Beast');
  if (row.is_monster)       tags.push('Monster');
  if (row.is_war_machine)   tags.push('War Machine');
  if (row.is_terrain)       tags.push('Faction Terrain');
  if (row.is_manifestation) tags.push('Manifestation');
  if (row.is_unique)        tags.push('Unique');
  return (
    <div className="type-tags">
      {tags.map(t => <span key={t} className="type-tag">{t}</span>)}
      {row.is_legends ? <span className="type-tag legends">Legends</span> : null}
    </div>
  );
}

// Reorders an already-alphabetized list into column-major order for a 2-col
// grid: first half fills column 1 top-to-bottom, second half fills column 2 —
// achieved by interleaving the two halves since the grid itself fills row-major.
function toTwoColumnOrder(arr) {
  const half = Math.ceil(arr.length / 2);
  const out = [];
  for (let i = 0; i < half; i++) {
    out.push(arr[i]);
    if (arr[i + half]) out.push(arr[i + half]);
  }
  return out;
}

function FactionDropdown({ factions, value, onChange, liveCount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = factions.find(f => f.faction_slug === value);
  const displayCount = (selected && liveCount != null) ? liveCount : selected?.unit_count;
  const label = selected ? `${selected.faction} (${displayCount})` : 'All Factions';
  const colMajorFactions = React.useMemo(() => toTwoColumnOrder(factions), [factions]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (slug) => { onChange(slug); setOpen(false); };

  return (
    <div className="faction-dropdown" ref={ref}>
      <button className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu faction-dropdown-menu-2col">
          <div className={`faction-dropdown-item faction-dropdown-item-all${value === '' ? ' selected' : ''}`} onMouseDown={() => pick('')}>
            All Factions
          </div>
          {colMajorFactions.map(f => (
            <div
              key={f.faction_slug}
              className={`faction-dropdown-item${value === f.faction_slug ? ' selected' : ''}`}
              onMouseDown={() => pick(f.faction_slug)}
            >
              {f.faction} ({f.unit_count})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TEXT_SORT_COLS = new Set(['faction','name','types','keywords','alliance']);
function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <span className="sort-icon">↕</span>;
  const asc = sortDir === 'asc';
  const up = TEXT_SORT_COLS.has(col) ? !asc : asc;
  return <span className="sort-icon">{up ? '↑' : '↓'}</span>;
}

const STAGES = [
  { key: 'formation',           label: 'Battle Formation' },
  { key: 'units',                label: 'Select Units' },
  { key: 'heroic_traits',         label: 'Heroic Traits',        section: 'heroic_traits' },
  { key: 'artefacts',             label: 'Artefacts of Power',   section: 'artefacts' },
  { key: 'spell_lore',            label: 'Spell Lore',           section: 'spell_lore' },
  { key: 'prayer_lore',           label: 'Prayer Lore',          section: 'prayer_lore' },
  { key: 'manifestation_lore',    label: 'Manifestation Lore',   section: 'manifestation_lore' },
];

// ── Battle Formation stage: single army-wide radio pick, tied to the army's
// primary Faction (Select Units stage) ──────────────────────────────────────
function FormationOption({ g, battleFormation, setBattleFormation }) {
  return (
    <label className={`ab-formation-option${battleFormation === g.name ? ' selected' : ''}`}>
      <input
        type="radio"
        name="battle-formation"
        checked={battleFormation === g.name}
        onChange={() => setBattleFormation(g.name)}
      />
      <div className="ab-formation-option-body">
        <div className="ab-formation-option-name">
          {g.name}
          {g.sourceNote && <span className="gw-formation-source-note"> ({g.sourceNote})</span>}
        </div>
        <div className="gw-abilities-grid gw-sp-grid-2col">
          {g.items.map((ab, i) => <AbilityCard key={i} ab={{ ...ab, bullets: parseBullets(ab.bullets) }} keywords={[]} />)}
        </div>
      </div>
    </label>
  );
}

function BattleFormationStage({ factionName, rules, battleFormation, setBattleFormation, hasFaction }) {
  if (!hasFaction) return <div className="ab-stage-empty">Pick a Faction on the Select Units stage first.</div>;
  if (!rules) return <div className="ab-stage-empty">Loading…</div>;
  const groups = [];
  const byName = {};
  for (const item of rules.formations ?? []) {
    const gName = item.formation_name || 'General';
    if (!byName[gName]) { byName[gName] = { name: gName, sourceNote: item.source_note || null, items: [] }; groups.push(byName[gName]); }
    byName[gName].items.push(item);
  }
  if (groups.length === 0) return <div className="ab-stage-empty">No Battle Formations found for {factionName}.</div>;

  // Primary = core-battletome formations, always laid out in the book's
  // fixed 2x2 quadrant order. Additional = later-supplement formations
  // (Scourge of Ghyran, etc.) with no fixed book position — listed below a
  // divider in document order instead.
  const primaryGroups    = groups.filter(g => !g.sourceNote);
  const additionalGroups = groups.filter(g => g.sourceNote);
  const primaryGridOrder = toTwoColumnOrder(primaryGroups);

  return (
    <>
      <div className="ab-formation-list">
        {primaryGridOrder.map((g, gi) => (
          <FormationOption key={gi} g={g} battleFormation={battleFormation} setBattleFormation={setBattleFormation} />
        ))}
      </div>
      {additionalGroups.length > 0 && (
        <>
          <div className="gw-formation-divider" />
          <div className="ab-formation-list">
            {additionalGroups.map((g, gi) => (
              <FormationOption key={gi} g={g} battleFormation={battleFormation} setBattleFormation={setBattleFormation} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Heroic Traits / Artefacts / Spell / Prayer / Manifestation Lore stages:
// each pick is assigned to one of your selected Hero units ──────────────────
function HeroAssignmentStage({ label, sectionKey, selectedHeroes, rulesCache, heroAssignments, setHeroAssignments }) {
  if (selectedHeroes.length === 0) {
    return <div className="ab-stage-empty">No Hero units selected yet — add some on the Select Units stage.</div>;
  }
  const rows = selectedHeroes.map(hero => {
    const rules = rulesCache[hero.faction_slug];
    const options = rules ? (rules[sectionKey] ?? []) : null;
    return { hero, rules, options };
  });
  const anyEligible = rows.some(r => r.options === null || r.options.length > 0);
  return (
    <div className="ab-hero-assign-list">
      {rows.map(({ hero, rules, options }) => {
        if (rules && options.length === 0) return null; // this hero's faction has no such option category
        const current = heroAssignments[hero.id]?.[sectionKey] ?? '';
        const currentAb = options?.find(o => o.name === current);
        return (
          <div key={hero.id} className="ab-hero-assign-row">
            <div className="ab-hero-assign-head">
              <span className="ab-hero-assign-name">{hero.name}</span>
              <span className="ab-hero-assign-faction">{hero.faction}</span>
              {!rules ? (
                <span className="ab-hero-assign-loading">Loading…</span>
              ) : (
                <select
                  className="ab-hero-assign-select"
                  value={current}
                  onChange={e => {
                    const val = e.target.value;
                    setHeroAssignments(prev => ({ ...prev, [hero.id]: { ...prev[hero.id], [sectionKey]: val } }));
                  }}
                >
                  <option value="">— None —</option>
                  {options.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                </select>
              )}
            </div>
            {currentAb && (
              <AbilityCard ab={{ ...currentAb, bullets: parseBullets(currentAb.bullets) }} keywords={[]} />
            )}
          </div>
        );
      })}
      {!anyEligible && (
        <div className="ab-stage-empty">None of your selected Heroes' factions have {label} options.</div>
      )}
    </div>
  );
}

// ── Saved-list manager: switch between named army lists, each with its own
// faction/roster/formation/hero-assignment/points-limit snapshot ───────────
function ListManager({ listsStore, activeListId, onSelect, onCreate, onDuplicate, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const ref = useRef(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setRenamingId(null); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // autoFocus + onFocus={select} isn't reliable here (React's autoFocus
  // doesn't consistently deliver a synthetic focus event in time for the
  // select() call to land before the browser settles cursor position) —
  // focusing and selecting explicitly once the input mounts is deterministic.
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const ids = Object.keys(listsStore.lists);
  const activeName = listsStore.lists[activeListId]?.name ?? 'List name…';

  const startRename = (id, name) => { setRenamingId(id); setRenameValue(name); };
  const commitRename = () => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  return (
    <div className="ab-list-manager" ref={ref}>
      <button className="ab-list-trigger" onClick={() => setOpen(o => !o)}>
        <span>{activeName}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ab-list-menu">
          {ids.map(id => (
            <div key={id} className={`ab-list-item${id === activeListId ? ' selected' : ''}`}>
              {renamingId === id ? (
                <input
                  ref={renameInputRef}
                  className="ab-list-rename-input"
                  value={renameValue}
                  onFocus={e => e.target.select()}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="ab-list-item-name" onClick={() => { onSelect(id); setOpen(false); }}>
                  {listsStore.lists[id].name}
                </span>
              )}
              <span className="ab-list-item-actions">
                <button type="button" title="Rename" onClick={e => { e.stopPropagation(); startRename(id, listsStore.lists[id].name); }}>✎</button>
                <button type="button" title="Duplicate" onClick={e => { e.stopPropagation(); onDuplicate(id); setOpen(false); }}>⧉</button>
                <button
                  type="button" title={ids.length <= 1 ? 'At least one list is required' : 'Delete'}
                  disabled={ids.length <= 1}
                  onClick={e => { e.stopPropagation(); onDelete(id); }}
                >🗑</button>
              </span>
            </div>
          ))}
          <button type="button" className="ab-list-new-btn" onClick={() => { onCreate(); setOpen(false); }}>+ New List</button>
        </div>
      )}
    </div>
  );
}

// ── Army Roster thumbnail + modal — a compact preview of the official 2-page
// Army Roster sheet that opens into an editor with the same Image/Replica
// toggle Path to Glory's doc tray uses (see ptg_asset_extraction memory).
// Faction/Points Limit/Battle Formation are shown read-only here since this
// page already tracks them live elsewhere; only Commander/Army Name/
// regiments/auxiliary units/notes are free-text, matching how Path to
// Glory's own Army Roster replica works (manual entry, not auto-populated
// from an underlying unit system). ───────────────────────────────────────
function ArmyRosterThumb({ onClick }) {
  return (
    <button type="button" className="ab-roster-thumb" onClick={onClick} title="Click to view/edit your Army Roster">
      <ProgressiveImg
        src="/ptg/army-roster-1-thumb.jpg" micro={ARMY_ROSTER_MICRO.page1} avgColor={ARMY_ROSTER_AVG_COLOR.page1}
        alt="Army Roster" className="ab-roster-thumb-img"
      />
    </button>
  );
}

// One regiment/aux slot, rendered either as a replica table row or as
// absolutely-positioned overlay text on the scanned page image — both share
// the same drag-and-drop wiring so reassigning a unit works identically in
// either view mode.
function RosterSlotRow({ mode, label, instanceKey, slotRef, unitsById, onMove, top }) {
  const name = instanceKey ? instanceName(instanceKey, unitsById) : '';
  const size = instanceKey ? instanceSize(instanceKey, unitsById) : '';
  const notes = instanceKey ? instanceNotes(instanceKey) : '';
  const points = instanceKey ? instancePoints(instanceKey, unitsById) : '';

  const dragProps = {
    draggable: !!instanceKey,
    onDragStart: e => { if (instanceKey) e.dataTransfer.setData('text/plain', instanceKey); },
    onDragOver: e => e.preventDefault(),
    onDrop: e => {
      e.preventDefault();
      const sourceKey = e.dataTransfer.getData('text/plain');
      if (sourceKey) onMove(sourceKey, slotRef);
    },
  };

  if (mode === 'replica') {
    return (
      <div className={`ab-roster-slot-row${instanceKey ? ' ab-roster-slot-filled' : ' ab-roster-slot-empty'}`} {...dragProps}>
        <span className="ab-roster-slot-label">{label}</span>
        <span>{name}</span>
        <span>{size}</span>
        <span>{notes}</span>
        <span>{instanceKey ? points : ''}</span>
      </div>
    );
  }

  return (
    <div className={`ab-roster-overlay-row${instanceKey ? '' : ' ab-roster-overlay-row-empty'}`} style={{ top: `${top}%` }} {...dragProps}>
      <span className="ab-roster-overlay-cell" style={{ left: `${ROSTER_ROW_COLS.name.left}%`, width: `${ROSTER_ROW_COLS.name.width}%` }}>{name}</span>
      <span className="ab-roster-overlay-cell ab-roster-overlay-center" style={{ left: `${ROSTER_ROW_COLS.size.left}%`, width: `${ROSTER_ROW_COLS.size.width}%` }}>{size}</span>
      <span className="ab-roster-overlay-cell" style={{ left: `${ROSTER_ROW_COLS.notes.left}%`, width: `${ROSTER_ROW_COLS.notes.width}%` }}>{notes}</span>
      <span className="ab-roster-overlay-cell ab-roster-overlay-center" style={{ left: `${ROSTER_ROW_COLS.points.left}%`, width: `${ROSTER_ROW_COLS.points.width}%` }}>{instanceKey ? points : ''}</span>
    </div>
  );
}

function overlayFieldStyle(pos) {
  return { top: `${pos.top}%`, left: `${pos.left}%`, width: `${pos.width}%` };
}

function ArmyRosterModal({
  onClose, presentMode, setPresentMode,
  listName, factionName, pointsLimit, setPointsLimit, battleFormation, totalPoints,
  doc, setDoc, unitsById, moveToSlot,
  regimentsTotal, auxTotal, armyUnitsTotal,
}) {
  const modalRef = useRef(null);
  const [printPreview, setPrintPreview] = useState(false);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') { if (printPreview) setPrintPreview(false); else onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, printPreview]);

  const overLimit = totalPoints > pointsLimit;
  const { slots } = doc;
  const overflowAux = Math.max(0, slots.aux.length - AUX_SLOT_COUNT);

  const renderSlot = (mode, label, instanceKey, slotRef, top) => {
    const key = `${slotRef.kind}-${slotRef.regimentIdx ?? ''}-${slotRef.unitIdx ?? ''}`;
    return <RosterSlotRow key={key} mode={mode} label={label} instanceKey={instanceKey} slotRef={slotRef} unitsById={unitsById} onMove={moveToSlot} top={top} />;
  };

  // Shared between the live editor and the print preview — printing reads
  // straight out of the same inputs/spans, so whatever's on screen prints.
  const replicaBody = (
    <>
      <div className="ptg-army-header-grid">
        <div className="ptg-field ptg-army-commander"><label>Commander</label><input type="text" value={doc.commander} onChange={e => setDoc(d => ({ ...d, commander: e.target.value }))} /></div>
        <div className="ptg-field ptg-army-name"><label>Army Name</label><input type="text" value={listName} readOnly title="Set by renaming the list in the banner" /></div>
        <div className="ptg-field ptg-army-points-limit">
          <label>Points Limit</label>
          <div className="ab-roster-points-limit-row">
            <span className={overLimit ? 'ab-roster-overlay-over' : ''}>{totalPoints.toLocaleString()}</span>
            <span>/</span>
            <input
              type="number" min="0" value={pointsLimit}
              onChange={e => setPointsLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
        </div>
        <div className="ptg-field ptg-army-faction"><label>Faction</label><input type="text" value={factionName || '—'} readOnly /></div>
        <div className="ptg-field ptg-army-formation"><label>Battle Formation</label><input type="text" value={battleFormation || '—'} readOnly /></div>
      </div>

      {REGIMENT_SLOTS.map((rs, ri) => (
        <div className="ptg-regiment-block" key={ri}>
          <div className="ptg-regiment-header"><span>{rs.label}</span></div>
          <div className="ab-roster-slot-head">
            <span></span><span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span>
          </div>
          {renderSlot('replica', rs.heroLabel, slots.regiments[ri].general, { kind: 'general', regimentIdx: ri })}
          {slots.regiments[ri].units.map((u, ui) =>
            renderSlot('replica', `Unit ${ui + 1}`, u, { kind: 'unit', regimentIdx: ri, unitIdx: ui })
          )}
        </div>
      ))}
      <div className="ptg-oob-cap">Regiments Total: {regimentsTotal}pts</div>

      <div className="ptg-regiment-block">
        <div className="ptg-regiment-header"><span>Auxiliary Units</span></div>
        <div className="ab-roster-slot-head">
          <span></span><span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span>
        </div>
        {slots.aux.map((u, ai) =>
          renderSlot('replica', `Unit ${ai + 1}`, u, { kind: 'aux', unitIdx: ai })
        )}
      </div>
      <div className="ptg-oob-cap">Auxiliary Units Total: {auxTotal}pts</div>
      <div className="ptg-oob-cap"><strong>Units Total: {armyUnitsTotal}pts</strong></div>

      <div className="ptg-field"><label>Notes</label><textarea rows={3} value={doc.notes} onChange={e => setDoc(d => ({ ...d, notes: e.target.value }))} /></div>
    </>
  );

  const handlePrintClick = () => {
    if (presentMode === 'replica') setPrintPreview(true);
    else window.print();
  };

  return (
    <>
      <div className="gw-overlay" onClick={printPreview ? () => setPrintPreview(false) : onClose} />
      <div className={`ptg-wizard${presentMode === 'image' ? ' ab-roster-modal-wide' : ''}`} ref={modalRef} role="dialog" aria-modal="true" aria-label="Army Roster">
        {!printPreview && <button className="ab-roster-print-btn" onClick={handlePrintClick} title="Print">🖨 Print</button>}
        {!printPreview && <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>}

        {printPreview ? (
          <>
            <div className="ptg-doc-editor-header">
              <div className="ptg-doc-editor-title">Print Preview</div>
              <div className="ab-roster-print-actions">
                <button className="ptg-wizard-nav-btn" onClick={() => setPrintPreview(false)}>‹ Cancel</button>
                <button className="ptg-wizard-nav-btn ab-roster-print-confirm" onClick={() => window.print()}>🖨 Print</button>
              </div>
            </div>
            <div className="ptg-doc-editor-body ab-roster-print-target ab-roster-print-ready">
              {replicaBody}
            </div>
          </>
        ) : (
          <>
            <div className="ptg-doc-editor-header">
              <div className="ptg-doc-editor-title">Army Roster</div>
              <div className="ptg-present-toggle">
                <button className={presentMode === 'image' ? 'ptg-present-active' : ''} onClick={() => setPresentMode('image')}>Image</button>
                <button className={presentMode === 'replica' ? 'ptg-present-active' : ''} onClick={() => setPresentMode('replica')}>Replica</button>
              </div>
            </div>

            <div className={presentMode === 'image' ? 'ab-roster-image-body' : 'ptg-doc-editor-body'}>
              {presentMode === 'image' ? (
                <div className="ab-roster-image-view ab-roster-print-target">
                  <div className="ab-roster-image-page">
                    <ProgressiveImg src="/ptg/army-roster-1.jpg" micro={ARMY_ROSTER_MICRO.page1} avgColor={ARMY_ROSTER_AVG_COLOR.page1} alt="Army Roster page 1" className="ab-roster-page-img" />
                    <div className="ab-roster-overlay-field" style={overlayFieldStyle(ROSTER_LAYOUT.header.commander)}>{doc.commander}</div>
                    <div className="ab-roster-overlay-field" style={overlayFieldStyle(ROSTER_LAYOUT.header.armyName)}>{listName}</div>
                    <div className={`ab-roster-overlay-field ab-roster-overlay-center${overLimit ? ' ab-roster-overlay-over' : ''}`} style={overlayFieldStyle(ROSTER_LAYOUT.header.pointsLimit)}>{totalPoints.toLocaleString()} / {pointsLimit}</div>
                    <div className="ab-roster-overlay-field" style={overlayFieldStyle(ROSTER_LAYOUT.header.faction)}>{factionName}</div>
                    <div className="ab-roster-overlay-field" style={overlayFieldStyle(ROSTER_LAYOUT.header.battleFormation)}>{battleFormation}</div>

                    {ROSTER_LAYOUT.regiments.map((rl, ri) => rl.page === 0 && (
                      <React.Fragment key={ri}>
                        {renderSlot('image', REGIMENT_SLOTS[ri].heroLabel, slots.regiments[ri].general, { kind: 'general', regimentIdx: ri }, rl.general)}
                        {rl.units.map((top, ui) => renderSlot('image', `Unit ${ui + 1}`, slots.regiments[ri].units[ui], { kind: 'unit', regimentIdx: ri, unitIdx: ui }, top))}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="ab-roster-image-page">
                    <ProgressiveImg src="/ptg/army-roster-2.jpg" micro={ARMY_ROSTER_MICRO.page2} avgColor={ARMY_ROSTER_AVG_COLOR.page2} alt="Army Roster page 2" className="ab-roster-page-img" />
                    {ROSTER_LAYOUT.regiments.map((rl, ri) => rl.page === 1 && (
                      <React.Fragment key={ri}>
                        {renderSlot('image', REGIMENT_SLOTS[ri].heroLabel, slots.regiments[ri].general, { kind: 'general', regimentIdx: ri }, rl.general)}
                        {rl.units.map((top, ui) => renderSlot('image', `Unit ${ui + 1}`, slots.regiments[ri].units[ui], { kind: 'unit', regimentIdx: ri, unitIdx: ui }, top))}
                      </React.Fragment>
                    ))}
                    <div className="ab-roster-overlay-field ab-roster-overlay-center" style={{ top: `${ROSTER_LAYOUT.regimentsTotal.top}%`, left: `${ROSTER_ROW_COLS.points.left}%`, width: `${ROSTER_ROW_COLS.points.width}%` }}>{regimentsTotal}</div>

                    {ROSTER_LAYOUT.aux.map((a, ai) => renderSlot('image', `Unit ${ai + 1}`, slots.aux[ai], { kind: 'aux', unitIdx: ai }, a.top))}
                    {overflowAux > 0 && <div className="ab-roster-overlay-note">+{overflowAux} more not shown — see Replica</div>}
                    <div className="ab-roster-overlay-field ab-roster-overlay-center" style={{ top: `${ROSTER_LAYOUT.auxTotal.top}%`, left: `${ROSTER_ROW_COLS.points.left}%`, width: `${ROSTER_ROW_COLS.points.width}%` }}>{auxTotal}</div>
                    <div className="ab-roster-overlay-field ab-roster-overlay-center" style={{ top: `${ROSTER_LAYOUT.unitsTotal.top}%`, left: `${ROSTER_ROW_COLS.points.left}%`, width: `${ROSTER_ROW_COLS.points.width}%` }}>{armyUnitsTotal}</div>
                    <div className="ab-roster-overlay-notes-text" style={{ top: `${ROSTER_LAYOUT.notes.top}%`, left: '8%', width: '84%' }}>{doc.notes}</div>
                  </div>
                </div>
              ) : replicaBody}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function ArmyBuilderPage({ headerCollapsed }) {
  const { presumedSave, presumedWard, roundingMode, includeSaveWardInADO } = useSettings();
  const { logout } = useAuth();
  const [data, setData]         = useState(null);
  const [factions, setFactions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // ── Persisted army state, split across named saved lists ────────────────
  // Each list snapshots faction/points/roster/formation/hero-assignments;
  // the live component state below always mirrors whichever list is active,
  // and every change to it is continuously written back into that list's
  // slot server-side (see the debounced-autosave effect further down) — so
  // switching lists never loses in-progress edits on the list you're
  // leaving, and lists survive across devices/sessions/deploys instead of
  // living in localStorage (which a browser update or storage clear wipes).
  // localStorage is only still touched for a one-time migration of any
  // lists saved before this went server-side, and to remember which list
  // was last active (a pure UI nicety — safe to lose).
  const LISTS_KEY = 'aos-army-builder-lists-v1'; // pre-server-sync save, migrated once below
  const LEGACY_ARMY_KEY = 'aos-army-builder-v1'; // pre-multi-list save, migrated once below
  const LAST_ACTIVE_KEY = 'aos-army-builder-last-active-list-id';

  function makeBlankArmyRosterDoc() {
    return { commander: '', notes: '', slots: makeEmptySlots() };
  }
  // Guards against pre-slots-model saved docs (older localStorage state had
  // `regiments`/`auxUnits` arrays instead of `slots`) — falls back to blank
  // rather than crashing on the shape mismatch.
  function sanitizeArmyRosterDoc(doc) {
    if (doc && doc.slots && Array.isArray(doc.slots.regiments) && doc.slots.regiments.length === REGIMENT_SLOTS.length && Array.isArray(doc.slots.aux)) {
      return doc;
    }
    return makeBlankArmyRosterDoc();
  }

  function makeBlankList(name) {
    return { name, faction: '', pointsLimit: 2000, roster: {}, rosterOrder: [], battleFormation: '', heroAssignments: {}, activeStage: 'units', armyRosterDoc: makeBlankArmyRosterDoc() };
  }
  // The subset of a list's fields that live in the server row's `data` blob
  // (name/faction_slug/faction_name are their own columns, set separately).
  function listToDataBlob(list) {
    const { name, ...rest } = list; // eslint-disable-line no-unused-vars
    return rest;
  }

  const [listsStore, setListsStore] = useState({ activeListId: null, lists: {} });
  const [listsLoading, setListsLoading] = useState(true);
  const activeListId = listsStore.activeListId;
  // Kept in sync with activeListId on every list switch/create/duplicate/
  // delete so the debounced autosave callback (which fires after a delay,
  // by which point a stale closure over activeListId could be wrong) always
  // saves to whichever list is actually active at save time.
  const activeListIdRef = useRef(null);
  useEffect(() => { activeListIdRef.current = activeListId; }, [activeListId]);

  // Identifies this browser tab to the server (see the live-sync EventSource
  // effect further down) so a device's own edit doesn't echo back to itself
  // as a "someone else changed this" event. Lazy-init via a ref rather than
  // useState — this value never needs to trigger a re-render.
  const clientIdRef = useRef(null);
  if (!clientIdRef.current) clientIdRef.current = crypto.randomUUID();
  const clientIdHeader = useCallback(() => ({ headers: { 'X-Client-Id': clientIdRef.current } }), []);

  const [faction, setFaction]         = useState('');
  const [pointsLimit, setPointsLimit] = useState(2000);
  const [roster, setRoster]           = useState({}); // { [unitId]: { train, reinforce } }
  const [rosterOrder, setRosterOrder] = useState([]); // unitIds in first-selected order
  const [battleFormation, setBattleFormation] = useState('');
  const [heroAssignments, setHeroAssignments] = useState({}); // { [heroId]: { heroic_traits, artefacts, spell_lore, prayer_lore, manifestation_lore } }
  const [activeStage, setActiveStage] = useState('units');
  const [armyRosterDoc, setArmyRosterDoc] = useState(makeBlankArmyRosterDoc());

  // Set whenever loadListIntoState runs (initial load, list switch, or a
  // remote live-sync update) and checked once by the autosave effect below —
  // populating these fields is itself a state change the effect would
  // otherwise see and immediately re-save right back to the server. Skipping
  // that one redundant PUT (and its broadcast) doesn't affect correctness
  // either way, just avoids the pointless round-trip on every load.
  const justLoadedRef = useRef(false);

  const loadListIntoState = useCallback((list) => {
    justLoadedRef.current = true;
    setFaction(list.faction ?? '');
    setPointsLimit(list.pointsLimit ?? 2000);
    setRoster(list.roster ?? {});
    setRosterOrder(list.rosterOrder ?? Object.keys(list.roster ?? {}));
    setBattleFormation(list.battleFormation ?? '');
    setHeroAssignments(list.heroAssignments ?? {});
    setActiveStage(list.activeStage ?? 'units');
    setArmyRosterDoc(sanitizeArmyRosterDoc(list.armyRosterDoc));
  }, []);

  // One-time load: fetch this account's saved lists from the server. If none
  // exist yet, migrate whatever's sitting in this browser's localStorage
  // (multi-list save, or the older pre-multi-list single save) up to the
  // server so nothing gets lost switching over to server-side storage; a
  // brand new account with neither just gets one blank list.
  // migrationStarted guards against StrictMode's dev-only double-invoke of
  // this effect (mount→cleanup→mount, with component state — including
  // refs — surviving the cycle): without it, the "0 rows -> create list(s)"
  // migration branch runs twice and creates duplicate lists server-side.
  // Deliberately NOT paired with a cleanup-driven `cancelled` flag — that
  // combination is a trap: StrictMode's synthetic cleanup would flip
  // `cancelled` true on the one invocation that's actually allowed to run
  // (the ref already blocked the second one), so the real fetch always
  // discarded its own result and the page silently never loaded any data.
  const migrationStarted = useRef(false);
  useEffect(() => {
    if (migrationStarted.current) return;
    migrationStarted.current = true;
    (async () => {
      try {
        const { data: rows } = await axios.get('/api/army-builder-lists');
        let finalRows = rows;
        if (rows.length === 0) {
          const localLists = [];
          try {
            const raw = JSON.parse(localStorage.getItem(LISTS_KEY));
            if (raw && raw.lists) {
              for (const l of Object.values(raw.lists)) localLists.push(l);
            }
          } catch {}
          if (localLists.length === 0) {
            let legacy = null;
            try { legacy = JSON.parse(localStorage.getItem(LEGACY_ARMY_KEY)); } catch {}
            if (legacy && (legacy.faction || Object.keys(legacy.roster ?? {}).length > 0)) {
              localLists.push({
                name: 'List name…', faction: legacy.faction ?? '', pointsLimit: legacy.pointsLimit ?? 2000,
                roster: legacy.roster ?? {}, rosterOrder: legacy.rosterOrder ?? Object.keys(legacy.roster ?? {}),
                battleFormation: legacy.battleFormation ?? '', heroAssignments: legacy.heroAssignments ?? {},
                activeStage: legacy.activeStage ?? 'units', armyRosterDoc: sanitizeArmyRosterDoc(legacy.armyRosterDoc),
              });
            }
          }
          if (localLists.length === 0) localLists.push(makeBlankList('List name…'));

          const created = [];
          for (const l of localLists) {
            const { data: res } = await axios.post('/api/army-builder-lists', {
              name: l.name || 'List name…', faction_slug: l.faction || null, faction_name: null, data: listToDataBlob(l),
            }, clientIdHeader());
            created.push({ id: res.id, name: l.name || 'List name…', faction_slug: l.faction || null, faction_name: null });
          }
          finalRows = created;
        }

        const listsMeta = {};
        for (const r of finalRows) listsMeta[r.id] = { name: r.name, faction_slug: r.faction_slug, faction_name: r.faction_name };
        let lastActive = null;
        try { lastActive = localStorage.getItem(LAST_ACTIVE_KEY); } catch {}
        // activeListId is always kept as a string — Object.keys() (used
        // throughout for the id list / "is this the active one" checks)
        // always returns strings, and comparing that against a raw numeric
        // id from an API response would silently fail (1 !== "1").
        const activeId = (lastActive && listsMeta[lastActive]) ? lastActive : String(finalRows[0].id);

        const { data: full } = await axios.get(`/api/army-builder-lists/${activeId}`);
        setListsStore({ activeListId: activeId, lists: listsMeta });
        loadListIntoState(full.data);
      } catch (err) {
        console.error('Failed to load Army Builder lists:', err);
        const blank = makeBlankList('List name…');
        setListsStore({ activeListId: 'local-fallback', lists: { 'local-fallback': { name: blank.name, faction_slug: null, faction_name: null } } });
        loadListIntoState(blank);
      } finally {
        setListsLoading(false);
      }
    })();
  }, []); // eslint-disable-line

  // Continuous autosave: debounce a PUT of the active list's current state
  // up to the server (rather than firing one per keystroke). Reads
  // activeListIdRef at fire time, not at effect-schedule time, so a rapid
  // list switch just before the timer fires can't save to the wrong list.
  const autosaveTimer = useRef(null);
  useEffect(() => {
    if (listsLoading || !activeListId) return;
    if (justLoadedRef.current) { justLoadedRef.current = false; return; }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const snapshot = { faction, pointsLimit, roster, rosterOrder, battleFormation, heroAssignments, activeStage, armyRosterDoc };
    autosaveTimer.current = setTimeout(() => {
      const id = activeListIdRef.current;
      if (!id || id === 'local-fallback') return;
      const factionName = factions.find(f => f.faction_slug === snapshot.faction)?.faction ?? null;
      axios.put(`/api/army-builder-lists/${id}`, {
        faction_slug: snapshot.faction || null, faction_name: factionName, data: listToDataBlob(snapshot),
      }, clientIdHeader()).catch(err => console.error('Army Builder autosave failed:', err));
    }, 700);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [faction, pointsLimit, roster, rosterOrder, battleFormation, heroAssignments, activeStage, armyRosterDoc, listsLoading, activeListId, factions]);

  // Live sync across devices: an SSE push channel notifies this account's
  // OTHER connected devices whenever a list changes here (create/rename/
  // duplicate/delete/autosave — see clientIdHeader() above and the
  // broadcastListChange calls in server.js), and vice versa. "Last write
  // wins" — an incoming update for the list currently open on this device
  // just reloads it into state; this is sequential multi-device sync (switch
  // from iPad to desktop and see your latest edit), not simultaneous
  // collaborative editing with conflict resolution.
  useEffect(() => {
    if (listsLoading) return;
    let token = null;
    try { token = localStorage.getItem('aos_token'); } catch {}
    if (!token) return;

    const base = axios.defaults.baseURL || '';
    const url = `${base}/api/army-builder-lists/stream?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientIdRef.current)}`;
    const es = new EventSource(url);

    es.addEventListener('list-upsert', e => {
      const row = JSON.parse(e.data);
      const id = String(row.id);
      setListsStore(prev => ({
        ...prev,
        lists: { ...prev.lists, [id]: { name: row.name, faction_slug: row.faction_slug, faction_name: row.faction_name } },
      }));
      if (id === activeListIdRef.current) loadListIntoState(row.data);
    });

    es.addEventListener('list-delete', e => {
      const id = String(JSON.parse(e.data).id);
      setListsStore(prev => {
        if (!prev.lists[id]) return prev;
        const nextLists = { ...prev.lists };
        delete nextLists[id];
        // Defensive only — deleteList already refuses to remove an
        // account's last list, so this shouldn't normally be reachable.
        if (Object.keys(nextLists).length === 0) return prev;
        let nextActiveId = prev.activeListId;
        if (nextActiveId === id) {
          nextActiveId = Object.keys(nextLists)[0];
          axios.get(`/api/army-builder-lists/${nextActiveId}`).then(({ data: full }) => {
            loadListIntoState(full.data);
            try { localStorage.setItem(LAST_ACTIVE_KEY, nextActiveId); } catch {}
          }).catch(err => console.error('Failed to load list after remote delete:', err));
        }
        return { activeListId: nextActiveId, lists: nextLists };
      });
    });

    return () => es.close();
  }, [listsLoading, loadListIntoState]); // eslint-disable-line

  const selectList = async (id) => {
    if (!listsStore.lists[id] || id === activeListId) return;
    try {
      const { data: full } = await axios.get(`/api/army-builder-lists/${id}`);
      setListsStore(prev => ({ ...prev, activeListId: id }));
      loadListIntoState(full.data);
      try { localStorage.setItem(LAST_ACTIVE_KEY, String(id)); } catch {}
    } catch (err) {
      console.error('Failed to load list:', err);
    }
  };

  const createList = async () => {
    const name = `New List ${Object.keys(listsStore.lists).length + 1}`;
    const blank = makeBlankList(name);
    try {
      const { data: res } = await axios.post('/api/army-builder-lists', { name, faction_slug: null, faction_name: null, data: listToDataBlob(blank) }, clientIdHeader());
      const newId = String(res.id);
      setListsStore(prev => ({ activeListId: newId, lists: { ...prev.lists, [newId]: { name, faction_slug: null, faction_name: null } } }));
      loadListIntoState(blank);
      try { localStorage.setItem(LAST_ACTIVE_KEY, newId); } catch {}
    } catch (err) {
      console.error('Failed to create list:', err);
    }
  };

  const duplicateList = async (id) => {
    const meta = listsStore.lists[id];
    if (!meta) return;
    try {
      // If duplicating the currently-active list, flush the live state first —
      // the debounced autosave may not have reached the server yet, and the
      // duplicate endpoint clones whatever's currently stored server-side.
      if (id === activeListId) {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        const factionName = factions.find(f => f.faction_slug === faction)?.faction ?? null;
        await axios.put(`/api/army-builder-lists/${id}`, {
          faction_slug: faction || null, faction_name: factionName,
          data: listToDataBlob({ faction, pointsLimit, roster, rosterOrder, battleFormation, heroAssignments, activeStage, armyRosterDoc }),
        }, clientIdHeader());
      }
      const { data: dup } = await axios.post(`/api/army-builder-lists/${id}/duplicate`, null, clientIdHeader());
      const dupId = String(dup.id);
      const { data: full } = await axios.get(`/api/army-builder-lists/${dupId}`);
      setListsStore(prev => ({
        activeListId: dupId,
        lists: { ...prev.lists, [dupId]: { name: full.name, faction_slug: full.faction_slug, faction_name: full.faction_name } },
      }));
      loadListIntoState(full.data);
      try { localStorage.setItem(LAST_ACTIVE_KEY, dupId); } catch {}
    } catch (err) {
      console.error('Failed to duplicate list:', err);
    }
  };

  const renameList = (id, name) => {
    setListsStore(prev => ({ ...prev, lists: { ...prev.lists, [id]: { ...prev.lists[id], name } } }));
    axios.put(`/api/army-builder-lists/${id}`, { name }, clientIdHeader()).catch(err => console.error('Failed to rename list:', err));
  };

  const deleteList = async (id) => {
    const ids = Object.keys(listsStore.lists);
    if (ids.length <= 1) return;
    try {
      await axios.delete(`/api/army-builder-lists/${id}`, clientIdHeader());
    } catch (err) {
      console.error('Failed to delete list:', err);
      return;
    }
    const nextLists = { ...listsStore.lists };
    delete nextLists[id];
    let nextActiveId = activeListId;
    if (nextActiveId === id) {
      nextActiveId = Object.keys(nextLists)[0];
      try {
        const { data: full } = await axios.get(`/api/army-builder-lists/${nextActiveId}`);
        loadListIntoState(full.data);
        localStorage.setItem(LAST_ACTIVE_KEY, String(nextActiveId));
      } catch (err) {
        console.error('Failed to load list after delete:', err);
      }
    }
    setListsStore({ activeListId: nextActiveId, lists: nextLists });
  };

  // ── Filters (no enemy/friendly concept — this army is always "friendly") ──
  const FILTER_KEY = 'aos-army-builder-filters';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } })();

  const [search, setSearch]     = useState(saved.search   ?? '');
  const [alliance, setAlliance] = useState(saved.alliance ?? '');
  const [isHero, setIsHero]             = useState(saved.isHero       ?? false);
  const [isMonster, setIsMonster]       = useState(saved.isMonster    ?? false);
  const [isInfantry, setIsInfantry]     = useState(saved.isInfantry   ?? false);
  const [isCavalry, setIsCavalry]       = useState(saved.isCavalry    ?? false);
  const [isBeast, setIsBeast]           = useState(saved.isBeast      ?? false);
  const [isWarMachine, setIsWarMachine] = useState(saved.isWarMachine ?? false);
  const [isTerrain, setIsTerrain]       = useState(saved.isTerrain    ?? false);
  const [isManifestation, setIsManifestation] = useState(saved.isManifestation ?? false);
  const [hideLegends, setHideLegends]                 = useState(saved.hideLegends         ?? true);
  const [hideOtherFactions, setHideOtherFactions]     = useState(saved.hideOtherFactions   ?? false);
  const [hideScourgeOfGhyran, setHideScourgeOfGhyran] = useState(saved.hideScourgeOfGhyran ?? false);
  const [hideRoR, setHideRoR]                         = useState(saved.hideRoR             ?? false);
  const [sortBy, setSortBy]   = useState(saved.sortBy  ?? 'faction');
  const [sortDir, setSortDir] = useState(saved.sortDir ?? 'asc');

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({
      search, alliance, isHero, isMonster, isInfantry, isCavalry, isBeast, isWarMachine, isTerrain, isManifestation,
      hideLegends, hideOtherFactions, hideScourgeOfGhyran, hideRoR, sortBy, sortDir,
    }));
  }, [search, alliance, isHero, isMonster, isInfantry, isCavalry, isBeast, isWarMachine, isTerrain, isManifestation,
      hideLegends, hideOtherFactions, hideScourgeOfGhyran, hideRoR, sortBy, sortDir]);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [fullExpandedIds, setFullExpandedIds] = useState(new Set());
  const [detailUnit, setDetailUnit] = useState(null);
  const tableWrapperRef = useRef(null);

  const [searchInput, setSearchInput] = useState(saved.search ?? '');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchFactions = useCallback(async () => {
    try {
      const res = await axios.get('/api/factions');
      setFactions(res.data);
    } catch {}
  }, []);

  // Fetch every unit matching the non-faction filters — Faction is applied
  // client-side so we can partition into "this faction" + "Other Factions"
  // without a second round trip.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        search, alliance,
        sortBy: 'faction', sortDir: 'asc', page: 1, pageSize: 9999,
        ...(triParam(isHero)          ? { isHero:          triParam(isHero)          } : {}),
        ...(triParam(isMonster)       ? { isMonster:       triParam(isMonster)       } : {}),
        ...(triParam(isInfantry)      ? { isInfantry:      triParam(isInfantry)      } : {}),
        ...(triParam(isCavalry)       ? { isCavalry:       triParam(isCavalry)       } : {}),
        ...(triParam(isBeast)         ? { isBeast:         triParam(isBeast)         } : {}),
        ...(triParam(isWarMachine)    ? { isWarMachine:    triParam(isWarMachine)    } : {}),
        ...(triParam(isTerrain)       ? { isTerrain:       triParam(isTerrain)       } : {}),
        ...(triParam(isManifestation) ? { isManifestation: triParam(isManifestation) } : {}),
        ...(hideLegends         ? { isLegends: '0' }            : {}),
        ...(hideScourgeOfGhyran ? { hideScourgeOfGhyran: '1' }  : {}),
        ...(hideRoR             ? { hideRoR: '1' }              : {}),
      };
      const res = await axios.get('/api/warscrolls', { params });
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Session expired. Please sign out and log back in.');
      } else {
        setError('Failed to load warscrolls. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }, [search, alliance, isHero, isMonster, isInfantry, isCavalry, isBeast, isWarMachine, isTerrain, isManifestation,
      hideLegends, hideScourgeOfGhyran, hideRoR]);

  useEffect(() => { fetchFactions(); }, [fetchFactions]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Running dictionary of every unit we've ever seen, by id — keeps points
  // tallies and hero lists correct even as the visible filter set changes.
  const [unitsById, setUnitsById] = useState({});
  useEffect(() => {
    if (!data?.data) return;
    setUnitsById(prev => {
      const next = { ...prev };
      for (const u of data.data) next[u.id] = u;
      return next;
    });
  }, [data]);

  // ── Points tally ─────────────────────────────────────────────────────────
  const totalPoints = React.useMemo(() => {
    let sum = 0;
    for (const [id, sel] of Object.entries(roster)) {
      const unit = unitsById[id];
      if (!unit) continue;
      const pts = parseInt(unit.points, 10) || 0;
      sum += (sel.train || 0) * pts + (sel.reinforce || 0) * pts * 2;
    }
    return sum;
  }, [roster, unitsById]);

  // Both setters are purely functional (derive everything from `prev`, never
  // from the outer `roster` closure) so rapid consecutive calls — e.g. two
  // quick taps on a stepper +/- button before React re-renders — each see
  // the truly-latest count instead of both reading the same stale value and
  // silently colliding on the same "+1" result.
  const setUnitCount = (id, field, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setRoster(prev => {
      const next = { ...prev, [id]: { ...(prev[id] ?? { train: 0, reinforce: 0 }), [field]: n } };
      if ((next[id].train ?? 0) === 0 && (next[id].reinforce ?? 0) === 0) delete next[id];
      return next;
    });
  };
  const bumpUnitCount = (id, field, delta) => {
    setRoster(prev => {
      const prevSel = prev[id] ?? { train: 0, reinforce: 0 };
      const n = Math.max(0, (prevSel[field] || 0) + delta);
      const nextSel = { ...prevSel, [field]: n };
      const next = { ...prev };
      if ((nextSel.train || 0) + (nextSel.reinforce || 0) > 0) next[id] = nextSel;
      else delete next[id];
      return next;
    });
  };

  // Keeps rosterOrder (first-selected order, used to decide which Hero
  // becomes which regiment's General) in sync with roster — decoupled from
  // the setters above so it's correct regardless of which one touched
  // roster, or how many updates landed in the same batch.
  useEffect(() => {
    const curKeys = Object.keys(roster);
    const curSet = new Set(curKeys);
    setRosterOrder(prev => {
      const next = prev.filter(id => curSet.has(id));
      for (const id of curKeys) if (!next.includes(id)) next.push(id);
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [roster]);

  // Self-healing cleanup: Heroes/Manifestations/Faction Terrain can't be
  // reinforced (no reinforce field is shown for them anymore), but older
  // saved lists may still carry a leftover reinforce count from before that
  // restriction existed — clear it so points tallies stay correct.
  useEffect(() => {
    if (!Object.keys(unitsById).length) return;
    setRoster(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [id, sel] of Object.entries(prev)) {
        const unit = unitsById[id];
        if (!unit) continue;
        if ((unit.is_hero || unit.is_manifestation || unit.is_terrain) && (sel.reinforce || 0) > 0) {
          next[id] = { ...sel, reinforce: 0 };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [unitsById]);

  // ── Army Roster document — Commander/Notes are free-text; everything else
  // (Army Name, Faction, Points Limit, Battle Formation) mirrors live page
  // state directly rather than a second editable copy. Regiments/Auxiliary
  // Units are auto-populated from the actual roster selections: the first
  // selected Hero becomes Regiment 1's General, additional Heroes lead
  // Regiments 2-5, and non-Hero units fill each regiment's Unit slots in
  // order before overflowing into the next regiment, then Auxiliary Units.
  // Manifestations/Faction Terrain always land in Auxiliary Units. The user
  // can drag any placed unit to a different slot afterward — see the
  // reconcile effect below for how manual placements survive roster changes.
  const [rosterDocOpen, setRosterDocOpen] = useState(false);
  const [rosterPresentMode, setRosterPresentMode] = useState('replica');

  useEffect(() => {
    const heroInstances = [];
    const unitInstances = [];
    const auxOnlyInstances = [];
    for (const id of rosterOrder) {
      const sel = roster[id];
      const unit = unitsById[id];
      if (!sel || !unit) continue;
      if (unit.is_manifestation || unit.is_terrain) {
        if ((sel.train || 0) > 0) auxOnlyInstances.push(`${id}:train:0`);
        continue;
      }
      if (unit.is_hero) {
        for (let i = 0; i < (sel.train || 0); i++) heroInstances.push(`${id}:train:${i}`);
        continue;
      }
      for (let i = 0; i < (sel.train || 0); i++) unitInstances.push(`${id}:train:${i}`);
      for (let i = 0; i < (sel.reinforce || 0); i++) unitInstances.push(`${id}:reinforce:${i}`);
    }
    const validKeys = new Set([...heroInstances, ...unitInstances, ...auxOnlyInstances]);

    setArmyRosterDoc(doc => {
      const slots = (doc.slots && doc.slots.regiments?.length === REGIMENT_SLOTS.length)
        ? cloneSlots(doc.slots)
        : makeEmptySlots();

      // Drop placements for units no longer selected (count reduced to 0).
      slots.regiments.forEach(r => {
        if (r.general && !validKeys.has(r.general)) r.general = null;
        r.units = r.units.map(u => (u && !validKeys.has(u)) ? null : u);
      });
      slots.aux = slots.aux.map(a => (a && !validKeys.has(a)) ? null : a);

      const isPlaced = key => {
        for (const r of slots.regiments) { if (r.general === key || r.units.includes(key)) return true; }
        return slots.aux.includes(key);
      };
      const placeInAux = key => {
        const emptyIdx = slots.aux.findIndex(a => a === null);
        if (emptyIdx !== -1) slots.aux[emptyIdx] = key;
        else slots.aux.push(key); // overflow beyond the printed sheet's 5 slots
      };

      for (const key of heroInstances) {
        if (isPlaced(key)) continue;
        const target = slots.regiments.find(r => r.general === null);
        if (target) target.general = key; else placeInAux(key);
      }
      for (const key of unitInstances) {
        if (isPlaced(key)) continue;
        let placed = false;
        for (const r of slots.regiments) {
          const emptyIdx = r.units.findIndex(u => u === null);
          if (emptyIdx !== -1) { r.units[emptyIdx] = key; placed = true; break; }
        }
        if (!placed) placeInAux(key);
      }
      for (const key of auxOnlyInstances) {
        if (isPlaced(key)) continue;
        placeInAux(key);
      }

      if (JSON.stringify(slots) === JSON.stringify(doc.slots)) return doc;
      return { ...doc, slots };
    });
  }, [roster, rosterOrder, unitsById]);

  const moveToSlot = (sourceKey, targetRef) => {
    setArmyRosterDoc(d => ({ ...d, slots: swapIntoSlot(d.slots, sourceKey, targetRef) }));
  };

  const regimentsTotal = armyRosterDoc.slots.regiments.reduce((sum, r) => {
    const generalPts = r.general ? instancePoints(r.general, unitsById) : 0;
    const unitsPts = r.units.reduce((s, u) => s + (u ? instancePoints(u, unitsById) : 0), 0);
    return sum + generalPts + unitsPts;
  }, 0);
  const auxTotal = armyRosterDoc.slots.aux.reduce((sum, u) => sum + (u ? instancePoints(u, unitsById) : 0), 0);
  const armyUnitsTotal = regimentsTotal + auxTotal;

  // ── Faction-rules cache, shared by Battle Formation + hero-assignment stages ──
  const rulesCache = useRef({});
  // Value itself is unused — this state's only job is to force a re-render
  // once a faction-rules fetch resolves, so components re-read rulesCache.current fresh.
  const [, setLoadedSlugs] = useState(new Set());
  const selectedHeroes = React.useMemo(() => {
    return Object.entries(roster)
      .filter(([, sel]) => (sel.train || 0) > 0 || (sel.reinforce || 0) > 0)
      .map(([id]) => unitsById[id])
      .filter(u => u && u.is_hero);
  }, [roster, unitsById]);

  const slugsNeeded = React.useMemo(() => {
    const s = new Set(selectedHeroes.map(h => h.faction_slug));
    if (faction) s.add(faction);
    return [...s].filter(Boolean);
  }, [selectedHeroes, faction]);

  useEffect(() => {
    slugsNeeded.forEach(slug => {
      if (rulesCache.current[slug]) return;
      rulesCache.current[slug] = null; // placeholder so we don't double-fetch
      axios.get(`/api/faction-rules/${slug}`)
        .then(r => { rulesCache.current[slug] = r.data; setLoadedSlugs(prev => new Set([...prev, slug])); })
        .catch(() => { rulesCache.current[slug] = { formations: [], heroic_traits: [], artefacts: [], spell_lore: [], prayer_lore: [], manifestation_lore: [] }; setLoadedSlugs(prev => new Set([...prev, slug])); });
    });
  }, [slugsNeeded]);

  const handleSort = (col, e, reset = false) => {
    if (reset || (e && e.ctrlKey)) {
      setSortBy('faction'); setSortDir('asc');
    } else if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(['control','move','unit_size','points','health'].includes(col) ? 'desc' : 'asc');
    }
  };
  const colLongPress = useColumnLongPress(
    colKey => handleSort(colKey, null, true),
    (colKey, e) => handleSort(colKey, e)
  );

  // ── Column resizing — mirrors WarscrollsPage's colWidths/thStyle/startResize
  // pattern so this table's proportions match the main Warscrolls page. Train/
  // Reinforce are sized just wide enough for their header text + the count
  // input (not the equal-share width they got with no explicit widths set),
  // and Keywords is 3x the Warscrolls default so more keywords fit per line
  // (shorter, less-wrapped rows). ──────────────────────────────────────────
  const DEFAULT_COL_WIDTHS = {
    rownum: 22, train: 72, reinforce: 80, expand: 22, thumb: 44,
    name: 190, faction: 110, alliance: 66, models: 42,
    move: 42, health: 42, control: 42, save: 42, ward: 38, points: 48,
    types: 68, keywords: 390,
    ado_ranged: 54, ado_melee: 54,
  };
  const COL_WIDTHS_KEY = 'aos-army-builder-col-widths-v1';
  const [colWidths, setColWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem(COL_WIDTHS_KEY)) }; }
    catch { return DEFAULT_COL_WIDTHS; }
  });
  const dragRef = useRef(null);

  const startResize = useCallback((e, colKey) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colKey];
    dragRef.current = { colKey, startX, startW };

    const onMove = (ev) => {
      const { colKey: k, startX: sx, startW: sw } = dragRef.current;
      const newW = Math.max(20, sw + ev.clientX - sx);
      setColWidths(prev => {
        const next = { ...prev, [k]: newW };
        localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(next));
        return next;
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const thStyle = (key) => ({ width: colWidths[key], position: 'relative' });

  const alliances = ['Order', 'Chaos', 'Death', 'Destruction'];
  const filteredFactions = (alliance ? factions.filter(f => f.grand_alliance === alliance) : factions)
    .slice().sort((a, b) => a.faction.localeCompare(b.faction));

  const factionName = factions.find(f => f.faction_slug === faction)?.faction ?? '';

  // ── Client-side sort + own-faction/other-factions split ────────────────────
  const sortRows = (rows) => {
    const sorted = rows.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (['points','unit_size','move','health','control','save','ward'].includes(sortBy)) {
        av = parseInt(av, 10) || 0; bv = parseInt(bv, 10) || 0;
      } else {
        av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  };

  const allRows = data?.data ?? [];
  const ownRows   = faction ? sortRows(allRows.filter(r => r.faction_slug === faction)) : sortRows(allRows);
  const otherRows = (faction && !hideOtherFactions) ? sortRows(allRows.filter(r => r.faction_slug !== faction)) : [];
  const navList = [...ownRows, ...otherRows];

  const [navbarExtrasEl, setNavbarExtrasEl] = useState(null);
  useEffect(() => {
    setNavbarExtrasEl(headerCollapsed ? document.getElementById('navbar-extras') : null);
  }, [headerCollapsed]);

  const renderUnitRow = (row, rowNum, prev, forceTypeSep) => {
    const isExpanded = expandedIds.has(row.id);
    const isFullExpanded = fullExpandedIds.has(row.id);
    const weapons = (() => { try { return JSON.parse(row.weapons || '[]'); } catch { return []; } })();
    const save = includeSaveWardInADO ? (presumedSave ?? 5) : 7;
    const ward = includeSaveWardInADO ? (presumedWard ?? null) : null;
    const resolved = resolveWeaponLoadout(weapons, row.options_text, row.unit_size, save, ward, roundingMode);
    const resolvedWeapons = resolved ?? weapons;
    const hasSpecialADO = resolved !== null;
    const ranged = resolvedWeapons.filter(w => w.type === 'ranged');
    const melee  = resolvedWeapons.filter(w => w.type === 'melee');
    const adoRanged = sumADO(ranged, row.unit_size, save, ward, roundingMode);
    const adoMelee  = sumADO(melee,  row.unit_size, save, ward, roundingMode);
    const typeChanged = forceTypeSep || !prev || unitTypeLabel(prev) !== unitTypeLabel(row) || prev.faction_slug !== row.faction_slug;
    const sel = roster[row.id] ?? { train: 0, reinforce: 0 };
    return (
      <React.Fragment key={row.id}>
        {typeChanged && (
          <tr className="separator-type">
            <td colSpan={19}>{unitTypeLabel(row)}</td>
          </tr>
        )}
        <tr
          className={`unit-row${(isExpanded || isFullExpanded) ? ' expanded' : ''}${isFullExpanded ? ' full-expanded' : ''}${detailUnit?.id === row.id ? ' active-detail' : ''}`}
          data-unit-id={row.id}
          onClick={() => {
            if (isFullExpanded) { setFullExpandedIds(prev2 => { const s = new Set(prev2); s.delete(row.id); return s; }); return; }
            setExpandedIds(prev2 => { const s = new Set(prev2); isExpanded ? s.delete(row.id) : s.add(row.id); return s; });
          }}
          onContextMenu={e => {
            e.preventDefault();
            if (isFullExpanded) { setFullExpandedIds(prev2 => { const s = new Set(prev2); s.delete(row.id); return s; }); return; }
            setExpandedIds(prev2 => { const s = new Set(prev2); s.delete(row.id); return s; });
            setFullExpandedIds(prev2 => { const s = new Set(prev2); s.add(row.id); return s; });
          }}
          style={{ cursor: 'pointer' }}
        >
          <td className="col-rownum">{rowNum}</td>
          {row.is_manifestation || row.is_terrain ? (
            <td className="col-count ab-count-checkbox-cell" colSpan={2} onClick={e => e.stopPropagation()} title="Manifestations and Faction Terrain can't be reinforced — just whether you have it">
              <input
                type="checkbox"
                checked={(sel.train || 0) > 0}
                onChange={e => setUnitCount(row.id, 'train', e.target.checked ? 1 : 0)}
              />
            </td>
          ) : (
            <>
              <td className="col-count" onClick={e => e.stopPropagation()}>
                <div className="ab-count-stepper">
                  <button type="button" className="ab-count-btn ab-count-btn-minus" onClick={() => bumpUnitCount(row.id, 'train', -1)}>−</button>
                  <span className="ab-count-value">{sel.train || 0}</span>
                  <button type="button" className="ab-count-btn ab-count-btn-plus" onClick={() => bumpUnitCount(row.id, 'train', 1)}>+</button>
                </div>
              </td>
              <td className="col-count" onClick={e => e.stopPropagation()}>
                {row.is_hero ? (
                  <span className="ab-count-na" title="Heroes can't be reinforced">—</span>
                ) : (
                  <div className="ab-count-stepper">
                    <button type="button" className="ab-count-btn ab-count-btn-minus" onClick={() => bumpUnitCount(row.id, 'reinforce', -1)}>−</button>
                    <span className="ab-count-value">{sel.reinforce || 0}</span>
                    <button type="button" className="ab-count-btn ab-count-btn-plus" onClick={() => bumpUnitCount(row.id, 'reinforce', 1)}>+</button>
                  </div>
                )}
              </td>
            </>
          )}
          <td>
            <span className="row-expand-hint">{isFullExpanded ? '◆' : isExpanded ? '▲' : '▼'}</span>
          </td>
          <td className="col-name" onClick={e => { e.stopPropagation(); setDetailUnit(row); }}>
            <span className="unit-name-link">{row.name}</span>
          </td>
          <td className="col-thumb">
            <img
              src={`${axios.defaults.baseURL || ''}/api/unit-image/${row.id}`}
              alt="" className="thumb-img" loading="lazy"
              onClick={e => e.stopPropagation()}
              onError={e => { e.target.style.display = 'none'; }}
            />
          </td>
          <td className="col-faction">{row.faction}</td>
          <td>{row.grand_alliance && <AllianceBadge alliance={row.grand_alliance} />}</td>
          <td className="col-stat">{row.points || '—'}</td>
          <td className="col-stat">{row.unit_size || '—'}</td>
          <td className="col-stat stat-group stat-group-start">{row.move || '—'}</td>
          <td className="col-stat stat-group">{row.health || '—'}</td>
          <td className="col-stat stat-group">{row.control || '—'}</td>
          <td className="col-stat stat-group">{row.save || '—'}</td>
          <td className="col-stat col-ward">{row.ward || '—'}</td>
          <td><TypeTags row={row} /></td>
          <td className="col-keywords">{row.keywords ? row.keywords.split(',').slice(0, 6).join(', ') : '—'}</td>
          <td className="col-ado">{adoRanged !== null ? `${adoRanged}${hasSpecialADO ? '*' : ''}` : '—'}</td>
          <td className="col-ado">{adoMelee  !== null ? `${adoMelee}${hasSpecialADO ? '*' : ''}` : '—'}</td>
        </tr>
        {(isExpanded || isFullExpanded) && (
          <tr className="weapons-expand-row">
            <td colSpan={19}>
              <div className="weapons-expand-inner" onClick={e => e.stopPropagation()}>
                {weapons.length === 0 && <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No weapon data available.</span>}
                {ranged.length > 0 && (
                  <div className="inline-weapon-block">
                    <div className="inline-weapon-section-header">⊕ Ranged Weapons</div>
                    <table className="inline-weapon-table">
                      <thead><tr>
                        <th className="iwt-th-name">Weapon</th>
                        <th className="iwt-th-stat">Rng</th><th className="iwt-th-stat">Atk</th><th className="iwt-th-stat">Hit</th><th className="iwt-th-stat">Wnd</th><th className="iwt-th-stat">Rnd</th><th className="iwt-th-stat">Dmg</th>
                        <th className="iwt-th-ability">Ability</th>
                      </tr></thead>
                      <tbody>
                        {ranged.map((w, i) => (
                          <tr key={i}>
                            <td className="iwt-td-name">{w.name}</td>
                            <td className="iwt-td-stat">{w.range}</td><td className="iwt-td-stat">{w.attacks}</td>
                            <td className="iwt-td-stat">{w.hit}</td><td className="iwt-td-stat">{w.wound}</td>
                            <td className="iwt-td-stat">{w.rend || '—'}</td><td className="iwt-td-stat">{w.damage}</td>
                            <td className="iwt-td-ability">{w.ability || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {melee.length > 0 && (
                  <div className="inline-weapon-block">
                    <div className="inline-weapon-section-header">✕ Melee Weapons</div>
                    <table className="inline-weapon-table">
                      <thead><tr>
                        <th className="iwt-th-name">Weapon</th>
                        <th className="iwt-th-stat">Atk</th><th className="iwt-th-stat">Hit</th><th className="iwt-th-stat">Wnd</th><th className="iwt-th-stat">Rnd</th><th className="iwt-th-stat">Dmg</th>
                        <th className="iwt-th-ability">Ability</th>
                      </tr></thead>
                      <tbody>
                        {melee.map((w, i) => (
                          <tr key={i}>
                            <td className="iwt-td-name">{w.name}</td>
                            <td className="iwt-td-stat">{w.attacks}</td>
                            <td className="iwt-td-stat">{w.hit}</td><td className="iwt-td-stat">{w.wound}</td>
                            <td className="iwt-td-stat">{w.rend || '—'}</td><td className="iwt-td-stat">{w.damage}</td>
                            <td className="iwt-td-ability">{w.ability || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <>
    <div className="table-page ab-page">
      <div className="page-header ab-page-header">
        <div className="page-title">
          Army Builder
          <span>Age of Sigmar 4th Edition</span>
        </div>

        <div className="ab-header-cell ab-header-list">
          <ListManager
            listsStore={listsStore}
            activeListId={activeListId}
            onSelect={selectList}
            onCreate={createList}
            onDuplicate={duplicateList}
            onRename={renameList}
            onDelete={deleteList}
          />
        </div>

        <div className="ab-header-cell ab-header-stages">
          <div className="ab-stage-tabs">
            {STAGES.map(s => (
              <button
                key={s.key}
                className={`ab-stage-tab${activeStage === s.key ? ' active' : ''}`}
                onClick={() => setActiveStage(s.key)}
              >{s.label}</button>
            ))}
          </div>
        </div>

        <div className="ab-header-cell ab-header-roster">
          <ArmyRosterThumb onClick={() => setRosterDocOpen(true)} />
          <div className="ab-roster-thumb-label">Army Roster</div>
        </div>

        <div className="ab-points-block">
          <div className="ab-points-label">Points</div>
          <div className="ab-points-value">
            <span className={`ab-points-current${totalPoints > pointsLimit ? ' ab-points-over' : ''}`}>{totalPoints.toLocaleString()}</span>
            <span className="ab-points-sep">/</span>
            <input
              type="number" min="0" className="ab-points-limit-input"
              value={pointsLimit}
              onChange={e => setPointsLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
        </div>
      </div>

      {activeStage === 'units' && (
        <>
        {!headerCollapsed && (
        <div className="filters">
          <div className="filter-group">
            <div className="filter-label">Search</div>
            <input
              className="filter-input" type="text" placeholder="Name, faction, keyword…"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <div className="filter-label">Grand Alliance</div>
            <select className="filter-select" value={alliance} onChange={e => { setAlliance(e.target.value); setFaction(''); }}>
              <option value="">All Alliances</option>
              {alliances.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <div className="filter-label">Faction</div>
            <FactionDropdown factions={filteredFactions} value={faction} onChange={setFaction} />
          </div>
          <div className="filter-checkboxes">
            <div className="cb-group cb-group-center">
              <div className="cb-group-header">Filter:</div>
              <TriCheckbox value={isHero}          onChange={setIsHero}          label="Heroes"         />
              <TriCheckbox value={isInfantry}      onChange={setIsInfantry}      label="Infantry"       />
              <TriCheckbox value={isCavalry}       onChange={setIsCavalry}       label="Cavalry"        />
              <TriCheckbox value={isBeast}         onChange={setIsBeast}         label="Beast"          />
              <TriCheckbox value={isMonster}       onChange={setIsMonster}       label="Monsters"       />
              <TriCheckbox value={isWarMachine}    onChange={setIsWarMachine}    label="War Machine"    />
              <TriCheckbox value={isTerrain}       onChange={setIsTerrain}       label="Faction Terrain"/>
              <TriCheckbox value={isManifestation} onChange={setIsManifestation} label="Manifestation"  />
            </div>
            <div className="cb-group cb-group-right">
              <div className="cb-group-header">Hide:</div>
              <label className="cb-item">
                <input type="checkbox" checked={hideScourgeOfGhyran} onChange={e => setHideScourgeOfGhyran(e.target.checked)} />
                <span>Scourge</span>
              </label>
              <label className="cb-item">
                <input type="checkbox" checked={hideOtherFactions} onChange={e => setHideOtherFactions(e.target.checked)} />
                <span>Other Factions</span>
              </label>
              <label className="cb-item">
                <input type="checkbox" checked={hideRoR} onChange={e => setHideRoR(e.target.checked)} />
                <span>Regiments of Renown</span>
              </label>
              <label className="cb-item">
                <input type="checkbox" checked={hideLegends} onChange={e => setHideLegends(e.target.checked)} />
                <span>Legends</span>
              </label>
            </div>
          </div>
        </div>
        )}

        {error && (
          <div className="error-msg" style={{ marginBottom: '1rem' }}>
            {error.includes('expired')
              ? <>{error.replace('Please sign out and log back in.', '')} <button className="error-logout-link" onClick={logout}>Sign out and log back in.</button></>
              : error}
          </div>
        )}

        {loading ? (
          <div className="loading-state"><span className="loading-rune">⚙</span>Consulting the Grand Conclave…</div>
        ) : allRows.length === 0 ? (
          <div className="empty-state">No warscrolls found. Try adjusting your filters.</div>
        ) : (
          <div className="table-wrapper" ref={tableWrapperRef}>
            <table>
              <thead>
                <tr>
                  <th style={{ ...thStyle('rownum'), textAlign: 'right' }} title="Row number">
                    <span className="th-abbr" style={{ color: 'var(--text-dim)' }}>#</span>
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'rownum')} />
                  </th>
                  <th className="ab-count-th" style={thStyle('train')} title="Units at standard size/points">
                    Units
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'train')} />
                  </th>
                  <th className="ab-count-th" style={thStyle('reinforce')} title="Units at double models / double points">
                    Reinf.
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'reinforce')} />
                  </th>
                  <th style={thStyle('expand')}>
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'expand')} />
                  </th>
                  {SORTABLE_COLS.map(col => {
                    const keyMap = { name: 'name', faction: 'faction', grand_alliance: 'alliance', move: 'move', health: 'health', control: 'control', save: 'save', ward: 'ward', points: 'points', unit_size: 'models' };
                    const wKey = keyMap[col.key] || col.key;
                    return (
                      <React.Fragment key={col.key}>
                        <th
                          style={thStyle(wKey)}
                          className={`sortable${col.statGroup === 'start' ? ' stat-group stat-group-start' : col.statGroup === 'end' ? ' stat-group stat-group-end' : col.statGroup ? ' stat-group' : ''}${col.key === 'ward' ? ' col-ward' : ''} ${sortBy === col.key ? 'sort-active' : ''}`}
                          title={col.abbr ? col.label : undefined}
                          onClick={e => colLongPress.click(col.key, e)}
                          onContextMenu={e => { e.preventDefault(); handleSort(col.key, e, true); }}
                          onTouchStart={() => colLongPress.start(col.key)}
                          onTouchEnd={colLongPress.cancel}
                          onTouchMove={colLongPress.cancel}
                        >
                          {col.abbr ? <span className="th-abbr">{col.abbr}</span> : col.label}
                          <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                          <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e, wKey); }} />
                        </th>
                        {col.key === 'name' && (
                          <th style={thStyle('thumb')}>
                            <span className="col-resize-handle" onMouseDown={e => startResize(e, 'thumb')} />
                          </th>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <th style={thStyle('types')}>
                    Types
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'types')} />
                  </th>
                  <th style={thStyle('keywords')}>
                    Keywords
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'keywords')} />
                  </th>
                  <th style={{ ...thStyle('ado_ranged'), textAlign: 'center' }}>
                    ADO-R
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'ado_ranged')} />
                  </th>
                  <th style={{ ...thStyle('ado_melee'), textAlign: 'center' }}>
                    ADO-M
                    <span className="col-resize-handle" onMouseDown={e => startResize(e, 'ado_melee')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {ownRows.map((row, idx) => renderUnitRow(row, idx + 1, ownRows[idx - 1], false))}
                {faction && otherRows.length > 0 && (
                  <tr className="separator-other-factions">
                    <td colSpan={19}>Other Factions</td>
                  </tr>
                )}
                {otherRows.map((row, idx) => {
                  const prevRow = idx === 0 ? null : otherRows[idx - 1];
                  const factionSep = idx === 0 || prevRow.faction_slug !== row.faction_slug;
                  return (
                    <React.Fragment key={row.id}>
                      {factionSep && (
                        <tr className="separator-faction"><td colSpan={19}>{row.faction}</td></tr>
                      )}
                      {renderUnitRow(row, ownRows.length + idx + 1, prevRow, factionSep)}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </>
      )}

      {activeStage === 'formation' && (
        <div className="ab-stage-body">
          <BattleFormationStage
            hasFaction={!!faction}
            factionName={factionName}
            rules={faction ? rulesCache.current[faction] : null}
            battleFormation={battleFormation}
            setBattleFormation={setBattleFormation}
          />
        </div>
      )}

      {STAGES.filter(s => s.section).map(s => activeStage === s.key && (
        <div className="ab-stage-body" key={s.key}>
          <HeroAssignmentStage
            label={s.label}
            sectionKey={s.section}
            selectedHeroes={selectedHeroes}
            rulesCache={rulesCache.current}
            heroAssignments={heroAssignments}
            setHeroAssignments={setHeroAssignments}
          />
        </div>
      ))}
    </div>

    {detailUnit && (() => {
      const idx = navList.findIndex(u => u.id === detailUnit.id);
      return (
        <WarscrollGW
          unit={detailUnit}
          factions={factions}
          navIndex={idx}
          navList={navList}
          sortBy={sortBy}
          onClose={() => setDetailUnit(null)}
          onPrev={() => { if (idx > 0) setDetailUnit(navList[idx - 1]); }}
          onNext={() => { if (idx < navList.length - 1) setDetailUnit(navList[idx + 1]); }}
          onJump={i => setDetailUnit(navList[i])}
        />
      );
    })()}

    {rosterDocOpen && (
      <ArmyRosterModal
        onClose={() => setRosterDocOpen(false)}
        presentMode={rosterPresentMode}
        setPresentMode={setRosterPresentMode}
        listName={listsStore.lists[activeListId]?.name ?? 'List name…'}
        factionName={factionName}
        pointsLimit={pointsLimit}
        setPointsLimit={setPointsLimit}
        battleFormation={battleFormation}
        totalPoints={totalPoints}
        doc={armyRosterDoc}
        setDoc={setArmyRosterDoc}
        unitsById={unitsById}
        moveToSlot={moveToSlot}
        regimentsTotal={regimentsTotal}
        auxTotal={auxTotal}
        armyUnitsTotal={armyUnitsTotal}
      />
    )}
    </>
  );
}
