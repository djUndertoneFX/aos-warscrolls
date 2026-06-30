import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSettings } from '../SettingsContext';
import { calcWeaponADO } from '../awoCalc';

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
        if (r > 220 && g > 220 && b > 220) {
          const whiteness = Math.min(r, g, b);
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
  { keys: ['hero phase'],           style: { hdrBg: '#9a802e', hdrTxt: '#ffffff', border: '#c8a840' } },
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

function FormatText({ text, keywords = [] }) {
  if (!text) return null;
  const kwSet = new Set([...UNIVERSAL_KW, ...keywords.map(k => k.trim().toUpperCase())]);
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

function splitEffectParts(text) {
  if (!text) return [];
  const parts = text.split(/ (?=[A-Z][A-Za-z0-9''-]{1,20}(?:\s[A-Za-z0-9''-]{1,20}){0,3}:)/)
    .map(p => p.trim()).filter(Boolean);
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

// ── Stats Wheel (SVG) ────────────────────────────────────────────────────────
function StatsWheel({ move, health, save, control }) {
  const S = 140, cx = 70, cy = 70, r = 62;
  const gold = '#c8a840';
  const d45 = Math.round(r * 0.7071);
  const statTxt    = { fill: '#f0ead8', fontSize: 26, fontWeight: 700, fontFamily: "'Palatino Linotype', Georgia, serif" };
  const statTxtTop = { ...statTxt, dominantBaseline: 'hanging' };
  const statTxtBot = { ...statTxt, dominantBaseline: 'auto' };
  const lblTxt  = { fill: gold, fontSize: 9, letterSpacing: 0.8, fontFamily: 'Arial, sans-serif' };

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
        <path key={i} d={d} fill={i === 1 ? '#2b5d00' : i % 2 === 0 ? '#1e1a14' : '#181410'} />
      ))}
      <line x1={cx-d45} y1={cy-d45} x2={cx+d45} y2={cy+d45} stroke={gold} strokeWidth="1.5" />
      <line x1={cx+d45} y1={cy-d45} x2={cx-d45} y2={cy+d45} stroke={gold} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={gold} strokeWidth="2.2" />
      <circle cx={cx} cy={cy} r="5" fill={gold} />
      <circle cx={cx} cy={cy} r="3" fill="#0c0a08" />
      <text x={cx} y={cy - 49} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>MOVE</text>
      <text x={cx} y={cy - 42} textAnchor="middle" {...statTxtTop}>{move || '—'}</text>
      <text x={cx - 39} y={cy}      textAnchor="middle" {...statTxtBot}>{health || '—'}</text>
      <text x={cx - 37} y={cy + 14} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>HEALTH</text>
      <text x={cx + 40} y={cy}      textAnchor="middle" {...statTxtBot}>{save || '—'}</text>
      <text x={cx + 40} y={cy + 14} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>SAVE</text>
      <text x={cx} y={cy + 35} textAnchor="middle" {...statTxtBot}>{control || '—'}</text>
      <text x={cx} y={cy + 48} textAnchor="middle" dominantBaseline="middle" {...lblTxt}>CONTROL</text>
    </svg>
  );
}

