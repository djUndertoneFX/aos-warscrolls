/**
 * localScrapeImagesLexicanumGuess.js
 *
 * Since Lexicanum wiki pages are Cloudflare-blocked, we guess image filenames
 * using common Lexicanum naming patterns and check direct CDN URLs (which work).
 *
 * Run: node localScrapeImagesLexicanumGuess.js
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
  'Referer': LEXICANUM_BASE + '/',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

// Title case: capitalize content words
function titleCase(str) {
  const lower = new Set(['of','on','the','a','an','and','in','to','with','for','at','by']);
  return str.split(' ').map((w, i) =>
    (i === 0 || !lower.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// All words capitalized (including "of", "on", "the")
function allCaps(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Generate all filename candidates for a unit name
function filenameCandidates(name) {
  const tc  = titleCase(name);
  const ac  = allCaps(name);
  const noThe = name.replace(/^the /, '');
  const tcNoThe = titleCase(noThe);
  const acNoThe = allCaps(noThe);
  const firstWord = ac.split(' ')[0];
  const firstTwo  = ac.split(' ').slice(0, 2).join(' ');

  const variants = [tc, ac, tcNoThe, acNoThe];
  const suffixes = [' 01.jpg', '_M01.jpg', ' M01.jpg', 'M01.jpg', ' AoS.jpg', ' AoS4.jpg', '.jpg', ' 1.jpg'];
  const prefixes = ['', 'Pict '];

  const candidates = new Set();
  for (const v of variants) {
    for (const pre of prefixes) {
      for (const suf of suffixes) {
        candidates.add(pre + v + suf);
      }
    }
  }
  // Also try shorter name forms
  for (const suf of suffixes) {
    candidates.add(firstWord + suf);
    if (firstTwo !== firstWord) candidates.add(firstTwo + suf);
  }
  return [...candidates];
}

function mediaWikiImageUrl(filename) {
  const norm = filename.replace(/ /g, '_');
  const hash = crypto.createHash('md5').update(norm).digest('hex');
  return `${LEXICANUM_BASE}/mediawiki/images/${hash[0]}/${hash.slice(0, 2)}/${norm}`;
}

async function findImage(unitName) {
  const candidates = filenameCandidates(unitName);
  for (const fn of candidates) {
    const url = mediaWikiImageUrl(fn);
    try {
      const r = await fetch(url, { headers: { ...HEADERS, Accept: 'image/*' } });
      if (r.ok) {
        const len = parseInt(r.headers.get('content-length') || '0');
        if (len > 5000) return { url, filename: fn };
      }
    } catch {}
    await sleep(80);
  }
  return null;
}

async function downloadImage(imgUrl, localPath) {
  if (fs.existsSync(localPath)) return true;
  try {
    const res = await fetch(imgUrl, { headers: { ...HEADERS, Accept: 'image/*' } });
    if (!res.ok) return false;
    const buf = await res.buffer();
    if (buf.length < 5000) return false;
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

  const missingNames = parseMissingNames();

  // Group warscrolls by name
  const nameToEntries = {};
  for (const ws of warscrolls) {
    if (!missingNames.has(ws.name)) continue;
    if (!nameToEntries[ws.name]) nameToEntries[ws.name] = [];
    nameToEntries[ws.name].push(ws);
  }

  const uniqueNames = Object.keys(nameToEntries).sort();
  console.log(`\n🔍 Guessing Lexicanum filenames for ${uniqueNames.length} units...\n`);

  let found = 0, notFound = 0, uploaded = 0;
  const stillMissing = [];

  for (const name of uniqueNames) {
    const entries = nameToEntries[name];
    const result = await findImage(name);

    if (!result) {
      stillMissing.push(name);
      notFound++;
      process.stdout.write(`  ✗ ${name}\n`);
      continue;
    }

    const localFilename = `${safeFilename(entries[0].faction)} - ${safeFilename(name)}.jpg`;
    const localPath = path.join(LOCAL_IMG_DIR, localFilename);

    const downloaded = await downloadImage(result.url, localPath);
    if (!downloaded) {
      stillMissing.push(name);
      notFound++;
      process.stdout.write(`  ✗ ${name} (download failed)\n`);
      continue;
    }

    found++;
    let unitUploaded = 0;
    for (const ws of entries) {
      const ok = await uploadImage(localPath, ws.id);
      if (ok) { unitUploaded++; uploaded++; }
    }
    process.stdout.write(`  ✓ ${name} [${result.filename}] [${unitUploaded}/${entries.length} uploaded]\n`);
  }

  console.log(`\n✅ Done.`);
  console.log(`   Found via guessing: ${found} / ${uniqueNames.length}`);
  console.log(`   Total uploads: ${uploaded}`);
  console.log(`   Still missing: ${notFound}`);
  if (stillMissing.length) {
    fs.writeFileSync('still-missing.txt', stillMissing.join('\n'));
    console.log(`   → saved to still-missing.txt`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
