import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getJson } from '../lib/api';

type LoginError = { error?: string; role?: string };

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !password.trim()) {
      setError('Enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/auth/login-password', {
        method: 'POST',
        json: { email: email.trim().toLowerCase(), password },
      });
      const body = await safeJson(res);
      if (!res.ok) {
        setError(body?.error || 'Invalid credentials.');
        return;
      }
      const target =
        body?.role === 'receptionist' ? '/reception' : body?.role === 'admin' ? '/admin' : '/dashboard';
      setInfo('Welcome back! Redirecting…');
      window.location.href = target;
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    } finally {
      setLoading(false);
    }
  }

  async function safeJson(res: Response) {
    try {
      return (await getJson<LoginError>(res)) as LoginError;
    } catch {
      return null;
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] text-slate-800">
      <main className="pt-24 pb-16 px-6 max-w-6xl mx-auto flex items-center justify-center">
        <div className="glass-card w-full max-w-md p-8 rounded-3xl shadow-xl">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">
            Login
          </h1>
          <p className="text-sm text-slate-600 mb-6 text-center">Access your MediLoop dashboard with your account credentials.</p>
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
            <button type="submit" className="w-full btn btn-primary py-2 disabled:opacity-60" disabled={loading}>
              {loading ? 'Signing in…' : 'Log In'}
            </button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
          {info && <p className="mt-4 text-sm text-center text-[#1AA898]">{info}</p>}
          <p className="text-sm text-center text-slate-500 mt-6">
            Don’t have an account?
            {' '}
            <Link to="/register" className="text-[#1AA898] underline">
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
