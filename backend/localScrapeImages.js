/**
 * localScrapeImages.js
 *
 * Run this on your LOCAL machine (not Railway) where Lexicanum isn't blocked.
 * It will:
 *   1. Scrape ageofsigmar.lexicanum.com/wiki/List_of_units for unit images
 *   2. Fetch your warscroll list from the Railway API to get name→id mapping
 *   3. Download matched images locally to ./downloaded-images/
 *   4. Upload each image to your Railway backend via PUT /api/unit-image/:id
 *
 * Setup:
 *   Copy .env.local.example to .env.local and fill in the values, then:
 *   node localScrapeImages.js
 *
 * Env vars (in .env.local or just set in shell):
 *   RAILWAY_API_URL   — e.g. https://aos-warscrolls-production.up.railway.app
 *   UPLOAD_SECRET     — must match the UPLOAD_SECRET set in Railway Variables
 *   LOGIN_USER        — your app username
 *   LOGIN_PASS        — your app password
 */

require('dotenv').config({ path: '.env.local' });

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const LEXICANUM_BASE = 'https://ageofsigmar.lexicanum.com';
const LOCAL_IMG_DIR  = path.join(__dirname, 'downloaded-images', 'Lexicanum');

const RAILWAY_API    = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET  = process.env.UPLOAD_SECRET || '';
const LOGIN_USER     = process.env.LOGIN_USER || '';
const LOGIN_PASS     = process.env.LOGIN_PASS || '';

if (!RAILWAY_API)   { console.error('Set RAILWAY_API_URL in .env.local'); process.exit(1); }
if (!UPLOAD_SECRET) { console.error('Set UPLOAD_SECRET in .env.local'); process.exit(1); }

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'max-age=0',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9 ']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sanitize a string for use as a filename
function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

// Seasonal/title prefixes — strip these to find the base unit image
const TITLE_PREFIXES = [
  'scourge of ghyran',
];

// Stem a word: strip trailing 's' for basic singular/plural handling
function stem(w) { return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w; }

// Fuzzy single-word match: allow 1-char difference for words of length >= 5
function fuzzyWord(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let diffs = Math.abs(a.length - b.length);
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len && diffs <= 1; i++) { if (a[i] !== b[i]) diffs++; }
  return diffs <= 1;
}

// Score how well two normalized names match (0 = no match, 1 = exact)
function matchScore(a, b) {
  if (a === b) return 1;

  // Strip leading "the "
  const sa = a.replace(/^the /, '');
  const sb = b.replace(/^the /, '');
  if (sa === sb) return 0.98;

  // Containment: shorter is a prefix of longer + " of ..." (e.g. "Pink Horrors" → "Pink Horrors of Tzeentch")
  const [shorter, longer] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (longer.startsWith(shorter + ' of ')) return 0.95;

  // Stemmed word overlap — use symmetric F1-style scoring to prevent
  // short names falsely matching longer ones (e.g. "Flamers" ≠ "Exalted Flamer")
  const wordsA = [...new Set(sa.split(' ').filter(w => w.length > 2).map(stem))];
  const wordsB = [...new Set(sb.split(' ').filter(w => w.length > 2).map(stem))];
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.some(wb => fuzzyWord(w, wb))) shared++;
  }
  const precision = shared / wordsA.length;
  const recall    = shared / wordsB.length;
  if (precision === 0 || recall === 0) return 0;
  const f1 = 2 * precision * recall / (precision + recall);
  return f1 >= 0.75 ? f1 : 0;
}

async function getJwt() {
  if (!LOGIN_USER || !LOGIN_PASS) return null;
  const res = await fetch(`${RAILWAY_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN_USER, password: LOGIN_PASS }),
  });
  if (!res.ok) { console.warn('  Login failed — will skip Railway warscroll name fetch'); return null; }
  const { token } = await res.json();
  return token;
}

async function fetchWarscrolls(jwt) {
  // Fetch all warscrolls from Railway (paginated) to build name→id map
  const allUnits = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${RAILWAY_API}/api/warscrolls?page=${page}&pageSize=200`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    if (!res.ok) throw new Error(`Warscrolls fetch failed: ${res.status}`);
    const data = await res.json();
    allUnits.push(...data.data);
    if (page >= data.totalPages) break;
    page++;
  }
  return allUnits;
}

async function scrapeLexicanum() {
  // If a saved local copy exists, use it instead of fetching (avoids 403)
  const localFile = path.join(__dirname, 'list_of_units.html');
  let html;
  if (fs.existsSync(localFile)) {
    console.log('📖 Reading saved list_of_units.html...');
    html = fs.readFileSync(localFile, 'utf8');
  } else {
    console.log('📖 Fetching Lexicanum List_of_units...');
    const res = await fetch(`${LEXICANUM_BASE}/wiki/List_of_units`, {
      headers: {
        ...BROWSER_HEADERS,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      compress: true,
    });
    if (!res.ok) throw new Error(`Lexicanum HTTP ${res.status}`);
    html = await res.text();
  }

  const $ = cheerio.load(html);
  const imageMap = {};

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;

    const img = $(cells[0]).find('img').first();
    let imgSrc = img.attr('src') || img.attr('data-src') || '';
    if (imgSrc && !imgSrc.startsWith('http')) imgSrc = LEXICANUM_BASE + imgSrc;

    let unitName = $(cells[1]).text().trim() || $(cells[0]).text().trim();
    unitName = unitName.replace(/\s*\(.*?\)\s*/g, '').trim();

    if (unitName && imgSrc && imgSrc.includes('/mediawiki/')) {
      const key = normalizeName(unitName);
      if (key && !imageMap[key]) imageMap[key] = imgSrc;
    }
  });

  console.log(`  Found ${Object.keys(imageMap).length} image entries`);
  return imageMap;
}

