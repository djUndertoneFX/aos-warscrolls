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

    CREATE TABLE IF NOT EXISTS faction_battle_traits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_slug TEXT NOT NULL,
      faction_name TEXT NOT NULL,
      name TEXT NOT NULL,
      timing TEXT,
      declare TEXT,
      effect TEXT,
      bullets TEXT,
      keywords TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faction_battle_formations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_slug TEXT NOT NULL,
      faction_name TEXT NOT NULL,
      formation_name TEXT NOT NULL,
      name TEXT NOT NULL,
      timing TEXT,
      declare TEXT,
      effect TEXT,
      bullets TEXT,
      keywords TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_traits_faction ON faction_battle_traits(faction_slug);
    CREATE INDEX IF NOT EXISTS idx_formations_faction ON faction_battle_formations(faction_slug);

    CREATE TABLE IF NOT EXISTS faction_extra_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_slug TEXT NOT NULL,
      faction_name TEXT NOT NULL,
      section TEXT NOT NULL,
      group_name TEXT,
      name TEXT NOT NULL,
      timing TEXT,
      declare TEXT,
      effect TEXT,
      bullets TEXT,
      keywords TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_extra_rules_faction ON faction_extra_rules(faction_slug);
    CREATE INDEX IF NOT EXISTS idx_extra_rules_section ON faction_extra_rules(faction_slug, section);

    -- Path to Glory: Anvil of Apotheosis (per-faction warlord-creation steps).
    -- Only ~18 of 24 factions currently publish this (4e battletome-dependent).
    CREATE TABLE IF NOT EXISTS faction_apotheosis_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_slug TEXT NOT NULL,
      faction_name TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      step_title TEXT NOT NULL,
      intro_text TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faction_apotheosis_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_slug TEXT NOT NULL,
      faction_name TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      option_group TEXT,
      name TEXT NOT NULL,
      cost TEXT,
      timing TEXT,
      declare TEXT,
      effect TEXT,
      bullets TEXT,
      keywords TEXT,
      lore_text TEXT,
      sort_order INTEGER DEFAULT 0,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_apotheosis_steps_faction ON faction_apotheosis_steps(faction_slug);
    CREATE INDEX IF NOT EXISTS idx_apotheosis_options_faction ON faction_apotheosis_options(faction_slug, step_number);
  `);

  // Safe migrations — ALTER TABLE is a no-op if the column already exists
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN weapons TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN is_war_machine INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN is_terrain INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN image_path TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN is_beast INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN is_manifestation INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN flavor_text TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN options_text TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN spearhead TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN spearhead_abilities TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE warscrolls ADD COLUMN spearhead_abilities_v2 TEXT DEFAULT NULL'); } catch {}

  // Spearhead rules table (battle traits, regiment abilities, enhancements)
  db.exec(`
    CREATE TABLE IF NOT EXISTS spearheads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      faction_slug TEXT NOT NULL,
      battle_traits TEXT DEFAULT '[]',
      regiment_abilities TEXT DEFAULT '[]',
      enhancements TEXT DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_spearheads_faction ON spearheads(faction_slug);
  `);
  try { db.exec('ALTER TABLE spearheads ADD COLUMN image_path TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE spearheads ADD COLUMN lore_text TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE faction_battle_traits ADD COLUMN lore_text TEXT DEFAULT NULL'); } catch {}
  // group_name: shared column-header label for traits grouped without an h3
  // (confirmed: Idoneth Deepkin's "Tides" traits) — null for standalone traits.
  try { db.exec('ALTER TABLE faction_battle_traits ADD COLUMN group_name TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE faction_battle_formations ADD COLUMN lore_text TEXT DEFAULT NULL'); } catch {}
  // source_note: cleaned expansion/supplement label (e.g. "Scourge of Ghyran")
  // when a formation comes from outside the core battletome, else NULL.
  // phase_key: thematic PHASE_PRESETS color key (see scrapeRules.js
  // resolveFormationPhaseKey / WarscrollGW.js PHASE_PRESETS).
  try { db.exec('ALTER TABLE faction_battle_formations ADD COLUMN source_note TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE faction_battle_formations ADD COLUMN phase_key TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE faction_extra_rules ADD COLUMN lore_text TEXT DEFAULT NULL'); } catch {}
  // Spell/prayer/manifestation-lore casting value (the 2D6 target number,
  // e.g. "6") — null for every other section (traits, artefacts, etc).
  try { db.exec('ALTER TABLE faction_extra_rules ADD COLUMN casting_value TEXT DEFAULT NULL'); } catch {}
  // Account-level default Commander name for the Army Roster — starts null
  // (falls back to the username) until the user types something different
  // into the Commander field, at which point that becomes their new default
  // for every future roster, not just the one they edited it on.
  try { db.exec('ALTER TABLE users ADD COLUMN commander_name TEXT DEFAULT NULL'); } catch {}
  // Starting-warscroll data (Anvil of Apotheosis Step 2) — only the concrete
  // values the source actually provides (weapon profile + keywords). Move/
  // Health/Save/Control have no fixed starting value in the source: they're
  // built up entirely through later Destiny Point purchases, so there's
  // nothing real to store/autofill for those.
  try { db.exec('ALTER TABLE faction_apotheosis_steps ADD COLUMN starting_weapon TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE faction_apotheosis_steps ADD COLUMN starting_keywords TEXT DEFAULT NULL'); } catch {}

  // Saved Path to Glory rosters — one shared pool per user, selectable from
  // either the "My Roster" or "Enemy Roster" dropdown (a build isn't
  // intrinsically "mine" or "the enemy's", just whichever slot picks it).
  db.exec(`
    CREATE TABLE IF NOT EXISTS ptg_rosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      faction_slug TEXT,
      faction_name TEXT,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ptg_rosters_user ON ptg_rosters(user_id);
  `);

  // Saved Army Builder lists — one per named list, server-side so they
  // persist across devices/sessions instead of living in localStorage
  // (which a browser update, storage clear, or new device would wipe).
  db.exec(`
    CREATE TABLE IF NOT EXISTS army_builder_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      faction_slug TEXT,
      faction_name TEXT,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_army_builder_lists_user ON army_builder_lists(user_id);
  `);

  db.close();
  console.log('Database initialized.');
}

module.exports = { getDb, initDb };
