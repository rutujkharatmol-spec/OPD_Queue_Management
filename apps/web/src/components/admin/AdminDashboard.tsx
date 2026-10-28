'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, BarChart3, Building2, CheckCircle2, DoorOpen, Loader2, LogOut,
  Pencil, Plus, RefreshCw, Settings as SettingsIcon, Stethoscope, Trash2, Users, Wrench, X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

type Department = { id: string; name: string; code: string };

/** Calls an admin API route. A 401 means the session ended: reload to the login form. */
async function adminFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin${path}`, {
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
  return data as T;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Names that are probably typing mistakes rather than a doctor ("132", "x"). */
const looksWrong = (name?: string | null) => !!name && (/^\d+$/.test(name.trim()) || name.trim().length < 3);

type Tab = 'overview' | 'doctors' | 'cleanup';

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const notify = useCallback((text: string, bad = false) => setToast({ text, bad }), []);

  const logout = async () => {
    try {
      await fetch('/api/v1/admin/logout', { method: 'POST' });
    } finally {
      window.location.href = '/admin';
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: "Today's overview", icon: <Activity size={16} /> },
    { id: 'doctors', label: 'Doctors & Rooms', icon: <Stethoscope size={16} /> },
    { id: 'cleanup', label: 'Clean up', icon: <Wrench size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">OPD Admin</h1>
            <p className="text-xs text-slate-500">AIIMS Kalyani</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/analytics" className="px-3 min-h-10 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold flex items-center gap-1.5 hover:bg-slate-200">
              <BarChart3 size={16} /> Analytics
            </Link>
            <Link href="/settings" className="px-3 min-h-10 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold flex items-center gap-1.5 hover:bg-slate-200">
              <SettingsIcon size={16} /> Settings
            </Link>
            <button type="button" onClick={logout} className="px-3 min-h-10 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center gap-1.5">
              <LogOut size={16} /> Log out
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'doctors' && <DoctorsTab notify={notify} />}
        {tab === 'cleanup' && <CleanupTab notify={notify} />}
      </main>

      {toast && (
        <div
          role="status"
          className={`fixed left-1/2 -translate-x-1/2 bottom-4 z-50 max-w-[calc(100vw-2rem)] px-4 py-3 rounded-xl text-white text-sm font-bold shadow-xl flex items-center gap-2 ${
            toast.bad ? 'bg-rose-700' : 'bg-slate-900'
          }`}
        >
          {toast.bad ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} className="text-emerald-400" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Today's overview                                                    */
/* ------------------------------------------------------------------ */

type RoomStat = { roomNumber: string; doctorName?: string; activeCount: number; completedCount: number; absentCount: number; avgConsultMins: number };
type DoctorStat = { doctorName: string | null; rooms: string[]; servedCount: number; inConsultationCount: number; noShowCount: number; avgConsultMins: number };
type DeptOverview = Department & {
  totalGenerated: number;
  waitingCount: number;
  inRoomCount: number;
  servedCount: number;
  absentCount: number;
  avgWaitTimeMins: number;
  avgConsultationTimeMins: number;
  roomStats: RoomStat[];
  doctorStats: DoctorStat[];
};

function Stat({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' }) {
  const colors = {
    slate: 'text-slate-900',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-3xl font-black leading-none ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState<{ date: string; departments: DeptOverview[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminFetch('/overview'));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load the overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const totals = useMemo(() => {
    const t = { waiting: 0, inRoom: 0, served: 0, absent: 0, total: 0 };
    for (const d of data?.departments ?? []) {
      t.waiting += d.waitingCount;
      t.inRoom += d.inRoomCount;
      t.served += d.servedCount;
      t.absent += d.absentCount;
      t.total += d.totalGenerated;
    }
    return t;
  }, [data]);

  if (!data) {
    return error ? <p className="text-rose-700 font-semibold">{error}</p> : <Spinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          All departments · {data.date} · refreshes every 30 seconds
        </p>
        <button type="button" onClick={load} className="px-3 min-h-9 rounded-xl bg-white border border-slate-200 text-sm font-bold flex items-center gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      {error && <p className="text-rose-700 text-sm font-semibold">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Tokens today" value={totals.total} />
        <Stat label="Waiting" value={totals.waiting} tone="blue" />
        <Stat label="In rooms" value={totals.inRoom} tone="amber" />
        <Stat label="Served" value={totals.served} tone="emerald" />
        <Stat label="Absent" value={totals.absent} tone="rose" />
      </div>

      {data.departments.map((d) => (
        <section key={d.id} className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-black flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" /> {d.name}
              <span className="text-xs font-bold text-slate-400">{d.code}</span>
            </h2>
            <p className="text-sm text-slate-600">
              <strong>{d.waitingCount}</strong> waiting · <strong>{d.inRoomCount}</strong> in rooms ·{' '}
              <strong className="text-emerald-700">{d.servedCount}</strong> served · <strong>{d.absentCount}</strong> absent
              {d.avgWaitTimeMins ? <> · avg wait {d.avgWaitTimeMins} min</> : null}
              {d.avgConsultationTimeMins ? <> · avg consult {d.avgConsultationTimeMins} min</> : null}
            </p>
          </div>

          {d.totalGenerated === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No tokens yet today.</p>
          ) : (
            <div className="mt-4 grid lg:grid-cols-2 gap-4">
              <Table
                title="Rooms"
                icon={<DoorOpen size={14} />}
                head={['Room', 'Doctor', 'In room', 'Served', 'Avg min']}
                rows={d.roomStats.map((r) => [r.roomNumber, r.doctorName || '—', r.activeCount, r.completedCount, r.avgConsultMins || '—'])}
                empty="No patients called into a room yet."
              />
              <Table
                title="Doctors"
                icon={<Stethoscope size={14} />}
                head={['Doctor', 'Rooms', 'Served', 'With now', 'Avg min']}
                rows={d.doctorStats.map((s) => [
                  s.doctorName || 'No doctor set',
                  s.rooms.join(', ') || '—',
                  s.servedCount,
                  s.inConsultationCount,
                  s.avgConsultMins || '—',
                ])}
                empty="No doctor has seen a patient yet."
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Table({ title, icon, head, rows, empty }: { title: string; icon: React.ReactNode; head: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <p className="px-3 py-2 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
        {icon} {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                {head.map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-bold ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {r.map((c, j) => (
                    <td key={j} className={`px-3 py-2 ${j === 0 ? 'font-bold' : ''} ${j >= 2 ? 'text-right tabular-nums' : ''}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="py-20 flex justify-center text-slate-400">
      <Loader2 className="animate-spin" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Doctors & Rooms                                                     */
