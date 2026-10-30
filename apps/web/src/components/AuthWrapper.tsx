"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { STAFF_LOGIN_REQUIRED_EVENT } from '../lib/offlineSync';

/**
 * Staff login for the registration, doctor and other staff screens.
 *
 * The password is checked by the server (POST /api/v1/staff/login), which sets an
 * httpOnly cookie; every change to the queue is then checked against that cookie in
 * src/proxy.ts. This screen is only the front door — hiding it does not grant access.
 *
 * When the server cannot be reached the clinic keeps working from the browser's
 * offline store, so this falls back to "was this device logged in last time" and lets
 * those changes queue up; the server still checks the login when they are sent.
 */

const LAST_LOGIN_KEY = 'opd_auth';

function rememberLogin(loggedIn: boolean) {
  try {
    if (loggedIn) localStorage.setItem(LAST_LOGIN_KEY, 'true');
    else localStorage.removeItem(LAST_LOGIN_KEY);
  } catch {}
}

function wasLoggedIn(): boolean {
  try {
    return localStorage.getItem(LAST_LOGIN_KEY) === 'true';
  } catch {
    return false;
  }
}

// Pages that need no staff login: the patient tracker and TV boards only read the
// public board, and /admin, /settings, /analytics have their own admin login.
const OPEN_PREFIXES = ['/patient', '/tv', '/admin', '/settings', '/analytics'];

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOpenPage = OPEN_PREFIXES.some((p) => pathname?.startsWith(p));

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  // Set when this server is the read-only copy (READ_ONLY_MIRROR on Vercel).
  const [readOnly, setReadOnly] = useState<{ opdServerUrl: string | null } | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/staff/session', { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        loggedIn?: boolean;
        configured?: boolean;
        readOnly?: boolean;
        opdServerUrl?: string | null;
      };
      setIsConfigured(data.configured !== false);
      setReadOnly(data.readOnly ? { opdServerUrl: data.opdServerUrl ?? null } : null);
      setIsAuthenticated(Boolean(data.loggedIn));
      rememberLogin(Boolean(data.loggedIn));
    } catch {
      // Server unreachable: keep working offline if this device was logged in.
      setIsAuthenticated(wasLoggedIn());
    }
  }, []);

  useEffect(() => {
    if (isOpenPage) return;
    checkSession();
  }, [isOpenPage, checkSession]);

  // Any API call answered "login required" (expired or signed-out cookie) shows the login.
  useEffect(() => {
    const onLoginRequired = () => {
      rememberLogin(false);
      setIsAuthenticated(false);
    };
    window.addEventListener(STAFF_LOGIN_REQUIRED_EVENT, onLoginRequired);
    return () => window.removeEventListener(STAFF_LOGIN_REQUIRED_EVENT, onLoginRequired);
  }, []);

  if (isOpenPage) {
    return <>{children}</>;
  }

  // Still checking
  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-slate-950"></div>;
  }

  if (isAuthenticated) {
    if (!readOnly) return <>{children}</>;
    return (
      <>
        <div className="sticky top-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2.5 text-sm font-bold flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center shadow">
          <AlertCircle size={16} className="shrink-0" />
          <span>Read-only copy: changes are switched off here.</span>
          {readOnly.opdServerUrl ? (
            <a href={readOnly.opdServerUrl} className="underline underline-offset-2">
              Open the OPD server ({readOnly.opdServerUrl})
            </a>
          ) : (
            <span>Use the OPD server on the hospital network.</span>
          )}
        </div>
        {children}
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        rememberLogin(true);
        setIsAuthenticated(true);
        setPassword('');
        return;
      }
      let message = 'Incorrect password. Please try again.';
      try {
        const data = await res.json();
        if (data?.message && data.message !== 'Wrong password.') message = data.message;
      } catch {}
      setError(message);
      setPassword('');
    } catch {
      setError('Cannot reach the server. Check the network and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">

        {/* Decorative background glow */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500 rounded-full blur-[90px] opacity-20 pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500 rounded-full blur-[90px] opacity-20 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-256.png" alt="AIIMS Kalyani OPD Queue Management" width={112} height={112} className="w-24 h-24 sm:w-28 sm:h-28 mb-5 drop-shadow-xl" draggable={false} />

          <h1 className="text-2xl font-bold text-white mb-1.5">Staff Access Required</h1>
          <p className="text-slate-400 text-xs mb-6 max-w-xs">
            Enter the staff password to access the AIIMS Kalyani OPD Queue Management System.
          </p>

          {!isConfigured && (
            <div className="w-full mb-5 p-3 bg-amber-950/70 border border-amber-800/80 rounded-xl text-amber-200 text-xs font-semibold flex items-start gap-2 text-left">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                Staff login is not set up on this server yet. IT needs to set STAFF_PASSWORD and
                restart the server.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full text-left">
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Staff Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter password"
                  className={`w-full bg-slate-950 border ${error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'} rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none font-mono text-base transition-all`}
                  autoFocus
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error && (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1.5 font-medium">
                  <AlertCircle size={14} className="shrink-0" /> {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              <span>{submitting ? 'Checking…' : 'Unlock System'}</span>
            </button>

            <p className="mt-6 pt-5 border-t border-slate-800 text-[11px] text-slate-500 text-center">
              Forgot the password? Ask the OPD admin or IT. It is set on the server and is the
              same on every computer.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
