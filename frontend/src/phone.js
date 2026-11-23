import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Phone-only layout helpers (≤600px wide — the same breakpoint styles.css
// uses for its "Phone" section). Desktop and iPad never see any of this.
export const PHONE_QUERY = '(max-width: 600px)';

export function useIsPhone() {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches;
  const [isPhone, setIsPhone] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setIsPhone(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);
  return isPhone;
}

// A page's filter block. On desktop it renders `children` exactly as before
// (the wrappers are display: contents). On a phone the block folds away:
// a sticky bar shows `top` (search box, faction picker…) plus a
// "Filters (n)" button and a chip per active filter (tap ✕ to clear); the
// button opens `children` as a sheet from the bottom with a Done button.
//   count  — how many filters are on (for the button label)
//   chips  — [{ key, label, onClear }]
export function MobileFilters({ top, count = 0, chips = [], children, className = '' }) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!isPhone) setOpen(false); }, [isPhone]);
  useEffect(() => {
    if (!open) return undefined;
    const k = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open]);

  if (!isPhone) return <>{children}</>;
  return (
    <>
      <div className={`mf-bar ${className}`}>
        <div className="mf-bar-row">
          {top}
          <button type="button" className={`mf-toggle${count ? ' mf-toggle-on' : ''}`} onClick={() => setOpen(true)}>
            Filters{count ? ` (${count})` : ''} ▾
          </button>
        </div>
        {chips.length > 0 && (
          <div className="mf-chips">
            {chips.map(c => (
              <button type="button" key={c.key || c.label} className="mf-chip" onClick={c.onClear} title="Clear this filter">
                {c.label} <span className="mf-chip-x">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {open && createPortal(
        <div className="mf-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mf-sheet" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="mf-sheet-head">
              <span>Filters</span>
              <button type="button" className="mf-done" onClick={() => setOpen(false)}>Done</button>
            </div>
            <div className="mf-sheet-body">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Chips + count for the filter set Warscrolls, Path to Glory and Simulacrum
// share (same state names on all three pages).
export function standardFilterChips(s) {
  const chips = [];
  const fname = slug => (s.factions || []).find(f => f.faction_slug === slug)?.faction || slug;
  const after = () => { if (s.onChange) s.onChange(); };
  if (s.showFriendly) chips.push({ key: 'fr', label: 'Friendly', onClear: () => { s.setShowFriendly(false); after(); } });
  if (s.showEnemy) chips.push({ key: 'en', label: 'Enemy', onClear: () => { s.setShowEnemy(false); after(); } });
  if (s.alliance) chips.push({ key: 'ga', label: s.alliance, onClear: () => { s.setAlliance(''); after(); } });
  if (s.faction) chips.push({ key: 'f', label: fname(s.faction), onClear: () => { s.setFaction(''); after(); } });
  if (s.enemyFaction) chips.push({ key: 'ef', label: `vs ${fname(s.enemyFaction)}`, onClear: () => { s.setEnemyFaction(''); after(); } });
  for (const [label, value, set] of s.types || []) {
    if (value === true) chips.push({ key: label, label, onClear: () => { set(false); after(); } });
    else if (value === 'exclude') chips.push({ key: label, label: `No ${label}`, onClear: () => { set(false); after(); } });
  }
  return chips;
}
