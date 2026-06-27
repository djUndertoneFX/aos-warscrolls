import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSettings } from '../SettingsContext';

// ── White-removal canvas image ───────────────────────────────────────────────
function TransparentImage({ src, alt, className, onError }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  const process = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        // treat near-white as transparent
        if (r > 220 && g > 220 && b > 220) {
          const whiteness = Math.min(r, g, b);
          // smooth edge: full alpha fade from 220→255
          d[i+3] = Math.round((1 - (whiteness - 220) / 35) * 255 * (1 - (whiteness - 220) / 35));
          if (whiteness > 240) d[i+3] = 0;
        }
      }
      ctx.putImageData(data, 0, 0);
    };
    img.onerror = () => setFailed(true);
    img.src = src;
  }, [src]);

  useEffect(() => { process(); }, [process]);

  if (failed) return null;
  return <canvas ref={canvasRef} className={className} aria-label={alt} />;
}

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
  if (!timing) return PHASE_PRESETS[0].style;
  const t = timing.toLowerCase();
  for (const { keys, style } of PHASE_PRESETS) {
    if (keys.some(k => t.includes(k))) return style;
  }
  return PHASE_DEFAULT;
}

// ── Known AoS keywords that appear in ability text ───────────────────────────
const UNIVERSAL_KW = new Set([
  'HERO','MONSTER','CAVALRY','INFANTRY','BEAST','WAR MACHINE','FLY',
  'WIZARD','PRIEST','UNIQUE','CHAMPION','MUSICIAN','STANDARD BEARER',
  'FACTION TERRAIN','MANIFESTATION','REINFORCED',
  'ORDER','CHAOS','DEATH','DESTRUCTION',
  'FRIENDLY','ENEMY',
]);

// Highlight AoS keywords in a string: bold + uppercase
function FormatText({ text, keywords = [] }) {
  if (!text) return null;
  const kwSet = new Set([...UNIVERSAL_KW, ...keywords.map(k => k.trim().toUpperCase())]);
  // Sort longest first so multi-word keywords match before single words
  const kwList = [...kwSet].sort((a, b) => b.length - a.length);
  const escaped = kwList.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const tokens = text.split(regex);
  return (
    <>{tokens.map((tok, i) =>
      kwSet.has(tok.toUpperCase())
        ? <strong key={i} className="gw-kw-inline">{tok.toUpperCase()}</strong>
        : tok
    )}</>
  );
}

// ── Render text with "Term:" bolded at the start + keyword highlighting ───────
function BoldTerm({ text, keywords }) {
  if (!text) return null;
  const m = text.match(/^([^:]+:)\s*([\s\S]+)$/);
  if (m) {
    return (
      <>
        <strong className="gw-effect-term">{m[1]}</strong>{' '}
        <FormatText text={m[2]} keywords={keywords} />
      </>
    );
  }
  return <FormatText text={text} keywords={keywords} />;
}

// Split an effect string into paragraphs at each "Term:" boundary
// e.g. "Intro text. Grimnir's Grit: blah. Grimnir's Resolve: blah"
// → ["Intro text.", "Grimnir's Grit: blah.", "Grimnir's Resolve: blah"]
function splitEffectParts(text) {
  if (!text) return [];
  const parts = text.split(/ (?=[A-Z][^\s:]{1,20}(?:\s[^\s:]{1,20}){0,3}:)/)
    .map(p => p.trim()).filter(Boolean);
  // The regex can split "Grimnir's" and "Grit:" as separate parts because both
  // satisfy the lookahead independently. Merge any fragment lacking a colon with the next part.
  const merged = [];
  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1 && !parts[i].includes(':')) {
      merged.push(parts[i] + ' ' + parts[i + 1]);
      i++;
    } else {
      merged.push(parts[i]);
    }
  }
  return merged;
}

