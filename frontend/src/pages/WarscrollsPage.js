import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import WarscrollDetail from '../components/WarscrollDetail';

const SORTABLE_COLS = [
  { key: 'name',          label: 'Unit Name', abbr: null },
  { key: 'faction',       label: 'Faction',   abbr: null },
  { key: 'grand_alliance',label: 'Alliance',  abbr: null },
  { key: 'move',          label: 'Move',      abbr: 'Mv' },
  { key: 'health',        label: 'Health',    abbr: 'HP' },
  { key: 'control',       label: 'Control',   abbr: 'Ctrl' },
  { key: 'save',          label: 'Save',      abbr: 'Sv' },
  { key: 'points',        label: 'Points',    abbr: 'Pts' },
];

function AllianceBadge({ alliance }) {
  return (
    <span className={`alliance-badge alliance-${alliance}`}>{alliance}</span>
  );
}

function TypeTags({ row }) {
  const tags = [];
  if (row.is_hero)    tags.push('Hero');
  if (row.is_monster) tags.push('Monster');
  if (row.is_cavalry) tags.push('Cavalry');
  if (row.is_infantry)tags.push('Infantry');
  if (row.is_unique)  tags.push('Unique');
  return (
    <div className="type-tags">
      {tags.map(t => <span key={t} className="type-tag">{t}</span>)}
      {row.is_legends ? <span className="type-tag legends">Legends</span> : null}
    </div>
  );
}

