import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type PatientSummary = { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null; created_at: number };
type PatientsRes = { patients: PatientSummary[] };

type QueueAppointment = {
  id: string;
  patientId: string;
  patientName?: string | null;
  patientPhone?: string | null;
  startTs: number;
  reason?: string | null;
  status?: string | null;
  triageNotes?: string | null;
  visitType?: string | null;
  feeCents?: number | null;
  paymentStatus?: string | null;
};
type QueueRes = { appointments: QueueAppointment[]; startOfDay: number; endOfDay: number };

type Payment = {
  id: string;
  appointmentId: string;
  patientId: string;
  amountCents: number;
  method?: string | null;
  status?: string | null;
  note?: string | null;
  receiptNumber?: string | null;
  createdAt: number;
};
type PaymentsRes = { payments: Payment[] };

type UserProfile = { role?: string | null };
type MeRes = { user: UserProfile | null };

const STATUS_OPTIONS = ['scheduled', 'arrived', 'in_room', 'completed', 'cancelled'];
const PAYMENT_METHODS = ['card', 'cash', 'etransfer', 'insurance'];
const PATIENT_FORM_DEFAULT = { name: '', phone: '', email: '', address: '' };
const APPOINTMENT_FORM_DEFAULT = { patientId: '', date: '', time: '', reason: '', visitType: 'Consult', triageNotes: '', fee: '', paymentStatus: 'unpaid' };
const PAYMENT_FORM_DEFAULT = { appointmentId: '', amount: '', method: 'card', note: '' };

