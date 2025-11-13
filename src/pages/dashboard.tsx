import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type Me = { user: { email: string } | null };

type Patient = {
  id: string;
  name: string;
  dob?: string;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  createdAt: number;
};

type PatientsRes = { patients: Patient[] };

type Appointment = {
  id: number;
  patientId: string;
  startTs: number;
  reason?: string;
  patient?: Patient;
};

type AppointmentsRes = { appointments: Appointment[] };

type Lab = { name: string; city: string; tests: string[] };
type LabsRes = { labs: Lab[] };

const LAB_TESTS = ['Bloodwork', 'MRI', 'X-Ray', 'Ultrasound'];
const ISSUE_MEDICATIONS: Record<string, string[]> = {
  Hypertension: ['Lisinopril', 'Amlodipine', 'Losartan'],
  'Type 2 Diabetes': ['Metformin', 'Empagliflozin', 'Semaglutide'],
  'Chronic Pain': ['Gabapentin', 'Duloxetine', 'Tramadol'],
  Anxiety: ['Sertraline', 'Buspirone', 'Escitalopram'],
  'Respiratory Infection': ['Azithromycin', 'Amoxicillin', 'Levofloxacin'],
};

const ISSUE_OPTIONS = Object.keys(ISSUE_MEDICATIONS);

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
  requireMeds: false,
  issueKey: '',
  medication: '',
};

