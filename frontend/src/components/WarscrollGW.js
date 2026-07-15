// v2
import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSettings } from '../SettingsContext';
import { calcWeaponADO } from '../awoCalc';

// ── White-removal canvas image ───────────────────────────────────────────────
function TransparentImage({ src, alt, className, onError }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // Reset failed state whenever src changes so a new valid image can load
  useEffect(() => { setFailed(false); }, [src]);

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

  // Run process when src changes OR when failed resets to false.
  // The failed-reset case is critical: it ensures process() fires only after
  // the canvas is mounted (failed=true removes the canvas from the DOM, so
  // calling process() in the same render cycle as setFailed(false) hits null ref).
  useEffect(() => {
    if (!failed) process();
  }, [failed, process]);

  if (failed) return null;
  return <canvas ref={canvasRef} className={className} aria-label={alt} />;
}

// ── Phase colour mapping (GW canonical AoS 4e colors) ────────────────────────
const PHASE_PRESETS = [
  { keys: ['passive'],                                          style: { hdrBg: '#3a3220', hdrTxt: '#e8d898', border: '#7a6830' } },
  { keys: ['hero phase'],                                       style: { hdrBg: '#7a6010', hdrTxt: '#ffffff', border: '#c8a020' } },
  { keys: ['movement', 'move phase'],                           style: { hdrBg: '#0e4020', hdrTxt: '#a0f0b8', border: '#208848' } },
  { keys: ['shooting'],                                         style: { hdrBg: '#0c2a60', hdrTxt: '#b8d8ff', border: '#2060c8' } },
  { keys: ['charge'],                                           style: { hdrBg: '#6a2c00', hdrTxt: '#ffd898', border: '#c86010' } },
  { keys: ['any combat', 'combat'],                             style: { hdrBg: '#6a0808', hdrTxt: '#ffd8d8', border: '#c02020' } },
  { keys: ['once per battle round', 'start of battle round'],   style: { hdrBg: '#0a3040', hdrTxt: '#88d8f0', border: '#1878b0' } },
  { keys: ['once per turn'],                                    style: { hdrBg: '#082838', hdrTxt: '#70b8d0', border: '#106880' } },
  { keys: ['once per battle'],                                  style: { hdrBg: '#500848', hdrTxt: '#f0b8e8', border: '#a01888' } },
  { keys: ['deployment'],                                       style: { hdrBg: '#280858', hdrTxt: '#c8b8f8', border: '#6040c0' } },
  { keys: ['end of battle', 'end of turn', 'end of any turn'],  style: { hdrBg: '#202020', hdrTxt: '#c0c0c0', border: '#505050' } },
  { keys: ['reaction', 'any phase'],                            style: { hdrBg: '#1a3830', hdrTxt: '#b0f0d8', border: '#307858' } },
];
const PHASE_DEFAULT = { hdrBg: '#282010', hdrTxt: '#d0c8a0', border: '#504830' };

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
  'FACTION TERRAIN','MANIFESTATION','REINFORCED','WARMASTER',
  'ORDER','CHAOS','DEATH','DESTRUCTION',
  'FRIENDLY','ENEMY',
]);

// Compound rule patterns — matched before simple terms so the full form is captured.
// src: regex source (case-insensitive, no flags), fmt: (matchedStr) => displayStr
const RULE_PATTERNS = [
  { src: 'ward\\s*\\(\\d+\\+\\)',     fmt: m => m.charAt(0).toUpperCase() + m.slice(1) },
  { src: 'heal\\s*\\([^)]+\\)',        fmt: m => 'Heal' + m.replace(/^heal/i, '') },
  { src: 'crit\\s*\\([^)]+\\)',        fmt: m => 'Crit' + m.replace(/^crit/i, '') },
  { src: 'charge\\s*\\(\\+?[^)]*\\)', fmt: m => 'Charge' + m.replace(/^charge/i, '') },
];

// AoS 4e special rules phrases — bolded as written (not uppercased)
// key = lowercase for matching, value = canonical display form
const RULE_TERMS = new Map([
  ['strike-first',   'Strike-first'],
  ['strike-last',    'Strike-last'],
  ['mortal damage',  'mortal damage'],
  ['mortal wounds',  'mortal wounds'],
  ['retreat',        'Retreat'],
  ['garrison',       'Garrison'],
  ['reinforcements', 'Reinforcements'],
  ['ward',           'Ward'],
  ['heal',           'Heal'],
  ['crit',           'Crit'],
  ['charge',         'Charge'],
  ['fight',          'Fight'],
  ['shoot',          'Shoot'],
  ['run',            'Run'],
  ['fly',            'Fly'],
]);

