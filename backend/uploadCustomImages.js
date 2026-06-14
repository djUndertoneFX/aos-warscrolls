/**
 * uploadCustomImages.js
 *
 * Scans downloaded-images/custom/ (recursively) for "Faction - Unit Name.jpg" files
 * and uploads them to the Railway volume under unit-images/Custom/.
 *
 * Naming convention: "Faction - Unit Name.jpg" (same as Warhammer/ and Lexicanum/).
 * Subfolders are allowed for source tracking — they're ignored when matching unit names.
 *
 * Run: node uploadCustomImages.js
 * Add --dry-run to preview without uploading.
 */

require('dotenv').config({ path: '.env.local' });
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');

const CUSTOM_DIR  = path.join(__dirname, 'downloaded-images', 'custom');
const RAILWAY_API = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';
const LOGIN_USER    = process.env.LOGIN_USER || '';
const LOGIN_PASS    = process.env.LOGIN_PASS || '';
const DRY_RUN = process.argv.includes('--dry-run');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function nameSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^-+|-+$/g, '');
}

// Recursively find all .jpg files under a directory
function findJpegs(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJpegs(full, results);
    else if (entry.name.endsWith('.jpg') || entry.name.endsWith('.jpeg')) results.push(full);
  }
  return results;
}

async function getJwt() {
  const r = await fetch(`${RAILWAY_API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN_USER, password: LOGIN_PASS }),
  });
  if (!r.ok) throw new Error('Login failed');
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
  if (!fs.existsSync(CUSTOM_DIR)) {
    console.log('No downloaded-images/custom/ folder found. Nothing to upload.');
    return;
  }

  console.log('🔑 Logging in...');
  const jwt = await getJwt();
  console.log('📋 Fetching warscrolls...');
  const warscrolls = await fetchWarscrolls(jwt);

  // Build lookup: slug → warscroll
  const bySlug = new Map();
  for (const ws of warscrolls) {
    bySlug.set(nameSlug(ws.name), ws);
  }

  const files = findJpegs(CUSTOM_DIR);
  if (files.length === 0) {
    console.log('No .jpg files found in downloaded-images/custom/');
    return;
  }

  console.log(`\n📁 Found ${files.length} image(s) in custom/\n`);

  let uploaded = 0, skipped = 0, unmatched = 0;

  for (const filePath of files) {
    const basename = path.basename(filePath, path.extname(filePath)); // "Faction - Unit Name"
    const parts = basename.match(/^(.+?) - (.+)$/);
    if (!parts) {
      console.warn(`  ⚠ Can't parse filename: ${path.relative(CUSTOM_DIR, filePath)}`);
      unmatched++;
      continue;
    }

    const [, , unitName] = parts;
    const slug = nameSlug(unitName);
    const ws = bySlug.get(slug);

    if (!ws) {
      console.warn(`  ✗ No warscroll match for: "${unitName}" (slug: ${slug})`);
      unmatched++;
      continue;
    }

    const rel = path.relative(CUSTOM_DIR, filePath);
    if (DRY_RUN) {
      console.log(`  [dry-run] ${rel}  →  ${ws.faction} - ${ws.name} (id ${ws.id})`);
      skipped++;
      continue;
    }

    const r = await fetch(`${RAILWAY_API}/api/unit-image/${ws.id}?source=custom`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
      body: fs.readFileSync(filePath),
    });

    if (r.ok) {
      console.log(`  ✓ ${rel}  →  ${ws.faction} - ${ws.name}`);
      uploaded++;
    } else {
      console.warn(`  ✗ Upload failed (${r.status}): ${rel}`);
    }
    await sleep(80);
  }

  console.log(`\n✅ Done. Uploaded: ${uploaded}, Unmatched: ${unmatched}${DRY_RUN ? `, Previewed: ${skipped}` : ''}`);
}

main().catch(console.error);
