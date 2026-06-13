/**
 * fetchAlgoliaProducts.js
 *
 * Fetches all AoS product data from Warhammer.com's Algolia search index
 * and saves it to algolia-all-products.json for use by localScrapeImagesWarhammer.js
 *
 * Run: node fetchAlgoliaProducts.js
 */

const fetch = require('node-fetch');
const fs = require('fs');

const APP_ID  = 'M5ZIQZNQ2H';
const API_KEY = '92c6a8254f9d34362df8e6d96475e5d8';
const HOST       = `https://${APP_ID}-1.algolianet.com`;
const INDEX_NAME = 'prod-lazarus-product-en-us';

// AoS category filter — facet value confirmed from live response
const FILTERS = 'GameSystemsRoot.lvl0:"Age of Sigmar"';

async function fetchPage(page) {
  const res = await fetch(`${HOST}/1/indexes/${INDEX_NAME}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Api-Key': API_KEY,
      'X-Algolia-Application-Id': APP_ID,
    },
    body: JSON.stringify({
      filters: FILTERS,
      hitsPerPage: 100,
      page,
      attributesToRetrieve: ['name', 'slug', 'images'],
    }),
  });
  if (!res.ok) throw new Error(`Algolia HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('🔍 Fetching AoS products from Algolia...');

  // Get first page to find total
  const first = await fetchPage(0);
  console.log(`  Total hits: ${first.nbHits}, pages: ${first.nbPages}`);

  const allHits = [...first.hits];
  for (let p = 1; p < first.nbPages; p++) {
    const data = await fetchPage(p);
    allHits.push(...data.hits);
    process.stdout.write(`\r  Page ${p + 1}/${first.nbPages} — ${allHits.length} products`);
  }
  process.stdout.write('\n');

  fs.writeFileSync('algolia-all-products.json', JSON.stringify(allHits, null, 2));
  console.log(`✅ Saved ${allHits.length} products to algolia-all-products.json`);

  // Preview a few
  allHits.slice(0, 3).forEach(h => {
    console.log(`  ${h.name} → ${(h.images || [])[0] || 'no image'}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
