/**
 * localScrapeImagesWarhammer.js
 *
 * Scrapes unit images from warhammer.com and uploads to Railway.
 * Images land in unit-images/Warhammer/ on the volume (separate from Lexicanum/).
 * The server prefers Warhammer images over Lexicanum when both exist.
 *
 * Setup: same .env.local as localScrapeImages.js
 * Run:   node localScrapeImagesWarhammer.js
 *
 * On first run, product URLs are collected by browsing the shop (slow).
 * They are cached to warhammer-products.json — delete that file to re-crawl.
 */

require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const WARHAMMER_BASE = 'https://www.warhammer.com';
const AOS_SHOP_URL   = `${WARHAMMER_BASE}/en-US/shop/age-of-sigmar`;
const LOCAL_IMG_DIR  = path.join(__dirname, 'downloaded-images', 'Warhammer');
const PRODUCTS_CACHE = path.join(__dirname, 'warhammer-products.json');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const LOGIN_USER    = process.env.LOGIN_USER || '';
const LOGIN_PASS    = process.env.LOGIN_PASS || '';

if (!RAILWAY_API)   { console.error('Set RAILWAY_API_URL in .env.local'); process.exit(1); }
if (!UPLOAD_SECRET) { console.error('Set UPLOAD_SECRET in .env.local'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeName(str) {
  return str.toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9 ']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function stem(w) { return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w; }

function fuzzyWord(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let diffs = Math.abs(a.length - b.length);
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len && diffs <= 1; i++) { if (a[i] !== b[i]) diffs++; }
  return diffs <= 1;
}

function matchScore(a, b) {
  if (a === b) return 1;
  const sa = a.replace(/^the /, '');
  const sb = b.replace(/^the /, '');
  if (sa === sb) return 0.98;
  const [shorter, longer] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (longer.startsWith(shorter + ' of ')) return 0.95;
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
  const res = await fetch(`${RAILWAY_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN_USER, password: LOGIN_PASS }),
  });
  if (!res.ok) { console.warn('  Login failed'); return null; }
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

// Scroll the listing page and collect all product URLs + names + image URLs
async function collectProducts(page) {
  if (fs.existsSync(PRODUCTS_CACHE)) {
    console.log('📖 Reading cached warhammer-products.json...');
    const cached = JSON.parse(fs.readFileSync(PRODUCTS_CACHE, 'utf8'));
    console.log(`  ${cached.length} cached products`);
    return cached;
  }

  console.log(`🌐 Loading ${AOS_SHOP_URL} ...`);
  await page.goto(AOS_SHOP_URL, { waitUntil: 'networkidle2', timeout: 90000 });

  const products = [];   // { name, url, imgUrl }
  const seenUrls = new Set();
  let staleRounds = 0;

  while (staleRounds < 4) {
    // Grab all product cards currently in the DOM
    const cards = await page.$$eval('a[href*="/en-US/shop/"]', els =>
      els
        .filter(el => {
          const h = el.href;
          return h && !h.endsWith('/age-of-sigmar') && !h.includes('?') && !h.includes('#');
        })
        .map(el => {
          const img = el.querySelector('img');
          const nameEl = el.querySelector('h2, h3, [class*="product-name"], [class*="ProductName"], p');
          return {
            url: el.href,
            name: nameEl ? nameEl.textContent.trim() : '',
            imgUrl: img ? (img.src || img.dataset.src || '') : '',
          };
        })
    );

    let newFound = 0;
    for (const c of cards) {
      if (!seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        products.push(c);
        newFound++;
      }
    }

    if (newFound === 0) {
      staleRounds++;
    } else {
      staleRounds = 0;
    }

    // Try "Load More" button first, otherwise scroll
    const loadMore = await page.$('button[data-testid*="load"], button[class*="load-more"], button[class*="LoadMore"], [class*="load-more"] button');
    if (loadMore) {
      await loadMore.click();
      await sleep(2500);
    } else {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 4));
      await sleep(1800);
    }

    process.stdout.write(`\r  ${products.length} products found...`);
  }
  process.stdout.write('\n');

  fs.writeFileSync(PRODUCTS_CACHE, JSON.stringify(products, null, 2));
  console.log(`  Saved ${products.length} products to warhammer-products.json`);
  return products;
}

// If the listing-page thumbnail URL contains a size segment, swap it for 920x950
function upgradeImageUrl(imgUrl) {
  if (!imgUrl) return imgUrl;
  // Strip query params for cleaner download
  const base = imgUrl.split('?')[0];
  // Replace common thumbnail sizes with the large product size
  return base.replace(/\/\d{2,4}x\d{2,4}\//, '/920x950/');
}

async function downloadImage(imgUrl, localPath) {
  if (fs.existsSync(localPath)) return true;
  try {
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
        'Referer': WARHAMMER_BASE + '/',
      },
    });
    if (!res.ok) { console.warn(`  ✗ HTTP ${res.status}: ${imgUrl}`); return false; }
    const buf = await res.buffer();
    // Sanity check: must be a real image (>5 KB)
    if (buf.length < 5000) { console.warn(`  ✗ Too small (${buf.length}B), skipping: ${imgUrl}`); return false; }
    fs.writeFileSync(localPath, buf);
    return true;
  } catch (err) {
    console.warn(`  ✗ Download error: ${err.message}`);
    return false;
  }
}

async function uploadImage(localPath, railwayId) {
  const res = await fetch(`${RAILWAY_API}/api/unit-image/${railwayId}?source=warhammer`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
    body: fs.readFileSync(localPath),
  });
  return res.ok;
}

async function main() {
  if (!fs.existsSync(LOCAL_IMG_DIR)) fs.mkdirSync(LOCAL_IMG_DIR, { recursive: true });

  // 1. Collect products from warhammer.com
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  let whProducts;
  try {
    whProducts = await collectProducts(page);
  } finally {
    await browser.close();
  }

  // Build name → imgUrl map, upgrading thumbnail URLs to full-size
  const imageMap = {};
  for (const p of whProducts) {
    if (!p.name || !p.imgUrl) continue;
    const key = normalizeName(p.name);
    if (key && !imageMap[key]) {
      imageMap[key] = upgradeImageUrl(p.imgUrl);
    }
  }
  console.log(`\n🖼  ${Object.keys(imageMap).length} unique product images from listing`);

  // 2. Get warscrolls from Railway
  console.log('\n🔑 Logging in...');
  const jwt = await getJwt();
  if (!jwt) { console.error('Login failed'); process.exit(1); }

  console.log('📋 Fetching warscroll list...');
  const warscrolls = await fetchWarscrolls(jwt);
  console.log(`  ${warscrolls.length} warscrolls`);

  // 3. Match, download, upload
  const imageMapEntries = Object.entries(imageMap);
  let matched = 0, uploaded = 0;

  for (const ws of warscrolls) {
    const key = normalizeName(ws.name);
    let imgUrl = imageMap[key];
    let bestScore = imgUrl ? 1 : 0;

    if (!imgUrl) {
      for (const [k, v] of imageMapEntries) {
        const score = matchScore(key, k);
        if (score > bestScore) { bestScore = score; imgUrl = v; }
      }
    }
    if (!imgUrl || bestScore < 0.75) continue;
    matched++;

    const filename = `${safeFilename(ws.faction)} - ${safeFilename(ws.name)}.jpg`;
    const localPath = path.join(LOCAL_IMG_DIR, filename);

    const ok = await downloadImage(imgUrl, localPath);
    if (!ok) continue;

    try {
      const upOk = await uploadImage(localPath, ws.id);
      if (upOk) {
        uploaded++;
        const scoreStr = bestScore < 1 ? ` (match: ${Math.round(bestScore * 100)}%)` : '';
        process.stdout.write(`  ✓ ${ws.faction} - ${ws.name}${scoreStr}\n`);
      } else {
        console.warn(`  ✗ Upload failed: "${ws.name}"`);
      }
    } catch (err) {
      console.warn(`  ✗ Upload error for "${ws.name}": ${err.message}`);
    }
    await sleep(80);
  }

  console.log(`\n✅ Done. Matched: ${matched}, Uploaded: ${uploaded}, Skipped: ${warscrolls.length - matched}`);
}

main().catch(err => { console.error(err); process.exit(1); });
