import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type ApiError = { error?: string; role?: string };

const SPECIALTY_OPTIONS = [
  {
    id: 'general_physician',
    label: 'General Physician (Family / Internal Medicine)',
    description: 'Vitals, SOAP notes, labs, medications, referrals — ready today.',
    available: true,
  },
  {
    id: 'ophthalmology',
    label: 'Ophthalmology',
    description: 'Refraction, OCT, slit-lamp, IOP tracking.',
    available: true,
  },
  {
    id: 'dermatology',
    label: 'Dermatology',
    description: 'Lesion mapping, biopsy tracking, telederm captures.',
    available: true,
  },
];

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [specialty, setSpecialty] = useState('general_physician');
  const [role, setRole] = useState<'doctor' | 'receptionist'>('doctor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        json: { email: email.trim().toLowerCase(), password, specialty, role },
      });
      const registerInfo = await safeJson(res);
      if (!res.ok) {
        if (registerInfo?.error === 'account_exists') {
          setError('Account already exists. Please log in.');
        } else {
          setError(registerInfo?.error || 'Could not create your account. Try again.');
        }
        return;
      }

      const loginRes = await apiFetch('/auth/login-password', {
        method: 'POST',
        json: { email: email.trim().toLowerCase(), password },
      });
      const loginInfo = await safeJson(loginRes);
      if (!loginRes.ok) {
        setInfo('Account created! Please log in.');
        return;
      }
      const target =
        loginInfo?.role === 'receptionist' ? '/reception' : loginInfo?.role === 'admin' ? '/admin' : '/dashboard';
      setInfo('Account created. Redirecting…');
      window.location.href = target;
    } catch {
      setError('Auth server unreachable.');
    } finally {
      setLoading(false);
    }
  }

  async function safeJson(res: Response) {
    try {
      return await getJson<ApiError>(res);
    } catch {
      return null;
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] text-slate-800">
      <main className="pt-24 pb-16 px-6 max-w-6xl mx-auto flex items-center justify-center">
        <div className="glass-card w-full max-w-md p-8 rounded-3xl shadow-xl">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">
            Create Account
          </h1>
          <p className="text-sm text-slate-600 mb-6 text-center">Set up your MediLoop login to access the clinician dashboard.</p>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                className="mt-1 w-full"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className="mt-1 w-full"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Confirm Password</span>
              <input
                type="password"
                className="mt-1 w-full"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <div className="space-y-3">
              <span className="text-sm font-medium">Choose your specialty module</span>
              <div className="mt-3 space-y-3">
                {SPECIALTY_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${option.available ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}
                  >
                    <input
                      type="radio"
                      name="specialty"
                      value={option.id}
                      disabled={!option.available}
                      checked={specialty === option.id}
                      onChange={() => setSpecialty(option.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {option.label}
                        {!option.available && <span className="ml-2 text-xs uppercase tracking-wide text-amber-600">Coming soon</span>}
                      </p>
                      <p className="text-xs text-slate-500">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div>
                <span className="text-sm font-medium">Select your role</span>
                <p className="text-xs text-slate-500 mb-2">Admins must invite staff; sign up here as a doctor or receptionist.</p>
                <div className="flex gap-4">
                  {['doctor', 'receptionist'].map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input type="radio" value={value} checked={role === value} onChange={(e)=>setRole(e.target.value as 'doctor' | 'receptionist')} />
                      {value === 'doctor' ? 'Doctor' : 'Receptionist'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button type="submit" className="w-full btn btn-primary py-2 disabled:opacity-60" disabled={loading}>
              {loading ? 'Creating account…' : 'Sign Up'}
            </button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
          {info && <p className="mt-4 text-sm text-center text-[#1AA898]">{info}</p>}
          <p className="text-sm text-center text-slate-500 mt-6">
            Already have an account?
            {' '}
            <Link to="/login" className="text-[#1AA898] underline">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
