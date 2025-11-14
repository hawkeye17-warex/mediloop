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
  await query('alter table clinics add column if not exists settings jsonb default \'{}\'::jsonb');
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
  await query(`create table if not exists lab_orders (
    id uuid primary key default gen_random_uuid(),
    patient_id text not null,
    user_id uuid not null references users(id) on delete cascade,
    test text,
    lab_name text,
    lab_city text,
    status text default 'requested',
    notes text,
    created_at bigint not null
  )`);
  await query(`create table if not exists referrals (
    id uuid primary key default gen_random_uuid(),
    patient_id text not null,
    user_id uuid not null references users(id) on delete cascade,
    patient_name text,
    specialist_id text,
    specialist_name text,
    specialist_org text,
    status text default 'pending',
    reason text,
    notes text,
    urgency text,
    created_at bigint not null,
    updated_at bigint not null
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
  await query(`create table if not exists staff_invites (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid references clinics(id) on delete cascade,
    email text not null,
    role text not null,
    code text not null unique,
    status text not null default 'pending',
    expires_at bigint,
    created_by uuid references users(id),
    created_at bigint not null,
    accepted_at bigint,
    accepted_user_id uuid references users(id)
  )`);
  await query('create index if not exists idx_staff_invites_email on staff_invites(lower(email))');
}

ensureCoreSchema().catch((err) => {
  console.error('Failed to ensure core schema', err);
});

async function ensureClinicForUser(userId) {
  const user = await getUserById(userId);
  if (!user) throw new Error('user_not_found');
  if (user.clinic_id) return user.clinic_id;
  const localPart = (user.email || 'clinic').split('@')[0] || 'clinic';
  const slugBase = localPart.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'clinic';
  const slug = `${slugBase}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const defaults = buildDefaultSettings();
  const clinic = (
    await query(
      'insert into clinics (name, slug, address, owner_id, timezone, contact_email, created_at, settings) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [`${localPart} Clinic`, slug, null, userId, 'America/Toronto', user.email || null, nowS(), JSON.stringify(defaults)]
    )
  )[0];
  await query('update users set clinic_id=$1 where id=$2', [clinic.id, userId]);
  return clinic.id;
}