// ── Stats Wheel (SVG) — diagonal quadrant dividers ───────────────────────────
function StatsWheel({ move, health, save, control }) {
  const S = 140, cx = 70, cy = 70, r = 62;
  const gold = '#c8a840';
  const d45 = Math.round(r * 0.7071); // 44
  const statTxt = { fill: '#f0ead8', fontSize: 21, fontWeight: 700, fontFamily: "'Palatino Linotype', Georgia, serif" };
  const lblTxt  = { fill: gold,     fontSize: 9,   letterSpacing: 0.8, fontFamily: 'Arial, sans-serif' };

  const quadrants = [
    `M${cx},${cy} L${cx-d45},${cy-d45} A${r},${r} 0 0,1 ${cx+d45},${cy-d45} Z`,
    `M${cx},${cy} L${cx+d45},${cy-d45} A${r},${r} 0 0,1 ${cx+d45},${cy+d45} Z`,
    `M${cx},${cy} L${cx+d45},${cy+d45} A${r},${r} 0 0,1 ${cx-d45},${cy+d45} Z`,
    `M${cx},${cy} L${cx-d45},${cy+d45} A${r},${r} 0 0,1 ${cx-d45},${cy-d45} Z`,
  ];

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="gw-stats-wheel" aria-label="Unit stats">
      <circle cx={cx} cy={cy} r={r + 5} fill="#0c0a08" />
      {quadrants.map((d, i) => (
        <path key={i} d={d} fill={i % 2 === 0 ? '#1e1a14' : '#181410'} />
      ))}
      <line x1={cx-d45} y1={cy-d45} x2={cx+d45} y2={cy+d45} stroke={gold} strokeWidth="1.5" />
      <line x1={cx+d45} y1={cy-d45} x2={cx-d45} y2={cy+d45} stroke={gold} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={gold} strokeWidth="2.2" />
      <circle cx={cx} cy={cy} r="5" fill={gold} />
      <circle cx={cx} cy={cy} r="3" fill="#0c0a08" />

      {/* MOVE — pushed high toward rim */}
      <text x={cx} y={cy - 57} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>MOVE</text>
      <text x={cx} y={cy - 44} textAnchor="middle" dominantBaseline="middle" {...statTxt}>{move || '—'}</text>

      {/* HEALTH — number on horizontal midline, label below */}
      <text x={cx - 50} y={cy + 2}  textAnchor="middle" dominantBaseline="middle" {...statTxt}>{health || '—'}</text>
      <text x={cx - 50} y={cy + 16} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>HEALTH</text>

      {/* SAVE — number on horizontal midline, label below */}
      <text x={cx + 50} y={cy + 2}  textAnchor="middle" dominantBaseline="middle" {...statTxt}>{save || '—'}</text>
      <text x={cx + 50} y={cy + 16} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>SAVE</text>

      {/* CONTROL — pushed low toward rim */}
      <text x={cx} y={cy + 44} textAnchor="middle" dominantBaseline="middle" {...statTxt}>{control || '—'}</text>
      <text x={cx} y={cy + 57} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>CONTROL</text>
    </svg>
  );
}

