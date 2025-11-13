import express from 'express';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import crypto from 'crypto';

const PORT = Number(process.env.PORT || 5174);
const SESSION_COOKIE = 'ml_session';
const SESSION_TTL_S = 60 * 60 * 24 * 7;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const DEBUG = process.env.AUTH_DEBUG === '1';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

// ---------- Database ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

const nowS = () => Math.floor(Date.now() / 1000);

// ---------- Crypto helpers ----------
const RAW_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';
const KEY = crypto.scryptSync(RAW_SECRET, 'mediloop-salt', 32);
const IV_LEN = 12;
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
};
const decrypt = (payload) => {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
};
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

authenticator.options = { step: 30, window: 1, digits: 6 };

const LABS = [
  { name: 'Prairie Labs - Downtown', city: 'Winnipeg', tests: ['Bloodwork', 'MRI', 'X-Ray'] },
  { name: 'HealthPlus Labs', city: 'Winnipeg', tests: ['Bloodwork'] },
  { name: 'Lakeview Diagnostics', city: 'Brandon', tests: ['Bloodwork', 'Ultrasound'] },
  { name: 'Broadway Imaging', city: 'Toronto', tests: ['MRI', 'CT'] },
  { name: 'Harbour Labs', city: 'Vancouver', tests: ['Bloodwork', 'X-Ray'] },
];

const SPECIALISTS = [
  { id: 'cardio-lakeview', name: 'Dr. Ava Norris', org: 'Lakeview Cardiology', specialty: 'Cardiology', city: 'Winnipeg', contact: 'cardio@lakeview.ca' },
  { id: 'ortho-clarity', name: 'Dr. Liam Patel', org: 'Clarity Orthopedics', specialty: 'Orthopedics', city: 'Toronto', contact: 'referrals@clarityortho.ca' },
  { id: 'neuro-meridian', name: 'Dr. Chloe Tran', org: 'Meridian Neuro Centre', specialty: 'Neurology', city: 'Vancouver', contact: 'neuro@meridian.ca' },
  { id: 'derm-sunrise', name: 'Dr. Noah Reyes', org: 'Sunrise Dermatology', specialty: 'Dermatology', city: 'Calgary', contact: 'hello@sunrisederm.ca' },
  { id: 'endo-clarion', name: 'Dr. Mila Chen', org: 'Clarion Endocrine Clinic', specialty: 'Endocrinology', city: 'Ottawa', contact: 'referrals@clarionendo.ca' },
];

// ---------- Middleware helpers ----------
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const withAuth = (handler) =>
  asyncHandler(async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const session = (
      await query('select * from sessions where token_hash = $1', [hash(token)])
    )[0];
    if (!session || session.expires_at < nowS()) return res.status(401).json({ error: 'unauthorized' });
    req.userId = session.user_id;
    return handler(req, res);
  });

const ALLOWED = (process.env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let allow = false;
  if (origin && ALLOWED.includes(origin)) allow = true;
  if (origin && origin.includes('localhost:5173')) allow = true;
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- Auth helpers ----------
async function getUserByEmail(email) {
  return (await query('select * from users where email=$1', [email]))[0];
}
async function getUserById(id) {
  return (await query('select * from users where id=$1', [id]))[0];
}
async function createUser(email) {
  return (
    await query('insert into users (email, created_at) values ($1,$2) returning *', [email, nowS()])
  )[0];
}
function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  query('insert into sessions (user_id, token_hash, expires_at, created_at) values ($1,$2,$3,$4)', [
    userId,
    hash(token),
    nowS() + SESSION_TTL_S,
    nowS(),
  ]).catch((err) => console.error('session error', err));
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: COOKIE_SECURE,
    maxAge: SESSION_TTL_S * 1000,
    path: '/',
  });
}

// ---------- Auth routes ----------
app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    await query('select 1');
    res.json({ ok: true });
  })
);

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    let user = await getUserByEmail(email);
    if (!user) user = await createUser(email);
    const ph = await argon2.hash(password);
    await query('update users set password_hash=$1 where id=$2', [ph, user.id]);
    res.json({ ok: true });
  })
);

app.post(
  '/api/auth/login-password',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await getUserByEmail(email);
    if (!user || !user.password_hash) return res.status(400).json({ error: 'invalid_credentials' });
    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) return res.status(400).json({ error: 'invalid_credentials' });
    issueSession(res, user.id);
    res.json({ ok: true });
  })
);