async function seedUserDemoData(userId) {
  const count = await query('select count(*)::int as count from patients where user_id=$1', [userId]);
  if (Number(count[0]?.count || 0) > 0) return;
  const now = nowS();
  const mkId = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'));
  const patientSeeds = [
    { id: mkId().slice(0, 12), name: 'Ava Patel', dob: '1985-04-12', gender: 'Female', phone: '555-0123', email: 'ava.patel@example.com', address: '123 King St, Toronto' },
    { id: mkId().slice(0, 12), name: 'Leo Martin', dob: '1978-11-02', gender: 'Male', phone: '555-0456', email: 'leo.martin@example.com', address: '77 Lakeshore Rd, Toronto' },
    { id: mkId().slice(0, 12), name: 'Priya Singh', dob: '1990-07-18', gender: 'Female', phone: '555-0822', email: 'priya.singh@example.com', address: '8 Yonge St, Toronto' },
    { id: mkId().slice(0, 12), name: 'Mateo Alvarez', dob: '1969-03-29', gender: 'Male', phone: '555-2334', email: 'mateo.alvarez@example.com', address: '442 Osborne Rd, Winnipeg' },
    { id: mkId().slice(0, 12), name: 'Sophia Chen', dob: '1998-01-05', gender: 'Female', phone: '555-3345', email: 'sophia.chen@example.com', address: '22 Robson St, Vancouver' },
  ];
  for (const patient of patientSeeds) {
    await query(
      'insert into patients (id, user_id, name, dob, gender, phone, email, address, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [patient.id, userId, patient.name, patient.dob, patient.gender, patient.phone, patient.email, patient.address, now]
    );
  }

  const appointmentSeeds = [
    { patientId: patientSeeds[0].id, offset: 3600, reason: 'Follow-up for hypertension', status: 'scheduled', triage: 'Bring BP log' },
    { patientId: patientSeeds[1].id, offset: 7200, reason: 'Chronic pain flare-up', status: 'arrived', triage: 'Prefers Dr. Shaw' },
    { patientId: patientSeeds[2].id, offset: 14400, reason: 'New patient physical', status: 'scheduled', triage: 'Complete intake package' },
    { patientId: patientSeeds[3].id, offset: 21600, reason: 'Lab review + med titration', status: 'in_room', triage: 'Prep CMP + lipid panel results' },
    { patientId: patientSeeds[4].id, offset: -5400, reason: 'Telehealth respiratory follow-up', status: 'completed', triage: 'Document antibiotic response' },
  ];
  for (const appt of appointmentSeeds) {
    await query(
      'insert into appointments (id, patient_id, user_id, clinic_id, start_ts, reason, status, triage_notes, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [mkId(), appt.patientId, userId, null, now + appt.offset, appt.reason, appt.status, appt.triage, now]
    );
  }

  const labSeeds = [
    { patientId: patientSeeds[0].id, test: 'CBC + A1C', labName: 'Prairie Labs - Downtown', labCity: 'Toronto', status: 'requested', notes: 'Routine check-up panel' },
    { patientId: patientSeeds[2].id, test: 'Lipid Panel + Thyroid', labName: 'HealthPlus Labs', labCity: 'Toronto', status: 'scheduled', notes: 'Fasting instructions sent' },
    { patientId: patientSeeds[3].id, test: 'MRI Spine', labName: 'Broadway Imaging', labCity: 'Toronto', status: 'completed', notes: 'Awaiting radiology report' },
  ];
  for (const order of labSeeds) {
    await query(
      'insert into lab_orders (id, patient_id, user_id, test, lab_name, lab_city, status, notes, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [mkId(), order.patientId, userId, order.test, order.labName, order.labCity, order.status, order.notes, now]
    );
  }

  const referralSeeds = [
    {
      patientId: patientSeeds[1].id,
      patientName: patientSeeds[1].name,
      specialistId: 'cardio-lakeview',
      specialistName: 'Dr. Ava Norris',
      specialistOrg: 'Lakeview Cardiology',
      status: 'pending',
      reason: 'Recurring chest tightness',
      notes: 'Share latest ECG',
      urgency: 'urgent',
    },
    {
      patientId: patientSeeds[2].id,
      patientName: patientSeeds[2].name,
      specialistId: 'endo-clarion',
      specialistName: 'Dr. Mila Chen',
      specialistOrg: 'Clarion Endocrine Clinic',
      status: 'submitted',
      reason: 'Difficult-to-control diabetes',
      notes: 'Include CGM download',
      urgency: 'routine',
    },
    {
      patientId: patientSeeds[4].id,
      patientName: patientSeeds[4].name,
      specialistId: 'derm-sunrise',
      specialistName: 'Dr. Noah Reyes',
      specialistOrg: 'Sunrise Dermatology',
      status: 'accepted',
      reason: 'Non-healing facial lesion',
      notes: 'Add dermoscopy photos',
      urgency: 'routine',
    },
  ];
  for (const referral of referralSeeds) {
    const id = mkId();
    const nowTs = now;
    await query(
      'insert into referrals (id, patient_id, user_id, patient_name, specialist_id, specialist_name, specialist_org, status, reason, notes, urgency, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        id,
        referral.patientId,
        userId,
        referral.patientName,
        referral.specialistId,
        referral.specialistName,
        referral.specialistOrg,
        referral.status,
        referral.reason,
        referral.notes,
        referral.urgency,
        nowTs,
        nowTs,
      ]
    );
  }
}

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
const SIGNUP_ROLES = ['doctor', 'receptionist'];

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

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_CLINIC_TIMINGS = WEEK_DAYS.reduce((acc, day) => {
  acc[day] = { open: '08:00', close: '17:00', closed: day === 'sun' };
  return acc;
}, {});
const PERMISSION_OPTIONS = ['appointments', 'queue', 'encounters', 'labs', 'referrals', 'billing', 'analytics', 'pharmacy'];
const DEFAULT_CLINIC_PERMISSIONS = {
  admin: ['appointments', 'queue', 'encounters', 'labs', 'referrals', 'billing', 'analytics', 'pharmacy'],
  doctor: ['appointments', 'encounters', 'labs', 'referrals', 'analytics'],
  receptionist: ['appointments', 'queue', 'billing'],
};
const DEFAULT_CLINIC_SETTINGS = {
  departments: ['Family Medicine'],
  specialties: ['General Physician'],
  timings: DEFAULT_CLINIC_TIMINGS,
  permissions: DEFAULT_CLINIC_PERMISSIONS,
};