/* ------------------------------------------------------------------ */

type Doctor = { id: string; name: string; departmentId: string | null; roomNumber: string | null };
type Room = { id: string; roomNumber: string; doctorName: string | null; departmentId: string | null; isActive: boolean };

function DoctorsTab({ notify }: { notify: (text: string, bad?: boolean) => void }) {
  const [data, setData] = useState<{ departments: Department[]; doctors: Doctor[]; rooms: Room[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // Add doctor form
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newRoom, setNewRoom] = useState('');

  // Inline edits
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await adminFetch('/doctors');
      setData(d);
      setRoomDrafts({});
      setNewDept((cur) => cur || d.departments[0]?.id || '');
    } catch (e: any) {
      notify(e?.message || 'Could not load doctors.', true);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const deptName = (id: string | null) => data?.departments.find((d) => d.id === id)?.name || '—';

  const run = async (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    try {
      notify(await fn());
      await load();
    } catch (e: any) {
      notify(e?.message || 'Something went wrong.', true);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Spinner />;

  const roomsForNewDept = data.rooms.filter((r) => r.departmentId === newDept);

  return (
    <div className="space-y-6">
      {/* Add doctor */}
      <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
        <h2 className="text-lg font-black flex items-center gap-2"><Plus size={18} className="text-blue-600" /> Add a doctor</h2>
        <form
          className="mt-4 grid sm:grid-cols-[1fr_auto_auto_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            void run(async () => {
              await adminFetch('/doctors', { method: 'POST', body: JSON.stringify({ name, departmentId: newDept || undefined, roomId: newRoom || undefined }) });
              setNewName('');
              setNewRoom('');
              return `Added ${name}`;
            });
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Doctor's name, e.g. Dr. S. Roy"
            className="min-h-11 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold outline-none focus:border-blue-500 focus:bg-white"
          />
          <select value={newDept} onChange={(e) => { setNewDept(e.target.value); setNewRoom(''); }} className="min-h-11 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold">
            {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={newRoom} onChange={(e) => setNewRoom(e.target.value)} className="min-h-11 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold">
            <option value="">No room yet</option>
            {roomsForNewDept.map((r) => <option key={r.id} value={r.id}>Room {r.roomNumber}</option>)}
          </select>
          <button type="submit" disabled={busy || !newName.trim()} className="min-h-11 px-5 rounded-xl bg-blue-600 text-white font-black disabled:bg-slate-300">
            Add
          </button>
        </form>
      </section>

      {/* Doctors */}
      <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
        <h2 className="text-lg font-black flex items-center gap-2"><Stethoscope size={18} className="text-blue-600" /> Doctors ({data.doctors.length})</h2>
        <p className="text-sm text-slate-500 mt-1">
          Renaming also updates the rooms and past records that use the old name. Deleting removes the doctor from the
          Doctor Desk list and takes their name off any room; past records keep it.
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {data.doctors.length === 0 && <li className="py-3 text-sm text-slate-400">No doctors yet.</li>}
          {data.doctors.map((doc) => (
            <li key={doc.id} className="py-3 flex flex-wrap items-center gap-2">
              {renaming?.id === doc.id ? (
                <form
                  className="flex-1 flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = renaming.name.trim();
                    if (!name || name === doc.name) { setRenaming(null); return; }
                    void run(async () => {
                      const r = await adminFetch(`/doctors/${doc.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
                      setRenaming(null);
                      return `Renamed to ${r.name}`;
                    });
                  }}
                >
                  <input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: doc.id, name: e.target.value })}
                    className="flex-1 min-w-48 min-h-10 px-3 rounded-xl border border-blue-400 font-semibold outline-none"
                  />
                  <button type="submit" disabled={busy} className="min-h-10 px-4 rounded-xl bg-blue-600 text-white font-bold">Save</button>
                  <button type="button" onClick={() => setRenaming(null)} className="min-h-10 px-3 rounded-xl bg-slate-100 font-bold">Cancel</button>
                </form>
              ) : (
                <>
                  <div className="flex-1 min-w-48">
                    <p className="font-bold flex items-center gap-2">
                      {doc.name}
                      {looksWrong(doc.name) && (
                        <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                          <AlertTriangle size={12} /> looks wrong
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {deptName(doc.departmentId)}{doc.roomNumber ? ` · Room ${doc.roomNumber}` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => setRenaming({ id: doc.id, name: doc.name })} className="min-h-9 px-3 rounded-xl bg-slate-100 text-sm font-bold flex items-center gap-1">
                    <Pencil size={14} /> Rename
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Delete ${doc.name}? They will disappear from the Doctor Desk list and from any room.`)) return;
                      void run(async () => {
                        const r = await adminFetch(`/doctors/${doc.id}`, { method: 'DELETE' });
                        return `Deleted ${doc.name}${r.roomsCleared ? ` (removed from ${r.roomsCleared} room${r.roomsCleared === 1 ? '' : 's'})` : ''}`;
                      });
                    }}
                    className="min-h-9 px-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm font-bold flex items-center gap-1"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Rooms */}
      <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
        <h2 className="text-lg font-black flex items-center gap-2"><DoorOpen size={18} className="text-blue-600" /> Doctor on each room</h2>
        <p className="text-sm text-slate-500 mt-1">
          This name shows on the TV and the Doctor Desk. Add or remove rooms themselves in Settings.
        </p>
        {data.departments.map((dept) => {
          const rooms = data.rooms
            .filter((r) => r.departmentId === dept.id)
            .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
          if (rooms.length === 0) return null;
          return (
            <div key={dept.id} className="mt-5">
              <p className="text-sm font-black text-slate-700">{dept.name}</p>
              <ul className="mt-2 divide-y divide-slate-100">
                {rooms.map((room) => {
                  const draft = roomDrafts[room.id] ?? room.doctorName ?? '';
                  const changed = draft.trim() !== (room.doctorName ?? '');
                  return (
                    <li key={room.id} className="py-2 flex flex-wrap items-center gap-2">
                      <span className="w-24 font-bold">Room {room.roomNumber}</span>
                      <input
                        value={draft}
                        onChange={(e) => setRoomDrafts((d) => ({ ...d, [room.id]: e.target.value }))}
                        placeholder="No doctor"
                        className="flex-1 min-w-40 min-h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold outline-none focus:border-blue-500 focus:bg-white"
                      />
                      {looksWrong(room.doctorName) && (
                        <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 flex items-center gap-1">
                          <AlertTriangle size={12} /> looks wrong
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={busy || !changed}
                        onClick={() =>
                          void run(async () => {
                            await adminFetch(`/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ doctorName: draft.trim() || null }) });
                            return `Room ${room.roomNumber} updated`;
                          })
                        }
                        className="min-h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={busy || !room.doctorName}
                        onClick={() =>
                          void run(async () => {
                            await adminFetch(`/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify({ doctorName: null }) });
                            return `Cleared Room ${room.roomNumber}`;
                          })
                        }
                        className="min-h-10 px-3 rounded-xl bg-slate-100 text-sm font-bold disabled:opacity-40 flex items-center gap-1"
                      >
                        <X size={14} /> Clear
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clean up                                                            */
/* ------------------------------------------------------------------ */

type Counts = { waiting: number; inRooms: number; stale: number; onDate: number };

function CleanupTab({ notify }: { notify: (text: string, bad?: boolean) => void }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId, setDeptId] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [counts, setCounts] = useState<Counts | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminFetch<{ departments: Department[] }>('/doctors')
      .then((d) => {
        setDepartments(d.departments);
        setDeptId((cur) => cur || d.departments[0]?.id || '');
      })
      .catch((e) => notify(e?.message || 'Could not load departments.', true));
  }, [notify]);

  const loadCounts = useCallback(async () => {
    if (!deptId) return;
    try {
      setCounts(await adminFetch(`/cleanup?departmentId=${encodeURIComponent(deptId)}&date=${encodeURIComponent(date)}`));
    } catch (e: any) {
      notify(e?.message || 'Could not load counts.', true);
    }
  }, [deptId, date, notify]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const dept = departments.find((d) => d.id === deptId);

  const act = async (action: string, question: string, extra: Record<string, string> = {}) => {
    if (busy || !window.confirm(question)) return;
    setBusy(true);
    try {
      const r = await adminFetch('/cleanup', { method: 'POST', body: JSON.stringify({ action, departmentId: deptId, date, ...extra }) });
      notify(`Done: ${r.count} token${r.count === 1 ? '' : 's'} removed`);
      setConfirmText('');
      await loadCounts();
    } catch (e: any) {
      notify(e?.message || 'Something went wrong.', true);
    } finally {
      setBusy(false);
    }
  };

  if (departments.length === 0) return <Spinner />;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold text-slate-700">
          Department
          <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="mt-1 block min-h-11 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold">
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <p className="text-sm text-slate-500 flex-1 min-w-60">
          Removed tokens are hidden everywhere (queue, TV, Analytics) but kept in the database, so they can be recovered if needed.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <CleanupCard
          title="Clear today's waiting line"
          detail={`Everyone still waiting in ${dept?.name ?? 'this department'} today.`}
          count={counts?.waiting}
          button="Clear waiting line"
          disabled={busy}
          onClick={() => act('clear-waiting', `Remove all ${counts?.waiting ?? ''} waiting tokens in ${dept?.name} today?`)}
        />
        <CleanupCard
          title="Clear patients in rooms today"
          detail={`Tokens still shown as "in room" in ${dept?.name ?? 'this department'} today.`}
          count={counts?.inRooms}
          button="Clear rooms"
          disabled={busy}
          onClick={() => act('clear-rooms', `Remove all ${counts?.inRooms ?? ''} in-room tokens in ${dept?.name} today?`)}
        />
        <CleanupCard
          title="Close unfinished tokens from earlier days"
          detail={`Tokens from before today in ${dept?.name ?? 'this department'} that were never finished (still waiting or in a room).`}
          count={counts?.stale}
          button="Close old tokens"
          disabled={busy}
          onClick={() => act('close-stale', `Close ${counts?.stale ?? ''} unfinished tokens from earlier days in ${dept?.name}?`)}
        />
        <div className="bg-white rounded-3xl border border-rose-200 p-5">
          <p className="font-black text-rose-800 flex items-center gap-2"><Trash2 size={16} /> Delete all tokens on a date</p>
          <p className="text-sm text-slate-600 mt-1">For test days. Every token of {dept?.name ?? 'this department'} on the chosen date.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold" />
            <span className="text-sm font-bold text-slate-700">{counts ? `${counts.onDate} token${counts.onDate === 1 ? '' : 's'}` : '…'}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="min-h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold w-36"
            />
            <button
              type="button"
              disabled={busy || confirmText !== 'DELETE' || !counts?.onDate}
              onClick={() => act('delete-date', `Delete all ${counts?.onDate} tokens of ${dept?.name} on ${date}?`, { confirm: 'DELETE' })}
              className="min-h-10 px-4 rounded-xl bg-rose-600 text-white font-bold disabled:bg-slate-200 disabled:text-slate-400"
            >
              Delete tokens
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500 flex items-center gap-1.5">
        <Users size={14} /> To fix a wrong doctor name on a room (like &ldquo;132&rdquo;), use the Doctors &amp; Rooms tab.
      </p>
    </div>
  );
}

function CleanupCard({ title, detail, count, button, disabled, onClick }: { title: string; detail: string; count?: number; button: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5">
      <p className="font-black">{title}</p>
      <p className="text-sm text-slate-600 mt-1">{detail}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-2xl font-black tabular-nums">{count ?? '…'}</span>
        <button
          type="button"
          disabled={disabled || !count}
          onClick={onClick}
          className="min-h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:bg-slate-200 disabled:text-slate-400"
        >
          {button}
        </button>
      </div>
    </div>
  );
}
