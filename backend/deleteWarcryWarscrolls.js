/**
 * deleteWarcryWarscrolls.js
 *
 * Calls DELETE /api/warscrolls/no-stats on Railway to remove all warscroll
 * entries that have no move/health/keywords — these are Warcry ally entries
 * that appear across many factions with only a points cost and no AoS stats.
 *
 * Run AFTER deploying the endpoint: node deleteWarcryWarscrolls.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';

if (!RAILWAY_API)   { console.error('Set RAILWAY_API_URL in .env.local'); process.exit(1); }
if (!UPLOAD_SECRET) { console.error('Set UPLOAD_SECRET in .env.local'); process.exit(1); }

async function main() {
  console.log('🗑  Deleting no-stats (Warcry) warscrolls from Railway...');
  const res = await fetch(`${RAILWAY_API}/api/warscrolls/no-stats`, {
    method: 'DELETE',
    headers: { 'x-upload-secret': UPLOAD_SECRET },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  console.log(`✅ Deleted ${data.deleted} warscroll entries.`);
}

main().catch(err => { console.error(err); process.exit(1); });
