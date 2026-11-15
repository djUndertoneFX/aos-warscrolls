/**
 * uploadEndlessSpellImages.js
 *
 * GW sells endless spells as faction box sets, not individually.
 * Maps each missing endless spell warscroll to its faction box set image
 * and uploads that as the unit image.
 *
 * Run: node uploadEndlessSpellImages.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');

const WARHAMMER_BASE = 'https://www.warhammer.com';
const LOCAL_IMG_DIR  = path.join(__dirname, 'downloaded-images', 'Warhammer');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const LOGIN_USER    = process.env.LOGIN_USER || '';
const LOGIN_PASS    = process.env.LOGIN_PASS || '';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

// Map from endless spell / terrain name → warhammer.com image path
// Only URLs confirmed in the Algolia catalog (live products). Factions whose
// box sets are discontinued are omitted — those spells will stay imageless.
const SPELL_IMAGE_MAP = {
  // Daughters of Khaine
  'bladewind':                     '/app/resources/catalog/product/920x950/99120212026_DoKEndlessSpellsLead.jpg',
  'heart of fury':                 '/app/resources/catalog/product/920x950/99120212026_DoKEndlessSpellsLead.jpg',
  'bloodwrack viper':              '/app/resources/catalog/product/920x950/99120212026_DoKEndlessSpellsLead.jpg',

  // Disciples of Tzeentch
  'burning sigil of tzeentch':     '/app/resources/catalog/product/920x950/99120201112_DoTSpells01.jpg',
  'daemonic simulacrum':           '/app/resources/catalog/product/920x950/99120201112_DoTSpells01.jpg',
  'tome of eyes':                  '/app/resources/catalog/product/920x950/99120201112_DoTSpells01.jpg',

  // Flesh-eater Courts
  'cadaverous barricade':          '/app/resources/catalog/product/920x950/99120207071_FECEndlessSpells01.jpg',
  'chalice of ushoran':            '/app/resources/catalog/product/920x950/99120207071_FECEndlessSpells01.jpg',
  'corpsemare stampede':           '/app/resources/catalog/product/920x950/99120207071_FECEndlessSpells01.jpg',

  // Gloomspite Gitz
  'malevolent moon':               '/app/resources/catalog/product/920x950/99120209061_EndlessSpellsGloomspiteGitz01.jpg',
  'morks mighty mushroom':         '/app/resources/catalog/product/920x950/99120209061_EndlessSpellsGloomspiteGitz01.jpg',
  'scrapskuttles arachnacauldron': '/app/resources/catalog/product/920x950/99120209061_EndlessSpellsGloomspiteGitz01.jpg',
  'scuttletide':                   '/app/resources/catalog/product/920x950/99120209061_EndlessSpellsGloomspiteGitz01.jpg',

  // Hedonites of Slaanesh
  'dreadful visage':               '/app/resources/catalog/product/920x950/99120299059_CITDoSHedonitesofSlaaneshEndlessSpells01.jpg',
  'mesmerising mirror':            '/app/resources/catalog/product/920x950/99120299059_CITDoSHedonitesofSlaaneshEndlessSpells01.jpg',
  'wheels of excrutiation':        '/app/resources/catalog/product/920x950/99120299059_CITDoSHedonitesofSlaaneshEndlessSpells01.jpg',

  // Lumineth Realm-lords
  'hyshian twinstones':            '/app/resources/catalog/product/920x950/99120210034_LRLEndlessSpellsLead.jpg',
  'rune of petrification':         '/app/resources/catalog/product/920x950/99120210034_LRLEndlessSpellsLead.jpg',
  'sanctum of amyntok':            '/app/resources/catalog/product/920x950/99120210034_LRLEndlessSpellsLead.jpg',
  'myaris purifiers':              '/app/resources/catalog/product/920x950/99120210034_LRLEndlessSpellsLead.jpg',

  // Nighthaunt
  'mortalis terminexus':           '/app/resources/catalog/product/920x950/99120207053_NHEndlessSpellsUpdateLead.jpg',
  'nexus of grief':                '/app/resources/catalog/product/920x950/99120207053_NHEndlessSpellsUpdateLead.jpg',
  'shyish reaper':                 '/app/resources/catalog/product/920x950/99120207053_NHEndlessSpellsUpdateLead.jpg',
  'vault of souls':                '/app/resources/catalog/product/920x950/99120207053_NHEndlessSpellsUpdateLead.jpg',
  'the headsmens curse':           '/app/resources/catalog/product/920x950/99120207053_NHEndlessSpellsUpdateLead.jpg',

  // Ossiarch Bonereapers
  'bonetithe shrieker':            '/app/resources/catalog/product/920x950/99120207082_CITOBREndlessSpells01.jpg',
  'nightmare predator':            '/app/resources/catalog/product/920x950/99120207082_CITOBREndlessSpells01.jpg',
  'soulstealer carrion':           '/app/resources/catalog/product/920x950/99120207082_CITOBREndlessSpells01.jpg',
  'thanateks tithe':               '/app/resources/catalog/product/920x950/99120207082_CITOBREndlessSpells01.jpg',
  'the grand necromystic':         '/app/resources/catalog/product/920x950/99120207082_CITOBREndlessSpells01.jpg',

  // Skaven
  'bell of doom':                  '/app/resources/catalog/product/920x950/99120206029_SKAEndlessSpells01.jpg',
  'vermintide':                    '/app/resources/catalog/product/920x950/99120206029_SKAEndlessSpells01.jpg',
  'warp lightning vortex':         '/app/resources/catalog/product/920x950/99120206029_SKAEndlessSpells01.jpg',
  'warpfire throwers':             '/app/resources/catalog/product/920x950/99120206029_SKAEndlessSpells01.jpg',
  'warpvolt scourgers':            '/app/resources/catalog/product/920x950/99120206029_SKAEndlessSpells01.jpg',

  // Slaves to Darkness
  'darkfire daemonrift':           '/app/resources/catalog/product/920x950/99120201111_S2DEndlessSpells01.jpg',
  'eightfold doomsigil':           '/app/resources/catalog/product/920x950/99120201111_S2DEndlessSpells01.jpg',
  'realmscourge rupture':          '/app/resources/catalog/product/920x950/99120201111_S2DEndlessSpells01.jpg',

  // Stormcast Eternals
  'celestian vortex':              '/app/resources/catalog/product/920x950/99120218032_StormcastBattleMagic01.jpg',
  'dais arcanum':                  '/app/resources/catalog/product/920x950/99120218032_StormcastBattleMagic01.jpg',
  'everblaze comet':            '/app/resources/catalog/product/920x950/99120218032_StormcastBattleMagic01.jpg',

  // Sylvaneth
  'gladewyrm':                  '/app/resources/catalog/product/920x950/99120204024_SYLEndlessSpells01.jpg',
  'spiteswarm hive':            '/app/resources/catalog/product/920x950/99120204024_SYLEndlessSpells01.jpg',
  'vengeful skullroot':         '/app/resources/catalog/product/920x950/99120204024_SYLEndlessSpells01.jpg',
};

async function downloadImage(imgUrl, localPath) {
  if (fs.existsSync(localPath)) return true;
  try {
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
        'Referer': WARHAMMER_BASE + '/',
      },
    });
    if (!res.ok) { console.warn(`  HTTP ${res.status}: ${imgUrl}`); return false; }
    const buf = await res.buffer();
    if (buf.length < 5000) return false;
    fs.writeFileSync(localPath, buf);
    return true;
  } catch (err) { console.warn(`  Download error: ${err.message}`); return false; }
}

async function uploadImage(localPath, railwayId) {
  const res = await fetch(`${RAILWAY_API}/api/unit-image/${railwayId}?source=warhammer`, {
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

async function main() {
  if (!fs.existsSync(LOCAL_IMG_DIR)) fs.mkdirSync(LOCAL_IMG_DIR, { recursive: true });

  console.log('🔑 Logging in...');
  const jwt = await getJwt();
  console.log('📋 Fetching warscrolls...');
  const warscrolls = await fetchWarscrolls(jwt);

  // Cache downloaded box images by image path to avoid re-downloading
  const imageCache = {};

  let uploaded = 0, skipped = 0;

  for (const ws of warscrolls) {
    const imgPath = SPELL_IMAGE_MAP[ws.name];
    if (!imgPath) continue;

    // Check if already has an image locally
    const localFilename = `${safeFilename(ws.faction)} - ${safeFilename(ws.name)}.jpg`;
    const localPath = path.join(LOCAL_IMG_DIR, localFilename);
    if (fs.existsSync(localPath)) { skipped++; continue; }

    // Download the box image once, reuse for each spell variant
    const imgUrl = WARHAMMER_BASE + imgPath;
    if (!imageCache[imgPath]) {
      // Download to a shared cache file
      const cachePath = path.join(LOCAL_IMG_DIR, '_cache_' + path.basename(imgPath));
      const ok = await downloadImage(imgUrl, cachePath);
      if (!ok) { console.warn(`  ✗ Could not download: ${imgUrl}`); continue; }
      imageCache[imgPath] = cachePath;
      await sleep(200);
    }

    // Copy cache file to the unit-specific path
    fs.copyFileSync(imageCache[imgPath], localPath);

    const ok = await uploadImage(localPath, ws.id);
    if (ok) {
      uploaded++;
      process.stdout.write(`  ✓ ${ws.faction} - ${ws.name}\n`);
    } else {
      console.warn(`  ✗ Upload failed: ${ws.name}`);
    }
    await sleep(100);
  }

  console.log(`\n✅ Done. Uploaded: ${uploaded}, Skipped (already had image): ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
