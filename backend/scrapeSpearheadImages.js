/**
 * scrapeSpearheadImages.js
 *
 * Downloads cover art for each AoS Spearhead box from Warhammer.com
 * using the Algolia product catalog, then uploads them to Railway.
 *
 * Setup: create .env.local with:
 *   RAILWAY_API_URL=https://your-app.railway.app
 *   UPLOAD_SECRET=your-secret
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

// Manual overrides: spearhead name → Algolia product name
// Used for spearheads that share a faction-level box (no individual product listing)
// and for cases where fuzzy matching picks the wrong product.
const MANUAL_PRODUCT_MAP = {
  'Saga Axeband':         'Spearhead: Fyreslayers',
  'Bloodwind Legion':     'Spearhead: Slaves to Darkness',
  'Gnawfeast Clawpack':   'Spearhead: Skaven',
  'Warpspark Clawpack':   'Spearhead: Skaven',
  'Swampskulka Gang':     'Spearhead: Orruk Warclans',
};

// Spearheads to skip (no GW product found in catalog yet)
const NO_PRODUCT = new Set([
  'Castelite Company',
  'Fusil-Platoon',
  'Heartflayer Troupe',
  'Soulraid Hunt',
  'Skyhammer Task Force',
  'Glittering Phalanx',
  'Starscale Warhost',
  "Yndrasta's Spearhead",
  'Vigilant Brotherhood',
  'Bitterbark Copse',
  'Fluxblade Coven',
  'Blades of The Lurid Dream',
  'Gore Pilgrims',
  'Bleak Host',
  'Carrion Retainers',
  'Slasher Host',
  'Mortisan Elite',
  'Tithe-Reaper Echelon',
  'Bloodcrave Hunt',
  'Bad Moon Madmob',
  'Scrapglutt',
  "Tyrant's Bellow",
  'Wallsmasher Stomp',
]);

// All 47 spearhead names
const SPEARHEAD_NAMES = [
  'Castelite Company', 'Fusil-Platoon', "Zenestra's Zealots",
  'Heartflayer Troupe', 'Khainite Shadow Coven',
  'Saga Axeband',
  'Akhelian Tide Guard', 'Soulraid Hunt',
  'Grundstok Trailblazers', 'Skyhammer Task Force',
  'Glittering Phalanx', 'Hurakan Vanguard',
  'Starscale Warhost', 'Sunblooded Prowlers',
  "Yndrasta's Spearhead", 'Vigilant Brotherhood',
  'Bitterbark Copse', 'Spitewing Flight',
  'Fangs of the Blood God', 'Gore Pilgrims',
  'Fluxblade Coven', 'Tzaangor Warflock',
  'Blades of The Lurid Dream', 'Epicurean Revellers',
  'Bleak Host', 'Bubonic Cell',
  'Gnawfeast Clawpack', 'Warpspark Clawpack',
  'Bloodwind Legion', 'Darkoath Raiders',
  'Carrion Retainers', 'Charnel Watch',
  'Cursed Shacklehorde', 'Slasher Host',
  'Kavalos Vanguard', 'Mortisan Elite', 'Tithe-Reaper Echelon',
  'Bloodcrave Hunt', 'Deathrattle Tomb Host',
  'Bad Moon Madmob', 'Snarlpack Huntaz',
  'Ironjawz Bigmob', 'Swampskulka Gang',
  'Scrapglutt', "Tyrant's Bellow",
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

// Extract the spearhead name portion from "Spearhead: Faction – Name" strings
function extractSpearheadName(productName) {
  const m = productName.match(/–\s*(.+)$/);
  return m ? m[1].trim() : null;
}

function upgradeImageUrl(imgUrl) {
  if (!imgUrl) return imgUrl;
  return imgUrl.split('?')[0].replace(/\/\d{2,4}x\d{2,4}\//, '/920x950/');
}

async function downloadImage(imgUrl, localPath) {
  if (fs.existsSync(localPath)) { console.log('  (cached locally)'); return true; }
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
  if (!res.ok) { console.warn(`  ✗ Upload failed: ${res.status} ${await res.text()}`); return false; }
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

  // Build product name → imgUrl map (only products with images)
  const productMap = new Map();
  for (const p of hits) {
    if (!p.name || !p.images?.length) continue;
    const imgUrl = upgradeImageUrl(`${WARHAMMER_BASE}${p.images[0]}`);
    productMap.set(p.name, imgUrl);
  }

  // Build two lookup structures for spearhead products:
  // 1. spearheadSubname → product name (from "Spearhead: Faction – SubName")
  // 2. faction-level spearhead products (no " – " in name)
  const spearheadBySubname = new Map(); // e.g. "Charnel Watch" → "Spearhead: Flesh-eater Courts – Charnel Watch"
  const spearheadByFull    = new Map(); // e.g. "Spearhead: Fyreslayers" → imgUrl

  for (const [name] of productMap) {
    if (!name.toLowerCase().startsWith('spearhead:')) continue;
    const subname = extractSpearheadName(name);
    if (subname) {
      spearheadBySubname.set(subname.toLowerCase(), name);
    } else {
      spearheadByFull.set(name, name);
    }
  }

  console.log(`  ${spearheadBySubname.size} named spearhead products found`);
  console.log(`  ${spearheadByFull.size} faction-level spearhead boxes found\n`);

  let downloaded = 0, uploaded = 0, skipped = 0;

  for (const spName of SPEARHEAD_NAMES) {
    const slug = nameSlug(spName);
    const localPath = path.join(LOCAL_IMG_DIR, `${slug}.jpg`);
    console.log(`\n▶ ${spName}`);

    // Skip known missing ones
    if (NO_PRODUCT.has(spName)) {
      console.log('  — No GW product found in catalog, skipping');
      skipped++;
      continue;
    }

    // Find the right product:
    // 1. Check manual override
    // 2. Try exact subname match from "Spearhead: Faction – SubName"
    // 3. Try case-insensitive subname match
    let productName = null;

    if (MANUAL_PRODUCT_MAP[spName]) {
      productName = MANUAL_PRODUCT_MAP[spName];
    } else {
      productName = spearheadBySubname.get(spName.toLowerCase())
        ?? [...spearheadBySubname.entries()].find(([k]) => k.includes(spName.toLowerCase()))?.[1];
    }

    if (!productName) {
      console.log('  — No product match found');
      skipped++;
      continue;
    }

    const imgUrl = productMap.get(productName);
    if (!imgUrl) {
      console.log(`  — Product found but no image: "${productName}"`);
      skipped++;
      continue;
    }

    console.log(`  → "${productName}"`);
    console.log(`  → ${imgUrl}`);

    const ok = await downloadImage(imgUrl, localPath);
    if (!ok) { skipped++; continue; }
    downloaded++;

    const uploadOk = await uploadImage(localPath, spName);
    if (uploadOk) { uploaded++; console.log('  ✓ Uploaded'); } else skipped++;

    await sleep(300);
  }

  console.log(`\n✅ Done — downloaded: ${downloaded}, uploaded: ${uploaded}, skipped: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
