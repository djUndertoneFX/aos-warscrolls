import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// Admin-only (Settings → Password Reset Link): make a 24-hour reset link for
// any account and copy it, for when the reset email doesn't arrive. Also
// shows that account's last few reset attempts and whether their email went
// out.
export default function ResetLinkModal({ onClose }) {
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const make = async () => {
    if (!login.trim()) return;
    setBusy(true); setError(''); setResult(null); setCopied(false);
    try {
      const { data } = await axios.post('/api/admin/reset-link', { login: login.trim() });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Couldn’t make a link — try again.');
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.url); setCopied(true); } catch { setCopied(false); }
  };

  return createPortal(
    <div className="filebug-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="filebug-box" role="dialog" aria-modal="true" aria-label="Password reset link">
        <div className="filebug-title">🔑 Password Reset Link</div>
        <p className="filebug-note">Username or email of the account. The link works once, for 24 hours; send it to them yourself.</p>
        <input
          ref={inputRef}
          className="filebug-text resetlink-input"
          value={login}
          onChange={e => setLogin(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') make(); }}
          placeholder="e.g. VengefulJan"
          autoCapitalize="none"
          autoCorrect="off"
        />
        {error && <p className="filebug-error">{error}</p>}
        {result && (
          <div className="resetlink-result">
            <div><b>{result.username}</b> · {result.email}</div>
            <input className="filebug-text resetlink-url" readOnly value={result.url} onFocus={e => e.target.select()} />
            {result.attempts?.length > 0 && (
              <div className="resetlink-attempts">
                <div>Recent reset requests:</div>
                {result.attempts.map((a, i) => (
                  <div key={i}>{a.created_at} UTC — “{a.login}” — {a.result}</div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="filebug-actions">
          <button type="button" className="filebug-cancel" onClick={onClose}>Close</button>
          {result ? (
            <button type="button" className="filebug-send" onClick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>
          ) : (
            <button type="button" className="filebug-send" disabled={!login.trim() || busy} onClick={make}>{busy ? 'Making…' : 'Make link'}</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
