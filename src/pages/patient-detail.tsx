import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, getJson, API_BASE } from "../lib/api";

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

type Note = { id: number; patientId: string; content?: string | null; createdAt: number };

type Appointment = { id: number; patientId: string; startTs: number; reason?: string | null };

type LabOrder = { id: number; patientId: string; test: string; status: string; createdAt: number };

type FileItem = { id: string; filename: string; createdAt: number };

type PatientDetailRes = {
  patient: Patient;
  notes: Note[];
  appointments: Appointment[];
  labs?: LabOrder[];
  files?: FileItem[];
};

const formatDate = (ts: number) => new Date(ts * 1000).toLocaleDateString();
const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function PatientDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [me, setMe] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [labs, setLabs] = useState<LabOrder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);

  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteStatus, setNoteStatus] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auth/me");
        const data = await getJson<Me>(res);
        if (!ignore) setMe(data.user?.email ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !me) navigate("/login");
  }, [authLoading, me, navigate]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`/api/patients/${id}`);
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (res.status === 404) {
        setDetailError("Patient not found");
        return;
      }
      if (!res.ok) {
        const info = await res.json().catch(() => null);
        throw new Error(info?.error || "Unable to load patient");
      }
      const data = await getJson<PatientDetailRes>(res);
      setPatient(data.patient);
      setNotes(data.notes || []);
      setAppointments(data.appointments || []);
      setLabs(data.labs || []);
      setFiles(data.files || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load patient";
      setDetailError(message);
    } finally {
      setDetailLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (me) loadDetail();
  }, [me, loadDetail]);

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!patient) return;
    if (!noteText.trim()) {
      setNoteStatus("Write a note before saving.");
      return;
    }
    setNoteStatus(null);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}/notes`, {
        method: "POST",
        json: { content: noteText.trim() },
      });
      if (!res.ok) {
        const info = await res.json().catch(() => null);
        throw new Error(info?.error || "Could not add note");
      }
      setNoteText("");
      await loadDetail();
      setNoteStatus("Note added.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add note";
      setNoteStatus(message);
    }
  }

  if (authLoading || detailLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading patient...
      </div>
    );
  }

  if (detailError || !patient) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
          <p className="text-lg font-semibold">{detailError ?? "Patient not found"}</p>
          <button onClick={() => navigate("/dashboard")} className="text-[#1AA898] underline text-sm">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 bg-white/90 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-slate-600 hover:text-slate-900">
              ? Back
            </button>
            <div className="font-semibold">Patient chart</div>
          </div>
          <div className="text-xs text-slate-500">Signed in as {me}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{patient.name}</h1>
              <p className="text-sm text-slate-500">
                DOB {patient.dob || "-"} · {patient.gender || "-"}
              </p>
            </div>
            <button className="text-sm text-[#1AA898] underline" onClick={() => navigate('/dashboard')}>
              Dashboard
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm text-slate-600">
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
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Notes</h2>
            <span className="text-xs text-slate-500">{notes.length} entries</span>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {notes.map((note) => (
                <li key={note.id} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">{new Date(note.createdAt * 1000).toLocaleString()}</p>
                  <p>{note.content || '—'}</p>
                </li>
              ))}
            </ul>
          )}
          <form className="space-y-2" onSubmit={handleAddNote}>
            <textarea
              className="w-full border border-slate-300 rounded-md p-2"
              rows={3}
              placeholder="Add a quick note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            {noteStatus && <p className="text-xs text-slate-500">{noteStatus}</p>}
            <button type="submit" className="btn btn-primary px-4 py-2">Save note</button>
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Appointments</h2>
            <span className="text-xs text-slate-500">{appointments.length}</span>
          </div>
          {appointments.length === 0 ? (
            <p className="text-sm text-slate-500">No visits recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {appointments.map((appt) => (
                <li key={appt.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#122E3A]">{appt.reason || 'General consult'}</p>
                    <p className="text-xs text-slate-500">{formatDate(appt.startTs)} · {formatTime(appt.startTs)}</p>
                  </div>
                  <span className="text-xs text-slate-500">#{appt.id}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lab orders</h2>
            <span className="text-xs text-slate-500">{labs.length}</span>
          </div>
          {labs.length === 0 ? (
            <p className="text-sm text-slate-500">No lab orders yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {labs.map((lab) => (
                <li key={lab.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#122E3A]">{lab.test}</p>
                    <p className="text-xs text-slate-500">Status: {lab.status}</p>
                  </div>
                  <span className="text-xs text-slate-500">{formatDate(lab.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Files</h2>
            <span className="text-xs text-slate-500">{files.length}</span>
          </div>
          {files.length === 0 ? (
            <p className="text-sm text-slate-500">No files uploaded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {files.map((file) => (
                <li key={file.id} className="border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span>{file.filename}</span>
                  <a className="text-[#1AA898] text-xs" href={`${API_BASE || ''}/api/files/${file.id}`} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
