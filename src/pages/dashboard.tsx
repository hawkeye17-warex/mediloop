import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type UserProfile = { email: string; specialty?: string; role?: string };
type Me = { user: UserProfile | null };

type Patient = {
  id: string;
  name: string;
  dob?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  createdAt: number;
};

type PatientsRes = { patients: Patient[] };

type Appointment = {
  id: number;
  patientId: string;
  startTs: number;
  reason?: string | null;
  patient?: { id: string; name: string };
};

type AppointmentsRes = { appointments: Appointment[] };

type Lab = { name: string; city: string; tests: string[] };
type LabsRes = { labs: Lab[] };

type LabOrder = {
  id: number;
  patientId: string;
  test: string;
  labName?: string | null;
  labCity?: string | null;
  status: string;
  notes?: string | null;
  createdAt: number;
};
type LabOrdersRes = { labOrders: LabOrder[] };

type Referral = {
  id: string;
  patientId: string;
  patientName: string;
  specialistId?: string | null;
  specialistName: string;
  specialistOrg?: string | null;
  status: string;
  reason?: string | null;
  notes?: string | null;
  urgency?: string | null;
  createdAt: number;
  updatedAt: number;
};
type ReferralsRes = { referrals: Referral[] };

type Specialist = { id: string; name: string; org?: string | null; specialty: string; city: string; contact?: string | null };
type SpecialistsRes = { specialists: Specialist[] };
type ModuleSummary = { id: string; name: string; summary: string; tagline?: string; features: string[]; comingSoon?: boolean };
type ModuleTemplateField = { id: string; label: string; type: 'textarea' | 'input'; placeholder?: string };
type ModuleTemplateSection = { id: string; title: string; description?: string; fields: ModuleTemplateField[] };
type ModuleTemplate = {
  id: string;
  name: string;
  template: {
    vitals: { id: string; label: string; unit?: string }[];
    sections: ModuleTemplateSection[];
    orders: { labs: string[]; meds: string[] };
  };
};
type ModulesRes = { modules: ModuleSummary[] };
type ModuleTemplateRes = { module: ModuleTemplate };
type Encounter = {
  id: string;
  patientId: string;
  patientName?: string;
  specialty: string;
  templateId: string;
  title: string;
  data: Record<string, any>;
  createdAt: number;
};
type EncountersRes = { encounters: Encounter[] };

const LAB_TESTS = ['Bloodwork', 'MRI', 'X-Ray', 'Ultrasound'];
const LAB_STATUSES = ['requested', 'scheduled', 'completed', 'cancelled'] as const;
const REFERRAL_STATUSES = ['pending', 'submitted', 'accepted', 'scheduled', 'closed'] as const;
const ISSUE_MEDICATIONS: Record<string, string[]> = {
  Hypertension: ['Lisinopril', 'Amlodipine', 'Losartan'],
  'Type 2 Diabetes': ['Metformin', 'Empagliflozin', 'Semaglutide'],
  'Chronic Pain': ['Gabapentin', 'Duloxetine', 'Tramadol'],
  Anxiety: ['Sertraline', 'Buspirone', 'Escitalopram'],
  'Respiratory Infection': ['Azithromycin', 'Amoxicillin', 'Levofloxacin'],
};
const ISSUE_OPTIONS = Object.keys(ISSUE_MEDICATIONS);
const DEFAULT_MEDICATIONS = Array.from(new Set(Object.values(ISSUE_MEDICATIONS).flat()));

const PATIENT_FORM_DEFAULT = {
  name: '',
  dob: '',
  gender: 'Female',
  phone: '',
  email: '',
  address: '',
};

const APPOINTMENT_FORM_DEFAULT = {
  patientId: '',
  date: '',
  time: '',
  reason: '',
  requireLab: false,
  labTest: LAB_TESTS[0],
  labNotes: '',
  requireMeds: false,
  issueKey: '',
  medication: '',
};

type ReferralFormState = {
  patientId: string;
  specialistQuery: string;
  specialistId: string;
  specialistName: string;
  specialistOrg: string;
  urgency: string;
  reason: string;
  notes: string;
};

const REFERRAL_FORM_DEFAULT: ReferralFormState = {
  patientId: '',
  specialistQuery: '',
  specialistId: '',
  specialistName: '',
  specialistOrg: '',
  urgency: 'routine',
  reason: '',
  notes: '',
};


const GP_VITAL_FIELDS = [
  { id: 'bloodPressure', label: 'Blood Pressure', unit: 'mmHg' },
  { id: 'heartRate', label: 'Heart Rate', unit: 'bpm' },
  { id: 'temperature', label: 'Temperature', unit: '°C' },
  { id: 'spo2', label: 'SpO₂', unit: '%' },
  { id: 'weight', label: 'Weight', unit: 'kg' },
];

const GP_ENCOUNTER_FORM = {
  patientId: '',
  visitType: 'Primary Care Visit',
  chiefComplaint: '',
  history: '',
  ros: '',
  exam: '',
  diagnostics: '',
  assessment: '',
  plan: '',
  followUp: '',
  education: '',
  vitals: {
    bloodPressure: '',
    heartRate: '',
    temperature: '',
    spo2: '',
    weight: '',
  },
  labs: [] as string[],
  meds: [] as string[],
};

