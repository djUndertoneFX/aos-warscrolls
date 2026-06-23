import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import WarscrollDetail from '../components/WarscrollDetail';
import { simulateBattle } from '../simulation/engine';

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
  { key: 'move',          label: 'Move',      abbr: 'Mv' },
  { key: 'health',        label: 'Health',    abbr: 'HP' },
  { key: 'control',       label: 'Control',   abbr: 'Ctrl' },
  { key: 'save',          label: 'Save',      abbr: 'Sv' },
  { key: 'points',        label: 'Points',    abbr: 'Pts' },
];

function AllianceBadge({ alliance }) {
  return <span className={`alliance-badge alliance-${alliance}`}>{alliance}</span>;
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

function FactionDropdown({ factions, value, onChange, liveCount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = factions.find(f => f.faction_slug === value);
  const displayCount = (selected && liveCount != null) ? liveCount : selected?.unit_count;
  const label = selected ? `${selected.faction} (${displayCount})` : 'All Factions';

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
            <div key={f.faction_slug} className={`faction-dropdown-item${value === f.faction_slug ? ' selected' : ''}`} onMouseDown={() => pick(f.faction_slug)}>
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

const STAGES = [
  { id: 1, label: 'Select two Units.' },
  { id: 2, label: 'SimulacEm!' },
];

function SimulacrumBattle({ friendly, enemy, colWidths, thStyle }) {
  const renderRow = (row, label) => {
    const weapons = (() => { try { return JSON.parse(row.weapons || '[]'); } catch { return []; } })();
    const ranged = weapons.filter(w => w.type === 'ranged');
    const melee  = weapons.filter(w => w.type === 'melee');
    return (
      <React.Fragment key={label}>
        <tr className={`unit-row expanded sim-battle-row sim-battle-${label}`}>
          <td className="col-rownum" style={{color: label==='friendly'?'var(--friendly-color)':'var(--enemy-color)', fontWeight:700, textAlign:'center'}}>
            {label === 'friendly' ? 'F' : 'E'}
          </td>
          <td style={{color: label==='friendly'?'var(--friendly-color)':'var(--enemy-color)', fontWeight:700, textAlign:'center'}}></td>
          <td style={{color: label==='friendly'?'var(--friendly-color)':'var(--enemy-color)', fontWeight:700, textAlign:'center'}}></td>
          <td></td>
          <td className="col-name"><span className="unit-name-link">{row.name}</span></td>
          <td className="col-thumb">
            <img src={`${axios.defaults.baseURL || ''}/api/unit-image/${row.id}`} alt="" className="thumb-img"
              onError={e => { e.target.style.display='none'; }} />
          </td>
          <td className="col-faction">{row.faction}</td>
          <td>{row.grand_alliance && <AllianceBadge alliance={row.grand_alliance} />}</td>
          <td className="col-stat">{row.move || '—'}</td>
          <td className="col-stat">{row.health || '—'}</td>
          <td className="col-stat">{row.control || '—'}</td>
          <td className="col-stat">{row.save || '—'}</td>
          <td className="col-stat">{row.points || '—'}</td>
          <td><TypeTags row={row} /></td>
          <td className="col-keywords">{row.keywords ? row.keywords.split(',').slice(0,6).join(', ') : '—'}</td>
        </tr>
        <tr className="weapons-expand-row">
          <td colSpan={15}>
            <div className="weapons-expand-inner" onClick={e => e.stopPropagation()}>
              {weapons.length === 0 && <span style={{color:'var(--text-dim)',fontStyle:'italic'}}>No weapon data available.</span>}
              {ranged.length > 0 && (
                <div className="inline-weapon-block">
                  <div className="inline-weapon-section-header">Ranged Weapons</div>
                  <table className="inline-weapon-table"><thead><tr>
                    <th>Weapon</th><th>Range</th><th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th>
                  </tr></thead><tbody>
                    {ranged.map((w,i) => <tr key={i}><td>{w.name}</td><td>{w.range}</td><td>{w.attacks}</td><td>{w.hit}</td><td>{w.wound}</td><td>{w.rend}</td><td>{w.damage}</td></tr>)}
                  </tbody></table>
                </div>
              )}
              {melee.length > 0 && (
                <div className="inline-weapon-block">
                  <div className="inline-weapon-section-header">Melee Weapons</div>
                  <table className="inline-weapon-table"><thead><tr>
                    <th>Weapon</th><th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th>
                  </tr></thead><tbody>
                    {melee.map((w,i) => <tr key={i}><td>{w.name}</td><td>{w.attacks}</td><td>{w.hit}</td><td>{w.wound}</td><td>{w.rend}</td><td>{w.damage}</td></tr>)}
                  </tbody></table>
                </div>
              )}
            </div>
          </td>
        </tr>
      </React.Fragment>
    );
  };

  return (
    <div className="table-wrapper sim-battle-wrapper">
      <table>
        <thead>
          <tr>
            <th style={thStyle('rownum')}><span className="th-abbr" style={{color:'var(--text-dim)'}}>#</span></th>
            <th style={thStyle('friendly')}><span className="th-abbr" style={{color:'var(--friendly-color)'}}>F</span></th>
            <th style={thStyle('enemy')}><span className="th-abbr" style={{color:'var(--enemy-color)'}}>E</span></th>
            <th style={thStyle('expand')}></th>
            {SORTABLE_COLS.map(col => {
              const keyMap = {name:'name',faction:'faction',grand_alliance:'alliance',move:'move',health:'health',control:'control',save:'save',points:'points'};
              const wKey = keyMap[col.key] || col.key;
              return (
                <React.Fragment key={col.key}>
                  <th style={thStyle(wKey)}>{col.abbr ? <span className="th-abbr">{col.abbr}</span> : col.label}</th>
                  {col.key === 'name' && <th style={thStyle('thumb')}></th>}
                </React.Fragment>
              );
            })}
            <th style={thStyle('types')}>Types</th>
            <th style={thStyle('keywords')}>Keywords</th>
          </tr>
        </thead>
        <tbody>
          {renderRow(friendly, 'friendly')}
          {renderRow(enemy, 'enemy')}
        </tbody>
      </table>
    </div>
  );
}

function RitualErrorModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">The ritual has resulted in Demons eating souls.</h2>
        <p className="modal-body">You have not provided the correct reagents… Select Two Units… to see how they fare in mortal battle against one another!</p>
        <button className="modal-ok" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

// Map step type to CSS class suffix
const TYPE_CLASS = {
  title: 'log-title', divider: 'log-divider', round: 'log-round', phase: 'log-phase',
  info: 'log-info', fight: 'log-fight', weapon: 'log-weapon',
  hit: 'log-hit', miss: 'log-miss', crit: 'log-crit',
  wound: 'log-wound', saved: 'log-saved', damage: 'log-damage',
  hp: 'log-hp', status: 'log-status', victory: 'log-victory', draw: 'log-draw',
  spacer: 'log-spacer', normal: '',
};

function winnerSummary(result, friendlyUnit, enemyUnit) {
  if (!result) return null;
  const { winner, isMultiBattle, fWins, eWins, draws, count } = result;

  if (isMultiBattle) {
    const side = winner.side;
    if (side === 'friendly') {
      return {
        label: `Friendly Unit "${friendlyUnit.name}" wins more often!`,
        detail: `${fWins} / ${count} battles (${((fWins/count)*100).toFixed(1)}% win rate)`,
        side: 'friendly',
      };
    } else if (side === 'enemy') {
      return {
        label: `Enemy Unit "${enemyUnit.name}" wins more often!`,
        detail: `${eWins} / ${count} battles (${((eWins/count)*100).toFixed(1)}% win rate)`,
        side: 'enemy',
      };
    } else {
      return { label: 'Evenly Matched!', detail: `${fWins} friendly / ${eWins} enemy / ${draws} draws over ${count} battles`, side: 'draw' };
    }
  }

  const { side } = winner;
  if (side === 'friendly') {
    return {
      label: `Friendly Unit "${friendlyUnit.name}" stands Victorious!`,
      detail: `With ${winner.hpRemaining} HP remaining and ${winner.damageTaken} damage taken.`,
      side: 'friendly',
    };
  } else if (side === 'enemy') {
    return {
      label: `Enemy Unit "${enemyUnit.name}" stands Victorious!`,
      detail: `With ${winner.hpRemaining} HP remaining and ${winner.damageTaken} damage taken.`,
      side: 'enemy',
    };
  } else if (side === 'mutual') {
    return { label: 'Mutual Destruction!', detail: 'Both units fell simultaneously.', side: 'draw' };
  } else {
    return { label: 'Stalemate!', detail: `Neither unit fell after ${winner.rounds} rounds.`, side: 'draw' };
  }
}

function saveLog(steps, paneLabel) {
  const text = steps.map(s => s.msg).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `simulacrum-${paneLabel.replace(/\s+/g, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function BattlePane({ label, result, friendlyUnit, enemyUnit, stepIndex, isStepThrough }) {
  const logRef = useRef(null);

  const summary = result ? winnerSummary(result, friendlyUnit, enemyUnit) : null;
  const allSteps = result?.steps || [];
  const visibleSteps = isStepThrough ? allSteps.slice(0, stepIndex) : allSteps;
  const isComplete = !isStepThrough || stepIndex >= allSteps.length;

  // Auto-scroll log to bottom as steps appear
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleSteps.length]);

  return (
    <div className="battle-pane">
      <div className="battle-pane-header">{label}</div>
      <div className="battle-pane-summary">
        {summary ? (
          <>
            <div className={`battle-winner battle-winner-${summary.side}`}>{summary.label}</div>
            <div className="battle-winner-detail">{summary.detail}</div>
          </>
        ) : (
          <div className="battle-winner-placeholder">Awaiting battle…</div>
        )}
      </div>
      <div className="battle-pane-log" ref={logRef}>
        {visibleSteps.map((step, i) =>
          step.type === 'spacer'
            ? <div key={i} className="log-spacer" />
            : <div key={i} className={`log-line ${TYPE_CLASS[step.type] || ''}`}>{step.msg}</div>
        )}
        {isStepThrough && !isComplete && result && (
          <div className="log-line log-dim">— {allSteps.length - stepIndex} steps remaining —</div>
        )}
      </div>
      {result && (
        <button className="btn-save-log" onClick={() => saveLog(allSteps, label)}>
          ⬇ Save Log
        </button>
      )}
    </div>
  );
}

const BATTLE_COUNT_OPTS = [
  { val: '1',       label: 'Fight Once' },
  { val: '10',      label: 'Ten Battles' },
  { val: '100',     label: 'A Hundred Battles' },
  { val: '1000',    label: 'A Thousand Battles!' },
  { val: 'forever', label: 'Till the Next Version of Age of Sigmar!' },
];

export default function SimulacrumPage({ headerCollapsed }) {
  const [stage, setStage]           = useState(1);
  const [selectedFriendly, setSelectedFriendly] = useState(null);
  const [selectedEnemy, setSelectedEnemy]       = useState(null);
  const [showRitualError, setShowRitualError]   = useState(false);
  const [battleMode, setBattleMode]   = useState('server');
  const [battleCount, setBattleCount] = useState('1');
  const [simSpeed, setSimSpeed] = useState('hasted'); // 'hasted' | 'slog'

  // Battle results: { left: SimResult, right: SimResult }
  const [battleResults, setBattleResults] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);

  const [data, setData]           = useState(null);
  const [factions, setFactions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const FILTER_KEY = 'aos-sim-filters';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } })();

  const [search, setSearch]             = useState(saved.search       ?? '');
  const [faction, setFaction]           = useState(saved.faction      ?? '');
  const [enemyFaction, setEnemyFaction] = useState(saved.enemyFaction ?? '');
  const [alliance, setAlliance]         = useState(saved.alliance     ?? '');
  const [isHero, setIsHero]             = useState(saved.isHero       ?? false);
  const [isMonster, setIsMonster]       = useState(saved.isMonster    ?? false);
  const [isInfantry, setIsInfantry]     = useState(saved.isInfantry   ?? false);
  const [isCavalry, setIsCavalry]       = useState(saved.isCavalry    ?? false);
  const [isBeast, setIsBeast]           = useState(saved.isBeast       ?? false);
  const [isWarMachine, setIsWarMachine] = useState(saved.isWarMachine ?? false);
  const [isTerrain, setIsTerrain]       = useState(saved.isTerrain    ?? false);
  const [isManifestation, setIsManifestation] = useState(saved.isManifestation ?? false);
  const [hideLegends, setHideLegends]                 = useState(saved.hideLegends           ?? true);
  const [hideOtherFactions, setHideOtherFactions]     = useState(saved.hideOtherFactions     ?? false);
  const [hideScourgeOfGhyran, setHideScourgeOfGhyran] = useState(saved.hideScourgeOfGhyran   ?? false);
  const [showFriendly, setShowFriendly] = useState(saved.showFriendly ?? false);
  const [showEnemy, setShowEnemy]       = useState(saved.showEnemy    ?? false);
  const [sortBy, setSortBy]             = useState(saved.sortBy       ?? 'faction');
  const [sortDir, setSortDir]           = useState(saved.sortDir      ?? 'asc');

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({
      search, faction, enemyFaction, alliance,
      isHero, isMonster, isInfantry, isCavalry, isBeast, isWarMachine, isTerrain, isManifestation,
      hideLegends, hideOtherFactions, hideScourgeOfGhyran, showFriendly, showEnemy, sortBy, sortDir,
    }));
  }, [search, faction, enemyFaction, alliance, isHero, isMonster, isInfantry, isCavalry,
      isBeast, isWarMachine, isTerrain, isManifestation, hideLegends, hideOtherFactions, hideScourgeOfGhyran, showFriendly, showEnemy, sortBy, sortDir]);

  const [filteredCounts, setFilteredCounts] = useState({});
  useEffect(() => {
    if (!hideOtherFactions) { setFilteredCounts({}); return; }
    const slugs = [faction, enemyFaction].filter(Boolean);
    if (slugs.length === 0) { setFilteredCounts({}); return; }
    Promise.all(
      slugs.map(slug =>
        axios.get('/api/warscrolls', { params: { faction: slug, hideOtherFactions: '1', pageSize: 1, page: 1, ...(hideLegends ? { isLegends: '0' } : {}), ...(hideScourgeOfGhyran ? { hideScourgeOfGhyran: '1' } : {}) } })
          .then(r => [slug, r.data.total])
          .catch(() => [slug, null])
      )
    ).then(entries => setFilteredCounts(Object.fromEntries(entries)));
  }, [hideOtherFactions, faction, enemyFaction, hideLegends, hideScourgeOfGhyran]);

  const [userUnits, setUserUnits] = useState({});
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [detailUnit, setDetailUnit] = useState(null);
  const [thumbHover, setThumbHover] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 9999;

  const [searchInput, setSearchInput] = useState(saved.search ?? '');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchFactions = useCallback(async () => {
    try { const res = await axios.get('/api/factions'); setFactions(res.data); } catch {}
  }, []);

  const hasFriendlyMarks = Object.values(userUnits).some(u => u.is_friendly);
  const hasEnemyMarks    = Object.values(userUnits).some(u => u.is_enemy);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const friendlyByFaction = showFriendly && !hasFriendlyMarks;
      const enemyByFaction    = showEnemy    && !hasEnemyMarks;
      let qFaction      = faction;
      let qEnemyFaction = enemyFaction;
      if (friendlyByFaction && !enemyByFaction && !showEnemy) qEnemyFaction = '';
      if (enemyByFaction    && !friendlyByFaction && !showFriendly) qFaction = '';

      const params = {
        search, faction: qFaction, enemyFaction: qEnemyFaction, alliance,
        sortBy, sortDir, page, pageSize: PAGE_SIZE,
        ...(triParam(isHero)          ? { isHero:          triParam(isHero)          } : {}),
        ...(triParam(isMonster)       ? { isMonster:       triParam(isMonster)       } : {}),
        ...(triParam(isInfantry)      ? { isInfantry:      triParam(isInfantry)      } : {}),
        ...(triParam(isCavalry)       ? { isCavalry:       triParam(isCavalry)       } : {}),
        ...(triParam(isBeast)         ? { isBeast:         triParam(isBeast)         } : {}),
        ...(triParam(isWarMachine)    ? { isWarMachine:    triParam(isWarMachine)    } : {}),
        ...(triParam(isTerrain)       ? { isTerrain:       triParam(isTerrain)       } : {}),
        ...(triParam(isManifestation) ? { isManifestation: triParam(isManifestation) } : {}),
        ...(hideLegends          ? { isLegends: '0' }             : {}),
        ...(hideOtherFactions    ? { hideOtherFactions: '1' }    : {}),
        ...(hideScourgeOfGhyran  ? { hideScourgeOfGhyran: '1' }  : {}),
        ...(showFriendly && hasFriendlyMarks ? { showFriendly: '1' } : {}),
        ...(showEnemy    && hasEnemyMarks    ? { showEnemy: '1' }    : {}),
      };
      const res = await axios.get('/api/warscrolls', { params });
      setData(res.data);
    } catch (err) {
      if (err.response?.status === 401) setError('Session expired. Please sign out and log back in.');
      else setError('Failed to load warscrolls. Is the backend running?');
    } finally { setLoading(false); }
  }, [search, faction, enemyFaction, alliance, sortBy, sortDir, page, isHero, isMonster, isInfantry, isCavalry, isBeast, isWarMachine, isTerrain, isManifestation, hideLegends, hideOtherFactions, hideScourgeOfGhyran, showFriendly, showEnemy, hasFriendlyMarks, hasEnemyMarks]);

  useEffect(() => { axios.get('/api/user-units').then(res => { const map = {}; res.data.forEach(r => { map[r.warscroll_id] = { is_friendly: r.is_friendly, is_enemy: r.is_enemy }; }); setUserUnits(map); }).catch(() => {}); }, []);
  useEffect(() => { fetchFactions(); }, [fetchFactions]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };

  const handleAllianceChange = (val) => { setAlliance(val); setFaction(''); setEnemyFaction(''); setPage(1); };

  const filteredFactions = (alliance ? factions.filter(f => f.grand_alliance === alliance) : factions)
    .slice().sort((a, b) => a.faction.localeCompare(b.faction));
  const alliances = ['Order', 'Chaos', 'Death', 'Destruction'];

  const DEFAULT_COL_WIDTHS = {
    rownum: 36, friendly: 38, enemy: 38, expand: 30, thumb: 44,
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
    const startX = e.clientX, startW = colWidths[colKey];
    dragRef.current = { colKey, startX, startW };
    const onMove = (ev) => {
      const { colKey: k, startX: sx, startW: sw } = dragRef.current;
      const newW = Math.max(30, sw + ev.clientX - sx);
      setColWidths(prev => { const next = { ...prev, [k]: newW }; localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return next; });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const thStyle = (key) => ({ width: colWidths[key], minWidth: colWidths[key], position: 'relative' });

  const [navbarExtrasEl, setNavbarExtrasEl] = useState(null);
  useEffect(() => { setNavbarExtrasEl(headerCollapsed ? document.getElementById('navbar-extras') : null); }, [headerCollapsed]);

  // ── Numpad Enter hotkey for step-through ────────────────────────────────
  const stepThrough = simSpeed === 'slog';
  const maxStepIndex = battleResults
    ? Math.max(battleResults.left?.steps?.length || 0, battleResults.right?.steps?.length || 0)
    : 0;
  const canProceed = stepThrough && battleResults && stepIndex < maxStepIndex;

  const proceed = useCallback(() => {
    if (canProceed) setStepIndex(i => i + 1);
  }, [canProceed]);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'NumpadEnter' || (e.code === 'Enter' && e.altKey)) proceed();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [proceed]);

  // ── Run simulation ───────────────────────────────────────────────────────
  const runFight = () => {
    const count = battleCount === 'forever' ? 10000 : parseInt(battleCount) || 1;
    const leftResult  = simulateBattle(selectedFriendly, selectedEnemy, { count, friendlyFirst: true });
    const rightResult = simulateBattle(selectedFriendly, selectedEnemy, { count, friendlyFirst: false });
    setBattleResults({ left: leftResult, right: rightResult });
    setStepIndex(0);
  };

  const showBattleResults = !!battleResults;

  return (
    <>
    {thumbHover && ReactDOM.createPortal(
      <div className="thumb-popup-fixed" style={{ left: thumbHover.x + 16, top: thumbHover.y + 16 }}>
        <img src={`${axios.defaults.baseURL || ''}/api/unit-image/${thumbHover.id}`} alt="" onError={e => { e.target.style.display='none'; }} />
      </div>,
      document.body
    )}
    <div className="table-page">
      {!headerCollapsed && (
      <>
      <div className="page-header">
        <div className="page-title">
          Simulacrum
          <span>Age of Sigmar 4th Edition · Data from Wahapedia</span>
        </div>
        <div className="sim-stages">
          <button className={`sim-stage-btn${stage === 1 ? ' sim-stage-active' : ''}`} onClick={() => { setStage(1); setBattleResults(null); }}>
            1. Select two Units.
          </button>
          <span className="sim-stage-arrow">›</span>
          <button
            className={`sim-stage-btn${stage === 2 ? ' sim-stage-active' : ''}`}
            onClick={() => {
              if (!selectedFriendly || !selectedEnemy) setShowRitualError(true);
              else setStage(2);
            }}
          >
            2. SimulacEm!
          </button>
        </div>
        {stage === 1 && data && <div className="unit-count">{data.total.toLocaleString()} units found</div>}
      </div>

      {/* ── Stage 2 options bar ── */}
      {stage === 2 && (
        <div className="sim-fight-bar">
          <button className="btn-fight-eternity" onClick={runFight}>⚔ Fight for Eternity</button>
          {stepThrough && showBattleResults && (
            <button
              className={`btn-proceed${canProceed ? '' : ' btn-proceed-done'}`}
              onClick={proceed}
              disabled={!canProceed}
              title="Numpad Enter"
            >
              {canProceed ? '▶ Proceed' : '✓ Done'}
            </button>
          )}
          <div className="sim-fight-options">
            <div className="sim-fight-section">
              {[{val:'local',label:'On our soil!'},{val:'server',label:'Summon the Gods.'}].map(opt => (
                <label key={opt.val} className={`sim-radio${battleMode===opt.val?' sim-radio-active':''}`}>
                  <input type="radio" name="battleMode" value={opt.val} checked={battleMode===opt.val} onChange={() => setBattleMode(opt.val)} />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="sim-fight-section sim-fight-counts">
              {BATTLE_COUNT_OPTS.map(opt => (
                <label key={opt.val} className={`sim-radio${battleCount===opt.val?' sim-radio-active':''}`}>
                  <input type="radio" name="battleCount" value={opt.val} checked={battleCount===opt.val} onChange={() => setBattleCount(opt.val)} />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="sim-fight-stepthrough">
              {[{val:'hasted',label:'Hasted'},{val:'slog',label:'Slog it out.'}].map(opt => (
                <label key={opt.val} className={`sim-radio${simSpeed===opt.val?' sim-radio-active':''}`}>
                  <input type="radio" name="simSpeed" value={opt.val} checked={simSpeed===opt.val} onChange={() => { setSimSpeed(opt.val); setStepIndex(0); }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Stage 1 filters ── */}
      {stage === 1 && <div className="filters">
        <div className="filter-group">
          <div className="filter-label">Search</div>
          <input className="filter-input" type="text" placeholder="Name, faction, keyword…" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        </div>
        <div className="filter-group">
          <div className="filter-label">Grand Alliance</div>
          <select className="filter-select" value={alliance} onChange={e => handleAllianceChange(e.target.value)}>
            <option value="">All Alliances</option>
            {alliances.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <div className="filter-label">Faction</div>
          <FactionDropdown factions={filteredFactions} value={faction} onChange={v => { setFaction(v); setPage(1); }} liveCount={faction ? (enemyFaction ? filteredCounts[faction] : data?.total) : undefined} />
        </div>
        <div className="filter-group">
          <div className="filter-label">Enemy Faction</div>
          <FactionDropdown factions={filteredFactions} value={enemyFaction} onChange={v => { setEnemyFaction(v); setPage(1); }} liveCount={enemyFaction ? (faction ? filteredCounts[enemyFaction] : data?.total) : undefined} />
        </div>
        <div className="filter-checkboxes">
          <div className="cb-group cb-group-left">
            <label className="cb-item">
              <input type="checkbox" checked={showFriendly} onChange={e => { setShowFriendly(e.target.checked); setPage(1); }} />
              <span style={{color:'var(--friendly-color)'}}>Friendly</span>
            </label>
            <button className={`btn-both-toggle${showFriendly !== showEnemy ? ' active' : ''}`} onClick={() => { setShowFriendly(showEnemy); setShowEnemy(showFriendly); setPage(1); }}>⇔</button>
            <label className="cb-item">
              <input type="checkbox" checked={showEnemy} onChange={e => { setShowEnemy(e.target.checked); setPage(1); }} />
              <span style={{color:'var(--enemy-color)'}}>Enemy</span>
            </label>
          </div>
          <div className="cb-group cb-group-center">
            <TriCheckbox value={isHero}          onChange={v => { setIsHero(v);          setPage(1); }} label="Heroes"         />
            <TriCheckbox value={isInfantry}      onChange={v => { setIsInfantry(v);      setPage(1); }} label="Infantry"       />
            <TriCheckbox value={isCavalry}       onChange={v => { setIsCavalry(v);       setPage(1); }} label="Cavalry"        />
            <TriCheckbox value={isBeast}         onChange={v => { setIsBeast(v);         setPage(1); }} label="Beast"          />
            <TriCheckbox value={isMonster}       onChange={v => { setIsMonster(v);       setPage(1); }} label="Monsters"       />
            <TriCheckbox value={isWarMachine}    onChange={v => { setIsWarMachine(v);    setPage(1); }} label="War Machine"    />
            <TriCheckbox value={isTerrain}       onChange={v => { setIsTerrain(v);       setPage(1); }} label="Faction Terrain"/>
            <TriCheckbox value={isManifestation} onChange={v => { setIsManifestation(v); setPage(1); }} label="Manifestation"  />
          </div>
          <div className="cb-group cb-group-right">
            <div className="cb-group-header">Hide:</div>
            <label className="cb-item">
              <input type="checkbox" checked={hideScourgeOfGhyran} onChange={e => { setHideScourgeOfGhyran(e.target.checked); setPage(1); }} />
              <span>Scourge of Ghyran</span>
            </label>
            <label className={`cb-item${!faction ? ' cb-disabled' : ''}`} title={!faction ? 'Select a faction first' : ''}>
              <input type="checkbox" checked={hideOtherFactions} disabled={!faction} onChange={e => { setHideOtherFactions(e.target.checked); setPage(1); }} />
              <span>Other Factions</span>
            </label>
            <label className="cb-item">
              <input type="checkbox" checked={hideLegends} onChange={e => { setHideLegends(e.target.checked); setPage(1); }} />
              <span>Legends</span>
            </label>
          </div>
        </div>
      </div>}
      </>
      )}

      {/* ── Stage 2: battle view ── */}
      {stage === 2 && (
        <>
          <SimulacrumBattle friendly={selectedFriendly} enemy={selectedEnemy} colWidths={colWidths} startResize={startResize} thStyle={thStyle} />
          {showBattleResults && (
            <div className="battle-results">
              <BattlePane
                label="Take their heads!"
                result={battleResults?.left}
                friendlyUnit={selectedFriendly}
                enemyUnit={selectedEnemy}
                stepIndex={stepIndex}
                isStepThrough={stepThrough}
              />
              <div className="battle-divider" />
              <BattlePane
                label="Caught off guard!"
                result={battleResults?.right}
                friendlyUnit={selectedFriendly}
                enemyUnit={selectedEnemy}
                stepIndex={stepIndex}
                isStepThrough={stepThrough}
              />
            </div>
          )}
        </>
      )}

      {/* ── Stage 1: Table ── */}
      {stage === 1 && error && <div className="error-msg" style={{marginBottom:'1rem'}}>{error}</div>}
      {stage === 1 && (<>{loading ? (
        <div className="loading-state"><span className="loading-rune">⚙</span>Consulting the Grand Conclave…</div>
      ) : data && data.data.length === 0 ? (
        <div className="empty-state">No warscrolls found. Try adjusting your filters.</div>
      ) : (
        <div className="table-wrapper">
          <table data-sort={sortBy}>
            <thead>
              <tr>
                <th style={{...thStyle('rownum'), textAlign:'right'}} title="Row number"><span className="th-abbr" style={{color:'var(--text-dim)'}}>#</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'rownum')} /></th>
                <th style={{...thStyle('friendly'), color:'var(--friendly-color)'}} title="Friendly"><span className="th-abbr" style={{color:'var(--friendly-color)'}}>F</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'friendly')} /></th>
                <th style={{...thStyle('enemy'), color:'var(--enemy-color)'}} title="Enemy"><span className="th-abbr" style={{color:'var(--enemy-color)'}}>E</span><span className="col-resize-handle" onMouseDown={e => startResize(e,'enemy')} /></th>
                <th style={thStyle('expand')}><span className="col-resize-handle" onMouseDown={e => startResize(e,'expand')} /></th>
                {SORTABLE_COLS.map(col => {
                  const keyMap = { name:'name', faction:'faction', grand_alliance:'alliance', move:'move', health:'health', control:'control', save:'save', points:'points' };
                  const wKey = keyMap[col.key] || col.key;
                  return (
                    <React.Fragment key={col.key}>
                      <th style={thStyle(wKey)} className={`sortable ${sortBy === col.key ? 'sort-active' : ''}`} title={col.abbr ? col.label : undefined} onClick={() => handleSort(col.key)}>
                        {col.abbr ? <span className="th-abbr">{col.abbr}</span> : col.label}
                        <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                        <span className="col-resize-handle" onMouseDown={e => { e.stopPropagation(); startResize(e, wKey); }} />
                      </th>
                      {col.key === 'name' && <th style={thStyle('thumb')}><span className="col-resize-handle" onMouseDown={e => startResize(e,'thumb')} /></th>}
                    </React.Fragment>
                  );
                })}
                <th style={thStyle('types')}>Types<span className="col-resize-handle" onMouseDown={e => startResize(e,'types')} /></th>
                <th style={thStyle('keywords')}>Keywords<span className="col-resize-handle" onMouseDown={e => startResize(e,'keywords')} /></th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((row, idx) => {
                const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                const isExpanded = expandedIds.has(row.id);
                const weapons = (() => { try { return JSON.parse(row.weapons || '[]'); } catch { return []; } })();
                const ranged = weapons.filter(w => w.type === 'ranged');
                const melee  = weapons.filter(w => w.type === 'melee');
                const prev = data.data[idx - 1];
                const factionChanged = !prev || prev.faction !== row.faction;
                const typeChanged    = !prev || prev.faction !== row.faction || unitTypeLabel(prev) !== unitTypeLabel(row);
                const colSpan = 14;
                return (
                  <React.Fragment key={row.id}>
                    {factionChanged && sortBy === 'faction' && <tr className="separator-faction"><td colSpan={colSpan}>{row.faction}</td></tr>}
                    {typeChanged    && sortBy === 'faction' && <tr className="separator-type"><td colSpan={colSpan}>{unitTypeLabel(row)}</td></tr>}
                    <tr className={`unit-row${isExpanded ? ' expanded' : ''}`} onClick={() => setExpandedIds(prev => { const s = new Set(prev); isExpanded ? s.delete(row.id) : s.add(row.id); return s; })} style={{cursor:'pointer'}}>
                      <td className="col-rownum">{rowNum}</td>
                      <td className="col-flag" onClick={e => { e.stopPropagation(); setSelectedFriendly(f => f?.id === row.id ? null : row); }}>
                        <span className={`flag-check friendly${selectedFriendly?.id === row.id ? ' active' : ''}`}>✓</span>
                      </td>
                      <td className="col-flag" onClick={e => { e.stopPropagation(); setSelectedEnemy(f => f?.id === row.id ? null : row); }}>
                        <span className={`flag-check enemy${selectedEnemy?.id === row.id ? ' active' : ''}`}>✓</span>
                      </td>
                      <td><span className="row-expand-hint">{isExpanded ? '▲' : '▼'}</span></td>
                      <td className="col-name" onClick={e => { e.stopPropagation(); setDetailUnit(row); }}><span className="unit-name-link">{row.name}</span></td>
                      <td className="col-thumb">
                        <img src={`${axios.defaults.baseURL || ''}/api/unit-image/${row.id}`} alt="" className="thumb-img" loading="lazy"
                          onMouseEnter={e => setThumbHover({ id: row.id, x: e.clientX, y: e.clientY })}
                          onMouseMove={e => setThumbHover(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                          onMouseLeave={() => setThumbHover(null)}
                          onError={e => { e.target.style.display='none'; }} />
                      </td>
                      <td className="col-faction">{row.faction}</td>
                      <td>{row.grand_alliance && <AllianceBadge alliance={row.grand_alliance} />}</td>
                      <td className="col-stat">{row.move || '—'}</td>
                      <td className="col-stat">{row.health || '—'}</td>
                      <td className="col-stat">{row.control || '—'}</td>
                      <td className="col-stat">{row.save || '—'}</td>
                      <td className="col-stat">{row.points || '—'}</td>
                      <td><TypeTags row={row} /></td>
                      <td className="col-keywords">{row.keywords ? row.keywords.split(',').slice(0,6).join(', ') : '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="weapons-expand-row">
                        <td colSpan={15}>
                          <div className="weapons-expand-inner" onClick={e => e.stopPropagation()}>
                            {weapons.length === 0 && <span style={{color:'var(--text-dim)',fontStyle:'italic'}}>No weapon data available.</span>}
                            {ranged.length > 0 && (
                              <div className="inline-weapon-block">
                                <div className="inline-weapon-section-header">Ranged Weapons</div>
                                <table className="inline-weapon-table"><thead><tr><th>Weapon</th><th>Range</th><th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th></tr></thead>
                                <tbody>{ranged.map((w,i) => <tr key={i}><td>{w.name}</td><td>{w.range}</td><td>{w.attacks}</td><td>{w.hit}</td><td>{w.wound}</td><td>{w.rend}</td><td>{w.damage}</td></tr>)}</tbody></table>
                              </div>
                            )}
                            {melee.length > 0 && (
                              <div className="inline-weapon-block">
                                <div className="inline-weapon-section-header">Melee Weapons</div>
                                <table className="inline-weapon-table"><thead><tr><th>Weapon</th><th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th></tr></thead>
                                <tbody>{melee.map((w,i) => <tr key={i}><td>{w.name}</td><td>{w.attacks}</td><td>{w.hit}</td><td>{w.wound}</td><td>{w.rend}</td><td>{w.damage}</td></tr>)}</tbody></table>
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
      )}</>)}
    </div>

    {showRitualError && <RitualErrorModal onClose={() => { setShowRitualError(false); setStage(1); }} />}
    {detailUnit && <WarscrollDetail unit={detailUnit} onClose={() => setDetailUnit(null)} />}
    </>
  );
}
