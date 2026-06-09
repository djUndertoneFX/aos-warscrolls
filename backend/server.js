require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-use-a-long-random-string';

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Initialize DB on startup
initDb();

// ─── Auth Middleware ─────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const db = getDb();
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email, hash);

    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, username });
  } finally {
    db.close();
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body; // login = username or email
  if (!login || !password) {
    return res.status(400).json({ error: 'Login and password are required.' });
  }

  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } finally {
    db.close();
  }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

// ─── Warscrolls Routes ────────────────────────────────────────────────────────

// GET /api/user-units — returns this user's friendly/enemy flags
app.get('/api/user-units', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(
      'SELECT warscroll_id, is_friendly, is_enemy FROM user_units WHERE user_id = ?'
    ).all(req.user.id);
    res.json(rows);
  } finally {
    db.close();
  }
});

// POST /api/user-units/:warscrollId — set friendly/enemy flags
app.post('/api/user-units/:warscrollId', requireAuth, (req, res) => {
  const { is_friendly, is_enemy } = req.body;
  const warscrollId = parseInt(req.params.warscrollId);
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO user_units (user_id, warscroll_id, is_friendly, is_enemy)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, warscroll_id) DO UPDATE SET
        is_friendly = excluded.is_friendly,
        is_enemy = excluded.is_enemy
    `).run(req.user.id, warscrollId, is_friendly ? 1 : 0, is_enemy ? 1 : 0);
    res.json({ ok: true });
  } finally {
    db.close();
  }
});

// GET /api/warscrolls
app.get('/api/warscrolls', requireAuth, (req, res) => {
  const {
    faction, alliance, search,
    sortBy = 'faction', sortDir = 'asc',
    page = 1, pageSize = 50,
    isHero, isMonster, isInfantry, isCavalry, isWarMachine, isTerrain, isLegends,
    showFriendly, showEnemy, hideOtherFactions,
  } = req.query;

  const allowedSort = ['name', 'faction', 'grand_alliance', 'move', 'health', 'control', 'save', 'points'];
  const col = allowedSort.includes(sortBy) ? sortBy : 'faction';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

  const conditions = [];
  const params = [];

  if (faction)  { conditions.push('w.faction_slug = ?'); params.push(faction); }
  if (alliance) { conditions.push('w.grand_alliance = ?'); params.push(alliance); }
  if (search) {
    conditions.push('(w.name LIKE ? OR w.keywords LIKE ? OR w.faction LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (isHero       === '1') { conditions.push('w.is_hero = 1'); }
  if (isMonster    === '1') { conditions.push('w.is_monster = 1'); }
  if (isInfantry   === '1') { conditions.push('w.is_infantry = 1'); }
  if (isCavalry    === '1') { conditions.push('w.is_cavalry = 1'); }
  if (isWarMachine === '1') { conditions.push('w.is_war_machine = 1'); }
  if (isTerrain    === '1') { conditions.push('w.is_terrain = 1'); }
  if (isLegends    === '0') { conditions.push('w.is_legends = 0'); }

  // Hide units whose keywords don't contain their own faction name.
  // This removes Regiments of Renown / allied units that appear on a faction
  // page but actually belong to a different faction.
  if (hideOtherFactions === '1' && faction) {
    const db2 = getDb();
    const factionRow = db2.prepare('SELECT faction FROM warscrolls WHERE faction_slug = ? LIMIT 1').get(faction);
    db2.close();
    if (factionRow) {
      conditions.push('UPPER(w.keywords) LIKE ?');
      params.push('%' + factionRow.faction.toUpperCase() + '%');
    }
  }

  // Friendly/enemy filter via JOIN
  let join = '';
  if (showFriendly === '1' || showEnemy === '1') {
    join = `JOIN user_units uu ON uu.warscroll_id = w.id AND uu.user_id = ?`;
    params.unshift(req.user.id);
    const flags = [];
    if (showFriendly === '1') flags.push('uu.is_friendly = 1');
    if (showEnemy    === '1') flags.push('uu.is_enemy = 1');
    conditions.push(`(${flags.join(' OR ')})`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const db = getDb();
  try {
    const total = db.prepare(
      `SELECT COUNT(*) as count FROM warscrolls w ${join} ${where}`
    ).get(...params).count;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const typeOrder = `CASE
      WHEN w.is_hero=1 THEN 1
      WHEN w.is_infantry=1 THEN 2
      WHEN w.is_cavalry=1 THEN 3
      WHEN w.is_monster=1 THEN 4
      WHEN w.is_war_machine=1 THEN 5
      WHEN w.is_terrain=1 THEN 6
      ELSE 7 END`;
    const rows = db.prepare(`
      SELECT w.* FROM warscrolls w ${join} ${where}
      ORDER BY w.${col} ${dir}, ${typeOrder}, w.name ASC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize), offset);

    res.json({
      total, page: parseInt(page), pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize),
      data: rows,
    });
  } finally {
    db.close();
  }
});

// GET /api/warscrolls/:id
app.get('/api/warscrolls/:id', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM warscrolls WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } finally {
    db.close();
  }
});

// GET /api/factions
app.get('/api/factions', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT faction, faction_slug, grand_alliance, COUNT(*) as unit_count
      FROM warscrolls
      GROUP BY faction_slug
      ORDER BY grand_alliance, faction
    `).all();
    res.json(rows);
  } finally {
    db.close();
  }
});

// GET /api/stats
app.get('/api/stats', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM warscrolls').get().count;
    const byAlliance = db.prepare(`
      SELECT grand_alliance, COUNT(*) as count FROM warscrolls GROUP BY grand_alliance
    `).all();
    res.json({ total, byAlliance });
  } finally {
    db.close();
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🏰 AoS Warscrolls API running on http://localhost:${PORT}`);
  console.log(`   Run 'npm run scrape' to populate the database from Wahapedia.\n`);
});
