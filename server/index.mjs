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

async function ensureSpecialtySchema() {
  try {
    await query('create extension if not exists "pgcrypto"');
  } catch (err) {
    console.warn('extension init failed', err);
  }
  await query('alter table users add column if not exists specialty text');
  await query('update users set specialty=$1 where specialty is null', [DEFAULT_SPECIALTY]);
  await query(`create table if not exists encounters (
    id uuid primary key default gen_random_uuid(),
    patient_id text not null,
    user_id uuid not null references users(id) on delete cascade,
    specialty text not null,
    template_id text,
    title text,
    data jsonb,
    created_at bigint not null
  )`);
  await query('create index if not exists idx_encounters_user on encounters(user_id)');
  await query('create index if not exists idx_encounters_patient on encounters(patient_id)');
}

ensureSpecialtySchema().catch((err) => {
  console.error('Failed to ensure specialty schema', err);
});

async function ensureCoreSchema() {
  await query(`create table if not exists clinics (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text,
    address text,
    owner_id uuid,
    timezone text,
    contact_email text,
    created_at bigint not null
  )`);
  await query('alter table users add column if not exists role text');
  await query('alter table users add column if not exists clinic_id uuid references clinics(id)');
  await query('update users set role = coalesce(role, $1)', [DEFAULT_ROLE]);
  await query(`create table if not exists appointments (
    id uuid primary key default gen_random_uuid(),
    patient_id text not null,
    user_id uuid not null references users(id) on delete cascade,
    clinic_id uuid,
    start_ts bigint not null,
    reason text,
    status text default 'scheduled',
    triage_notes text,
    created_at bigint not null
  )`);
  await query(`create table if not exists audit_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid,
    method text,
    path text,
    ip text,
    user_agent text,
    status integer,
    created_at bigint not null
  )`);
  await query('alter table patients add column if not exists clinic_id uuid');
}

ensureCoreSchema().catch((err) => {
  console.error('Failed to ensure core schema', err);
});

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


const DEFAULT_ROLE = 'doctor';
const ROLES = ['admin', 'doctor', 'receptionist'];

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