function FactionDropdown({ factions, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = factions.find(f => f.faction_slug === value);
  const label = selected ? `${selected.faction} (${selected.unit_count})` : 'All Factions';

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
        <div className="faction-dropdown-menu">
          <div className={`faction-dropdown-item${value === '' ? ' selected' : ''}`} onMouseDown={() => pick('')}>
            All Factions
          </div>
          {factions.map(f => (
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

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <span className="sort-icon">↕</span>;
  return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function WarscrollsPage() {
  const [data, setData]           = useState(null);
  const [factions, setFactions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // ── Persisted filter state ───────────────────────────────────────────────
  const FILTER_KEY = 'aos-filters';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } })();

  const [search, setSearch]             = useState(saved.search       ?? '');
  const [faction, setFaction]           = useState(saved.faction      ?? '');
  const [enemyFaction, setEnemyFaction] = useState(saved.enemyFaction ?? '');
  const [alliance, setAlliance]         = useState(saved.alliance     ?? '');
  const [isHero, setIsHero]             = useState(saved.isHero       ?? false);
  const [isMonster, setIsMonster]       = useState(saved.isMonster    ?? false);
  const [isInfantry, setIsInfantry]     = useState(saved.isInfantry   ?? false);
  const [isCavalry, setIsCavalry]       = useState(saved.isCavalry    ?? false);
  const [isWarMachine, setIsWarMachine] = useState(saved.isWarMachine ?? false);
  const [isTerrain, setIsTerrain]       = useState(saved.isTerrain    ?? false);
  const [hideLegends, setHideLegends]           = useState(saved.hideLegends        ?? true);
  const [hideOtherFactions, setHideOtherFactions] = useState(saved.hideOtherFactions ?? false);
  const [showFriendly, setShowFriendly] = useState(saved.showFriendly ?? false);
  const [showEnemy, setShowEnemy]       = useState(saved.showEnemy    ?? false);
  const [sortBy, setSortBy]             = useState(saved.sortBy       ?? 'faction');
  const [sortDir, setSortDir]           = useState(saved.sortDir      ?? 'asc');

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({
      search, faction, enemyFaction, alliance,
      isHero, isMonster, isInfantry, isCavalry, isWarMachine, isTerrain,
      hideLegends, hideOtherFactions, showFriendly, showEnemy, sortBy, sortDir,
    }));
  }, [search, faction, enemyFaction, alliance, isHero, isMonster, isInfantry, isCavalry,
      isWarMachine, isTerrain, hideLegends, hideOtherFactions, showFriendly, showEnemy, sortBy, sortDir]);

  // User unit flags: { [warscrollId]: { is_friendly, is_enemy } }
  const [userUnits, setUserUnits] = useState({});

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [detailUnit, setDetailUnit] = useState(null);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Debounced search
  const [searchInput, setSearchInput] = useState(saved.search ?? '');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchFactions = useCallback(async () => {
    try {
      const res = await axios.get('/api/factions');
      setFactions(res.data);
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        search, faction, enemyFaction, alliance,
        sortBy, sortDir, page,
        pageSize: PAGE_SIZE,
        ...(isHero       ? { isHero: '1' }       : {}),
        ...(isMonster    ? { isMonster: '1' }    : {}),
        ...(isInfantry   ? { isInfantry: '1' }  : {}),
        ...(isCavalry    ? { isCavalry: '1' }   : {}),
        ...(isWarMachine ? { isWarMachine: '1' }: {}),
        ...(isTerrain    ? { isTerrain: '1' }   : {}),
        ...(hideLegends        ? { isLegends: '0' }          : {}),
        ...(hideOtherFactions  ? { hideOtherFactions: '1' }  : {}),
        ...(showFriendly ? { showFriendly: '1' } : {}),
        ...(showEnemy    ? { showEnemy: '1' }    : {}),
      };
      const res = await axios.get('/api/warscrolls', { params });
      setData(res.data);
    } catch (err) {
      setError('Failed to load warscrolls. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [search, faction, enemyFaction, alliance, sortBy, sortDir, page, isHero, isMonster, isInfantry, isCavalry, isWarMachine, isTerrain, hideLegends, hideOtherFactions, showFriendly, showEnemy]);

  // Load user's friendly/enemy flags once on mount
  useEffect(() => {
    axios.get('/api/user-units').then(res => {
      const map = {};
      res.data.forEach(r => { map[r.warscroll_id] = { is_friendly: r.is_friendly, is_enemy: r.is_enemy }; });
      setUserUnits(map);
    }).catch(() => {});
  }, []);

  const toggleFlag = useCallback(async (warscrollId, flag) => {
    const current = userUnits[warscrollId] || { is_friendly: 0, is_enemy: 0 };
    const updated = { ...current, [flag]: current[flag] ? 0 : 1 };
    setUserUnits(prev => ({ ...prev, [warscrollId]: updated }));
    try {
      await axios.post(`/api/user-units/${warscrollId}`, updated);
    } catch {
      setUserUnits(prev => ({ ...prev, [warscrollId]: current }));
    }
  }, [userUnits]);

  useEffect(() => { fetchFactions(); }, [fetchFactions]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleAllianceChange = (val) => {
    setAlliance(val);
    setFaction('');
    setEnemyFaction('');
    setPage(1);
  };

  const filteredFactions = (alliance
    ? factions.filter(f => f.grand_alliance === alliance)
    : factions
  ).slice().sort((a, b) => a.faction.localeCompare(b.faction));

  const alliances = ['Order', 'Chaos', 'Death', 'Destruction'];

  // ── Column resizing ──────────────────────────────────────────────────────
  const DEFAULT_COL_WIDTHS = {
    friendly: 38, enemy: 38, expand: 30,
    name: 240, faction: 150, alliance: 82,
    move: 46, health: 46, control: 46, save: 46, points: 52,
    types: 100, keywords: 200,
  };
  const STORAGE_KEY = 'aos-col-widths-v2';
  const [colWidths, setColWidths] = useState(() => {
    try { return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
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
      const newW = Math.max(30, sw + ev.clientX - sx);
      setColWidths(prev => {
        const next = { ...prev, [k]: newW };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

  const thStyle = (key) => ({ width: colWidths[key], minWidth: colWidths[key], position: 'relative' });

  return (
    <>
    <div className="table-page">
      <div className="page-header">
        <div className="page-title">
          Warscrolls
          <span>Age of Sigmar 4th Edition · Data from Wahapedia</span>
        </div>
        {data && (
          <div className="unit-count">
            {data.total.toLocaleString()} units found
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="filters">
        <div className="filter-group">
          <div className="filter-label">Search</div>
          <input
            className="filter-input"
            type="text"
            placeholder="Name, faction, keyword…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div className="filter-label">Grand Alliance</div>
          <select
            className="filter-select"
            value={alliance}
            onChange={e => handleAllianceChange(e.target.value)}
          >
            <option value="">All Alliances</option>
            {alliances.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-label">Faction</div>
          <FactionDropdown
            factions={filteredFactions}
            value={faction}
            onChange={v => { setFaction(v); setPage(1); }}
          />
        </div>

        <div className="filter-group">
          <div className="filter-label">Enemy Faction</div>
          <FactionDropdown
            factions={filteredFactions}
            value={enemyFaction}
            onChange={v => { setEnemyFaction(v); setPage(1); }}
          />
        </div>

        <div className="filter-checkboxes">
          <div className="cb-group cb-group-left">
            <label className="cb-item">
              <input type="checkbox" id="cb-friendly" checked={showFriendly} onChange={e => { setShowFriendly(e.target.checked); setPage(1); }} />
              <span style={{color:'var(--friendly-color)'}}>Friendly</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-enemy" checked={showEnemy} onChange={e => { setShowEnemy(e.target.checked); setPage(1); }} />
              <span style={{color:'var(--enemy-color)'}}>Enemy</span>
            </label>
          </div>
          <div className="cb-group cb-group-center">
            <label className="cb-item">
              <input type="checkbox" id="cb-hero" checked={isHero} onChange={e => { setIsHero(e.target.checked); setPage(1); }} />
              <span>Heroes</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-infantry" checked={isInfantry} onChange={e => { setIsInfantry(e.target.checked); setPage(1); }} />
              <span>Infantry</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-cavalry" checked={isCavalry} onChange={e => { setIsCavalry(e.target.checked); setPage(1); }} />
              <span>Cavalry</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-monster" checked={isMonster} onChange={e => { setIsMonster(e.target.checked); setPage(1); }} />
              <span>Monsters</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-warmachine" checked={isWarMachine} onChange={e => { setIsWarMachine(e.target.checked); setPage(1); }} />
              <span>War Machine</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-terrain" checked={isTerrain} onChange={e => { setIsTerrain(e.target.checked); setPage(1); }} />
              <span>Faction Terrain</span>
            </label>
          </div>
          <div className="cb-group cb-group-right">
            <label className={`cb-item${!faction ? ' cb-disabled' : ''}`} title={!faction ? 'Select a faction first' : ''}>
              <input type="checkbox" id="cb-other-factions" checked={hideOtherFactions} disabled={!faction} onChange={e => { setHideOtherFactions(e.target.checked); setPage(1); }} />
              <span>Hide Other Factions</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" id="cb-legends" checked={hideLegends} onChange={e => { setHideLegends(e.target.checked); setPage(1); }} />
              <span>Hide Legends</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {error && <div className="error-msg" style={{marginBottom:'1rem'}}>{error}</div>}

      {loading ? (
        <div className="loading-state">
          <span className="loading-rune">⚙</span>
          Consulting the Grand Conclave…
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="empty-state">
          No warscrolls found. Try adjusting your filters, or run <code>npm run scrape</code> to populate the database.
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table data-sort={sortBy}>
              <thead>
                <tr>
                  <th style={{...thStyle('friendly'), color:'var(--friendly-color)'}} title="Friendly"><span className="th-abbr" style={{color:'var(--friendly-color)'}}>F</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'friendly')} /></th>
                  <th style={{...thStyle('enemy'), color:'var(--enemy-color)'}} title="Enemy"><span className="th-abbr" style={{color:'var(--enemy-color)'}}>E</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'enemy')} /></th>
                  <th style={thStyle('expand')}><span className="col-resize-handle" onMouseDown={e => startResize(e,'expand')} /></th>
                  {SORTABLE_COLS.map(col => {
                    const keyMap = { name:'name', faction:'faction', grand_alliance:'alliance', move:'move', health:'health', control:'control', save:'save', points:'points' };
                    const wKey = keyMap[col.key] || col.key;
                    return (
                      <th
                        key={col.key}
                        style={thStyle(wKey)}
                        className={`sortable ${sortBy === col.key ? 'sort-active' : ''}`}
                        title={col.abbr ? col.label : undefined}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.abbr ? <span className="th-abbr">{col.abbr}</span> : col.label}
                        <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                        <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e, wKey); }} />
                      </th>
                    );
                  })}
                  <th style={thStyle('types')}>Types<span className="col-resize-handle" onMouseDown={e => startResize(e,'types')} /></th>
                  <th style={thStyle('keywords')}>Keywords<span className="col-resize-handle" onMouseDown={e => startResize(e,'keywords')} /></th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map(row => {
                  const isExpanded = expandedIds.has(row.id);
                  const weapons = (() => { try { return JSON.parse(row.weapons || '[]'); } catch { return []; } })();
                  const ranged = weapons.filter(w => w.type === 'ranged');
                  const melee  = weapons.filter(w => w.type === 'melee');
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={`unit-row${isExpanded ? ' expanded' : ''}`}
                        onClick={() => setExpandedIds(prev => { const s = new Set(prev); isExpanded ? s.delete(row.id) : s.add(row.id); return s; })}
                        style={{cursor:'pointer'}}
                      >
                        <td className="col-flag" onClick={e => { e.stopPropagation(); toggleFlag(row.id, 'is_friendly'); }}>
                          <span className={`flag-check friendly${(userUnits[row.id]?.is_friendly) ? ' active' : ''}`}>✓</span>
                        </td>
                        <td className="col-flag" onClick={e => { e.stopPropagation(); toggleFlag(row.id, 'is_enemy'); }}>
                          <span className={`flag-check enemy${(userUnits[row.id]?.is_enemy) ? ' active' : ''}`}>✓</span>
                        </td>
                        <td>
                          <span className="row-expand-hint">{isExpanded ? '▲' : '▼'}</span>
                        </td>
                        <td className="col-name" onClick={e => { e.stopPropagation(); setDetailUnit(row); }}>
                          <span className="unit-name-link">{row.name}</span>
                        </td>
                        <td className="col-faction">{row.faction}</td>
                        <td>{row.grand_alliance && <AllianceBadge alliance={row.grand_alliance} />}</td>
                        <td className="col-stat">{row.move || '—'}</td>
                        <td className="col-stat">{row.health || '—'}</td>
                        <td className="col-stat">{row.control || '—'}</td>
                        <td className="col-stat">{row.save || '—'}</td>
                        <td className="col-stat">{row.points || '—'}</td>
                        <td><TypeTags row={row} /></td>
                        <td className="col-keywords">
                          {row.keywords ? row.keywords.split(',').slice(0, 6).join(', ') : '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="weapons-expand-row">
                          <td colSpan={13}>
                            <div className="weapons-expand-inner" onClick={e => e.stopPropagation()}>
                              {weapons.length === 0 && <span style={{color:'var(--text-dim)', fontStyle:'italic'}}>No weapon data available.</span>}
                              {ranged.length > 0 && (
                                <div className="inline-weapon-block">
                                  <div className="inline-weapon-section-header">Ranged Weapons</div>
                                  <table className="inline-weapon-table">
                                    <thead><tr>
                                      <th>Weapon</th><th>Range</th><th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th>
                                    </tr></thead>
                                    <tbody>
                                      {ranged.map((w, i) => (
                                        <tr key={i}>
                                          <td>{w.name}</td><td>{w.range}</td><td>{w.attacks}</td>
                                          <td>{w.hit}</td><td>{w.wound}</td><td>{w.rend}</td><td>{w.damage}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {melee.length > 0 && (
                                <div className="inline-weapon-block">
                                  <div className="inline-weapon-section-header">Melee Weapons</div>
                                  <table className="inline-weapon-table">
                                    <thead><tr>
                                      <th>Weapon</th><th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th>
                                    </tr></thead>
                                    <tbody>
                                      {melee.map((w, i) => (
                                        <tr key={i}>
                                          <td>{w.name}</td><td>{w.attacks}</td>
                                          <td>{w.hit}</td><td>{w.wound}</td><td>{w.rend}</td><td>{w.damage}</td>
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
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {data && data.totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={page === 1}
                onClick={() => setPage(1)}
              >«</button>
              <button
                className="page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >‹</button>

              {Array.from({ length: Math.min(7, data.totalPages) }, (_, i) => {
                let p;
                if (data.totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= data.totalPages - 3) {
                  p = data.totalPages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <button
                    key={p}
                    className={`page-btn ${p === page ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >{p}</button>
                );
              })}

              <button
                className="page-btn"
                disabled={page === data.totalPages}
                onClick={() => setPage(p => p + 1)}
              >›</button>
              <button
                className="page-btn"
                disabled={page === data.totalPages}
                onClick={() => setPage(data.totalPages)}
              >»</button>

              <span className="page-info">
                Page {page} of {data.totalPages}
              </span>
            </div>
          )}
        </>
      )}
    </div>

    {detailUnit && <WarscrollDetail unit={detailUnit} onClose={() => setDetailUnit(null)} />}
    </>
  );
}