// ── Weapon table section ─────────────────────────────────────────────────────
function WeaponSection({ weapons, type }) {
  const rows = weapons.filter(w => w.type === type);
  if (!rows.length) return null;
  const isRanged = type === 'ranged';

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
            {isRanged && <th className="gw-th-range">Rng</th>}
            <th className="gw-th-stat">Atk</th>
            <th className="gw-th-stat">Hit</th>
            <th className="gw-th-stat">Wnd</th>
            <th className="gw-th-stat">Rnd</th>
            <th className="gw-th-stat">Dmg</th>
            <th className="gw-th-ability">Ability</th>
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
              <td className="gw-td-ability">{w.ability || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ability card ─────────────────────────────────────────────────────────────
function AbilityCard({ ab, keywords }) {
  const { showFlavorText } = useSettings();
  const ps      = getPhaseStyle(ab.timing);
  const bullets = Array.isArray(ab.bullets) ? ab.bullets : [];

  return (
    <div className="gw-ability-card" style={{ borderColor: ps.border }}>
      <div className="gw-ability-hdr" style={{ background: ps.hdrBg, color: ps.hdrTxt }}>
        {ab.timing && <div className="gw-ability-timing">{ab.timing.toUpperCase()}</div>}
      </div>
      <div className="gw-ability-body">
        <div className="gw-ability-name">{ab.name}</div>
        {showFlavorText && ab.flavor && (
          <p className="gw-ability-flavor">{ab.flavor}</p>
        )}
        {ab.declare && (
          <p className="gw-ability-para">
            <span className="gw-ability-lbl">Declare: </span>
            <FormatText text={ab.declare} keywords={keywords} />
          </p>
        )}
        {(ab.effect || bullets.length > 0) && (() => {
          const effectParts = splitEffectParts(ab.effect);
          const allParts = effectParts.length > 1 ? effectParts : (ab.effect ? [ab.effect] : []);
          return (
            <div className="gw-ability-para">
              <span className="gw-ability-lbl">Effect: </span>
              {allParts.map((part, i) => (
                <p key={i} className={i === 0 ? 'gw-ability-effect-first' : 'gw-ability-bullet'}>
                  {i === 0 && allParts.length > 1
                    ? <FormatText text={part} keywords={keywords} />
                    : <BoldTerm text={part} keywords={keywords} />}
                </p>
              ))}
              {bullets.length > 0 && (
                <div className="gw-ability-bullets">
                  {bullets.map((b, i) => (
                    <p key={i} className="gw-ability-bullet"><BoldTerm text={b} keywords={keywords} /></p>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function WarscrollGW({ unit, onClose, onPrev, onNext }) {
  const weapons   = React.useMemo(() => { try { return JSON.parse(unit.weapons   || '[]'); } catch { return []; } }, [unit]);
  const abilities = React.useMemo(() => { try { return JSON.parse(unit.abilities || '[]'); } catch { return []; } }, [unit]);
  const [imageUrl, setImageUrl] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!unit?.id) return;
    const base = axios.defaults.baseURL || '';
    setImageUrl(`${base}/api/unit-image/${unit.id}`);
  }, [unit?.id]);

  // Keyboard: Escape=close, ←=prev, →=next
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onPrev?.(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, onPrev, onNext]);

  // Click outside: close unless the click landed on a unit-name-link (switching units)
  useEffect(() => {
    const h = e => {
      if (modalRef.current?.contains(e.target)) return;
      if (e.target.closest('.unit-name-link')) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const allKeywords = unit.keywords ? unit.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];

  // Split into two lines matching the official warscroll layout:
  // Line 1 — unit-role keywords (Hero, Infantry, Monster, Wizard, Ward, etc.)
  // Line 2 — affiliation keywords (Grand Alliance, faction, race)
  const ROLE_KW = new Set([
    'HERO','MONSTER','CAVALRY','INFANTRY','BEAST','UNIQUE','WAR MACHINE',
    'FACTION TERRAIN','MANIFESTATION','CHAMPION','MUSICIAN','STANDARD BEARER',
    'FLY','FLAMMABLE','UNDERDOG',
  ]);
  const kwLine1 = [];
  const kwLine2 = [];
  for (const kw of allKeywords) {
    const up = kw.toUpperCase();
    if (ROLE_KW.has(up) || /^WIZARD(\s*\(\d+\))?$/i.test(kw) || /^PRIEST(\s*\(\d+\))?$/i.test(kw) || /^WARD\s*\(\d+\+?\)$/i.test(kw)) {
      kwLine1.push(kw);
    } else {
      kwLine2.push(kw);
    }
  }

  const hasRanged  = weapons.some(w => w.type === 'ranged');
  const hasMelee   = weapons.some(w => w.type === 'melee');
  const hasWeapons = hasRanged || hasMelee;

  return (
    <>
      <div className="gw-overlay" />
      <div className="gw-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label={unit.name}>

        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        {/* ── Top band: wheel | centered name | right meta ── */}
        <div className="gw-top-band">

          {/* Left: stat wheel + Ward pip */}
          <div className="gw-wheel-col">
            <StatsWheel move={unit.move} health={unit.health} save={unit.save} control={unit.control} />
            {unit.ward && (
              <div className="gw-ward-pip">
                <span className="gw-ward-pip-val">{unit.ward}</span>
                <span className="gw-ward-pip-lbl">WARD</span>
              </div>
            )}
          </div>

          {/* Center: faction subtitle + unit name */}
          <div className="gw-header-center">
            <div className="gw-header-type">
              · {unit.faction ? unit.faction.toUpperCase() + ' ' : ''}WARSCROLL ·
            </div>
            <div className="gw-header-name">{unit.name}</div>
          </div>

          {/* Right: points + size, right-justified */}
          <div className="gw-header-right">
            {unit.points && (
              <div className="gw-meta-pip gw-meta-pip-pts">
                <span className="gw-meta-pip-val">{unit.points}</span>
                <span className="gw-meta-pip-lbl">PTS</span>
              </div>
            )}
            {unit.unit_size && (
              <div className="gw-meta-pip">
                <span className="gw-meta-pip-val">{unit.unit_size}</span>
                <span className="gw-meta-pip-lbl">SIZE</span>
              </div>
            )}
          </div>

        </div>

        {/* ── Weapons ── */}
        <div className="gw-weapons-row">
          {hasWeapons ? (
            <>
              {hasRanged && <WeaponSection weapons={weapons} type="ranged" />}
              {hasMelee  && <WeaponSection weapons={weapons} type="melee" />}
            </>
          ) : (
            <div className="gw-no-weapons">No weapon data available.</div>
          )}
        </div>

        {/* ── Abilities + image ── */}
        {abilities.length > 0 && (
          <div className="gw-abilities-section">
            <div className="gw-section-rule"><span>ABILITIES</span></div>
            <div className="gw-abilities-row">
              <div className="gw-abilities-grid">
                {abilities.map((ab, i) => <AbilityCard key={i} ab={ab} keywords={allKeywords} />)}
              </div>
              {imageUrl && (
                <div className="gw-abilities-img-col">
                  <TransparentImage
                    src={imageUrl}
                    alt={unit.name}
                    className="gw-unit-img"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keywords footer — two lines */}
        {allKeywords.length > 0 && (
          <div className="gw-keywords-bar">
            <span className="gw-kw-label">KEYWORDS</span>
            <div className="gw-kw-lines">
              {kwLine1.length > 0 && (
                <div className="gw-kw-line">
                  {kwLine1.map((k, i) => (
                    <React.Fragment key={k}>
                      {i > 0 && <span className="gw-kw-sep">·</span>}
                      <span className="gw-kw">{k.toUpperCase()}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {kwLine2.length > 0 && (
                <div className="gw-kw-line gw-kw-line2">
                  {kwLine2.map((k, i) => (
                    <React.Fragment key={k}>
                      {i > 0 && <span className="gw-kw-sep">·</span>}
                      <span className="gw-kw">{k.toUpperCase()}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
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
