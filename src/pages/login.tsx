// File: pages/login.tsx
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { apiFetch, getJson } from '../lib/api';

type StartRes = { mode: 'code' } | { mode: 'enroll'; otpauthUrl: string; qrDataUrl: string; devSecret?: string };

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'password' | 'email' | 'enroll' | 'code'>('password');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devSecret, setDevSecret] = useState<string | null>(null);

  async function api(path: string, body?: any) {
    // Use env-based API base in prod, Vite proxy in dev
    return apiFetch(`/api${path}`, { method: 'POST', json: body });
  }

  async function start(force = false) {
    try {
      setError(null);
      const res = await api('/auth/start', { email, force });
      if (!res.ok) {
        const info = await safeJson(res);
        setError(info?.error || 'Could not start login. Is the server running?');
        return;
      }
      const data = await getJson<StartRes>(res);
      if (data.mode === 'code') { setStep('code'); setDevSecret(null); }
      else { setStep('enroll'); setQr(data.qrDataUrl); setDevSecret(data.devSecret ?? null); }
    } catch (e) {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    }
  }

  async function verifyEnroll() {
    try {
      setError(null);
      const res = await api('/auth/verify-enroll', { email, code });
      if (!res.ok) { const info = await safeJson(res); setError(info?.error || 'Invalid code.'); return; }
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    }
  }

  async function login() {
    try {
      setError(null);
      const res = await api('/auth/login', { email, code });
      if (!res.ok) { const info = await safeJson(res); setError(info?.error || 'Invalid code.'); return; }
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    }
  }

  async function loginWithPassword() {
    try {
      setError(null);
      const res = await api('/auth/login-password', { email, password });
      if (!res.ok) { const info = await safeJson(res); setError(info?.error || 'Invalid credentials.'); return; }
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    }
  }

  async function safeJson(res: Response) {
    try { return await res.json(); } catch { return null; }
  }

  const handlePasswordLogin = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void loginWithPassword();
  };
  const handleStart = (force = false) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void start(force);
  };
  const handleVerify = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void verifyEnroll();
  };
  const handleCodeLogin = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void login();
  };

  return (
    <div className="min-h-[calc(100vh-200px)] text-slate-800">
      <main className="pt-28 px-6 max-w-7xl mx-auto flex items-center justify-center">
        <div className="glass-card w-full max-w-md p-8 rounded-2xl">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">Login</h1>

          {step === 'password' && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input type="email" className="mt-1 w-full" placeholder="you@clinic.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Password</span>
                <input type="password" className="mt-1 w-full" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} />
              </label>
              <button onClick={handlePasswordLogin} className="w-full btn btn-primary py-2">Log In</button>
              <div className="text-xs text-slate-500 text-center">Prefer Authenticator? <button className="underline" onClick={()=>setStep('email')}>Use TOTP</button></div>
            </div>
          )}

          {step === 'email' && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input type="email" className="mt-1 w-full" placeholder="you@clinic.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
              </label>
              <button onClick={handleStart()} className="w-full btn btn-primary py-2">Continue</button>
            </div>
          )}

          {step === 'enroll' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Scan this QR with Google or Microsoft Authenticator, then enter the 6‑digit code.</p>
              {qr && <img alt="Authenticator QR" src={qr} className="mx-auto rounded-lg border border-slate-200" />}
              {devSecret && (
                <p className="text-xs text-slate-500 text-center">Dev secret: <code>{devSecret}</code></p>
              )}
              <label className="block">
                <span className="text-sm font-medium">6‑digit code</span>
                <input inputMode="numeric" className="mt-1 w-full" placeholder="123456" value={code} onChange={(e)=>setCode(e.target.value)} />
              </label>
              <button onClick={handleVerify} className="w-full btn btn-primary py-2">Verify & Continue</button>
              <button onClick={handleStart(true)} type="button" className="w-full btn btn-secondary py-2">Regenerate QR</button>
              </div>
          )}

          {step === 'code' && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium">6‑digit code</span>
                <input inputMode="numeric" className="mt-1 w-full" placeholder="123456" value={code} onChange={(e)=>setCode(e.target.value)} />
              </label>
              <button onClick={handleCodeLogin} className="w-full btn btn-primary py-2">Log In</button>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <p className="text-sm text-center text-slate-500 mt-6">Don’t have an account? <a href="/request-access" className="text-[#1AA898] underline">Request Access</a></p>
        </div>
      </main>
    </div>
  );
}
