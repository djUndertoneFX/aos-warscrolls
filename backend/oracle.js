// Consult the Oracle — rules reference pages (core rules, advanced rules,
// battlepacks, FAQ). Content is taken from Wahapedia's /aos4/the-rules/
// pages in a browser (cleaned to plain HTML there) and uploaded by an admin
// through PUT /api/admin/oracle; it is stored in the oracle_pages table on
// the Railway volume. Everything is re-sanitised here with a tag/attribute
// whitelist before it is stored, because the page renders it as HTML.
const cheerio = require('cheerio');

// slug → where it sits in the Oracle's library.
const BOOKS = [
  { slug: 'core-rules',                 group: 'Rules',                    title: 'Core Rules' },
  { slug: 'advanced-rules',             group: 'Rules',                    title: 'Advanced Rules' },
  { slug: 'faq',                        group: 'Rules',                    title: 'FAQ & Errata' },
  { slug: 'first-blood',                group: 'Matched Play',             title: 'First Blood' },
  { slug: 'general-s-handbook-2026-27', group: 'Matched Play',             title: 'General’s Handbook 2026-27' },
  { slug: 'ascension',                  group: 'Path to Glory',            title: 'Ascension' },
  { slug: 'ravaged-coast',              group: 'Path to Glory',            title: 'Ravaged Coast' },
  { slug: 'blighted-wilds',             group: 'Path to Glory',            title: 'Blighted Wilds' },
  { slug: 'fire-and-jade',              group: 'Spearhead',                title: 'Fire and Jade' },
  { slug: 'sand-and-bone',              group: 'Spearhead',                title: 'Sand and Bone' },
  { slug: 'spearhead-doubles',          group: 'Spearhead',                title: 'Spearhead Doubles' },
];
// Wahapedia's "The Core Rules" page carries the Advanced Rules (Commands,
// Terrain, Magic, Army Composition, Command Models) after its core section;
// it is stored as two books, split at this heading.
const ADVANCED_START = '<h2 id="Commands-2026-27"';

const BOOK_BY_SLUG = Object.fromEntries(BOOKS.map((b, i) => [b.slug, { ...b, sort: i }]));

const TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'p', 'br', 'b', 'i', 'em', 'strong', 'u', 'sup', 'sub',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'div', 'span', 'details', 'summary', 'img']);
const CLASS_OK = /^or-[a-z0-9-]+$/;

function sanitize(html) {
  const $ = cheerio.load(`<div id="__root">${html || ''}</div>`, null, false);
  // Wahapedia's red "rules summary" boxes: a 3x3 frame table whose only
  // content is the middle cell.
  $('#__root table').each((_, t) => {
    const rows = $(t).children('tbody').length ? $(t).children('tbody').children('tr') : $(t).children('tr');
    if (rows.length !== 3) return;
    const cells = rows.map((_, r) => [$(r).children('td').toArray()]).get();
    if (cells.some(c => c.length !== 3)) return;
    const mid = cells[1][1];
    const others = cells.flat().filter(c => c !== mid);
    if (others.some(c => $(c).text().trim())) return;
    $(t).replaceWith(`<div class="or-summary">${$(mid).html()}</div>`);
  });
  $('#__root *').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (!TAGS.has(tag)) {
      if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta'].includes(tag)) { $(el).remove(); return; }
      $(el).replaceWith($(el).contents());
      return;
    }
    const keep = {};
    const a = el.attribs || {};
    if (/^h[1-5]$/.test(tag) && a.id && /^[\w.:-]{1,120}$/.test(a.id)) keep.id = a.id;
    if ((tag === 'td' || tag === 'th')) {
      if (/^\d{1,2}$/.test(a.colspan || '')) keep.colspan = a.colspan;
      if (/^\d{1,2}$/.test(a.rowspan || '')) keep.rowspan = a.rowspan;
    }
    if (a.class) { const c = a.class.split(/\s+/).filter(x => CLASS_OK.test(x)); if (c.length) keep.class = c.join(' '); }
    if (tag === 'div' && /^#[0-9a-fA-F]{3,8}$/.test(a['data-c'] || '')) keep['data-c'] = a['data-c'];
    if (tag === 'img') {
      // only Wahapedia battleplan maps
      if (!/^https:\/\/wahapedia\.ru\/aos4\/img\/battleplans\/[\w.-]+\.(png|jpe?g|webp)$/i.test(a.src || '')) { $(el).remove(); return; }
      keep.src = a.src; keep.loading = 'lazy'; keep.referrerpolicy = 'no-referrer'; keep.alt = 'Battleplan map';
    }
    el.attribs = keep;
  });
  return $('#__root').html();
}

// Headings for the table of contents: [{ id, level, text }]
function headings(html) {
  const $ = cheerio.load(`<div id="__root">${html || ''}</div>`, null, false);
  const out = [];
  $('#__root h2[id], #__root h3[id]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) out.push({ id: el.attribs.id, level: el.tagName.toLowerCase() === 'h2' ? 2 : 3, text });
  });
  return out;
}

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oracle_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      grp TEXT,
      sort INTEGER DEFAULT 0,
      html TEXT NOT NULL,
      toc TEXT,
      source_url TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function savePages(db, pages) {
  ensureTable(db);
  const up = db.prepare(`INSERT INTO oracle_pages (slug, title, grp, sort, html, toc, source_url, updated_at)
    VALUES (@slug, @title, @grp, @sort, @html, @toc, @source_url, CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET title=excluded.title, grp=excluded.grp, sort=excluded.sort, html=excluded.html,
      toc=excluded.toc, source_url=excluded.source_url, updated_at=CURRENT_TIMESTAMP`);
  const saved = [];
  pages = { ...(pages || {}) };
  if (pages['the-core-rules'] && typeof pages['the-core-rules'].html === 'string') {
    const h = pages['the-core-rules'].html; const i = h.indexOf(ADVANCED_START);
    if (i > 0) { pages['core-rules'] = { html: h.slice(0, i) }; pages['advanced-rules'] = { html: h.slice(i) }; }
    else pages['core-rules'] = { html: h };
    delete pages['the-core-rules'];
  }
  const tx = db.transaction(() => {
    for (const [slug, p] of Object.entries(pages)) {
      const book = BOOK_BY_SLUG[slug];
      if (!book || !p || typeof p.html !== 'string' || p.html.length < 200) continue;
      const html = sanitize(p.html);
      up.run({ slug, title: book.title, grp: book.group, sort: book.sort, html,
        toc: JSON.stringify(headings(html)), source_url: `https://wahapedia.ru/aos4/the-rules/${/^(core|advanced)-rules$/.test(slug) ? 'the-core-rules' : slug}/` });
      saved.push({ slug, bytes: html.length });
    }
  });
  tx();
  return saved;
}

function listPages(db) {
  ensureTable(db);
  return db.prepare('SELECT slug, title, grp, sort, toc, source_url, updated_at FROM oracle_pages ORDER BY sort')
    .all().map(r => ({ ...r, toc: JSON.parse(r.toc || '[]') }));
}

function getPage(db, slug) {
  ensureTable(db);
  return db.prepare('SELECT slug, title, grp, sort, html, source_url, updated_at FROM oracle_pages WHERE slug = ?').get(slug);
}

module.exports = { BOOKS, sanitize, headings, savePages, listPages, getPage, ensureTable };
