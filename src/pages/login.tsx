import { useState } from 'react';
import type { MouseEventHandler } from 'react';
import QRCode from 'react-qr-code';
import { apiFetch, getJson } from '../lib/api';

type Step = 'password' | 'totp-email' | 'totp-enroll' | 'totp-code';

type StartRes =
  | { mode: 'code' }
  | { mode: 'enroll'; otpauthUrl: string; secret: string };

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const formatSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('password');
  const [enrollInfo, setEnrollInfo] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [isStartLoading, setIsStartLoading] = useState(false);
  const [isVerifyLoading, setIsVerifyLoading] = useState(false);
  const [isCodeLoading, setIsCodeLoading] = useState(false);

  async function api(path: string, body?: unknown) {
    return apiFetch(`/api${path}`, { method: 'POST', json: body });
  }

  function normalizeEmail() {
    return email.trim().toLowerCase();
  }

  function ensureEmail(): string | null {
    const normalized = normalizeEmail();
    if (!emailRegex.test(normalized)) {
      setError('Enter a valid email address first.');
      return null;
    }
    return normalized;
  }

  async function start(force = false) {
    const normalized = ensureEmail();
    if (!normalized) return;
    setIsStartLoading(true);
    setError(null);
    setCode('');
    try {
      const res = await api('/auth/start', { email: normalized, force });
      if (!res.ok) {
        const info = await safeJson(res);
        setError(info?.error || 'Could not start authenticator login.');
        return;
      }
      const data = await getJson<StartRes>(res);
      if (data.mode === 'code') {
        setEnrollInfo(null);
        setStep('totp-code');
      } else {
        setEnrollInfo({ otpauthUrl: data.otpauthUrl, secret: data.secret });
        setStep('totp-enroll');
      }
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    } finally {
      setIsStartLoading(false);
    }
  }

  async function verifyEnroll() {
    const normalized = ensureEmail();
    if (!normalized) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator.');
      return;
    }
    setIsVerifyLoading(true);
    setError(null);
    try {
      const res = await api('/auth/verify-enroll', { email: normalized, code });
      if (!res.ok) {
        const info = await safeJson(res);
        if (info?.error === 'enroll_required') {
          await start(true);
          return;
        }
        setError(info?.error || 'Invalid code.');
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    } finally {
      setIsVerifyLoading(false);
    }
  }

  async function login() {
    const normalized = ensureEmail();
    if (!normalized) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator.');
      return;
    }
    setIsCodeLoading(true);
    setError(null);
    try {
      const res = await api('/auth/login', { email: normalized, code });
      if (!res.ok) {
        const info = await safeJson(res);
        if (info?.error === 'enroll_required') {
          await start(true);
          return;
        }
        setError(info?.error || 'Invalid code.');
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    } finally {
      setIsCodeLoading(false);
    }
  }

  async function loginWithPassword() {
    const normalized = ensureEmail();
    if (!normalized) return;
    if (!password.trim()) {
      setError('Enter your password.');
      return;
    }
    setIsPasswordLoading(true);
    setError(null);
    try {
      const res = await api('/auth/login-password', { email: normalized, password });
      if (!res.ok) {
        const info = await safeJson(res);
        setError(info?.error || 'Invalid credentials.');
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      setError('Auth server unreachable. Start it with: npm run server or npm run dev:full');
    } finally {
      setIsPasswordLoading(false);
    }
  }

  async function safeJson(res: Response) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  const handlePasswordLogin: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    void loginWithPassword();
  };
  const handleStartClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    void start(false);
  };
  const handleRegenerateQrClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    void start(true);
  };
  const handleVerify: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    void verifyEnroll();
  };
  const handleCodeLogin: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    void login();
  };

  const goPassword = () => {
    setStep('password');
    setEnrollInfo(null);
    setCode('');
    setError(null);
  };

  const goTotp = () => {
    setStep('totp-email');
    setEnrollInfo(null);
    setCode('');
    setError(null);
  };

  const isTotpStep = step !== 'password';
  const copySecret = async () => {
    if (!enrollInfo) return;
    try {
      await navigator.clipboard.writeText(enrollInfo.secret);
    } catch {
      // noop — user can copy manually
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] text-slate-800">
      <main className="pt-24 pb-16 px-6 max-w-6xl mx-auto flex items-center justify-center">
        <div className="glass-card w-full max-w-lg p-8 rounded-3xl shadow-xl">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-[#122E3A] to-[#1AA898] bg-clip-text text-transparent">
            Secure Login
          </h1>

          <div className="mb-6 flex gap-3">
            <button
              type="button"
              onClick={goPassword}
              className={`flex-1 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                step === 'password'
                  ? 'bg-[#122E3A] text-white border-[#122E3A]'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={goTotp}
              className={`flex-1 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                isTotpStep ? 'bg-[#1AA898] text-white border-[#1AA898]' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Authenticator
            </button>
          </div>

          {step === 'password' && (
            <div className="space-y-4">
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
              <button
                onClick={handlePasswordLogin}
                disabled={isPasswordLoading}
                className="w-full btn btn-primary py-2 disabled:opacity-60"
              >
                {isPasswordLoading ? 'Logging in…' : 'Log In'}
              </button>
              <div className="text-xs text-slate-500 text-center">
                Prefer an authenticator?
                {' '}
                <button className="underline" type="button" onClick={goTotp}>
                  Use TOTP
                </button>
              </div>
            </div>
          )}

          {step === 'totp-email' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the email tied to your MediLoop account. We&apos;ll check whether you need to set up your authenticator
                or just enter a code.
              </p>
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
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleStartClick}
                  disabled={isStartLoading}
                  className="w-full btn btn-primary py-2 disabled:opacity-60"
                >
                  {isStartLoading ? 'Checking account…' : 'Continue'}
                </button>
                <button type="button" className="text-xs text-center underline text-slate-500" onClick={goPassword}>
                  Back to password login
                </button>
              </div>
            </div>
          )}

          {step === 'totp-enroll' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Scan this QR with Google Authenticator, Microsoft Authenticator, or 1Password. If you can’t scan it, type the
                backup code below.
              </p>
              {enrollInfo ? (
                <>
                  <div className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-inner">
                    <QRCode value={enrollInfo.otpauthUrl} size={184} />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Manual code</p>
                      <button type="button" className="text-xs text-[#1AA898] underline" onClick={copySecret}>
                        Copy
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-lg tracking-wide">{formatSecret(enrollInfo.secret)}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-red-600">We couldn&apos;t generate your QR. Try regenerating below.</p>
              )}
              <label className="block">
                <span className="text-sm font-medium">6-digit code</span>
                <input
                  inputMode="numeric"
                  className="mt-1 w-full"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleVerify}
                  disabled={isVerifyLoading}
                  className="w-full btn btn-primary py-2 disabled:opacity-60"
                >
                  {isVerifyLoading ? 'Verifying…' : 'Verify & Continue'}
                </button>
                <button
                  onClick={handleRegenerateQrClick}
                  type="button"
                  disabled={isStartLoading}
                  className="w-full btn btn-secondary py-2 disabled:opacity-60"
                >
                  {isStartLoading ? 'Generating new QR…' : 'Regenerate QR'}
                </button>
                <button type="button" className="text-xs text-center underline text-slate-500" onClick={() => setStep('totp-email')}>
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 'totp-code' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the 6-digit code from your authenticator for
                {' '}
                <span className="font-semibold text-slate-900">{normalizeEmail() || 'your account'}</span>
                .
              </p>
              <label className="block">
                <span className="text-sm font-medium">6-digit code</span>
                <input
                  inputMode="numeric"
                  className="mt-1 w-full"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCodeLogin}
                  disabled={isCodeLoading}
                  className="w-full btn btn-primary py-2 disabled:opacity-60"
                >
                  {isCodeLoading ? 'Checking code…' : 'Log In'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateQrClick}
                  disabled={isStartLoading}
                  className="w-full btn btn-secondary py-2 disabled:opacity-60"
                >
                  {isStartLoading ? 'Resetting…' : 'Reset authenticator'}
                </button>
                <button type="button" className="text-xs text-center underline text-slate-500" onClick={() => setStep('totp-email')}>
                  Use a different email
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}

          <p className="text-sm text-center text-slate-500 mt-6">
            Don’t have an account?
            {' '}
            <a href="/request-access" className="text-[#1AA898] underline">
              Request Access
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

