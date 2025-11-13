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
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS patient_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  start_ts INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS lab_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  test TEXT NOT NULL,
  lab_name TEXT,
  lab_city TEXT,
  status TEXT DEFAULT 'requested',
  notes TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id),
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
  listPatients: db.prepare('SELECT id, name, dob, gender, phone, email, address, created_at FROM patients WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'),
  insertPatient: db.prepare('INSERT INTO patients (id, user_id, name, dob, gender, phone, email, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getPatientById: db.prepare('SELECT * FROM patients WHERE id = ? AND user_id = ?'),
  updatePatient: db.prepare('UPDATE patients SET name = ?, dob = ?, gender = ?, phone = ?, email = ?, address = ? WHERE id = ? AND user_id = ?'),
  listNotesForPatient: db.prepare('SELECT id, patient_id, content, created_at FROM patient_notes WHERE patient_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 200'),
  insertNote: db.prepare('INSERT INTO patient_notes (patient_id, user_id, content, created_at) VALUES (?, ?, ?, ?)'),
  listAppointmentsUpcoming: db.prepare(`SELECT a.id, a.patient_id, a.start_ts, a.reason, p.name AS patient_name FROM appointments a JOIN patients p ON p.id = a.patient_id AND p.user_id = a.user_id WHERE a.user_id = ? AND a.start_ts >= ? ORDER BY a.start_ts ASC LIMIT 200`),
  listAppointmentsForPatient: db.prepare('SELECT id, patient_id, start_ts, reason FROM appointments WHERE patient_id = ? AND user_id = ? ORDER BY start_ts DESC LIMIT 200'),
  insertAppointment: db.prepare('INSERT INTO appointments (patient_id, user_id, start_ts, reason, created_at) VALUES (?, ?, ?, ?, ?)'),
  listLabOrdersForPatient: db.prepare('SELECT id, patient_id, test, lab_name, lab_city, status, notes, created_at FROM lab_orders WHERE patient_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 200'),
  insertLabOrder: db.prepare('INSERT INTO lab_orders (patient_id, user_id, test, lab_name, lab_city, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  listLabOrders: db.prepare('SELECT id, patient_id, test, lab_name, lab_city, status, notes, created_at FROM lab_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'),
  updateLabOrder: db.prepare('UPDATE lab_orders SET status = ?, notes = ? WHERE id = ? AND user_id = ?'),
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
    sameSite: 'none',
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
    let secret; try { secret = decrypt(user.totp_temp_secret_encrypted); } catch (e) { try { SQL.updateTempSecret.run(null, user.id); } catch {} return res.status(400).json({ error: 'enroll_required' }); }
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
    let secret; try { secret = decrypt(user.totp_secret_encrypted); } catch (e) { return res.status(400).json({ error: 'enroll_required' }); }
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

// ---------------------- App data API (DB-backed) ----------------------
function requireAuthApi(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const s = SQL.getSessionByHash.get(hash(token));
  if (!s || s.expires_at < nowS()) return res.status(401).json({ error: 'unauthorized' });
  req.userId = s.user_id;
  next();
}

const LABS = [
  { name: 'Prairie Labs - Downtown', city: 'Winnipeg', tests: ['Bloodwork', 'MRI', 'X-Ray'] },
  { name: 'HealthPlus Labs', city: 'Winnipeg', tests: ['Bloodwork'] },
  { name: 'Lakeview Diagnostics', city: 'Brandon', tests: ['Bloodwork', 'Ultrasound'] },
  { name: 'Broadway Imaging', city: 'Toronto', tests: ['MRI', 'CT'] },
  { name: 'Harbour Labs', city: 'Vancouver', tests: ['Bloodwork', 'X-Ray'] },
];

const formatPatient = (row) => ({
  id: row.id,
  name: row.name,
  dob: row.dob,
  gender: row.gender,
  phone: row.phone,
  email: row.email,
  address: row.address,
  createdAt: row.created_at,
});
const formatNote = (row) => ({ id: row.id, patientId: row.patient_id, content: row.content, createdAt: row.created_at });
const formatAppointment = (row) => ({
  id: row.id,
  patientId: row.patient_id,
  startTs: row.start_ts,
  reason: row.reason,
  patient: row.patient_name ? { id: row.patient_id, name: row.patient_name } : undefined,
});
const formatLabOrder = (row) => ({
  id: row.id,
  patientId: row.patient_id,
  test: row.test,
  labName: row.lab_name,
  labCity: row.lab_city,
  status: row.status,
  notes: row.notes,
  createdAt: row.created_at,
});

// Patients
app.get('/api/patients', requireAuthApi, (req, res) => {
  const rows = SQL.listPatients.all(req.userId);
  res.json({ patients: rows.map(formatPatient) });
});

app.post('/api/patients', requireAuthApi, (req, res) => {
  const { name, dob, gender, phone, email, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const id = crypto.randomBytes(6).toString('hex');
  SQL.insertPatient.run(id, req.userId, name, dob || null, gender || null, phone || null, email || null, address || null, nowS());
  res.json({ id });
});

app.get('/api/patients/:id', requireAuthApi, (req, res) => {
  const patientRow = SQL.getPatientById.get(req.params.id, req.userId);
  if (!patientRow) return res.status(404).json({ error: 'not_found' });
  const patient = formatPatient(patientRow);
  const notes = SQL.listNotesForPatient.all(patient.id, req.userId).map(formatNote);
  const appointments = SQL.listAppointmentsForPatient.all(patient.id, req.userId).map((row) => ({ id: row.id, patientId: row.patient_id, startTs: row.start_ts, reason: row.reason }));
  const labs = SQL.listLabOrdersForPatient.all(patient.id, req.userId).map(formatLabOrder);
  res.json({ patient, notes, appointments, labs });
});

app.put('/api/patients/:id', requireAuthApi, (req, res) => {
  const existing = SQL.getPatientById.get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { name, dob, gender, phone, email, address } = req.body || {};
  SQL.updatePatient.run(
    name ?? existing.name,
    dob ?? existing.dob,
    gender ?? existing.gender,
    phone ?? existing.phone,
    email ?? existing.email,
    address ?? existing.address,
    existing.id,
    req.userId,
  );
  res.json({ ok: true });
});

app.post('/api/patients/:id/notes', requireAuthApi, (req, res) => {
  const patientRow = SQL.getPatientById.get(req.params.id, req.userId);
  if (!patientRow) return res.status(404).json({ error: 'not_found' });
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content_required' });
  SQL.insertNote.run(patientRow.id, req.userId, content, nowS());
  res.json({ ok: true });
});

// Appointments
app.get('/api/appointments/upcoming', requireAuthApi, (req, res) => {
  const rows = SQL.listAppointmentsUpcoming.all(req.userId, nowS());
  res.json({ appointments: rows.map(formatAppointment) });
});

app.post('/api/appointments', requireAuthApi, (req, res) => {
  const { patientId, startTs, reason, labOrder, noteContent } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patient_required' });
  const patientRow = SQL.getPatientById.get(patientId, req.userId);
  if (!patientRow) return res.status(400).json({ error: 'invalid_patient' });
  if (!startTs) return res.status(400).json({ error: 'start_ts_required' });
  const start = Number(startTs);
  const apptInfo = SQL.insertAppointment.run(patientRow.id, req.userId, start, reason || '', nowS());
  let labOrderId = null;
  if (labOrder?.test) {
    const { test, labName, labCity, status, notes } = labOrder;
    const labInfo = SQL.insertLabOrder.run(patientRow.id, req.userId, test, labName || null, labCity || null, status || 'requested', notes || null, nowS());
    labOrderId = labInfo.lastInsertRowid;
  }
  if (noteContent) {
    SQL.insertNote.run(patientRow.id, req.userId, noteContent, nowS());
  }
  res.json({ ok: true, appointmentId: apptInfo.lastInsertRowid, labOrderId });
});

// Lab order management + directory
app.get('/api/labs/nearby', requireAuthApi, (req, res) => {
  const address = String(req.query.address || '');
  const test = String(req.query.test || '');
  const city = address.split(',').map(s=>s.trim()).slice(-1)[0] || '';
  let results = LABS.filter(l => (!test || l.tests.includes(test)) && (!city || l.city.toLowerCase() === city.toLowerCase()));
  if (results.length === 0) results = LABS.filter(l => !test || l.tests.includes(test));
  res.json({ labs: results.slice(0,5) });
});

app.get('/api/lab-orders', requireAuthApi, (req, res) => {
  const rows = SQL.listLabOrders.all(req.userId);
  res.json({ labOrders: rows.map(formatLabOrder) });
});

app.post('/api/lab-orders', requireAuthApi, (req, res) => {
  const { patientId, test, labName, labCity, status, notes } = req.body || {};
  if (!patientId || !test) return res.status(400).json({ error: 'invalid_payload' });
  const patientRow = SQL.getPatientById.get(patientId, req.userId);
  if (!patientRow) return res.status(400).json({ error: 'invalid_patient' });
  const info = SQL.insertLabOrder.run(patientRow.id, req.userId, test, labName || null, labCity || null, status || 'requested', notes || null, nowS());
  res.json({ id: info.lastInsertRowid });
});

app.patch('/api/lab-orders/:id', requireAuthApi, (req, res) => {
  const { status, notes } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status_required' });
  const info = SQL.updateLabOrder.run(status, notes ?? null, Number(req.params.id), req.userId);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
