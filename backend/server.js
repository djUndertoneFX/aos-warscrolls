require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { getDb, initDb } = require('./db');

const IMAGE_DIR = process.env.IMAGE_DIR ||
  (process.env.DB_PATH
    ? path.join(path.dirname(process.env.DB_PATH), 'unit-images')
    : path.join(__dirname, 'unit-images'));

// Seasonal/title prefixes prepended to unit names — strip these to find the base unit image
const TITLE_PREFIXES = [
  'Scourge of Ghyran',
];

// Convert a unit name to a stable filename slug (survives re-scrapes)
function nameSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Email transporter ───────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendResetEmail(toEmail, resetUrl) {
  if (!process.env.SMTP_HOST) {
    // No email configured — log the link so it's still usable in dev/testing
    console.log(`[password-reset] No SMTP configured. Reset URL: ${resetUrl}`);
    return;
  }
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'AoS Warscrolls — Password Reset',
    html: `
      <p>A password reset was requested for your AoS Warscrolls account.</p>
      <p><a href="${resetUrl}" style="font-size:1.1rem">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
    text: `Reset your AoS Warscrolls password here: ${resetUrl}\n\nExpires in 1 hour.`,
  });
}

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

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const db = getDb();
  try {
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    // Always respond success to prevent email enumeration
    if (!user) return res.json({ ok: true });

    // Invalidate any existing tokens for this user
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

    const appUrl = process.env.APP_URL || 'https://easygoing-embrace-production-f3bb.up.railway.app';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await sendResetEmail(user.email, resetUrl);

    res.json({ ok: true });
  } finally {
    db.close();
  }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const db = getDb();
  try {
    const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
    if (!reset) return res.status(400).json({ error: 'Invalid or expired reset link.' });
    if (Date.now() > reset.expires_at) return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

    res.json({ ok: true });
  } finally {
    db.close();
  }
});

// ─── Warscrolls Routes ────────────────────────────────────────────────────────

// GET /api/user-units — returns this user's friendly/enemy flags
app.get('/api/user-units', requireAuth, (req, res) => {
  const db = getDb();
  try {
    // JOIN warscrolls to automatically exclude stale marks pointing to
    // deleted warscroll IDs (e.g. after the scraper re-runs and re-numbers IDs)
    const rows = db.prepare(
      `SELECT uu.warscroll_id, uu.is_friendly, uu.is_enemy
       FROM user_units uu
       JOIN warscrolls w ON w.id = uu.warscroll_id
       WHERE uu.user_id = ?`
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
    faction, enemyFaction, alliance, search,
    sortBy = 'faction', sortDir = 'asc',
    page = 1, pageSize = 50,
    isHero, isMonster, isInfantry, isCavalry, isBeast, isWarMachine, isTerrain, isManifestation, isLegends,
    hideScourgeOfGhyran,
    showFriendly, showEnemy, hideOtherFactions,
  } = req.query;

  const allowedSort = ['name', 'faction', 'grand_alliance', 'move', 'health', 'control', 'save', 'points'];
  const col = allowedSort.includes(sortBy) ? sortBy : 'faction';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

  const conditions = [];
  const params = [];

  // Faction slug filter — frontend has already computed which slugs to send
  // based on whether friendly/enemy marks exist (byFaction vs byMark logic).
  if (faction && enemyFaction) {
    conditions.push('(w.faction_slug = ? OR w.faction_slug = ?)');
    params.push(faction, enemyFaction);
  } else if (faction) {
    conditions.push('w.faction_slug = ?'); params.push(faction);
  } else if (enemyFaction) {
    conditions.push('w.faction_slug = ?'); params.push(enemyFaction);
  }

  if (alliance) { conditions.push('w.grand_alliance = ?'); params.push(alliance); }
  if (search) {
    conditions.push('(w.name LIKE ? OR w.keywords LIKE ? OR w.faction LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (isHero            === '1') { conditions.push('w.is_hero = 1'); }
  if (isMonster         === '1') { conditions.push('w.is_monster = 1'); }
  if (isInfantry        === '1') { conditions.push('w.is_infantry = 1'); }
  if (isCavalry         === '1') { conditions.push('w.is_cavalry = 1'); }
  if (isBeast           === '1') { conditions.push('w.is_beast = 1'); }
  if (isWarMachine      === '1') { conditions.push('w.is_war_machine = 1'); }
  if (isTerrain         === '1') { conditions.push('w.is_terrain = 1'); }
  if (isManifestation   === '1') { conditions.push('w.is_manifestation = 1'); }
  if (isLegends           === '0') { conditions.push('w.is_legends = 0'); }
  if (hideScourgeOfGhyran === '1') { conditions.push("w.name NOT LIKE 'Scourge of Ghyran %'"); }

  if (hideOtherFactions === '1' && (faction || enemyFaction)) {
    const skipWords = new Set(['of', 'the', 'to', 'and']);
    const getDistinctWord = (slug) => slug
      .split('-')
      .filter(w => !skipWords.has(w) && w.length > 2)
      .map(w => w.toUpperCase())[0];
    const words = [faction, enemyFaction]
      .filter(Boolean)
      .map(getDistinctWord)
      .filter(Boolean);
    if (words.length === 1) {
      conditions.push('instr(UPPER(w.keywords), ?) > 0');
      params.push(words[0]);
    } else if (words.length === 2) {
      conditions.push('(instr(UPPER(w.keywords), ?) > 0 OR instr(UPPER(w.keywords), ?) > 0)');
      params.push(words[0], words[1]);
    }
  }

  // Mark-based JOIN — only active when frontend sends showFriendly/showEnemy,
  // which it only does when the user actually has marked units.
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
      WHEN w.is_beast=1 THEN 4
      WHEN w.is_monster=1 THEN 5
      WHEN w.is_war_machine=1 THEN 6
      WHEN w.is_terrain=1 THEN 7
      WHEN w.is_manifestation=1 THEN 8
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

const IMAGE_CACHE_SECONDS = parseInt(process.env.IMAGE_CACHE_SECONDS || '86400');

function serveImage(imgPath, res) {
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', `public, max-age=${IMAGE_CACHE_SECONDS}`);
  fs.createReadStream(imgPath).pipe(res);
}

function resolveImagePaths(id, db) {
  // Returns array of existing image paths for a unit (slot 0, 1, 2…)
  // Images are keyed by name slug so they survive re-scrapes that change IDs.
  if (!db) return [];
  const ws = db.prepare('SELECT name FROM warscrolls WHERE id = ?').get(id);
  if (!ws) return [];

  const slug = nameSlug(ws.name);
  const paths = [];
  const primary = path.join(IMAGE_DIR, `${slug}.jpg`);
  if (fs.existsSync(primary)) {
    paths.push(primary);
    for (let slot = 1; slot <= 4; slot++) {
      const p = path.join(IMAGE_DIR, `${slug}_${slot}.jpg`);
      if (fs.existsSync(p)) paths.push(p); else break;
    }
    return paths;
  }

  // Fallback: strip title prefixes and try the base unit slug
  for (const prefix of TITLE_PREFIXES) {
    if (ws.name.startsWith(prefix + ' ')) {
      const baseName = ws.name.slice(prefix.length + 1);
      const baseSlug = nameSlug(baseName);
      const basePrimary = path.join(IMAGE_DIR, `${baseSlug}.jpg`);
      if (fs.existsSync(basePrimary)) {
        paths.push(basePrimary);
        for (let slot = 1; slot <= 4; slot++) {
          const p = path.join(IMAGE_DIR, `${baseSlug}_${slot}.jpg`);
          if (fs.existsSync(p)) paths.push(p); else break;
        }
        return paths;
      }
    }
  }
  return paths;
}

// GET /api/unit-images/:id — return JSON list of relative image paths for a unit
app.get('/api/unit-images/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const db = getDb();
  try {
    const paths = resolveImagePaths(id, db);
    const urls = paths.map((_, i) =>
      i === 0 ? `/api/unit-image/${id}` : `/api/unit-image/${id}?slot=${i}`
    );
    res.json(urls);
  } finally {
    db.close();
  }
});

// GET /api/unit-image/:id — serve unit image (slot 0 by default, or ?slot=N)
app.get('/api/unit-image/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const slot = parseInt(req.query.slot || '0');
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const db = getDb();
  try {
    if (slot > 0) {
      const ws = db.prepare('SELECT name FROM warscrolls WHERE id = ?').get(id);
      if (ws) {
        const imgPath = path.join(IMAGE_DIR, `${nameSlug(ws.name)}_${slot}.jpg`);
        if (fs.existsSync(imgPath)) return serveImage(imgPath, res);
      }
      return res.status(404).json({ error: 'No image' });
    }

    const paths = resolveImagePaths(id, db);
    if (paths.length > 0) return serveImage(paths[0], res);
    return res.status(404).json({ error: 'No image' });
  } finally {
    db.close();
  }
});

// PUT /api/unit-image/:id — upload image from local scraper script
// Optional ?slot=N for multi-image units (slot 0 = primary, 1 = secondary, etc.)
// Protected by UPLOAD_SECRET env var (not user JWT)
app.put('/api/unit-image/:id', express.raw({ type: 'image/jpeg', limit: '2mb' }), (req, res) => {
  const secret = process.env.UPLOAD_SECRET;
  if (!secret || req.headers['x-upload-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const id = parseInt(req.params.id);
  const slot = parseInt(req.query.slot || '0');
  if (!id || !req.body || !req.body.length) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const db = getDb();
  try {
    const ws = db.prepare('SELECT name FROM warscrolls WHERE id = ?').get(id);
    if (!ws) return res.status(404).json({ error: 'Unit not found' });

    if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

    const slug = nameSlug(ws.name);
    const filename = slot === 0 ? `${slug}.jpg` : `${slug}_${slot}.jpg`;
    const imgPath = path.join(IMAGE_DIR, filename);
    fs.writeFileSync(imgPath, req.body);

    if (slot === 0) db.prepare('UPDATE warscrolls SET image_path = ? WHERE id = ?').run(imgPath, id);
    res.json({ ok: true });
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
