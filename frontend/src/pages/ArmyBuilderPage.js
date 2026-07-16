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

// Guest/Regiments-of-Renown units are bucketed under a faction_slug on
// Wahapedia without being core to that faction — detected the same way
// the backend's hideOtherFactions filter does (empty keywords, or keywords
// that don't mention the faction's own distinctive name), but applied
// client-side per-row since Army Builder fetches every faction in one query.
const FACTION_SKIP_WORDS = new Set(['of', 'the', 'to', 'and']);
function getFactionDistinctWord(slug) {
  return (slug || '')
    .split('-')
    .filter(w => !FACTION_SKIP_WORDS.has(w) && w.length > 2)
    .map(w => w.toUpperCase())[0];
}
function isGuestOfFaction(row) {
  if (!row.keywords) return true;
  const word = getFactionDistinctWord(row.faction_slug);
  if (!word) return false;
  return row.keywords.toUpperCase().indexOf(word) === -1;
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
function BattleFormationStage({ factionName, rules, battleFormation, setBattleFormation, hasFaction }) {
  if (!hasFaction) return <div className="ab-stage-empty">Pick a Faction on the Select Units stage first.</div>;
  if (!rules) return <div className="ab-stage-empty">Loading…</div>;
  const groups = [];
  const byName = {};
  for (const item of rules.formations ?? []) {
    const gName = item.formation_name || 'General';
    if (!byName[gName]) { byName[gName] = { name: gName, items: [] }; groups.push(byName[gName]); }
    byName[gName].items.push(item);
  }
  if (groups.length === 0) return <div className="ab-stage-empty">No Battle Formations found for {factionName}.</div>;
  return (
    <div className="ab-formation-list">
      {groups.map((g, gi) => (
        <label key={gi} className={`ab-formation-option${battleFormation === g.name ? ' selected' : ''}`}>
          <input
            type="radio"
            name="battle-formation"
            checked={battleFormation === g.name}
            onChange={() => setBattleFormation(g.name)}
          />
          <div className="ab-formation-option-body">
            <div className="ab-formation-option-name">{g.name}</div>
            <div className="gw-abilities-grid gw-sp-grid-2col">
              {g.items.map((ab, i) => <AbilityCard key={i} ab={{ ...ab, bullets: parseBullets(ab.bullets) }} keywords={[]} />)}
            </div>
          </div>
        </label>
      ))}
    </div>
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

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setRenamingId(null); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const ids = Object.keys(listsStore.lists);
  const activeName = listsStore.lists[activeListId]?.name ?? 'Default List';

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
                  className="ab-list-rename-input"
                  autoFocus
                  value={renameValue}
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

function ArmyRosterModal({
  onClose, presentMode, setPresentMode,
  factionName, pointsLimit, battleFormation, totalPoints,
  doc, setDoc,
  addRegiment, removeRegiment, addRegimentUnit, updateRegimentUnit, removeRegimentUnit,
  addAuxUnit, updateAuxUnit, removeAuxUnit,
  regimentsTotal, auxTotal, armyUnitsTotal,
}) {
  const modalRef = useRef(null);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <>
      <div className="gw-overlay" onClick={onClose} />
      <div className="ptg-wizard" ref={modalRef} role="dialog" aria-modal="true" aria-label="Army Roster">
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>
        <div className="ptg-doc-editor-header">
          <div className="ptg-doc-editor-title">Army Roster</div>
          <div className="ptg-present-toggle">
            <button className={presentMode === 'image' ? 'ptg-present-active' : ''} onClick={() => setPresentMode('image')}>Image</button>
            <button className={presentMode === 'replica' ? 'ptg-present-active' : ''} onClick={() => setPresentMode('replica')}>Replica</button>
          </div>
        </div>

        <div className="ptg-doc-editor-body">
          {presentMode === 'image' ? (
            <div className="ptg-doc-image-view">
              <ProgressiveImg src="/ptg/army-roster-1.jpg" micro={ARMY_ROSTER_MICRO.page1} avgColor={ARMY_ROSTER_AVG_COLOR.page1} alt="Army Roster page 1" className="ptg-doc-full-img" />
              <ProgressiveImg src="/ptg/army-roster-2.jpg" micro={ARMY_ROSTER_MICRO.page2} avgColor={ARMY_ROSTER_AVG_COLOR.page2} alt="Army Roster page 2" className="ptg-doc-full-img" />
            </div>
          ) : (
            <>
              <div className="ptg-army-header-grid">
                <div className="ptg-field ptg-army-commander"><label>Commander</label><input type="text" value={doc.commander} onChange={e => setDoc(d => ({ ...d, commander: e.target.value }))} /></div>
                <div className="ptg-field ptg-army-name"><label>Army Name</label><input type="text" value={doc.armyName} onChange={e => setDoc(d => ({ ...d, armyName: e.target.value }))} /></div>
                <div className="ptg-field ptg-army-points-limit"><label>Points Limit</label><input type="text" value={`${totalPoints.toLocaleString()} / ${pointsLimit}`} readOnly /></div>
                <div className="ptg-field ptg-army-faction"><label>Faction</label><input type="text" value={factionName || '—'} readOnly /></div>
                <div className="ptg-field ptg-army-formation"><label>Battle Formation</label><input type="text" value={battleFormation || '—'} readOnly /></div>
              </div>

              {doc.regiments.map((r, ri) => (
                <div className="ptg-regiment-block" key={r.id}>
                  <div className="ptg-regiment-header">
                    <span>{ri === 0 ? "General's Regiment 1" : `Regiment ${ri + 1}`}</span>
                    {doc.regiments.length > 1 && <button className="ptg-oob-row-remove" onClick={() => removeRegiment(r.id)} title="Remove regiment">✕</button>}
                  </div>
                  <div className="ptg-regiment-table-head">
                    <span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span><span />
                  </div>
                  {r.units.map(u => (
                    <div className="ptg-regiment-table-row" key={u.id}>
                      <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'name', e.target.value)} />
                      <input placeholder="Size" value={u.size || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'size', e.target.value)} />
                      <input placeholder="Notes" value={u.notes || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'notes', e.target.value)} />
                      <input placeholder="Pts" value={u.points || ''} onChange={e => updateRegimentUnit(r.id, u.id, 'points', e.target.value)} />
                      <button className="ptg-oob-row-remove" onClick={() => removeRegimentUnit(r.id, u.id)} title="Remove unit">✕</button>
                    </div>
                  ))}
                  <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addRegimentUnit(r.id)}>+ Add Unit</button>
                </div>
              ))}
              <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={addRegiment}>+ Add Regiment</button>
              <div className="ptg-oob-cap">Regiments Total: {regimentsTotal}pts</div>

              <div className="ptg-regiment-block">
                <div className="ptg-regiment-header"><span>Auxiliary Units</span></div>
                <div className="ptg-regiment-table-head">
                  <span>Warscroll Name</span><span>Size</span><span>Notes</span><span>Points</span><span />
                </div>
                {doc.auxUnits.map(u => (
                  <div className="ptg-regiment-table-row" key={u.id}>
                    <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateAuxUnit(u.id, 'name', e.target.value)} />
                    <input placeholder="Size" value={u.size || ''} onChange={e => updateAuxUnit(u.id, 'size', e.target.value)} />
                    <input placeholder="Notes" value={u.notes || ''} onChange={e => updateAuxUnit(u.id, 'notes', e.target.value)} />
                    <input placeholder="Pts" value={u.points || ''} onChange={e => updateAuxUnit(u.id, 'points', e.target.value)} />
                    <button className="ptg-oob-row-remove" onClick={() => removeAuxUnit(u.id)} title="Remove unit">✕</button>
                  </div>
                ))}
                <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={addAuxUnit}>+ Add Unit</button>
              </div>
              <div className="ptg-oob-cap">Auxiliary Units Total: {auxTotal}pts</div>
              <div className="ptg-oob-cap"><strong>Units Total: {armyUnitsTotal}pts</strong></div>

              <div className="ptg-field"><label>Notes</label><textarea rows={3} value={doc.notes} onChange={e => setDoc(d => ({ ...d, notes: e.target.value }))} /></div>
            </>
          )}
        </div>
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
  // slot (see the effect further down) — so switching lists never loses
  // in-progress edits on the list you're leaving.
  const LISTS_KEY = 'aos-army-builder-lists-v1';
  const LEGACY_ARMY_KEY = 'aos-army-builder-v1'; // pre-multi-list save, migrated once below

  function makeBlankArmyRosterDoc() {
    return { commander: '', armyName: '', regiments: [{ id: 'r1', units: [] }], auxUnits: [], notes: '' };
  }

  function makeBlankList(name) {
    return { name, faction: '', pointsLimit: 2000, roster: {}, battleFormation: '', heroAssignments: {}, activeStage: 'units', armyRosterDoc: makeBlankArmyRosterDoc() };
  }

  const [listsStore, setListsStore] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LISTS_KEY));
      if (raw && raw.lists && Object.keys(raw.lists).length > 0) return raw;
    } catch {}
    let legacy = {};
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_ARMY_KEY)) || {}; } catch {}
    return {
      activeListId: 'default',
      lists: {
        default: {
          name: 'Default List',
          faction: legacy.faction ?? '',
          pointsLimit: legacy.pointsLimit ?? 2000,
          roster: legacy.roster ?? {},
          battleFormation: legacy.battleFormation ?? '',
          heroAssignments: legacy.heroAssignments ?? {},
          activeStage: legacy.activeStage ?? 'units',
          armyRosterDoc: legacy.armyRosterDoc ?? makeBlankArmyRosterDoc(),
        },
      },
    };
  });
  const activeListId = listsStore.activeListId;
  const activeListData = listsStore.lists[activeListId] ?? makeBlankList('Default List');

  const [faction, setFaction]         = useState(activeListData.faction);
  const [pointsLimit, setPointsLimit] = useState(activeListData.pointsLimit);
  const [roster, setRoster]           = useState(activeListData.roster); // { [unitId]: { train, reinforce } }
  const [battleFormation, setBattleFormation] = useState(activeListData.battleFormation);
  const [heroAssignments, setHeroAssignments] = useState(activeListData.heroAssignments); // { [heroId]: { heroic_traits, artefacts, spell_lore, prayer_lore, manifestation_lore } }
  const [activeStage, setActiveStage] = useState(activeListData.activeStage);
  const [armyRosterDoc, setArmyRosterDoc] = useState(activeListData.armyRosterDoc ?? makeBlankArmyRosterDoc());

  useEffect(() => {
    setListsStore(prev => {
      const next = {
        ...prev,
        lists: {
          ...prev.lists,
          [prev.activeListId]: { ...prev.lists[prev.activeListId], faction, pointsLimit, roster, battleFormation, heroAssignments, activeStage, armyRosterDoc },
        },
      };
      localStorage.setItem(LISTS_KEY, JSON.stringify(next));
      return next;
    });
  }, [faction, pointsLimit, roster, battleFormation, heroAssignments, activeStage, armyRosterDoc]);

  const loadListIntoState = (list) => {
    setFaction(list.faction ?? '');
    setPointsLimit(list.pointsLimit ?? 2000);
    setRoster(list.roster ?? {});
    setBattleFormation(list.battleFormation ?? '');
    setHeroAssignments(list.heroAssignments ?? {});
    setActiveStage(list.activeStage ?? 'units');
    setArmyRosterDoc(list.armyRosterDoc ?? makeBlankArmyRosterDoc());
  };

  const selectList = (id) => {
    const target = listsStore.lists[id];
    if (!target || id === activeListId) return;
    setListsStore({ ...listsStore, activeListId: id });
    loadListIntoState(target);
  };

  const createList = () => {
    const id = `list-${Date.now()}`;
    const blank = makeBlankList(`New List ${Object.keys(listsStore.lists).length + 1}`);
    setListsStore({ activeListId: id, lists: { ...listsStore.lists, [id]: blank } });
    loadListIntoState(blank);
  };

  const duplicateList = (id) => {
    const src = listsStore.lists[id];
    if (!src) return;
    const newId = `list-${Date.now()}`;
    const srcDoc = src.armyRosterDoc ?? makeBlankArmyRosterDoc();
    const clone = {
      ...src, name: `${src.name} (Copy)`, roster: { ...src.roster }, heroAssignments: { ...src.heroAssignments },
      armyRosterDoc: {
        ...srcDoc,
        regiments: srcDoc.regiments.map(r => ({ ...r, units: r.units.map(u => ({ ...u })) })),
        auxUnits: srcDoc.auxUnits.map(u => ({ ...u })),
      },
    };
    setListsStore({ activeListId: newId, lists: { ...listsStore.lists, [newId]: clone } });
    loadListIntoState(clone);
  };

  const renameList = (id, name) => {
    setListsStore({ ...listsStore, lists: { ...listsStore.lists, [id]: { ...listsStore.lists[id], name } } });
  };

  const deleteList = (id) => {
    const ids = Object.keys(listsStore.lists);
    if (ids.length <= 1) return;
    const nextLists = { ...listsStore.lists };
    delete nextLists[id];
    let nextActiveId = listsStore.activeListId;
    if (nextActiveId === id) {
      nextActiveId = Object.keys(nextLists)[0];
      loadListIntoState(nextLists[nextActiveId]);
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

  const setUnitCount = (id, field, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setRoster(prev => {
      const next = { ...prev, [id]: { ...(prev[id] ?? { train: 0, reinforce: 0 }), [field]: n } };
      if ((next[id].train ?? 0) === 0 && (next[id].reinforce ?? 0) === 0) delete next[id];
      return next;
    });
  };

  // ── Army Roster document (Commander/Army Name/regiments/aux units/notes) —
  // free-text fields the user fills in themselves, same as Path to Glory's
  // own Army Roster replica. Faction/Points Limit/Battle Formation are NOT
  // duplicated here since this page already tracks them live; the replica
  // form just displays those directly instead of a second editable copy. ──
  const [rosterDocOpen, setRosterDocOpen] = useState(false);
  const [rosterPresentMode, setRosterPresentMode] = useState('replica');

  const addRegiment = () => setArmyRosterDoc(d => ({ ...d, regiments: [...d.regiments, { id: `${Date.now()}-${d.regiments.length}`, units: [] }] }));
  const removeRegiment = rid => setArmyRosterDoc(d => ({ ...d, regiments: d.regiments.filter(r => r.id !== rid) }));
  const addRegimentUnit = rid => setArmyRosterDoc(d => ({
    ...d,
    regiments: d.regiments.map(r => r.id === rid
      ? { ...r, units: [...r.units, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', size: '', notes: '', points: '' }] }
      : r),
  }));
  const updateRegimentUnit = (rid, uid, field, value) => setArmyRosterDoc(d => ({
    ...d,
    regiments: d.regiments.map(r => r.id === rid
      ? { ...r, units: r.units.map(u => u.id === uid ? { ...u, [field]: value } : u) }
      : r),
  }));
  const removeRegimentUnit = (rid, uid) => setArmyRosterDoc(d => ({
    ...d,
    regiments: d.regiments.map(r => r.id === rid ? { ...r, units: r.units.filter(u => u.id !== uid) } : r),
  }));
  const addAuxUnit = () => setArmyRosterDoc(d => ({ ...d, auxUnits: [...d.auxUnits, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', size: '', notes: '', points: '' }] }));
  const updateAuxUnit = (uid, field, value) => setArmyRosterDoc(d => ({ ...d, auxUnits: d.auxUnits.map(u => u.id === uid ? { ...u, [field]: value } : u) }));
  const removeAuxUnit = uid => setArmyRosterDoc(d => ({ ...d, auxUnits: d.auxUnits.filter(u => u.id !== uid) }));

  const regimentsTotal = armyRosterDoc.regiments.reduce((sum, r) => sum + r.units.reduce((s, u) => s + (parseInt(u.points, 10) || 0), 0), 0);
  const auxTotal = armyRosterDoc.auxUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);
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

  // ── Column resizing — mirrors WarscrollsPage's colWidths/thStyle/startResize
  // pattern so this table's proportions match the main Warscrolls page. Train/
  // Reinforce are sized just wide enough for their header text + the count
  // input (not the equal-share width they got with no explicit widths set),
  // and Keywords is 3x the Warscrolls default so more keywords fit per line
  // (shorter, less-wrapped rows). ──────────────────────────────────────────
  const DEFAULT_COL_WIDTHS = {
    rownum: 22, train: 50, reinforce: 58, expand: 22, thumb: 44,
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

  const allRowsRaw = data?.data ?? [];
  const allRows = hideOtherFactions ? allRowsRaw.filter(r => !isGuestOfFaction(r)) : allRowsRaw;
  const ownRows   = faction ? sortRows(allRows.filter(r => r.faction_slug === faction)) : sortRows(allRows);
  const otherRows = faction ? sortRows(allRows.filter(r => r.faction_slug !== faction)) : [];
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
          <td className="col-count" onClick={e => e.stopPropagation()}>
            <input
              type="number" min="0" className="ab-count-input"
              value={sel.train || ''} placeholder="0"
              onChange={e => setUnitCount(row.id, 'train', e.target.value)}
            />
          </td>
          <td className="col-count" onClick={e => e.stopPropagation()}>
            <input
              type="number" min="0" className="ab-count-input"
              value={sel.reinforce || ''} placeholder="0"
              onChange={e => setUnitCount(row.id, 'reinforce', e.target.value)}
            />
          </td>
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
    <div className="table-page">
      {!headerCollapsed && (
      <>
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
        </div>

        <div className="ab-points-block">
          <div className="ab-points-label">Points</div>
          <div className="ab-points-value">
            <span className="ab-points-current">{totalPoints.toLocaleString()}</span>
            <span className="ab-points-sep">/</span>
            <input
              type="number" min="0" className="ab-points-limit-input"
              value={pointsLimit}
              onChange={e => setPointsLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
        </div>
      </div>
      </>
      )}

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
                          onClick={e => handleSort(col.key, e)}
                          onContextMenu={e => { e.preventDefault(); handleSort(col.key, e, true); }}
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
        factionName={factionName}
        pointsLimit={pointsLimit}
        battleFormation={battleFormation}
        totalPoints={totalPoints}
        doc={armyRosterDoc}
        setDoc={setArmyRosterDoc}
        addRegiment={addRegiment}
        removeRegiment={removeRegiment}
        addRegimentUnit={addRegimentUnit}
        updateRegimentUnit={updateRegimentUnit}
        removeRegimentUnit={removeRegimentUnit}
        addAuxUnit={addAuxUnit}
        updateAuxUnit={updateAuxUnit}
        removeAuxUnit={removeAuxUnit}
        regimentsTotal={regimentsTotal}
        auxTotal={auxTotal}
        armyUnitsTotal={armyUnitsTotal}
      />
    )}
    </>
  );
}
