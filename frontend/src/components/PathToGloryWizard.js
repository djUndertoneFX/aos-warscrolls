import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AbilityCard } from './WarscrollGW';

function parseFormationBullets(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// The 8 Mortal Realms. Descriptions below are general, widely-known setting
// lore written for this UI — NOT verbatim text quoted from a GW rulebook.
// We don't have a book excerpt describing each realm to draw authentic
// flavor text from; if one gets photographed, swap these in.
const REALMS = [
  { key: 'aqshy',  name: 'Aqshy',  epithet: 'the Realm of Fire', realmstone: 'Emberstone',
    desc: 'A realm of ceaseless war and raw aggression, its skies choked with ash and its rivers running molten. Aqshy grants strength and fury to those who call it home.' },
  { key: 'chamon', name: 'Chamon', epithet: 'the Realm of Metal', realmstone: 'Chamonite',
    desc: 'A realm of alchemy and artifice, where mountains of gold and seas of mercury reshape reality itself. Its magic favours makers of war-engines and wielders of arcane technology.' },
  { key: 'ghur',   name: 'Ghur',   epithet: 'the Realm of Beasts', realmstone: 'Amberbone',
    desc: 'A savage wilderness realm of monstrous beasts and endless hunts, where only the strong survive and predator and prey are locked in eternal struggle.' },
  { key: 'ghyran', name: 'Ghyran', epithet: 'the Realm of Life', realmstone: 'Cyclestone',
    desc: 'A verdant realm of overwhelming growth and rebirth, its jungles and swamps teeming with life — though also with the rot and pestilence that feed on it.' },
  { key: 'hysh',   name: 'Hysh',   epithet: 'the Realm of Light', realmstone: 'Aetherquartz',
    desc: 'A realm of order, knowledge, and illumination, where the light of civilisation battles endlessly against encroaching darkness and the perils of hubris.' },
  { key: 'shyish', name: 'Shyish', epithet: 'the Realm of Death', realmstone: 'Grave-sand',
    desc: 'A realm of ancient ruins and endless twilight, where time itself runs strangely and the dead do not always stay buried.' },
  { key: 'ulgu',   name: 'Ulgu',   epithet: 'the Realm of Shadow', realmstone: 'Falsestone',
    desc: 'A realm of deception and mist-shrouded illusion, where nothing is quite as it seems and shadow conceals both refuge and ambush.' },
  { key: 'azyr',   name: 'Azyr',   epithet: 'the Realm of Heavens', realmstone: 'Celestium',
    desc: 'The celestial realm of Sigmar and his Stormcast Eternals, a bastion of order among the stars from which the God-King directs the reconquest of the Mortal Realms.' },
];

const STEPS = [
  'Select your Campaign',
  'Pick your Faction',
  'Pick your Warlord',
  'Pick your Warlord Path',
  'Add your Starting units',
  'Add your Enhancements',
  'Add your Lores',
  'Pick your First Quest',
  'Prepare for Battle',
];

// GW currently publishes 3 Path to Glory battlepacks — only Ascension's core
// rules are implemented so far, so the other two are shown but disabled.
const CAMPAIGNS = [
  { key: 'ascension',    name: 'Ascension',                 desc: 'The core Path to Glory campaign — forge your warlord’s rise to legend.', available: true },
  { key: 'ravaged-coast', name: 'Ravaged Coast',             desc: 'A narrative Path to Glory battlepack.', available: false },
  { key: 'blighted-wilds', name: 'Blighted Wilds',           desc: 'A narrative Path to Glory battlepack.', available: false },
  { key: 'custom',        name: 'Foreign War of Aggression', desc: 'A custom, homebrew campaign of your own design.', available: true, custom: true },
];

// Starting points limit per campaign, per the core rules (Ascension: pg 237,
// "combined points value... cannot exceed 1000 points"). Add entries here
// once Ravaged Coast/Blighted Wilds limits are known — auto-fills the Army
// Roster's Points Limit field when that campaign is picked.
const CAMPAIGN_POINTS_LIMITS = {
  ascension: '1000',
};

// Per-faction Warlord-creation step sequences from that faction's battletome
// "Path to Glory: The Anvil of Apotheosis" section. Only Idoneth Deepkin is
// sourced so far (given directly by the user, 2026-07-11 — not photographed,
// just the step titles, no mechanical details yet beyond "fill out the
// warscroll"). Stormcast Eternals is known to have 7 steps but we don't have
// their names yet. Every other faction has none — those fall back to the
// plain single-panel Warlord Warscroll form.
const WARLORD_STEPS_BY_FACTION = {
  'idoneth-deepkin': [
    'Set a Destiny Point Limit',
    'Fill out the starting Warscroll',
    'Choose an Archetype',
    'Choose a Companion',
    "Pick your hero's origin and/or flaw",
    'Choose a Battle Mount',
    'Pick any Battle Mount upgrade',
    'Pick any other upgrades',
  ],
};

// The 4 Warlord Paths (core rules pgs 256-261) — Mage/Devout are restricted
// to Wizard/Priest warlords respectively.
const PATHS = [
  { key: 'warrior', name: 'Path of the Warrior', restricted: null,
    desc: 'Warlords who walk this Path pride their martial prowess and strength above all else.' },
  { key: 'leader', name: 'Path of the Leader', restricted: null,
    desc: 'The tactical acumen of this warlord is their greatest asset. Even in the heat of battle, they can spot weaknesses in the enemy line and exploit them without mercy.' },
  { key: 'mage', name: 'Path of the Mage', restricted: 'Wizard only',
    desc: 'To walk this Path, your warlord must already have some proficiency in the arcane arts. By the end, they will be able to shape the very realms.' },
  { key: 'devout', name: 'Path of the Devout', restricted: 'Priest only',
    desc: 'With an unshakable faith to guide them, this warlord has been chosen by their patron deity for a greater purpose (or so they claim!).' },
];

// Explicit [row, col] placement (1-indexed) for the faction grid on a 6-col x
// 4-row layout — Order fills a 3x3 block top-left, Chaos a 3x2 block
// top-right, Death a 1x4 strip bottom-left, Destruction the remaining
// L-shaped 5 cells toward the bottom-right. A perfect 4-way rectangle split
// isn't possible for these exact counts (9/6/4/5 — the ratios conflict), so
// Destruction's block is the one that isn't a clean rectangle. If the
// per-alliance faction count ever changes, entries beyond this map fall
// back to normal grid auto-flow rather than breaking.
const FACTION_GRID_POSITIONS = {
  Order:       [[1,1],[1,2],[1,3],[2,1],[2,2],[2,3],[3,1],[3,2],[3,3]],
  Chaos:       [[1,4],[1,5],[1,6],[2,4],[2,5],[2,6]],
  Destruction: [[3,4],[3,5],[3,6],[4,5],[4,6]],
  Death:       [[4,1],[4,2],[4,3],[4,4]],
};

// Tiny (24px-wide, ~400-byte) blur-up placeholders for the 5 scanned page
// images below, inlined as data URIs so they paint instantly with zero
// network round-trip — swapped for the real image once it finishes loading,
// instead of showing a blank box while the 15KB-600KB JPEG is in flight.
const DOC_MICRO = {
  warlord: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEBQL/xAAmEAABBAAEBgMBAAAAAAAAAAABAAIDEQQSIUEFEzEzUXEUgZEi/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAH/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwDfgeyP+OY1pB3GyobiACanZ+KeDNqBJlHjqmAyX3a+lAwYjmTsYJWOzHpSFw2/kR2/Nr4Qg64aLa7XfZUhtXr9LC4Xi5xIXiVohrt8vW/a1BiXEZszfxA6aw9ntCnfOXvYXOFNN0AUIP/Z',
  roster:  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGgAAAgIDAAAAAAAAAAAAAAAAAAQDBQECBv/EACkQAAIBAwMCBAcAAAAAAAAAAAECAwAREgQhMTJBBQZhwRNCUXGS0eH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABURAQEAAAAAAAAAAAAAAAAAAAAB/9oADAMBAAIRAxEAPwDoNEItOGQK5yYtc2PNMiZw23T9hel4Y9g1gSRyRf3qRxj8i/h/aglkYah4gBIhVw1wRY87H0oqCFmMqC1hfstqKBHwppJkkZXOGZFsiOPanUjlzzza4PGZ/VUvl7XINI5YkAuSNvqSauo9XGy8nf0qVW2p+IYw2QUBh0k3orE2piaIgXO47UUR/9k=',
  oob:     'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAECAwQG/8QAJBAAAQMDBAEFAAAAAAAAAAAAAQACEQMSIQQTMUFxBVGRofD/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOt3KbHPbaZB5hVuq3YJNvvaFXaG6qpUE3HGTP1wpbjpm75GFBk11M1HRAjGe58IWp7i6rTaTieIQgQw9/lIfpUTUaHOcZhxlLeaOygNQ+wtMxCFk9R1dMUXQXTGEIj/2Q==',
  army1:   'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEBQH/xAAnEAACAQEHAgcAAAAAAAAAAAABAgADBBESEyEiMQVRFCMyQWGBkf/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A37Jl2VWVVxYnLbn7x/imW43rr8iJsdZCzUssFl9yZTiJIGXT/JAM5tLUtuABw16vzzpCdJAqIBTUa8gwgQ2E+a4FNRzvA5lQXf6vqZnTLSCCzE4dds0FqobmAMBrX5qEd+0ItqqM6kX3CED/2Q==',
  army2:   'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAAfABgDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEAgb/xAAlEAACAgECBQUBAAAAAAAAAAABAgARAwQhEhMxUXEFFDJhkYH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOpTVINTlwjHbITvfiabKWNFFrzJlysNZmDBVTiNNQvoI1SC1q1/wSCTX6NXyc0AhqoizX5CWZBbpfS+0ICEzZPeZldiMYY1+CNXhJtSTFEoGdnGzmxtAZUX4krfYQGarIVUHiO28JB6hq15JCu5P3CEf//Z',
};

// The 4 documents a Path to Glory roster is built from. `images` point at
// scans of the official GW sheets (extracted from the PDFs the user
// provided) — used both for the tray thumbnail and the "Image" presentation.
// `micro`/`thumbMicro` are the blur-up placeholders above.
const DOCS = [
  { key: 'warlord', title: 'Warlord Warscroll', images: [{ src: '/ptg/warlord-warscroll.jpg', micro: DOC_MICRO.warlord }], thumb: '/ptg/warlord-warscroll-thumb.jpg', thumbMicro: DOC_MICRO.warlord },
  { key: 'roster',  title: 'Path to Glory Roster', images: [{ src: '/ptg/ptg-roster.jpg', micro: DOC_MICRO.roster }], thumb: '/ptg/ptg-roster-thumb.jpg', thumbMicro: DOC_MICRO.roster },
  { key: 'oob',     title: 'Order of Battle', images: [{ src: '/ptg/order-of-battle.jpg', micro: DOC_MICRO.oob }], thumb: '/ptg/order-of-battle-thumb.jpg', thumbMicro: DOC_MICRO.oob },
  { key: 'army',    title: 'Army Roster', images: [{ src: '/ptg/army-roster-1.jpg', micro: DOC_MICRO.army1 }, { src: '/ptg/army-roster-2.jpg', micro: DOC_MICRO.army2 }], thumb: '/ptg/army-roster-1-thumb.jpg', thumbMicro: DOC_MICRO.army1 },
];

// Blur-up progressive image: shows the tiny inline `micro` placeholder
// immediately, fades in the real `src` once it finishes loading.
function ProgressiveImg({ src, micro, alt, className }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`ptg-progressive-img${className ? ' ' + className : ''}`}>
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

function DocThumb({ doc, active, onClick }) {
  return (
    <button
      className={`ptg-doc-thumb${active ? ' ptg-doc-thumb-active' : ''}`}
      onClick={() => onClick(doc.key)}
      title={`Click to edit your ${doc.title}`}
    >
      <div className="ptg-doc-thumb-header">{doc.title}</div>
      <div className="ptg-doc-thumb-img-wrap">
        <ProgressiveImg src={doc.thumb} micro={doc.thumbMicro} alt={doc.title} className="ptg-doc-thumb-img" />
      </div>
    </button>
  );
}

function PresentToggle({ mode, onChange }) {
  return (
    <div className="ptg-present-toggle">
      <button className={mode === 'image' ? 'ptg-present-active' : ''} onClick={() => onChange('image')}>Officiant</button>
      <button className={mode === 'replica' ? 'ptg-present-active' : ''} onClick={() => onChange('replica')}>Non Corporeal</button>
    </div>
  );
}

// Closes a dropdown on outside click; shared by the Realm/Faction/Formation pulldowns below.
function useCloseOnOutsideClick(ref, open, onClose) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, ref, onClose]);
}

