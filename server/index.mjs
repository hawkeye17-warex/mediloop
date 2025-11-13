// MediLoop Auth Server (clean rewrite)
// - Express (ESM), SQLite via better-sqlite3
// - TOTP (Google/Microsoft Authenticator) with otplib
// - HttpOnly cookie sessions
// - CORS enabled for Vite dev on 5173

import express from 'express';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import qrcode from 'qrcode';
import argon2 from 'argon2';

const PORT = Number(process.env.PORT || 5174);
const DEBUG = process.env.AUTH_DEBUG === '1';
const SESSION_COOKIE = 'ml_session';
const SESSION_TTL_S = 60 * 60 * 24 * 7; // 7 days
const COOKIE_SECURE = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';

// TOTP configuration
authenticator.options = { step: 30, window: 1, digits: 6 };

// Derive encryption key for TOTP secrets
const RAW_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';
const KEY = crypto.scryptSync(RAW_SECRET, 'mediloop-salt', 32);
const IV_LEN = 12;
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
};
const decrypt = (payload) => {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  const dec = Buffer.concat([d.update(enc), d.final()]);
  return dec.toString('utf8');
};

// Database setup
const db = new Database('server/data.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  totp_enabled INTEGER DEFAULT 0,
  totp_secret_encrypted TEXT,
  totp_temp_secret_encrypted TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const SQL = {
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  createUser: db.prepare('INSERT INTO users (email, created_at) VALUES (?, ?)'),
  updateTempSecret: db.prepare('UPDATE users SET totp_temp_secret_encrypted = ? WHERE id = ?'),
  promoteSecret: db.prepare('UPDATE users SET totp_enabled = 1, totp_secret_encrypted = ?, totp_temp_secret_encrypted = NULL WHERE id = ?'),
  createSession: db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'),
  getSessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  deleteSessionByHash: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  clearUserSecrets: db.prepare('UPDATE users SET totp_enabled = 0, totp_secret_encrypted = NULL, totp_temp_secret_encrypted = NULL WHERE id = ?'),
  deleteSessionsForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  // Utilities for password column (prepared later on demand)
};

// App
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// CORS: allow dev (5173) and optional ALLOWED_ORIGIN(s) comma-separated
const ALLOWED = (process.env.ALLOWED_ORIGIN || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let allow = false;
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.protocol === 'http:' && u.port === '5173') allow = true; // dev
    } catch {}
    if (!allow && ALLOWED.includes(origin)) allow = true;
  }
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Simple request logger (dev aid)
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

// Helpers
const nowS = () => Math.floor(Date.now() / 1000);
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const issueSession = (res, userId) => {
  const token = crypto.randomBytes(32).toString('base64url');
  SQL.createSession.run(userId, hash(token), nowS() + SESSION_TTL_S, nowS());
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: SESSION_TTL_S * 1000,
    path: '/',
  });
};

// Routes
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Ensure password column exists, and seed demo credential (non-blocking)
async function ensurePasswordAndSeed() {
  try {
    const hasCol = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = ?").get('password_hash');
    if (!hasCol) db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  } catch (_) {
    // ignore if already exists
  }
  const DEMO_EMAILS = [
    process.env.DEMO_EMAIL || 'gautamchaudhari1709@gmail',
    'gautamchaudhari1709@gmail.com',
  ];
  const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'gautam@1709';
  for (const email of DEMO_EMAILS) {
    let u = SQL.getUserByEmail.get(email);
    if (!u) { SQL.createUser.run(email, nowS()); u = SQL.getUserByEmail.get(email); }
    if (!u.password_hash) {
      const ph = await argon2.hash(DEMO_PASSWORD);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(ph, u.id);
    }
  }
}
ensurePasswordAndSeed().catch(err => console.error('seed error', err));