app.post(
  '/api/auth/start',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const force = Boolean(req.body?.force);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
    let user = await getUserByEmail(email);
    if (!user) user = await createUser(email);

    if (user.totp_enabled && !force) {
      return res.json({ mode: 'code' });
    }

    if (force) {
      await query(
        'update users set totp_enabled=false, totp_secret_encrypted=null, totp_temp_secret_encrypted=null where id=$1',
        [user.id]
      );
      user.totp_enabled = false;
      user.totp_secret_encrypted = null;
      user.totp_temp_secret_encrypted = null;
    }

    let secret = null;
    if (user.totp_temp_secret_encrypted && !force) {
      try {
        secret = decrypt(user.totp_temp_secret_encrypted);
      } catch (err) {
        await query('update users set totp_temp_secret_encrypted=null where id=$1', [user.id]);
        secret = null;
      }
    }
    if (!secret) {
      secret = authenticator.generateSecret();
      await query('update users set totp_temp_secret_encrypted=$1 where id=$2', [encrypt(secret), user.id]);
    }

    const otpauthUrl = authenticator.keyuri(email, 'MediLoop', secret);
    res.json({ mode: 'enroll', otpauthUrl, secret });
  })
);

app.post(
  '/api/auth/verify-enroll',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const user = await getUserByEmail(email);
    if (!user || !user.totp_temp_secret_encrypted) return res.status(400).json({ error: 'enroll_required' });
    let secret;
    try {
      secret = decrypt(user.totp_temp_secret_encrypted);
    } catch (err) {
      await query('update users set totp_temp_secret_encrypted=null where id=$1', [user.id]);
      return res.status(400).json({ error: 'enroll_required' });
    }
    const ok = authenticator.verify({ token: code, secret, window: 2 });
    if (!ok) return res.status(400).json({ error: 'invalid_code' });
    await query(
      'update users set totp_enabled=true, totp_secret_encrypted=$1, totp_temp_secret_encrypted=null where id=$2',
      [encrypt(secret), user.id]
    );
    issueSession(res, user.id);
    res.json({ ok: true });
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const user = await getUserByEmail(email);
    if (!user || !user.totp_enabled || !user.totp_secret_encrypted) return res.status(400).json({ error: 'enroll_required' });
    let secret;
    try {
      secret = decrypt(user.totp_secret_encrypted);
    } catch (err) {
      return res.status(400).json({ error: 'enroll_required' });
    }
    const ok = authenticator.verify({ token: code, secret, window: 2 });
    if (!ok) return res.status(400).json({ error: 'invalid_code' });
    issueSession(res, user.id);
    res.json({ ok: true });
  })
);

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return res.json({ user: null });
    const session = (
      await query('select * from sessions where token_hash=$1', [hash(token)])
    )[0];
    if (!session || session.expires_at < nowS()) return res.json({ user: null });
    const user = await getUserById(session.user_id);
    res.json({ user: { id: user.id, email: user.email } });
  })
);

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      await query('delete from sessions where token_hash=$1', [hash(token)]);
      res.clearCookie(SESSION_COOKIE, { path: '/' });
    }
    res.json({ ok: true });
  })
);

if (DEBUG) {
  app.get(
    '/api/auth/debug-totp',
    asyncHandler(async (req, res) => {
      const email = String(req.query.email || '').trim().toLowerCase();
      const user = await getUserByEmail(email);
      if (!user) return res.status(404).json({ error: 'not_found' });
      const encrypted = user.totp_temp_secret_encrypted || user.totp_secret_encrypted;
      if (!encrypted) return res.status(400).json({ error: 'no_secret' });
      const secret = decrypt(encrypted);
      res.json({ now: Date.now(), token: authenticator.generate(secret), secret });
    })
  );

  app.post(
    '/api/auth/admin/reset-user',
    asyncHandler(async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      let user = await getUserByEmail(email);
      if (!user) user = await createUser(email);
      await query('update users set totp_enabled=false, totp_secret_encrypted=null, totp_temp_secret_encrypted=null where id=$1', [user.id]);
      await query('delete from sessions where user_id=$1', [user.id]);
      res.json({ ok: true });
    })
  );
}