// Realm of Origin — the 8 Mortal Realms plus a free-text "Custom" option.
// Hovering an option shows its summary/flavor text in a footer panel.
function RealmDropdown({ value, customValue, onChange, onCustomChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);
  useCloseOnOutsideClick(ref, open, () => { setOpen(false); setHovered(null); });

  const selectedRealm = REALMS.find(r => r.key === value);
  const label = value === 'custom' ? (customValue.trim() || 'Custom…') : (selectedRealm ? selectedRealm.name : 'Select a realm…');
  const shown = REALMS.find(r => r.key === (hovered || value));

  return (
    <div className="faction-dropdown" ref={ref}>
      <button type="button" className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu ptg-realm-menu">
          {REALMS.map(r => (
            <div
              key={r.key}
              className={`faction-dropdown-item${value === r.key ? ' selected' : ''}`}
              onMouseEnter={() => setHovered(r.key)}
              onMouseLeave={() => setHovered(null)}
              onMouseDown={() => { onChange(r.key); setOpen(false); setHovered(null); }}
            >
              {r.name}
            </div>
          ))}
          <div
            className={`faction-dropdown-item${value === 'custom' ? ' selected' : ''}`}
            onMouseEnter={() => setHovered(null)}
            onMouseDown={() => { onChange('custom'); setOpen(false); setHovered(null); }}
          >
            Custom…
          </div>
          {shown && (
            <div className="ptg-realm-tooltip">
              <div className="ptg-realm-tooltip-title">{shown.name}, <em>{shown.epithet}</em></div>
              <div className="ptg-realm-tooltip-desc">{shown.desc}</div>
              <div className="ptg-realm-tooltip-stone">Realmstone: <strong>{shown.realmstone}</strong></div>
            </div>
          )}
        </div>
      )}
      {value === 'custom' && (
        <input
          className="ptg-campaign-name-input"
          type="text"
          placeholder="Name your realm…"
          value={customValue}
          onChange={e => onCustomChange(e.target.value)}
        />
      )}
    </div>
  );
}

