import React, { useEffect, useState } from 'react';
import axios from 'axios';

// ── Phase colour mapping ─────────────────────────────────────────────────────
const PHASE_PRESETS = [
  { keys: ['passive'],              style: { hdrBg: '#3d2a0e', hdrTxt: '#f0dc88', border: '#8a6428' } },
  { keys: ['any combat', 'combat'], style: { hdrBg: '#6a0c0c', hdrTxt: '#fde8e0', border: '#c03030' } },
  { keys: ['hero phase'],           style: { hdrBg: '#4e3800', hdrTxt: '#f8f0c0', border: '#b07c18' } },
  { keys: ['movement', 'move phase'],style:{ hdrBg: '#0a3e28', hdrTxt: '#b8f0d8', border: '#1a7850' } },
  { keys: ['shooting'],             style: { hdrBg: '#0a2850', hdrTxt: '#c0d8f8', border: '#2858b8' } },
  { keys: ['once per battle'],      style: { hdrBg: '#480838', hdrTxt: '#f0c8e8', border: '#901870' } },
  { keys: ['deployment'],           style: { hdrBg: '#200c50', hdrTxt: '#d0c8f8', border: '#5040b0' } },
  { keys: ['end of battle', 'end of turn'], style: { hdrBg: '#181818', hdrTxt: '#b8b8b8', border: '#484848' } },
  { keys: ['reaction', 'any phase'],style: { hdrBg: '#183828', hdrTxt: '#c0f0e0', border: '#2a7050' } },
];
const PHASE_DEFAULT = { hdrBg: '#242018', hdrTxt: '#d0d0b8', border: '#585838' };

function getPhaseStyle(timing) {
  if (!timing) return PHASE_PRESETS[0].style; // passive
  const t = timing.toLowerCase();
  for (const { keys, style } of PHASE_PRESETS) {
    if (keys.some(k => t.includes(k))) return style;
  }
  return PHASE_DEFAULT;
}

// ── Stats Wheel (SVG) ────────────────────────────────────────────────────────
function StatsWheel({ move, health, save, control }) {
  const S = 140, cx = 70, cy = 70, r = 62;
  const gold = '#c8a840';
  const statTxt = { fill: '#f0ead8', fontSize: 18, fontWeight: 700, fontFamily: "'Palatino Linotype', Georgia, serif" };
  const lblTxt  = { fill: gold,     fontSize: 7.5, letterSpacing: 1, fontFamily: 'Arial, sans-serif' };

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="gw-stats-wheel" aria-label="Unit stats">
      {/* rim */}
      <circle cx={cx} cy={cy} r={r + 5} fill="#0c0a08" />
      {/* quadrant backgrounds */}
      {[
        `M${cx},${cy} L${cx},${cy-r} A${r},${r} 0 0,1 ${cx+r},${cy} Z`,
        `M${cx},${cy} L${cx+r},${cy} A${r},${r} 0 0,1 ${cx},${cy+r} Z`,
        `M${cx},${cy} L${cx},${cy+r} A${r},${r} 0 0,1 ${cx-r},${cy} Z`,
        `M${cx},${cy} L${cx-r},${cy} A${r},${r} 0 0,1 ${cx},${cy-r} Z`,
      ].map((d, i) => (
        <path key={i} d={d} fill={i % 2 === 0 ? '#1e1a14' : '#181410'} />
      ))}
      {/* dividing cross */}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={gold} strokeWidth="1.5" />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={gold} strokeWidth="1.5" />
      {/* outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={gold} strokeWidth="2.2" />
      {/* centre jewel */}
      <circle cx={cx} cy={cy} r="5" fill={gold} />
      <circle cx={cx} cy={cy} r="3" fill="#0c0a08" />

      {/* MOVE — top */}
      <text x={cx} y={cy - 30} textAnchor="middle" dominantBaseline="middle" {...statTxt}>{move  || '—'}</text>
      <text x={cx} y={cy - 14} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>MOVE</text>

      {/* HEALTH — left */}
      <text x={cx - 28} y={cy - 7} textAnchor="middle" dominantBaseline="middle" {...statTxt}>{health || '—'}</text>
      <text x={cx - 28} y={cy +  8} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>HEALTH</text>

      {/* SAVE — right */}
      <text x={cx + 28} y={cy - 7} textAnchor="middle" dominantBaseline="middle" {...statTxt}>{save  || '—'}</text>
      <text x={cx + 28} y={cy +  8} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>SAVE</text>

      {/* CONTROL — bottom */}
      <text x={cx} y={cy + 22} textAnchor="middle" dominantBaseline="middle" {...statTxt}>{control || '—'}</text>
      <text x={cx} y={cy + 37} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>CONTROL</text>
    </svg>
  );
}

