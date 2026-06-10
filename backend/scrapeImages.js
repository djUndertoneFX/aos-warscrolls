require('dotenv').config();
const { scrapeImages } = require('./scraper');

scrapeImages().catch(err => {
  console.error('Image scraping failed:', err);
  process.exit(1);
});
