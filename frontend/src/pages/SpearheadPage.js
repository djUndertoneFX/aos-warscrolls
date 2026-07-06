import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import WarscrollGW from '../components/WarscrollGW';
import { useSettings } from '../SettingsContext';
import { calcWeaponADO, resolveWeaponLoadout } from '../awoCalc';

function sumADO(weapons, unitSize, save, ward, rounding) {
  let total = 0, any = false;
  for (const w of weapons) {
    const v = calcWeaponADO(w, unitSize || 1, save, ward, rounding);
    if (v !== null) { total += v; any = true; }
  }
  return any ? total : null;
}

const ALLIANCE_ORDER = { Order: 0, Chaos: 1, Death: 2, Destruction: 3 };

function AllianceBadge({ alliance }) {
  return <span className={`alliance-badge alliance-${alliance}`}>{alliance}</span>;
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
    </div>
  );
}

// Dropdown that shows spearhead names with faction in parentheses
function SpearheadDropdown({ groups, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = groups.find(g => g.spearheadName === value);
  const label = selected ? selected.spearheadName : placeholder;

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = name => { onChange(name); setOpen(false); };

  return (
    <div className="faction-dropdown" ref={ref}>
      <button className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu">
          <div className={`faction-dropdown-item${value === '' ? ' selected' : ''}`} onMouseDown={() => pick('')}>
            {placeholder}
          </div>
          {groups.map(g => (
            <div
              key={g.spearheadName}
              className={`faction-dropdown-item${value === g.spearheadName ? ' selected' : ''}`}
              onMouseDown={() => pick(g.spearheadName)}
            >
              {g.spearheadName}
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75em', marginLeft: '0.4em' }}>({g.faction})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FILTER_KEY = 'aos-sp-filters';
const DEFAULT_COL_WIDTHS = {
  expand: 22, spearhead: 160, name: 190, thumb: 44,
  move: 42, health: 42, control: 42, save: 42, ward: 38,
  ado_ranged: 54, ado_melee: 54,
  types: 68, keywords: 130,
};
const STORAGE_KEY = 'aos-sp-col-widths-v3';
// expand | spearhead | name | thumb | mv | hp | ctrl | sv | wd | ado-r | ado-m | types | kw = 13
const TOTAL_COLS = 13;
const WEAPONS_EXPAND_COLS = 11;

export default function SpearheadPage({ headerCollapsed }) {
  const { presumedSave, presumedWard, roundingMode, includeSaveWardInADO } = useSettings();
  const [allRows, setAllRows] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [detailUnit, setDetailUnit] = useState(null);
  const [thumbHover, setThumbHover] = useState(null);
  const tableWrapperRef = useRef(null);

  // ── Persisted filter state ────────────────────────────────────────────────
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } }, []);
  const [yourSpearhead,    setYourSpearhead]    = useState(saved.yourSpearhead    ?? '');
  const [opponentSpearhead,setOpponentSpearhead] = useState(saved.opponentSpearhead ?? '');
  const [alliance,         setAlliance]          = useState(saved.alliance ?? '');
  const [showFriendly,     setShowFriendly]      = useState(saved.showFriendly ?? false);
  const [showEnemy,        setShowEnemy]          = useState(saved.showEnemy ?? false);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ yourSpearhead, opponentSpearhead, alliance, showFriendly, showEnemy }));
  }, [yourSpearhead, opponentSpearhead, alliance, showFriendly, showEnemy]);

  // ── Per-group expand state ────────────────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const s = new Set();
    if (saved.yourSpearhead)    s.add(saved.yourSpearhead);
    if (saved.opponentSpearhead) s.add(saved.opponentSpearhead);
    return s;
  });

  // ── Per-unit row expand state ─────────────────────────────────────────────
  const [expandedIds,     setExpandedIds]     = useState(new Set());
  const [fullExpandedIds, setFullExpandedIds] = useState(new Set());

  // ── Column resizing ───────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
    catch { return DEFAULT_COL_WIDTHS; }
  });
  const dragRef = useRef(null);
  const startResize = useCallback((e, colKey) => {
    e.preventDefault();
    const startX = e.clientX, startW = colWidths[colKey];
    dragRef.current = { colKey, startX, startW };
    const onMove = ev => {
      const { colKey: k, startX: sx, startW: sw } = dragRef.current;
      const newW = Math.max(30, sw + ev.clientX - sx);
      setColWidths(prev => { const next = { ...prev, [k]: newW }; localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return next; });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);
  const thStyle = key => ({ width: colWidths[key], position: 'relative' });

  // ── Fetch all spearhead units once ────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    axios.get('/api/warscrolls', { params: { spearheadOnly: '1', sortBy: 'faction', sortDir: 'asc', pageSize: 9999, page: 1 } })
      .then(res => setAllRows(res.data.data))
      .catch(err => {
        if (err.response?.status === 401) setError('Session expired. Please sign out and log back in.');
        else setError('Failed to load spearheads. Is the backend running?');
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Build groups keyed by spearhead NAME ──────────────────────────────────
  const groups = useMemo(() => {
    if (!allRows) return [];
    const map = new Map();
    for (const row of allRows) {
      const key = row.spearhead; // spearhead name is the group key
      if (!map.has(key)) {
        map.set(key, {
          spearheadName: key,
          faction: row.faction,
          factionSlug: row.faction_slug,
          alliance: row.grand_alliance,
          units: [],
        });
      }
      map.get(key).units.push(row);
    }
    return [...map.values()].sort((a, b) => {
      const ao = ALLIANCE_ORDER[a.alliance] ?? 99, bo = ALLIANCE_ORDER[b.alliance] ?? 99;
      if (ao !== bo) return ao - bo;
      if (a.faction !== b.faction) return a.faction.localeCompare(b.faction);
      return a.spearheadName.localeCompare(b.spearheadName);
    });
  }, [allRows]);

  // ── Filter groups ─────────────────────────────────────────────────────────
  const visibleGroups = useMemo(() => {
    let filtered = groups;
    if (alliance) filtered = filtered.filter(g => g.alliance === alliance);
    if (showFriendly && showEnemy && yourSpearhead && opponentSpearhead) {
      filtered = filtered.filter(g => g.spearheadName === yourSpearhead || g.spearheadName === opponentSpearhead);
      if (alliance) filtered = filtered.filter(g => g.alliance === alliance);
    } else {
      if (showFriendly && yourSpearhead)     filtered = filtered.filter(g => g.spearheadName === yourSpearhead);
      if (showEnemy   && opponentSpearhead)  filtered = filtered.filter(g => g.spearheadName === opponentSpearhead);
    }
    return filtered;
  }, [groups, alliance, showFriendly, showEnemy, yourSpearhead, opponentSpearhead]);

  // ── Toggle your/opponent spearhead ────────────────────────────────────────
  const toggleFriendly = name => {
    const next = yourSpearhead === name ? '' : name;
    setYourSpearhead(next);
    if (next) setExpandedGroups(prev => { const s = new Set(prev); s.add(next); return s; });
  };
  const toggleEnemy = name => {
    const next = opponentSpearhead === name ? '' : name;
    setOpponentSpearhead(next);
    if (next) setExpandedGroups(prev => { const s = new Set(prev); s.add(next); return s; });
  };
  const swapSpearheads = () => {
    const tmp = yourSpearhead;
    setYourSpearhead(opponentSpearhead);
    setOpponentSpearhead(tmp);
  };

  const handleYourSpearhead = name => {
    setYourSpearhead(name);
    if (name) setExpandedGroups(prev => { const s = new Set(prev); s.add(name); return s; });
  };
  const handleOpponentSpearhead = name => {
    setOpponentSpearhead(name);
    if (name) setExpandedGroups(prev => { const s = new Set(prev); s.add(name); return s; });
  };

  const toggleGroup = name => {
    setExpandedGroups(prev => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name); else s.add(name);
      return s;
    });
  };

  const [navbarExtrasEl, setNavbarExtrasEl] = useState(null);
  useEffect(() => {
    setNavbarExtrasEl(headerCollapsed ? document.getElementById('navbar-extras') : null);
  }, [headerCollapsed]);

  const allUnits = useMemo(() => visibleGroups.flatMap(g => g.units), [visibleGroups]);

  const mkBox = str => {
    const [title, ...rest] = str.split('\n');
    return <div className="ado-tip-box"><div className="ado-tip-title">{title}</div><div className="ado-tip-body">{rest.join('\n').trim()}</div></div>;
  };
  const adoRTip = mkBox(`ADO — Ranged\n  Hit and wound${includeSaveWardInADO ? ` vs ${presumedSave ?? 5}+` : ' only (save not applied)'}.`);
  const adoMTip = mkBox(`ADO — Melee\n  Hit and wound${includeSaveWardInADO ? ` vs ${presumedSave ?? 5}+` : ' only (save not applied)'}.`);

  return (
    <>
    {thumbHover && ReactDOM.createPortal(
      <div className="thumb-popup-fixed" style={{ left: thumbHover.x + 16, top: thumbHover.y + 16 }}>
        <img src={`${axios.defaults.baseURL || ''}/api/unit-image/${thumbHover.id}`} alt=""
          onError={e => { e.target.style.display = 'none'; }} />
      </div>,
      document.body
    )}
    {navbarExtrasEl && ReactDOM.createPortal(
      <button className={`btn-both-toggle${(yourSpearhead || opponentSpearhead) && yourSpearhead !== opponentSpearhead ? ' active' : ''}`}
        title="Swap Your/Opponent spearheads" onClick={swapSpearheads}>⇔</button>,
      navbarExtrasEl
    )}
    <div className="table-page">
      {!headerCollapsed && (
        <>
        <div className="page-header">
          <div className="page-title">Spearhead<span>Age of Sigmar 4th Edition</span></div>
          {allRows && <div className="unit-count">{groups.length} spearhead armies</div>}
        </div>

        <div className="filters">
          <div className="filter-group">
            <div className="filter-label">Grand Alliance</div>
            <select className="filter-select" value={alliance} onChange={e => setAlliance(e.target.value)}>
              <option value="">All Alliances</option>
              {['Order','Chaos','Death','Destruction'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <div className="filter-label" style={{color:'var(--friendly-color)'}}>Your Spearhead</div>
            <SpearheadDropdown groups={groups} value={yourSpearhead} onChange={handleYourSpearhead} placeholder="— None —" />
          </div>

          <div className="filter-group" style={{justifyContent:'center', paddingTop:'1.1rem'}}>
            <button
              className={`btn-both-toggle${(yourSpearhead || opponentSpearhead) && yourSpearhead !== opponentSpearhead ? ' active' : ''}`}
              title="Swap" onClick={swapSpearheads}>⇔</button>
          </div>

          <div className="filter-group">
            <div className="filter-label" style={{color:'var(--enemy-color)'}}>Opponent's Spearhead</div>
            <SpearheadDropdown groups={groups} value={opponentSpearhead} onChange={handleOpponentSpearhead} placeholder="— None —" />
          </div>

          <div className="filter-checkboxes">
            <div className="cb-group cb-group-left">
              <label className="cb-item">
                <input type="checkbox" checked={showFriendly} onChange={e => setShowFriendly(e.target.checked)} />
                <span style={{color:'var(--friendly-color)'}}>Friendly</span>
              </label>
              <label className="cb-item">
                <input type="checkbox" checked={showEnemy} onChange={e => setShowEnemy(e.target.checked)} />
                <span style={{color:'var(--enemy-color)'}}>Enemy</span>
              </label>
            </div>
          </div>
        </div>
        </>
      )}

      {error && <div className="error-msg" style={{marginBottom:'1rem'}}>{error}</div>}

      {loading ? (
        <div className="loading-state"><span className="loading-rune">⚙</span>Mustering the Spearheads…</div>
      ) : (
        <div className="table-wrapper" ref={tableWrapperRef}>
          <table>
            <thead>
              <tr>
                <th style={thStyle('expand')}><span className="col-resize-handle" onMouseDown={e => startResize(e,'expand')} /></th>
                <th style={{...thStyle('spearhead')}} className="col-spearhead-hdr">
                  Spearhead<span className="col-resize-handle" onMouseDown={e => startResize(e,'spearhead')} />
                </th>
                <th style={thStyle('name')}>Unit Name<span className="col-resize-handle" onMouseDown={e => startResize(e,'name')} /></th>
                <th style={thStyle('thumb')}><span className="col-resize-handle" onMouseDown={e => startResize(e,'thumb')} /></th>
                <th style={thStyle('move')}    className="stat-group stat-group-start" title="Move"><span className="th-abbr">Mv</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'move')} /></th>
                <th style={thStyle('health')}  className="stat-group" title="Health"><span className="th-abbr">HP</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'health')} /></th>
                <th style={thStyle('control')} className="stat-group" title="Control"><span className="th-abbr">Ctrl</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'control')} /></th>
                <th style={thStyle('save')}    className="stat-group stat-group-end" title="Save"><span className="th-abbr">Sv</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'save')} /></th>
                <th style={thStyle('ward')}    className="col-ward" title="Ward"><span className="th-abbr">Wd</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'ward')} /></th>
                <th style={{...thStyle('ado_ranged'), textAlign:'center'}} className="col-ado-hdr">
                  <span className="ado-tip">{adoRTip}ADO-R</span>
                  <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e,'ado_ranged'); }} />
                </th>
                <th style={{...thStyle('ado_melee'), textAlign:'center'}} className="col-ado-hdr">
                  <span className="ado-tip">{adoMTip}ADO-M</span>
                  <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e,'ado_melee'); }} />
                </th>
                <th style={thStyle('types')}>Types<span className="col-resize-handle" onMouseDown={e => startResize(e,'types')} /></th>
                <th style={thStyle('keywords')}>Keywords<span className="col-resize-handle" onMouseDown={e => startResize(e,'keywords')} /></th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.length === 0 && (
                <tr><td colSpan={TOTAL_COLS} className="empty-state" style={{padding:'2rem',textAlign:'center'}}>
                  No spearheads match the current filters.
                </td></tr>
              )}
              {visibleGroups.map(group => {
                const isGroupExpanded = expandedGroups.has(group.spearheadName);
                const isFriendly = yourSpearhead    === group.spearheadName;
                const isEnemy    = opponentSpearhead === group.spearheadName;
                return (
                  <React.Fragment key={group.spearheadName}>
                    {/* ── Spearhead group header ── */}
                    <tr
                      className={`spearhead-group-hdr${isFriendly ? ' sp-group-friendly' : ''}${isEnemy ? ' sp-group-enemy' : ''}`}
                      onClick={() => toggleGroup(group.spearheadName)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td colSpan={TOTAL_COLS}>
                        <div className="sp-group-hdr-inner">
                          {/* F/E buttons on the LEFT */}
                          <span className="sp-group-flags" onClick={e => e.stopPropagation()}>
                            <button
                              className={`sp-flag-btn sp-flag-f${isFriendly ? ' active' : ''}`}
                              title={isFriendly ? 'Clear friendly' : 'Mark as Your Spearhead'}
                              onClick={() => toggleFriendly(group.spearheadName)}
                            >F</button>
                            <button
                              className={`sp-flag-btn sp-flag-e${isEnemy ? ' active' : ''}`}
                              title={isEnemy ? 'Clear enemy' : "Mark as Opponent's Spearhead"}
                              onClick={() => toggleEnemy(group.spearheadName)}
                            >E</button>
                          </span>
                          <span className="sp-group-chevron">{isGroupExpanded ? '▼' : '▶'}</span>
                          <AllianceBadge alliance={group.alliance} />
                          <span className="sp-group-faction">{group.faction}</span>
                          <span className="sp-group-name">{group.spearheadName}</span>
                          <span className="sp-group-count">({group.units.length} units)</span>
                        </div>
                      </td>
                    </tr>

                    {/* ── Unit rows ── */}
                    {isGroupExpanded && group.units.map(row => {
                      const isExpanded     = expandedIds.has(row.id);
                      const isFullExpanded = fullExpandedIds.has(row.id);
                      const weapons = (() => { try { return JSON.parse(row.weapons || '[]'); } catch { return []; } })();
                      const save = includeSaveWardInADO ? (presumedSave ?? 5) : 7;
                      const ward = includeSaveWardInADO ? (presumedWard ?? null) : null;
                      const resolvedWeapons = resolveWeaponLoadout(weapons, row.options_text, row.unit_size, save, ward, roundingMode) ?? weapons;
                      const ranged = resolvedWeapons.filter(w => w.type === 'ranged');
                      const melee  = resolvedWeapons.filter(w => w.type === 'melee');
                      const adoRanged = sumADO(ranged, row.unit_size, save, ward, roundingMode);
                      const adoMelee  = sumADO(melee,  row.unit_size, save, ward, roundingMode);
                      return (
                        <React.Fragment key={row.id}>
                          <tr
                            className={`unit-row sp-unit-row${isFriendly ? ' sp-unit-friendly' : ''}${isEnemy ? ' sp-unit-enemy' : ''}${(isExpanded || isFullExpanded) ? ' expanded' : ''}${isFullExpanded ? ' full-expanded' : ''}${detailUnit?.id === row.id ? ' active-detail' : ''}`}
                            data-unit-id={row.id}
                            onClick={() => {
                              if (isFullExpanded) { setFullExpandedIds(prev => { const s = new Set(prev); s.delete(row.id); return s; }); return; }
                              setExpandedIds(prev => { const s = new Set(prev); isExpanded ? s.delete(row.id) : s.add(row.id); return s; });
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              if (isFullExpanded) { setFullExpandedIds(prev => { const s = new Set(prev); s.delete(row.id); return s; }); return; }
                              setExpandedIds(prev => { const s = new Set(prev); s.delete(row.id); return s; });
                              setFullExpandedIds(prev => { const s = new Set(prev); s.add(row.id); return s; });
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <td><span className="row-expand-hint">{isFullExpanded ? '◆' : isExpanded ? '▲' : '▼'}</span></td>
                            <td className="col-spearhead">
                              <span className="spearhead-name">{row.spearhead}</span>
                            </td>
                            <td className="col-name" onClick={e => { e.stopPropagation(); setDetailUnit(row); }}>
                              <span className="unit-name-link">{row.name}</span>
                            </td>
                            <td className="col-thumb">
                              <img
                                src={`${axios.defaults.baseURL || ''}/api/unit-image/${row.id}`}
                                alt="" className="thumb-img" loading="lazy"
                                onMouseEnter={e => setThumbHover({ id: row.id, x: e.clientX, y: e.clientY })}
                                onMouseMove={e  => setThumbHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                                onMouseLeave={() => setThumbHover(null)}
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            </td>
                            <td className="col-stat stat-group stat-group-start">{row.move    || '—'}</td>
                            <td className="col-stat stat-group"                  >{row.health  || '—'}</td>
                            <td className="col-stat stat-group"                  >{row.control || '—'}</td>
                            <td className="col-stat stat-group stat-group-end"   >{row.save    || '—'}</td>
                            <td className="col-stat col-ward"                    >{row.ward    || '—'}</td>
                            <td className="col-ado">{adoRanged !== null ? adoRanged : '—'}</td>
                            <td className="col-ado">{adoMelee  !== null ? adoMelee  : '—'}</td>
                            <td><TypeTags row={row} /></td>
                            <td className="col-keywords">{row.keywords ? row.keywords.split(',').slice(0, 6).map((kw, i, arr) => (
                              <span key={kw} className="kw-chip">{kw.trim()}{i < arr.length - 1 ? ', ' : ''}</span>
                            )) : '—'}</td>
                          </tr>

                          {(isExpanded || isFullExpanded) && (
                            <tr className="weapons-expand-row">
                              <td colSpan={WEAPONS_EXPAND_COLS}>
                                <div className="weapons-expand-inner" onClick={e => e.stopPropagation()}>
                                  {weapons.length === 0 && <span style={{color:'var(--text-dim)',fontStyle:'italic'}}>No weapon data available.</span>}
                                  {ranged.length > 0 && (
                                    <div className="inline-weapon-block">
                                      <div className="inline-weapon-section-header">⊕ Ranged Weapons</div>
                                      <table className="inline-weapon-table">
                                        <thead><tr>
                                          <th className="iwt-th-name">Weapon</th>
                                          <th className="iwt-th-stat">Rng</th><th className="iwt-th-stat">Atk</th><th className="iwt-th-stat">Hit</th><th className="iwt-th-stat">Wnd</th><th className="iwt-th-stat">Rnd</th><th className="iwt-th-stat">Dmg</th>
                                          <th className="iwt-th-ability">Ability</th><th className="iwt-th-ado">AWO</th>
                                        </tr></thead>
                                        <tbody>
                                          {ranged.map((w, i) => (
                                            <tr key={i}>
                                              <td className="iwt-td-name">{w.name}</td>
                                              <td className="iwt-td-stat">{w.range}</td><td className="iwt-td-stat">{w.attacks}</td>
                                              <td className="iwt-td-stat">{w.hit}</td><td className="iwt-td-stat">{w.wound}</td>
                                              <td className="iwt-td-stat">{w.rend || '—'}</td><td className="iwt-td-stat">{w.damage}</td>
                                              <td className="iwt-td-ability">{w.ability || '—'}</td>
                                              <td className="iwt-td-ado">{(() => { const v = calcWeaponADO(w, row.unit_size || 1, save, ward, roundingMode); return v !== null ? v : '—'; })()}</td>
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
                                          <th className="iwt-th-ability">Ability</th><th className="iwt-th-ado">AWO</th>
                                        </tr></thead>
                                        <tbody>
                                          {melee.map((w, i) => (
                                            <tr key={i}>
                                              <td className="iwt-td-name">{w.name}</td>
                                              <td className="iwt-td-stat">{w.attacks}</td>
                                              <td className="iwt-td-stat">{w.hit}</td><td className="iwt-td-stat">{w.wound}</td>
                                              <td className="iwt-td-stat">{w.rend || '—'}</td><td className="iwt-td-stat">{w.damage}</td>
                                              <td className="iwt-td-ability">{w.ability || '—'}</td>
                                              <td className="iwt-td-ado">{(() => { const v = calcWeaponADO(w, row.unit_size || 1, save, ward, roundingMode); return v !== null ? v : '—'; })()}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  {isFullExpanded && (() => {
                                    const abilities = (() => { try { return JSON.parse(row.abilities || '[]'); } catch { return []; } })();
                                    if (!abilities.length) return null;
                                    return (
                                      <div className="inline-abilities-block">
                                        <div className="inline-weapon-section-header">◆ Abilities</div>
                                        {abilities.map((ab, i) => (
                                          <div key={i} className="inline-ability-card">
                                            <div className="inline-ability-header">
                                              <span className="inline-ability-name">{ab.name}</span>
                                              {ab.timing && <span className="inline-ability-timing">{ab.timing}</span>}
                                            </div>
                                            {ab.declare && <div className="inline-ability-section"><span className="inline-ability-label">Declare:</span> {ab.declare}</div>}
                                            {ab.effect && <div className="inline-ability-section"><span className="inline-ability-label">Effect:</span> {ab.effect}</div>}
                                            {ab.bullets?.map((b, j) => <div key={j} className="inline-ability-bullet">• {b}</div>)}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {detailUnit && (() => {
      const idx = allUnits.findIndex(u => u.id === detailUnit.id);
      return (
        <WarscrollGW
          unit={detailUnit}
          factions={groups.map(g => ({ faction_slug: g.factionSlug, faction: g.faction, grand_alliance: g.alliance }))}
          navIndex={idx}
          navList={allUnits}
          onClose={() => setDetailUnit(null)}
          onPrev={() => { if (idx > 0) setDetailUnit(allUnits[idx - 1]); }}
          onNext={() => { if (idx < allUnits.length - 1) setDetailUnit(allUnits[idx + 1]); }}
          onJump={i => setDetailUnit(allUnits[i])}
          onFilterApply={() => setDetailUnit(null)}
        />
      );
    })()}
    </>
  );
}