const cloneTimings = () => JSON.parse(JSON.stringify(DEFAULT_CLINIC_TIMINGS));
const normalizeTimings = (timings = {}) => {
  const next = cloneTimings();
  for (const day of WEEK_DAYS) {
    const payload = timings?.[day] || {};
    next[day] = {
      open: typeof payload.open === 'string' && payload.open ? payload.open : next[day].open,
      close: typeof payload.close === 'string' && payload.close ? payload.close : next[day].close,
      closed: Boolean(payload.closed),
    };
  }
  return next;
};
const normalizePermissions = (perms = {}) => {
  const result = { ...DEFAULT_CLINIC_PERMISSIONS };
  for (const role of Object.keys(DEFAULT_CLINIC_PERMISSIONS)) {
    const list = Array.isArray(perms?.[role]) ? perms[role] : result[role];
    result[role] = Array.from(new Set(list.filter((p) => PERMISSION_OPTIONS.includes(p))));
  }
  return result;
};
const buildDefaultSettings = () => ({
  departments: [...DEFAULT_CLINIC_SETTINGS.departments],
  specialties: [...DEFAULT_CLINIC_SETTINGS.specialties],
  timings: cloneTimings(),
  permissions: normalizePermissions(),
});
const materializeClinicSettings = (raw = {}) => ({
  departments: Array.isArray(raw?.departments) && raw.departments.length ? raw.departments : [...DEFAULT_CLINIC_SETTINGS.departments],
  specialties: Array.isArray(raw?.specialties) && raw.specialties.length ? raw.specialties : [...DEFAULT_CLINIC_SETTINGS.specialties],
  timings: normalizeTimings(raw?.timings),
  permissions: normalizePermissions(raw?.permissions),
});

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

async function applyInviteToUser(email, userId) {
  const invite = (
    await query(
      `select * from staff_invites
       where lower(email)=$1 and status='pending'
       order by created_at desc
       limit 1`,
      [email.toLowerCase()]
    )
  )[0];
  if (!invite) return null;
  if (invite.expires_at && invite.expires_at < nowS()) {
    await query('update staff_invites set status=$1 where id=$2', ['expired', invite.id]);
    return null;
  }
  await query('update users set role=$1, clinic_id=coalesce(clinic_id, $2) where id=$3', [invite.role, invite.clinic_id, userId]);
  await query('update staff_invites set status=$1, accepted_at=$2, accepted_user_id=$3 where id=$4', [
    'accepted',
    nowS(),
    userId,
    invite.id,
  ]);
  return invite;
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
    const requestedRole = String(req.body?.role || '').trim();
    const role = SIGNUP_ROLES.includes(requestedRole) ? requestedRole : DEFAULT_ROLE;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'account_exists' });
    const user = await createUser(email, specialty, role);
    const ph = await argon2.hash(password);
    await query('update users set password_hash=$1 where id=$2', [ph, user.id]);
    await applyInviteToUser(email, user.id);
    await seedUserDemoData(user.id);
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
    const clinicId = await ensureClinicForUser(req.userId);
    const rows = await query(
      'select id, email, role, specialty, clinic_id, created_at from users where clinic_id=$1 order by created_at desc limit 200',
      [clinicId]
    );
    res.json({ users: rows });
  })
);