// ---------- Patients ----------
app.get(
  '/api/patients',
  withAuth(async (req, res) => {
    const patients = await query(
      'select id, name, dob, gender, phone, email, address, created_at from patients where user_id=$1 order by created_at desc limit 200',
      [req.userId]
    );
    res.json({ patients });
  })
);

app.post(
  '/api/patients',
  withAuth(async (req, res) => {
    const { name, dob, gender, phone, email, address } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name_required' });
    const id = crypto.randomBytes(6).toString('hex');
    await query(
      'insert into patients (id, user_id, name, dob, gender, phone, email, address, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, req.userId, name, dob || null, gender || null, phone || null, email || null, address || null, nowS()]
    );
    res.json({ id });
  })
);

app.get(
  '/api/patients/:id',
  withAuth(async (req, res) => {
    const patient = (
      await query('select * from patients where id=$1 and user_id=$2', [req.params.id, req.userId])
    )[0];
    if (!patient) return res.status(404).json({ error: 'not_found' });
    const notes = await query(
      'select id, content, soap_subjective, soap_objective, soap_assessment, soap_plan, attachments_json, created_at from patient_notes where patient_id=$1 and user_id=$2 order by created_at desc limit 200',
      [patient.id, req.userId]
    );
    const formattedNotes = notes.map((note) => ({
      id: note.id,
      patientId: patient.id,
      content: note.content,
      soap: {
        subjective: note.soap_subjective,
        objective: note.soap_objective,
        assessment: note.soap_assessment,
        plan: note.soap_plan,
      },
      attachments: note.attachments_json ? JSON.parse(note.attachments_json) : [],
      createdAt: note.created_at,
    }));
    const appointments = await query(
      'select id, patient_id, start_ts, reason from appointments where patient_id=$1 and user_id=$2 order by start_ts desc limit 200',
      [patient.id, req.userId]
    );
    const labs = await query(
      'select id, patient_id, test, lab_name, lab_city, status, notes, created_at from lab_orders where patient_id=$1 and user_id=$2 order by created_at desc limit 200',
      [patient.id, req.userId]
    );
    const files = await query(
      'select id, filename, mime, size, created_at from patient_files where patient_id=$1 and user_id=$2 order by created_at desc',
      [patient.id, req.userId]
    );
    res.json({
      patient: {
        id: patient.id,
        name: patient.name,
        dob: patient.dob,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        createdAt: patient.created_at,
      },
      notes: formattedNotes,
      appointments,
      labs,
      files,
    });
  })
);

app.put(
  '/api/patients/:id',
  withAuth(async (req, res) => {
    const existing = (
      await query('select * from patients where id=$1 and user_id=$2', [req.params.id, req.userId])
    )[0];
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const { name, dob, gender, phone, email, address } = req.body || {};
    await query(
      'update patients set name=$1, dob=$2, gender=$3, phone=$4, email=$5, address=$6 where id=$7 and user_id=$8',
      [
        name ?? existing.name,
        dob ?? existing.dob,
        gender ?? existing.gender,
        phone ?? existing.phone,
        email ?? existing.email,
        address ?? existing.address,
        existing.id,
        req.userId,
      ]
    );
    res.json({ ok: true });
  })
);

app.post(
  '/api/patients/:id/notes',
  withAuth(async (req, res) => {
    const patient = (
      await query('select * from patients where id=$1 and user_id=$2', [req.params.id, req.userId])
    )[0];
    if (!patient) return res.status(404).json({ error: 'not_found' });
    const { content, soapSubjective, soapObjective, soapAssessment, soapPlan, attachments } = req.body || {};
    if (
      !content &&
      !soapSubjective &&
      !soapObjective &&
      !soapAssessment &&
      !soapPlan
    ) {
      return res.status(400).json({ error: 'content_required' });
    }
    await query(
      `insert into patient_notes
      (patient_id, user_id, content, soap_subjective, soap_objective, soap_assessment, soap_plan, attachments_json, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        patient.id,
        req.userId,
        content || null,
        soapSubjective || null,
        soapObjective || null,
        soapAssessment || null,
        soapPlan || null,
        attachments && attachments.length ? JSON.stringify(attachments) : null,
        nowS(),
      ]
    );
    res.json({ ok: true });
  })
