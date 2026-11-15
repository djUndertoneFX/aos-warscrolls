import React, { useEffect, useRef, useState } from 'react';

// "Import List" — paste an army list exported from New Recruit (or any
// tool using the same plain-text shape) and have the page fill itself in.
//
// `onImport` receives the raw text and returns (or resolves to) a report:
// { filled: string[], skipped: string[] }. Rather than close on success,
// the dialog shows that report — an import that silently drops half a list
// is worse than one that tells you which three units it couldn't place.
export default function ImportListModal({ onClose, onImport, title = 'Import List' }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const doImport = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      setReport(await onImport(text));
    } catch (e) {
      setError(e?.message || 'Could not read that list.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ptg-import-backdrop" onMouseDown={onClose}>
      <div
        className="ptg-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="ptg-import-header">{title}</div>

        {report ? (
          <div className="ptg-import-report">
            {report.filled?.length > 0 && (
              <>
                <div className="ptg-import-report-title">Imported</div>
                <ul className="ptg-import-report-list">
                  {report.filled.map((f, i) => <li key={i} className="ptg-import-ok">{f}</li>)}
                </ul>
              </>
            )}
            {report.skipped?.length > 0 && (
              <>
                <div className="ptg-import-report-title">Couldn’t place</div>
                <ul className="ptg-import-report-list">
                  {report.skipped.map((f, i) => <li key={i} className="ptg-import-warn">{f}</li>)}
                </ul>
              </>
            )}
            {!report.filled?.length && !report.skipped?.length && (
              <div className="ptg-import-warn">Nothing recognisable in that text.</div>
            )}
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              className="ptg-import-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              spellCheck={false}
              placeholder={'Paste your army list here.\n\nExported from New Recruit — "Copy to clipboard" gives exactly the text this reads.'}
            />
            {error && <div className="ptg-import-error">{error}</div>}
          </>
        )}

        <div className="ptg-import-actions">
          {report ? (
            <button type="button" className="ptg-wizard-nav-btn" onClick={onClose}>Close</button>
          ) : (
            <>
              <button type="button" className="ptg-wizard-nav-btn" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="ptg-wizard-nav-btn ptg-import-confirm"
                disabled={!text.trim() || busy}
                onClick={doImport}
              >
                {busy ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
