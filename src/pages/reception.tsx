import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type Appointment = {
  id: number;
  patient_id: string;
  patient_name?: string | null;
  start_ts: number;
  reason?: string | null;
  status?: string | null;
};
type AppointmentsRes = { appointments: Appointment[] };

const STATUSES = ['scheduled', 'arrived', 'in_room', 'completed', 'cancelled'];

export default function ReceptionHub() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadAppointments();
  }, []);

  async function loadAppointments() {
    setLoading(true);
    try {
      const res = await apiFetch('/appointments/upcoming');
      const data = await getJson<AppointmentsRes>(res);
      setAppointments(data.appointments);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    try {
      const res = await apiFetch(`/appointments/${id}`, { method: 'PATCH', json: { status } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(body?.error || 'Could not update appointment.');
        return;
      }
      setMessage('Appointment updated.');
      await loadAppointments();
    } catch {
      setMessage('Could not update appointment.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Reception Console</p>
            <h1 className="text-3xl font-semibold text-[#122E3A]">Manage Today's Queue</h1>
            <p className="text-sm text-slate-500">Track arrivals, move patients to doctors, and keep the day on schedule.</p>
          </div>
          <Link to="/dashboard" className="text-sm text-[#1AA898] underline">Doctor view</Link>
        </header>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Upcoming appointments</h2>
              <p className="text-sm text-slate-500">Update status as patients move through the clinic.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadAppointments}>Refresh</button>
          </div>
          {message && <p className="text-sm text-[#1AA898] mb-3">{message}</p>}
          {loading ? (
            <p className="text-sm text-slate-500">Loading appointments…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-slate-500">No appointments on the schedule.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map((appt) => (
                <article key={appt.id} className="border border-slate-200 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#122E3A]">{appt.patient_name || 'Patient'}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(appt.start_ts * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                      {' · '}
                      {appt.reason || 'General visit'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      className="text-xs border border-slate-300 rounded-md"
                      value={appt.status || 'scheduled'}
                      onChange={(e)=>handleStatusChange(appt.id, e.target.value)}
                    >
                      {STATUSES.map((status)=>(
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <button type="button" className="text-xs text-[#1AA898]" onClick={()=>handleStatusChange(appt.id, 'completed')}>
                      Mark done
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