app.post(
  '/api/admin/users/invite',
  withRole(['admin'], async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = ROLES.includes(req.body?.role) ? req.body.role : DEFAULT_ROLE;
    const expiresDays = Math.max(1, Math.min(60, Number(req.body?.expiresDays) || 14));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
    const clinicId = await ensureClinicForUser(req.userId);
    const existing = await getUserByEmail(email);
    if (existing) {
      await query('update users set role=$1, clinic_id=$2 where id=$3', [role, clinicId, existing.id]);
      return res.json({ ok: true, existing: true });
    }
    const code = crypto.randomBytes(6).toString('hex');
    const invite = (
      await query(
        `insert into staff_invites (clinic_id, email, role, code, expires_at, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)
         returning id, email, role, code, status, expires_at, created_at`,
        [clinicId, email, role, code, nowS() + expiresDays * 86400, req.userId, nowS()]
      )
    )[0];
    res.json({ ok: true, invite });
  })
);

app.patch(
  '/api/admin/users/:id',
  withRole(['admin'], async (req, res) => {
    const role = ROLES.includes(req.body?.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: 'invalid_role' });
    const clinicId = await ensureClinicForUser(req.userId);
    await query('update users set role=$1 where id=$2 and clinic_id=$3', [role, req.params.id, clinicId]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/users/:id',
  withRole(['admin'], async (req, res) => {
    if (req.params.id === req.userId) return res.status(400).json({ error: 'cannot_remove_self' });
    const clinicId = await ensureClinicForUser(req.userId);
    await query('delete from users where id=$1 and clinic_id=$2', [req.params.id, clinicId]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/invites',
  withRole(['admin'], async (req, res) => {
    const clinicId = await ensureClinicForUser(req.userId);
    const rows = await query(
      `select id, email, role, code, status, expires_at, created_at, accepted_at
       from staff_invites
       where clinic_id=$1
       order by created_at desc
       limit 100`,
      [clinicId]
    );
    res.json({ invites: rows });
  })
);

app.post(
  '/api/admin/invites/:id/revoke',
  withRole(['admin'], async (req, res) => {
    const clinicId = await ensureClinicForUser(req.userId);
    await query('update staff_invites set status=$1 where id=$2 and clinic_id=$3 and status=$4', [
      'revoked',
      req.params.id,
      clinicId,
      'pending',
    ]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/clinic',
  withRole(['admin'], async (req, res) => {
    const clinicId = await ensureClinicForUser(req.userId);
    const clinic = (
      await query('select id, name, address, timezone, contact_email, settings from clinics where id=$1', [clinicId])
    )[0];
    const materialized = materializeClinicSettings(clinic?.settings || {});
    res.json({
      clinic: {
        id: clinicId,
        name: clinic?.name || 'Your Clinic',
        address: clinic?.address || '',
        timezone: clinic?.timezone || 'America/Toronto',
        contactEmail: clinic?.contact_email || '',
        departments: materialized.departments,
        specialties: materialized.specialties,
        timings: materialized.timings,
        permissions: materialized.permissions,
      },
    });
  })
);

app.put(
  '/api/admin/clinic',
  withRole(['admin'], async (req, res) => {
    const clinicId = await ensureClinicForUser(req.userId);
    const name = String(req.body?.name || '').trim();
    const address = typeof req.body?.address === 'string' ? req.body.address : null;
    const timezone = typeof req.body?.timezone === 'string' && req.body.timezone ? req.body.timezone : null;
    const contactEmail = typeof req.body?.contactEmail === 'string' ? req.body.contactEmail : null;
    const departments = Array.isArray(req.body?.departments)
      ? req.body.departments.map((d) => String(d).trim()).filter(Boolean)
      : DEFAULT_CLINIC_SETTINGS.departments;
    const specialties = Array.isArray(req.body?.specialties)
      ? req.body.specialties.map((d) => String(d).trim()).filter(Boolean)
      : DEFAULT_CLINIC_SETTINGS.specialties;
    const settings = {
      departments,
      specialties,
      timings: normalizeTimings(req.body?.timings || {}),
      permissions: normalizePermissions(req.body?.permissions || {}),
    };
    await query('update clinics set name=$1, address=$2, timezone=$3, contact_email=$4, settings=$5 where id=$6', [
      name || 'Untitled Clinic',
      address,
      timezone || 'America/Toronto',
      contactEmail,
      JSON.stringify(settings),
      clinicId,
    ]);
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
      `select a.id,
              a.patient_id as "patientId",
              a.start_ts as "startTs",
              a.reason,
              a.status,
              p.name as "patientName"
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

app.post(
  '/api/demo/seed',
  withAuth(async (req, res) => {
    await seedUserDemoData(req.userId);
    res.json({ ok: true });
  })
);

// ---------- Appointments ----------
app.post(
  '/api/appointments',
  withRole(['admin', 'doctor', 'receptionist'], async (req, res) => {
    const { patientId, startTs, reason } = req.body || {};
    if (!patientId || !startTs) return res.status(400).json({ error: 'invalid_input' });
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex');
    await query(
      'insert into appointments (id, patient_id, user_id, clinic_id, start_ts, reason, status, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, patientId, req.userId, req.userClinicId || null, Number(startTs), reason || null, 'scheduled', nowS()]
    );
    res.json({ id });
  })
);

// Already defined earlier? ensure referencing withRole.

// ---------- Lab Orders ----------
app.get(
  '/api/lab-orders',
  withAuth(async (req, res) => {
    const rows = await query(
      `select id,
              patient_id as "patientId",
              test,
              lab_name as "labName",
              lab_city as "labCity",
              status,
              notes,
              created_at as "createdAt"
       from lab_orders
       where user_id=$1
       order by created_at desc
       limit 200`,
      [req.userId]
    );
    res.json({ labOrders: rows });
  })
);

app.post(
  '/api/lab-orders',
  withRole(['admin', 'doctor', 'receptionist'], async (req, res) => {
    const { patientId, test, labName, labCity, notes } = req.body || {};
    if (!patientId || !test) return res.status(400).json({ error: 'invalid_input' });
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex');
    await query(
      'insert into lab_orders (id, patient_id, user_id, test, lab_name, lab_city, status, notes, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, patientId, req.userId, test, labName || null, labCity || null, 'requested', notes || null, nowS()]
    );
    res.json({ id });
  })
);

app.patch(
  '/api/lab-orders/:id',
  withRole(['admin', 'doctor', 'receptionist'], async (req, res) => {
    const { status, notes } = req.body || {};
    if (!status && !notes) return res.status(400).json({ error: 'no_changes' });
    await query(
      'update lab_orders set status=coalesce($1,status), notes=coalesce($2,notes) where id=$3 and user_id=$4',
      [status || null, notes || null, req.params.id, req.userId]
    );
    res.json({ ok: true });
  })
);

// ---------- Referrals ----------
app.get(
  '/api/referrals',
  withAuth(async (req, res) => {
    const rows = await query(
      `select id,
              patient_id as "patientId",
              patient_name as "patientName",
              specialist_id as "specialistId",
              specialist_name as "specialistName",
              specialist_org as "specialistOrg",
              status,
              reason,
              notes,
              urgency,
              created_at as "createdAt",
              updated_at as "updatedAt"
       from referrals
       where user_id=$1
       order by updated_at desc
       limit 200`,
      [req.userId]
    );
    res.json({ referrals: rows });
  })
);

app.post(
  '/api/referrals',
  withRole(['admin', 'doctor'], async (req, res) => {
    const {
      patientId,
      patientName,
      specialistId,
      specialistName,
      specialistOrg,
      urgency,
      reason,
      notes,
    } = req.body || {};
    if (!patientId || !specialistName) return res.status(400).json({ error: 'invalid_input' });
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex');
    const now = nowS();
    await query(
      `insert into referrals
        (id, patient_id, user_id, patient_name, specialist_id, specialist_name, specialist_org, status, reason, notes, urgency, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        patientId,
        req.userId,
        patientName || null,
        specialistId || null,
        specialistName,
        specialistOrg || null,
        'pending',
        reason || null,
        notes || null,
        urgency || 'routine',
        now,
        now,
      ]
    );
    res.json({ id });
  })
);

app.patch(
  '/api/referrals/:id',
  withRole(['admin', 'doctor'], async (req, res) => {
    const { status, notes } = req.body || {};
    if (!status && !notes) return res.status(400).json({ error: 'no_changes' });
    await query(
      'update referrals set status=coalesce($1,status), notes=coalesce($2,notes), updated_at=$3 where id=$4 and user_id=$5',
      [status || null, notes || null, nowS(), req.params.id, req.userId]
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