async function main() {
  if (!fs.existsSync(LOCAL_IMG_DIR)) fs.mkdirSync(LOCAL_IMG_DIR, { recursive: true });

  // 1. Scrape Lexicanum
  const imageMap = await scrapeLexicanum();

  // 2. Get warscroll name→id from Railway
  console.log('\n🔑 Logging in to Railway API...');
  const jwt = await getJwt();
  if (!jwt) { console.error('Cannot continue without JWT'); process.exit(1); }

  console.log('📋 Fetching warscroll list from Railway...');
  const warscrolls = await fetchWarscrolls(jwt);
  console.log(`  Got ${warscrolls.length} warscrolls`);

  // 3. Match, download, upload
  let matched = 0, uploaded = 0;
  const imageMapEntries = Object.entries(imageMap);

  function findBestMatch(key) {
    let imgUrl = imageMap[key];
    let bestScore = imgUrl ? 1 : 0;
    if (!imgUrl) {
      for (const [k, v] of imageMapEntries) {
        const score = matchScore(key, k);
        if (score > bestScore) { bestScore = score; imgUrl = v; }
      }
    }
    return { imgUrl, bestScore };
  }

  function findImagesForUnit(wsName) {
    const key = normalizeName(wsName);

    // Split on " and " to handle combined units like "Blue Horrors and Brimstone Horrors"
    const parts = key.split(' and ');
    if (parts.length > 1) {
      const results = parts.map(p => findBestMatch(p.trim())).filter(r => r.imgUrl);
      if (results.length > 0) return results;
    }

    // Single match
    let result = findBestMatch(key);

    // Title prefix fallback
    if (!result.imgUrl) {
      for (const prefix of TITLE_PREFIXES) {
        if (key.startsWith(prefix + ' ')) {
          result = findBestMatch(key.slice(prefix.length + 1));
          if (result.imgUrl) { result.bestScore = Math.min(result.bestScore, 0.9); break; }
        }
      }
    }

    return result.imgUrl ? [result] : [];
  }

  async function downloadImage(imgUrl, localPath) {
    if (fs.existsSync(localPath)) return true;
    try {
      const imgRes = await fetch(imgUrl, {
        headers: {
          ...BROWSER_HEADERS,
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': `${LEXICANUM_BASE}/wiki/List_of_units`,
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'same-origin',
        },
        compress: true,
      });
      if (!imgRes.ok) { console.warn(`  ✗ Download HTTP ${imgRes.status}: ${imgUrl}`); return false; }
      fs.writeFileSync(localPath, await imgRes.buffer());
      await sleep(150);
      return true;
    } catch (err) {
      console.warn(`  ✗ Download error: ${err.message}`);
      return false;
    }
  }

  async function uploadImage(localPath, railwayId, slot) {
    // slot 0 → {id}.jpg, slot 1+ → {id}_{slot}.jpg
    const suffix = slot === 0 ? '' : `_${slot}`;
    const upRes = await fetch(`${RAILWAY_API}/api/unit-image/${railwayId}${suffix ? `?slot=${slot}` : ''}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
      body: fs.readFileSync(localPath),
    });
    return upRes.ok;
  }

  for (const ws of warscrolls) {
    const matches = findImagesForUnit(ws.name);
    if (matches.length === 0) continue;
    matched++;

    const baseName = `${safeFilename(ws.faction)} - ${safeFilename(ws.name)}`;
    let anyUploaded = false;

    for (let i = 0; i < matches.length; i++) {
      const { imgUrl, bestScore } = matches[i];
      const suffix = matches.length > 1 ? `_${i}` : '';
      const localPath = path.join(LOCAL_IMG_DIR, `${baseName}${suffix}.jpg`);

      const ok = await downloadImage(imgUrl, localPath);
      if (!ok) continue;

      try {
        const upOk = await uploadImage(localPath, ws.id, i);
        if (upOk) {
          anyUploaded = true;
        } else {
          console.warn(`  ✗ Upload failed for "${ws.name}" slot ${i}`);
        }
      } catch (err) {
        console.warn(`  ✗ Upload error for "${ws.name}": ${err.message}`);
      }
      await sleep(50);
    }

    if (anyUploaded) {
      uploaded++;
      const scoreStr = matches[0].bestScore < 1 ? ` (match: ${Math.round(matches[0].bestScore*100)}%)` : '';
      const multi = matches.length > 1 ? ` [${matches.length} images]` : '';
      process.stdout.write(`  ✓ ${ws.faction} - ${ws.name}${scoreStr}${multi}\n`);
    }
  }

  console.log(`\n✅ Done. Matched: ${matched}, Uploaded: ${uploaded}, Skipped: ${warscrolls.length - matched}`);
}

main().catch(err => { console.error(err); process.exit(1); });
