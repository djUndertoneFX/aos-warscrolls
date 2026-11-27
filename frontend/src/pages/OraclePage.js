// Consult the Oracle — the rules library: Core Rules, Advanced Rules, the
// FAQ and every battlepack (Matched Play, Path to Glory, Spearhead), with a
// table of contents per book and a search across all of them.
//
// Pages come from GET /api/oracle (library + tables of contents) and
// GET /api/oracle/:slug (one book's sanitised HTML). URL: ?book=<slug>#<id>
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { useIsPhone } from '../phone';
import {
  BOOK_GLOSSARY, EXPANDED_GLOSSARY, GLOSSARY_INTRO, GLOSSARY_SOURCE, glossaryLetter, plainText, resolveRef,
  setupSections, applyCollapsed, sectionOf, refineSub, boldKeywords, unboldKeywords,
} from '../oracleEnhance';

const GROUP_ORDER = ['Rules', 'Matched Play', 'Path to Glory', 'Spearhead'];
const pageCache = {};
const GLOSSARY_SLUG = 'glossary';
const CORE_SLUGS = new Set(['core-rules', 'advanced-rules', GLOSSARY_SLUG]);
const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

function readPref(key, dflt) {
  try { const v = localStorage.getItem(key); return v == null ? dflt : v === '1'; } catch { return dflt; }
}
function usePref(key, dflt) {
  const [v, setV] = useState(() => readPref(key, dflt));
  const set = useCallback(next => { setV(next); try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* private mode */ } }, [key]);
  return [v, set];
}

// Glossary entries as search sections.
function glossarySections(list) {
  return list.map(e => ({ id: e.id, heading: e.term, text: plainText(e.html) + (e.ref ? ` (${e.ref.book}, ${e.ref.sec})` : '') }));
}

function flash(el) {
  el.classList.remove('or-flash'); void el.offsetWidth; el.classList.add('or-flash');
  setTimeout(() => el.classList.remove('or-flash'), 1600);
}

async function loadPage(slug) {
  if (!pageCache[slug]) pageCache[slug] = axios.get(`/api/oracle/${slug}`).then(r => r.data).catch(e => { delete pageCache[slug]; throw e; });
  return pageCache[slug];
}

// Plain-text sections of a book for searching: [{ id, heading, text }]
function sectionsOf(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = [];
  let cur = { id: null, heading: '', text: '' };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 1 && /^H[2-4]$/.test(n.tagName) && n.id) {
      if (cur.text.trim()) out.push(cur);
      cur = { id: n.id, heading: n.textContent.trim(), text: '' };
      continue;
    }
    if (n.nodeType === 3) {
      const p = n.parentElement;
      if (p && /^H[2-4]$/.test(p.tagName) && p.id) continue;
      cur.text += n.data + ' ';
    }
  }
  if (cur.text.trim()) out.push(cur);
  return out.map(s => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }));
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function snippet(text, terms) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at - 70);
  let s = (start > 0 ? '…' : '') + text.slice(start, start + 220) + (start + 220 < text.length ? '…' : '');
  const parts = s.split(new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi'));
  return parts.map((p, i) => terms.includes(p.toLowerCase()) ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>);
}

