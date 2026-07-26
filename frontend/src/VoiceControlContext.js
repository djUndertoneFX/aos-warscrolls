import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

// ── Voice Control ────────────────────────────────────────────────────────────
// Site-wide push-button voice commands via the Web Speech API. Chrome/Edge
// only (window.SpeechRecognition/webkitSpeechRecognition) — Firefox and most
// Safari builds don't implement it, so `supported` gates the whole feature.
//
// AoS games run 2-3 hours with individual phases lasting 5-30 minutes, so a
// short idle timeout (the usual UX default) would make this useless — the
// user explicitly wants a long, configurable "listen duration" instead, with
// the countdown resetting on any recognized command AND on a manual click
// (see VoiceControlWidget's countdown bar). Recognition instances stop
// themselves after a period of silence regardless of `continuous` — onend
// below restarts a fresh instance in a loop for as long as `enabled` is true
// and the deadline hasn't passed, which is what makes "listen for hours"
// actually work instead of dying after the first silence gap.
const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const DURATION_KEY = 'aos-voice-duration-min';
const DEFAULT_DURATION_MIN = 180; // matches a full game, not a short-idle default

function loadDuration() {
  try {
    const v = parseInt(localStorage.getItem(DURATION_KEY), 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_DURATION_MIN;
  } catch { return DEFAULT_DURATION_MIN; }
}

const VoiceControlContext = createContext(null);

export function VoiceControlProvider({ children }) {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [durationMinutes, setDurationMinutesState] = useState(loadDuration);
  const [remainingMs, setRemainingMs] = useState(0);
  const [lastCommand, setLastCommand] = useState(null);

  const enabledRef = useRef(false);
  const deadlineRef = useRef(0);
  const durationRef = useRef(durationMinutes);
  const recognitionRef = useRef(null);
  // Registered per-page phrase->handler map. Only one page is ever mounted
  // at a time (exclusive routes), so a single mutable map — replaced wholesale
  // by whichever page currently registers, cleared on that page's unmount —
  // is enough; no need to track multiple registrants.
  const commandsRef = useRef(new Map());

  useEffect(() => { durationRef.current = durationMinutes; }, [durationMinutes]);

  const resetIdle = useCallback(() => {
    const ms = durationRef.current * 60000;
    deadlineRef.current = Date.now() + ms;
    setRemainingMs(ms);
  }, []);

  const setDurationMinutes = useCallback((min) => {
    setDurationMinutesState(min);
    try { localStorage.setItem(DURATION_KEY, String(min)); } catch {}
    // Extending/shrinking the duration while already listening re-bases the
    // countdown from now, rather than leaving it counting toward the old value.
    if (enabledRef.current) resetIdle();
  }, [resetIdle]);

  const matchCommand = useCallback((transcript) => {
    const t = transcript.toLowerCase().trim();
    for (const [phrase, handler] of commandsRef.current) {
      if (t.includes(phrase)) {
        setLastCommand(phrase);
        resetIdle();
        handler();
        return true;
      }
    }
    return false;
  }, [resetIdle]);

  // Recognition engine lifecycle — starts when enabled, restarts itself
  // indefinitely on the browser's own auto-stop (onend) as long as `enabled`
  // is still true, stops for good when disabled.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!SpeechRecognitionCtor || !enabled) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    let stopped = false;

    const startOne = () => {
      if (stopped) return;
      const rec = new SpeechRecognitionCtor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onstart = () => setListening(true);
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          if (result.isFinal) matchCommand(result[0].transcript);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setPermissionDenied(true);
          setEnabled(false);
        }
        // Other errors (no-speech, aborted, network) are benign — onend
        // fires right after and the restart loop below picks it back up.
      };
      rec.onend = () => {
        setListening(false);
        if (stopped || !enabledRef.current) return;
        if (Date.now() >= deadlineRef.current) { setEnabled(false); return; }
        startOne();
      };
      recognitionRef.current = rec;
      try { rec.start(); } catch { /* rapid stop/start races — the next onend retries */ }
    };

    startOne();
    return () => {
      stopped = true;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [enabled, matchCommand]);

  // Idle countdown ticker, independent of the recognition engine so the bar
  // updates smoothly even across recognition restarts.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const remaining = deadlineRef.current - Date.now();
      if (remaining <= 0) { setEnabled(false); setRemainingMs(0); }
      else setRemainingMs(remaining);
    }, 500);
    return () => clearInterval(id);
  }, [enabled]);

  const toggleEnabled = useCallback(() => {
    setEnabled(on => {
      const next = !on;
      if (next) { setPermissionDenied(false); resetIdle(); }
      return next;
    });
  }, [resetIdle]);

  const registerCommands = useCallback((map) => {
    commandsRef.current = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
    return () => { commandsRef.current = new Map(); };
  }, []);

  return (
    <VoiceControlContext.Provider value={{
      supported: !!SpeechRecognitionCtor,
      enabled, listening, permissionDenied,
      durationMinutes, setDurationMinutes,
      remainingMs, resetIdle, lastCommand,
      toggleEnabled, registerCommands,
    }}>
      {children}
    </VoiceControlContext.Provider>
  );
}

export function useVoiceControl() {
  return useContext(VoiceControlContext);
}

// Pages call this with a { "phrase": handler } map to make it active while
// mounted — e.g. Battle Buddy's Fight step wiring "next phase" to advancePhase.
// Re-registers whenever the deps change so handlers never close over stale
// state, and always clears on unmount so a page's commands don't linger
// active after navigating away.
export function useVoiceCommands(commandsMap, deps) {
  const { registerCommands } = useVoiceControl();
  useEffect(() => {
    const unregister = registerCommands(commandsMap);
    return unregister;
  }, deps); // eslint-disable-line
}
