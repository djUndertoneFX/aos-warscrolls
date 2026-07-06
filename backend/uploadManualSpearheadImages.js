/**
 * Uploads manually-downloaded spearhead images to Railway and copies them
 * into the main downloaded-images/Spearhead/ folder for git tracking.
 *
 * Run: node uploadManualSpearheadImages.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const fs   = require('fs');
const path = require('path');

const RAILWAY_API   = (process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || '';

const SRC_DIR  = path.join(__dirname, 'downloaded-images', 'Spearhead', 'ManuallyDownloaded');
const DEST_DIR = path.join(__dirname, 'downloaded-images', 'Spearhead');

// Map filename slug → canonical spearhead name (only needed where they differ)
const FILENAME_TO_NAME = {
  'skyhammer-taskforce': 'Skyhammer Task Force',
};

function nameSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// All 47 spearhead names so we can do reverse-slug lookup
const ALL_NAMES = [
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

const slugToName = new Map(ALL_NAMES.map(n => [nameSlug(n), n]));

async function uploadImage(localPath, spName) {
  const encoded = encodeURIComponent(spName);
  const res = await fetch(`${RAILWAY_API}/api/spearhead-image/${encoded}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-upload-secret': UPLOAD_SECRET },
    body: fs.readFileSync(localPath),
  });
  if (!res.ok) {
    console.warn(`  ✗ Upload failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

async function main() {
  const files = fs.readdirSync(SRC_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log(`Found ${files.length} files in ManuallyDownloaded/\n`);

  let uploaded = 0, skipped = 0;

  for (const file of files) {
    const ext      = path.extname(file);
    const basename = path.basename(file, ext);

    // Resolve the canonical spearhead name
    const spName = FILENAME_TO_NAME[basename] || slugToName.get(basename);
    if (!spName) {
      console.log(`⚠️  ${file} — could not map to a spearhead name, skipping`);
      skipped++;
      continue;
    }

    const srcPath  = path.join(SRC_DIR, file);
    // Always save as .jpg in the main folder using the canonical slug
    const destName = nameSlug(spName) + '.jpg';
    const destPath = path.join(DEST_DIR, destName);

    console.log(`▶ ${file}  →  "${spName}"  →  ${destName}`);

    // Copy to main Spearhead folder (for git)
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copied to downloaded-images/Spearhead/${destName}`);

    // Upload to Railway
    const ok = await uploadImage(srcPath, spName);
    if (ok) { uploaded++; console.log('  ✓ Uploaded to Railway'); }
    else skipped++;
  }

  console.log(`\n✅ Done — uploaded: ${uploaded}, skipped: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