// Highlight search terms inside the rendered book (text nodes only).
function markTerms(root, terms) {
  root.querySelectorAll('mark.or-hit').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
  root.normalize();
  if (!terms.length) return null;
  const re = new RegExp(terms.map(escapeRe).join('|'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n; while ((n = walker.nextNode())) if (re.test(n.data)) nodes.push(n);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0; const s = node.data; re.lastIndex = 0; let m;
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const mk = document.createElement('mark'); mk.className = 'or-hit'; mk.textContent = m[0]; frag.appendChild(mk);
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    node.replaceWith(frag);
  }
  return root.querySelector('mark.or-hit');
}

export default function OraclePage() {
  const isPhone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const [library, setLibrary] = useState(null);   // { books, pages }
  const [error, setError] = useState('');
  const [page, setPage] = useState(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(null);       // [{ slug, title, sections }]
  const [indexing, setIndexing] = useState(false);
  const [libOpen, setLibOpen] = useState(false);  // phone: library sheet
  const [boldKw, setBoldKw] = usePref('aos-oracle-bold-keywords', false);
  const [coreOnly, setCoreOnly] = usePref('aos-oracle-core-only', true);
  const [glossExpanded, setGlossExpanded] = usePref('aos-oracle-glossary-expanded', false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [secIds, setSecIds] = useState([]);
  const [listening, setListening] = useState(false);
  const [micMsg, setMicMsg] = useState('');
  const recRef = useRef(null);
  const glossRef = useRef(null);
  const docRef = useRef(null);
  const pendingScroll = useRef(null);
  const highlight = useRef([]);
  const pendingSub = useRef(null);   // deeper section number to land on (e.g. 15.2.1)

  const pages = useMemo(() => {
    const list = [...(library?.pages || [])];
    if (!list.length) return list;
    const gl = { slug: GLOSSARY_SLUG, title: 'Glossary', grp: 'Rules', virtual: true, toc: [] };
    const at = list.findIndex(p => p.slug === 'faq');
    list.splice(at >= 0 ? at + 1 : list.filter(p => p.grp === 'Rules').length, 0, gl);
    return list;
  }, [library]);
  const glossary = glossExpanded ? EXPANDED_GLOSSARY : BOOK_GLOSSARY;
  const glossLetters = useMemo(() => [...new Set(glossary.map(glossaryLetter))], [glossary]);
  const bySlug = useMemo(() => Object.fromEntries(pages.map(p => [p.slug, p])), [pages]);
  const slug = params.get('book') && bySlug[params.get('book')] ? params.get('book') : (pages[0]?.slug || null);
  const groups = useMemo(() => GROUP_ORDER.map(g => ({ g, items: pages.filter(p => p.grp === g) })).filter(x => x.items.length), [pages]);

  useEffect(() => {
    axios.get('/api/oracle').then(r => setLibrary(r.data)).catch(e => setError(e.response?.data?.error || e.message));
  }, []);

  useEffect(() => { setCollapsed(new Set()); }, [slug]);

  useEffect(() => {
    if (!slug || slug === GLOSSARY_SLUG) return;
    let alive = true;
    setLoadingPage(true);
    loadPage(slug).then(p => { if (alive) { setPage(p); setLoadingPage(false); } })
      .catch(e => { if (alive) { setError(e.response?.data?.error || e.message); setLoadingPage(false); } });
    return () => { alive = false; };
  }, [slug]);

  // After the book renders: colour ability bars, honour #hash / pending
  // jumps, highlight search terms.
  useLayoutEffect(() => {
    const root = docRef.current;
    if (!root || !page || page.slug !== slug) return;
    root.querySelectorAll('.or-ab[data-c]').forEach(el => el.style.setProperty('--abc', el.getAttribute('data-c')));
    root.querySelectorAll('table').forEach(t => {
      if (!t.parentElement.classList.contains('or-table-wrap')) { const w = document.createElement('div'); w.className = 'or-table-wrap'; t.replaceWith(w); w.appendChild(t); }
    });
    setSecIds(setupSections(root));
    if (boldKw) boldKeywords(root);
    const firstHit = markTerms(root, highlight.current);
    const target = pendingScroll.current || decodeURIComponent((window.location.hash || '').slice(1));
    pendingScroll.current = null;
    const el = target ? refineSub(document.getElementById(target), pendingSub.current) : null;
    pendingSub.current = null;
    // open any FAQ <details> holding the first hit
    if (firstHit) { const d = firstHit.closest('details'); if (d) d.open = true; }
    const go = el || firstHit;
    if (go) requestAnimationFrame(() => go.scrollIntoView({ block: 'start' }));
    else { const sc = root.closest('.oracle-main'); if (sc) sc.scrollTop = 0; }
  }, [page, slug]);

  // Collapsed sections → classes on the rendered book.
  useLayoutEffect(() => { if (docRef.current) applyCollapsed(docRef.current, collapsed); }, [collapsed, page, slug]);

  // Bold keywords on/off without re-rendering the book.
  useEffect(() => {
    const root = docRef.current;
    if (!root || !page || page.slug !== slug) return;
    if (boldKw) { if (!root.querySelector('b.or-kw')) boldKeywords(root); } else unboldKeywords(root);
  }, [boldKw, page, slug]);

  // Make sure an element we're about to scroll to isn't inside a collapsed section.
  const reveal = useCallback(el => {
    const id = sectionOf(el);
    if (!id || (el.matches && el.matches('h2.or-sec-head'))) return;
    const root = docRef.current;
    if (root) root.querySelectorAll(`[data-osec="${CSS.escape(id)}"]`).forEach(n => n.classList.remove('or-sec-hidden'));
    setCollapsed(c => { if (!c.has(id)) return c; const n = new Set(c); n.delete(id); return n; });
  }, []);

  const toggleSection = useCallback(id => {
    setCollapsed(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const onDocClick = e => {
    const h = e.target.closest && e.target.closest('h2.or-sec-head');
    if (h && docRef.current && docRef.current.contains(h)) toggleSection(h.id);
  };
  const onDocKey = e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const h = e.target.closest && e.target.closest('h2.or-sec-head');
    if (h) { e.preventDefault(); toggleSection(h.id); }
  };

  const openBook = useCallback((s, anchor, terms) => {
    highlight.current = terms || [];
    pendingScroll.current = anchor || null;
    const next = new URLSearchParams(params); next.set('book', s);
    setParams(next, { replace: false });
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}${anchor ? '#' + anchor : ''}`);
    setLibOpen(false);
    if (s === GLOSSARY_SLUG && slug === GLOSSARY_SLUG) {
      pendingScroll.current = null;
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) { el.scrollIntoView({ block: 'start' }); flash(el); }
    } else if (s === slug && page && docRef.current) {
      // same book: re-run highlight + scroll by hand
      const root = docRef.current;
      const hit = markTerms(root, highlight.current);
      const el = anchor ? refineSub(document.getElementById(anchor), pendingSub.current) : hit;
      pendingSub.current = null;
      if (hit) { const d = hit.closest('details'); if (d) d.open = true; }
      if (el) { reveal(el); requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
      pendingScroll.current = null;
    }
  }, [params, setParams, slug, page, reveal]);

  // Glossary: scroll to a pending entry once it renders.
  useLayoutEffect(() => {
    if (slug !== GLOSSARY_SLUG || !glossRef.current) return;
    const target = pendingScroll.current || decodeURIComponent((window.location.hash || '').slice(1));
    pendingScroll.current = null;
    const el = target ? document.getElementById(target) : null;
    if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: 'start' }); flash(el); });
    else { const sc = glossRef.current.closest('.oracle-main'); if (sc) sc.scrollTop = 0; }
  }, [slug, glossExpanded]);

  const jump = id => {
    const el = document.getElementById(id);
    if (el) reveal(el);
    if (el) { el.scrollIntoView({ block: 'start' }); window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`); }
  };

  // Build the search index the first time someone types.
  useEffect(() => {
    if (!query.trim() || index || indexing || !pages.length) return;
    setIndexing(true);
    Promise.all(pages.filter(p => !p.virtual).map(p => loadPage(p.slug).then(full => ({ slug: p.slug, title: p.title, grp: p.grp, sections: sectionsOf(full.html) })).catch(() => null)))
      .then(list => { setIndex(list.filter(Boolean)); setIndexing(false); });
  }, [query, index, indexing, pages]);

  // The glossary is searched as a book too (book entries, or the expanded set).
  const fullIndex = useMemo(() => index ? [...index, { slug: GLOSSARY_SLUG, title: 'Glossary', grp: 'Rules', sections: glossarySections(glossary) }] : null, [index, glossary]);

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(t => t.length >= 2), [query]);
  const results = useMemo(() => {
    if (!fullIndex || !terms.length) return [];
    const out = [];
    for (const b of fullIndex) for (const s of b.sections) {
      if (coreOnly && !CORE_SLUGS.has(b.slug)) continue;
      const hay = (s.heading + ' ' + s.text).toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
      const head = s.heading.toLowerCase();
      const score = terms.reduce((n, t) => n + (head.includes(t) ? 10 : 0) + (hay.split(t).length - 1), 0);
      out.push({ book: b, s, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [fullIndex, terms, coreOnly]);

  const toc = slug === GLOSSARY_SLUG
    ? glossLetters.map(l => ({ id: `gl-letter-${l}`, level: 2, text: l }))
    : (bySlug[slug]?.toc || []);

  // ── Voice search (Web Speech API; Chrome, Edge, Safari incl. iPhone) ──
  const toggleMic = () => {
    if (!SpeechRec) return;
    if (listening) { try { if (recRef.current) recRef.current.stop(); } catch { /* already stopped */ } return; }
    setMicMsg('');
    let r;
    try { r = new SpeechRec(); } catch { setMicMsg('Voice search is not available in this browser.'); return; }
    r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
    r.onresult = e => {
      const t = [...e.results].map(x => x[0].transcript).join(' ').replace(/[.?!]+$/, '').trim();
      if (t) setQuery(t);
    };
    r.onerror = e => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicMsg('Microphone access is blocked. Allow it in your browser settings to search by voice.');
      else if (e.error === 'no-speech') setMicMsg('Didn’t catch that. Tap 🎤 and try again.');
      else if (e.error !== 'aborted') setMicMsg('Voice search stopped: ' + e.error);
    };
    r.onend = () => setListening(false);
    recRef.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  };
  useEffect(() => () => { try { if (recRef.current) recRef.current.abort(); } catch { /* none */ } }, []);
  useEffect(() => { if (!micMsg) return undefined; const t = setTimeout(() => setMicMsg(''), 5000); return () => clearTimeout(t); }, [micMsg]);

  const openRef = (e, ref) => {
    e.preventDefault();
    const target = resolveRef(ref, bySlug);
    if (target) { setQuery(''); pendingSub.current = target.sub || null; openBook(target.slug, target.id || undefined); }
  };

  const glossaryView = (
    <article className="oracle-doc oracle-glossary" ref={glossRef}>
      <div className="oracle-doc-head">
        <div className="oracle-doc-group">Rules</div>
        <h1 className="oracle-doc-title">Glossary</h1>
        <label className="oracle-check oracle-gl-toggle">
          <input type="checkbox" checked={glossExpanded} onChange={e => setGlossExpanded(e.target.checked)} />
          Expanded glossary
          <span className="oracle-check-note">{glossExpanded ? `${EXPANDED_GLOSSARY.length} entries: every keyword, including ones the book leaves out (marked ✦)` : `${BOOK_GLOSSARY.length} entries, exactly as in the rulebook`}</span>
        </label>
      </div>
      <div className="oracle-doc-body">
        <p className="or-gl-intro">{GLOSSARY_INTRO}</p>
        {glossary.map((e, i) => {
          const l = glossaryLetter(e);
          const first = i === 0 || glossaryLetter(glossary[i - 1]) !== l;
          return (
            <React.Fragment key={e.id}>
              {first && <h2 className="or-gl-letter" id={`gl-letter-${l}`}>{l}</h2>}
              <p className={`or-gl-entry${e.extra ? ' or-gl-extra' : ''}`} id={e.id}>
                {e.extra && <span className="or-gl-star" title="Expanded glossary entry: not in the rulebook’s glossary">✦ </span>}
                <button type="button" className="or-gl-term" title={`Search the rules for “${e.term}”`} onClick={() => setQuery(e.term)}>{e.term}:</button>{' '}
                <span dangerouslySetInnerHTML={{ __html: e.html }} />
                {e.ref && <> <a className="or-gl-ref" href={`#${e.ref.book}-${e.ref.sec}`} onClick={ev => openRef(ev, e.ref)} title="Open this section">({e.ref.book}, {e.ref.sec})</a></>}
              </p>
            </React.Fragment>
          );
        })}
        <p className="or-gl-source">Source: {GLOSSARY_SOURCE}.{glossExpanded ? ' Entries marked ✦ are summaries written for this site; the rules modules take precedence.' : ''}</p>
      </div>
    </article>
  );

  const library_ = (
    <nav className="oracle-library">
      {groups.map(({ g, items }) => (
        <div key={g} className="oracle-lib-group">
          <div className="oracle-lib-group-title">{g}</div>
          {items.map(p => (
            <button key={p.slug} className={`oracle-lib-book${p.slug === slug ? ' active' : ''}`} onClick={() => { setQuery(''); openBook(p.slug); }}>
              {p.title}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  if (error && !library) return <div className="oracle-page"><div className="oracle-empty">The Oracle could not be reached: {error}</div></div>;
  if (!library) return <div className="oracle-page"><div className="oracle-empty">Consulting the Oracle…</div></div>;
  if (!pages.length) return (
    <div className="oracle-page">
      <div className="page-header"><h1 className="page-title">Consult the Oracle</h1></div>
      <div className="oracle-empty">The Oracle is silent — the rules haven’t been loaded yet.</div>
    </div>
  );

  return (
    <div className={`oracle-page${isPhone ? ' oracle-phone' : ''}`}>
      <div className="page-header oracle-header">
        <h1 className="page-title">Consult the Oracle</h1>
        <div className="oracle-search">
          <input
            className="filter-input" type="search" value={query}
            placeholder="Search all rules… (e.g. pile in, ward, underdog)"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
          />
          {query && <button className="oracle-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>}
          {SpeechRec && (
            <button type="button" className={`oracle-mic${listening ? ' listening' : ''}`} onClick={toggleMic}
              aria-label={listening ? 'Stop voice search' : 'Search by voice'} title={listening ? 'Listening… tap to stop' : 'Search by voice'}>🎤</button>
          )}
          {micMsg && <div className="oracle-mic-msg">{micMsg}</div>}
        </div>
        <div className="oracle-options">
          <label className="oracle-check" title="Checked: search only the Core Rules, Advanced Rules and Glossary. Unchecked: search every book (FAQ and all battlepacks too).">
            <input type="checkbox" checked={coreOnly} onChange={e => setCoreOnly(e.target.checked)} /> Core rules
          </label>
          <label className="oracle-check" title="Bold every keyword (HERO, WIZARD, FLY…) in the rules text">
            <input type="checkbox" checked={boldKw} onChange={e => setBoldKw(e.target.checked)} /> Bold keywords
          </label>
        </div>
        {isPhone && (
          <button className="oracle-phone-lib-btn" onClick={() => setLibOpen(o => !o)}>
            📜 {bySlug[slug]?.title || 'Books'} ▾
          </button>
        )}
      </div>

      <div className="oracle-body">
        {!isPhone && library_}
        {isPhone && libOpen && <div className="oracle-phone-lib">{library_}</div>}

        <main className="oracle-main">
          {terms.length > 0 ? (
            <div className="oracle-results">
              <div className="oracle-results-head">
                {indexing || !index ? 'Reading every book…' : `${results.length}${results.length === 60 ? '+' : ''} result${results.length === 1 ? '' : 's'} for “${query.trim()}”${coreOnly ? ' in the core rules' : ''}`}
              </div>
              {results.map((r, i) => (
                <button key={i} className="oracle-result" onClick={() => { const t = terms; setQuery(''); openBook(r.book.slug, r.s.id, t); }}>
                  <div className="oracle-result-where"><span className="oracle-result-book">{r.book.title}</span>{r.s.heading ? <> › {r.s.heading}</> : null}</div>
                  <div className="oracle-result-snip">{snippet(r.s.text || r.s.heading, terms)}</div>
                </button>
              ))}
              {index && !results.length && (
                <div className="oracle-empty">
                  Nothing found{coreOnly ? ' in the core rules' : ''}. Try fewer or different words.
                  {coreOnly && <> <button type="button" className="oracle-link-btn" onClick={() => setCoreOnly(false)}>Search all books</button></>}
                </div>
              )}
            </div>
          ) : (
            <>
              {isPhone && toc.length > 0 && (
                <select className="oracle-phone-toc filter-select" value="" onChange={e => e.target.value && jump(e.target.value)}>
                  <option value="">Jump to section…</option>
                  {toc.map(h => <option key={h.id} value={h.id}>{h.level === 3 ? '   ' : ''}{h.text}</option>)}
                </select>
              )}
              {slug === GLOSSARY_SLUG ? glossaryView : (
                <>
                  {loadingPage && !page && <div className="oracle-empty">Opening the book…</div>}
                  {page && (
                    <article className="oracle-doc">
                      <div className="oracle-doc-head">
                        <div className="oracle-doc-group">{bySlug[slug]?.grp}</div>
                        <h1 className="oracle-doc-title">{bySlug[slug]?.title}</h1>
                        <a className="oracle-doc-source" href={page.source_url} target="_blank" rel="noreferrer">Source: Wahapedia ↗</a>
                        {secIds.length > 0 && page.slug === slug && (
                          <div className="oracle-sec-tools">
                            <button type="button" className="oracle-link-btn" onClick={() => setCollapsed(new Set(secIds))}>Collapse all</button>
                            <button type="button" className="oracle-link-btn" onClick={() => setCollapsed(new Set())}>Expand all</button>
                          </div>
                        )}
                      </div>
                      <div className="oracle-doc-body" ref={docRef} onClick={onDocClick} onKeyDown={onDocKey}
                        dangerouslySetInnerHTML={{ __html: page.slug === slug ? page.html : '' }} />
                    </article>
                  )}
                </>
              )}
            </>
          )}
        </main>

        {!isPhone && terms.length === 0 && toc.length > 0 && (
          <aside className="oracle-toc">
            <div className="oracle-lib-group-title">In this book</div>
            {toc.map(h => (
              <button key={h.id} className={`oracle-toc-item lvl${h.level}`} onClick={() => jump(h.id)}>{h.text}</button>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