function _reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function FormatText({ text, keywords = [] }) {
  if (!text) return null;
  const kwSet = new Set([...UNIVERSAL_KW, ...keywords.map(k => k.trim().toUpperCase())]);
  const kwList = [...kwSet].sort((a, b) => b.length - a.length);
  const rtList = [...RULE_TERMS.keys()].sort((a, b) => b.length - a.length);

  // Compound patterns listed first so they win over the simple fallback term.
  // \b at start + (?![a-zA-Z]) at end prevents partial-word matches.
  const cpEsc = RULE_PATTERNS.map(p => `\\b(?:${p.src})`);
  const kwEsc = kwList.map(k => `\\b${_reEsc(k)}(?![a-zA-Z])`);
  const rtEsc = rtList.map(t => `\\b${_reEsc(t)}(?![a-zA-Z])`);

  const regex = new RegExp(`(${[...cpEsc, ...kwEsc, ...rtEsc].join('|')})`, 'gi');
  const tokens = text.split(regex);

  return (
    <>{tokens.map((tok, i) => {
      if (!tok) return null;
      for (const { src, fmt } of RULE_PATTERNS) {
        if (new RegExp(`^(?:${src})$`, 'i').test(tok))
          return <strong key={i} className="gw-kw-inline">{fmt(tok)}</strong>;
      }
      if (kwSet.has(tok.toUpperCase()))
        return <strong key={i} className="gw-kw-inline">{tok.toUpperCase()}</strong>;
      const rt = RULE_TERMS.get(tok.toLowerCase());
      if (rt !== undefined)
        return <strong key={i} className="gw-kw-inline">{rt}</strong>;
      return tok;
    })}</>
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
  const result = [];
  // First split on em-dash (used in AoS rules to introduce a list of named effects)
  const emSegments = text.split(/\s*—\s*/);
  for (const seg of emSegments) {
    if (!seg.trim()) continue;
    // Split on "Term: " patterns (allow hyphens, apostrophes, ! in term names)
    const subParts = seg
      .split(/ (?=[A-Z][-A-Za-z0-9''!]{1,20}(?:\s[-A-Za-z0-9''!]{1,20}){0,3}:)/)
      .map(p => p.trim()).filter(Boolean);
    const merged = [];
    for (let i = 0; i < subParts.length; i++) {
      if (i < subParts.length - 1 && !subParts[i].includes(':')) {
        merged.push(subParts[i] + ' ' + subParts[i + 1]);
        i++;
      } else {
        merged.push(subParts[i]);
      }
    }
    result.push(...merged);
  }
  return result;
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
  const { calculateDynamicAWO, presumedSave, presumedWard, roundingMode, includeSaveWardInADO } = useSettings();
  const rows = weapons.filter(w => w.type === type);
  if (!rows.length) return null;
  const isRanged = type === 'ranged';
  const save = includeSaveWardInADO ? (presumedSave ?? 5) : 7;
  const ward = includeSaveWardInADO ? (presumedWard ?? null) : null;

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
              <span className="ado-tip" data-tip={includeSaveWardInADO ? `Average Damage Output. Full unit damage on average with this weapon vs ${presumedSave ?? 5}+ save${presumedWard ? `, ${presumedWard}+ ward` : ', no ward'}. Crit (Mortal) and Crit (Auto-Wound) factored in; conditional (Anti-X) ignored.` : 'Average Damage Output — hit and wound rolls only (save/ward not applied). Shows raw per-weapon offensive potential. Crit (Mortal) and Crit (Auto-Wound) factored in; conditional (Anti-X) ignored.'}>ADO</span>
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
export function AbilityCard({ ab, keywords }) {
  const { showFlavorText } = useSettings();
  const ps      = getPhaseStyle(ab.timing);
  const bullets = Array.isArray(ab.bullets) ? ab.bullets : [];

  return (
    <div className="gw-ability-card" style={{ borderColor: ps.border }}>
      {ab.timing && (
        <div className="gw-ability-hdr" style={{ background: ps.hdrBg }}>
          <div className="gw-ability-timing">{ab.timing.toUpperCase()}</div>
        </div>
      )}
      <div className="gw-ability-body">
        <div className="gw-ability-name">
          {ab.name}
          {ab.cost && (
            <span className={`gw-ability-cost${ab.cost.trim().startsWith('+') ? ' gw-ability-cost-refund' : ''}`}>{ab.cost}</span>
          )}
        </div>
        {showFlavorText && ab.lore_text && (
          <p className="gw-ability-lore">{ab.lore_text}</p>
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

// ── Faction slide (Battle Traits or Battle Formations) ───────────────────────
function parseBullets(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// Mirrors the "Faction Info" checkboxes in Settings — same show/hide toggles,
// just reachable directly from whichever purple-bullet page you're already on.
const FACTION_INFO_TOGGLES = [
  { key: 'traits',             setting: 'showBattleTraits',      label: 'BT',   title: 'Battle Traits' },
  { key: 'formations',         setting: 'showBattleFormations',  label: 'BF',   title: 'Battle Formations' },
  { key: 'heroic_traits',      setting: 'showHeroicTraits',      label: 'HT',   title: 'Heroic Traits' },
  { key: 'artefacts',          setting: 'showArtefacts',         label: 'AoP',  title: 'Artefacts of Power' },
  { key: 'spell_lore',         setting: 'showSpellLore',         label: 'S/PL', title: 'Spell / Prayer Lore' },
  { key: 'manifestation_lore', setting: 'showManifestationLore', label: 'ML',   title: 'Manifestation Lore' },
];

function FactionInfoToggleRow({ activeKey }) {
  const settings = useSettings();
  return (
    <div className="gw-faction-toggle-row">
      {FACTION_INFO_TOGGLES.map(t => (
        <button
          key={t.key}
          type="button"
          className={`gw-faction-toggle-btn${settings[t.setting] ? '' : ' gw-faction-toggle-btn-off'}${activeKey === t.key ? ' gw-faction-toggle-btn-active' : ''}`}
          onClick={() => settings.setSetting(t.setting, !settings[t.setting])}
          title={`${t.title}${settings[t.setting] ? ' (shown — click to hide)' : ' (hidden — click to show)'}`}
        >{t.label}</button>
      ))}
    </div>
  );
}

function FactionTraitsSlide({ faction, grandAlliance, title, traits, slideKey }) {
  return (
    <div className="gw-faction-slide">
      <div className="gw-faction-slide-header">
        <FactionInfoToggleRow activeKey={slideKey} />
        <div className="gw-header-type">
          {grandAlliance?.toUpperCase()}{grandAlliance && faction ? ' · ' : ''}{faction?.toUpperCase()}
        </div>
        <div className="gw-faction-slide-title">{(title ?? 'Battle Traits').toUpperCase()}</div>
      </div>
      <div className="gw-faction-slide-body">
        <div className="gw-abilities-grid gw-sp-grid-2col">
          {traits.map((ab, i) => (
            <AbilityCard key={i} ab={{ ...ab, bullets: parseBullets(ab.bullets) }} keywords={[]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FactionFormationsSlide({ faction, grandAlliance, formations, selected, filterSelected, onToggle, onToggleFilter }) {
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

  const hasSelected = selected.size > 0;
  const visibleGroups = filterSelected ? groups.filter(g => selected.has(g.name)) : groups;

  return (
    <div className="gw-faction-slide">
      <div className="gw-faction-slide-header">
        <FactionInfoToggleRow activeKey="formations" />
        <div className="gw-header-type">
          {grandAlliance?.toUpperCase()}{grandAlliance && faction ? ' · ' : ''}{faction?.toUpperCase()}
        </div>
        <div className="gw-faction-slide-title">BATTLE FORMATIONS</div>
      </div>
      <div className="gw-faction-slide-body">
        {/* One checkbox per formation (not per faction) — mark which
            formations you and your opponent are actually using, then filter
            the list down to just those. Which factions show up here at all
            is already decided by the Friendly/Enemy unit filters upstream. */}
        <div className="gw-sp-filter-bar">
          <button
            className={`gw-sp-filter-btn${filterSelected ? ' active' : ''}`}
            onClick={onToggleFilter}
            disabled={!hasSelected}
            title="Show only the formations you've checked"
          >{filterSelected ? 'Show All' : 'Show Selected'}</button>
        </div>
        <div className="gw-formation-groups-2col">
          {visibleGroups.map((group, gi) => {
            const isSelected = selected.has(group.name);
            return (
              <div key={gi} className="gw-formation-group">
                <div className="gw-formation-group-header-row">
                  <button
                    className={`gw-ab-checkbox${isSelected ? ' gw-ab-checkbox-on' : ''}`}
                    onClick={() => onToggle(group.name)}
                    title={isSelected ? 'Deselect' : 'Select (mark as in play)'}
                  >{isSelected ? '☑' : '☐'}</button>
                  {group.name !== 'General' && (
                    <div className="gw-formation-group-header">{group.name}</div>
                  )}
                </div>
                <div className="gw-abilities-grid">
                  {group.items.map((ab, i) => (
                    <AbilityCard key={i} ab={{ ...ab, bullets: parseBullets(ab.bullets) }} keywords={[]} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {filterSelected && visibleGroups.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '1rem' }}>No selected formations to show.</p>
        )}
      </div>
    </div>
  );
}

// ── Warscroll body (stats/weapons/abilities/keywords) ───────────────────────
// Extracted so it can be instantiated twice side-by-side in split-pane view —
// each instance owns its own weapons/abilities/image-url/keyword computation
// for whichever unit it's given.
const KW_TYPE_MAP = {
  'HERO': 'hero', 'MONSTER': 'monster', 'INFANTRY': 'infantry',
  'CAVALRY': 'cavalry', 'BEAST': 'beast', 'WAR MACHINE': 'warmachine',
  'MANIFESTATION': 'manifestation',
};
const ROLE_KW = new Set([
  'HERO','MONSTER','CAVALRY','INFANTRY','BEAST','UNIQUE','WAR MACHINE',
  'FACTION TERRAIN','MANIFESTATION','CHAMPION','MUSICIAN','STANDARD BEARER',
  'FLY','FLAMMABLE','UNDERDOG',
]);

function WarscrollBody({ unit, factions = [], onFilterApply }) {
  const { showFlavorText, useSpearheadAbilities } = useSettings();
  const weapons = React.useMemo(() => { try { return JSON.parse(unit.weapons || '[]'); } catch { return []; } }, [unit]);
  const spName = unit?._spName;
  const abilities = React.useMemo(() => {
    try {
      if (useSpearheadAbilities && spName && unit?.spearhead_abilities) {
        const spMap = JSON.parse(unit.spearhead_abilities);
        if (spMap[spName] && spMap[spName].length > 0) return spMap[spName];
      }
      return JSON.parse(unit.abilities || '[]');
    } catch { return []; }
  }, [unit, useSpearheadAbilities, spName]); // eslint-disable-line
  const [imageUrl, setImageUrl] = useState(null);
  useEffect(() => {
    if (!unit?.id) return;
    const base = axios.defaults.baseURL || '';
    setImageUrl(`${base}/api/unit-image/${unit.id}`);
  }, [unit?.id]);

  const allKeywords = unit.keywords ? unit.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
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

  return (
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
            ) : (unit.faction ? ' ' + unit.faction.toUpperCase() + ' ' : ' ')}<span className="gw-header-warscroll-label">{spName ? 'SPEARHEAD WARSCROLL ·' : 'WARSCROLL ·'}</span>
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
          {unit.options_text.split(/\.\s+/).map((sentence, i, arr) => (
            <p key={i}>{i < arr.length - 1 ? sentence + '.' : sentence}</p>
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
          <a href={unit.url} target="_blank" rel="noopener noreferrer">Source ↗</a>
        </div>
      )}
    </>
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

export default function WarscrollGW({ unit, onClose, onPrev, onNext, onJump, onFilterApply, factions = [], navIndex, navList, sortBy, spearheadData, allSpearheadRulesMap, onSwapFriendlyEnemy, onShowFriendlyOnly, onShowEnemyOnly, friendlyNavList, enemyNavList }) {
  const navTotal = navList ? navList.length : 0;
  const { showFlavorText, showBattleTraits, showBattleFormations, showHeroicTraits, showArtefacts, showSpellLore, showManifestationLore, useSpearheadAbilities } = useSettings();
  const modalRef = useRef(null);
  const dotsRef      = useRef(null);
  const dotsInnerRef = useRef(null);
  const [dotsAtStart,    setDotsAtStart]    = useState(true);
  const [dotsAtEnd,      setDotsAtEnd]      = useState(false);
  const [dotsHasOverflow, setDotsHasOverflow] = useState(false);
  const [dotsTranslate,  setDotsTranslate]  = useState(0);

  // activePage: null = show unit; { factionSlug, slideKey } = show that faction's rule page
  // factionSlug '__sp__' = spearhead mode slides
  const [activePage, setActivePage] = useState(null);

  // Spearhead slide checkbox/filter state — kept at top level to avoid hook-in-conditional violation
  const [spSlideSelectedAbs, setSpSlideSelectedAbs] = useState(new Set());
  const [spSlideFilterSelected, setSpSlideFilterSelected] = useState(false);

  // Battle Formation select/filter state — one shared column per faction (no
  // separate friendly/enemy split; the Friendly/Enemy unit filters upstream
  // already determine which factions' formation slides are reachable here).
  // Persisted per faction slug so it survives closing/reopening the popup.
  const [formationSelected, setFormationSelected] = useState(new Set());
  const [formationFilterSelected, setFormationFilterSelected] = useState(false);

  // Last slide visited per spearhead — restored only when switching to a different spearhead
  const lastSpSlide = useRef({}); // spName → slideKey
  const prevUnitSpName = useRef(null); // tracks previous spearhead name to detect side-switches
  const prevActivePage = useRef(null); // tracks previous activePage for slide-clear logic
  const unitChangeClear = useRef(false); // true when activePage→null came from unit change (not user nav)

  // Per-faction rules cache (populated for all slugs in navList)
  const rulesCache = useRef(new Map());
  const [loadedSlugs, setLoadedSlugs] = useState(new Set());

  // Compute contiguous faction groups from navList
  const factionGroups = React.useMemo(() => {
    if (!navList?.length) return [];
    const groups = [];
    for (let i = 0; i < navList.length; i++) {
      const u = navList[i];
      const last = groups[groups.length - 1];
      if (last && last.faction_slug === u.faction_slug) {
        last.endIdx = i;
      } else {
        groups.push({ faction_slug: u.faction_slug, faction: u.faction, grand_alliance: u.grand_alliance, startIdx: i, endIdx: i });
      }
    }
    return groups;
  }, [navList]);

  const isSpMode = !!(spearheadData || allSpearheadRulesMap);

  // Build slides for a named spearhead from allSpearheadRulesMap (or fall back to spearheadData)
  const getSpSlides = useCallback((spName) => {
    if (!spName) return [];
    const rules = allSpearheadRulesMap?.[spName]
      ?? (spearheadData?.spearheadName === spName ? spearheadData : null);
    if (!rules) return [];
    const slides = [];
    if ((rules.battleTraits ?? []).length > 0)
      slides.push({ key: 'sp_traits', isSpearhead: true, data: rules.battleTraits });
    if ((rules.regimentAbilities ?? []).length > 0 || (rules.enhancements ?? []).length > 0)
      slides.push({ key: 'sp_regiment', isSpearhead: true, regimentAbilities: rules.regimentAbilities ?? [], enhancements: rules.enhancements ?? [] });
    return slides;
  }, [allSpearheadRulesMap, spearheadData]);

  // Group navList by spearhead name (sequential, using _spName tag added by SpearheadPage)
  const spearheadNavGroups = React.useMemo(() => {
    if (!isSpMode || !navList?.length) return [];
    const groups = [];
    for (let i = 0; i < navList.length; i++) {
      const u = navList[i];
      const spName = u._spName ?? (u.spearhead || '').split('|')[0].trim();
      const last = groups[groups.length - 1];
      if (last && last.spearheadName === spName) {
        last.endIdx = i;
      } else {
        groups.push({ spearheadName: spName, faction: u.faction, grand_alliance: u.grand_alliance, startIdx: i, endIdx: i });
      }
    }
    return groups;
  }, [navList, isSpMode]);

  // Build slides for a given faction slug from the cache
  // Purple faction-rule slides only make sense when browsing in faction-sorted order —
  // any other sort scatters units from the same faction, so suppress the slides there.
  const getSlidesForSlug = useCallback((slug) => {
    if (sortBy !== 'faction') return [];
    const rules = rulesCache.current.get(slug);
    if (!rules) return [];
    const spellPrayerData = [...(rules.spell_lore ?? []), ...(rules.prayer_lore ?? [])];
    return [
      { key: 'manifestation_lore', enabled: showManifestationLore, data: rules.manifestation_lore ?? [] },
      { key: 'spell_lore',         enabled: showSpellLore,         data: spellPrayerData },
      { key: 'artefacts',          enabled: showArtefacts,         data: rules.artefacts ?? [] },
      { key: 'heroic_traits',      enabled: showHeroicTraits,      data: rules.heroic_traits ?? [] },
      { key: 'formations',         enabled: showBattleFormations,  data: rules.formations ?? [] },
      { key: 'traits',             enabled: showBattleTraits,      data: rules.traits ?? [] },
    ].filter(s => s.enabled && s.data.length > 0);
  }, [loadedSlugs, sortBy, showBattleTraits, showBattleFormations, showHeroicTraits, showArtefacts, showSpellLore, showManifestationLore]); // eslint-disable-line

  // Fetch rules for every unique faction slug in navList (skip in spearhead mode, or when not faction-sorted)
  useEffect(() => {
    if (isSpMode || !navList?.length || sortBy !== 'faction') return;
    const slugs = [...new Set(navList.map(u => u.faction_slug).filter(Boolean))];
    slugs.forEach(slug => {
      if (rulesCache.current.has(slug)) return;
      // Optimistic placeholder so we don't double-fetch
      rulesCache.current.set(slug, null);
      axios.get(`/api/faction-rules/${slug}`)
        .then(r => {
          rulesCache.current.set(slug, r.data);
          setLoadedSlugs(prev => new Set([...prev, slug]));
        })
        .catch(() => {
          rulesCache.current.set(slug, { traits: [], formations: [] });
          setLoadedSlugs(prev => new Set([...prev, slug]));
        });
    });
  }, [navList, spearheadData]);

  useEffect(() => {
    const outer = dotsRef.current;
    const inner = dotsInnerRef.current;
    if (!outer || !inner) return;
    const raf = requestAnimationFrame(() => {
      try {
        const outerW = outer.clientWidth;
        const innerW = inner.scrollWidth;
        if (innerW <= outerW + 4) {
          setDotsHasOverflow(false);
          setDotsAtStart(true);
          setDotsAtEnd(true);
          setDotsTranslate((outerW - innerW) / 2);
          return;
        }
        setDotsHasOverflow(true);
        const activeDot = inner.querySelector('.gw-nav-dot-active, .gw-nav-dot-faction-active, .gw-nav-dot-sp-active');
        if (!activeDot) return;
        const dotMid = activeDot.offsetLeft + activeDot.offsetWidth / 2;
        const minTx  = -(innerW - outerW);
        // Always center the active dot; clamping handles the left/right extremes naturally
        const tx = Math.min(0, Math.max(minTx, outerW / 2 - dotMid));
        setDotsTranslate(tx);
        setDotsAtStart(tx >= -4);
        setDotsAtEnd(tx <= minTx + 4);
      } catch (_) {}
    });
    return () => cancelAnimationFrame(raf);
  }, [navIndex, activePage, navTotal, loadedSlugs, spearheadNavGroups]); // eslint-disable-line

  // When unit changes, restore the last slide they were on for this spearhead (or carry
  // When unit changes: restore last slide only when switching spearheads (side-swap).
  // Left/right nav within the same spearhead always returns to the unit warscroll view.
  useEffect(() => {
    const newSpName = unit?._spName ?? (unit?.spearhead || '').split('|')[0].trim();
    const spNameChanged = newSpName !== prevUnitSpName.current;
    prevUnitSpName.current = newSpName;

    if (newSpName && spNameChanged) {
      // Switching to a different spearhead — restore slide only if user was ON that slide
      // when they last left this spearhead (lastSpSlide cleared when user returns to unit view)
      const savedKey = lastSpSlide.current[newSpName];
      if (savedKey) {
        const spSlides = getSpSlides(newSpName);
        const valid = spSlides.find(s => s.key === savedKey);
        if (valid) {
          setActivePage({ factionSlug: '__sp__', spearheadName: newSpName, slideKey: savedKey });
          return;
        }
        const fSlug = unit?.faction_slug;
        if (fSlug) {
          const fSlides = getSlidesForSlug(fSlug);
          const fValid = fSlides.find(s => s.key === savedKey);
          if (fValid) {
            const grp = factionGroups.find(g => g.faction_slug === fSlug);
            setActivePage({ factionSlug: fSlug, slideKey: savedKey, groupStartIdx: grp?.startIdx ?? 0 });
            return;
          }
        }
      }
    }
    // Same spearhead (left/right nav) or no saved slide: show unit warscroll.
    // Mark that this null came from a unit change, not user navigation.
    unitChangeClear.current = true;
    setActivePage(null);
  }, [unit?.id]); // eslint-disable-line

  // Track last slide per spearhead.
  // When user navigates FROM a spearhead slide TO the unit warscroll, clear the saved slide
  // so that switching sides later doesn't unexpectedly restore it.
  // When the transition to null was caused by a unit change (not user), preserve it.
  useEffect(() => {
    const fromUnitChange = unitChangeClear.current;
    unitChangeClear.current = false;

    if (!fromUnitChange && prevActivePage.current?.factionSlug === '__sp__' && !activePage) {
      // User explicitly left the slide — clear saved slide for that spearhead
      delete lastSpSlide.current[prevActivePage.current.spearheadName];
    }
    if (activePage?.factionSlug === '__sp__' && activePage.spearheadName && activePage.slideKey) {
      lastSpSlide.current[activePage.spearheadName] = activePage.slideKey;
    }
    prevActivePage.current = activePage;
  }, [activePage]);

  // Scroll to top when switching slides or units
  useEffect(() => {
    if (modalRef.current) modalRef.current.scrollTop = 0;
  }, [activePage, unit?.id]);

  // Load spearhead slide checkbox + filter state from localStorage when slide changes
  useEffect(() => {
    if (!activePage || activePage.factionSlug !== '__sp__') return;
    const spName = activePage.spearheadName ?? spearheadData?.spearheadName ?? '';
    const storageKey = `sp-selected-${spName}-${activePage.slideKey}`;
    const filterKey  = `sp-filter-${spName}-${activePage.slideKey}`;
    try { setSpSlideSelectedAbs(new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))); }
    catch { setSpSlideSelectedAbs(new Set()); }
    setSpSlideFilterSelected(localStorage.getItem(filterKey) === '1');
  }, [activePage?.slideKey, spearheadData?.spearheadName]); // eslint-disable-line

  // Load Battle Formation checkbox + filter state from localStorage when the
  // formations slide for a (possibly new) faction becomes active.
  useEffect(() => {
    if (!activePage || activePage.factionSlug === '__sp__' || activePage.slideKey !== 'formations') return;
    const storageKey = `formation-selected-${activePage.factionSlug}`;
    const filterKey  = `formation-filter-${activePage.factionSlug}`;
    try { setFormationSelected(new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))); }
    catch { setFormationSelected(new Set()); }
    setFormationFilterSelected(localStorage.getItem(filterKey) === '1');
  }, [activePage?.factionSlug, activePage?.slideKey]); // eslint-disable-line

  // Resolve slides for a given context (spearhead or faction slug)
  const resolveSlidesFor = useCallback((factionSlug, spName) => {
    if (factionSlug === '__sp__') return getSpSlides(spName);
    return getSlidesForSlug(factionSlug);
  }, [getSpSlides, getSlidesForSlug]);

  // Find which faction group the current navIndex belongs to
  const currentGroupIdx = React.useMemo(() =>
    factionGroups.findIndex(g => navIndex >= g.startIdx && navIndex <= g.endIdx),
  [factionGroups, navIndex]);

  const handlePrev = useCallback(() => {
    if (activePage !== null) {
      const slides = resolveSlidesFor(activePage.factionSlug, activePage.spearheadName);
      const idx = slides.findIndex(s => s.key === activePage.slideKey);
      if (idx > 0) {
        setActivePage({ ...activePage, slideKey: slides[idx - 1].key });
      } else if (navIndex > 0) {
        // Only cross left past a slide boundary if there's content to the left
        setActivePage(null);
        onPrev?.();
      }
      // else: already at the very start, stay on this slide
      return;
    }
    if (isSpMode) {
      const spGrp = spearheadNavGroups.find(g => navIndex >= g.startIdx && navIndex <= g.endIdx);
      if (spGrp && navIndex === spGrp.startIdx) {
        const slides = getSpSlides(spGrp.spearheadName);
        if (slides.length > 0) {
          setActivePage({ factionSlug: '__sp__', spearheadName: spGrp.spearheadName, slideKey: slides[slides.length - 1].key });
          return;
        }
      }
      onPrev?.();
      return;
    }
    const group = factionGroups[currentGroupIdx];
    if (group && navIndex === group.startIdx) {
      const slides = getSlidesForSlug(group.faction_slug);
      if (slides.length > 0) {
        setActivePage({ factionSlug: group.faction_slug, slideKey: slides[slides.length - 1].key, groupStartIdx: group.startIdx });
        return;
      }
    }
    onPrev?.();
  }, [activePage, navIndex, factionGroups, currentGroupIdx, isSpMode, spearheadNavGroups, getSpSlides, resolveSlidesFor, getSlidesForSlug, onPrev]);

  const handleNext = useCallback(() => {
    if (activePage !== null) {
      const slides = resolveSlidesFor(activePage.factionSlug, activePage.spearheadName);
      const idx = slides.findIndex(s => s.key === activePage.slideKey);
      if (idx < slides.length - 1) {
        setActivePage({ ...activePage, slideKey: slides[idx + 1].key });
      } else {
        if (activePage.factionSlug === '__sp__') {
          const spGrp = spearheadNavGroups.find(g => g.spearheadName === activePage.spearheadName);
          setActivePage(null);
          if (spGrp) onJump?.(spGrp.startIdx);
        } else {
          // Use groupStartIdx to uniquely identify the group (works regardless of navIndex position)
          const grp = factionGroups.find(g => g.startIdx === activePage.groupStartIdx)
            ?? factionGroups.find(g => g.faction_slug === activePage.factionSlug);
          setActivePage(null);
          if (grp) onJump?.(grp.startIdx);
        }
      }
      return;
    }
    if (isSpMode) {
      const spGrp = spearheadNavGroups.find(g => navIndex >= g.startIdx && navIndex <= g.endIdx);
      const spGrpIdx = spearheadNavGroups.indexOf(spGrp);
      const nextSpGrp = spearheadNavGroups[spGrpIdx + 1];
      if (spGrp && nextSpGrp && navIndex === spGrp.endIdx) {
        const slides = getSpSlides(nextSpGrp.spearheadName);
        if (slides.length > 0) {
          setActivePage({ factionSlug: '__sp__', spearheadName: nextSpGrp.spearheadName, slideKey: slides[0].key });
          return;
        }
      }
    } else {
      const group = factionGroups[currentGroupIdx];
      const nextGroup = factionGroups[currentGroupIdx + 1];
      if (group && nextGroup && navIndex === group.endIdx) {
        const slides = getSlidesForSlug(nextGroup.faction_slug);
        if (slides.length > 0) {
          setActivePage({ factionSlug: nextGroup.faction_slug, slideKey: slides[0].key, groupStartIdx: nextGroup.startIdx });
          return;
        }
      }
    }
    onNext?.();
  }, [activePage, navIndex, factionGroups, currentGroupIdx, isSpMode, spearheadNavGroups, getSpSlides, resolveSlidesFor, getSlidesForSlug, onNext, onJump]);

  // Keyboard: Escape=close, ←=prev, →=next, PageUp=friendly only, PageDown=enemy only
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')  { e.preventDefault(); handlePrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      if (e.key === 'PageUp')     { e.preventDefault(); onShowFriendlyOnly?.(); }
      if (e.key === 'PageDown')   { e.preventDefault(); onShowEnemyOnly?.(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, handlePrev, handleNext, onShowFriendlyOnly, onShowEnemyOnly]);

  // Touch swipe: left=next, right=prev.
  // Axis-locked: once the gesture direction is determined (H vs V), we commit.
  // Horizontal swipes call preventDefault to prevent frame shift / scroll interference.
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    let startX = null, startY = null, startT = null, axis = null; // axis: null | 'h' | 'v'

    const onStart = e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
      axis = null;
    };
    const onMove = e => {
      if (startX === null) return;
      if (axis === null) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        // Vertical wins at 8px with any vertical lean — preserves natural scroll/pan.
        // Horizontal only locks when clearly dominant (2:1 ratio + 14px) to avoid
        // diagonal micro-movements stealing scroll and causing squirly vertical feel.
        if (dy > 8) axis = 'v';
        else if (dx > 14 && dx > dy * 2) axis = 'h';
      }
      if (axis === 'h') e.preventDefault(); // stop scroll/frame-shift on horizontal
    };
    const onEnd = e => {
      if (startX !== null && axis === 'h') {
        const dx = e.changedTouches[0].clientX - startX;
        const velocity = Math.abs(dx) / (Date.now() - startT); // px/ms
        // Require either a fast flick (≥0.4 px/ms) or a long deliberate swipe (≥120px).
        // This lets slow content-panning on iPhone coexist with navigation gestures.
        if (Math.abs(dx) > 50 && (velocity >= 0.4 || Math.abs(dx) >= 120)) {
          dx < 0 ? handleNext() : handlePrev();
        }
      }
      startX = null; startY = null; startT = null; axis = null;
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

  // Split-pane view: independently browse a friendly unit and an enemy unit
  // side by side. Only offered when the parent page can supply both lists
  // (i.e. the user has flagged at least one unit on each side).
  const canSplit = !!(friendlyNavList?.length && enemyNavList?.length);
  const [splitView, setSplitView] = useState(false);
  const [splitLeftIdx, setSplitLeftIdx] = useState(0);
  const [splitRightIdx, setSplitRightIdx] = useState(0);

  const enterSplitView = () => {
    if (!canSplit) return;
    const li = friendlyNavList.findIndex(u => u.id === unit.id);
    const ri = enemyNavList.findIndex(u => u.id === unit.id);
    setSplitLeftIdx(li >= 0 ? li : 0);
    setSplitRightIdx(ri >= 0 ? ri : 0);
    setSplitView(true);
  };

  return (
    <>
      <div className="gw-overlay" />
      <div className="gw-modal" ref={modalRef} role="dialog" aria-modal="true" aria-label={unit.name}>

        {canSplit && (
          <div className="gw-view-toggle">
            <button
              type="button"
              className={`gw-view-mode-btn${!splitView ? ' gw-view-mode-btn-active' : ''}`}
              onClick={() => setSplitView(false)}
              title="Single pane"
            ><span className="gw-view-icon gw-view-icon-single"><i /></span></button>
            <button
              type="button"
              className={`gw-view-mode-btn${splitView ? ' gw-view-mode-btn-active' : ''}`}
              onClick={enterSplitView}
              title="Split pane — friendly + enemy side by side"
            ><span className="gw-view-icon gw-view-icon-split"><i /><i /></span></button>
          </div>
        )}
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        {/* ── Nav dots ── */}
        {!splitView && navTotal > 0 && (
          <div
            className="gw-nav-dots"
            ref={dotsRef}
            style={dotsHasOverflow ? {
              WebkitMaskImage: `linear-gradient(to right, transparent ${dotsAtStart ? '0%' : '8%'}, black ${dotsAtStart ? '0%' : '28%'}, black ${dotsAtEnd ? '100%' : '72%'}, transparent ${dotsAtEnd ? '100%' : '92%'})`,
              maskImage:       `linear-gradient(to right, transparent ${dotsAtStart ? '0%' : '8%'}, black ${dotsAtStart ? '0%' : '28%'}, black ${dotsAtEnd ? '100%' : '72%'}, transparent ${dotsAtEnd ? '100%' : '92%'})`,
            } : undefined}
          >
          <div
            className="gw-nav-dots-inner"
            ref={dotsInnerRef}
            style={{ transform: `translateX(${dotsTranslate}px)`, transition: dotsHasOverflow ? 'transform 0.25s ease' : 'none' }}
          >
            {onSwapFriendlyEnemy && (
              <button className="gw-nav-swap-btn" onClick={onSwapFriendlyEnemy} title="Swap friendly / enemy filter">⇔</button>
            )}
            {isSpMode ? (
              /* ── Spearhead mode: per-spearhead group (rule dots + unit dots + separator) ── */
              spearheadNavGroups.map((grp, gi) => {
                const slides = getSpSlides(grp.spearheadName);
                const isFactionBreak = gi > 0 && spearheadNavGroups[gi - 1].faction !== grp.faction;
                return (
                  <React.Fragment key={grp.spearheadName + '-' + gi}>
                    {gi > 0 && <span className={isFactionBreak ? 'gw-nav-faction-sep' : 'gw-nav-sp-grp-sep'} title={grp.spearheadName} />}
                    {slides.map(s => (
                      <span key={s.key}
                        className={`gw-nav-dot-sp${activePage?.spearheadName === grp.spearheadName && activePage?.slideKey === s.key ? ' gw-nav-dot-sp-active' : ''}`}
                        title={`${grp.spearheadName} — ${s.key === 'sp_traits' ? 'Battle Traits' : 'Regiment Abilities & Enhancements'}`}
                        onClick={() => { onJump?.(grp.startIdx); setActivePage({ factionSlug: '__sp__', spearheadName: grp.spearheadName, slideKey: s.key }); }}
                      />
                    ))}
                    {slides.length > 0 && <span className="gw-nav-sep" />}
                    {navList.slice(grp.startIdx, grp.endIdx + 1).map((u, localI) => {
                      const i = grp.startIdx + localI;
                      return (
                        <span key={u.id ?? i}
                          className={`gw-nav-dot${activePage === null && i === navIndex ? ' gw-nav-dot-active' : ''}`}
                          title={u.name}
                          onClick={() => { setActivePage(null); onJump?.(i); }} />
                      );
                    })}
                  </React.Fragment>
                );
              })
            ) : (
              /* ── Normal mode: per-faction rule dots + units, with faction separators ── */
              factionGroups.map((group, gi) => {
                const slides = getSlidesForSlug(group.faction_slug);
                const SLIDE_LABELS = { traits: 'Battle Traits', formations: 'Battle Formations', heroic_traits: 'Heroic Traits', artefacts: 'Artefacts of Power', spell_lore: 'Spell / Prayer Lore', manifestation_lore: 'Manifestation Lore' };
                return (
                  <React.Fragment key={group.faction_slug + '-' + gi}>
                    {/* Bold faction-change separator between groups */}
                    {gi > 0 && <span className="gw-nav-faction-sep" title={group.faction} />}
                    {/* Purple rule slide dots for this faction */}
                    {slides.map(s => (
                      <span key={s.key}
                        className={`gw-nav-dot-faction${activePage?.groupStartIdx === group.startIdx && activePage?.slideKey === s.key ? ' gw-nav-dot-faction-active' : ''}`}
                        title={`${group.faction} — ${SLIDE_LABELS[s.key] ?? s.key}`}
                        onClick={() => setActivePage({ factionSlug: group.faction_slug, slideKey: s.key, groupStartIdx: group.startIdx })}
                      />
                    ))}
                    {slides.length > 0 && <span className="gw-nav-sep" />}
                    {/* Unit dots for this faction group */}
                    {navList.slice(group.startIdx, group.endIdx + 1).map((u, localI) => {
                      const i = group.startIdx + localI;
                      const type = getPrimaryType(u);
                      const prevType = localI > 0 ? getPrimaryType(navList[i - 1]) : null;
                      return (
                        <React.Fragment key={u.id ?? i}>
                          {localI > 0 && prevType !== type && <span className="gw-nav-sep" />}
                          <span className={`gw-nav-dot${activePage === null && i === navIndex ? ' gw-nav-dot-active' : ''}`}
                                title={u.name}
                                onClick={() => { setActivePage(null); onJump?.(i); }} />
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </div>
          </div>
        )}

        {/* ── Slide content (spearhead or faction, replaces warscroll when active) ── */}
        {!splitView && activePage !== null && (() => {
          const { factionSlug, slideKey } = activePage;

          // Spearhead slides
          if (factionSlug === '__sp__') {
            const spName = activePage.spearheadName ?? spearheadData?.spearheadName ?? '';
            const slide = getSpSlides(spName).find(s => s.key === slideKey);
            if (!slide) return null;
            const title = slideKey === 'sp_traits' ? 'Battle Traits' : 'Regiment Abilities & Enhancements';

            // Checkbox + filter state (top-level state, loaded via useEffect on slide change)
            const storageKey = `sp-selected-${spName}-${slideKey}`;
            const selectedAbs = spSlideSelectedAbs;
            const filterSelected = spSlideFilterSelected;

            const toggleSelected = (name) => {
              setSpSlideSelectedAbs(prev => {
                const next = new Set(prev);
                next.has(name) ? next.delete(name) : next.add(name);
                localStorage.setItem(storageKey, JSON.stringify([...next]));
                return next;
              });
            };
            const setFilterSelected = (updater) => {
              setSpSlideFilterSelected(prev => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                localStorage.setItem(`sp-filter-${spName}-${slideKey}`, next ? '1' : '0');
                return next;
              });
            };

            const renderAbilityCard = (ab, i) => {
              let { text, declare, effect, ...rest } = ab;
              if (text && !effect) {
                const effMatch = text.match(/^(.*?)\bEffect:\s*/s);
                if (effMatch) {
                  const before = effMatch[1].trim();
                  const declMatch = before.match(/^Declare:\s*([\s\S]*)/);
                  if (declMatch) {
                    declare = declMatch[1].trim() || undefined;
                    effect = text.slice(effMatch[0].length).trim();
                  } else {
                    declare = undefined;
                    const afterEffect = text.slice(effMatch[0].length).trim();
                    effect = before ? `${before} ${afterEffect}` : afterEffect;
                  }
                } else {
                  effect = text;
                }
              }
              const isSelected = selectedAbs.has(ab.name);
              if (filterSelected && !isSelected) return null;
              return (
                <div key={i} className="gw-ab-selectable">
                  <button
                    className={`gw-ab-checkbox${isSelected ? ' gw-ab-checkbox-on' : ''}`}
                    onClick={() => toggleSelected(ab.name)}
                    title={isSelected ? 'Deselect' : 'Select (mark as in use)'}
                  >{isSelected ? '☑' : '☐'}</button>
                  <AbilityCard ab={{ ...rest, declare, effect, bullets: parseBullets(ab.bullets) }} keywords={[]} />
                </div>
              );
            };

            const hasSelected = selectedAbs.size > 0;

            if (slideKey === 'sp_regiment') {
              const ra  = slide.regimentAbilities ?? [];
              const en  = slide.enhancements ?? [];
              const raFiltered = filterSelected ? ra.filter(a => selectedAbs.has(a.name)) : ra;
              const enFiltered = filterSelected ? en.filter(a => selectedAbs.has(a.name)) : en;
              return (
                <div className="gw-faction-slide gw-spearhead-slide">
                  <div className="gw-spearhead-slide-header">
                    <div className="gw-header-type" style={{color:'#c8a0f0'}}>{unit.grand_alliance?.toUpperCase()}{unit.grand_alliance && unit.faction ? ' · ' : ''}{unit.faction?.toUpperCase()}</div>
                    <div className="gw-spearhead-slide-name">{spName}</div>
                    <div className="gw-spearhead-slide-title">{title.toUpperCase()}</div>
                  </div>
                  <div className="gw-faction-slide-body">
                    <div className="gw-sp-filter-bar">
                      <button
                        className={`gw-sp-filter-btn${filterSelected ? ' active' : ''}`}
                        onClick={() => setFilterSelected(f => !f)}
                        disabled={!hasSelected}
                        title="Show only selected abilities"
                      >{filterSelected ? 'Show All' : 'Show Selected'}</button>
                    </div>
                    {ra.length > 0 && (
                      <>
                        <div className="gw-sp-section-hdr">Regiment Abilities</div>
                        <div className="gw-abilities-grid gw-sp-grid-2col">
                          {ra.map((ab, i) => renderAbilityCard(ab, i))}
                        </div>
                      </>
                    )}
                    {en.length > 0 && (
                      <>
                        <div className="gw-sp-section-sep" />
                        <div className="gw-sp-section-hdr">Enhancements</div>
                        <div className="gw-abilities-grid gw-sp-grid-2col">
                          {en.map((ab, i) => renderAbilityCard(ab, `e${i}`))}
                        </div>
                      </>
                    )}
                    {filterSelected && raFiltered.length === 0 && enFiltered.length === 0 && (
                      <p style={{color:'var(--text-dim)',fontStyle:'italic',padding:'1rem'}}>No selected abilities to show.</p>
                    )}
                  </div>
                </div>
              );
            }

            // Battle Traits slide — no checkboxes or filter, all traits always visible
            return (
              <div className="gw-faction-slide gw-spearhead-slide">
                <div className="gw-spearhead-slide-header">
                  <div className="gw-header-type" style={{color:'#c8a0f0'}}>{unit.grand_alliance?.toUpperCase()}{unit.grand_alliance && unit.faction ? ' · ' : ''}{unit.faction?.toUpperCase()}</div>
                  <div className="gw-spearhead-slide-name">{spName}</div>
                  <div className="gw-spearhead-slide-title">{title.toUpperCase()}</div>
                </div>
                <div className="gw-faction-slide-body">
                  {(slide.data ?? []).length === 0
                    ? <p style={{color:'var(--text-dim)',fontStyle:'italic',padding:'1rem'}}>No data available.</p>
                    : <div className="gw-abilities-grid">
                        {(slide.data ?? []).map((ab, i) => {
                          let { text, declare, effect, ...rest } = ab;
                          if (text && !effect) {
                            const effMatch = text.match(/^(.*?)\bEffect:\s*/s);
                            if (effMatch) {
                              const before = effMatch[1].trim();
                              const declMatch = before.match(/^Declare:\s*([\s\S]*)/);
                              if (declMatch) { declare = declMatch[1].trim() || undefined; effect = text.slice(effMatch[0].length).trim(); }
                              else { declare = undefined; const afterEffect = text.slice(effMatch[0].length).trim(); effect = before ? `${before} ${afterEffect}` : afterEffect; }
                            } else { effect = text; }
                          }
                          return <AbilityCard key={i} ab={{ ...rest, declare, effect, bullets: parseBullets(ab.bullets) }} keywords={[]} />;
                        })}
                      </div>
                  }
                </div>
              </div>
            );
          }

          // Faction slides
          const slides = getSlidesForSlug(factionSlug);
          const slide = slides.find(s => s.key === slideKey);
          if (!slide) return null;
          const group = factionGroups.find(g => g.faction_slug === factionSlug);
          const factionName     = group?.faction ?? factionSlug;
          const grandAlliance   = group?.grand_alliance ?? '';
          const SLIDE_TITLES = { traits: 'Battle Traits', formations: 'Battle Formations', heroic_traits: 'Heroic Traits', artefacts: 'Artefacts of Power', spell_lore: 'Spell / Prayer Lore', manifestation_lore: 'Manifestation Lore' };

          if (slideKey === 'formations') {
            const toggleFormation = (name) => {
              setFormationSelected(prev => {
                const next = new Set(prev);
                next.has(name) ? next.delete(name) : next.add(name);
                localStorage.setItem(`formation-selected-${factionSlug}`, JSON.stringify([...next]));
                return next;
              });
            };
            const toggleFormationFilter = () => {
              setFormationFilterSelected(prev => {
                const next = !prev;
                localStorage.setItem(`formation-filter-${factionSlug}`, next ? '1' : '0');
                return next;
              });
            };
            return (
              <FactionFormationsSlide
                faction={factionName}
                grandAlliance={grandAlliance}
                formations={slide.data}
                selected={formationSelected}
                filterSelected={formationFilterSelected}
                onToggle={toggleFormation}
                onToggleFilter={toggleFormationFilter}
              />
            );
          }
          return <FactionTraitsSlide faction={factionName} grandAlliance={grandAlliance} title={SLIDE_TITLES[slideKey] ?? slideKey} traits={slide.data} slideKey={slideKey} />;
        })()}

        {/* ── Warscroll content (hidden when on a rule slide or in split view) ── */}
        {!splitView && activePage === null && (
          <WarscrollBody unit={unit} factions={factions} onFilterApply={onFilterApply} />
        )}

        {/* ── Split view: browse a friendly unit and an enemy unit side by side ── */}
        {splitView && (
          <div className="gw-split-view">
            <div className="gw-split-pane">
              <div className="gw-split-pane-nav">
                <button
                  className="gw-split-pane-arrow"
                  disabled={splitLeftIdx <= 0}
                  onClick={() => setSplitLeftIdx(i => Math.max(0, i - 1))}
                  title="Previous friendly unit"
                >‹</button>
                <span className="gw-split-pane-label gw-split-pane-label-friendly">FRIENDLY</span>
                <button
                  className="gw-split-pane-arrow"
                  disabled={splitLeftIdx >= friendlyNavList.length - 1}
                  onClick={() => setSplitLeftIdx(i => Math.min(friendlyNavList.length - 1, i + 1))}
                  title="Next friendly unit"
                >›</button>
              </div>
              <div className="gw-split-pane-body">
                <WarscrollBody unit={friendlyNavList[splitLeftIdx]} factions={factions} />
              </div>
            </div>
            <div className="gw-split-pane">
              <div className="gw-split-pane-nav">
                <button
                  className="gw-split-pane-arrow"
                  disabled={splitRightIdx <= 0}
                  onClick={() => setSplitRightIdx(i => Math.max(0, i - 1))}
                  title="Previous enemy unit"
                >‹</button>
                <span className="gw-split-pane-label gw-split-pane-label-enemy">ENEMY</span>
                <button
                  className="gw-split-pane-arrow"
                  disabled={splitRightIdx >= enemyNavList.length - 1}
                  onClick={() => setSplitRightIdx(i => Math.min(enemyNavList.length - 1, i + 1))}
                  title="Next enemy unit"
                >›</button>
              </div>
              <div className="gw-split-pane-body">
                <WarscrollBody unit={enemyNavList[splitRightIdx]} factions={factions} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
