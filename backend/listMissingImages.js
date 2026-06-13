/**
 * listMissingImages.js
 *
 * Fetches all warscrolls from Railway and reports which ones have no image
 * in either the local Warhammer/ or Lexicanum/ downloaded-images folders.
 *
 * Run: node listMissingImages.js
 * Outputs: missing-images.txt
 */

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const RAILWAY_API = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const LOGIN_USER  = process.env.LOGIN_USER || '';
const LOGIN_PASS  = process.env.LOGIN_PASS || '';

const WARHAMMER_DIR  = path.join(__dirname, 'downloaded-images', 'Warhammer');
const LEXICANUM_DIR  = path.join(__dirname, 'downloaded-images', 'Lexicanum');

function safeFilename(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function hasImage(faction, name) {
  const base = `${safeFilename(faction)} - ${safeFilename(name)}.jpg`;
  return fs.existsSync(path.join(WARHAMMER_DIR, base))
      || fs.existsSync(path.join(LEXICANUM_DIR, base));
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
  console.log('🔑 Logging in...');
  const jwt = await getJwt();
  console.log('📋 Fetching warscrolls...');
  const warscrolls = await fetchWarscrolls(jwt);
  console.log(`  ${warscrolls.length} total warscrolls`);

  const missing = warscrolls.filter(ws => !hasImage(ws.faction, ws.name));

  console.log(`\n❌ Missing images: ${missing.length} / ${warscrolls.length}`);
  console.log(`✅ Have images:    ${warscrolls.length - missing.length} / ${warscrolls.length}`);

  // Group by faction for readability
  const byFaction = {};
  for (const ws of missing) {
    if (!byFaction[ws.faction]) byFaction[ws.faction] = [];
    byFaction[ws.faction].push(ws.name);
  }

  const lines = [];
  for (const [faction, names] of Object.entries(byFaction).sort()) {
    lines.push(`\n[${faction}]`);
    for (const name of names.sort()) lines.push(`  ${name}`);
  }

  const output = `Missing images: ${missing.length} / ${warscrolls.length}\n` + lines.join('\n');
  fs.writeFileSync('missing-images.txt', output);
  console.log('\n📄 Full list saved to missing-images.txt');

  // Also print to console
  console.log(lines.join('\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
