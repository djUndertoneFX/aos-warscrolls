import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SORTABLE_COLS = [
  { key: 'name',          label: 'Unit Name' },
  { key: 'faction',       label: 'Faction' },
  { key: 'grand_alliance',label: 'Alliance' },
  { key: 'move',          label: 'Move' },
  { key: 'health',        label: 'Health' },
  { key: 'control',       label: 'Control' },
  { key: 'save',          label: 'Save' },
  { key: 'points',        label: 'Points' },
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

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <span className="sort-icon">↕</span>;
  return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function WarscrollsPage() {
  const [data, setData]           = useState(null);
  const [factions, setFactions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Filters
  const [search, setSearch]         = useState('');
  const [faction, setFaction]       = useState('');
  const [alliance, setAlliance]     = useState('');
  const [isHero, setIsHero]         = useState(false);
  const [isMonster, setIsMonster]   = useState(false);
  const [hideLegends, setHideLegends] = useState(true);

  // Sort & page
  const [sortBy, setSortBy]   = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 50;

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
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
        search, faction, alliance,
        sortBy, sortDir, page,
        pageSize: PAGE_SIZE,
        ...(isHero    ? { isHero: '1' }    : {}),
        ...(isMonster ? { isMonster: '1' } : {}),
        ...(hideLegends ? { isLegends: '0' } : {}),
      };
      const res = await axios.get('/api/warscrolls', { params });
      setData(res.data);
    } catch (err) {
      setError('Failed to load warscrolls. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [search, faction, alliance, sortBy, sortDir, page, isHero, isMonster, hideLegends]);

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
    setPage(1);
  };

  const filteredFactions = alliance
    ? factions.filter(f => f.grand_alliance === alliance)
    : factions;

  const alliances = ['Order', 'Chaos', 'Death', 'Destruction'];

  return (
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
          <select
            className="filter-select"
            value={faction}
            onChange={e => { setFaction(e.target.value); setPage(1); }}
          >
            <option value="">All Factions</option>
            {filteredFactions.map(f => (
              <option key={f.faction_slug} value={f.faction_slug}>
                {f.faction} ({f.unit_count})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <div className="filter-label">&nbsp;</div>
          <div className="filter-checkbox-group">
            <input
              type="checkbox" id="cb-hero"
              checked={isHero}
              onChange={e => { setIsHero(e.target.checked); setPage(1); }}
            />
            <label htmlFor="cb-hero">Heroes Only</label>
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">&nbsp;</div>
          <div className="filter-checkbox-group">
            <input
              type="checkbox" id="cb-monster"
              checked={isMonster}
              onChange={e => { setIsMonster(e.target.checked); setPage(1); }}
            />
            <label htmlFor="cb-monster">Monsters Only</label>
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-label">&nbsp;</div>
          <div className="filter-checkbox-group">
            <input
              type="checkbox" id="cb-legends"
              checked={hideLegends}
              onChange={e => { setHideLegends(e.target.checked); setPage(1); }}
            />
            <label htmlFor="cb-legends">Hide Legends</label>
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
            <table>
              <thead>
                <tr>
                  {SORTABLE_COLS.map(col => (
                    <th
                      key={col.key}
                      className={`sortable ${sortBy === col.key ? 'sort-active' : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                    </th>
                  ))}
                  <th>Types</th>
                  <th>Keywords</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map(row => (
                  <tr key={row.id}>
                    <td className="col-name">
                      {row.url
                        ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.name}</a>
                        : row.name
                      }
                    </td>
                    <td className="col-faction">{row.faction}</td>
                    <td>
                      {row.grand_alliance && <AllianceBadge alliance={row.grand_alliance} />}
                    </td>
                    <td className="col-stat">{row.move || '—'}</td>
                    <td className="col-stat">{row.health || '—'}</td>
                    <td className="col-stat">{row.control || '—'}</td>
                    <td className="col-stat">{row.save || '—'}</td>
                    <td className="col-stat">{row.points || '—'}</td>
                    <td><TypeTags row={row} /></td>
                    <td className="col-keywords">
                      {row.keywords
                        ? row.keywords.split(',').slice(0, 6).join(', ')
                        : '—'}
                    </td>
                    <td>
                      {row.url && (
                        <a href={row.url} target="_blank" rel="noopener noreferrer"
                           style={{fontSize:'0.75rem', color:'var(--text-dim)'}}>
                          Wahapedia ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
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
  );
}
