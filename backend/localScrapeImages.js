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
const LOCAL_IMG_DIR  = path.join(__dirname, 'downloaded-images');

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
  const html = await res.text();

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
  let matched = 0, uploaded = 0, skipped = 0;

  for (const ws of warscrolls) {
    const key = normalizeName(ws.name);
    let imgUrl = imageMap[key];

    // Partial match fallback
    if (!imgUrl) {
      for (const [k, v] of Object.entries(imageMap)) {
        if (k.startsWith(key) || key.startsWith(k)) { imgUrl = v; break; }
      }
    }
    if (!imgUrl) continue;
    matched++;

    const localPath = path.join(LOCAL_IMG_DIR, `${ws.id}.jpg`);

    // Download if not already on disk
    if (!fs.existsSync(localPath)) {
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
        if (!imgRes.ok) {
          console.warn(`  ✗ Image download failed for "${ws.name}": HTTP ${imgRes.status}`);
          continue;
        }
        const buf = await imgRes.buffer();
        fs.writeFileSync(localPath, buf);
        await sleep(150);
      } catch (err) {
        console.warn(`  ✗ Download error for "${ws.name}": ${err.message}`);
        continue;
      }
    }

    // Upload to Railway
    const imgBuf = fs.readFileSync(localPath);
    try {
      const upRes = await fetch(`${RAILWAY_API}/api/unit-image/${ws.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
          'x-upload-secret': UPLOAD_SECRET,
        },
        body: imgBuf,
      });
      if (upRes.ok) {
        uploaded++;
        process.stdout.write(`  ✓ ${ws.name}\n`);
      } else {
        const txt = await upRes.text();
        console.warn(`  ✗ Upload failed for "${ws.name}": ${upRes.status} ${txt}`);
      }
    } catch (err) {
      console.warn(`  ✗ Upload error for "${ws.name}": ${err.message}`);
    }

    await sleep(50);
  }

  console.log(`\n✅ Done. Matched: ${matched}, Uploaded: ${uploaded}, Skipped: ${warscrolls.length - matched}`);
}

main().catch(err => { console.error(err); process.exit(1); });
