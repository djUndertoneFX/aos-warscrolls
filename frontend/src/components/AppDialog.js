import React, { useCallback, useEffect, useRef, useState } from 'react';

// In-app replacements for window.confirm / window.prompt / window.alert.
//
// The native dialogs are fine behaviourally, but the browser stamps them with
// the page's origin — "localhost:3000 says", or the Railway hostname in
// production — which looks like it belongs to someone else's site. These look
// like the rest of the app and read "AoS Warscrolls".
//
// Usage: const { confirm, prompt, alert, dialog } = useAppDialog();
// then `if (!(await confirm('Delete this?'))) return;` and render {dialog}.
// Same return shapes as the natives: confirm → boolean, prompt → string|null.
export const APP_DIALOG_TITLE = 'AoS Warscrolls';

function AppDialog({ request, onResolve }) {
  const { kind, message, defaultValue = '', confirmLabel, danger } = request;
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);
  const okRef = useRef(null);

  useEffect(() => { setValue(defaultValue); }, [defaultValue]);
  useEffect(() => {
    // Focus the field you're meant to act on: the text for a prompt (selected,
    // so typing replaces the suggested name), otherwise the confirm button.
    if (kind === 'prompt') { inputRef.current?.focus(); inputRef.current?.select(); }
    else okRef.current?.focus();
  }, [kind]);

  const cancel = () => onResolve(kind === 'prompt' ? null : false);
  const accept = () => {
    if (kind === 'prompt') onResolve(value);
    else onResolve(true);
  };

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
      // Enter accepts from anywhere but a textarea; the prompt input has its
      // own handler so this stays out of its way.
      if (e.key === 'Enter' && kind !== 'prompt') { e.stopPropagation(); accept(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  });

  return (
    <div className="app-dialog-backdrop" onMouseDown={kind === 'alert' ? cancel : undefined}>
      <div
        className="app-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={APP_DIALOG_TITLE}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="app-dialog-title">{APP_DIALOG_TITLE}</div>
        <div className="app-dialog-message">{message}</div>
        {kind === 'prompt' && (
          <input
            ref={inputRef}
            className="app-dialog-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); accept(); } }}
          />
        )}
        <div className="app-dialog-actions">
          {kind !== 'alert' && (
            <button type="button" className="app-dialog-btn" onClick={cancel}>Cancel</button>
          )}
          <button
            ref={okRef}
            type="button"
            className={`app-dialog-btn app-dialog-btn-confirm${danger ? ' app-dialog-btn-danger' : ''}`}
            onClick={accept}
          >{confirmLabel || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'Save' : 'OK')}</button>
        </div>
      </div>
    </div>
  );
}

export function useAppDialog() {
  // One request at a time — the natives are modal too, and queueing would let
  // a second dialog open behind the first with no way to see it.
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const ask = useCallback(req => new Promise(resolve => {
    resolverRef.current = resolve;
    setRequest(req);
  }), []);

  const onResolve = useCallback(result => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback((message, opts = {}) => ask({ kind: 'confirm', message, ...opts }), [ask]);
  const prompt  = useCallback((message, defaultValue = '', opts = {}) => ask({ kind: 'prompt', message, defaultValue, ...opts }), [ask]);
  const alert   = useCallback((message, opts = {}) => ask({ kind: 'alert', message, ...opts }), [ask]);

  const dialog = request ? <AppDialog request={request} onResolve={onResolve} /> : null;
  return { confirm, prompt, alert, dialog };
}

export default AppDialog;
