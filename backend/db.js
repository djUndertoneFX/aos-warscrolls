const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'warscrolls.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warscrolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      faction TEXT NOT NULL,
      faction_slug TEXT NOT NULL,
      grand_alliance TEXT,
      unit_type TEXT,
      move TEXT,
      health TEXT,
      control TEXT,
      save TEXT,
      ward TEXT,
      points TEXT,
      unit_size TEXT,
      base_size TEXT,
      keywords TEXT,
      abilities TEXT,
      is_hero INTEGER DEFAULT 0,
      is_monster INTEGER DEFAULT 0,
      is_cavalry INTEGER DEFAULT 0,
      is_infantry INTEGER DEFAULT 0,
      is_warmaster INTEGER DEFAULT 0,
      is_unique INTEGER DEFAULT 0,
      is_legends INTEGER DEFAULT 0,
      url TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_warscrolls_faction ON warscrolls(faction);
    CREATE INDEX IF NOT EXISTS idx_warscrolls_grand_alliance ON warscrolls(grand_alliance);
    CREATE INDEX IF NOT EXISTS idx_warscrolls_name ON warscrolls(name);
  `);

  db.close();
  console.log('Database initialized.');
}

module.exports = { getDb, initDb };
