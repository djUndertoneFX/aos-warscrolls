/**
 * localScrapeImagesLexicanumGuess2.js
 *
 * Second-pass Lexicanum CDN guesser for the ~98 units the first pass missed.
 * Adds patterns for: apostrophes, hyphens, weapon variants, Underworlds warband names.
 *
 * Run: node localScrapeImagesLexicanumGuess2.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const LEXICANUM_BASE = 'https://ageofsigmar.lexicanum.com';
const LOCAL_LEX_DIR  = path.join(__dirname, 'downloaded-images', 'Lexicanum');
const LOCAL_WAR_DIR  = path.join(__dirname, 'downloaded-images', 'Warhammer');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const LOGIN_USER    = process.env.LOGIN_USER || '';
const LOGIN_PASS    = process.env.LOGIN_PASS || '';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': LEXICANUM_BASE + '/',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function titleCase(str) {
  const lower = new Set(['of','on','the','a','an','and','in','to','with','for','at','by']);
  return str.split(' ').map((w, i) =>
    (i === 0 || !lower.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ');
}
function allCaps(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function mediaWikiImageUrl(filename) {
  const norm = filename.replace(/ /g, '_');
  const hash = crypto.createHash('md5').update(norm).digest('hex');
  return `${LEXICANUM_BASE}/mediawiki/images/${hash[0]}/${hash.slice(0, 2)}/${norm}`;
}

// Extended candidate generator — handles apostrophes, hyphens, weapon variants
function filenameCandidates(name) {
  const suffixes = [' 01.jpg', '_M01.jpg', ' M01.jpg', 'M01.jpg', ' AoS.jpg', ' AoS4.jpg', '.jpg', ' 1.jpg', '01.jpg'];
  const prefixes = ['', 'Pict '];
  const candidates = new Set();

  function addAll(base) {
    for (const pre of prefixes) {
      for (const suf of suffixes) {
        candidates.add(pre + base + suf);
      }
    }
  }

  // Basic forms
  addAll(titleCase(name));
  addAll(allCaps(name));

  // Strip leading "the "
  const noThe = name.replace(/^the /, '');
  if (noThe !== name) { addAll(titleCase(noThe)); addAll(allCaps(noThe)); }

  // Handle "X with Y" → "X" and "X With Y" and "X_With_Y"
  const withMatch = name.match(/^(.+?) with .+$/);
  if (withMatch) {
    const base = withMatch[1].trim();
    addAll(titleCase(base));
    addAll(allCaps(base));
    // Also the full name with "with" capitalised
    const fullWith = allCaps(name); // already added above, but ok
    addAll(fullWith);
  }

  // Strip possessives like "steelhearts" → "Steelheart's"
  // AoS unit names often drop apostrophes: e.g. "steelhearts champions" → "Steelheart's Champions"
  const possessiveRestored = name.replace(/(\w+)s (\w)/g, (m, word, next) => {
    // "steelhearts" → "Steelheart's", "morwaeths" → "Morgwaeth's"
    // Heuristic: if word ends in a proper-noun pattern, add apostrophe before s
    return word.charAt(0).toUpperCase() + word.slice(1) + "'s " + next.toUpperCase();
  });
  if (possessiveRestored !== name) {
    addAll(allCaps(possessiveRestored));
    addAll(titleCase(possessiveRestored));
  }

  // Handle concatenated names like "morathikhaine" → "Morathi-Khaine"
  // Try inserting a hyphen at every position
  const words = allCaps(name).split(' ');
  if (words.length === 1 && name.length > 8) {
    // Single word — try known splits
    const knownSplits = [
      ['morathikhaine', 'Morathi-Khaine'],
      ['khainemorathi', 'Khaine-Morathi'],
    ];
    for (const [raw, split] of knownSplits) {
      if (name.replace(/\s/g,'').toLowerCase() === raw) addAll(split);
    }
  }

  // Handle "allies of the free cities X" → strip prefix
  const allyMatch = name.match(/^allies of the free cities (.+)$/);
  if (allyMatch) {
    addAll(titleCase(allyMatch[1]));
    addAll(allCaps(allyMatch[1]));
  }

  // Handle "scourge of ghyran X" → strip prefix
  const scourgMatch = name.match(/^scourge of ghyran (.+)$/);
  if (scourgMatch) {
    addAll(titleCase(scourgMatch[1]));
    addAll(allCaps(scourgMatch[1]));
  }

  // First word and first two words shortcuts
  const firstWord = allCaps(name).split(' ')[0];
  const firstTwo  = allCaps(name).split(' ').slice(0,2).join(' ');
  for (const suf of suffixes) {
    candidates.add(firstWord + suf);
    if (firstTwo !== firstWord) candidates.add(firstTwo + suf);
  }

  return [...candidates];
}

async function findImage(unitName) {
  const candidates = filenameCandidates(unitName);
  for (const fn of candidates) {
    const url = mediaWikiImageUrl(fn);
    try {
      const r = await fetch(url, { method: 'HEAD', headers: HEADERS });
      if (r.ok) {
        const len = parseInt(r.headers.get('content-length') || '0');
        if (len > 5000) return { url, filename: fn };
      }
    } catch {}
    await sleep(60);
  }
  return null;
}

async function downloadImage(url, localPath) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) return false;
  const buf = await r.buffer();
  if (buf.length < 5000) return false;
  fs.writeFileSync(localPath, buf);
  return true;
}

async function uploadImage(localPath, railwayId) {
  const r = await fetch(`${RAILWAY_API}/api/unit-image/${railwayId}?source=lexicanum`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
    body: fs.readFileSync(localPath),
  });
  return r.ok;
}

function hasLocalImage(faction, name) {
  const base = `${safeFilename(faction)} - ${safeFilename(name)}.jpg`;
  if (fs.existsSync(path.join(LOCAL_WAR_DIR, base))) return true;
  if (fs.existsSync(path.join(LOCAL_LEX_DIR, base))) return true;
  return false;
}

async function getJwt() {
  const r = await fetch(`${RAILWAY_API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN_USER, password: LOGIN_PASS }),
  });
  const { token } = await r.json();
  return token;
}

async function fetchWarscrolls(jwt) {
  const all = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${RAILWAY_API}/api/warscrolls?page=${page}&pageSize=200`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await r.json();
    all.push(...data.data);
    if (page >= data.totalPages) break;
    page++;
  }
  return all;
}

async function main() {
  console.log('🔑 Logging in...');
  const jwt = await getJwt();
  console.log('📋 Fetching warscrolls...');
  const warscrolls = await fetchWarscrolls(jwt);

  // Load missing list
  const missingFile = path.join(__dirname, 'missing-images.txt');
  const missingNames = new Set(
    fs.readFileSync(missingFile, 'utf8').split('\n')
      .filter(l => l.startsWith('  '))
      .map(l => l.trim())
      .filter(Boolean)
  );

  const missing = warscrolls.filter(ws => missingNames.has(ws.name) && !hasLocalImage(ws.faction, ws.name));
  console.log(`\n🔍 Searching ${missing.length} units on Lexicanum CDN...\n`);

  let found = 0, notFound = 0;
  const stillMissing = [];

  for (const ws of missing) {
    if (hasLocalImage(ws.faction, ws.name)) continue;

    const result = await findImage(ws.name);
    if (result) {
      const localPath = path.join(LOCAL_LEX_DIR, `${safeFilename(ws.faction)} - ${safeFilename(ws.name)}.jpg`);
      const ok = await downloadImage(result.url, localPath);
      if (ok) {
        const uploaded = await uploadImage(localPath, ws.id);
        console.log(`  ✓ ${ws.faction} - ${ws.name}  [${result.filename}]${uploaded ? '' : ' (upload failed)'}`);
        found++;
      } else {
        stillMissing.push(ws.name);
        notFound++;
      }
    } else {
      process.stdout.write(`  ✗ ${ws.name}\n`);
      stillMissing.push(ws.name);
      notFound++;
    }
    await sleep(100);
  }

  console.log(`\n✅ Found: ${found} / ${found + notFound}`);
  if (stillMissing.length) {
    fs.writeFileSync(path.join(__dirname, 'still-missing-2.txt'), stillMissing.join('\n'));
    console.log(`📄 Still missing ${stillMissing.length} → still-missing-2.txt`);
  }
}

main().catch(console.error);
