import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type ApiError = { error?: string };

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        json: { email: email.trim().toLowerCase(), password },
      });
      if (!res.ok) {
        const body = await safeJson(res);
        setError(body?.error || 'Could not create your account. Try again.');
        return;
      }

      const loginRes = await apiFetch('/api/auth/login-password', {
        method: 'POST',
        json: { email: email.trim().toLowerCase(), password },
      });
      if (!loginRes.ok) {
        setInfo('Account created! Please log in.');
        return;
      }
      setInfo('Account created. Redirecting…');
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
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
                placeholder="you@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className="mt-1 w-full"
                placeholder="••••••••"
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

