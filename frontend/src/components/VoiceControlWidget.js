import React, { useState, useRef, useEffect } from 'react';
import { useVoiceControl } from '../VoiceControlContext';

const DURATION_OPTIONS_MIN = [30, 60, 120, 180, 240];

function formatDuration(min) {
  return min % 60 === 0 ? `${min / 60} hr${min > 60 ? 's' : ''}` : `${min} min`;
}

// Rendered once per page, far right of the .page-header banner (see
// .page-title's margin-right:auto in styles.css, which pushes every sibling
// after it — including this — flush right without disturbing whatever
// page-specific content already lived there). Mic toggle + a settings gear
// for the listen-duration popover, with a countdown bar underneath that's
// only shown while actively listening.
export default function VoiceControlWidget() {
  const {
    supported, enabled, listening, permissionDenied,
    durationMinutes, setDurationMinutes,
    remainingMs, resetIdle, lastCommand, toggleEnabled,
  } = useVoiceControl();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wrapRef = useRef(null);

  // Same outside-click-to-close pattern as the navbar's Display Settings
  // gear (wrapRef must cover the trigger button too, not just the popover —
  // see feedback_modal_outside_click memory).
  useEffect(() => {
    if (!settingsOpen) return;
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSettingsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  if (!supported) {
    return (
      <div className="voice-control voice-control-unsupported" title="Voice commands need a Chromium-based browser (Chrome/Edge) — not supported here">
        🎙
      </div>
    );
  }

  const totalMs = durationMinutes * 60000;
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const micTitle = permissionDenied
    ? 'Microphone access denied'
    : enabled
      ? `Voice commands on${lastCommand ? ` — last heard: "${lastCommand}"` : ''} (click to turn off)`
      : 'Turn on voice commands';

  return (
    <div className="voice-control" ref={wrapRef}>
      <div className="voice-control-row">
        <button type="button" className="voice-control-gear" onClick={() => setSettingsOpen(o => !o)} title="Listen duration settings">⚙</button>
        <button
          type="button"
          className={`voice-control-mic${enabled ? ' active' : ''}${listening ? ' listening' : ''}`}
          onClick={toggleEnabled}
          title={micTitle}
        >🎙</button>
      </div>
      {enabled && (
        <div className="voice-control-bar" onClick={resetIdle} title="Click to reset the idle timer">
          <div className="voice-control-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {permissionDenied && <div className="voice-control-error">Mic access denied</div>}
      {settingsOpen && (
        <div className="voice-control-popover">
          <div className="voice-control-popover-title">Listen Duration</div>
          <select
            className="voice-control-popover-select"
            value={durationMinutes}
            onChange={e => setDurationMinutes(parseInt(e.target.value, 10))}
          >
            {DURATION_OPTIONS_MIN.map(m => (
              <option key={m} value={m}>{formatDuration(m)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