const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export default function ReceptionHub() {
  const navigate = useNavigate();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [queue, setQueue] = useState<QueueAppointment[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const [patientForm, setPatientForm] = useState(PATIENT_FORM_DEFAULT);
  const [patientMessage, setPatientMessage] = useState<string | null>(null);

  const [appointmentForm, setAppointmentForm] = useState(APPOINTMENT_FORM_DEFAULT);
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);

  const [paymentForm, setPaymentForm] = useState(PAYMENT_FORM_DEFAULT);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const [attemptedSeed, setAttemptedSeed] = useState(false);

  const fetchProfile = useCallback(async () => {
    const res = await apiFetch('/auth/me');
    const data = await getJson<MeRes>(res);
    return data.user;
  }, []);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await apiFetch('/reception/queue');
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = await getJson<QueueRes>(res);
      setQueue(data.appointments);
    } catch {
      setQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, [navigate]);

  const loadPatients = useCallback(async (search?: string) => {
    setPatientsLoading(true);
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await apiFetch(`/reception/patients${query}`);
      const data = await getJson<PatientsRes>(res);
      setPatients(data.patients);
    } catch {
      setPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const res = await apiFetch('/reception/payments?days=14');
      const data = await getJson<PaymentsRes>(res);
      setPayments(data.payments);
    } catch {
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (ignore) return;
        if (!profile) {
          navigate('/login', { replace: true });
          return;
        }
        setMe(profile);
      } catch (err) {
        console.error('reception auth error', err);
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [fetchProfile, navigate]);

  useEffect(() => {
    if (authLoading || !me) return;
    if (me.role && me.role !== 'receptionist') {
      navigate(me.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      return;
    }
    void loadQueue();
    void loadPatients(patientSearch);
    void loadPayments();
  }, [authLoading, me, navigate, loadQueue, loadPatients, loadPayments, patientSearch]);

  useEffect(() => {
    if (authLoading || me?.role !== 'receptionist') return;
    if (!queueLoading && queue.length === 0 && !attemptedSeed) {
      setAttemptedSeed(true);
      (async () => {
        try {
          await apiFetch('/demo/seed', { method: 'POST' });
          await loadQueue();
          await loadPatients(patientSearch);
          setPatientMessage('Loaded sample demo data.');
        } catch {
          // ignore
        }
      })();
    }
  }, [authLoading, me, queueLoading, queue.length, attemptedSeed, loadQueue, loadPatients, patientSearch]);

  const patientOptions = useMemo(() => patients.map((p) => ({ value: p.id, label: p.name || 'Unnamed patient' })), [patients]);

  async function handleStatusChange(id: string, status: string) {
    try {
      const res = await apiFetch(`/appointments/${id}`, { method: 'PATCH', json: { status } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAppointmentMessage(body?.error || 'Could not update appointment.');
        return;
      }
      await loadQueue();
    } catch {
      setAppointmentMessage('Could not update appointment.');
    }
  }

  async function handlePatientSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPatientMessage(null);
    try {
      const res = await apiFetch('/patients', { method: 'POST', json: patientForm });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPatientMessage(body?.error || 'Could not add patient.');
        return;
      }
      setPatientForm(PATIENT_FORM_DEFAULT);
      setPatientMessage('Patient added.');
      await loadPatients(patientSearch);
    } catch {
      setPatientMessage('Could not add patient.');
    }
  }

  async function handleAppointmentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appointmentForm.patientId) {
      setAppointmentMessage('Pick a patient first.');
      return;
    }
    const when = Date.parse(`${appointmentForm.date}T${appointmentForm.time}`);
    if (Number.isNaN(when)) {
      setAppointmentMessage('Select a valid date & time.');
      return;
    }
    setAppointmentMessage(null);
    try {
      const payload = {
        patientId: appointmentForm.patientId,
        startTs: Math.floor(when / 1000),
        reason: appointmentForm.reason,
        visitType: appointmentForm.visitType,
        triageNotes: appointmentForm.triageNotes,
        feeCents: appointmentForm.fee ? Math.round(Number(appointmentForm.fee) * 100) : 0,
        paymentStatus: appointmentForm.paymentStatus,
      };
      const res = await apiFetch('/appointments', { method: 'POST', json: payload });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAppointmentMessage(body?.error || 'Could not schedule appointment.');
        return;
      }
      setAppointmentForm(APPOINTMENT_FORM_DEFAULT);
      setAppointmentMessage('Appointment scheduled.');
      await loadQueue();
    } catch {
      setAppointmentMessage('Could not schedule appointment.');
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.appointmentId) {
      setPaymentMessage('Pick an appointment.');
      return;
    }
    const amount = Math.round(Number(paymentForm.amount) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentMessage('Enter a valid amount.');
      return;
    }
    setPaymentMessage(null);
    try {
      const res = await apiFetch('/reception/payments', {
        method: 'POST',
        json: {
          appointmentId: paymentForm.appointmentId,
          amountCents: amount,
          method: paymentForm.method,
          status: 'paid',
          note: paymentForm.note,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPaymentMessage(body?.error || 'Could not record payment.');
        return;
      }
      setPaymentForm(PAYMENT_FORM_DEFAULT);
      setPaymentMessage('Payment recorded.');
      await Promise.all([loadQueue(), loadPayments()]);
    } catch {
      setPaymentMessage('Could not record payment.');
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        Checking your access...
      </div>
    );
  }

  if (me?.role && me.role !== 'receptionist') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        Redirecting you to your workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Reception Console</p>
            <h1 className="text-3xl font-semibold text-[#122E3A]">Keep today's clinic flowing</h1>
            <p className="text-sm text-slate-500">Add patients, fill the calendar, update the waiting room, and capture payments.</p>
          </div>
          <button
            type="button"
            onClick={() => { void apiFetch('/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/login'; }); }}
            className="text-sm text-[#1AA898]"
          >
            Logout
          </button>
        </header>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold mb-3">Quick intake</h2>
            <p className="text-sm text-slate-500 mb-4">Create a patient profile before booking a visit.</p>
            <form className="space-y-3" onSubmit={handlePatientSubmit}>
              <input className="w-full" placeholder="Patient name" value={patientForm.name} onChange={(e) => setPatientForm((f) => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input className="w-full" placeholder="Phone" value={patientForm.phone} onChange={(e) => setPatientForm((f) => ({ ...f, phone: e.target.value }))} />
                <input className="w-full" placeholder="Email" value={patientForm.email} onChange={(e) => setPatientForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <input className="w-full" placeholder="Address" value={patientForm.address} onChange={(e) => setPatientForm((f) => ({ ...f, address: e.target.value }))} />
              <button type="submit" className="btn btn-primary w-full py-2">Save patient</button>
            </form>
            {patientMessage && <p className="text-xs text-[#1AA898] mt-3">{patientMessage}</p>}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold mb-3">Schedule visit</h2>
            <form className="space-y-3" onSubmit={handleAppointmentSubmit}>
              <label className="text-sm font-medium block">
                Patient
                <select className="mt-1 w-full" value={appointmentForm.patientId} onChange={(e) => setAppointmentForm((f) => ({ ...f, patientId: e.target.value }))}>
                  <option value="">Select existing patient...</option>
                  {patientOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium block">
                  Date
                  <input type="date" className="mt-1 w-full" value={appointmentForm.date} onChange={(e) => setAppointmentForm((f) => ({ ...f, date: e.target.value }))} />
                </label>
                <label className="text-sm font-medium block">
                  Time
                  <input type="time" className="mt-1 w-full" value={appointmentForm.time} onChange={(e) => setAppointmentForm((f) => ({ ...f, time: e.target.value }))} />
                </label>
              </div>
              <input className="w-full" placeholder="Reason / agenda" value={appointmentForm.reason} onChange={(e) => setAppointmentForm((f) => ({ ...f, reason: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input className="w-full" placeholder="Visit type" value={appointmentForm.visitType} onChange={(e) => setAppointmentForm((f) => ({ ...f, visitType: e.target.value }))} />
                <select className="w-full" value={appointmentForm.paymentStatus} onChange={(e) => setAppointmentForm((f) => ({ ...f, paymentStatus: e.target.value }))}>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className="w-full" placeholder="Fee (e.g. 120)" value={appointmentForm.fee} onChange={(e) => setAppointmentForm((f) => ({ ...f, fee: e.target.value }))} />
                <input className="w-full" placeholder="Triage notes" value={appointmentForm.triageNotes} onChange={(e) => setAppointmentForm((f) => ({ ...f, triageNotes: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary w-full py-2">Add to schedule</button>
            </form>
            {appointmentMessage && <p className="text-xs text-[#1AA898] mt-3">{appointmentMessage}</p>}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">Patient directory</h2>
              <p className="text-sm text-slate-500">Search by name, email, or phone.</p>
            </div>
            <input className="w-full md:w-60" placeholder="Search patients..." value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} />
          </div>
          {patientsLoading ? (
            <p className="text-sm text-slate-500">Loading patients...</p>
          ) : patients.length === 0 ? (
            <p className="text-sm text-slate-500">No patients found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Address</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr key={patient.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{patient.name || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {patient.phone && <span className="block">{patient.phone}</span>}
                        {patient.email && <span className="block text-slate-500">{patient.email}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{patient.address || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{new Date(patient.created_at * 1000).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Today's queue</h2>
              <p className="text-sm text-slate-500">Move patients through arrivals, rooms, and checkout.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadQueue}>Refresh</button>
          </div>
          {queueLoading ? (
            <p className="text-sm text-slate-500">Loading queue...</p>
          ) : queue.length === 0 ? (
            <p className="text-sm text-slate-500">No visits scheduled today.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((appt) => (
                <article key={appt.id} className="border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#122E3A]">{appt.patientName || 'Patient'} <span className="text-xs text-slate-500">({appt.patientPhone || '—'})</span></p>
                    <p className="text-xs text-slate-500">{formatTime(appt.startTs)} · {appt.reason || 'General visit'}</p>
                    {appt.triageNotes && <p className="text-xs text-amber-700 mt-1">Triage: {appt.triageNotes}</p>}
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <select className="text-xs border border-slate-300 rounded-md" value={appt.status || 'scheduled'} onChange={(e) => handleStatusChange(appt.id, e.target.value)}>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">Fee {(appt.feeCents || 0) / 100} · {appt.paymentStatus || 'unpaid'}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {appointmentMessage && <p className="text-xs text-[#1AA898] mt-3">{appointmentMessage}</p>}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-3">Log payment</h2>
              <form className="space-y-3" onSubmit={handlePaymentSubmit}>
                <label className="text-sm font-medium block">
                  Appointment
                  <select className="mt-1 w-full" value={paymentForm.appointmentId} onChange={(e) => setPaymentForm((f) => ({ ...f, appointmentId: e.target.value }))}>
                    <option value="">Select...</option>
                    {queue.map((appt) => (
                      <option key={appt.id} value={appt.id}>{appt.patientName || 'Patient'} · {formatTime(appt.startTs)}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input className="w-full" placeholder="Amount (e.g. 80)" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} />
                  <select className="w-full" value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <input className="w-full" placeholder="Receipt note" value={paymentForm.note} onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))} />
                <button type="submit" className="btn btn-primary w-full py-2">Record payment</button>
              </form>
              {paymentMessage && <p className="text-xs text-[#1AA898] mt-3">{paymentMessage}</p>}
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent payments</h2>
              {paymentsLoading ? (
                <p className="text-sm text-slate-500">Loading payments...</p>
              ) : payments.length === 0 ? (
                <p className="text-sm text-slate-500">No receipts yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {payments.map((payment) => (
                    <div key={payment.id} className="border border-slate-200 rounded-lg px-3 py-2 text-xs flex justify-between">
                      <div>
                        <p className="font-semibold text-[#122E3A]">${(payment.amountCents / 100).toFixed(2)} {payment.method && <span className="text-slate-500">· {payment.method}</span>}</p>
                        <p className="text-slate-500">{new Date(payment.createdAt * 1000).toLocaleString()}</p>
                      </div>
                      <span className="text-slate-500">{payment.receiptNumber || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
