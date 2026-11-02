"use client";
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, Cloud, HardDriveDownload, KeyRound,
  Loader2, Pencil, Plus, RefreshCw, Server, Settings as SettingsIcon, Trash2,
} from 'lucide-react';
import { useDepartmentStore } from '../../store/useDepartmentStore';

/**
 * The admin's Settings: things that apply to the whole hospital, not one computer.
 * Departments, the staff and admin logins, the cloud copy, and backups. (Each computer's
 * own settings, such as the announcement voice, are under Settings in the main menu.)
 *
 * Behind the admin login (settings/layout.tsx).
 */

type Department = { id: string; name: string; code: string };
type SystemInfo = {
  runsOn: 'cloud' | 'server';
  staffLogin: { set: boolean; signedInForDays: number };
  adminLogin: { set: boolean; signedInForHours: number };
  readOnlyMirror: boolean;
  opdServerUrl: string | null;
};
type SyncStatus = { enabled: boolean; healthy: boolean; lastRunAt: string | null; lastError: string | null };

/** Calls the API with the admin login. A 401 means the session ended: reload to log in. */
async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (res.status === 401) {
    window.location.reload();
    throw new Error('Signed out');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.message || `Request failed (${res.status})`);
  return ((data as any)?.data ?? data) as T;
}

const card = 'bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden';
const cardHead = 'p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50';
const input = 'min-h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold outline-none focus:border-blue-500 focus:bg-white';

function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
      {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {ok ? yes : no}
    </span>
  );
}