export default function DashboardPage() {
  const [me, setMe] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'Overview' | 'Patients' | 'Referrals' | 'Schedule' | 'Settings'>('Overview');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientForm, setPatientForm] = useState(PATIENT_FORM_DEFAULT);
  const [patientFormError, setPatientFormError] = useState<string | null>(null);
  const [patientSaving, setPatientSaving] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [apptForm, setApptForm] = useState(APPOINTMENT_FORM_DEFAULT);
  const [apptStatus, setApptStatus] = useState<string | null>(null);
  const [labResults, setLabResults] = useState<Lab[]>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);

  const navigate = useNavigate();

  // --- Auth & initial data ---
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        const data = await getJson<Me>(res);
        if (!ignore) setMe(data.user?.email ?? null);
      } catch (err) {
        console.error('me error', err);
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!authLoading && !me) navigate('/login');
  }, [authLoading, me, navigate]);

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const res = await apiFetch('/api/patients');
      if (!res.ok) throw new Error('Failed to load patients');
      const data = await getJson<PatientsRes>(res);
      setPatients(data.patients);
    } catch (err) {
      console.error(err);
      setPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const res = await apiFetch('/api/appointments/upcoming');
      if (!res.ok) throw new Error('Failed to load appointments');
      const data = await getJson<AppointmentsRes>(res);
      setAppointments(data.appointments);
    } catch (err) {
      console.error(err);
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    loadPatients();
    loadAppointments();
  }, [me, loadPatients, loadAppointments]);

  useEffect(() => {
    if (!patients.length) return;
    setApptForm((prev) => (prev.patientId ? prev : { ...prev, patientId: patients[0].id }));
  }, [patients]);

  const selectedPatient = useMemo(() => {
    if (!patients.length) return null;
    return patients.find((p) => p.id === apptForm.patientId) ?? patients[0];
  }, [patients, apptForm.patientId]);

  // Auto-fetch labs when requested
  useEffect(() => {
    let ignore = false;
    const shouldFetch = apptForm.requireLab && !!selectedPatient?.address && !!apptForm.labTest;
    if (!shouldFetch) {
      setLabResults([]);
      setLabError(apptForm.requireLab ? 'Add an address for this patient to suggest labs.' : null);
      return undefined;
    }
    setLabLoading(true);
    setLabError(null);
    const params = new URLSearchParams({ address: selectedPatient.address!, test: apptForm.labTest });
    (async () => {
      try {
        const res = await apiFetch(`/api/labs/nearby?${params.toString()}`);
        if (!res.ok) throw new Error('lab_error');
        const data = await getJson<LabsRes>(res);
        if (!ignore) setLabResults(data.labs);
      } catch {
        if (!ignore) {
          setLabResults([]);
          setLabError('No labs found for that test near this address.');
        }
      } finally {
        if (!ignore) setLabLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [apptForm.requireLab, apptForm.labTest, selectedPatient?.address]);

  const metrics = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const weekAhead = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    const todayCount = appointments.filter((a) => new Date(a.startTs * 1000).toDateString() === todayKey).length;
    const upcomingWeek = appointments.filter((a) => a.startTs * 1000 <= weekAhead).length;
    const labTagged = appointments.filter((a) => a.reason?.includes('Lab:')).length;
    return [
      { label: 'Total Patients', value: patients.length.toString(), accent: '#1AA898' },
      { label: 'Today’s Visits', value: todayCount.toString(), accent: '#122E3A' },
      { label: 'Next 7 Days', value: upcomingWeek.toString(), accent: '#BCC46A' },
      { label: 'Lab Follow-ups', value: labTagged.toString(), accent: '#FBECB8' },
    ];
  }, [patients.length, appointments]);

  const groupedAppointments = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((appt) => {
      const date = new Date(appt.startTs * 1000);
      const key = date.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    });
    return Array.from(map.entries())
      .map(([key, group]) => ({ key, date: new Date(key), items: group.sort((a, b) => a.startTs - b.startTs) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [appointments]);

  async function handleCreatePatient(e: FormEvent) {
    e.preventDefault();
    setPatientFormError(null);
    if (!patientForm.name.trim()) {
      setPatientFormError('Name is required.');
      return;
    }
    setPatientSaving(true);
    try {
      const res = await apiFetch('/api/patients', { method: 'POST', json: patientForm });
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Unable to add patient');
      setPatientForm(PATIENT_FORM_DEFAULT);
      await loadPatients();
      setPatientFormError('Patient added successfully.');
    } catch (err: any) {
      setPatientFormError(err?.message || 'Unable to add patient');
    } finally {
      setPatientSaving(false);
    }
  }

  async function handleCreateAppointment(e: FormEvent) {
    e.preventDefault();
    setApptStatus(null);
    if (!selectedPatient) {
      setApptStatus('Add a patient first.');
      return;
    }
    if (!apptForm.date || !apptForm.time) {
      setApptStatus('Choose a date and time.');
      return;
    }
    const start = new Date(`${apptForm.date}T${apptForm.time}`);
    if (Number.isNaN(start.getTime())) {
      setApptStatus('Invalid date or time.');
      return;
    }
    const reasonParts = [apptForm.reason.trim()].filter(Boolean);
    if (apptForm.requireLab) reasonParts.push(`Lab: ${apptForm.labTest}`);
    if (apptForm.requireMeds && apptForm.issueKey) {
      const med = apptForm.medication || ISSUE_MEDICATIONS[apptForm.issueKey]?.[0] || 'tbd';
      reasonParts.push(`Rx: ${apptForm.issueKey} (${med})`);
    }
    try {
      const res = await apiFetch('/api/appointments', {
        method: 'POST',
        json: {
          patientId: apptForm.patientId || selectedPatient.id,
          startTs: Math.floor(start.getTime() / 1000),
          reason: reasonParts.join(' | ') || 'Consult',
        },
      });
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Unable to schedule appointment');
      setApptForm((prev) => ({ ...APPOINTMENT_FORM_DEFAULT, patientId: prev.patientId || selectedPatient.id }));
      setLabResults([]);
      setApptStatus('Appointment scheduled.');
      await loadAppointments();
    } catch (err: any) {
      setApptStatus(err?.message || 'Unable to schedule appointment');
    }
  }

  if (authLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Checking access…
      </div>
    );
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
              <button className="w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-50" title="Notifications">🔔</button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#122E3A] to-[#1AA898] text-white flex items-center justify-center text-sm font-semibold">{(me || 'M')[0].toUpperCase()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 h-11">
            {(['Overview','Patients','Referrals','Schedule','Settings'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} aria-current={tab === t}
                className={`px-3 py-2 rounded-md text-sm transition-colors ${tab === t ? 'bg-[#1AA898]/10 text-[#0e7b6e] border border-[#1AA898]/20' : 'text-slate-700 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
            <div className="ml-auto">
              <button className="text-sm text-slate-600 hover:text-slate-900" onClick={() => { apiFetch('/api/auth/logout', { method: 'POST' }).then(() => navigate('/')); }}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {tab === 'Overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.map((metric) => (
                <StatCard key={metric.label} {...metric} />
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-semibold">Patients</h2>
                  <button className="text-sm text-[#1AA898] hover:underline" onClick={() => setTab('Patients')}>Add Patient</button>
                </header>
                <PatientTable patients={patients} loading={patientsLoading} />
              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-semibold mb-4">Referrals Snapshot</h2>
                <ReferralList patients={patients} />
              </section>
            </div>

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
                            <li key={item.id} className="px-4 py-3 flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-[#122E3A]">
                                  {item.patient?.name || patients.find((p) => p.id === item.patientId)?.name || 'Patient'}
                                </p>
                                <p className="text-xs text-slate-500">{item.reason || 'General consult'}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">{formatTime(item.startTs)}</div>
                                <Link to={`/dashboard/patients/${item.patientId}`} className="text-xs text-[#1AA898] hover:underline">
                                  View chart
                                </Link>
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
                          <div className="text-xs text-slate-600 space-y-1">
                            {labResults.slice(0, 3).map((lab) => (
                              <div key={lab.name} className="rounded-md border border-slate-200 px-2 py-1">
                                <p className="font-medium text-slate-700">{lab.name}</p>
                                <p>{lab.city}</p>
                                <p>Tests: {lab.tests.join(', ')}</p>
                              </div>
                            ))}
                          </div>
                        )}
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
                          <select className="mt-1 w-full" value={apptForm.issueKey} onChange={(e) => {
                            const issueKey = e.target.value;
                            const meds = ISSUE_MEDICATIONS[issueKey] || [];
                            setApptForm((prev) => ({ ...prev, issueKey, medication: meds[0] ?? '' }));
                          }}>
                            <option value="">Select</option>
                            {ISSUE_OPTIONS.map((issue) => (
                              <option key={issue} value={issue}>{issue}</option>
                            ))}
                          </select>
                        </label>
                        {!!issueMedOptions.length && (
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
              <form className="space-y-3" onSubmit={handleCreatePatient}>
                <label className="block text-sm">
                  <span className="font-medium">Full name</span>
                  <input className="mt-1 w-full" value={patientForm.name} onChange={(e) => setPatientForm((prev) => ({ ...prev, name: e.target.value }))} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="font-medium">DOB</span>
                    <input type="date" className="mt-1 w-full" value={patientForm.dob} onChange={(e) => setPatientForm((prev) => ({ ...prev, dob: e.target.value }))} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Gender</span>
                    <select className="mt-1 w-full" value={patientForm.gender} onChange={(e) => setPatientForm((prev) => ({ ...prev, gender: e.target.value }))}>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="font-medium">Phone</span>
                  <input className="mt-1 w-full" value={patientForm.phone} onChange={(e) => setPatientForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Email</span>
                  <input type="email" className="mt-1 w-full" value={patientForm.email} onChange={(e) => setPatientForm((prev) => ({ ...prev, email: e.target.value }))} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Address</span>
                  <textarea className="mt-1 w-full" rows={2} value={patientForm.address} onChange={(e) => setPatientForm((prev) => ({ ...prev, address: e.target.value }))} />
                </label>
                {patientFormError && <p className="text-xs text-slate-500">{patientFormError}</p>}
                <button type="submit" className="w-full btn btn-primary py-2" disabled={patientSaving}>
                  {patientSaving ? 'Saving…' : 'Save patient'}
                </button>
              </form>
            </section>
          </div>
        )}

        {tab === 'Referrals' && (
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold mb-4">Referral queue</h2>
            <ReferralList patients={patients} detailed />
          </section>
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
                  <div key={appt.id} className="border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#122E3A]">{appt.patient?.name || patients.find((p) => p.id === appt.patientId)?.name}</p>
                      <p className="text-sm text-slate-500">{appt.reason || 'Consult'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatDate(appt.startTs)} · {formatTime(appt.startTs)}</p>
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
            <p>You are signed in as <span className="font-medium">{me}</span>.</p>
            <p className="text-slate-500">Sessions auto-expire after 7 days of inactivity.</p>
          </section>
        )}
      </main>
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

function PatientTable({ patients, loading }: { patients: Patient[]; loading: boolean }) {
  if (loading) {
    return <p className="text-sm text-slate-500 px-4 py-6">Loading patients…</p>;
  }
  if (patients.length === 0) {
    return <p className="text-sm text-slate-500 px-4 py-6">No patients yet. Add one to get started.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-500">
        <tr className="border-b border-slate-200">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Contact</th>
          <th className="px-4 py-2">Last updated</th>
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
  );
}

function ReferralList({ patients, detailed = false }: { patients: Patient[]; detailed?: boolean }) {
  const items = useMemo(() => {
    if (!patients.length) {
      return [
        { patient: 'No patients yet', status: 'Draft', dept: '—', urgency: 'low' as const },
      ];
    }
    return patients.slice(0, 5).map((p, index) => ({
      patient: p.name,
      status: ['Pending', 'Sent', 'Accepted'][index % 3],
      dept: ['Cardiology', 'Dermatology', 'Neurology'][index % 3],
      urgency: (['normal', 'high', 'low'][index % 3] as 'normal' | 'high' | 'low'),
    }));
  }, [patients]);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.patient}-${item.dept}`} className="border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[#122E3A]">{item.patient}</p>
            <span className={`text-xs px-2 py-1 rounded-full border ${item.status === 'Accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {item.status}
            </span>
          </div>
          {detailed && (
            <div className="text-xs text-slate-500 mt-1">
              Department: {item.dept} · Urgency: {item.urgency}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