const DEFAULT_SPECIALTY = 'general_physician';
const SPECIALTY_MODULES = {
  general_physician: {
    id: 'general_physician',
    name: 'General Physician Suite',
    tagline: 'Vitals, SOAP notes, labs, prescriptions, referrals',
    summary:
      'Built for everyday primary-care workflows. Capture vitals, document a structured encounter, queue labs, issue prescriptions, and assign follow-ups in one pass.',
    features: ['Vitals dashboard', 'SOAP encounter composer', 'Lab + prescription orders', 'Referral tracking'],
    template: {
      vitals: [
        { id: 'bloodPressure', label: 'Blood Pressure', unit: 'mmHg' },
        { id: 'heartRate', label: 'Heart Rate', unit: 'bpm' },
        { id: 'temperature', label: 'Temperature', unit: '°C' },
        { id: 'spo2', label: 'SpO₂', unit: '%' },
        { id: 'weight', label: 'Weight', unit: 'kg' },
      ],
      sections: [
        {
          id: 'subjective',
          title: 'Subjective',
          description: 'Symptoms, concerns, ROS',
          fields: [
            { id: 'chiefComplaint', label: 'Chief Complaint', type: 'textarea', placeholder: 'Fatigue, headaches, etc.' },
            { id: 'history', label: 'History of Present Illness', type: 'textarea', placeholder: 'Timeline, triggers, relieving factors' },
            { id: 'ros', label: 'Review of Systems', type: 'textarea', placeholder: 'Pertinent positives / negatives' },
          ],
        },
        {
          id: 'objective',
          title: 'Objective',
          description: 'Exam findings, diagnostics',
          fields: [
            { id: 'exam', label: 'Physical Exam', type: 'textarea', placeholder: 'General appearance, cardio, resp, neuro...' },
            { id: 'diagnostics', label: 'Diagnostics Reviewed / Ordered', type: 'textarea', placeholder: 'Lab panels, imaging, ECG, etc.' },
          ],
        },
        {
          id: 'assessment',
          title: 'Assessment',
          description: 'Differential, ICD notes',
          fields: [
            { id: 'assessment', label: 'Assessment', type: 'textarea', placeholder: 'Dx with rationale' },
          ],
        },
        {
          id: 'plan',
          title: 'Plan',
          description: 'Treatment, follow-up, patient education',
          fields: [
            { id: 'plan', label: 'Plan', type: 'textarea', placeholder: 'Medication changes, lifestyle coaching, follow-up interval' },
            { id: 'followUp', label: 'Follow-up instructions', type: 'textarea', placeholder: 'Call back in 2 weeks, schedule lab draw, etc.' },
          ],
        },
      ],
      orders: {
        labs: ['CBC', 'CMP', 'A1C', 'Lipid Panel', 'Thyroid Panel', 'Urinalysis'],
        meds: ['Metformin', 'Lisinopril', 'Atorvastatin', 'Duloxetine', 'Gabapentin'],
      },
    },
  },
  ophthalmology: {
    id: 'ophthalmology',
    name: 'Ophthalmology Suite',
    summary: 'Refraction, OCT, slit lamp, IOP tracking.',
    tagline: 'OCT + refraction + IOP workflows',
    features: ['Visual acuity + refraction', 'OCT & fundus attachments', 'Tonometry & slit-lamp notes'],
    template: {
      vitals: [
        { id: 'acuityOD', label: 'VA OD', unit: '20/xx' },
        { id: 'acuityOS', label: 'VA OS', unit: '20/xx' },
        { id: 'iopOD', label: 'IOP OD', unit: 'mmHg' },
        { id: 'iopOS', label: 'IOP OS', unit: 'mmHg' },
        { id: 'refraction', label: 'Manifest Refraction' },
      ],
      sections: [
        {
          id: 'oph_history',
          title: 'Ophthalmic History',
          fields: [
            { id: 'ocularHistory', label: 'Ocular history', type: 'textarea', placeholder: 'Surgeries, trauma, chronic disease' },
            { id: 'systemicHistory', label: 'Systemic history', type: 'textarea' },
          ],
        },
        {
          id: 'exam',
          title: 'Exam / Imaging',
          fields: [
            { id: 'slitLamp', label: 'Slit lamp findings', type: 'textarea' },
            { id: 'oct', label: 'OCT / fundus notes', type: 'textarea' },
          ],
        },
        {
          id: 'plan',
          title: 'Plan',
          fields: [
            { id: 'ophAssessment', label: 'Assessment', type: 'textarea' },
            { id: 'ophPlan', label: 'Plan / procedures', type: 'textarea' },
          ],
        },
      ],
      orders: {
        labs: ['OCT', 'Visual Field', 'Corneal Topography', 'B-scan'],
        meds: ['Timolol', 'Latanoprost', 'Prednisolone acetate', 'Moxifloxacin'],
      },
    },
  },
  dermatology: {
    id: 'dermatology',
    name: 'Dermatology Suite',
    summary: 'Lesion mapping, biopsy tracking, telederm captures.',
    tagline: 'Lesion tracking and biopsy coordination',
    features: ['Lesion catalog', 'Biopsy + pathology tracking', 'Treatment plans'],
    template: {
      vitals: [
        { id: 'bodySurface', label: '% BSA involved', unit: '%' },
        { id: 'dermScore', label: 'Severity score', unit: '0-10' },
      ],
      sections: [
        {
          id: 'derm_history',
          title: 'Dermatologic History',
          fields: [
            { id: 'lesionHistory', label: 'History of present lesion', type: 'textarea' },
            { id: 'priorTherapies', label: 'Prior therapies', type: 'textarea' },
          ],
        },
        {
          id: 'lesion_map',
          title: 'Lesion Map',
          fields: [
            { id: 'lesionLocations', label: 'Locations & description', type: 'textarea', placeholder: 'e.g., A. left cheek, 1.2cm pearly papule' },
            { id: 'images', label: 'Imaging / dermatoscopy notes', type: 'textarea' },
          ],
        },
        {
          id: 'treatment',
          title: 'Treatment & Follow-up',
          fields: [
            { id: 'treatmentPlan', label: 'Treatment plan', type: 'textarea' },
            { id: 'biopsyPlan', label: 'Biopsy / pathology requests', type: 'textarea' },
          ],
        },
      ],
      orders: {
        labs: ['Punch biopsy', 'Shave biopsy', 'Pathology consult', 'Patch testing'],
        meds: ['Clobetasol', 'Doxycycline', 'Isotretinoin', 'Dupilumab'],
      },
    },
  },
  physiotherapy: {
    id: 'physiotherapy',
    name: 'Physiotherapy Suite',
    summary: 'Session notes, exercise plans, functional goals.',
    tagline: 'SOAP + functional outcome tracking',
    features: ['ROM tracking', 'Exercise prescriptions', 'Goal setting'],
    template: {
      vitals: [
        { id: 'painScore', label: 'Pain score', unit: '/10' },
        { id: 'rom', label: 'Key ROM measurement' },
      ],
      sections: [
        {
          id: 'subjective',
          title: 'Subjective',
          fields: [
            { id: 'painNarrative', label: 'Pain narrative', type: 'textarea' },
            { id: 'functionalGoals', label: 'Functional goals', type: 'textarea' },
          ],
        },
        {
          id: 'objective',
          title: 'Objective',
          fields: [
            { id: 'strength', label: 'Strength / ROM findings', type: 'textarea' },
            { id: 'specialTests', label: 'Special tests', type: 'textarea' },
          ],
        },
        {
          id: 'plan',
          title: 'Plan & Exercises',
          fields: [
            { id: 'sessionPlan', label: 'Session plan', type: 'textarea' },
            { id: 'homeExercise', label: 'Home exercise program', type: 'textarea' },
          ],
        },
      ],
      orders: {
        labs: ['Functional outcome measure', 'Gait analysis', 'Strength testing'],
        meds: ['NSAID advice', 'Topical analgesic', 'Muscle relaxant'],
      },
    },
  },
};

