// List all unit names per faction from the DB
const { getDb } = require('./db');
const db = getDb();
const factions = db.prepare("SELECT DISTINCT faction, faction_slug FROM warscrolls ORDER BY faction").all();
for (const f of factions) {
  const units = db.prepare("SELECT name FROM warscrolls WHERE faction_slug = ? ORDER BY name").all(f.faction_slug);
  console.log(`\n=== ${f.faction} ===`);
  units.forEach(u => console.log(' ', u.name));
}
db.close();
