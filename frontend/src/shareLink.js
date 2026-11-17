import React, { useEffect, useState } from 'react';
import axios from 'axios';

// ── Share links ──────────────────────────────────────────────────────────────
// "Share" on Army Builder / Path to Glory: POST the current list to
// /api/share, get a token back, and copy https://<site>/<page>?share=TOKEN to
// the clipboard. Opening that link (logging in first if needed — ProtectedRoute
// remembers where you were going) copies the list into the recipient's account
// as an enemy list.

const SHARE_PATHS = { army: '/army-builder', ptg: '/path-to-glory' };

// `view` (optional) = extra query params describing what the sender was
// looking at, e.g. { view: 'roster', mode: 'image' }, so the link opens the
// recipient on the same screen. Only short known keys are passed.
const VIEW_KEYS = ['view', 'mode', 'doc'];
export function shareUrl(kind, token, view = {}) {
  const q = new URLSearchParams({ share: token });
  for (const k of VIEW_KEYS) if (view[k]) q.set(k, String(view[k]));
  return `${window.location.origin}${SHARE_PATHS[kind]}?${q.toString()}`;
}

// A preview link is a different address entirely, not a flag on the normal
// one: it opens the read-only preview, needs no account, and never imports
// anything into whoever opens it.
export function previewUrl(token) {
  return `${window.location.origin}/preview/${token}`;
}

// ── Share mode ──
// Which of the two links the Share button makes. Sticky per browser: pick
// one from the dropdown and the button keeps doing that until it's changed.
// 'full' is the default and is the original behaviour.
const SHARE_MODE_KEY = 'aos-share-mode';
export const SHARE_MODES = [
  { key: 'full', label: 'Share full details',
    hint: 'Copies the list into their account as an enemy list. They need an account.' },
  { key: 'preview', label: 'Share preview',
    hint: 'A read-only look at the sheets. No account needed — anyone with the link can open it.' },
];
export function readShareMode() {
  try { return localStorage.getItem(SHARE_MODE_KEY) === 'preview' ? 'preview' : 'full'; } catch { return 'full'; }
}
export function writeShareMode(mode) {
  try { localStorage.setItem(SHARE_MODE_KEY, mode === 'preview' ? 'preview' : 'full'); } catch {}
}
export function useShareMode() {
  const [mode, setModeState] = useState(readShareMode);
  const setMode = m => { setModeState(m); writeShareMode(m); };
  return [mode, setMode];
}

export function getShareView() {
  try {
    const q = new URLSearchParams(window.location.search);
    const v = {};
    for (const k of VIEW_KEYS) if (q.get(k)) v[k] = q.get(k);
    return v;
  } catch { return {}; }
}

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// Creates the share and copies its URL. Safari only allows a clipboard write
// within the click itself, so where ClipboardItem exists the write starts
// immediately with a promise of the text (the network call resolves it).
// Returns { url, copied }.
export async function createAndCopyShareLink(payload, view = {}, mode = 'full') {
  const urlPromise = axios.post('/api/share', payload)
    .then(r => (mode === 'preview' ? previewUrl(r.data.token) : shareUrl(payload.kind, r.data.token, view)));

  if (typeof window.ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new window.ClipboardItem({
        'text/plain': urlPromise.then(u => new Blob([u], { type: 'text/plain' })),
      });
      await navigator.clipboard.write([item]);
      return { url: await urlPromise, copied: true };
    } catch { /* fall through to the other methods */ }
  }
  const url = await urlPromise; // throws if the share itself failed
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); return { url, copied: true }; } catch {}
  }
  return { url, copied: legacyCopy(url) };
}

// Strips ?share= from the address bar once it's been handled, so a reload
// doesn't re-run the import.
export function clearShareParam() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('share');
    for (const k of VIEW_KEYS) u.searchParams.delete(k);
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  } catch {}
}

export function getShareParam() {
  try { return new URLSearchParams(window.location.search).get('share'); } catch { return null; }
}

// Share split-button: the button itself fires whichever mode is currently
// selected, and the ▾ opens the picker. Picking a mode both fires it and
// makes it the new default, so "switch to preview" and "send a preview" are
// the same single action rather than two.
export function ShareButton({ onShare, className = 'share-btn', label = '🔗 Share', wrapperClassName = '' }) {
  const [mode, setMode] = useShareMode();
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const active = SHARE_MODES.find(m => m.key === mode) || SHARE_MODES[0];
  return (
    <span className={`share-split${wrapperClassName ? ` ${wrapperClassName}` : ''}`} ref={ref}>
      <button className={`${className} share-split-main`} onClick={() => onShare(mode)} title={`${active.label} — ${active.hint}`}>
        {label}{mode === 'preview' ? ' preview' : ''}
      </button>
      <button
        className={`${className} share-split-caret`}
        onClick={() => setOpen(o => !o)}
        aria-label="Choose what Share sends"
        title="Choose what Share sends"
      >▾</button>
      {open && (
        <div className="share-split-menu">
          {SHARE_MODES.map(m => (
            <button
              key={m.key}
              className={`share-split-option${m.key === mode ? ' share-split-option-active' : ''}`}
              onClick={() => { setMode(m.key); setOpen(false); onShare(m.key); }}
            >
              <span className="share-split-option-label">{m.label}</span>
              <span className="share-split-option-hint">{m.hint}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// Small bottom-centre message. `msg` = { text, url? } or null.
export function ShareToast({ msg, onClose }) {
  const [shown, setShown] = useState(msg);
  useEffect(() => {
    setShown(msg);
    if (!msg) return;
    const t = setTimeout(onClose, msg.url ? 15000 : 4000);
    return () => clearTimeout(t);
  }, [msg]); // eslint-disable-line
  if (!shown) return null;
  return (
    <div className="share-toast" role="status" onClick={e => { if (e.target.tagName !== 'INPUT') onClose(); }}>
      <div>{shown.text}</div>
      {shown.url && (
        <input className="share-toast-url" readOnly value={shown.url} onFocus={e => e.target.select()} autoFocus />
      )}
    </div>
  );
}

// ── Return-after-login ──
// A share link opened while logged out goes to /login first; ProtectedRoute
// remembers the original address here and login/register send you back to
// it. Cleared once that page actually loads.
const AFTER_LOGIN_KEY = 'aos-after-login';
export function rememberAfterLogin(path) {
  try { sessionStorage.setItem(AFTER_LOGIN_KEY, path); } catch {}
}
export function afterLoginPath() {
  try { return sessionStorage.getItem(AFTER_LOGIN_KEY) || '/warscrolls'; } catch { return '/warscrolls'; }
}
export function clearAfterLoginIf(path) {
  try { if (sessionStorage.getItem(AFTER_LOGIN_KEY) === path) sessionStorage.removeItem(AFTER_LOGIN_KEY); } catch {}
}