const SPECIALTY_IDS = Object.keys(SPECIALTY_MODULES);

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
    const user = await getUserById(session.user_id);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.userId = user.id;
    req.userRole = user.role || DEFAULT_ROLE;
    req.userSpecialty = user.specialty || DEFAULT_SPECIALTY;
    req.userClinicId = user.clinic_id || null;
    return handler(req, res);
  });

const withRole = (roles, handler) =>
  withAuth(async (req, res) => {
    const role = req.userRole || DEFAULT_ROLE;
    if (!roles.includes(role)) return res.status(403).json({ error: 'forbidden' });
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

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    query(
      'insert into audit_logs (user_id, method, path, ip, user_agent, status, created_at) values ($1,$2,$3,$4,$5,$6,$7)',
      [
        req.userId || null,
        req.method,
        req.originalUrl || req.url,
        req.headers['x-forwarded-for'] || req.ip || '',
        req.headers['user-agent'] || '',
        res.statusCode,
        nowS(),
      ]
    ).catch((err) => console.warn('audit log failed', err));
  });
  next();
});

// ---------- Auth helpers ----------
async function getUserByEmail(email) {
  return (await query('select * from users where email=$1', [email]))[0];
}
async function getUserById(id) {
  return (await query('select * from users where id=$1', [id]))[0];
}
async function createUser(email, specialty = DEFAULT_SPECIALTY, role = DEFAULT_ROLE, clinicId = null) {
  return (
    await query('insert into users (email, specialty, role, clinic_id, created_at) values ($1,$2,$3,$4,$5) returning *', [email, specialty, role, clinicId, nowS()])
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
    const requestedSpecialty = String(req.body?.specialty || '').trim();
    const specialty = SPECIALTY_IDS.includes(requestedSpecialty) ? requestedSpecialty : DEFAULT_SPECIALTY;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    let user = await getUserByEmail(email);
    if (!user) user = await createUser(email, specialty, DEFAULT_ROLE);
    else if (user.specialty !== specialty) {
      await query('update users set specialty=$1 where id=$2', [specialty, user.id]);
      user.specialty = specialty;
    }
    const ph = await argon2.hash(password);
    await query('update users set password_hash=$1 where id=$2', [ph, user.id]);
    res.json({ ok: true, role: user.role || DEFAULT_ROLE });
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
    res.json({ ok: true, role: user.role || DEFAULT_ROLE });
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
      } catch {
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
    res.json({ ok: true, role: user.role || DEFAULT_ROLE });
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
    res.json({ ok: true, role: user.role || DEFAULT_ROLE });
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
    if (!user) return res.json({ user: null });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        specialty: user.specialty || DEFAULT_SPECIALTY,
        role: user.role || DEFAULT_ROLE,
        clinicId: user.clinic_id || null,
      },
    });
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

// ---------- Admin ----------
app.get(
  '/api/admin/users',
  withRole(['admin'], async (req, res) => {
    const rows = await query(
      'select id, email, role, specialty, clinic_id, created_at from users order by created_at desc limit 200'
    );
    res.json({ users: rows });
  })
);

app.post(
  '/api/admin/users/invite',
  withRole(['admin'], async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = ROLES.includes(req.body?.role) ? req.body.role : DEFAULT_ROLE;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
    let user = await getUserByEmail(email);
    if (user) {
      await query('update users set role=$1 where id=$2', [role, user.id]);
      return res.json({ ok: true, existing: true });
    }
    user = await createUser(email, DEFAULT_SPECIALTY, role);
    res.json({ ok: true, userId: user.id });
  })
);

