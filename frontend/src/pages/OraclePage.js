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

const GROUP_ORDER = ['Rules', 'Matched Play', 'Path to Glory', 'Spearhead'];
const pageCache = {};

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
  const docRef = useRef(null);
  const pendingScroll = useRef(null);
  const highlight = useRef([]);

  const pages = useMemo(() => library?.pages || [], [library]);
  const bySlug = useMemo(() => Object.fromEntries(pages.map(p => [p.slug, p])), [pages]);
  const slug = params.get('book') && bySlug[params.get('book')] ? params.get('book') : (pages[0]?.slug || null);
  const groups = useMemo(() => GROUP_ORDER.map(g => ({ g, items: pages.filter(p => p.grp === g) })).filter(x => x.items.length), [pages]);

  useEffect(() => {
    axios.get('/api/oracle').then(r => setLibrary(r.data)).catch(e => setError(e.response?.data?.error || e.message));
  }, []);

  useEffect(() => {
    if (!slug) return;
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
    const firstHit = markTerms(root, highlight.current);
    const target = pendingScroll.current || decodeURIComponent((window.location.hash || '').slice(1));
    pendingScroll.current = null;
    const el = target ? document.getElementById(target) : null;
    // open any FAQ <details> holding the first hit
    if (firstHit) { const d = firstHit.closest('details'); if (d) d.open = true; }
    const go = el || firstHit;
    if (go) requestAnimationFrame(() => go.scrollIntoView({ block: 'start' }));
    else { const sc = root.closest('.oracle-main'); if (sc) sc.scrollTop = 0; }
  }, [page, slug]);

  const openBook = useCallback((s, anchor, terms) => {
    highlight.current = terms || [];
    pendingScroll.current = anchor || null;
    const next = new URLSearchParams(params); next.set('book', s);
    setParams(next, { replace: false });
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}${anchor ? '#' + anchor : ''}`);
    setLibOpen(false);
    if (s === slug && page) {
      // same book: re-run highlight + scroll by hand
      const root = docRef.current;
      const hit = markTerms(root, highlight.current);
      const el = anchor ? document.getElementById(anchor) : hit;
      if (hit) { const d = hit.closest('details'); if (d) d.open = true; }
      if (el) el.scrollIntoView({ block: 'start' });
      pendingScroll.current = null;
    }
  }, [params, setParams, slug, page]);

  const jump = id => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ block: 'start' }); window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`); }
  };

  // Build the search index the first time someone types.
  useEffect(() => {
    if (!query.trim() || index || indexing || !pages.length) return;
    setIndexing(true);
    Promise.all(pages.map(p => loadPage(p.slug).then(full => ({ slug: p.slug, title: p.title, grp: p.grp, sections: sectionsOf(full.html) })).catch(() => null)))
      .then(list => { setIndex(list.filter(Boolean)); setIndexing(false); });
  }, [query, index, indexing, pages]);

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(t => t.length >= 2), [query]);
  const results = useMemo(() => {
    if (!index || !terms.length) return [];
    const out = [];
    for (const b of index) for (const s of b.sections) {
      const hay = (s.heading + ' ' + s.text).toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
      const head = s.heading.toLowerCase();
      const score = terms.reduce((n, t) => n + (head.includes(t) ? 10 : 0) + (hay.split(t).length - 1), 0);
      out.push({ book: b, s, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [index, terms]);

  const toc = bySlug[slug]?.toc || [];

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
                {indexing || !index ? 'Reading every book…' : `${results.length}${results.length === 60 ? '+' : ''} result${results.length === 1 ? '' : 's'} for “${query.trim()}”`}
              </div>
              {results.map((r, i) => (
                <button key={i} className="oracle-result" onClick={() => { const t = terms; setQuery(''); openBook(r.book.slug, r.s.id, t); }}>
                  <div className="oracle-result-where"><span className="oracle-result-book">{r.book.title}</span>{r.s.heading ? <> › {r.s.heading}</> : null}</div>
                  <div className="oracle-result-snip">{snippet(r.s.text || r.s.heading, terms)}</div>
                </button>
              ))}
              {index && !results.length && <div className="oracle-empty">Nothing found. Try fewer or different words.</div>}
            </div>
          ) : (
            <>
              {isPhone && toc.length > 0 && (
                <select className="oracle-phone-toc filter-select" value="" onChange={e => e.target.value && jump(e.target.value)}>
                  <option value="">Jump to section…</option>
                  {toc.map(h => <option key={h.id} value={h.id}>{h.level === 3 ? '   ' : ''}{h.text}</option>)}
                </select>
              )}
              {loadingPage && !page && <div className="oracle-empty">Opening the book…</div>}
              {page && (
                <article className="oracle-doc" ref={docRef}>
                  <div className="oracle-doc-head">
                    <div className="oracle-doc-group">{bySlug[slug]?.grp}</div>
                    <h1 className="oracle-doc-title">{bySlug[slug]?.title}</h1>
                    <a className="oracle-doc-source" href={page.source_url} target="_blank" rel="noreferrer">Source: Wahapedia ↗</a>
                  </div>
                  <div className="oracle-doc-body" dangerouslySetInnerHTML={{ __html: page.slug === slug ? page.html : '' }} />
                </article>
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
