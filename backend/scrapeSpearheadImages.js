/**
 * scrapeSpearheadImages.js
 *
 * Downloads cover art for each AoS Spearhead box from Warhammer.com
 * using the Algolia product catalog, then uploads them to Railway.
 *
 * Setup: create .env.local with:
 *   RAILWAY_API_URL=https://your-app.railway.app
 *   UPLOAD_SECRET=your-secret
 *   LOGIN_USER=your-login
 *   LOGIN_PASS=your-password
 *
 * Run: node scrapeSpearheadImages.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const WARHAMMER_BASE   = 'https://www.warhammer.com';
const ALGOLIA_PRODUCTS = path.join(__dirname, 'algolia-all-products.json');
const LOCAL_IMG_DIR    = path.join(__dirname, 'downloaded-images', 'Spearhead');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';

if (!RAILWAY_API)   { console.error('Set RAILWAY_API_URL in .env.local'); process.exit(1); }
if (!UPLOAD_SECRET) { console.error('Set UPLOAD_SECRET in .env.local'); process.exit(1); }

// All 47 spearhead names — used to match against GW product catalog
const SPEARHEAD_NAMES = [
  'Castelite Company',
  'Fusil-Platoon',
  "Zenestra's Zealots",
  'Heartflayer Troupe',
  'Khainite Shadow Coven',
  'Saga Axeband',
  'Akhelian Tide Guard',
  'Soulraid Hunt',
  'Grundstok Trailblazers',
  'Skyhammer Task Force',
  'Glittering Phalanx',
  'Hurakan Vanguard',
  'Starscale Warhost',
  'Sunblooded Prowlers',
  "Yndrasta's Spearhead",
  'Vigilant Brotherhood',
  'Bitterbark Copse',
  'Spitewing Flight',
  'Fangs of the Blood God',
  'Gore Pilgrims',
  'Fluxblade Coven',
  'Tzaangor Warflock',
  'Blades of The Lurid Dream',
  'Epicurean Revellers',
  'Bleak Host',
  'Bubonic Cell',
  'Gnawfeast Clawpack',
  'Warpspark Clawpack',
  'Bloodwind Legion',
  'Darkoath Raiders',
  'Carrion Retainers',
  'Charnel Watch',
  'Cursed Shacklehorde',
  'Slasher Host',
  'Kavalos Vanguard',
  'Mortisan Elite',
  'Tithe-Reaper Echelon',
  'Bloodcrave Hunt',
  'Deathrattle Tomb Host',
  'Bad Moon Madmob',
  'Snarlpack Huntaz',
  'Ironjawz Bigmob',
  'Swampskulka Gang',
  'Scrapglutt',
  "Tyrant's Bellow",
  'Wallsmasher Stomp',
  'Helforge Host',
];

function normalize(str) {
  return str.toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9 ']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stem(w) { return w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w; }

function matchScore(a, b) {
  if (a === b) return 1;
  const sa = a.replace(/^the /, '');
  const sb = b.replace(/^the /, '');
  if (sa === sb) return 0.98;
  const wordsA = [...new Set(sa.split(' ').filter(w => w.length > 2).map(stem))];
  const wordsB = [...new Set(sb.split(' ').filter(w => w.length > 2).map(stem))];
  if (wordsA.length === 0) return 0;
  let shared = 0;
  for (const w of wordsA) { if (wordsB.includes(w)) shared++; }
  const precision = shared / wordsA.length;
  const recall    = wordsB.length > 0 ? shared / wordsB.length : 0;
  if (precision === 0 || recall === 0) return 0;
  return 2 * precision * recall / (precision + recall);
}

function upgradeImageUrl(imgUrl) {
  if (!imgUrl) return imgUrl;
  return imgUrl.split('?')[0].replace(/\/\d{2,4}x\d{2,4}\//, '/920x950/');
}

async function downloadImage(imgUrl, localPath) {
  if (fs.existsSync(localPath)) { console.log(`  (cached)`); return true; }
  try {
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
        'Referer': WARHAMMER_BASE + '/',
      },
    });
    if (!res.ok) { console.warn(`  ✗ HTTP ${res.status}: ${imgUrl}`); return false; }
    const buf = await res.buffer();
    if (buf.length < 5000) { console.warn(`  ✗ Too small (${buf.length}B)`); return false; }
    fs.writeFileSync(localPath, buf);
    return true;
  } catch (err) {
    console.warn(`  ✗ Download error: ${err.message}`);
    return false;
  }
}

async function uploadImage(localPath, spName) {
  const encoded = encodeURIComponent(spName);
  const res = await fetch(`${RAILWAY_API}/api/spearhead-image/${encoded}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
    body: fs.readFileSync(localPath),
  });
  if (!res.ok) { console.warn(`  ✗ Upload failed: ${res.status}`); return false; }
  return true;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(LOCAL_IMG_DIR)) fs.mkdirSync(LOCAL_IMG_DIR, { recursive: true });

  // Load Algolia product catalog
  if (!fs.existsSync(ALGOLIA_PRODUCTS)) {
    console.log('algolia-all-products.json not found — fetching from Algolia...');
    const { execSync } = require('child_process');
    execSync('node fetchAlgoliaProducts.js', { stdio: 'inherit' });
  }
  const hits = JSON.parse(fs.readFileSync(ALGOLIA_PRODUCTS, 'utf8'));
  console.log(`📖 ${hits.length} products loaded from Algolia`);

  // Build product image map: normalized name → { name, imgUrl }
  const products = [];
  for (const p of hits) {
    if (!p.name || !p.images?.length) continue;
    const imgUrl = upgradeImageUrl(`${WARHAMMER_BASE}${p.images[0]}`);
    products.push({ name: p.name, norm: normalize(p.name), imgUrl });
  }
  console.log(`🖼  ${products.length} products with images\n`);

  let downloaded = 0, uploaded = 0, skipped = 0;

  for (const spName of SPEARHEAD_NAMES) {
    const slug = nameSlug(spName);
    const localPath = path.join(LOCAL_IMG_DIR, `${slug}.jpg`);
    console.log(`\n▶ ${spName}`);

    // Already uploaded?
    if (fs.existsSync(localPath)) {
      console.log(`  Cached locally — re-uploading...`);
      const ok = await uploadImage(localPath, spName);
      if (ok) { uploaded++; console.log(`  ✓ Uploaded`); } else skipped++;
      continue;
    }

    // Find best matching product
    const normSp = normalize(spName);
    let best = null, bestScore = 0;
    for (const p of products) {
      const s = matchScore(normSp, p.norm);
      if (s > bestScore) { bestScore = s; best = p; }
    }

    if (!best || bestScore < 0.4) {
      console.log(`  ✗ No product match found (best: ${best?.name ?? 'none'}, score: ${bestScore.toFixed(2)})`);
      skipped++;
      continue;
    }

    console.log(`  → "${best.name}" (score: ${bestScore.toFixed(2)})`);
    console.log(`  → ${best.imgUrl}`);

    const ok = await downloadImage(best.imgUrl, localPath);
    if (!ok) { skipped++; continue; }
    downloaded++;

    const uploadOk = await uploadImage(localPath, spName);
    if (uploadOk) { uploaded++; console.log(`  ✓ Uploaded`); } else skipped++;

    await sleep(400); // polite delay
  }

  console.log(`\n✅ Done — downloaded: ${downloaded}, uploaded: ${uploaded}, skipped: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