app.patch(
  '/api/admin/users/:id',
  withRole(['admin'], async (req, res) => {
    const role = ROLES.includes(req.body?.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: 'invalid_role' });
    await query('update users set role=$1 where id=$2', [role, req.params.id]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/audit',
  withRole(['admin'], async (req, res) => {
    const rows = await query(
      `select a.id, a.user_id, u.email, a.method, a.path, a.ip, a.user_agent, a.status, a.created_at
       from audit_logs a left join users u on a.user_id = u.id
       order by a.created_at desc
       limit 200`
    );
    res.json({ logs: rows });
  })
);

// ---------- Specialty modules ----------
app.get(
  '/api/modules',
  withAuth(async (req, res) => {
    const modules = Object.values(SPECIALTY_MODULES).map((mod) => ({
      id: mod.id,
      name: mod.name,
      summary: mod.summary,
      tagline: mod.tagline,
      features: mod.features,
      comingSoon: Boolean(mod.comingSoon),
    }));
    res.json({ modules });
  })
);

app.get(
  '/api/modules/:id/template',
  withAuth(async (req, res) => {
    const module = SPECIALTY_MODULES[req.params.id];
    if (!module || !module.template) return res.status(404).json({ error: 'not_found' });
    res.json({ module: { id: module.id, name: module.name, template: module.template } });
  })
);

app.get(
  '/api/encounters/recent',
  withAuth(async (req, res) => {
    const specialtyParam = String(req.query.specialty || '').trim();
    const specialty = SPECIALTY_IDS.includes(specialtyParam) ? specialtyParam : null;
    const rows = await query(
      `select e.id, e.title, e.specialty, e.template_id, e.data, e.created_at, e.patient_id, p.name as patient_name
       from encounters e
       join patients p on e.patient_id = p.id
       where e.user_id=$1 ${specialty ? 'and e.specialty=$2' : ''}
       order by e.created_at desc
       limit 30`,
      specialty ? [req.userId, specialty] : [req.userId]
    );
    const encounters = rows.map((row) => ({
      id: row.id,
      title: row.title,
      specialty: row.specialty,
      templateId: row.template_id,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {},
      createdAt: row.created_at,
      patientId: row.patient_id,
      patientName: row.patient_name,
    }));
    res.json({ encounters });
  })
);

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
app.get(
  '/api/patients/:id/encounters',
  withAuth(async (req, res) => {
    const patient = (
      await query('select id from patients where id=$1 and user_id=$2', [req.params.id, req.userId])
    )[0];
    if (!patient) return res.status(404).json({ error: 'not_found' });
    const rows = await query(
      'select id, title, specialty, template_id, data, created_at from encounters where patient_id=$1 and user_id=$2 order by created_at desc limit 100',
      [patient.id, req.userId]
    );
    const encounters = rows.map((row) => ({
      id: row.id,
      title: row.title,
      specialty: row.specialty,
      templateId: row.template_id,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {},
      createdAt: row.created_at,
      patientId: patient.id,
    }));
    res.json({ encounters });
  })
);

app.post(
  '/api/patients/:id/encounters',
  withAuth(async (req, res) => {
    const patient = (
      await query('select id from patients where id=$1 and user_id=$2', [req.params.id, req.userId])
    )[0];
    if (!patient) return res.status(404).json({ error: 'not_found' });
    const {
      templateId,
      title,
      summary,
      specialty: requestedSpecialty,
      vitals,
      sections,
      orders,
      plan,
      notes,
    } = req.body || {};
    const specialty = SPECIALTY_IDS.includes(requestedSpecialty) ? requestedSpecialty : DEFAULT_SPECIALTY;
    if (!title && !summary && !sections && !plan) {
      return res.status(400).json({ error: 'encounter_required' });
    }
    const encounterTitle = title || `Visit - ${new Date().toLocaleDateString()}`;
    const data = {
      summary: summary || '',
      vitals: vitals || {},
      sections: sections || [],
      orders: orders || {},
      plan: plan || '',
      notes: notes || '',
    };
    await query(
      'insert into encounters (patient_id, user_id, specialty, template_id, title, data, created_at) values ($1,$2,$3,$4,$5,$6,$7)',
      [patient.id, req.userId, specialty, templateId || `${specialty}.core`, encounterTitle, JSON.stringify(data), nowS()]
    );
    res.json({ ok: true });
  })
);

app.get(
  '/api/appointments/upcoming',
  withAuth(async (req, res) => {
    const rows = await query(
      `select a.id, a.patient_id, a.start_ts, a.reason, a.status, p.name as patient_name
       from appointments a
       left join patients p on p.id = a.patient_id
       where a.user_id=$1
       order by a.start_ts asc
       limit 200`,
      [req.userId]
    );
    res.json({ appointments: rows });
  })
);

app.patch(
  '/api/appointments/:id',
  withRole(['admin', 'doctor', 'receptionist'], async (req, res) => {
    const { status, reason, startTs } = req.body || {};
    if (!status && !reason && !startTs) return res.status(400).json({ error: 'no_changes' });
    await query(
      'update appointments set status=coalesce($1,status), reason=coalesce($2,reason), start_ts=coalesce($3,start_ts) where id=$4 and user_id=$5',
      [status || null, reason || null, startTs ? Number(startTs) : null, req.params.id, req.userId]
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
);

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log('[server] listening on http://localhost:' + PORT);
  });
}

export default app;

