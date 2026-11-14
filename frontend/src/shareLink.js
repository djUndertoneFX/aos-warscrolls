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
export async function createAndCopyShareLink(payload, view = {}) {
  const urlPromise = axios.post('/api/share', payload).then(r => shareUrl(payload.kind, r.data.token, view));

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
