const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'warscrolls.db');

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

    CREATE TABLE IF NOT EXISTS user_units (
      user_id INTEGER NOT NULL,
      warscroll_id INTEGER NOT NULL,
      is_friendly INTEGER DEFAULT 0,
      is_enemy INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, warscroll_id)
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used INTEGER DEFAULT 0
    );
  `);

  // Safe migrations — ALTER TABLE is a no-op if the column already exists
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN weapons TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN is_war_machine INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN is_terrain INTEGER DEFAULT 0'); } catch {}

  db.close();
  console.log('Database initialized.');
}

module.exports = { getDb, initDb };
