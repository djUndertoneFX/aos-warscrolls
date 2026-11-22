import React, { useEffect, useRef, useState } from 'react';
import { readListFile } from '../fileImport';

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
  const fileRef = useRef(null);
  // Upload / drop: a .txt, a .pdf (text or picture-only) or an image is
  // read into the box, where it can be checked before Import.
  const [reading, setReading] = useState('');
  const [fileNotes, setFileNotes] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = async file => {
    if (!file || reading) return;
    setError('');
    setFileNotes([]);
    setReading(`Opening ${file.name}…`);
    try {
      const { text: t, notes } = await readListFile(file, msg => setReading(msg));
      setText(t);
      setFileNotes(notes || []);
      if (!t.trim()) setError('Nothing recognisable was found in that file.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not read that file.');
    } finally {
      setReading('');
    }
  };
  const onDrop = e => {
    e.preventDefault();
    setDragOver(false);
    if (report) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  };

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
        onDragOver={e => { if (!report) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={onDrop}
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
            <div className="ptg-import-file-row">
              <button
                type="button"
                className="ptg-wizard-nav-btn ptg-import-upload"
                onClick={() => fileRef.current?.click()}
                disabled={!!reading || busy}
              >
                Upload file
              </button>
              <span className="ptg-import-file-hint">
                {reading || 'or drop a .txt, .pdf or picture here — New Recruit lists and warscroll-card printouts both work'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.text,.pdf,application/pdf,text/plain,image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) loadFile(f); }}
              />
            </div>
            {fileNotes.length > 0 && (
              <ul className="ptg-import-file-notes">
                {fileNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <div className={`ptg-import-drop${dragOver ? ' is-over' : ''}${reading ? ' is-reading' : ''}`}>
            <textarea
              ref={textareaRef}
              className="ptg-import-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              spellCheck={false}
              placeholder={'Paste your army list here, or upload / drop a file.\n\nExported from New Recruit — "Copy to clipboard" gives exactly the text this reads.'}
            />
            {(dragOver || reading) && (
              <div className="ptg-import-drop-overlay">{reading || 'Drop the file to read it'}</div>
            )}
            </div>
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
                disabled={!text.trim() || busy || !!reading}
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