// Faction picker for the Path to Glory Roster — a two-column pulldown so all
// ~24 factions are visible at once, no scrolling required.
function FactionPulldown({ factions, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useCloseOnOutsideClick(ref, open, () => setOpen(false));
  const selected = factions.find(f => f.faction_slug === value);
  return (
    <div className="faction-dropdown" ref={ref}>
      <button type="button" className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)}>
        <span>{selected ? selected.faction : 'Select a faction…'}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu faction-dropdown-menu-2col">
          {factions.map(f => (
            <div
              key={f.faction_slug}
              className={`faction-dropdown-item${value === f.faction_slug ? ' selected' : ''}`}
              onMouseDown={() => { onChange(f.faction_slug); setOpen(false); }}
            >
              {f.faction}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Battle Formation picker — populated from that faction's actual battle
// formations once a faction is known; hovering an option shows its ability.
function FormationDropdown({ formations, value, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);
  useCloseOnOutsideClick(ref, open, () => { setOpen(false); setHovered(null); });
  const selected = formations.find(f => f.formation_name === value);
  const shown = formations.find(f => f.formation_name === (hovered || value));
  return (
    <div className="faction-dropdown" ref={ref}>
      <button type="button" className="faction-dropdown-trigger" onClick={() => setOpen(o => !o)} disabled={loading}>
        <span>{loading ? 'Loading…' : (selected ? selected.formation_name : (formations.length ? 'Select a formation…' : 'No formations found'))}</span>
        <span className="faction-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="faction-dropdown-menu">
          {formations.map(f => (
            <div
              key={f.id}
              className={`faction-dropdown-item${value === f.formation_name ? ' selected' : ''}`}
              onMouseEnter={() => setHovered(f.formation_name)}
              onMouseLeave={() => setHovered(null)}
              onMouseDown={() => { onChange(f.formation_name); setOpen(false); setHovered(null); }}
            >
              {f.formation_name}
            </div>
          ))}
        </div>
      )}
      {open && shown && (
        <div className="ptg-formation-popup">
          <div className="ptg-formation-popup-label">{shown.formation_name}</div>
          <AbilityCard ab={{ ...shown, bullets: parseFormationBullets(shown.bullets) }} keywords={[]} />
        </div>
      )}
    </div>
  );
}

// Generic "list of editable rows" state helper — used for weapon tables,
// Order of Battle units, and Army Roster unit rows.
function useRowList(initial = []) {
  const [rows, setRows] = useState(initial);
  const add = (extra = {}) => setRows(r => [...r, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...extra }]);
  const update = (id, field, value) => setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  const remove = id => setRows(r => r.filter(x => x.id !== id));
  return [rows, add, update, remove, setRows];
}

const STORAGE_KEY = 'aos-ptg-recruit-wizard';

export default function PathToGloryWizard({ onClose, factions = [] }) {
  // Read once per mount — resumes wherever the user left off last time they
  // opened this wizard (localStorage persists it across close/reopen).
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } })();
  const [isEditingExisting] = useState(() => Object.keys(saved).length > 0);

  const [step, setStep] = useState(() => saved.step ?? 0);
  const [activeDoc, setActiveDoc] = useState(() => saved.activeDoc ?? null); // null | 'warlord' | 'roster' | 'oob' | 'army'
  const [presentMode, setPresentMode] = useState(() => saved.presentMode ?? 'replica'); // 'image' | 'replica'
  const modalRef = useRef(null);

  // ── Step 0: Campaign ──
  const [campaign, setCampaign] = useState(() => saved.campaign ?? null);
  const [customCampaignName, setCustomCampaignName] = useState(() => saved.customCampaignName ?? '');

  // ── Step 1: Faction ──
  const [selectedFaction, setSelectedFaction] = useState(() => saved.selectedFaction ?? null);

  // ── Step 2: Pick your Warlord (faction-specific sub-steps, when known) ──
  const [warlordSubStep, setWarlordSubStep] = useState(() => saved.warlordSubStep ?? 0);

  // ── Warlord Warscroll ──
  const [warlordName, setWarlordName] = useState(() => saved.warlordName ?? '');
  const [warlordKeywords, setWarlordKeywords] = useState(() => saved.warlordKeywords ?? '');
  const [rangedWeapons, addRanged, updateRanged, removeRanged] = useRowList(saved.rangedWeapons ?? []);
  const [meleeWeapons, addMelee, updateMelee, removeMelee] = useRowList(saved.meleeWeapons ?? []);

  // ── Path to Glory Roster ──
  const [armyName, setArmyName] = useState(() => saved.armyName ?? '');
  const [heraldryImage, setHeraldryImage] = useState(() => saved.heraldryImage ?? null);
  const [realmOfOrigin, setRealmOfOrigin] = useState(() => saved.realmOfOrigin ?? '');
  const [customRealmName, setCustomRealmName] = useState(() => saved.customRealmName ?? '');
  const [faction, setFaction] = useState(() => saved.faction ?? '');
  const [battleFormation, setBattleFormation] = useState(() => saved.battleFormation ?? '');
  const [gloryPoints, setGloryPoints] = useState(() => saved.gloryPoints ?? '0');
  const [gloryRounds, addGloryRound, updateGloryRoundRow, removeGloryRound] = useRowList(saved.gloryRounds ?? []);
  const [currentQuest, setCurrentQuest] = useState(() => saved.currentQuest ?? '');
  const [questPoints, setQuestPoints] = useState(() => saved.questPoints ?? '');
  const [questNotes, setQuestNotes] = useState(() => saved.questNotes ?? '');
  const [questsCompleted, setQuestsCompleted] = useState(() => saved.questsCompleted ?? '');
  const [background, setBackground] = useState(() => saved.background ?? '');
  const [notableEvents, setNotableEvents] = useState(() => saved.notableEvents ?? '');
  const [spellLore, setSpellLore] = useState(() => saved.spellLore ?? Array(6).fill(''));
  const [prayerLore, setPrayerLore] = useState(() => saved.prayerLore ?? Array(6).fill(''));
  const [manifestationLore, setManifestationLore] = useState(() => saved.manifestationLore ?? Array(6).fill(''));
  const setLoreRow = (setter) => (i, value) => setter(rows => rows.map((r, ri) => ri === i ? value : r));

  // Effective faction slug driving the Roster's Faction dropdown default and
  // the Battle Formation lookup: explicit Roster pick wins, else fall back
  // to whatever was chosen back in Step 2.
  const effectiveFactionSlug = faction || selectedFaction || '';

  // Adding/editing a round's glory points ADDS the delta to the running
  // total (not overwrite), so manual spending between rounds is preserved.
  const gloryRoundsSum = gloryRounds.reduce((sum, r) => sum + (parseInt(r.value, 10) || 0), 0);
  const prevGloryRoundsSumRef = useRef(gloryRoundsSum);
  useEffect(() => {
    const delta = gloryRoundsSum - prevGloryRoundsSumRef.current;
    if (delta !== 0) setGloryPoints(gp => String((parseInt(gp, 10) || 0) + delta));
    prevGloryRoundsSumRef.current = gloryRoundsSum;
  }, [gloryRoundsSum]);

  // Battle formations for the currently-known faction (Roster's "Battle
  // Formation" field becomes a dropdown of these once a faction is set).
  const [formations, setFormations] = useState([]);
  const [formationsLoading, setFormationsLoading] = useState(false);
  useEffect(() => {
    if (!effectiveFactionSlug) { setFormations([]); return; }
    setFormationsLoading(true);
    axios.get(`/api/faction-rules/${effectiveFactionSlug}`)
      .then(res => setFormations(res.data.formations ?? []))
      .catch(() => setFormations([]))
      .finally(() => setFormationsLoading(false));
  }, [effectiveFactionSlug]);

  const heraldryInputRef = useRef(null);
  const handleHeraldryFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 300;
        let { width, height } = img;
        if (width > height) { if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; } }
        else { if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        setHeraldryImage(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ── Order of Battle ──
  const [warlordWarscroll, setWarlordWarscroll] = useState(() => saved.warlordWarscroll ?? '');
  const [warlordRank, setWarlordRank] = useState(() => saved.warlordRank ?? 'Aspiring');
  const [warlordRenown, setWarlordRenown] = useState(() => saved.warlordRenown ?? '5');
  const [warlordEnhancements, setWarlordEnhancements] = useState(() => saved.warlordEnhancements ?? '');
  const [warlordPath, setWarlordPath] = useState(() => saved.warlordPath ?? null);
  const [warlordPathAbility, setWarlordPathAbility] = useState(() => saved.warlordPathAbility ?? '');
  const [oobUnits, addOobUnit, updateOobUnit, removeOobUnit] = useRowList(saved.oobUnits ?? []);
  const oobTotalPoints = oobUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);

  // ── Army Roster ──
  const [commander, setCommander] = useState(() => saved.commander ?? '');
  const [armyRosterName, setArmyRosterName] = useState(() => saved.armyRosterName ?? '');
  const [pointsLimit, setPointsLimit] = useState(() => saved.pointsLimit ?? '');
  const [armyRosterFaction, setArmyRosterFaction] = useState(() => saved.armyRosterFaction ?? '');
  const [armyRosterFormation, setArmyRosterFormation] = useState(() => saved.armyRosterFormation ?? '');
  const [regiments, setRegiments] = useState(() => saved.regiments ?? [{ id: 'r1', units: [] }]);
  const [auxUnits, addAuxUnit, updateAuxUnit, removeAuxUnit] = useRowList(saved.auxUnits ?? []);
  const [armyNotes, setArmyNotes] = useState(() => saved.armyNotes ?? '');

  const addRegiment = () => setRegiments(rs => [...rs, { id: `${Date.now()}-${rs.length}`, units: [] }]);
  const removeRegiment = rid => setRegiments(rs => rs.filter(r => r.id !== rid));
  const addRegimentUnit = rid => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: [...r.units, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', size: '', notes: '', points: '' }] }
    : r));
  const updateRegimentUnit = (rid, uid, field, value) => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: r.units.map(u => u.id === uid ? { ...u, [field]: value } : u) }
    : r));
  const removeRegimentUnit = (rid, uid) => setRegiments(rs => rs.map(r => r.id === rid
    ? { ...r, units: r.units.filter(u => u.id !== uid) }
    : r));
  const regimentsTotal = regiments.reduce((sum, r) => sum + r.units.reduce((s, u) => s + (parseInt(u.points, 10) || 0), 0), 0);
  const auxTotal = auxUnits.reduce((sum, u) => sum + (parseInt(u.points, 10) || 0), 0);
  const armyUnitsTotal = regimentsTotal + auxTotal;

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (activeDoc) return; // arrow keys only navigate wizard steps, not while editing a document
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setStep(s => Math.max(0, s - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setStep(s => Math.min(STEPS.length - 1, s + 1)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, activeDoc]);

  useEffect(() => {
    const h = e => {
      if (modalRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Persist the whole wizard on every change, so closing and reopening resumes here.
  useEffect(() => {
    const snapshot = {
      step, activeDoc, presentMode, campaign, customCampaignName, selectedFaction, warlordSubStep,
      warlordName, warlordKeywords, rangedWeapons, meleeWeapons,
      armyName, heraldryImage, realmOfOrigin, customRealmName, faction, battleFormation, gloryPoints, gloryRounds,
      currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
      spellLore, prayerLore, manifestationLore,
      warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, oobUnits,
      commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  }, [
    step, activeDoc, presentMode, campaign, customCampaignName, selectedFaction, warlordSubStep,
    warlordName, warlordKeywords, rangedWeapons, meleeWeapons,
    armyName, heraldryImage, realmOfOrigin, customRealmName, faction, battleFormation, gloryPoints, gloryRounds,
    currentQuest, questPoints, questNotes, questsCompleted, background, notableEvents,
    spellLore, prayerLore, manifestationLore,
    warlordWarscroll, warlordRank, warlordRenown, warlordEnhancements, warlordPath, warlordPathAbility, oobUnits,
    commander, armyRosterName, pointsLimit, armyRosterFaction, armyRosterFormation, regiments, auxUnits, armyNotes,
  ]);

  const renderWeaponTable = (title, rows, add, update, remove, hasRange) => (
    <div className="ptg-warscroll-table-block">
      <div className="ptg-warscroll-table-title">{title}</div>
      {rows.length > 0 && (
        <div className={`ptg-warscroll-table${hasRange ? ' ptg-warscroll-table-ranged' : ''}`}>
          <div className="ptg-warscroll-table-head">
            <span>Weapon</span>
            {hasRange && <span>Rng</span>}
            <span>Atk</span><span>Hit</span><span>Wnd</span><span>Rnd</span><span>Dmg</span><span />
          </div>
          {rows.map(r => (
            <div className="ptg-warscroll-table-row" key={r.id}>
              <input value={r.name || ''} onChange={e => update(r.id, 'name', e.target.value)} placeholder="Weapon" />
              {hasRange && <input value={r.rng || ''} onChange={e => update(r.id, 'rng', e.target.value)} />}
              <input value={r.atk || ''} onChange={e => update(r.id, 'atk', e.target.value)} />
              <input value={r.hit || ''} onChange={e => update(r.id, 'hit', e.target.value)} />
              <input value={r.wnd || ''} onChange={e => update(r.id, 'wnd', e.target.value)} />
              <input value={r.rnd || ''} onChange={e => update(r.id, 'rnd', e.target.value)} />
              <input value={r.dmg || ''} onChange={e => update(r.id, 'dmg', e.target.value)} />
              <button className="ptg-oob-row-remove" onClick={() => remove(r.id)} title="Remove weapon">✕</button>
              <input
                className="ptg-warscroll-table-abilities"
                value={r.abilities || ''}
                onChange={e => update(r.id, 'abilities', e.target.value)}
                placeholder="Weapon Abilities"
              />
            </div>
          ))}
        </div>
      )}
      <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => add()}>+ Add Weapon</button>
    </div>
  );

  // Shared between the Warlord Warscroll doc editor and the "Pick your
  // Warlord" wizard step, so filling it out in either place stays in sync.
  const renderWarlordForm = () => (
    <>
      <div className="ptg-field">
        <label>Warlord Name</label>
        <input type="text" value={warlordName} onChange={e => setWarlordName(e.target.value)} placeholder="e.g. Iladrien the Bright" />
      </div>
      {renderWeaponTable('Ranged Weapons', rangedWeapons, addRanged, updateRanged, removeRanged, true)}
      {renderWeaponTable('Melee Weapons', meleeWeapons, addMelee, updateMelee, removeMelee, false)}
      <div className="ptg-field">
        <label>Keywords</label>
        <input type="text" value={warlordKeywords} onChange={e => setWarlordKeywords(e.target.value)} placeholder="HERO, INFANTRY, …" />
      </div>
    </>
  );

  const renderImageView = doc => (
    <div className="ptg-doc-image-view">
      {doc.images.map(img => (
        <ProgressiveImg key={img.src} src={img.src} micro={img.micro} alt={doc.title} className="ptg-doc-full-img" />
      ))}
    </div>
  );

  const campaignLabel = campaign === 'custom'
    ? (customCampaignName.trim() || 'Foreign War of Aggression')
    : CAMPAIGNS.find(c => c.key === campaign)?.name;

  const ALLIANCE_ORDER = ['Order', 'Chaos', 'Death', 'Destruction'];
  const factionsByAlliance = ALLIANCE_ORDER
    .map(alliance => ({ alliance, list: factions.filter(f => f.grand_alliance === alliance) }))
    .filter(g => g.list.length > 0);

  const warlordSteps = WARLORD_STEPS_BY_FACTION[effectiveFactionSlug];

  return (
    <>
      <div className="gw-overlay" />
      <div className="ptg-wizard" ref={modalRef} role="dialog" aria-modal="true" aria-label={isEditingExisting ? 'Present the Troops!' : 'Recruit Your Forces'}>
        <button className="gw-close" onClick={onClose} title="Close (Esc)">✕</button>

        <div className="ptg-wizard-banner">
          Path to Glory!{campaignLabel && <span className="ptg-wizard-banner-campaign"> — {campaignLabel}</span>}
        </div>

        <div className="ptg-wizard-header">
          <div className="ptg-wizard-title">{isEditingExisting ? 'Present the Troops!' : 'Recruit Your Forces'}</div>
        </div>

        <div className="ptg-doc-tray">
          {DOCS.map(doc => (
            <DocThumb key={doc.key} doc={doc} active={activeDoc === doc.key} onClick={setActiveDoc} />
          ))}
        </div>

        {activeDoc ? (() => {
          const doc = DOCS.find(d => d.key === activeDoc);
          return (
            <>
              <div className="ptg-doc-editor-header">
                <button className="ptg-wizard-nav-btn" onClick={() => setActiveDoc(null)}>‹ Back to War Room</button>
                <div className="ptg-doc-editor-title">{doc.title}</div>
                <PresentToggle mode={presentMode} onChange={setPresentMode} />
              </div>

              <div className="ptg-doc-editor-body">
                {presentMode === 'image' ? renderImageView(doc) : (
                  <>
                    {activeDoc === 'warlord' && renderWarlordForm()}

                    {activeDoc === 'roster' && (
                      <>
                        <div className="ptg-roster-header-grid">
                          <div className="ptg-field ptg-roster-heraldry">
                            <label>Heraldry</label>
                            <div
                              className="ptg-heraldry-box"
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => { e.preventDefault(); handleHeraldryFile(e.dataTransfer.files[0]); }}
                              onClick={() => heraldryInputRef.current?.click()}
                              style={heraldryImage ? { backgroundImage: `url(${heraldryImage})` } : undefined}
                              title="Click or drag an image here"
                            >
                              {!heraldryImage && <span className="ptg-heraldry-hint">Drop image<br />or click</span>}
                              <input
                                ref={heraldryInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => handleHeraldryFile(e.target.files[0])}
                              />
                            </div>
                          </div>
                          <div className="ptg-field ptg-roster-armyname"><label>Army Name</label><input type="text" value={armyName} onChange={e => setArmyName(e.target.value)} placeholder="e.g. The Sundered Vanguard" /></div>
                          <div className="ptg-field ptg-roster-realm">
                            <label>Realm of Origin</label>
                            <RealmDropdown value={realmOfOrigin} customValue={customRealmName} onChange={setRealmOfOrigin} onCustomChange={setCustomRealmName} />
                          </div>
                          <div className="ptg-field ptg-roster-glory"><label>Glory Points</label><input type="text" value={gloryPoints} onChange={e => setGloryPoints(e.target.value)} /></div>
                          <div className="ptg-field ptg-roster-rounds">
                            <label>Glory Points / Round</label>
                            <div className="ptg-glory-rounds">
                              {gloryRounds.map((r, i) => (
                                <div className="ptg-glory-round-row" key={r.id}>
                                  <span className="ptg-glory-round-num">R{i + 1}</span>
                                  <input value={r.value || ''} onChange={e => updateGloryRoundRow(r.id, 'value', e.target.value)} />
                                  <button className="ptg-oob-row-remove" onClick={() => removeGloryRound(r.id)} title="Remove round">✕</button>
                                </div>
                              ))}
                              <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addGloryRound({ value: '' })}>+ Round</button>
                              <div className="ptg-glory-rounds-total">Total Earned: {gloryRoundsSum}</div>
                            </div>
                          </div>
                          <div className="ptg-field ptg-roster-faction">
                            <label>Faction</label>
                            <FactionPulldown factions={factions} value={effectiveFactionSlug} onChange={setFaction} />
                          </div>
                          <div className="ptg-field ptg-roster-formation">
                            <label>Battle Formation</label>
                            {effectiveFactionSlug ? (
                              <FormationDropdown formations={formations} value={battleFormation} onChange={setBattleFormation} loading={formationsLoading} />
                            ) : (
                              <input type="text" value={battleFormation} onChange={e => setBattleFormation(e.target.value)} placeholder="Pick a faction first…" />
                            )}
                          </div>
                        </div>

                        <div className="ptg-roster-lower-grid">
                          <div className="ptg-quest-log-block">
                            <div className="ptg-quest-log-title">Quest Log</div>
                            <div className="ptg-quest-log-grid">
                              <div className="ptg-field"><label>Current Quest</label><input type="text" value={currentQuest} onChange={e => setCurrentQuest(e.target.value)} /></div>
                              <div className="ptg-field"><label>Quest Points</label><input type="text" value={questPoints} onChange={e => setQuestPoints(e.target.value)} /></div>
                              <div className="ptg-field"><label>Notes</label><input type="text" value={questNotes} onChange={e => setQuestNotes(e.target.value)} /></div>
                              <div className="ptg-field"><label>Quests Completed</label><input type="text" value={questsCompleted} onChange={e => setQuestsCompleted(e.target.value)} /></div>
                            </div>
                          </div>
                          <div className="ptg-roster-side-stack">
                            <div className="ptg-field"><label>Background</label><textarea rows={4} value={background} onChange={e => setBackground(e.target.value)} /></div>
                            <div className="ptg-field"><label>Notable Events</label><textarea rows={4} value={notableEvents} onChange={e => setNotableEvents(e.target.value)} /></div>
                          </div>
                        </div>

                        <div className="ptg-arcane-tome-title">Arcane Tome</div>
                        <div className="ptg-arcane-tome-grid">
                          {[{ label: 'Spell Lore', rows: spellLore, setter: setSpellLore },
                            { label: 'Prayer Lore', rows: prayerLore, setter: setPrayerLore },
                            { label: 'Manifestation Lore', rows: manifestationLore, setter: setManifestationLore }].map(col => (
                            <div className="ptg-arcane-tome-col" key={col.label}>
                              <div className="ptg-arcane-tome-col-header">{col.label}</div>
                              {col.rows.map((v, i) => (
                                <input key={i} value={v} placeholder={`${i + 1}.`} onChange={e => setLoreRow(col.setter)(i, e.target.value)} />
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {activeDoc === 'oob' && (
                      <>
                        <div className="ptg-oob-cap">
                          Starting units + Warlord must total <strong>1000 points</strong> or fewer.{' '}
                          <span className={oobTotalPoints > 1000 ? 'ptg-oob-over' : ''}>Current total: {oobTotalPoints}pts</span>
                        </div>

                        <div className="ptg-oob-warlord-block">
                          <div className="ptg-oob-warlord-title">Warlord</div>
                          <div className="ptg-oob-row-grid-4">
                            <div className="ptg-field"><label>Name</label><input value={warlordName} onChange={e => setWarlordName(e.target.value)} /></div>
                            <div className="ptg-field"><label>Warscroll</label><input value={warlordWarscroll} onChange={e => setWarlordWarscroll(e.target.value)} /></div>
                            <div className="ptg-field"><label>Rank</label><input value={warlordRank} onChange={e => setWarlordRank(e.target.value)} /></div>
                            <div className="ptg-field"><label>Renown</label><input value={warlordRenown} onChange={e => setWarlordRenown(e.target.value)} /></div>
                          </div>
                          <div className="ptg-oob-row-grid-3">
                            <div className="ptg-field"><label>Enhancements</label><input value={warlordEnhancements} onChange={e => setWarlordEnhancements(e.target.value)} /></div>
                            <div className="ptg-field">
                              <label>Path</label>
                              <select value={warlordPath || ''} onChange={e => setWarlordPath(e.target.value || null)}>
                                <option value="">…</option>
                                {PATHS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                              </select>
                            </div>
                            <div className="ptg-field"><label>Path Abilities</label><input value={warlordPathAbility} onChange={e => setWarlordPathAbility(e.target.value)} /></div>
                          </div>
                        </div>

                        <div className="ptg-oob-units-title">Units</div>
                        {oobUnits.length === 0 && <div className="ptg-oob-empty">No units added yet.</div>}
                        {oobUnits.map(u => (
                          <div className="ptg-oob-unit-block" key={u.id}>
                            <div className="ptg-oob-row-grid-4">
                              <div className="ptg-field"><label>Unit Name</label><input value={u.name || ''} onChange={e => updateOobUnit(u.id, 'name', e.target.value)} /></div>
                              <div className="ptg-field"><label>Warscroll</label><input value={u.warscroll || ''} onChange={e => updateOobUnit(u.id, 'warscroll', e.target.value)} /></div>
                              <div className="ptg-field"><label>Rank</label><input value={u.rank || ''} onChange={e => updateOobUnit(u.id, 'rank', e.target.value)} /></div>
                              <div className="ptg-field">
                                <label>Renown</label>
                                <div className="ptg-oob-renown-row">
                                  <input value={u.renown || ''} onChange={e => updateOobUnit(u.id, 'renown', e.target.value)} />
                                  <button className="ptg-oob-row-remove" onClick={() => removeOobUnit(u.id)} title="Remove unit">✕</button>
                                </div>
                              </div>
                            </div>
                            <div className="ptg-oob-row-grid-3b">
                              <div className="ptg-field"><label>Enhancements</label><input value={u.enhancements || ''} onChange={e => updateOobUnit(u.id, 'enhancements', e.target.value)} /></div>
                              <div className="ptg-field"><label>Path Abilities</label><input value={u.pathAbility || ''} onChange={e => updateOobUnit(u.id, 'pathAbility', e.target.value)} /></div>
                              <div className="ptg-field"><label>Reinforced?</label><input value={u.reinforced || ''} onChange={e => updateOobUnit(u.id, 'reinforced', e.target.value)} /></div>
                            </div>
                            <div className="ptg-field ptg-oob-pts-field"><label>Pts</label><input value={u.points || ''} onChange={e => updateOobUnit(u.id, 'points', e.target.value)} style={{ maxWidth: '90px' }} /></div>
                          </div>
                        ))}
                        <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addOobUnit({ name: '', warscroll: '', rank: 'Aspiring', renown: '0', points: '', enhancements: '', pathAbility: '', reinforced: '' })}>+ Add Unit</button>
                      </>
                    )}

                    {activeDoc === 'army' && (
                      <>
                        <div className="ptg-army-header-grid">
                          <div className="ptg-field ptg-army-commander"><label>Commander</label><input type="text" value={commander} onChange={e => setCommander(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-name"><label>Army Name</label><input type="text" value={armyRosterName} onChange={e => setArmyRosterName(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-points-limit"><label>Points Limit</label><input type="text" value={pointsLimit} onChange={e => setPointsLimit(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-faction"><label>Faction</label><input type="text" value={armyRosterFaction} onChange={e => setArmyRosterFaction(e.target.value)} /></div>
                          <div className="ptg-field ptg-army-formation"><label>Battle Formation</label><input type="text" value={armyRosterFormation} onChange={e => setArmyRosterFormation(e.target.value)} /></div>
                        </div>

                        {regiments.map((r, ri) => (
                          <div className="ptg-regiment-block" key={r.id}>
                            <div className="ptg-regiment-header">
                              <span>{ri === 0 ? "General's Regiment 1" : `Regiment ${ri + 1}`}</span>
                              {regiments.length > 1 && <button className="ptg-oob-row-remove" onClick={() => removeRegiment(r.id)} title="Remove regiment">✕</button>}
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
                          {auxUnits.map(u => (
                            <div className="ptg-regiment-table-row" key={u.id}>
                              <input placeholder="Warscroll Name" value={u.name || ''} onChange={e => updateAuxUnit(u.id, 'name', e.target.value)} />
                              <input placeholder="Size" value={u.size || ''} onChange={e => updateAuxUnit(u.id, 'size', e.target.value)} />
                              <input placeholder="Notes" value={u.notes || ''} onChange={e => updateAuxUnit(u.id, 'notes', e.target.value)} />
                              <input placeholder="Pts" value={u.points || ''} onChange={e => updateAuxUnit(u.id, 'points', e.target.value)} />
                              <button className="ptg-oob-row-remove" onClick={() => removeAuxUnit(u.id)} title="Remove unit">✕</button>
                            </div>
                          ))}
                          <button className="ptg-wizard-nav-btn ptg-oob-add-btn" onClick={() => addAuxUnit({ name: '', size: '', notes: '', points: '' })}>+ Add Unit</button>
                        </div>
                        <div className="ptg-oob-cap">Auxiliary Units Total: {auxTotal}pts</div>
                        <div className="ptg-oob-cap"><strong>Units Total: {armyUnitsTotal}pts</strong></div>

                        <div className="ptg-field"><label>Notes</label><textarea rows={3} value={armyNotes} onChange={e => setArmyNotes(e.target.value)} /></div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          );
        })() : (
          <>
            <div className="ptg-wizard-steps">
              {STEPS.map((label, i) => (
                <button
                  key={i}
                  className={`ptg-wizard-step${i === step ? ' ptg-wizard-step-active' : ''}${i < step ? ' ptg-wizard-step-done' : ''}`}
                  onClick={() => setStep(i)}
                  title={label}
                >
                  <span className="ptg-wizard-step-num">{i + 1}</span>
                  <span className="ptg-wizard-step-label">{label}</span>
                </button>
              ))}
            </div>

            <div className="ptg-wizard-body">
              <div className="ptg-wizard-body-title">{step + 1}. {STEPS[step]}</div>
              {step === 0 ? (
                <>
                  <div className="ptg-campaign-grid">
                    {CAMPAIGNS.map(c => (
                      <button
                        key={c.key}
                        className={`ptg-campaign-card${campaign === c.key ? ' ptg-campaign-selected' : ''}`}
                        disabled={!c.available}
                        onClick={() => {
                          setCampaign(c.key);
                          if (CAMPAIGN_POINTS_LIMITS[c.key]) setPointsLimit(CAMPAIGN_POINTS_LIMITS[c.key]);
                          setStep(s => Math.min(STEPS.length - 1, s + 1));
                        }}
                      >
                        <div className="ptg-campaign-name">{c.name}</div>
                        <div className="ptg-campaign-desc">{c.desc}</div>
                        {!c.available && <div className="ptg-campaign-soon">Coming Soon</div>}
                      </button>
                    ))}
                  </div>
                  {campaign === 'custom' && (
                    <input
                      className="ptg-campaign-name-input"
                      type="text"
                      placeholder="Name your campaign…"
                      value={customCampaignName}
                      onChange={e => setCustomCampaignName(e.target.value)}
                    />
                  )}
                </>
              ) : step === 1 ? (
                <div className="ptg-faction-grid">
                  {factionsByAlliance.flatMap(g => g.list.map((f, i) => {
                    const pos = FACTION_GRID_POSITIONS[g.alliance]?.[i];
                    return (
                      <button
                        key={f.faction_slug}
                        className={`ptg-faction-badge alliance-${f.grand_alliance}${selectedFaction === f.faction_slug ? ' ptg-faction-badge-selected' : ''}`}
                        style={pos ? { gridRow: pos[0], gridColumn: pos[1] } : undefined}
                        onClick={() => { setSelectedFaction(f.faction_slug); setStep(s => Math.min(STEPS.length - 1, s + 1)); }}
                      >
                        {f.faction}
                      </button>
                    );
                  }))}
                </div>
              ) : step === 2 ? (
                <div className="ptg-step-warlord">
                  {warlordSteps ? (
                    <>
                      <div className="ptg-warlord-substeps">
                        {warlordSteps.map((label, i) => (
                          <button
                            key={i}
                            className={`ptg-warlord-substep${i === warlordSubStep ? ' ptg-warlord-substep-active' : ''}${i < warlordSubStep ? ' ptg-warlord-substep-done' : ''}`}
                            onClick={() => setWarlordSubStep(i)}
                          >
                            <span className="ptg-warlord-substep-num">{i + 1}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="ptg-step-warlord-title">{warlordSubStep + 1}. {warlordSteps[warlordSubStep]}</div>
                      {warlordSubStep === 1 ? renderWarlordForm() : (
                        <div className="ptg-wizard-body-placeholder">
                          Coming soon — needs the Anvil of Apotheosis text for this faction.
                        </div>
                      )}
                      <div className="ptg-wizard-nav">
                        <button className="ptg-wizard-nav-btn" onClick={() => setWarlordSubStep(s => Math.max(0, s - 1))} disabled={warlordSubStep === 0}>
                          ‹ Back
                        </button>
                        <button className="ptg-wizard-nav-btn" onClick={() => setWarlordSubStep(s => Math.min(warlordSteps.length - 1, s + 1))} disabled={warlordSubStep === warlordSteps.length - 1}>
                          Next ›
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="ptg-step-warlord-title">Warlord Warscroll</div>
                      {renderWarlordForm()}
                    </>
                  )}
                </div>
              ) : (
                <div className="ptg-wizard-body-placeholder">Coming soon.</div>
              )}
            </div>

            <div className="ptg-wizard-nav">
              <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
                ‹ Back
              </button>
              <button className="ptg-wizard-nav-btn" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>
                Next ›
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