// Start auth: create user if needed; if enrolled -> code mode; else return QR
app.post('/api/auth/start', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const force = Boolean(req.body?.force);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });

    let user = SQL.getUserByEmail.get(email);
    if (!user) { SQL.createUser.run(email, nowS()); user = SQL.getUserByEmail.get(email); }
    if (user.totp_enabled) return res.json({ mode: 'code' });

    let secret;
    if (user.totp_temp_secret_encrypted && !force) {
      secret = decrypt(user.totp_temp_secret_encrypted);
    } else {
      secret = authenticator.generateSecret();
      SQL.updateTempSecret.run(encrypt(secret), user.id);
    }
    const otpauthUrl = authenticator.keyuri(email, 'MediLoop', secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    if (DEBUG) console.log('[auth] enroll start', { email, secret, sample: authenticator.generate(secret) });
    return res.json({ mode: 'enroll', otpauthUrl, qrDataUrl, devSecret: DEBUG ? secret : undefined });
  } catch (e) {
    console.error('start error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Verify enrollment with a TOTP code
app.post('/api/auth/verify-enroll', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '').trim();
    const user = SQL.getUserByEmail.get(email);
    if (!user || !user.totp_temp_secret_encrypted) return res.status(400).json({ error: 'enroll_required' });
    const secret = decrypt(user.totp_temp_secret_encrypted);
    const ok = authenticator.verify({ token: code, secret, window: 2 });
    if (!ok) return res.status(400).json({ error: 'invalid_code' });
    SQL.promoteSecret.run(encrypt(secret), user.id);
    issueSession(res, user.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('verify-enroll error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Login with TOTP
app.post('/api/auth/login', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '').trim();
    const user = SQL.getUserByEmail.get(email);
    if (!user) return res.status(400).json({ error: 'not_found' });
    if (!user.totp_enabled || !user.totp_secret_encrypted) return res.status(400).json({ error: 'enroll_required' });
    const secret = decrypt(user.totp_secret_encrypted);
    const ok = authenticator.verify({ token: code, secret, window: 2 });
    if (!ok) return res.status(400).json({ error: 'invalid_code' });
    issueSession(res, user.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Traditional email+password login
app.post('/api/auth/login-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = SQL.getUserByEmail.get(email);
    if (!user || !user.password_hash) return res.status(400).json({ error: 'invalid_credentials' });
    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) return res.status(400).json({ error: 'invalid_credentials' });
    issueSession(res, user.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('login-password error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Register or set password (dev/simple)
app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    let user = SQL.getUserByEmail.get(email);
    if (!user) { SQL.createUser.run(email, nowS()); user = SQL.getUserByEmail.get(email); }
    const ph = await argon2.hash(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(ph, user.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('register error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Me
app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return res.json({ user: null });
    const s = SQL.getSessionByHash.get(hash(token));
    if (!s || s.expires_at < nowS()) return res.json({ user: null });
    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(s.user_id);
    return res.json({ user });
  } catch (e) {
    console.error('me error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      SQL.deleteSessionByHash.run(hash(token));
      res.clearCookie(SESSION_COOKIE, { path: '/' });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('logout error', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Debug helpers (dev only)
app.get('/api/auth/debug-totp', (req, res) => {
  if (!DEBUG) return res.status(404).end();
  const email = String(req.query.email || '').trim().toLowerCase();
  const user = SQL.getUserByEmail.get(email);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const secret = user.totp_temp_secret_encrypted
    ? decrypt(user.totp_temp_secret_encrypted)
    : user.totp_secret_encrypted
    ? decrypt(user.totp_secret_encrypted)
    : null;
  if (!secret) return res.status(400).json({ error: 'no_secret' });
  return res.json({ now: Date.now(), token: authenticator.generate(secret), secret });
});

app.post('/api/auth/admin/reset-user', (req, res) => {
  if (!DEBUG) return res.status(404).end();
  const email = String(req.body?.email || '').trim().toLowerCase();
  let user = SQL.getUserByEmail.get(email);
  if (!user) { SQL.createUser.run(email, nowS()); user = SQL.getUserByEmail.get(email); }
  SQL.clearUserSecrets.run(user.id);
  SQL.deleteSessionsForUser.run(user.id);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
