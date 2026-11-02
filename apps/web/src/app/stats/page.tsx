"use client";
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BarChart3, DoorOpen, RefreshCw } from 'lucide-react';
import { getDepartmentAnalytics } from '../../lib/api';
import { useDepartmentStore, useEffectiveDeptId } from '../../store/useDepartmentStore';

/**
 * Staff Analytics, from the main menu: today only, for the selected department. Totals,
 * waiting times, hourly arrivals and each room's counts.
 *
 * Past days and per-doctor figures are in the admin's Analytics. The server enforces it:
 * without the admin login, /queue/analytics answers for today only, without doctorStats.
 */

type RoomStat = {
  roomNumber: string;
  doctorName?: string;
  totalPatients?: number;
  totalServed?: number;
  completedCount: number;
  activeCount: number;
  absentCount: number;
  avgConsultMins: number;
};

type Summary = {
  date: string;
  totalGenerated: number;
  completedCount: number;
  waitingCount: number;
  calledCount: number;
  absentCount: number;
  skippedCount: number;
  priorityCounts?: { emergency: number; senior: number; normal: number };
  avgWaitTimeMins: number;
  avgConsultationTimeMins: number;
  hourlyDistribution?: Record<string, number>;
  roomStats?: RoomStat[];
};

const REFRESH_MS = 60_000;

function Tile({ label, value, tone = 'text-slate-900' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-3xl font-black leading-none tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function StatsContent() {
  const searchParams = useSearchParams();
  const urlDeptId = searchParams.get('deptId');
  const departments = useDepartmentStore((s) => s.departments);
  const loadDepartments = useDepartmentStore((s) => s.loadDepartments);
  const setSelectedDeptId = useDepartmentStore((s) => s.setSelectedDeptId);
  const deptId = useEffectiveDeptId(urlDeptId);
  const dept = departments.find((d) => d.id === deptId);

  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDepartments(urlDeptId);
  }, [urlDeptId, loadDepartments]);

  const load = useCallback(async () => {
    if (!deptId) return;
    setLoading(true);
    try {
      setData(await getDepartmentAnalytics(deptId));
      setError('');
    } catch {
      setError("Couldn't load today's numbers. They will refresh by themselves.");
    } finally {
      setLoading(false);
    }
  }, [deptId]);

  useEffect(() => {
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const absent = (data?.absentCount ?? 0) + (data?.skippedCount ?? 0);
  const inRooms = data?.calledCount ?? 0;
  const total = data?.totalGenerated ?? 0;
  const served = data?.completedCount ?? 0;
  // Every hour of the day, trimmed to the first and last hour with a token.
  const hours = Object.entries(data?.hourlyDistribution ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const busiest = Math.max(1, ...hours.map(([, n]) => n));
  const firstHour = hours.findIndex(([, n]) => n > 0);
  const lastHour = hours.length - 1 - [...hours].reverse().findIndex(([, n]) => n > 0);
  const shownHours = firstHour >= 0 ? hours.slice(firstHour, lastHour + 1) : [];
  const rooms = [...(data?.roomStats ?? [])].sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-wrap justify-between items-center gap-4 mb-6 max-w-5xl mx-auto bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Today&apos;s numbers</h1>
            <p className="text-slate-500 font-medium text-xs mt-0.5">
              {dept ? dept.name : 'Department'} · {data?.date ? new Date(`${data.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'today'} · refreshes every minute
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {departments.length > 1 && (
            <select
              value={deptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              aria-label="Department"
              className="min-h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-semibold text-sm"
            >
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <button type="button" onClick={() => void load()} className="min-h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center gap-1.5">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <Link href="/" className="min-h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center gap-1.5">
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-6">
        {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile label="Tokens today" value={data ? total : '…'} />
          <Tile label="Waiting" value={data ? data.waitingCount : '…'} tone="text-blue-700" />
          <Tile label="In rooms" value={data ? inRooms : '…'} tone="text-amber-700" />
          <Tile label="Served" value={data ? served : '…'} tone="text-emerald-700" />
          <Tile label="Absent" value={data ? absent : '…'} tone="text-rose-700" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Average wait" value={data ? (data.avgWaitTimeMins ? `${data.avgWaitTimeMins} min` : '—') : '…'} />
          <Tile label="Average consultation" value={data ? (data.avgConsultationTimeMins ? `${data.avgConsultationTimeMins} min` : '—') : '…'} />
          <Tile label="Emergency" value={data ? data.priorityCounts?.emergency ?? 0 : '…'} tone="text-rose-700" />
          <Tile label="Senior citizen" value={data ? data.priorityCounts?.senior ?? 0 : '…'} tone="text-amber-700" />
        </div>

        {/* Each room today */}
        <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-lg font-black flex items-center gap-2"><DoorOpen size={18} className="text-blue-600" /> Rooms today</h2>
          {rooms.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No patients called into a room yet today.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-3 py-2 font-bold">Room</th>
                    <th className="px-3 py-2 font-bold">Doctor</th>
                    <th className="px-3 py-2 font-bold text-right">Patients</th>
                    <th className="px-3 py-2 font-bold text-right">Served</th>
                    <th className="px-3 py-2 font-bold text-right">In room</th>
                    <th className="px-3 py-2 font-bold text-right">Absent</th>
                    <th className="px-3 py-2 font-bold text-right">Avg min</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.roomNumber} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold">{r.roomNumber}</td>
                      <td className="px-3 py-2">{r.doctorName || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalPatients ?? r.totalServed ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.completedCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.activeCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.absentCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.avgConsultMins || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Arrivals by hour */}
        <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-lg font-black">Tokens issued by hour</h2>
          {shownHours.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No tokens yet today.</p>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {shownHours.map(([hour, n]) => (
                <li key={hour} className="flex items-center gap-3 text-sm">
                  <span className="w-12 text-slate-500 tabular-nums">{hour}</span>
                  <span className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                    <span className="block h-full bg-blue-500 rounded-md" style={{ width: `${(n / busiest) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right font-bold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-500">
          Past days and per-doctor numbers are in the admin panel&apos;s Analytics.
        </p>
      </main>
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100" />}>
      <StatsContent />
    </Suspense>
  );
}
