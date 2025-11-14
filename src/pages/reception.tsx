import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type Appointment = {
  id: string;
  patientId: string;
  patientName?: string | null;
  startTs: number;
  reason?: string | null;
  status?: string | null;
};
type AppointmentsRes = { appointments: Appointment[] };
type UserProfile = { role?: string | null };
type MeRes = { user: UserProfile | null };

const STATUSES = ['scheduled', 'arrived', 'in_room', 'completed', 'cancelled'];

export default function ReceptionHub() {
  const navigate = useNavigate();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [attemptedSeed, setAttemptedSeed] = useState(false);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/appointments/upcoming');
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = await getJson<AppointmentsRes>(res);
      setAppointments(data.appointments);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch('/auth/me');
        const data = await getJson<MeRes>(res);
        if (ignore) return;
        if (!data.user) {
          navigate('/login', { replace: true });
        } else {
          setMe(data.user);
        }
      } catch (err) {
        console.error('reception auth error', err);
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [navigate]);

  useEffect(() => {
    if (authLoading || !me) return;
    if (me.role && me.role !== 'receptionist') {
      navigate(me.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      return;
    }
    void loadAppointments();
  }, [authLoading, me, loadAppointments, navigate]);

  useEffect(() => {
    if (authLoading || me?.role !== 'receptionist') return;
    if (!loading && appointments.length === 0 && !attemptedSeed) {
      setAttemptedSeed(true);
      (async () => {
        try {
          await apiFetch('/demo/seed', { method: 'POST' });
          await loadAppointments();
          setMessage('Loaded sample appointments.');
        } catch {
          // ignore
        }
      })();
    }
  }, [authLoading, me, loading, appointments.length, attemptedSeed, loadAppointments]);

  async function handleStatusChange(id: string, status: string) {
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
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Reception Console</p>
            <h1 className="text-3xl font-semibold text-[#122E3A]">Manage Today's Queue</h1>
            <p className="text-sm text-slate-500">Track arrivals, move patients to doctors, and keep the day on schedule.</p>
          </div>
          <button
            type="button"
            onClick={() => { void apiFetch('/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/login'; }); }}
            className="text-sm text-[#1AA898]"
          >
            Logout
          </button>
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
            <p className="text-sm text-slate-500">Loading appointments...</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-slate-500">No appointments on the schedule.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map((appt) => (
                <article key={appt.id} className="border border-slate-200 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#122E3A]">{appt.patientName || 'Patient'}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(appt.startTs * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
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
