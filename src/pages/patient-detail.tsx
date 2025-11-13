import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type Me = { user: { email: string } | null };

type Patient = {
  id: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  lastVisit: string;
  notes: string[];
  referrals: { to: string; status: 'Pending' | 'Sent' | 'Accepted' }[];
};

const DATA: Patient[] = [
  { id: 'jenny-wilson', name: 'Jenny Wilson', dob: 'Feb 28, 1988', gender: 'Female', phone: '(204) 555‑0110', email: 'jenny@example.com', address: '12 River St, Winnipeg', lastVisit: '10 days ago', notes: ['Follow‑up for dermatology', 'Allergy to penicillin'], referrals: [{to:'Dermatology', status:'Pending'}] },
  { id: 'jacob-jones', name: 'Jacob Jones', dob: 'Jun 14, 1972', gender: 'Male', phone: '(204) 555‑0111', email: 'jacob@example.com', address: '89 Main Ave, Winnipeg', lastVisit: '15 days ago', notes: ['Physio recommended', 'Bloodwork normal'], referrals: [{to:'Physiotherapy', status:'Sent'}] },
  { id: 'kristine-carlson', name: 'Kristine Carlson', dob: 'Nov 3, 1982', gender: 'Female', phone: '(204) 555‑0112', email: 'kristine@example.com', address: '44 Elm Rd, Winnipeg', lastVisit: '25 days ago', notes: ['Dietary advice shared'], referrals: [{to:'Nutrition', status:'Accepted'}] },
  { id: 'jerome-bell', name: 'Jerome Bell', dob: 'May 5, 1967', gender: 'Male', phone: '(204) 555‑0113', email: 'jerome@example.com', address: '77 Oak Dr, Winnipeg', lastVisit: '2 months ago', notes: ['BP improved'], referrals: [] },
  { id: 'devon-lane', name: 'Devon Lane', dob: 'Aug 16, 1985', gender: 'Male', phone: '(204) 555‑0114', email: 'devon@example.com', address: '5 Prairie Ct, Winnipeg', lastVisit: '3 months ago', notes: ['MRI scheduled'], referrals: [{to:'Imaging', status:'Pending'}] },
  { id: 'kathryn-murphy', name: 'Kathryn Murphy', dob: 'Sep 10, 1974', gender: 'Female', phone: '(204) 555‑0115', email: 'kathryn@example.com', address: '901 Lake View, Winnipeg', lastVisit: '4 months ago', notes: ['Cholesterol stable'], referrals: [] },
];

export default function PatientDetail() {
  const { id } = useParams();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const patient = DATA.find(p => p.id === id);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data: Me = await res.json();
        setEmail(data.user?.email ?? null);
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (!loading && !email) navigate('/login'); }, [loading, email, navigate]);

  if (!patient) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <div className="text-xl font-semibold mb-2">Patient not found</div>
          <button onClick={()=>navigate('/dashboard')} className="text-[#1AA898] hover:underline text-sm">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* App bar (local to detail) */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={()=>navigate(-1)} className="text-slate-600 hover:text-slate-900">← Back</button>
            <div className="font-semibold">Patient</div>
          </div>
          <div className="text-xs text-slate-500">Signed in as {email ?? '—'}</div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header card */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{patient.name}</h1>
              <p className="text-slate-500 text-sm">DOB {patient.dob} • {patient.gender}</p>
            </div>
            <div className="flex gap-2">
              <button className="text-sm rounded-md border border-slate-300 px-3 py-2 hover:bg-slate-50">Edit</button>
              <button className="text-sm rounded-md bg-[#1AA898] text-white px-3 py-2 hover:opacity-90">New Note</button>
            </div>
          </div>
        </div>

        {/* Info rows */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Contact</h2>
            <div className="text-sm space-y-1">
              <div><span className="text-slate-500">Phone:</span> {patient.phone}</div>
              <div><span className="text-slate-500">Email:</span> {patient.email}</div>
              <div><span className="text-slate-500">Address:</span> {patient.address}</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Status</h2>
            <div className="text-sm space-y-1">
              <div><span className="text-slate-500">Last visit:</span> {patient.lastVisit}</div>
              <div><span className="text-slate-500">Next:</span> Not scheduled</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Referrals</h2>
            <ul className="text-sm space-y-2">
              {patient.referrals.length === 0 && <li className="text-slate-500">No referrals</li>}
              {patient.referrals.map((r, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{r.to}</span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs ${
                    r.status === 'Accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    r.status === 'Sent' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>{r.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Notes</h2>
            <button className="text-sm text-[#1AA898] hover:underline">Add</button>
          </div>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {patient.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

