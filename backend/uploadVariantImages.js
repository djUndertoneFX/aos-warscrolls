/**
 * uploadVariantImages.js
 *
 * Quick-win: for warscrolls whose image is missing but a closely-named variant
 * already exists locally, copy and upload that image.
 *
 * Handles two cases:
 *   1. "Scourge of Ghyran X" → reuse image for "X"
 *   2. Weapon/mount variants ("X with Y", "X on Y", "X 1 model") → reuse image for "X"
 *
 * Run: node uploadVariantImages.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const LOGIN_USER    = process.env.LOGIN_USER || '';
const LOGIN_PASS    = process.env.LOGIN_PASS || '';

const WH_DIR  = path.join(__dirname, 'downloaded-images', 'Warhammer');
const LEX_DIR = path.join(__dirname, 'downloaded-images', 'Lexicanum');

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function findLocalImage(faction, name) {
  const base = `${safeFilename(faction)} - ${safeFilename(name)}.jpg`;
  const wh  = path.join(WH_DIR,  base);
  const lex = path.join(LEX_DIR, base);
  if (fs.existsSync(wh))  return wh;
  if (fs.existsSync(lex)) return lex;
  return null;
}

function baseName(name) {
  // Strip "scourge of ghyran " prefix
  let n = name.replace(/^scourge of ghyran /, '');
  // Strip weapon/mount/size suffixes: " with ...", " on ...", " 1 model"
  n = n.replace(/ (with|on) .+$/, '').replace(/ \d+ model$/, '').trim();
  return n;
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

async function uploadImage(localPath, railwayId, source) {
  const res = await fetch(`${RAILWAY_API}/api/unit-image/${railwayId}?source=${source}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
    body: fs.readFileSync(localPath),
  });
  return res.ok;
}

async function main() {
  console.log('🔑 Logging in...');
  const jwt = await getJwt();
  console.log('📋 Fetching warscrolls...');
  const warscrolls = await fetchWarscrolls(jwt);
  console.log(`  ${warscrolls.length} warscrolls`);

  let uploaded = 0, skipped = 0;

  for (const ws of warscrolls) {
    // Already has an image?
    if (findLocalImage(ws.faction, ws.name)) continue;

    const base = baseName(ws.name);
    if (base === ws.name) continue; // no transformation possible

    // Look for the base unit image
    const srcPath = findLocalImage(ws.faction, base);
    if (!srcPath) continue;

    const source = srcPath.includes('Warhammer') ? 'warhammer' : 'lexicanum';
    const ok = await uploadImage(srcPath, ws.id, source);
    if (ok) {
      uploaded++;
      console.log(`  ✓ ${ws.faction} - ${ws.name}  (from: ${base})`);
    } else {
      console.warn(`  ✗ Upload failed: ${ws.faction} - ${ws.name}`);
    }
  }

  console.log(`\n✅ Done. Uploaded: ${uploaded}`);
}

main().catch(err => { console.error(err); process.exit(1); });
