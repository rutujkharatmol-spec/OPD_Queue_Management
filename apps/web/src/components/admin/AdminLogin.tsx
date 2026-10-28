'use client';

import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';

/** Password form for /admin. The password is checked by the server, never in the page. */
export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 401
            ? 'Wrong password.'
            : res.status === 503
              ? data?.message || 'Admin login is not set up on this server.'
              : 'Could not sign in. Please try again.'
        );
        setPassword('');
        return;
      }
      // Go back to the admin page asked for (e.g. /settings), or reload /admin signed in.
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
    } catch {
      setError('Could not reach the server. Check the connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-900">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
          <Lock size={22} />
        </div>
        <h1 className="mt-4 text-2xl font-black">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">AIIMS Kalyani OPD</p>
        <label htmlFor="admin-password" className="block mt-6 text-sm font-bold text-slate-700">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full min-h-12 px-4 rounded-xl border border-slate-300 bg-slate-50 text-lg font-bold outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!password || busy}
          className="mt-5 w-full min-h-12 rounded-xl bg-slate-900 text-white font-black disabled:bg-slate-300 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : null}
          Sign in
        </button>
      </form>
    </div>
  );
}