// ── Weapon table section ─────────────────────────────────────────────────────
function WeaponSection({ weapons, type }) {
  const rows = weapons.filter(w => w.type === type);
  if (!rows.length) return null;
  const isRanged = type === 'ranged';
  const hasAbility = rows.some(w => w.ability);

  return (
    <div className="gw-weapon-section">
      <div className="gw-weapon-header">
        <span className="gw-weapon-icon">{isRanged ? '⊕' : '✕'}</span>
        {isRanged ? 'RANGED WEAPONS' : 'MELEE WEAPONS'}
      </div>
      <table className="gw-weapon-table">
        <thead>
          <tr>
            <th className="gw-th-name">Weapon</th>
            {isRanged && <th>Range</th>}
            <th>Atk</th><th>Hit</th><th>Wnd</th><th>Rnd</th><th>Dmg</th>
            {hasAbility && <th className="gw-th-ability">Ability</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => (
            <tr key={i} className={i % 2 === 0 ? 'gw-row-a' : 'gw-row-b'}>
              <td className="gw-td-name">{w.name}</td>
              {isRanged && <td className="gw-td-stat">{w.range}</td>}
              <td className="gw-td-stat">{w.attacks}</td>
              <td className="gw-td-stat">{w.hit}</td>
              <td className="gw-td-stat">{w.wound}</td>
              <td className="gw-td-stat">{w.rend  || '—'}</td>
              <td className="gw-td-stat">{w.damage}</td>
              {hasAbility && <td className="gw-td-ability">{w.ability || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ability card ─────────────────────────────────────────────────────────────
function AbilityCard({ ab }) {
  const ps     = getPhaseStyle(ab.timing);
  const bullets = Array.isArray(ab.bullets) ? ab.bullets : [];
  return (
    <div className="gw-ability-card" style={{ borderColor: ps.border }}>
      <div className="gw-ability-hdr" style={{ background: ps.hdrBg, color: ps.hdrTxt }}>
        {ab.timing && <span className="gw-ability-timing">{ab.timing.toUpperCase()}</span>}
        <span className="gw-ability-name">{ab.name}</span>
      </div>
      <div className="gw-ability-body">
        {ab.declare && (
          <p className="gw-ability-para">
            <span className="gw-ability-lbl">Declare: </span>{ab.declare}
          </p>
        )}
        {(ab.effect || bullets.length > 0) && (
          <div className="gw-ability-para">
            <span className="gw-ability-lbl">Effect: </span>
            {ab.effect && <span>{ab.effect}</span>}
            {bullets.length > 0 && (
              <ul className="gw-ability-bullets">
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function WarscrollGW({ unit, onClose }) {
  const weapons   = React.useMemo(() => { try { return JSON.parse(unit.weapons   || '[]'); } catch { return []; } }, [unit]);
  const abilities = React.useMemo(() => { try { return JSON.parse(unit.abilities || '[]'); } catch { return []; } }, [unit]);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (!unit?.id) return;
    const base = axios.defaults.baseURL || '';
    setImageUrl(`${base}/api/unit-image/${unit.id}`);
  }, [unit?.id]);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const keywords   = unit.keywords ? unit.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
  const hasRanged  = weapons.some(w => w.type === 'ranged');
  const hasMelee   = weapons.some(w => w.type === 'melee');
  const hasWeapons = hasRanged || hasMelee;

  return (
    <>
      <div className="gw-overlay" onClick={onClose} />
      <div className="gw-modal" role="dialog" aria-modal="true" aria-label={unit.name}>

        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        {/* ── Header band ── */}
        <div className="gw-header">
          <div className="gw-header-type">· WARSCROLL ·</div>
          <div className="gw-header-name">{unit.name}</div>
          {unit.faction && <div className="gw-header-faction">{unit.faction.toUpperCase()}</div>}
        </div>

        {/* ── Body: left col (stats + image) / right col (weapons) ── */}
        <div className="gw-body-row">
          <div className="gw-left-col">
            <StatsWheel move={unit.move} health={unit.health} save={unit.save} control={unit.control} />

            {/* Ward + Points badges */}
            {(unit.ward || unit.points) && (
              <div className="gw-badges-row">
                {unit.ward && (
                  <div className="gw-badge">
                    <span className="gw-badge-val">{unit.ward}</span>
                    <span className="gw-badge-lbl">WARD</span>
                  </div>
                )}
                {unit.points && (
                  <div className="gw-badge">
                    <span className="gw-badge-val">{unit.points}</span>
                    <span className="gw-badge-lbl">PTS</span>
                  </div>
                )}
              </div>
            )}

            {/* Unit size */}
            {unit.unit_size && (
              <div className="gw-unit-meta">Size: {unit.unit_size}</div>
            )}

            {/* Miniature image */}
            {imageUrl && (
              <div className="gw-img-wrap">
                <img src={imageUrl} alt={unit.name} className="gw-unit-img"
                  onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>

          <div className="gw-right-col">
            {hasWeapons ? (
              <>
                {hasRanged && <WeaponSection weapons={weapons} type="ranged" />}
                {hasMelee  && <WeaponSection weapons={weapons} type="melee" />}
              </>
            ) : (
              <div className="gw-no-weapons">No weapon data available.</div>
            )}
          </div>
        </div>

        {/* ── Abilities ── */}
        {abilities.length > 0 && (
          <div className="gw-abilities-section">
            <div className="gw-section-rule"><span>ABILITIES</span></div>
            <div className="gw-abilities-grid">
              {abilities.map((ab, i) => <AbilityCard key={i} ab={ab} />)}
            </div>
          </div>
        )}

        {/* ── Keywords footer ── */}
        {keywords.length > 0 && (
          <div className="gw-keywords-bar">
            <span className="gw-kw-label">KEYWORDS</span>
            {keywords.map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 && <span className="gw-kw-sep">·</span>}
                <span className="gw-kw">{k.toUpperCase()}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Source */}
        {unit.url && (
          <div className="gw-source">
            <a href={unit.url} target="_blank" rel="noopener noreferrer">View on Wahapedia ↗</a>
          </div>
        )}
      </div>
    </>
  );
}
