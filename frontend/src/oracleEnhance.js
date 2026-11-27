// Consult the Oracle — DOM helpers run on a rendered rules book:
//  * numbered major sections ("1.0 Core Concepts", h2) become collapsible;
//  * keywords (Wahapedia writes them in CAPITALS, e.g. HERO, WIZARD (2),
//    STRIKE-FIRST) can be bolded on demand;
//  * glossary references ("Core Rules, 18.2") resolve to a heading in a book.
import BOOK from './data/oracleGlossary.json';
import EXTRA from './data/oracleGlossaryExpanded.json';

export const SEC_NUM_RE = /^(\d+(?:\.\d+)*)\s/;

// ── Glossary ────────────────────────────────────────────────────────────
const sortKey = t => t.toLowerCase().replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9 ]/g, '');
export const GLOSSARY_INTRO = BOOK.intro;
export const GLOSSARY_SOURCE = BOOK.source;
const withIds = (list, extra) => list.map(e => ({ ...e, extra, id: 'gl-' + sortKey(e.term).replace(/\s+/g, '-') }));
export const BOOK_GLOSSARY = withIds(BOOK.entries, false);          // book order, exactly as printed
export const EXPANDED_GLOSSARY = (() => {
  const have = new Set(BOOK_GLOSSARY.map(e => sortKey(e.term)));
  const extra = withIds(EXTRA, true).filter(e => !have.has(sortKey(e.term)));
  return [...BOOK_GLOSSARY, ...extra].sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term)));
})();
export const glossaryLetter = e => (sortKey(e.term)[0] || '#').toUpperCase();

// keyword (lower case, singular-ish) → glossary entry, for tooltips
const KW_INDEX = (() => {
  const m = new Map();
  for (const e of EXPANDED_GLOSSARY) {
    const k = e.term.toLowerCase();
    if (!m.has(k)) m.set(k, e);
  }
  return m;
})();
export function glossaryFor(word) {
  const w = word.toLowerCase().replace(/[’']s?$/, '').replace(/\s*\(\d+\)$/, '').trim();
  return KW_INDEX.get(w) || KW_INDEX.get(w.replace(/es$/, '')) || KW_INDEX.get(w.replace(/s$/, '')) || null;
}
export const plainText = html => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Where a glossary reference points. The rulebook's Advanced Rules modules
// (Commands, Terrain, Magic, Army Composition, Command Models) each restart
// at 1.0 and live in the Advanced Rules book under a part heading
// ("Commands 2026-27"). Battle Tactics moved into Army Composition (4.3).
const PART_OF = { 'Commands': 'Commands', 'Terrain': 'Terrain', 'Magic': 'Magic', 'Army Composition': 'Army Composition', 'Command Models': 'Command Models' };
export function resolveRef(ref, pagesBySlug) {
  if (!ref) return null;
  let book = ref.book, sec = ref.sec;
  if (book === 'Battle Tactics') { book = 'Army Composition'; sec = '4.3'; }
  const isCore = book === 'Core Rules' || book === 'Special Rules';
  const slug = isCore ? 'core-rules' : 'advanced-rules';
  const toc = pagesBySlug[slug]?.toc;
  if (!toc) return null;
  let list = toc;
  if (!isCore) {
    const part = PART_OF[book];
    const start = toc.findIndex(h => h.level === 2 && !SEC_NUM_RE.test(h.text) && h.text.toLowerCase().startsWith(part.toLowerCase()));
    if (start < 0) return { slug, id: null };
    let end = toc.findIndex((h, i) => i > start && h.level === 2 && !SEC_NUM_RE.test(h.text));
    if (end < 0) end = toc.length;
    list = toc.slice(start, end);
    if (!list.length) return { slug, id: null };
  }
  const tries = [sec];
  const parts = sec.split('.');
  while (parts.length > 2) { parts.pop(); tries.push(parts.join('.')); }   // 15.2.1 → 15.2
  tries.push(sec.split('.')[0] + '.0');                                     // 18.2 → 18.0
  for (const t of tries) {
    const h = list.find(x => x.text.startsWith(t + ' '));
    if (h) return { slug, id: h.id, text: h.text, sub: h.text.startsWith(sec + ' ') ? null : sec };
  }
  return { slug, id: isCore ? null : list[0].id };
}

// ── Collapsible numbered sections ───────────────────────────────────────
// Content in Wahapedia's markup is nested in divs, so a section can't be
// wrapped in one element. Instead every top-most node between a numbered
// h2 and the next h2 gets data-osec="<h2 id>"; loose text is wrapped in a
// span first. Collapsing hides those nodes with a class.
export function setupSections(root) {
  if (root.dataset.osecDone) return [...root.querySelectorAll('h2.or-sec-head')].map(h => h.id);
  root.dataset.osecDone = '1';
  const ids = [];
  let cur = null;
  const visit = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1 && child.tagName === 'H2') {
        const numbered = SEC_NUM_RE.test(child.textContent.trim()) && child.id;
        cur = numbered ? child.id : null;
        if (numbered) {
          child.classList.add('or-sec-head');
          child.setAttribute('role', 'button');
          child.setAttribute('tabindex', '0');
          child.setAttribute('aria-expanded', 'true');
          child.title = 'Click to collapse or expand this section';
          const caret = document.createElement('span');
          caret.className = 'or-sec-caret'; caret.setAttribute('aria-hidden', 'true'); caret.textContent = '▾';
          child.insertBefore(caret, child.firstChild);
          ids.push(child.id);
        }
        continue;
      }
      if (child.nodeType === 1 && child.querySelector('h2')) { visit(child); continue; }
      if (!cur) continue;
      if (child.nodeType === 3) {
        if (!child.data.trim()) continue;
        const s = document.createElement('span'); s.dataset.osec = cur; s.className = 'or-sec-text';
        child.replaceWith(s); s.appendChild(child);
      } else if (child.nodeType === 1) child.dataset.osec = cur;
    }
  };
  visit(root);
  return ids;
}