// ── Weapon table section ─────────────────────────────────────────────────────
function WeaponSection({ weapons, type, unitSize }) {
  const { calculateDynamicAWO, presumedSave, presumedWard, roundingMode } = useSettings();
  const rows = weapons.filter(w => w.type === type);
  if (!rows.length) return null;
  const isRanged = type === 'ranged';
  const save = presumedSave ?? 5;
  const ward = presumedWard ?? null;

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
            <th className="gw-th-ado">
              <span className="ado-tip" data-tip="Average Damage Output. Full unit damage on average with this weapon, including attacks × models, hit/wound/save rolls (default 5+ save, no ward — change in Settings). Crit (Mortal) and Crit (Auto-Wound) are factored in; conditional abilities like Anti-X are not.">ADO</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => {
            const awo = calcWeaponADO(w, unitSize || 1, save, ward, roundingMode);
            return (
              <tr key={i} className={i % 2 === 0 ? 'gw-row-a' : 'gw-row-b'}>
                <td className="gw-td-name">{w.name}</td>
                {isRanged && <td className="gw-td-stat">{w.range}</td>}
                <td className="gw-td-stat">{w.attacks}</td>
                <td className="gw-td-stat">{w.hit}</td>
                <td className="gw-td-stat">{w.wound}</td>
                <td className="gw-td-stat">{w.rend || '—'}</td>
                <td className="gw-td-stat">{w.damage}</td>
                <td className="gw-td-ability">{w.ability || '-'}</td>
                <td className="gw-td-ado">{awo !== null ? awo : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Ability card ─────────────────────────────────────────────────────────────
function AbilityCard({ ab, keywords }) {
  const ps      = getPhaseStyle(ab.timing);
  const bullets = Array.isArray(ab.bullets) ? ab.bullets : [];

  return (
    <div className="gw-ability-card" style={{ borderColor: ps.border }}>
      <div className="gw-ability-hdr" style={{ background: ps.hdrBg, color: ps.hdrTxt }}>
        {ab.timing && <div className="gw-ability-timing">{ab.timing.toUpperCase()}</div>}
      </div>
      <div className="gw-ability-body">
        <div className="gw-ability-name">{ab.name}</div>
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

// ── Faction slide (Battle Traits or Battle Formations) ───────────────────────
function parseBullets(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function FactionTraitsSlide({ faction, grandAlliance, title, traits }) {
  return (
    <div className="gw-faction-slide">
      <div className="gw-faction-slide-header">
        <div className="gw-header-type">
          {grandAlliance?.toUpperCase()}{grandAlliance && faction ? ' · ' : ''}{faction?.toUpperCase()}
        </div>
        <div className="gw-faction-slide-title">{(title ?? 'Battle Traits').toUpperCase()}</div>
      </div>
      <div className="gw-faction-slide-body">
        <div className="gw-abilities-grid">
          {traits.map((ab, i) => (
            <AbilityCard key={i} ab={{ ...ab, bullets: parseBullets(ab.bullets) }} keywords={[]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FactionFormationsSlide({ faction, grandAlliance, formations }) {
  // Group by formation_name, preserving insertion order
  const groups = [];
  const nameToGroup = {};
  for (const item of formations) {
    const gName = item.formation_name || 'General';
    if (!nameToGroup[gName]) {
      nameToGroup[gName] = { name: gName, items: [] };
      groups.push(nameToGroup[gName]);
    }
    nameToGroup[gName].items.push(item);
  }

  return (
    <div className="gw-faction-slide">
      <div className="gw-faction-slide-header">
        <div className="gw-header-type">
          {grandAlliance?.toUpperCase()}{grandAlliance && faction ? ' · ' : ''}{faction?.toUpperCase()}
        </div>
        <div className="gw-faction-slide-title">BATTLE FORMATIONS</div>
      </div>
      <div className="gw-faction-slide-body">
        {groups.map((group, gi) => (
          <div key={gi} className="gw-formation-group">
            {group.name !== 'General' && (
              <div className="gw-formation-group-header">{group.name}</div>
            )}
            <div className="gw-abilities-grid">
              {group.items.map((ab, i) => (
                <AbilityCard key={i} ab={{ ...ab, bullets: parseBullets(ab.bullets) }} keywords={[]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
function getPrimaryType(u) {
  if (u.is_hero)          return 'Hero';
  if (u.is_monster)       return 'Monster';
  if (u.is_infantry)      return 'Infantry';
  if (u.is_cavalry)       return 'Cavalry';
  if (u.is_beast)         return 'Beast';
  if (u.is_war_machine)   return 'War Machine';
  if (u.is_manifestation) return 'Manifestation';
  if (u.is_terrain)       return 'Terrain';
  return 'Other';
}

export default function WarscrollGW({ unit, onClose, onPrev, onNext, onFilterApply, factions = [], navIndex, navList }) {
  const navTotal = navList ? navList.length : 0;
  const { showFlavorText, showBattleTraits, showBattleFormations, showHeroicTraits, showArtefacts, showSpellLore, showManifestationLore } = useSettings();
  const weapons   = React.useMemo(() => { try { return JSON.parse(unit.weapons   || '[]'); } catch { return []; } }, [unit]);
  const abilities = React.useMemo(() => { try { return JSON.parse(unit.abilities || '[]'); } catch { return []; } }, [unit]);
  const [imageUrl, setImageUrl] = useState(null);
  const modalRef = useRef(null);

  // Faction slides
  const [factionSlide, setFactionSlide] = useState(null); // null | 'traits' | 'formations'
  const [factionRules, setFactionRules] = useState(null);

  // Reset faction slide when the displayed unit changes
  useEffect(() => { setFactionSlide(null); }, [unit?.id]);

  // Fetch faction rules once per faction slug
  useEffect(() => {
    if (!unit?.faction_slug) return;
    let cancelled = false;
    setFactionRules(null);
    axios.get(`/api/faction-rules/${unit.faction_slug}`)
      .then(r => { if (!cancelled) setFactionRules(r.data); })
      .catch(() => { if (!cancelled) setFactionRules({ traits: [], formations: [] }); });
    return () => { cancelled = true; };
  }, [unit?.faction_slug]);

  // Build ordered list of enabled faction slides (left-to-right, so prev navigates rightward through them)
  // Each entry: { key, has, data }
  const factionSlides = React.useMemo(() => {
    if (!factionRules) return [];
    const spellPrayerData = [...(factionRules.spell_lore ?? []), ...(factionRules.prayer_lore ?? [])];
    return [
      { key: 'manifestation_lore', enabled: showManifestationLore, data: factionRules.manifestation_lore ?? [] },
      { key: 'spell_lore',         enabled: showSpellLore,         data: spellPrayerData },
      { key: 'artefacts',          enabled: showArtefacts,         data: factionRules.artefacts ?? [] },
      { key: 'heroic_traits',      enabled: showHeroicTraits,      data: factionRules.heroic_traits ?? [] },
      { key: 'formations',         enabled: showBattleFormations,  data: factionRules.formations ?? [] },
      { key: 'traits',             enabled: showBattleTraits,      data: factionRules.traits ?? [] },
    ].filter(s => s.enabled && s.data.length > 0);
  }, [factionRules, showBattleTraits, showBattleFormations, showHeroicTraits, showArtefacts, showSpellLore, showManifestationLore]);

  // Scroll to top when switching slides
  useEffect(() => {
    if (modalRef.current) modalRef.current.scrollTop = 0;
  }, [factionSlide, unit?.id]);

  useEffect(() => {
    if (!unit?.id) return;
    const base = axios.defaults.baseURL || '';
    setImageUrl(`${base}/api/unit-image/${unit.id}`);
  }, [unit?.id]);

  // Internal prev/next: intercept at navIndex 0 to enter faction slides (right = closer to unit 0)
  const handlePrev = useCallback(() => {
    if (factionSlide === null) {
      // Enter the rightmost faction slide (closest to unit 0)
      if (navIndex === 0 && factionSlides.length > 0) {
        setFactionSlide(factionSlides[factionSlides.length - 1].key);
        return;
      }
      onPrev?.();
    } else {
      // Move further left through faction slides
      const idx = factionSlides.findIndex(s => s.key === factionSlide);
      if (idx > 0) setFactionSlide(factionSlides[idx - 1].key);
      // idx === 0: already leftmost, do nothing
    }
  }, [factionSlide, navIndex, factionSlides, onPrev]);

  const handleNext = useCallback(() => {
    if (factionSlide !== null) {
      const idx = factionSlides.findIndex(s => s.key === factionSlide);
      if (idx < factionSlides.length - 1) {
        setFactionSlide(factionSlides[idx + 1].key);
      } else {
        setFactionSlide(null); // return to unit 0
      }
      return;
    }
    onNext?.();
  }, [factionSlide, factionSlides, onNext]);

  // Keyboard: Escape=close, ←=prev, →=next
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); handlePrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, handlePrev, handleNext]);

  // Touch swipe: left=next, right=prev.
  // Axis-locked: once the gesture direction is determined (H vs V), we commit.
  // Horizontal swipes call preventDefault to prevent frame shift / scroll interference.
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    let startX = null, startY = null, axis = null; // axis: null | 'h' | 'v'

    const onStart = e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      axis = null;
    };
    const onMove = e => {
      if (startX === null) return;
      if (axis === null) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) axis = dx >= dy ? 'h' : 'v';
      }
      if (axis === 'h') e.preventDefault(); // stop scroll/frame-shift on horizontal
    };
    const onEnd = e => {
      if (startX !== null && axis === 'h') {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) { dx < 0 ? handleNext() : handlePrev(); }
      }
      startX = null; startY = null; axis = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false }); // non-passive so preventDefault works
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [handlePrev, handleNext]);

  // Lock viewport zoom while modal is open; scroll to top on orientation change
  useEffect(() => {
    const meta = document.querySelector('meta[name=viewport]');
    const orig = meta?.content;
    if (meta) meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1';
    const scrollTop = () => setTimeout(() => { if (modalRef.current) modalRef.current.scrollTop = 0; }, 300);
    window.addEventListener('orientationchange', scrollTop);
    return () => {
      if (meta && orig) meta.content = orig;
      window.removeEventListener('orientationchange', scrollTop);
    };
  }, []);

  // Click outside: close
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

  const KW_TYPE_MAP = {
    'HERO': 'hero', 'MONSTER': 'monster', 'INFANTRY': 'infantry',
    'CAVALRY': 'cavalry', 'BEAST': 'beast', 'WAR MACHINE': 'warmachine',
    'MANIFESTATION': 'manifestation',
  };

  const handleKwClick = (kw, exclude, e) => {
    if (!onFilterApply) return;
    e.preventDefault();
    const up = kw.replace(/\s*\(.*\)$/, '').trim().toUpperCase();
    if (KW_TYPE_MAP[up]) {
      onFilterApply(KW_TYPE_MAP[up], true, exclude);
    } else {
      const matchedFaction = factions.find(f => f.faction.toUpperCase() === up);
      if (matchedFaction) {
        onFilterApply('faction', matchedFaction.faction_slug, exclude);
      } else {
        onFilterApply('search', kw, exclude);
      }
    }
  };

  const showFactionDots = factionSlides.length > 0;

  return (
    <>
      <div className="gw-overlay" />
      <div className="gw-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label={unit.name}>

        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        {/* ── Nav dots: faction squares + unit circles ── */}
        {navTotal > 0 && (showFactionDots || navTotal > 1) && (
          <div className="gw-nav-dots">
            {/* Faction slide dots (square, purple) — leftmost = furthest from units */}
            {factionSlides.map(s => (
              <span
                key={s.key}
                className={`gw-nav-dot-faction${factionSlide === s.key ? ' gw-nav-dot-faction-active' : ''}`}
                title={s.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              />
            ))}
            {showFactionDots && navTotal > 0 && <span className="gw-nav-sep" />}
            {/* Unit dots (round, gold) */}
            {navList && navList.map((u, i) => {
              const type = getPrimaryType(u);
              const prevType = i > 0 ? getPrimaryType(navList[i - 1]) : null;
              return (
                <React.Fragment key={u.id ?? i}>
                  {i > 0 && prevType !== type && <span className="gw-nav-sep" title={type} />}
                  <span
                    className={`gw-nav-dot${factionSlide === null && i === navIndex ? ' gw-nav-dot-active' : ''}`}
                    title={u.name}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* ── Faction slide content (replaces warscroll when active) ── */}
        {factionSlide !== null && factionRules && (() => {
          const slide = factionSlides.find(s => s.key === factionSlide);
          if (!slide) return null;

          const SLIDE_TITLES = {
            traits:             'Battle Traits',
            formations:         'Battle Formations',
            heroic_traits:      'Heroic Traits',
            artefacts:          'Artefacts of Power',
            spell_lore:         'Spell / Prayer Lore',
            manifestation_lore: 'Manifestation Lore',
          };

          if (factionSlide === 'formations') {
            return (
              <FactionFormationsSlide
                faction={unit.faction}
                grandAlliance={unit.grand_alliance}
                formations={slide.data}
              />
            );
          }

          return (
            <FactionTraitsSlide
              faction={unit.faction}
              grandAlliance={unit.grand_alliance}
              title={SLIDE_TITLES[factionSlide] ?? factionSlide}
              traits={slide.data}
            />
          );
        })()}

        {/* ── Warscroll content (hidden when on a faction slide) ── */}
        {factionSlide === null && (
          <>
            {/* Top band: wheel | centered name | right meta */}
            <div className="gw-top-band">
              <div className="gw-wheel-col">
                <StatsWheel move={unit.move} health={unit.health} save={unit.save} control={unit.control} />
                {unit.ward && (
                  <div className="gw-ward-pip">
                    <span className="gw-ward-pip-val">{unit.ward}</span>
                    <span className="gw-ward-pip-lbl">WARD</span>
                  </div>
                )}
              </div>

              <div className="gw-header-center">
                <div className="gw-header-type">
                  {unit.grand_alliance && onFilterApply ? (
                    <span
                      className="gw-filter-chip gw-filter-chip-alliance"
                      title="Left-click to filter by alliance · Right-click to exclude"
                      onClick={e => { onFilterApply('alliance', unit.grand_alliance, false); e.stopPropagation(); }}
                      onContextMenu={e => { e.preventDefault(); onFilterApply('alliance', unit.grand_alliance, true); }}
                    >{unit.grand_alliance.toUpperCase()}</span>
                  ) : (unit.grand_alliance ? <span>{unit.grand_alliance.toUpperCase()}</span> : null)}
                  {' '}·{unit.faction && onFilterApply ? (
                    <>
                      {' '}
                      <span
                        className="gw-filter-chip"
                        title="Left-click to filter by faction · Right-click to exclude"
                        onClick={e => { const f = factions.find(fc => fc.faction === unit.faction); f && onFilterApply('faction', f.faction_slug, false); e.stopPropagation(); }}
                        onContextMenu={e => { e.preventDefault(); const f = factions.find(fc => fc.faction === unit.faction); f && onFilterApply('faction', f.faction_slug, true); }}
                      >{unit.faction.toUpperCase()}</span>{' '}
                    </>
                  ) : (unit.faction ? ' ' + unit.faction.toUpperCase() + ' ' : ' ')}WARSCROLL ·
                </div>
                <div className="gw-header-name">{unit.name}</div>
              </div>

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

            {showFlavorText && unit.flavor_text && (
              <div className="gw-flavor-text"><p>{unit.flavor_text}</p></div>
            )}

            <div className="gw-weapons-row">
              {hasWeapons ? (
                <>
                  {hasRanged && <WeaponSection weapons={weapons} type="ranged" unitSize={unit.unit_size} />}
                  {hasMelee  && <WeaponSection weapons={weapons} type="melee"  unitSize={unit.unit_size} />}
                </>
              ) : (
                <div className="gw-no-weapons">No weapon data available.</div>
              )}
            </div>

            {unit.options_text && (
              <div className="gw-options-text">
                {unit.options_text.split(/(?<=\.)\s+/).map((sentence, i) => (
                  <p key={i}>{sentence}</p>
                ))}
              </div>
            )}

            {abilities.length > 0 && (
              <div className="gw-abilities-section">
                <div className="gw-section-rule"><span>ABILITIES</span></div>
                <div className="gw-abilities-row">
                  <div className="gw-abilities-grid">
                    {abilities.map((ab, i) => <AbilityCard key={i} ab={ab} keywords={allKeywords} />)}
                  </div>
                  {imageUrl && (
                    <div className="gw-abilities-img-col">
                      <TransparentImage src={imageUrl} alt={unit.name} className="gw-unit-img" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {allKeywords.length > 0 && (
              <div className="gw-keywords-bar">
                <span className="gw-kw-label">KEYWORDS</span>
                <div className="gw-kw-lines">
                  {kwLine1.length > 0 && (
                    <div className="gw-kw-line">
                      {kwLine1.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className="gw-kw-sep">·</span>}
                          <span
                            className={`gw-kw${onFilterApply ? ' gw-kw-clickable' : ''}`}
                            title={onFilterApply ? 'Left-click to filter · Right-click to exclude' : undefined}
                            onClick={onFilterApply ? e => handleKwClick(k, false, e) : undefined}
                            onContextMenu={onFilterApply ? e => handleKwClick(k, true, e) : undefined}
                          >{k.toUpperCase()}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  {kwLine2.length > 0 && (
                    <div className="gw-kw-line gw-kw-line2">
                      {kwLine2.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className="gw-kw-sep">·</span>}
                          <span
                            className={`gw-kw${onFilterApply ? ' gw-kw-clickable' : ''}`}
                            title={onFilterApply ? 'Left-click to filter · Right-click to exclude' : undefined}
                            onClick={onFilterApply ? e => handleKwClick(k, false, e) : undefined}
                            onContextMenu={onFilterApply ? e => handleKwClick(k, true, e) : undefined}
                          >{k.toUpperCase()}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {unit.url && (
              <div className="gw-source">
                <a href={unit.url} target="_blank" rel="noopener noreferrer">View on Wahapedia ↗</a>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
