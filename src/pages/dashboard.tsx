import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Me = { user: { email: string } | null };

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'Overview' | 'Patients' | 'Referrals' | 'Schedule' | 'Settings'>('Overview');
  const navigate = useNavigate();

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

  const name = (email || 'Guest').split('@')[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Horizontal app bar with tabs */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-14 flex items-center justify-between">
            <div className="font-semibold">MediLoop</div>
            <div className="flex items-center gap-3">
              <input className="hidden md:block w-64 text-sm rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1AA898]" placeholder="Search…" />
              <button className="w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-50" title="Notifications">🔔</button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#122E3A] to-[#1AA898] text-white flex items-center justify-center text-sm font-semibold">{name[0].toUpperCase()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 h-11">
            {(['Overview','Patients','Referrals','Schedule','Settings'] as const).map((t) => (
              <button
                key={t}
                onClick={()=>setTab(t)}
                aria-current={tab===t}
                className={`px-3 py-2 rounded-md text-sm transition-colors ${tab===t ? 'bg-[#1AA898]/10 text-[#0e7b6e] border border-[#1AA898]/20' : 'text-slate-700 hover:bg-slate-100'}`}
              >{t}</button>
            ))}
            <div className="ml-auto">
              <button
                className="text-sm text-slate-600 hover:text-slate-900"
                onClick={()=>{fetch('/api/auth/logout',{method:'POST',credentials:'include'}).then(()=>navigate('/'));}}
              >Logout</button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {tab === 'Overview' && <Overview />}
        {tab === 'Patients' && <Patients />}
        {tab === 'Referrals' && <Referrals />}
        {tab === 'Schedule' && <Schedule />}
        {tab === 'Settings' && <Settings email={email||''} />}
      </div>
    </div>
  );
}

function Overview() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CardStat label="Total Patients" value="45" accent="#1AA898" />
        <CardStat label="Medical Files" value="12" accent="#122E3A" />
        <CardStat label="New Referrals" value="3" accent="#BCC46A" />
        <CardStat label="Upcoming Appointments" value="8" accent="#FBECB8" />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold">Patients</h2>
            <a href="#" className="text-sm text-[#1AA898] hover:underline">Add Patient</a>
          </div>
          <TablePatients />
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold">Referrals</h2>
            <a href="#" className="text-sm text-[#1AA898] hover:underline">View All</a>
          </div>
          <TableReferrals />
        </div>
      </div>
    </div>
  );
}

function Patients() { return <div className="bg-white rounded-lg border border-slate-200 p-4"><TablePatients/></div>; }
function Referrals() { return <div className="bg-white rounded-lg border border-slate-200 p-4"><TableReferrals/></div>; }
function Schedule() { return <div className="bg-white rounded-lg border border-slate-200 p-8 text-slate-500">Schedule view coming next.</div>; }
function Settings({ email }: { email: string }) { return <div className="bg-white rounded-lg border border-slate-200 p-8 text-sm">Signed in as <span className="font-medium">{email||'—'}</span></div>; }

function CardStat({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-3xl font-bold" style={{ color: '#122E3A' }}>{value}</div>
      <div className="text-slate-500 text-sm mt-1">{label}</div>
      <div className="mt-3 h-1.5 rounded-full" style={{ background: accent }} />
    </div>
  );
}

function TablePatients() {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-500">
        <tr className="border-b border-slate-200">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Date of Birth</th>
          <th className="px-4 py-2">Last Visit</th>
        </tr>
      </thead>
      <tbody>
        {PATIENTS.map((p) => (
          <tr key={p.name} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3 text-[#122E3A] font-medium"><a href={`/dashboard/patients/${p.id}`} className="hover:underline">{p.name}</a></td>
            <td className="px-4 py-3 text-slate-600">{p.dob}</td>
            <td className="px-4 py-3 text-slate-600">{p.lastVisit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableReferrals() {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-500">
        <tr className="border-b border-slate-200">
          <th className="px-4 py-2">Patient</th>
          <th className="px-4 py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {REFERRALS.map((r) => (
          <tr key={r.patient} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3 text-slate-700">{r.patient}</td>
            <td className="px-4 py-3">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs ${
                r.status === 'Accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                r.status === 'Sent' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                'bg-slate-50 text-slate-700 border-slate-200'
              }`}>{r.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PATIENTS = [
  { id: 'jenny-wilson', name: 'Jenny Wilson', dob: 'Feb 28, 1988', lastVisit: '10 days ago' },
  { id: 'jacob-jones', name: 'Jacob Jones', dob: 'Jun 14, 1972', lastVisit: '15 days ago' },
  { id: 'kristine-carlson', name: 'Kristine Carlson', dob: 'Nov 3, 1982', lastVisit: '25 days ago' },
  { id: 'jerome-bell', name: 'Jerome Bell', dob: 'May 5, 1967', lastVisit: '2 months ago' },
  { id: 'devon-lane', name: 'Devon Lane', dob: 'Aug 16, 1985', lastVisit: '3 months ago' },
  { id: 'kathryn-murphy', name: 'Kathryn Murphy', dob: 'Sep 10, 1974', lastVisit: '4 months ago' },
];

const REFERRALS = [
  { patient: 'Robert Fox', status: 'Pending' },
  { patient: 'Arlene McCoy', status: 'Sent' },
  { patient: 'Theresa Webb', status: 'Accepted' },
  { patient: 'Kristin Watson', status: 'Pending' },
];
