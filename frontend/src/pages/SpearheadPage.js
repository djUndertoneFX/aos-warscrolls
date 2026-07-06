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
  rownum: 22, friendly: 24, enemy: 24, expand: 22, spearhead: 150,
  name: 190, thumb: 44, faction: 110, alliance: 66, models: 42,
  move: 42, health: 42, control: 42, save: 42, ward: 38,
  types: 68, keywords: 130,
  ado_ranged: 54, ado_melee: 54, ado_pct: 56,
};
const STORAGE_KEY = 'aos-sp-col-widths-v4';
// rownum | friendly | enemy | expand | spearhead | name | thumb | faction | alliance | models | mv | hp | ctrl | sv | wd | types | kw | ado-r | ado-m | ado-pct = 20
const TOTAL_COLS = 20;
const WEAPONS_EXPAND_COLS = 18;

export default function SpearheadPage({ headerCollapsed }) {
  const { presumedSave, presumedWard, roundingMode, includeSaveWardInADO } = useSettings();
  const [allRows, setAllRows] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [detailUnit, setDetailUnit] = useState(null);
  const [thumbHover,   setThumbHover]   = useState(null);
  const [spThumbHover, setSpThumbHover] = useState(null); // { name, x, y }
  const tableWrapperRef = useRef(null);

  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } }, []);
  const [yourSpearhead,    setYourSpearhead]    = useState(saved.yourSpearhead    ?? '');
  const [opponentSpearhead,setOpponentSpearhead] = useState(saved.opponentSpearhead ?? '');
  const [alliance,         setAlliance]          = useState(saved.alliance ?? '');
  const [showFriendly,     setShowFriendly]      = useState(saved.showFriendly ?? false);
  const [showEnemy,        setShowEnemy]          = useState(saved.showEnemy ?? false);
  const [nameSearch,       setNameSearch]        = useState('');

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ yourSpearhead, opponentSpearhead, alliance, showFriendly, showEnemy }));
  }, [yourSpearhead, opponentSpearhead, alliance, showFriendly, showEnemy]);

  const [expandedGroups, setExpandedGroups] = useState(() => {
    const s = new Set();
    if (saved.yourSpearhead)     s.add(saved.yourSpearhead);
    if (saved.opponentSpearhead) s.add(saved.opponentSpearhead);
    return s;
  });

  const [expandedIds,     setExpandedIds]     = useState(new Set());
  const [fullExpandedIds, setFullExpandedIds] = useState(new Set());
  const [rulesExpanded,   setRulesExpanded]   = useState(new Set()); // spearhead names with rules row open
  const [spearheadRules,  setSpearheadRules]  = useState({}); // name → { battleTraits, regimentAbilities, enhancements }

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

  // Fetch spearhead rules (battle traits, regiment abilities, enhancements)
  useEffect(() => {
    axios.get('/api/spearheads')
      .then(res => {
        const map = {};
        for (const sp of res.data) map[sp.name] = sp;
        setSpearheadRules(map);
      })
      .catch(() => {}); // non-fatal — page still works without rules
  }, []);

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

  // Build groups keyed by spearhead NAME; pipe-separated values → unit belongs to multiple groups
  const groups = useMemo(() => {
    if (!allRows) return [];
    const map = new Map();
    for (const row of allRows) {
      const names = row.spearhead ? row.spearhead.split('|') : [];
      for (const name of names) {
        const key = name.trim();
        if (!map.has(key)) {
          map.set(key, {
            spearheadName: key,
            faction: row.faction,
            factionSlug: row.faction_slug,
            alliance: row.grand_alliance,
            units: [],
          });
        }
        const g = map.get(key);
        if (!g.units.find(u => u.id === row.id)) g.units.push(row);
      }
    }
    return [...map.values()].sort((a, b) => {
      // Sort by faction name then spearhead name within faction
      if (a.faction !== b.faction) return a.faction.localeCompare(b.faction);
      return a.spearheadName.localeCompare(b.spearheadName);
    });
  }, [allRows]);

  const visibleGroups = useMemo(() => {
    let filtered = groups;
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      filtered = filtered.filter(g =>
        g.spearheadName.toLowerCase().includes(q) ||
        g.faction.toLowerCase().includes(q)
      );
    }
    if (alliance) filtered = filtered.filter(g => g.alliance === alliance);
    if (showFriendly && showEnemy && yourSpearhead && opponentSpearhead) {
      filtered = filtered.filter(g => g.spearheadName === yourSpearhead || g.spearheadName === opponentSpearhead);
    } else {
      if (showFriendly && yourSpearhead)    filtered = filtered.filter(g => g.spearheadName === yourSpearhead);
      if (showEnemy   && opponentSpearhead) filtered = filtered.filter(g => g.spearheadName === opponentSpearhead);
    }
    return filtered;
  }, [groups, nameSearch, alliance, showFriendly, showEnemy, yourSpearhead, opponentSpearhead]);

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
    const tmpF = showFriendly;
    setShowFriendly(showEnemy);
    setShowEnemy(tmpF);
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
    setExpandedGroups(prev => { const s = new Set(prev); if (s.has(name)) s.delete(name); else s.add(name); return s; });
  };
  const toggleRules = name => {
    setRulesExpanded(prev => { const s = new Set(prev); if (s.has(name)) s.delete(name); else s.add(name); return s; });
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

  // Spearhead group counter (# column shows group number, same for all units in a group)
  let groupCounter = 0;

  return (
    <>
    {thumbHover && ReactDOM.createPortal(
      <div className="thumb-popup-fixed" style={{ left: thumbHover.x + 16, top: thumbHover.y + 16 }}>
        <img src={`${axios.defaults.baseURL || ''}/api/unit-image/${thumbHover.id}`} alt=""
          onError={e => { e.target.style.display = 'none'; }} />
      </div>,
      document.body
    )}
    {spThumbHover && ReactDOM.createPortal(
      <div className="thumb-popup-fixed" style={{ left: spThumbHover.x + 16, top: spThumbHover.y + 16 }}>
        <img src={`${axios.defaults.baseURL || ''}/api/spearhead-image/${encodeURIComponent(spThumbHover.name)}`} alt=""
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

        <div className="filters sp-filters-row1">
          <div className="filter-group sp-search-group">
            <div className="filter-label">Search</div>
            <input
              className="filter-input"
              type="text"
              placeholder="Name or faction…"
              value={nameSearch}
              onChange={e => setNameSearch(e.target.value)}
            />
          </div>

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

          <div className="filter-group">
            <div className="filter-label" style={{color:'var(--enemy-color)'}}>Opponent's Spearhead</div>
            <SpearheadDropdown groups={groups} value={opponentSpearhead} onChange={handleOpponentSpearhead} placeholder="— None —" />
          </div>
        </div>

        <div className="filters sp-filters-row2">
          <div className="filter-checkboxes">
            <div className="cb-group cb-group-left">
              <label className="cb-item">
                <input type="checkbox" checked={showFriendly} onChange={e => setShowFriendly(e.target.checked)} />
                <span style={{color:'var(--friendly-color)'}}>Friendly</span>
              </label>
              <button
                className={`btn-both-toggle${(yourSpearhead || opponentSpearhead) && yourSpearhead !== opponentSpearhead ? ' active' : ''}`}
                title="Swap Your / Opponent spearheads" onClick={swapSpearheads}>⇔</button>
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
                <th style={{...thStyle('rownum'), textAlign:'right'}} title="Row number">
                  <span className="th-abbr" style={{color:'var(--text-dim)'}}>#</span>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'rownum')} />
                </th>
                <th style={{...thStyle('friendly')}} title="Friendly (marks whole spearhead)">
                  <span className="th-abbr" style={{color:'var(--friendly-color)'}}>F</span>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'friendly')} />
                </th>
                <th style={{...thStyle('enemy')}} title="Enemy (marks whole spearhead)">
                  <span className="th-abbr" style={{color:'var(--enemy-color)'}}>E</span>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'enemy')} />
                </th>
                <th style={thStyle('expand')}>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'expand')} />
                </th>
                <th style={thStyle('spearhead')} className="col-spearhead-hdr">
                  Spearhead<span className="col-resize-handle" onMouseDown={e => startResize(e,'spearhead')} />
                </th>
                <th style={thStyle('name')}>
                  Unit Name<span className="col-resize-handle" onMouseDown={e => startResize(e,'name')} />
                </th>
                <th style={thStyle('thumb')}>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'thumb')} />
                </th>
                <th style={thStyle('faction')}>
                  Faction<span className="col-resize-handle" onMouseDown={e => startResize(e,'faction')} />
                </th>
                <th style={thStyle('alliance')}>
                  Alliance<span className="col-resize-handle" onMouseDown={e => startResize(e,'alliance')} />
                </th>
                <th style={thStyle('models')} title="Models in unit">
                  <span className="th-abbr">MDL</span>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'models')} />
                </th>
                <th style={thStyle('move')}    className="stat-group stat-group-start" title="Move">
                  <span className="th-abbr">Mv</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'move')} />
                </th>
                <th style={thStyle('health')}  className="stat-group" title="Health">
                  <span className="th-abbr">HP</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'health')} />
                </th>
                <th style={thStyle('control')} className="stat-group" title="Control">
                  <span className="th-abbr">Ctrl</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'control')} />
                </th>
                <th style={thStyle('save')}    className="stat-group stat-group-end" title="Save">
                  <span className="th-abbr">Sv</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'save')} />
                </th>
                <th style={thStyle('ward')}    className="col-ward" title="Ward">
                  <span className="th-abbr">Wd</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'ward')} />
                </th>
                <th style={thStyle('types')}>
                  Types<span className="col-resize-handle" onMouseDown={e => startResize(e,'types')} />
                </th>
                <th style={thStyle('keywords')}>
                  Keywords<span className="col-resize-handle" onMouseDown={e => startResize(e,'keywords')} />
                </th>
                <th style={{...thStyle('ado_ranged'), textAlign:'center'}} className="col-ado-hdr">
                  <span className="ado-tip">{adoRTip}ADO-R</span>
                  <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e,'ado_ranged'); }} />
                </th>
                <th style={{...thStyle('ado_melee'), textAlign:'center'}} className="col-ado-hdr">
                  <span className="ado-tip">{adoMTip}ADO-M</span>
                  <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e,'ado_melee'); }} />
                </th>
                <th style={{...thStyle('ado_pct'), textAlign:'center'}} className="col-ado-hdr" title="ADO efficiency (ADO per point × 1000)">
                  <span className="th-abbr">ADO/E</span>
                  <span className="col-resize-handle" onMouseDown={e => startResize(e,'ado_pct')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.length === 0 && (
                <tr><td colSpan={TOTAL_COLS} className="empty-state" style={{padding:'2rem',textAlign:'center'}}>
                  No spearheads match the current filters.
                </td></tr>
              )}
              {visibleGroups.map((group, gi) => {
                groupCounter++;
                const isGroupExpanded = expandedGroups.has(group.spearheadName);
                const isRulesExpanded = rulesExpanded.has(group.spearheadName);
                const isFriendly = yourSpearhead    === group.spearheadName;
                const isEnemy    = opponentSpearhead === group.spearheadName;
                const rules = spearheadRules[group.spearheadName];
                const hasRules = rules && (
                  (rules.battleTraits?.length > 0) ||
                  (rules.regimentAbilities?.length > 0) ||
                  (rules.enhancements?.length > 0)
                );
                const isFactionBreak = gi > 0 && visibleGroups[gi - 1].faction !== group.faction;
                return (
                  <React.Fragment key={group.spearheadName}>
                    {/* ── Spearhead group header — one cell per column so faction/alliance land in the right place ── */}
                    <tr
                      className={`spearhead-group-hdr${isFriendly ? ' sp-group-friendly' : ''}${isEnemy ? ' sp-group-enemy' : ''}${isFactionBreak ? ' sp-faction-break' : ''}`}
                      onClick={() => toggleGroup(group.spearheadName)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* col 1: # — show group number */}
                      <td className="col-rownum" style={{textAlign:'right', color:'var(--text-dim)', fontSize:'0.75em'}}>{groupCounter}</td>
                      {/* col 2: F */}
                      <td onClick={e => e.stopPropagation()}>
                        <button className={`sp-flag-btn sp-flag-f${isFriendly ? ' active' : ''}`}
                          title={isFriendly ? 'Clear friendly' : 'Mark as Your Spearhead'}
                          onClick={() => toggleFriendly(group.spearheadName)}>F</button>
                      </td>
                      {/* col 3: E */}
                      <td onClick={e => e.stopPropagation()}>
                        <button className={`sp-flag-btn sp-flag-e${isEnemy ? ' active' : ''}`}
                          title={isEnemy ? 'Clear enemy' : "Mark as Opponent's Spearhead"}
                          onClick={() => toggleEnemy(group.spearheadName)}>E</button>
                      </td>
                      {/* col 4: expand chevron */}
                      <td><span className="sp-group-chevron">{isGroupExpanded ? '▼' : '▶'}</span></td>
                      {/* col 5: Spearhead — thumbnail + name + unit count + rules btn */}
                      <td>
                        <div className="sp-group-hdr-inner">
                          <img
                            className="sp-group-thumb"
                            src={`${axios.defaults.baseURL || ''}/api/spearhead-image/${encodeURIComponent(group.spearheadName)}`}
                            alt=""
                            onMouseEnter={e => setSpThumbHover({ name: group.spearheadName, x: e.clientX, y: e.clientY })}
                            onMouseMove={e  => setSpThumbHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                            onMouseLeave={() => setSpThumbHover(null)}
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                          <span className="sp-group-name">{group.spearheadName}</span>
                          <span className="sp-group-count">({group.units.length})</span>
                          <span onClick={e => e.stopPropagation()}>
                            <button
                              className={`sp-rules-btn${isRulesExpanded ? ' active' : ''}${!hasRules ? ' sp-rules-btn-dim' : ''}`}
                              title={isRulesExpanded ? 'Hide rules' : 'Show Battle Traits & Abilities'}
                              onClick={() => toggleRules(group.spearheadName)}
                            >≡</button>
                          </span>
                        </div>
                      </td>
                      {/* col 6: Unit Name — empty */}
                      <td />
                      {/* col 7: thumb — empty */}
                      <td />
                      {/* col 8: Faction */}
                      <td className="col-faction">{group.faction}</td>
                      {/* col 9: Alliance */}
                      <td className="col-alliance"><AllianceBadge alliance={group.alliance} /></td>
                      {/* cols 10-20: remaining stat cols — empty */}
                      <td colSpan={11} />
                    </tr>

                    {/* ── Spearhead rules row ── */}
                    {isRulesExpanded && (
                      <tr className="sp-rules-row">
                        <td colSpan={TOTAL_COLS}>
                          <div className="sp-rules-inner">
                            {!hasRules ? (
                              <p className="sp-rules-empty">No rules data available yet for {group.spearheadName}.</p>
                            ) : (
                              <>
                                {rules.battleTraits?.length > 0 && (
                                  <div className="sp-rules-section">
                                    <div className="sp-rules-section-hdr">Battle Traits</div>
                                    <div className="sp-rules-cards">
                                      {rules.battleTraits.map((t, i) => (
                                        <div key={i} className="sp-rules-card">
                                          <div className="sp-rules-card-hdr">
                                            <span className="sp-rules-card-name">{t.name}</span>
                                            {t.timing && <span className="sp-rules-card-timing">{t.timing}</span>}
                                          </div>
                                          <div className="sp-rules-card-text">{t.text}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {rules.regimentAbilities?.length > 0 && (
                                  <div className="sp-rules-section">
                                    <div className="sp-rules-section-hdr">Regiment Abilities</div>
                                    <div className="sp-rules-cards">
                                      {rules.regimentAbilities.map((t, i) => (
                                        <div key={i} className="sp-rules-card">
                                          <div className="sp-rules-card-hdr">
                                            <span className="sp-rules-card-name">{t.name}</span>
                                            {t.timing && <span className="sp-rules-card-timing">{t.timing}</span>}
                                          </div>
                                          <div className="sp-rules-card-text">{t.text}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {rules.enhancements?.length > 0 && (
                                  <div className="sp-rules-section">
                                    <div className="sp-rules-section-hdr">Enhancements</div>
                                    <div className="sp-rules-cards">
                                      {rules.enhancements.map((t, i) => (
                                        <div key={i} className="sp-rules-card">
                                          <div className="sp-rules-card-hdr">
                                            <span className="sp-rules-card-name">{t.name}</span>
                                            {t.timing && <span className="sp-rules-card-timing">{t.timing}</span>}
                                          </div>
                                          <div className="sp-rules-card-text">{t.text}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── Unit rows ── */}
                    {isGroupExpanded && group.units.map(row => {
                      const rowNum = groupCounter;
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
                      const adoTotal = (adoRanged ?? 0) + (adoMelee ?? 0);
                      const adoPct   = (adoRanged !== null || adoMelee !== null) && row.points
                        ? Math.round(adoTotal / row.points * 1000) : null;
                      // Show the specific spearhead name for this group (not all pipe-separated names)
                      return (
                        <React.Fragment key={`${group.spearheadName}-${row.id}`}>
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
                            <td className="col-rownum" style={{textAlign:'right', color:'var(--text-dim)', fontSize:'0.75em'}}>{rowNum}</td>
                            <td className="col-flag" onClick={e => { e.stopPropagation(); toggleFriendly(group.spearheadName); }}>
                              <span className={`flag-check friendly${isFriendly ? ' active' : ''}`}>✓</span>
                            </td>
                            <td className="col-flag" onClick={e => { e.stopPropagation(); toggleEnemy(group.spearheadName); }}>
                              <span className={`flag-check enemy${isEnemy ? ' active' : ''}`}>✓</span>
                            </td>
                            <td><span className="row-expand-hint">{isFullExpanded ? '◆' : isExpanded ? '▲' : '▼'}</span></td>
                            <td className="col-spearhead">
                              <span className="spearhead-name">{group.spearheadName}</span>
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
                            <td className="col-faction">{row.faction}</td>
                            <td className="col-alliance">
                              {row.grand_alliance && <AllianceBadge alliance={row.grand_alliance} />}
                            </td>
                            <td className="col-stat">{row.unit_size || '—'}</td>
                            <td className="col-stat stat-group stat-group-start">{row.move    || '—'}</td>
                            <td className="col-stat stat-group"                  >{row.health  || '—'}</td>
                            <td className="col-stat stat-group"                  >{row.control || '—'}</td>
                            <td className="col-stat stat-group stat-group-end"   >{row.save    || '—'}</td>
                            <td className="col-stat col-ward"                    >{row.ward    || '—'}</td>
                            <td><TypeTags row={row} /></td>
                            <td className="col-keywords">{row.keywords ? row.keywords.split(',').slice(0, 6).map((kw, i, arr) => (
                              <span key={kw} className="kw-chip">{kw.trim()}{i < arr.length - 1 ? ', ' : ''}</span>
                            )) : '—'}</td>
                            <td className="col-ado">{adoRanged !== null ? adoRanged : '—'}</td>
                            <td className="col-ado">{adoMelee  !== null ? adoMelee  : '—'}</td>
                            <td className="col-ado">{adoPct    !== null ? adoPct    : '—'}</td>
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
      // Find which spearhead group this unit belongs to (for the warscroll viewer slides)
      const unitGroup = visibleGroups.find(g => g.units.some(u => u.id === detailUnit.id));
      const unitSpRules = unitGroup ? spearheadRules[unitGroup.spearheadName] : null;
      const spearheadDataForViewer = unitGroup ? {
        spearheadName:      unitGroup.spearheadName,
        battleTraits:       unitSpRules?.battleTraits      ?? [],
        regimentAbilities:  unitSpRules?.regimentAbilities ?? [],
        enhancements:       unitSpRules?.enhancements      ?? [],
      } : null;
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
          spearheadData={spearheadDataForViewer}
        />
      );
    })()}
    </>
  );
}
