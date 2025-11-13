import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type Me = { user: { email: string } | null };

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

type Note = { id: number; patientId: string; content: string; createdAt: number };

type Appointment = { id: number; patientId: string; startTs: number; reason?: string | null };

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

type PatientDetailRes = { patient: Patient; notes: Note[]; appointments: Appointment[]; labs: LabOrder[] };

type Lab = { name: string; city: string; tests: string[] };
type LabsRes = { labs: Lab[] };

const LAB_TESTS = ['Bloodwork', 'MRI', 'X-Ray', 'Ultrasound'];
const LAB_STATUS_OPTIONS = ['requested', 'scheduled', 'completed', 'cancelled'] as const;
const ISSUE_MEDICATIONS: Record<string, string[]> = {
  Hypertension: ['Lisinopril', 'Amlodipine', 'Losartan'],
  'Type 2 Diabetes': ['Metformin', 'Empagliflozin', 'Semaglutide'],
  'Chronic Pain': ['Gabapentin', 'Duloxetine', 'Tramadol'],
  Anxiety: ['Sertraline', 'Buspirone', 'Escitalopram'],
  'Respiratory Infection': ['Azithromycin', 'Amoxicillin', 'Levofloxacin'],
};

export default function PatientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [me, setMe] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [labs, setLabs] = useState<LabOrder[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', dob: '', gender: 'Female', phone: '', email: '', address: '' });
  const [editStatus, setEditStatus] = useState<string | null>(null);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteStatus, setNoteStatus] = useState<string | null>(null);

  const [needLab, setNeedLab] = useState(false);
  const [labTest, setLabTest] = useState(LAB_TESTS[0]);
  const [labResults, setLabResults] = useState<Lab[]>([]);
  const [labSearchStatus, setLabSearchStatus] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [labNote, setLabNote] = useState('');
  const [labActionStatus, setLabActionStatus] = useState<string | null>(null);
  const [labSaving, setLabSaving] = useState(false);

  const [issueKey, setIssueKey] = useState('');
  const [medication, setMedication] = useState('');

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        const data = await getJson<Me>(res);
        if (!ignore) setMe(data.user?.email ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!authLoading && !me) navigate('/login');
  }, [authLoading, me, navigate]);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`/api/patients/${id}`);
      if (!res.ok) {
        const info = await res.json();
        throw new Error(info?.error || 'Could not load patient');
      }
      const data = await getJson<PatientDetailRes>(res);
      setPatient(data.patient);
      setNotes(data.notes);
      setAppointments(data.appointments);
      setLabs(data.labs);
      setEditForm({
        name: data.patient.name,
        dob: data.patient.dob ?? '',
        gender: data.patient.gender ?? 'Female',
        phone: data.patient.phone ?? '',
        email: data.patient.email ?? '',
        address: data.patient.address ?? '',
      });
    } catch (err: any) {
      setDetailError(err?.message || 'Could not load patient');
    } finally {
      setDetailLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (me) fetchDetail();
  }, [me, fetchDetail]);

  useEffect(() => {
    let ignore = false;
    if (!needLab) {
      setLabResults([]);
      setLabSearchStatus(null);
      setSelectedLab(null);
      return () => { ignore = true; };
    }
    if (!patient?.address) {
      setLabSearchStatus('Add the patient address to fetch nearby labs.');
      return () => { ignore = true; };
    }
    setLabSearchStatus('Searching labs…');
    const params = new URLSearchParams({ address: patient.address, test: labTest });
    (async () => {
      try {
        const res = await apiFetch(`/api/labs/nearby?${params.toString()}`);
        if (!res.ok) throw new Error('lab_error');
        const data = await getJson<LabsRes>(res);
        if (!ignore) {
          setLabResults(data.labs);
          setSelectedLab(data.labs[0] ?? null);
          setLabSearchStatus(data.labs.length ? null : 'No labs found.');
        }
      } catch {
        if (!ignore) {
          setLabResults([]);
          setLabSearchStatus('No labs found.');
        }
      }
    })();
    return () => { ignore = true; };
  }, [needLab, labTest, patient?.address]);

  useEffect(() => {
    if (!issueKey) {
      setMedication('');
      return;
    }
    const meds = ISSUE_MEDICATIONS[issueKey] || [];
    setMedication((prev) => (prev && meds.includes(prev) ? prev : meds[0] ?? ''));
  }, [issueKey]);

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patient) return;
    setEditStatus(null);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}`, { method: 'PUT', json: editForm });
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Could not update patient');
      setEditStatus('Changes saved.');
      setEditing(false);
      await fetchDetail();
    } catch (err: any) {
      setEditStatus(err?.message || 'Could not update patient');
    }
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!patient || !noteText.trim()) {
      setNoteStatus('Write a note before saving.');
      return;
    }
    setNoteStatus(null);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}/notes`, { method: 'POST', json: { content: noteText.trim() } });
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Could not add note');
      setNoteText('');
      setShowNoteForm(false);
      await fetchDetail();
      setNoteStatus('Note added.');
    } catch (err: any) {
      setNoteStatus(err?.message || 'Could not add note');
    }
  }

  async function handleCreateLabOrder() {
    if (!patient || !selectedLab) {
      setLabActionStatus('Select a lab to create an order.');
      return;
    }
    setLabSaving(true);
    setLabActionStatus(null);
    try {
      const res = await apiFetch('/api/lab-orders', {
        method: 'POST',
        json: {
          patientId: patient.id,
          test: labTest,
          labName: selectedLab.name,
          labCity: selectedLab.city,
          notes: labNote.trim() || undefined,
        },
      });
      const info = await res.json();
      if (!res.ok) throw new Error(info?.error || 'Could not create lab order');
      setLabActionStatus('Lab order created.');
      setLabNote('');
      setNeedLab(false);
      await fetchDetail();
    } catch (err: any) {
      setLabActionStatus(err?.message || 'Could not create lab order');
    } finally {
      setLabSaving(false);
    }
  }

  async function handleLabStatusChange(orderId: number, status: string) {
    try {
      const res = await apiFetch(`/api/lab-orders/${orderId}`, { method: 'PATCH', json: { status } });
      if (!res.ok) {
        const info = await res.json();
        throw new Error(info?.error || 'Unable to update lab order');
      }
      await fetchDetail();
    } catch (err) {
      console.error(err);
    }
  }

  if (authLoading || detailLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        Fetching patient record…
      </div>
    );
  }

  if (detailError || !patient) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
          <p className="text-xl font-semibold">{detailError ?? 'Patient not found'}</p>
          <button onClick={() => navigate('/dashboard')} className="text-[#1AA898] hover:underline text-sm">Back to dashboard</button>
        </div>
      </div>
    );
  }

  const issueOptions = useMemo(() => Object.keys(ISSUE_MEDICATIONS), []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-slate-600 hover:text-slate-900">← Back</button>
            <div className="font-semibold">Patient chart</div>
          </div>
          <div className="text-xs text-slate-500">Signed in as {me}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{patient.name}</h1>
              <p className="text-sm text-slate-500">
                DOB {patient.dob || '—'} · {patient.gender || '—'}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="text-sm rounded-md border border-slate-300 px-3 py-2 hover:bg-slate-50" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
              <button className="text-sm rounded-md bg-[#1AA898] text-white px-3 py-2 hover:opacity-90" onClick={() => setShowNoteForm((v) => !v)}>
                {showNoteForm ? 'Close note' : 'New Note'}
              </button>
            </div>
          </div>

          {editing ? (
            <form className="grid md:grid-cols-2 gap-4 mt-4" onSubmit={handleEditSubmit}>
              <label className="text-sm">
                <span className="font-medium">Name</span>
                <input className="mt-1 w-full" value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="font-medium">DOB</span>
                <input type="date" className="mt-1 w-full" value={editForm.dob} onChange={(e) => setEditForm((prev) => ({ ...prev, dob: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="font-medium">Gender</span>
                <select className="mt-1 w-full" value={editForm.gender} onChange={(e) => setEditForm((prev) => ({ ...prev, gender: e.target.value }))}>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="font-medium">Phone</span>
                <input className="mt-1 w-full" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="font-medium">Email</span>
                <input type="email" className="mt-1 w-full" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="font-medium">Address</span>
                <textarea className="mt-1 w-full" rows={2} value={editForm.address} onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))} />
              </label>
              {editStatus && <p className="text-xs text-slate-500">{editStatus}</p>}
              <div className="md:col-span-2">
                <button type="submit" className="btn btn-primary px-4 py-2">Save changes</button>
              </div>
            </form>
          ) : (
            <div className="grid md:grid-cols-3 gap-6 mt-4 text-sm text-slate-600">
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <p>{patient.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p>{patient.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Address</p>
                <p>{patient.address || '—'}</p>
              </div>
            </div>
          )}
        </section>

        {showNoteForm && (
          <section className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Add clinical note</h2>
            <form className="space-y-3" onSubmit={handleAddNote}>
              <textarea className="w-full" rows={3} placeholder="Subjective, Objective, Assessment, Plan…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              {noteStatus && <p className="text-xs text-slate-500">{noteStatus}</p>}
              <button type="submit" className="btn btn-primary px-4 py-2">Save note</button>
            </form>
          </section>
        )}

        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Notes</h2>
              <span className="text-xs text-slate-500">{notes.length} entries</span>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500">No notes yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {notes.map((note) => (
                  <li key={note.id} className="border border-slate-200 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">{new Date(note.createdAt * 1000).toLocaleString()}</p>
                    <p>{note.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Recent appointments</h2>
              <span className="text-xs text-slate-500">{appointments.length}</span>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500">No visits recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {appointments.map((appt) => (
                  <li key={appt.id} className="border border-slate-200 rounded-lg p-3">
                    <p className="font-medium text-[#122E3A]">{formatDate(appt.startTs)} · {formatTime(appt.startTs)}</p>
                    <p className="text-slate-500">{appt.reason || 'General consult'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Lab planning</h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={needLab} onChange={(e) => setNeedLab(e.target.checked)} /> Need lab?
              </label>
            </div>
            {needLab ? (
              <>
                <label className="text-sm">
                  <span className="font-medium">Test</span>
                  <select className="mt-1 w-full" value={labTest} onChange={(e) => setLabTest(e.target.value)}>
                    {LAB_TESTS.map((test) => (
                      <option key={test} value={test}>{test}</option>
                    ))}
                  </select>
                </label>
                {labSearchStatus && <p className="text-xs text-slate-500">{labSearchStatus}</p>}
                {!labSearchStatus && labResults.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-auto">
                    {labResults.map((lab) => (
                      <label key={lab.name} className={`flex items-start gap-2 border rounded-lg px-2 py-2 text-xs ${selectedLab?.name === lab.name ? 'border-[#1AA898] bg-[#1AA898]/5' : 'border-slate-200'}`}>
                        <input type="radio" name="patient-lab-choice" checked={selectedLab?.name === lab.name} onChange={() => setSelectedLab(lab)} />
                        <span>
                          <span className="font-semibold text-slate-700">{lab.name}</span>
                          <span className="block text-slate-500">{lab.city} · {lab.tests.join(', ')}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <textarea className="w-full" rows={2} placeholder="Special instructions" value={labNote} onChange={(e) => setLabNote(e.target.value)} />
                {labActionStatus && <p className="text-xs text-slate-500">{labActionStatus}</p>}
                <button type="button" disabled={labSaving} className="btn btn-primary px-4 py-2" onClick={handleCreateLabOrder}>
                  {labSaving ? 'Booking…' : 'Create lab order'}
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-500">Toggle on when a lab requisition is needed.</p>
            )}

            {labs.length > 0 && (
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <h3 className="font-semibold text-sm">Existing lab orders</h3>
                {labs.map((order) => (
                  <div key={order.id} className="border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[#122E3A]">{order.test}</p>
                        <p className="text-xs text-slate-500">{order.labName || 'Lab TBD'} · {order.status}</p>
                      </div>
                      <select className="text-xs" value={order.status} onChange={(e) => handleLabStatusChange(order.id, e.target.value)}>
                        {LAB_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    {order.notes && <p className="text-xs text-slate-500 mt-1">Notes: {order.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
            <h2 className="font-semibold">Prescription ideas</h2>
            <label className="text-sm">
              <span className="font-medium">Condition</span>
              <select className="mt-1 w-full" value={issueKey} onChange={(e) => setIssueKey(e.target.value)}>
                <option value="">Select</option>
                {issueOptions.map((issue) => (
                  <option key={issue} value={issue}>{issue}</option>
                ))}
              </select>
            </label>
            {issueKey && (
              <label className="text-sm">
                <span className="font-medium">Medication</span>
                <select className="mt-1 w-full" value={medication} onChange={(e) => setMedication(e.target.value)}>
                  {(ISSUE_MEDICATIONS[issueKey] || []).map((med) => (
                    <option key={med} value={med}>{med}</option>
                  ))}
                </select>
              </label>
            )}
            {issueKey && (
              <div className="text-xs text-slate-500">
                Document this plan via “New Note” to capture it in the chart.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