export function applyCollapsed(root, collapsed) {
  root.querySelectorAll('[data-osec]').forEach(el => el.classList.toggle('or-sec-hidden', collapsed.has(el.dataset.osec)));
  root.querySelectorAll('h2.or-sec-head').forEach(h => {
    const c = collapsed.has(h.id);
    h.classList.toggle('collapsed', c);
    h.setAttribute('aria-expanded', c ? 'false' : 'true');
  });
}

// A deeper numbered heading (e.g. 15.2.1, an h4 the contents list leaves
// out) inside the section that starts at `el`.
export function refineSub(el, sec) {
  if (!el || !sec) return el;
  const root = el.closest('.oracle-doc-body');
  if (!root) return el;
  const heads = [...root.querySelectorAll('h2, h3, h4, h5')];
  const i = heads.indexOf(el);
  const lvl = Number(el.tagName[1]);
  for (let j = i + 1; j < heads.length; j++) {
    const h = heads[j];
    if (Number(h.tagName[1]) <= lvl) break;
    if (h.textContent.trim().startsWith(sec + ' ')) return h;
  }
  return el;
}

// The numbered section an element sits in (or heads), if any.
export function sectionOf(el) {
  if (!el) return null;
  if (el.matches && el.matches('h2.or-sec-head')) return el.id;
  const holder = el.closest && el.closest('[data-osec]');
  return holder ? holder.dataset.osec : null;
}

// ── Keyword bolding ─────────────────────────────────────────────────────
const SKIP_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'B', 'STRONG', 'SUMMARY', 'TH', 'MARK', 'BUTTON', 'A', 'SCRIPT', 'STYLE']);
const NOT_KEYWORDS = new Set(['EXAMPLE', 'EXAMPLES', 'NOTE', 'CORE RULES', 'ADVANCED RULES', 'FAQ', 'UNIT TYPE', 'KEYWORDS', 'WEAPONS', 'ABILITIES', 'MELEE', 'RANGED', 'PDF', 'ITC', 'ADD', 'AND', 'THE', 'OR']);
const NOT_KW_WORD = /\b(?:YOUR|ADDING|STEP|PAGE)\b/;
const KW_RE = /\b[A-Z][A-Z’'-]*[A-Z](?:[ -][A-Z][A-Z’'-]*[A-Z])*(?: \(\d+\))?(?![a-z])/g;

export function boldKeywords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) {
        if (SKIP_TAGS.has(p.tagName) || p.classList.contains('or-ab') || p.classList.contains('or-sub') || p.classList.contains('or-kw')) return NodeFilter.FILTER_REJECT;
      }
      KW_RE.lastIndex = 0;
      return KW_RE.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  let count = 0;
  for (const node of nodes) {
    const s = node.data; const frag = document.createDocumentFragment();
    // A line that is nothing but capitals is a label/caption (e.g. a
    // battleplan's "DEPLOYMENT"), not a keyword in running text.
    const own = (node.parentElement.textContent || '').trim();
    if (!/[a-z]/.test(own)) continue;
    let last = 0, m, any = false; KW_RE.lastIndex = 0;
    while ((m = KW_RE.exec(s))) {
      const word = m[0];
      if (word.replace(/[^A-Z]/g, '').length < 3 || NOT_KEYWORDS.has(word) || NOT_KW_WORD.test(word) || own === word) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const b = document.createElement('b'); b.className = 'or-kw'; b.textContent = word;
      const g = glossaryFor(word);
      if (g) b.title = `${g.term}: ${plainText(g.html)}`;
      frag.appendChild(b); last = m.index + word.length; any = true; count++;
    }
    if (!any) continue;
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    node.replaceWith(frag);
  }
  return count;
}

export function unboldKeywords(root) {
  root.querySelectorAll('b.or-kw').forEach(b => b.replaceWith(document.createTextNode(b.textContent)));
  root.normalize();
}
