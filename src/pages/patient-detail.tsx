import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, getJson, API_BASE } from '../lib/api';

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

type NoteSoap = {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
};

type Note = {
  id: number;
  patientId: string;
  content?: string | null;
  soap?: NoteSoap;
  attachments: string[];
  createdAt: number;
};

type ApiNote = Omit<Note, 'attachments' | 'soap'> & { attachments?: string[]; soap?: NoteSoap };

type Appointment = { id: number; patientId: string; startTs: number; reason?: string | null };

type FileItem = { id: string; filename: string; mime?: string | null; size?: number | null; createdAt: number };

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

type PatientDetailRes = {
  patient: Patient;
  notes: ApiNote[];
  appointments: Appointment[];
  labs?: LabOrder[];
  files?: FileItem[];
};

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

const emptySoap: NoteSoap = { subjective: '', objective: '', assessment: '', plan: '' };

export default function PatientDetail() {
  const { id = '' } = useParams();
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

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', dob: '', gender: 'Female', phone: '', email: '', address: '' });
  const [editStatus, setEditStatus] = useState<string | null>(null);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSoap, setNoteSoap] = useState(emptySoap);
  const [noteAttachments, setNoteAttachments] = useState<string[]>([]);
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

  const [fileUploadStatus, setFileUploadStatus] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);

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
      if (res.status === 401) {
        navigate('/login');
        return;
      }
      if (res.status === 404) {
        setDetailError('Patient not found');
        return;
      }
      if (!res.ok) {
        const info = await res.json().catch(() => null);
        throw new Error(info?.error || 'Could not load patient');
      }
      const data = await getJson<PatientDetailRes>(res);
      const normalizedNotes: Note[] = (data.notes || []).map((note) => ({
        ...note,
        soap: note.soap ?? {},
        attachments: note.attachments ?? [],
      }));
      setPatient(data.patient);
      setNotes(normalizedNotes);
      setAppointments(data.appointments);
      setLabs(data.labs ?? []);
      setFiles(data.files ?? []);
      setEditForm({
        name: data.patient.name,
        dob: data.patient.dob ?? '',
        gender: data.patient.gender ?? 'Female',
        phone: data.patient.phone ?? '',
        email: data.patient.email ?? '',
        address: data.patient.address ?? '',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load patient';
      setDetailError(message);
    } finally {
      setDetailLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (me) fetchDetail();
  }, [me, fetchDetail]);

  useEffect(() => {
    let ignore = false;
    if (!needLab) {
      setLabResults([]);
      setLabSearchStatus(null);
      setSelectedLab(null);
      return;
    }
    if (!patient?.address) {
      setLabSearchStatus('Add the patient address to fetch nearby labs.');
      return;
    }
    setLabSearchStatus('Searching labs...');
    const params = new URLSearchParams({ address: patient.address || '', test: labTest });
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

  const issueOptions = useMemo(() => Object.keys(ISSUE_MEDICATIONS), []);
  const fileMap = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patient) return;
    setEditStatus(null);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}`, { method: 'PUT', json: editForm });
      const info = await res.json().catch(() => null);
      if (!res.ok) throw new Error(info?.error || 'Could not update patient');
      setEditStatus('Changes saved.');
      setEditing(false);
      await fetchDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update patient';
      setEditStatus(message);
    }
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!patient) return;
    if (
      !noteText.trim() &&
      !noteSoap.subjective &&
      !noteSoap.objective &&
      !noteSoap.assessment &&
      !noteSoap.plan
    ) {
      setNoteStatus('Add text in at least one SOAP field.');
      return;
    }
    setNoteStatus(null);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}/notes`, {
        method: 'POST',
        json: {
          content: noteText.trim() || undefined,
          soapSubjective: noteSoap.subjective || undefined,
          soapObjective: noteSoap.objective || undefined,
          soapAssessment: noteSoap.assessment || undefined,
          soapPlan: noteSoap.plan || undefined,
          attachments: noteAttachments,
        },
      });
      const info = await res.json().catch(() => null);
      if (!res.ok) throw new Error(info?.error || 'Could not add note');
      setNoteText('');
      setNoteSoap(emptySoap);
      setNoteAttachments([]);
      setShowNoteForm(false);
      setNoteStatus('Note added.');
      await fetchDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add note';
      setNoteStatus(message);
    }
  }

  async function handleUploadFiles(list: FileList | null) {
    if (!patient || !list || list.length === 0) return;
    setFileUploading(true);
    setFileUploadStatus('Uploading files...');
    try {
      for (const file of Array.from(list)) {
        const dataUrl = await fileToDataUrl(file);
        const res = await apiFetch(`/api/patients/${patient.id}/files`, {
          method: 'POST',
          json: { filename: file.name, dataUrl },
        });
        const info = await res.json().catch(() => null);
        if (!res.ok) throw new Error(info?.error || 'Upload failed');
      }
      setFileUploadStatus('Uploaded successfully.');
      await fetchDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setFileUploadStatus(message);
    } finally {
      setFileUploading(false);
      setTimeout(() => setFileUploadStatus(null), 3000);
    }
  }

  async function handleCreateLabOrder() {
    if (!patient || !selectedLab) {
      setLabActionStatus('Select a lab to create an order.');
      return;
    }
    setLabActionStatus(null);
    setLabSaving(true);
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
      const info = await res.json().catch(() => null);
      if (!res.ok) throw an Error(info?.error || 'Could not create lab order');