type EncounterFormState = typeof GP_ENCOUNTER_FORM;
export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'Overview' | 'Patients' | 'Referrals' | 'Schedule' | 'Settings'>('Overview');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [labOrdersLoading, setLabOrdersLoading] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);

  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleSummary | null>(null);
  const [moduleTemplate, setModuleTemplate] = useState<ModuleTemplate | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [encountersLoading, setEncountersLoading] = useState(false);
  const [encounterForm, setEncounterForm] = useState<EncounterFormState>(GP_ENCOUNTER_FORM);
  const [encounterMessage, setEncounterMessage] = useState<string | null>(null);
  const [seedAttempted, setSeedAttempted] = useState(false);

  const [patientForm, setPatientForm] = useState(PATIENT_FORM_DEFAULT);
  const [patientFeedback, setPatientFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [patientSaving, setPatientSaving] = useState(false);
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);

  const [apptForm, setApptForm] = useState(APPOINTMENT_FORM_DEFAULT);
  const [apptStatus, setApptStatus] = useState<string | null>(null);
  const [labResults, setLabResults] = useState<Lab[]>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);

  const [referralForm, setReferralForm] = useState<ReferralFormState>(REFERRAL_FORM_DEFAULT);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [specialistResults, setSpecialistResults] = useState<Specialist[]>([]);
  const [specialistLoading, setSpecialistLoading] = useState(false);

  const userSpecialty = me?.specialty || 'general_physician';
  const userRole = me?.role || 'doctor';
  const userInitial = (me?.email?.charAt(0) || 'M').toUpperCase();
  const isReceptionist = userRole === 'receptionist';

  const handleSessionExpired = useCallback(() => {
    setMe(null);
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch('/auth/me');
        const data = await getJson<Me>(res);
        if (!ignore) {
          if (!data.user) setMe(null);
          else {
            setMe({
              email: data.user.email,
              specialty: data.user.specialty || 'general_physician',
              role: data.user.role || 'doctor',
            });
          }
        }
      } catch (err) {
        console.error('auth me error', err);
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!authLoading && !me) navigate('/login');
  }, [authLoading, me, navigate]);

  useEffect(() => {
    if (authLoading || !me) return;
    if (me.role === 'receptionist') {
      navigate('/reception', { replace: true });
    } else if (me.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [authLoading, me, navigate]);


  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const res = await apiFetch('/patients');
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load patients');
      const data = await getJson<PatientsRes>(res);
      setPatients(data.patients);
    } catch (err) {
      console.error(err);
      setPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    if (!authLoading && me && !seedAttempted && !patientsLoading && patients.length === 0) {
      setSeedAttempted(true);
      (async () => {
        try {
          await apiFetch('/demo/seed', { method: 'POST' });
          await loadPatients();
        } catch {
          // ignore
        }
      })();
    }
  }, [authLoading, me, seedAttempted, patientsLoading, patients.length, loadPatients]);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const res = await apiFetch('/appointments/upcoming');
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load appointments');
      const data = await getJson<AppointmentsRes>(res);
      setAppointments(data.appointments);
    } catch (err) {
      console.error(err);
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [handleSessionExpired]);

  const loadLabOrders = useCallback(async () => {
    setLabOrdersLoading(true);
    try {
      const res = await apiFetch('/lab-orders');
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load lab orders');
      const data = await getJson<LabOrdersRes>(res);
      setLabOrders(data.labOrders);
    } catch (err) {
      console.error(err);
      setLabOrders([]);
    } finally {
      setLabOrdersLoading(false);
    }
  }, [handleSessionExpired]);

  const loadReferrals = useCallback(async () => {
    setReferralsLoading(true);
    try {
      const res = await apiFetch('/referrals');
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load referrals');
      const data = await getJson<ReferralsRes>(res);
      setReferrals(data.referrals);
    } catch (err) {
      console.error(err);
      setReferrals([]);
    } finally {
      setReferralsLoading(false);
    }
  }, [handleSessionExpired]);

  const loadModules = useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await apiFetch('/modules');
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load modules');
      const data = await getJson<ModulesRes>(res);
      setModules(data.modules);
      const preferred = data.modules.find((m) => !m.comingSoon && m.id === userSpecialty);
      const fallback = data.modules.find((m) => !m.comingSoon) || null;
      setActiveModule(preferred || fallback);
    } catch (err) {
      console.error('modules error', err);
      setModules([]);
      setActiveModule(null);
    } finally {
      setModulesLoading(false);
    }
  }, [handleSessionExpired, userSpecialty]);

  const loadModuleTemplate = useCallback(async (moduleId: string) => {
    try {
      const res = await apiFetch(`/modules/${moduleId}/template`);
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load template');
      const data = await getJson<ModuleTemplateRes>(res);
      setModuleTemplate(data.module);
    } catch (err) {
      console.error('template load error', err);
      setModuleTemplate(null);
    }
  }, [handleSessionExpired]);

  const loadRecentEncounters = useCallback(async (specialtyId: string) => {
    setEncountersLoading(true);
    try {
      const res = await apiFetch(`/encounters/recent?specialty=${specialtyId}`);
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to load encounters');
      const data = await getJson<EncountersRes>(res);
      setEncounters(data.encounters);
    } catch (err) {
      console.error('encounter load error', err);
      setEncounters([]);
    } finally {
      setEncountersLoading(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    if (authLoading) return;
    if (me) void loadModules();
  }, [authLoading, me, loadModules]);

  useEffect(() => {
    if (!activeModule || activeModule.comingSoon) {
      setModuleTemplate(null);
      setEncounters([]);
      return;
    }
    void loadModuleTemplate(activeModule.id);
    void loadRecentEncounters(activeModule.id);
  }, [activeModule, loadModuleTemplate, loadRecentEncounters]);

  useEffect(() => {
    if (patients.length > 0 && !encounterForm.patientId) {
      setEncounterForm((prev: EncounterFormState) => ({ ...prev, patientId: prev.patientId || patients[0].id }));
    }
  }, [patients, encounterForm.patientId]);

  const searchSpecialists = useCallback(async (query: string) => {
    const term = query.trim();
    if (term.length < 2) {
      setSpecialistResults([]);
      return;
    }
    setSpecialistLoading(true);
    try {
      const res = await apiFetch(`/api/specialists?q=${encodeURIComponent(term)}`);
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) throw new Error('Failed to search specialists');
      const data = await getJson<SpecialistsRes>(res);
      setSpecialistResults(data.specialists);
    } catch (err) {
      console.error(err);
      setSpecialistResults([]);
    } finally {
      setSpecialistLoading(false);
    }
  }, [handleSessionExpired]);

  const handlePatientFormChange = (field: keyof typeof PATIENT_FORM_DEFAULT, value: string) => {
    setPatientForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleReferralField = (field: keyof ReferralFormState, value: string) => {
    if (field === 'specialistQuery') {
      setReferralForm((prev) => ({
        ...prev,
        specialistQuery: value,
        specialistName: value,
        specialistId: '',
        specialistOrg: value ? prev.specialistOrg : '',
      }));
      return;
    }
    setReferralForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!me) return;
    loadPatients();
    loadAppointments();
    loadLabOrders();
    loadReferrals();
  }, [me, loadPatients, loadAppointments, loadLabOrders, loadReferrals]);

  useEffect(() => {
    if (patients.length === 0) return;
    setApptForm((prev) => (prev.patientId ? prev : { ...prev, patientId: patients[0].id }));
  }, [patients]);

  useEffect(() => {
    if (patients.length === 0) return;
    setReferralForm((prev) => (prev.patientId ? prev : { ...prev, patientId: patients[0].id }));
  }, [patients]);

  useEffect(() => {
    const q = referralForm.specialistQuery.trim();
    if (q.length < 2) {
      setSpecialistResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void searchSpecialists(q);
    }, 300);
    return () => clearTimeout(handle);
  }, [referralForm.specialistQuery, searchSpecialists]);

  useEffect(() => {
    if (!referralMessage) return;
    const handle = setTimeout(() => setReferralMessage(null), 4000);
    return () => clearTimeout(handle);
  }, [referralMessage]);

  useEffect(() => {
    if (!apptForm.requireLab) {
      setSelectedLab(null);
      setLabResults([]);
      setLabError(null);
      return;
    }
    const patient = patients.find((p) => p.id === apptForm.patientId);
    if (!patient?.address) {
      setLabResults([]);
      setLabError('Add an address to suggest nearby labs.');
      return;
    }
    setLabLoading(true);
    setLabError(null);
    const params = new URLSearchParams({ address: patient.address, test: apptForm.labTest });
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/labs/nearby?${params.toString()}`);
        if (res.status === 401) return handleSessionExpired();
        if (!res.ok) throw new Error('lab_error');
        const data = await getJson<LabsRes>(res);
        if (!ignore) {
          setLabResults(data.labs);
          setSelectedLab(data.labs[0] ?? null);
        }
      } catch (err) {
        console.error(err);
        if (!ignore) {
          setLabResults([]);
          setLabError('No labs found for that test near this patient.');
        }
      } finally {
        if (!ignore) setLabLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [apptForm.requireLab, apptForm.labTest, apptForm.patientId, patients, handleSessionExpired]);

  useEffect(() => {
    if (!apptForm.issueKey) {
      setApptForm((prev) => ({ ...prev, medication: '' }));
      return;
    }
    setApptForm((prev) => {
      const meds = ISSUE_MEDICATIONS[prev.issueKey] || [];
      return { ...prev, medication: prev.medication && meds.includes(prev.medication) ? prev.medication : meds[0] ?? '' };
    });
  }, [apptForm.issueKey]);

  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);

  const vitalsDefinition = moduleTemplate?.template.vitals ?? GP_VITAL_FIELDS;
  const availableLabs = moduleTemplate?.template.orders.labs ?? ['CBC', 'CMP', 'A1C', 'Lipid Panel', 'Thyroid Panel'];
  const availableMeds = moduleTemplate?.template.orders.meds ?? DEFAULT_MEDICATIONS;

  const groupedAppointments = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    appointments.forEach((appt) => {
      const dayKey = new Date(appt.startTs * 1000).toDateString();
      if (!groups.has(dayKey)) groups.set(dayKey, []);
      groups.get(dayKey)!.push(appt);
    });
    return Array.from(groups.entries())
      .map(([key, list]) => ({ key, date: new Date(key), items: list.sort((a, b) => a.startTs - b.startTs) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [appointments]);

  const metrics = useMemo(() => {
    const uniquePatients = patients.length;
    const upcomingWeek = appointments.filter((a) => a.startTs * 1000 <= Date.now() + 7 * 24 * 60 * 60 * 1000).length;
    const referralsActive = referrals.filter((r) => r.status !== 'closed').length;
    const today = new Date().toDateString();
    const todayVisits = appointments.filter((a) => new Date(a.startTs * 1000).toDateString() === today).length;
    return [
      { label: 'Total Patients', value: uniquePatients.toString(), accent: '#1AA898' },
      { label: 'Today’s Visits', value: todayVisits.toString(), accent: '#122E3A' },
      { label: 'Next 7 Days', value: upcomingWeek.toString(), accent: '#BCC46A' },
      { label: 'Active Referrals', value: referralsActive.toString(), accent: '#FB923C' },
    ];
  }, [patients.length, appointments, referrals]);

  async function handleCreatePatient(e?: FormEvent, closeModal = false) {
    if (e) e.preventDefault();
    setPatientFeedback(null);
    if (!patientForm.name.trim()) {
      setPatientFeedback({ kind: 'error', message: 'Name is required.' });
      return;
    }
    setPatientSaving(true);
    try {
      const res = await apiFetch('/patients', { method: 'POST', json: patientForm });
      if (res.status === 401) return handleSessionExpired();
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Unable to add patient');
      setPatientForm(PATIENT_FORM_DEFAULT);
      setPatientFeedback({ kind: 'success', message: 'Patient saved.' });
      await loadPatients();
      if (closeModal) setShowAddPatientModal(false);
    } catch (err: any) {
      setPatientFeedback({ kind: 'error', message: err?.message || 'Unable to add patient' });
    } finally {
      setPatientSaving(false);
    }
  }

  async function handleCreateAppointment(e: FormEvent) {
    e.preventDefault();
    setApptStatus(null);
    const patientId = apptForm.patientId || patients[0]?.id;
    if (!patientId) {
      setApptStatus('Add a patient first.');
      return;
    }
    if (!apptForm.date || !apptForm.time) {
      setApptStatus('Choose a date and time.');
      return;
    }
    const start = new Date(`${apptForm.date}T${apptForm.time}`);
    if (Number.isNaN(start.getTime())) {
      setApptStatus('Invalid date/time.');
      return;
    }
    const reasonParts = [apptForm.reason.trim()].filter(Boolean);
    if (apptForm.requireLab) reasonParts.push(`Lab: ${apptForm.labTest}`);
    if (apptForm.requireMeds && apptForm.issueKey) reasonParts.push(`Rx: ${apptForm.issueKey}`);
    const noteContent = apptForm.requireMeds && apptForm.issueKey
      ? `Plan: ${apptForm.issueKey} -> ${apptForm.medication || 'tbd'}`
      : undefined;
    const labPayload = apptForm.requireLab && apptForm.labTest
      ? {
          test: apptForm.labTest,
          labName: selectedLab?.name,
          labCity: selectedLab?.city,
          notes: apptForm.labNotes?.trim() || undefined,
        }
      : undefined;
    try {
      const res = await apiFetch('/appointments', {
        method: 'POST',
        json: {
          patientId,
          startTs: Math.floor(start.getTime() / 1000),
          reason: reasonParts.join(' | ') || 'Consult',
          labOrder: labPayload,
          noteContent,
        },
      });
      if (res.status === 401) return handleSessionExpired();
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Unable to schedule appointment');
      setApptStatus('Appointment scheduled.');
      setApptForm(() => ({ ...APPOINTMENT_FORM_DEFAULT, patientId }));
      setSelectedLab(null);
      setLabResults([]);
      await Promise.all([loadAppointments(), loadLabOrders()]);
    } catch (err: any) {
      setApptStatus(err?.message || 'Unable to schedule appointment');
    }
  }

  async function handleCreateReferral(e: FormEvent) {
    e.preventDefault();
    setReferralMessage(null);
    const patientId = referralForm.patientId || patients[0]?.id;
    if (!patientId) {
      setReferralMessage('Add a patient first.');
      return;
    }
    if (!referralForm.specialistName.trim()) {
      setReferralMessage('Choose a specialist.');
      return;
    }
    try {
      const res = await apiFetch('/referrals', {
        method: 'POST',
        json: {
          patientId,
          specialistId: referralForm.specialistId || undefined,
          specialistName: referralForm.specialistName.trim(),
          specialistOrg: referralForm.specialistOrg || undefined,
          urgency: referralForm.urgency || 'routine',
          reason: referralForm.reason.trim() || undefined,
          notes: referralForm.notes.trim() || undefined,
        },
      });
      const info = await res.json().catch(() => null);
      if (!res.ok) throw new Error(info?.error || 'Unable to create referral');
      setReferralMessage('Referral submitted.');
      setReferralForm(() => ({
        ...REFERRAL_FORM_DEFAULT,
        patientId,
      }));
      setSpecialistResults([]);
      await loadReferrals();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create referral';
      setReferralMessage(message);
    }
  }

  async function handleReferralStatus(id: string, status: string) {
    try {
      const res = await apiFetch(`/api/referrals/${id}`, { method: 'PATCH', json: { status } });
      const info = await res.json().catch(() => null);
      if (!res.ok) throw new Error(info?.error || 'Unable to update referral');
      await loadReferrals();
    } catch (err) {
      console.error(err);
      setReferralMessage(err instanceof Error ? err.message : 'Unable to update referral');
    }
  }

  async function handleLabStatusChange(orderId: number, status: string) {
    try {
      const res = await apiFetch(`/api/lab-orders/${orderId}`, { method: 'PATCH', json: { status } });
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) {
        const info = await res.json();
        throw new Error(info?.error || 'Unable to update lab order');
      }
      await loadLabOrders();
    } catch (err) {
      console.error(err);
    }
  }

  function handleEncounterField(field: keyof EncounterFormState, value: any) {
    setEncounterForm((prev: EncounterFormState) => ({ ...prev, [field]: value }));
  }

  function handleVitalChange(field: keyof EncounterFormState['vitals'], value: string) {
    setEncounterForm((prev: EncounterFormState) => ({ ...prev, vitals: { ...prev.vitals, [field]: value } }));
  }

  function toggleEncounterList(field: 'labs' | 'meds', value: string) {
    setEncounterForm((prev: EncounterFormState) => {
      const exists = prev[field].includes(value);
      return {
        ...prev,
        [field]: exists ? prev[field].filter((item) => item !== value) : [...prev[field], value],
      };
    });
  }

  async function handleEncounterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEncounterMessage(null);
    if (!encounterForm.patientId) {
      setEncounterMessage('Select a patient before saving the encounter.');
      return;
    }
    try {
      const payload = {
        templateId: `${activeModule?.id || 'general_physician'}.core`,
        specialty: activeModule?.id || 'general_physician',
        title: encounterForm.visitType || 'Clinical visit',
        summary: encounterForm.chiefComplaint,
        vitals: encounterForm.vitals,
        sections: [
          {
            id: 'subjective',
            values: {
              chiefComplaint: encounterForm.chiefComplaint,
              history: encounterForm.history,
              ros: encounterForm.ros,
            },
          },
          {
            id: 'objective',
            values: {
              exam: encounterForm.exam,
              diagnostics: encounterForm.diagnostics,
            },
          },
          {
            id: 'assessment',
            values: { assessment: encounterForm.assessment },
          },
          {
            id: 'plan',
            values: { plan: encounterForm.plan, followUp: encounterForm.followUp, education: encounterForm.education },
          },
        ],
        orders: { labs: encounterForm.labs, meds: encounterForm.meds },
        plan: encounterForm.plan,
        notes: encounterForm.education,
      };
      const res = await apiFetch(`/patients/${encounterForm.patientId}/encounters`, { method: 'POST', json: payload });
      if (res.status === 401) return handleSessionExpired();
      if (!res.ok) {
        const info = await res.json().catch(() => null);
        throw new Error(info?.error || 'Unable to save encounter');
      }
      setEncounterForm((prev: EncounterFormState) => ({ ...GP_ENCOUNTER_FORM, patientId: prev.patientId }));
      setEncounterMessage('Encounter saved.');
      if (activeModule && !activeModule.comingSoon) {
        loadRecentEncounters(activeModule.id);
      }
    } catch (err) {
      console.error(err);
      setEncounterMessage(err instanceof Error ? err.message : 'Unable to save encounter');
    }
  }

  if (authLoading || !me) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading dashboard…</div>;
  }

  const issueMedOptions = apptForm.issueKey ? ISSUE_MEDICATIONS[apptForm.issueKey] ?? [] : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-14 flex items-center justify-between">
            <div className="font-semibold">MediLoop</div>
            <div className="flex items-center gap-3">
              <input className="hidden md:block w-64 text-sm rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1AA898]" placeholder="Search patients or notes" />
              <button className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#1AA898] text-[#1AA898] text-sm" onClick={() => setShowAddPatientModal(true)}>
                + Patient
              </button>
              <button className="w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-50" title="Notifications" aria-label="Notifications">
                ??
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#122E3A] to-[#1AA898] text-white flex items-center justify-center text-sm font-semibold">{userInitial}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 h-11">
            {(['Overview', 'Patients', 'Referrals', 'Schedule', 'Settings'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} aria-current={tab === t}
                className={`px-3 py-2 rounded-md text-sm transition-colors ${tab === t ? 'bg-[#1AA898]/10 text-[#0e7b6e] border border-[#1AA898]/20' : 'text-slate-700 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
            <div className="ml-auto">
              <button className="text-sm text-slate-600 hover:text-slate-900" onClick={() => { apiFetch('/auth/logout', { method: 'POST' }).then(() => navigate('/')); }}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {tab === 'Overview' && (
          <>
            <SpecialtyHero module={activeModule} modules={modules} loading={modulesLoading} />
            {isReceptionist ? (
              <section className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
                You are signed in as a receptionist. Manage the queue in the{' '}
                <a href="/reception" className="text-[#1AA898] underline">reception console</a>.
              </section>
            ) : (
              activeModule &&
              !activeModule.comingSoon && (
                <GeneralPhysicianComposer
                  patients={patients}
                  form={encounterForm}
                  vitals={vitalsDefinition}
                  labs={availableLabs}
                  meds={availableMeds}
                  message={encounterMessage}
                  onField={handleEncounterField}
                  onVital={handleVitalChange}
                  onToggle={toggleEncounterList}
                  onSubmit={handleEncounterSubmit}
                />
              )
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.map((metric) => (
                <StatCard key={metric.label} {...metric} />
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-semibold">Patients</h2>
                  <button className="text-sm text-[#1AA898] hover:underline" onClick={() => setTab('Patients')}>Manage</button>
                </header>
                <PatientTable patients={patients} loading={patientsLoading} />
              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">Lab follow-ups</h2>
                  <button className="text-xs text-[#1AA898]" onClick={loadLabOrders}>Refresh</button>
                </div>
                <LabOrdersSnapshot labOrders={labOrders} loading={labOrdersLoading} patientMap={patientMap} onUpdateStatus={handleLabStatusChange} />
              </section>
            </div>

            <section className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold">Referrals overview</h2>
                  <p className="text-xs text-slate-500">Recent outbound referrals and statuses</p>
                </div>
                <button className="text-sm text-[#1AA898]" onClick={() => setTab('Referrals')}>Open workspace</button>
              </div>
              <ReferralSnapshot referrals={referrals} loading={referralsLoading} />
            </section>

            <section className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold">Upcoming schedule</h2>
                    <p className="text-xs text-slate-500">Grouped by day with patient context</p>
                  </div>
                  <button className="text-sm text-[#1AA898]" onClick={() => setTab('Schedule')}>Full schedule</button>
                </div>
                {appointmentsLoading ? (
                  <p className="text-sm text-slate-500">Loading appointments…</p>
                ) : groupedAppointments.length === 0 ? (
                  <p className="text-sm text-slate-500">No upcoming appointments scheduled.</p>
                ) : (
                  <div className="space-y-5">
                    {groupedAppointments.map(({ key, date, items }) => (
                      <div key={key} className="border border-slate-200 rounded-lg">
                        <div className="px-4 py-2 bg-slate-50 text-sm font-medium text-slate-600">
                          {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {items.map((item) => (
                            <li key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div>
                                <p className="font-semibold text-[#122E3A]">{item.patient?.name || patientMap.get(item.patientId)?.name || 'Patient'}</p>
                                <p className="text-xs text-slate-500">{item.reason || 'Consult'}</p>
                              </div>
                              <div className="text-sm text-right">
                                <div className="font-medium">{formatTime(item.startTs)}</div>
                                <Link to={`/dashboard/patients/${item.patientId}`} className="text-xs text-[#1AA898] hover:underline">View chart</Link>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <h2 className="font-semibold">Quick actions</h2>
                <form className="space-y-3" onSubmit={handleCreateAppointment}>
                  <label className="block text-sm">
                    <span className="font-medium">Patient</span>
                    <select className="mt-1 w-full" value={apptForm.patientId} onChange={(e) => setApptForm((prev) => ({ ...prev, patientId: e.target.value }))}>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="font-medium">Date</span>
                      <input type="date" className="mt-1 w-full" value={apptForm.date} onChange={(e) => setApptForm((prev) => ({ ...prev, date: e.target.value }))} />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium">Time</span>
                      <input type="time" className="mt-1 w-full" value={apptForm.time} onChange={(e) => setApptForm((prev) => ({ ...prev, time: e.target.value }))} />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="font-medium">Reason / agenda</span>
                    <textarea className="mt-1 w-full" rows={2} value={apptForm.reason} onChange={(e) => setApptForm((prev) => ({ ...prev, reason: e.target.value }))} />
                  </label>

                  <div className="border border-slate-200 rounded-lg p-3 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={apptForm.requireLab} onChange={(e) => setApptForm((prev) => ({ ...prev, requireLab: e.target.checked }))} />
                      Require lab report?
                    </label>
                    {apptForm.requireLab && (
                      <div className="space-y-2 text-sm">
                        <label className="block">
                          <span className="font-medium">Test type</span>
                          <select className="mt-1 w-full" value={apptForm.labTest} onChange={(e) => setApptForm((prev) => ({ ...prev, labTest: e.target.value }))}>
                            {LAB_TESTS.map((test) => (
                              <option key={test} value={test}>{test}</option>
                            ))}
                          </select>
                        </label>
                        {labLoading && <p className="text-xs text-slate-500">Finding nearby labs…</p>}
                        {labError && <p className="text-xs text-amber-600">{labError}</p>}
                        {!labLoading && labResults.length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-auto">
                            {labResults.map((lab) => (
                              <label key={lab.name} className={`flex items-start gap-2 border rounded-lg px-2 py-2 text-xs ${selectedLab?.name === lab.name ? 'border-[#1AA898] bg-[#1AA898]/5' : 'border-slate-200'}`}>
                                <input type="radio" name="lab-choice" checked={selectedLab?.name === lab.name} onChange={() => setSelectedLab(lab)} />
                                <span>
                                  <span className="font-semibold text-slate-700">{lab.name}</span>
                                  <span className="block text-slate-500">{lab.city} · {lab.tests.join(', ')}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        <textarea className="w-full" rows={2} placeholder="Special instructions" value={apptForm.labNotes} onChange={(e) => setApptForm((prev) => ({ ...prev, labNotes: e.target.value }))} />
                      </div>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={apptForm.requireMeds} onChange={(e) => setApptForm((prev) => ({ ...prev, requireMeds: e.target.checked }))} />
                      Plan prescription?
                    </label>
                    {apptForm.requireMeds && (
                      <div className="space-y-2 text-sm">
                        <label className="block">
                          <span className="font-medium">Primary issue</span>
                          <select className="mt-1 w-full" value={apptForm.issueKey} onChange={(e) => setApptForm((prev) => ({ ...prev, issueKey: e.target.value }))}>
                            <option value="">Select</option>
                            {ISSUE_OPTIONS.map((issue) => (
                              <option key={issue} value={issue}>{issue}</option>
                            ))}
                          </select>
                        </label>
                        {issueMedOptions.length > 0 && (
                          <label className="block">
                            <span className="font-medium">Medication</span>
                            <select className="mt-1 w-full" value={apptForm.medication} onChange={(e) => setApptForm((prev) => ({ ...prev, medication: e.target.value }))}>
                              {issueMedOptions.map((med) => (
                                <option key={med} value={med}>{med}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </div>

                  {apptStatus && <p className="text-xs text-slate-500">{apptStatus}</p>}
                  <button type="submit" className="w-full btn btn-primary py-2">Create appointment</button>
                </form>
              </div>
            </section>

            {activeModule && !activeModule.comingSoon && (
              <EncounterList encounters={encounters} loading={encountersLoading} patientMap={patientMap} />
            )}
          </>
        )}

        {tab === 'Patients' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
              <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Patients ({patients.length})</h2>
                  {patientsLoading && <p className="text-xs text-slate-500">Refreshing…</p>}
                </div>
                <button className="text-sm text-[#1AA898]" onClick={loadPatients}>Refresh</button>
              </header>
              <PatientTable patients={patients} loading={patientsLoading} />
            </section>
            <section className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold mb-4">Add patient</h2>
              <AddPatientForm
                form={patientForm}
                onChange={handlePatientFormChange}
                onSubmit={(e) => handleCreatePatient(e, false)}
                feedback={patientFeedback}
                saving={patientSaving}
              />
            </section>
          </div>
        )}

        {tab === 'Referrals' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-semibold">Create referral</h2>
              <ReferralComposer
                patients={patients}
                form={referralForm}
                onChange={handleReferralField}
                onSubmit={handleCreateReferral}
                specialists={specialistResults}
                specialistLoading={specialistLoading}
                message={referralMessage}
                onSelectSpecialist={(spec) => {
                  setReferralForm((prev) => ({
                    ...prev,
                    specialistId: spec.id,
                    specialistName: spec.name,
                    specialistOrg: spec.org || '',
                    specialistQuery: spec.name,
                  }));
                  setSpecialistResults([]);
                }}
              />
            </section>
            <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">Referral queue</h2>
                  <p className="text-xs text-slate-500">Track pending and accepted referrals.</p>
                </div>
                <button className="text-xs text-[#1AA898]" onClick={loadReferrals}>Refresh</button>
              </div>
              <ReferralTable
                referrals={referrals}
                loading={referralsLoading}
                onUpdateStatus={handleReferralStatus}
              />
            </section>
          </div>
        )}

        {tab === 'Schedule' && (
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Full schedule</h2>
              <button className="text-sm text-[#1AA898]" onClick={loadAppointments}>Refresh</button>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500">No appointments scheduled.</p>
            ) : (
              <div className="space-y-4">
                {appointments.map((appt) => (
                  <div key={appt.id} className="border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#122E3A]">{appt.patient?.name || patientMap.get(appt.patientId)?.name || 'Patient'}</p>
                      <p className="text-sm text-slate-500">{appt.reason || 'Consult'}</p>
                    </div>
                    <div className="text-sm text-right">
                      <p className="font-medium">{formatDate(appt.startTs)} · {formatTime(appt.startTs)}</p>
                      <Link className="text-xs text-[#1AA898]" to={`/dashboard/patients/${appt.patientId}`}>Open chart</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'Settings' && (
          <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 text-sm">
            <h2 className="font-semibold">Session</h2>
            <p>You are signed in as <span className="font-medium">{me?.email}</span>.</p>
            <p className="text-slate-500">Sessions auto-expire after 7 days of inactivity.</p>
          </section>
        )}
      </main>
      {showAddPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New patient</h2>
              <button className="text-slate-500 hover:text-slate-900" onClick={() => setShowAddPatientModal(false)}>×</button>
            </div>
            <AddPatientForm
              form={patientForm}
              onChange={handlePatientFormChange}
              onSubmit={(e) => handleCreatePatient(e, true)}
              feedback={patientFeedback}
              saving={patientSaving}
              submitLabel="Create patient"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-3xl font-bold" style={{ color: '#122E3A' }}>{value}</div>
      <div className="text-slate-500 text-sm mt-1">{label}</div>
      <div className="mt-3 h-1.5 rounded-full" style={{ background: accent }} />
    </div>
  );
}

type PatientFormState = typeof PATIENT_FORM_DEFAULT;

type AddPatientFormProps = {
  form: PatientFormState;
  onChange: (field: keyof PatientFormState, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  feedback: { kind: 'error' | 'success'; message: string } | null;
  saving: boolean;
  submitLabel?: string;
};

function AddPatientForm({ form, onChange, onSubmit, feedback, saving, submitLabel = 'Save patient' }: AddPatientFormProps) {
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="font-medium">Full name</span>
        <input className="mt-1 w-full" value={form.name} onChange={(e) => onChange('name', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">DOB</span>
          <input type="date" className="mt-1 w-full" value={form.dob} onChange={(e) => onChange('dob', e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Gender</span>
          <select className="mt-1 w-full" value={form.gender} onChange={(e) => onChange('gender', e.target.value)}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Phone</span>
        <input className="mt-1 w-full" value={form.phone} onChange={(e) => onChange('phone', e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Email</span>
        <input type="email" className="mt-1 w-full" value={form.email} onChange={(e) => onChange('email', e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Address</span>
        <textarea className="mt-1 w-full" rows={2} value={form.address} onChange={(e) => onChange('address', e.target.value)} />
      </label>
      {feedback && (
        <p className={`text-xs ${feedback.kind === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{feedback.message}</p>
      )}
      <button type="submit" className="w-full btn btn-primary py-2" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function PatientTable({ patients, loading }: { patients: Patient[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-500 px-4 py-6">Loading patients…</p>;
  if (patients.length === 0) return <p className="text-sm text-slate-500 px-4 py-6">No patients yet. Add one to get started.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Contact</th>
            <th className="px-4 py-2">Last update</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3 text-[#122E3A] font-medium">
                <Link to={`/dashboard/patients/${p.id}`} className="hover:underline">{p.name}</Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <div>{p.phone || '—'}</div>
                <div className="text-xs text-slate-500">{p.email || 'No email'}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{formatRelative(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LabOrdersSnapshot({ labOrders, loading, patientMap, onUpdateStatus }: {
  labOrders: LabOrder[];
  loading: boolean;
  patientMap: Map<string, Patient>;
  onUpdateStatus: (id: number, status: string) => Promise<void> | void;
}) {
  if (loading) return <p className="text-sm text-slate-500">Checking lab queue…</p>;
  if (labOrders.length === 0) return <p className="text-sm text-slate-500">No lab orders yet.</p>;
  return (
    <div className="space-y-3">
      {labOrders.slice(0, 4).map((order) => (
        <div key={order.id} className="border border-slate-200 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#122E3A]">{patientMap.get(order.patientId)?.name || 'Patient'}</p>
              <p className="text-xs text-slate-500">{order.test} · {order.labName || 'TBD'}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <select className="mt-2 w-full text-xs" value={order.status} onChange={(e) => onUpdateStatus(order.id, e.target.value)}>
            {LAB_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      ))}
      {labOrders.length > 4 && <p className="text-xs text-slate-500">+{labOrders.length - 4} more</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    requested: 'bg-amber-50 text-amber-700 border-amber-200',
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${colors[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{status}</span>;
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ReferralSnapshot({ referrals, loading }: { referrals: Referral[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-500">Loading referrals…</p>;
  if (referrals.length === 0) return <p className="text-sm text-slate-500">No referrals yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {referrals.slice(0, 4).map((ref) => (
        <li key={ref.id} className="border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#122E3A]">{ref.patientName}</p>
            <p className="text-xs text-slate-500">{ref.specialistName}</p>
          </div>
          <span className="text-xs text-slate-500 capitalize">{ref.status}</span>
        </li>
      ))}
    </ul>
  );
}

type ReferralComposerProps = {
  patients: Patient[];
  form: ReferralFormState;
  specialists: Specialist[];
  specialistLoading: boolean;
  message: string | null;
  onChange: (field: keyof ReferralFormState, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onSelectSpecialist: (spec: Specialist) => void;
};

function ReferralComposer({
  patients,
  form,
  specialists,
  specialistLoading,
  message,
  onChange,
  onSubmit,
  onSelectSpecialist,
}: ReferralComposerProps) {
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block text-sm">
        <span className="font-medium">Patient</span>
        <select className="mt-1 w-full" value={form.patientId} onChange={(e) => onChange('patientId', e.target.value)}>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Specialist</span>
        <input
          className="mt-1 w-full"
          placeholder="Search cardiology, Dr. Ava..."
          value={form.specialistQuery}
          onChange={(e) => {
            onChange('specialistQuery', e.target.value);
            onChange('specialistName', e.target.value);
          }}
        />
      </label>
      {specialistLoading && <p className="text-xs text-slate-500">Searching…</p>}
      {!specialistLoading && specialists.length > 0 && (
        <ul className="border border-slate-200 rounded-lg divide-y max-h-40 overflow-auto text-sm">
          {specialists.map((spec) => (
            <li key={spec.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-slate-50"
                onClick={() => onSelectSpecialist(spec)}
              >
                <p className="font-medium text-[#122E3A]">{spec.name}</p>
                <p className="text-xs text-slate-500">{spec.specialty} · {spec.city}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="block text-sm">
        <span className="font-medium">Clinic / Organization</span>
        <input className="mt-1 w-full" value={form.specialistOrg} onChange={(e) => onChange('specialistOrg', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="font-medium">Urgency</span>
          <select className="mt-1 w-full" value={form.urgency} onChange={(e) => onChange('urgency', e.target.value)}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
        </label>
        <label className="block">
          <span className="font-medium">Reason</span>
          <input className="mt-1 w-full" value={form.reason} onChange={(e) => onChange('reason', e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Notes</span>
        <textarea className="mt-1 w-full" rows={3} value={form.notes} onChange={(e) => onChange('notes', e.target.value)} />
      </label>
      {message && <p className="text-xs text-slate-500">{message}</p>}
      <button type="submit" className="w-full btn btn-primary py-2">Send referral</button>
    </form>
  );
}

type ReferralTableProps = {
  referrals: Referral[];
  loading: boolean;
  onUpdateStatus: (id: string, status: string) => Promise<void> | void;
};

function ReferralTable({ referrals, loading, onUpdateStatus }: ReferralTableProps) {
  if (loading) return <p className="text-sm text-slate-500">Loading referrals…</p>;
  if (referrals.length === 0) return <p className="text-sm text-slate-500">No referrals yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="px-3 py-2">Patient</th>
            <th className="px-3 py-2">Specialist</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((ref) => (
            <tr key={ref.id} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <p className="font-medium text-[#122E3A]">{ref.patientName}</p>
                <p className="text-xs text-slate-500">Urgency: {ref.urgency || 'routine'}</p>
              </td>
              <td className="px-3 py-2 text-slate-600">
                <div>{ref.specialistName}</div>
                <div className="text-xs text-slate-500">{ref.specialistOrg || '—'}</div>
              </td>
              <td className="px-3 py-2">
                <select
                  className="text-xs border border-slate-300 rounded-md"
                  value={ref.status}
                  onChange={(e) => onUpdateStatus(ref.id, e.target.value)}
                >
                  {REFERRAL_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{formatDate(ref.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRelative(tsSeconds: number) {
  const diff = Date.now() - tsSeconds * 1000;
  if (diff < 0) return 'Just now';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

type SpecialtyHeroProps = {
  module: ModuleSummary | null;
  modules: ModuleSummary[];
  loading: boolean;
};

function SpecialtyHero({ module, modules, loading }: SpecialtyHeroProps) {
  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">
        Loading specialty module…
      </section>
    );
  }
  if (!module) return null;
  const upcoming = modules.filter((m) => m.id !== module.id);
  return (
    <section className="bg-gradient-to-r from-[#122E3A] to-[#1AA898] text-white rounded-3xl p-6 shadow-xl flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-white/70">Active module</p>
        <h2 className="text-2xl font-bold">{module.name}</h2>
        <p className="text-sm text-white/80 mt-1">{module.summary}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {module.features.map((feature) => (
          <span key={feature} className="px-3 py-1 rounded-full bg-white/10 text-xs">{feature}</span>
        ))}
      </div>
      {upcoming.length > 0 && (
        <div className="text-xs text-white/80 space-y-1">
          <p className="font-semibold">Coming soon</p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((m) => (
              <span key={m.id} className="px-3 py-1 rounded-full border border-white/30">
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type ComposerProps = {
  patients: Patient[];
  form: EncounterFormState;
  vitals: { id: string; label: string; unit?: string }[];
  labs: string[];
  meds: string[];
  message: string | null;
  onField: (field: keyof EncounterFormState, value: any) => void;
  onVital: (field: keyof EncounterFormState['vitals'], value: string) => void;
  onToggle: (field: 'labs' | 'meds', value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

function GeneralPhysicianComposer({ patients, form, vitals, labs, meds, message, onField, onVital, onToggle, onSubmit }: ComposerProps) {
  if (patients.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
        Add a patient to start documenting encounters.
      </section>
    );
  }
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#122E3A]">General Physician Encounter</h2>
          <p className="text-sm text-slate-500">Vitals, SOAP notes, lab + medication orders.</p>
        </div>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid md:grid-cols-3 gap-4">
          <label className="text-sm">
            <span className="font-medium">Patient</span>
            <select className="mt-1 w-full" value={form.patientId} onChange={(e) => onField('patientId', e.target.value)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Visit type</span>
            <input className="mt-1 w-full" value={form.visitType} onChange={(e) => onField('visitType', e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Chief complaint</span>
            <input className="mt-1 w-full" value={form.chiefComplaint} onChange={(e) => onField('chiefComplaint', e.target.value)} />
          </label>
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          {vitals.map((vital) => (
            <label key={vital.id} className="text-xs tracking-wide uppercase text-slate-500">
              {vital.label}
              <input
                className="mt-1 w-full"
                value={form.vitals[vital.id as keyof typeof form.vitals] as string}
                onChange={(e) => onVital(vital.id as keyof typeof form.vitals, e.target.value)}
                placeholder={vital.unit}
              />
            </label>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="font-medium">History of Present Illness</span>
            <textarea className="mt-1 w-full" rows={3} value={form.history} onChange={(e) => onField('history', e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Review of Systems</span>
            <textarea className="mt-1 w-full" rows={3} value={form.ros} onChange={(e) => onField('ros', e.target.value)} />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="font-medium">Physical Exam</span>
            <textarea className="mt-1 w-full" rows={3} value={form.exam} onChange={(e) => onField('exam', e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Diagnostics Ordered / Reviewed</span>
            <textarea className="mt-1 w-full" rows={3} value={form.diagnostics} onChange={(e) => onField('diagnostics', e.target.value)} />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="font-medium">Assessment</span>
            <textarea className="mt-1 w-full" rows={3} value={form.assessment} onChange={(e) => onField('assessment', e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Plan</span>
            <textarea className="mt-1 w-full" rows={3} value={form.plan} onChange={(e) => onField('plan', e.target.value)} />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="font-medium">Follow-up</span>
            <input className="mt-1 w-full" value={form.followUp} onChange={(e) => onField('followUp', e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Patient education / notes</span>
            <input className="mt-1 w-full" value={form.education} onChange={(e) => onField('education', e.target.value)} />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-2">Labs to order</p>
            <div className="flex flex-wrap gap-2">
              {labs.map((lab) => (
                <button
                  key={lab}
                  type="button"
                  onClick={() => onToggle('labs', lab)}
                  className={`px-3 py-1 rounded-full border text-xs ${form.labs.includes(lab) ? 'bg-[#1AA898]/10 border-[#1AA898] text-[#0e7b6e]' : 'border-slate-200 text-slate-600'}`}
                >
                  {lab}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Medications</p>
            <div className="flex flex-wrap gap-2">
              {meds.map((med) => (
                <button
                  key={med}
                  type="button"
                  onClick={() => onToggle('meds', med)}
                  className={`px-3 py-1 rounded-full border text-xs ${form.meds.includes(med) ? 'bg-[#1AA898]/10 border-[#1AA898] text-[#0e7b6e]' : 'border-slate-200 text-slate-600'}`}
                >
                  {med}
                </button>
              ))}
            </div>
          </div>
        </div>

        {message && <p className="text-xs text-[#1AA898]">{message}</p>}

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">Auto-saves to the encounters timeline.</div>
          <button type="submit" className="btn btn-primary px-6 py-2">Save encounter</button>
        </div>
      </form>
    </section>
  );
}

type EncounterListProps = {
  encounters: Encounter[];
  loading: boolean;
  patientMap: Map<string, Patient>;
};

function EncounterList({ encounters, loading, patientMap }: EncounterListProps) {
  if (loading) {
    return <section className="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">Loading recent encounters…</section>;
  }
  if (encounters.length === 0) {
    return <section className="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">No encounters documented yet.</section>;
  }
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-[#122E3A]">Recent encounters</h2>
          <p className="text-xs text-slate-500">Latest notes captured in the General Physician module.</p>
        </div>
      </div>
      <div className="space-y-3 max-h-[360px] overflow-auto pr-2">
        {encounters.map((enc) => (
          <article key={enc.id} className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>{enc.title}</span>
              <span>{new Date(enc.createdAt * 1000).toLocaleString()}</span>
            </div>
            <p className="text-sm font-medium text-[#122E3A]">
              {enc.patientName || patientMap.get(enc.patientId)?.name || 'Patient'}
            </p>
            {enc.data?.summary && <p className="text-sm text-slate-600 line-clamp-2">{String(enc.data.summary)}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}