export default function AdminSettingsPage() {
  const loadDepartmentStore = useDepartmentStore((s) => s.loadDepartments);
  const [data, setData] = useState<{ departments: Department[]; doctors: { departmentId: string | null }[]; rooms: { departmentId: string | null }[] } | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; code: string } | null>(null);

  const load = useCallback(async () => {
    const [d, s, y] = await Promise.all([
      call('/api/v1/admin/doctors').catch(() => null),
      call<SystemInfo>('/api/v1/admin/system').catch(() => null),
      call<SyncStatus>('/api/v1/admin/sync-status').catch(() => null),
    ]);
    if (d) setData(d);
    setSystem(s);
    setSync(y);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  const run = async (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    try {
      setMessage({ text: await fn() });
      await load();
      // The department menus on the staff screens read this store.
      void loadDepartmentStore();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Something went wrong.', bad: true });
    } finally {
      setBusy(false);
    }
  };

  const count = (list: { departmentId: string | null }[] | undefined, id: string, word: string) => {
    const n = (list ?? []).filter((x) => x.departmentId === id).length;
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-wrap justify-between items-center gap-4 mb-8 max-w-5xl mx-auto bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-tr from-slate-800 to-slate-600 text-white rounded-2xl flex items-center justify-center shadow-md">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Admin Settings</h1>
            <p className="text-slate-500 font-medium text-xs mt-0.5">
              For the whole hospital: departments, logins, the cloud copy and backups.
            </p>
          </div>
        </div>
        <Link
          href="/admin"
          className="shrink-0 whitespace-nowrap px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-2 text-xs"
        >
          <ArrowLeft size={16} /> Back to Admin
        </Link>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">
        {/* Departments */}
        <section className={card}>
          <div className={cardHead}>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Building2 size={20} className="text-blue-600" /> Departments
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Add, rename or delete OPD departments. The code starts every token number in that department. A deleted
              department disappears from every screen; its past tokens stay in the records and reports.
            </p>
          </div>
          <div className="p-6 lg:p-8 space-y-5">
            <form
              className="grid sm:grid-cols-[1fr_10rem_auto] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                const code = newCode.trim().toUpperCase();
                if (!name || !code) return;
                void run(async () => {
                  await call('/api/v1/departments', { method: 'POST', body: JSON.stringify({ name, code }) });
                  setNewName('');
                  setNewCode('');
                  return `Added ${name}`;
                });
              }}
            >
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Department name, e.g. Orthopedics" aria-label="Department name" className={input} />
              <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="Code, e.g. ORTHO" aria-label="Department code" className={`${input} font-mono`} />
              <button type="submit" disabled={busy || !newName.trim() || !newCode.trim()} className="min-h-10 px-5 rounded-xl bg-blue-600 text-white font-black disabled:bg-slate-300 flex items-center justify-center gap-1.5">
                <Plus size={16} /> Add
              </button>
            </form>

            {!data ? (
              <div className="py-8 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.departments.map((d) => (
                  <li key={d.id} className="py-3 flex flex-wrap items-center gap-2">
                    {editing?.id === d.id ? (
                      <form
                        className="flex-1 grid sm:grid-cols-[1fr_10rem_auto_auto] gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const name = editing.name.trim();
                          const code = editing.code.trim().toUpperCase();
                          if (!name || !code) return;
                          void run(async () => {
                            await call(`/api/v1/departments/${d.id}`, { method: 'PATCH', body: JSON.stringify({ name, code }) });
                            setEditing(null);
                            return `Saved ${name}`;
                          });
                        }}
                      >
                        <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Department name" className={input} />
                        <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} aria-label="Department code" className={`${input} font-mono`} />
                        <button type="submit" disabled={busy} className="min-h-10 px-4 rounded-xl bg-blue-600 text-white font-bold">Save</button>
                        <button type="button" onClick={() => setEditing(null)} className="min-h-10 px-3 rounded-xl bg-slate-100 font-bold">Cancel</button>
                      </form>
                    ) : (
                      <>
                        <div className="w-12 h-10 rounded-xl bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center font-mono">{d.code}</div>
                        <div className="flex-1 min-w-40">
                          <p className="font-bold">{d.name}</p>
                          <p className="text-xs text-slate-500">{count(data.rooms, d.id, 'room')} · {count(data.doctors, d.id, 'doctor')}</p>
                        </div>
                        <button type="button" onClick={() => setEditing({ id: d.id, name: d.name, code: d.code })} className="min-h-9 px-3 rounded-xl bg-slate-100 text-sm font-bold flex items-center gap-1">
                          <Pencil size={14} /> Rename
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(`Delete the ${d.name} department? It disappears from every screen, and its queue can no longer be opened.`)) return;
                            void run(async () => {
                              await call(`/api/v1/departments/${d.id}`, { method: 'DELETE' });
                              return `Deleted ${d.name}`;
                            });
                          }}
                          className="min-h-9 px-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {data.departments.length === 0 && <li className="py-3 text-sm text-slate-400">No departments yet.</li>}
              </ul>
            )}
          </div>
        </section>

        {/* Logins */}
        <section className={card}>
          <div className={cardHead}>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <KeyRound size={20} className="text-blue-600" /> Logins
            </h2>
            <p className="text-slate-500 text-xs mt-1">The passwords are checked by the server, the same on every computer.</p>
          </div>
          <div className="p-6 lg:p-8 space-y-4 text-sm text-slate-700">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold">Staff password</p>
                {system ? <Status ok={system.staffLogin.set} yes="Set" no="Not set: staff screens are locked" /> : <span className="text-xs text-slate-400">…</span>}
                <p className="text-xs text-slate-500">
                  Unlocks registration, the doctor screens and staff Settings.
                  {system ? ` A computer stays signed in for ${system.staffLogin.signedInForDays} days.` : ''}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="font-bold">Admin password</p>
                {system ? <Status ok={system.adminLogin.set} yes="Set" no="Not set" /> : <span className="text-xs text-slate-400">…</span>}
                <p className="text-xs text-slate-500">
                  Unlocks this admin panel: deleting, departments, full analytics.
                  {system ? ` Signed in for ${system.adminLogin.signedInForHours} hours at a time.` : ''}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              To change a password, set <span className="font-mono font-bold">STAFF_PASSWORD</span> or{' '}
              <span className="font-mono font-bold">ADMIN_PASSWORD</span> in the server&apos;s settings (the OPD server&apos;s{' '}
              <span className="font-mono">.env</span> file and the Vercel project&apos;s Environment Variables) and restart.
              Changing one signs everyone out of it.
            </p>
          </div>
        </section>

        {/* Where this runs, read-only copy, cloud copy */}
        <section className={card}>
          <div className={`${cardHead} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Cloud size={20} className="text-blue-600" /> Server and cloud copy
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                The OPD server on the hospital network holds the data; the cloud copy serves patients&apos; phones.
              </p>
            </div>
            <button type="button" onClick={() => void load()} className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-2">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="p-6 lg:p-8 grid sm:grid-cols-3 gap-4 text-sm">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="font-bold flex items-center gap-1.5"><Server size={16} /> This copy runs on</p>
              <p className="text-slate-700">{system ? (system.runsOn === 'cloud' ? 'The cloud (Vercel)' : 'The OPD server') : '…'}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="font-bold">Changes allowed here</p>
              {system ? <Status ok={!system.readOnlyMirror} yes="Yes" no="No: read-only copy" /> : <span className="text-xs text-slate-400">…</span>}
              {system?.readOnlyMirror && system.opdServerUrl && (
                <p className="text-xs text-slate-500">Staff are sent to {system.opdServerUrl}</p>
              )}
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="font-bold">Copy to the cloud</p>
              {!sync ? (
                <span className="text-xs text-slate-400">…</span>
              ) : !sync.enabled ? (
                <p className="text-xs text-slate-500">Off on this copy. It runs on the OPD server once that is set up.</p>
              ) : (
                <>
                  <Status ok={sync.healthy} yes="Working" no="Not working" />
                  <p className="text-xs text-slate-500">
                    {sync.lastRunAt ? `Last run ${new Date(sync.lastRunAt).toLocaleString('en-GB')}` : 'Has not run yet'}
                    {sync.lastError ? ` · ${sync.lastError}` : ''}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Backups */}
        <section className={card}>
          <div className={cardHead}>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <HardDriveDownload size={20} className="text-blue-600" /> Backups
            </h2>
          </div>
          <div className="p-6 lg:p-8 space-y-2 text-sm text-slate-700">
            <p>
              The database is backed up every night at 21:00 by a task on a hospital PC, to the folder set as{' '}
              <span className="font-mono font-bold">BACKUP_DIR</span>. The cloud database itself keeps only 6 hours of history,
              so a mistake noticed the next day can only be undone from these backups.
            </p>
            <p className="text-xs text-slate-500">
              Check <span className="font-mono">backup.log</span> in the backup folder now and then: a failure is written there as
              BACKUP FAILED. Set-up and restore steps are in <span className="font-mono">apps/web/scripts/BACKUPS.md</span>.
            </p>
          </div>
        </section>
      </main>

      {message && (
        <div
          role="status"
          className={`fixed left-1/2 -translate-x-1/2 bottom-4 z-50 max-w-[calc(100vw-2rem)] px-4 py-3 rounded-xl text-white text-sm font-bold shadow-xl flex items-center gap-2 ${
            message.bad ? 'bg-rose-700' : 'bg-slate-900'
          }`}
        >
          {message.bad ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} className="text-emerald-400" />}
          {message.text}
        </div>
      )}
    </div>
  );
}
