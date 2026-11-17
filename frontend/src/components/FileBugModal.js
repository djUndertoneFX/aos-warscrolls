import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// Recent errors on this page, attached to bug reports. Installed once when
// this module loads (it's imported by App.js, so from the start).
const recentErrors = [];
const pushErr = msg => { recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${String(msg).slice(0, 300)}`); if (recentErrors.length > 15) recentErrors.shift(); };
if (typeof window !== 'undefined' && !window.__aosBugErrHook) {
  window.__aosBugErrHook = true;
  window.addEventListener('error', e => pushErr(e.message || e.error));
  window.addEventListener('unhandledrejection', e => pushErr(e.reason?.message || e.reason));
  const origErr = console.error;
  console.error = (...args) => { pushErr(args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : '')).join(' ')); origErr(...args); };
}

const PAGE_NAMES = {
  '/warscrolls': 'Warscrolls', '/army-builder': 'Army Builder', '/battle-buddy': 'Battle Buddy',
  '/matched-play': 'Matched Play', '/spearhead': 'Spearhead', '/path-to-glory': 'Path to Glory',
  '/simulacrum': 'Simulacrum',
};

// "File Bug" (top of Settings): a description box; sends the page, URL,
// screen/browser, and recent errors along with it. The server stores it,
// adds it to the bugs Google Doc and emails dj (5 a day at most).
export default function FileBugModal({ onClose }) {
  const [text, setText] = useState('');
  const [state, setState] = useState('edit'); // edit | sending | sent | error
  const [msg, setMsg] = useState('');
  const taRef = useRef(null);
  useEffect(() => { taRef.current?.focus(); }, []);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const page = PAGE_NAMES[window.location.pathname] || window.location.pathname;
  const send = async () => {
    if (!text.trim()) return;
    setState('sending');
    try {
      const { data } = await axios.post('/api/bugs', {
        text,
        page,
        url: window.location.href,
        context: {
          screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`,
          browser: navigator.userAgent,
          'recent errors': recentErrors.slice(),
        },
      });
      setMsg(`Bug #${data.id} filed — thanks!`);
      setState('sent');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Couldn’t send it — try again in a moment.');
      setState('error');
    }
  };

  return createPortal(
    <div className="filebug-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="filebug-box" role="dialog" aria-modal="true" aria-label="File a bug">
        <div className="filebug-title">🐞 File a Bug</div>
        {state === 'sent' ? (
          <>
            <p className="filebug-note">{msg}</p>
            <div className="filebug-actions"><button type="button" className="filebug-send" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <>
            <p className="filebug-note">What went wrong, and what did you expect? The page ({page}), your screen size, browser and any recent errors are attached.</p>
            <textarea
              ref={taRef}
              className="filebug-text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
              placeholder="Describe the bug…"
              rows={7}
            />
            {state === 'error' && <p className="filebug-error">{msg}</p>}
            <div className="filebug-actions">
              <button type="button" className="filebug-cancel" onClick={onClose}>Cancel</button>
              <button type="button" className="filebug-send" disabled={!text.trim() || state === 'sending'} onClick={send}>
                {state === 'sending' ? 'Sending…' : 'Send bug'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
