/**
 * localScrapeImagesLexicanumIndividual.js
 *
 * Scrapes individual Lexicanum unit pages for units missing images.
 * Uses action=raw (wikitext) to extract image filenames, then computes
 * the MediaWiki hash path to download the full-size image directly.
 *
 * Run: node localScrapeImagesLexicanumIndividual.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const LEXICANUM_BASE = 'https://ageofsigmar.lexicanum.com';
const LOCAL_IMG_DIR  = path.join(__dirname, 'downloaded-images', 'Lexicanum');
const MISSING_FILE   = path.join(__dirname, 'missing-images.txt');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const LOGIN_USER    = process.env.LOGIN_USER || '';
const LOGIN_PASS    = process.env.LOGIN_PASS || '';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': LEXICANUM_BASE + '/',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

// Standard English title case: capitalize content words, lowercase prepositions/articles
function titleCase(str) {
  const lower = new Set(['of','on','the','a','an','and','in','to','with','for','at','by']);
  return str.split(' ').map((w, i) =>
    (i === 0 || !lower.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// Generate ordered list of wiki title variants to try
function titleVariants(name) {
  const tc = titleCase(name);
  const variants = [tc];
  // Strip leading "the "
  const noThe = name.replace(/^the /, '');
  if (noThe !== name) variants.push(titleCase(noThe));
  // Strip mount suffix: "X on Y" → "X"
  const noMount = name.replace(/ on .+$/, '');
  if (noMount !== name) variants.push(titleCase(noMount));
  // Strip qualifier suffix: "X herald of Y" → "X"
  const noHerald = name.replace(/ herald of .+$/, '');
  if (noHerald !== name) variants.push(titleCase(noHerald));
  // Just first two words
  const firstTwo = name.split(' ').slice(0, 2).join(' ');
  if (firstTwo !== name) variants.push(titleCase(firstTwo));
  // Just first word
  const firstWord = name.split(' ')[0];
  if (firstWord !== name) variants.push(titleCase(firstWord));
  return [...new Set(variants)];
}

// MediaWiki image URL: md5 of normalized filename gives the 2-level directory
function mediaWikiImageUrl(filename) {
  const norm = filename.replace(/ /g, '_');
  const hash = crypto.createHash('md5').update(norm).digest('hex');
  return `${LEXICANUM_BASE}/mediawiki/images/${hash[0]}/${hash.slice(0, 2)}/${norm}`;
}

// Fetch raw wikitext and extract the first image filename
async function getImageFilename(unitName) {
  const title = encodeURIComponent(unitName);
  const url = `${LEXICANUM_BASE}/mediawiki/index.php?title=${title}&action=raw`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const text = await res.text();
    // Find [[File:...]] or [[Image:...]] references
    const matches = [...text.matchAll(/\[\[(?:File|Image):([^\|\]#]+\.(?:jpg|png|gif))/gi)];
    if (!matches.length) return null;
    // Prefer images that look like unit portraits (contain unit name words or _M0)
    const nameWords = unitName.toLowerCase().split(' ').filter(w => w.length > 3);
    const scored = matches.map(m => {
      const fn = m[1].trim();
      const fnLower = fn.toLowerCase();
      let score = 0;
      for (const w of nameWords) { if (fnLower.includes(w)) score++; }
      if (fnLower.includes('_m0') || fnLower.match(/_0\d\.jpg/i)) score += 2;
      return { fn, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].fn;
  } catch { return null; }
}

async function downloadImage(imgUrl, localPath) {
  if (fs.existsSync(localPath)) return true;
  try {
    const res = await fetch(imgUrl, { headers: { ...HEADERS, Accept: 'image/*' } });
    if (!res.ok) return false;
    const buf = await res.buffer();
    if (buf.length < 5000) return false; // too small, probably not a real image
    fs.writeFileSync(localPath, buf);
    return true;
  } catch { return false; }
}

async function uploadImage(localPath, railwayId) {
  const res = await fetch(`${RAILWAY_API}/api/unit-image/${railwayId}?source=lexicanum`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
    body: fs.readFileSync(localPath),
  });
  return res.ok;
}

async function getJwt() {
  const res = await fetch(`${RAILWAY_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN_USER, password: LOGIN_PASS }),
  });
  if (!res.ok) throw new Error('Login failed');
  const { token } = await res.json();
  return token;
}

async function fetchWarscrolls(jwt) {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${RAILWAY_API}/api/warscrolls?page=${page}&pageSize=200`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) throw new Error(`Warscrolls fetch failed: ${res.status}`);
    const data = await res.json();
    all.push(...data.data);
    if (page >= data.totalPages) break;
    page++;
  }
  return all;
}

function parseMissingNames() {
  const text = fs.readFileSync(MISSING_FILE, 'utf8');
  const names = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^  (.+)/);
    if (m) names.add(m[1].trim());
  }
  return names;
}


async function main() {
  if (!fs.existsSync(LOCAL_IMG_DIR)) fs.mkdirSync(LOCAL_IMG_DIR, { recursive: true });

  console.log('🔑 Logging in...');
  const jwt = await getJwt();
  console.log('📋 Fetching warscrolls...');
  const warscrolls = await fetchWarscrolls(jwt);

  // Build name → [warscroll ids] map for missing units
  const missingNames = parseMissingNames();

  // Group warscrolls by name so we upload to all matching IDs at once
  const nameToIds = {};
  for (const ws of warscrolls) {
    if (!missingNames.has(ws.name)) continue;
    const key = ws.name;
    if (!nameToIds[key]) nameToIds[key] = [];
    nameToIds[key].push({ id: ws.id, faction: ws.faction });
  }

  const uniqueNames = Object.keys(nameToIds).sort();
  console.log(`\n🔍 Trying ${uniqueNames.length} unique missing unit names on Lexicanum...\n`);

  let found = 0, notFound = 0, uploaded = 0;
  const stillMissing = [];

  for (const name of uniqueNames) {
    const ids = nameToIds[name];

    // Try title variants
    let filename = null;
    for (const variant of titleVariants(name)) {
      filename = await getImageFilename(variant);
      if (filename) break;
      await sleep(300);
    }

    if (!filename) {
      stillMissing.push(name);
      notFound++;
      process.stdout.write(`  ✗ ${name}\n`);
      await sleep(300);
      continue;
    }

    const imgUrl = mediaWikiImageUrl(filename);
    const localFilename = `${safeFilename(ids[0].faction)} - ${safeFilename(name)}.jpg`;
    const localPath = path.join(LOCAL_IMG_DIR, localFilename);

    const downloaded = await downloadImage(imgUrl, localPath);
    if (!downloaded) {
      stillMissing.push(name);
      notFound++;
      process.stdout.write(`  ✗ ${name} (download failed: ${imgUrl})\n`);
      await sleep(300);
      continue;
    }

    found++;
    let unitUploaded = 0;
    for (const { id } of ids) {
      const ok = await uploadImage(localPath, id);
      if (ok) { unitUploaded++; uploaded++; }
    }
    process.stdout.write(`  ✓ ${name} [${unitUploaded}/${ids.length} uploaded]\n`);
    await sleep(400);
  }

  console.log(`\n✅ Done.`);
  console.log(`   Found on Lexicanum: ${found} / ${uniqueNames.length}`);
  console.log(`   Total uploads: ${uploaded}`);
  console.log(`   Still missing: ${notFound}`);
  if (stillMissing.length) {
    fs.writeFileSync('still-missing.txt', stillMissing.join('\n'));
    console.log(`   → saved to still-missing.txt`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
