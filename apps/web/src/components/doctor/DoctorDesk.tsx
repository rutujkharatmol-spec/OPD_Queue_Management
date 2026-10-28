'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, Stethoscope, Building2, DoorOpen, UserPlus, Search, ArrowLeftRight,
  Loader2, Users, X,
} from 'lucide-react';
import {
  assignDoctorToRoom, getDepartmentAnalytics, getDoctors, getRooms, markTokenAction, type DoctorListItem,
} from '../../lib/api';
import { useDepartmentStore } from '../../store/useDepartmentStore';
import { useQueueStore } from '../../store/useQueueStore';

const SETUP_KEY = 'opd_doctor_desk_setup';

type DeskSetup = {
  doctorName: string;
  departmentId: string;
  roomId: string;
  roomNumber: string;
};

type RoomOption = { id: string; roomNumber: string; isActive?: boolean; doctorName?: string | null };

function readSavedSetup(): DeskSetup | null {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.doctorName && v?.departmentId && v?.roomId && v?.roomNumber ? v : null;
  } catch {
    return null;
  }
}

function saveSetup(setup: DeskSetup | null) {
  try {
    if (setup) localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
    else localStorage.removeItem(SETUP_KEY);
  } catch {}
}

// "Dr. S. Roy" and "dr.  s. roy " are the same person (matches analytics' doctor grouping).
const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const sameName = (a?: string | null, b?: string | null) =>
  !!a && !!b && normName(a) === normName(b);

/**
 * Doctor Desk: a doctor picks their name, department and room once, then only presses
 * Done on each patient. Calling patients in stays with the main Doctor Room screen.
 */
export default function DoctorDesk() {
  const searchParams = useSearchParams();
  const urlDeptId = searchParams.get('deptId');
  const loadDepartments = useDepartmentStore((s) => s.loadDepartments);

  const [setup, setSetup] = useState<DeskSetup | null>(null);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSetup(readSavedSetup());
    setReady(true);
    loadDepartments(urlDeptId);
  }, [loadDepartments, urlDeptId]);

  if (!ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">
        {setup && !editing ? (
          <RoomView setup={setup} onChange={() => setEditing(true)} />
        ) : (
          <SetupForm
            initial={setup}
            defaultDeptId={urlDeptId}
            onCancel={setup ? () => setEditing(false) : undefined}
            onDone={(s) => {
              saveSetup(s);
              setSetup(s);
              setEditing(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1: name, department, room                                      */
/* ------------------------------------------------------------------ */

function SetupForm({
  initial,
  defaultDeptId,
  onDone,
  onCancel,
}: {
  initial: DeskSetup | null;
  defaultDeptId: string | null;
  onDone: (s: DeskSetup) => void;
  onCancel?: () => void;
}) {
  const departments = useDepartmentStore((s) => s.departments);

  const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
  const [name, setName] = useState(initial?.doctorName ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? defaultDeptId ?? '');
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomId, setRoomId] = useState(initial?.roomId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Room number to preselect once a department's rooms arrive (from a picked doctor).
  const pendingRoomNumber = useRef<string | null>(null);

  useEffect(() => {
    getDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, []);

  // Fall back to the first department once the list loads.
  useEffect(() => {
    if (!departmentId && departments.length > 0) setDepartmentId(departments[0].id);
  }, [departments, departmentId]);

  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;
    setRoomsLoading(true);
    getRooms(departmentId)
      .then((list: RoomOption[]) => {
        if (cancelled) return;
        const active = list
          .filter((r) => r.isActive !== false)
          .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
        setRooms(active);
        setRoomId((current) => {
          if (pendingRoomNumber.current) {
            const match = active.find((r) => r.roomNumber === pendingRoomNumber.current);
            pendingRoomNumber.current = null;
            if (match) return match.id;
          }
          return active.some((r) => r.id === current) ? current : '';
        });
      })
      .catch(() => !cancelled && setRooms([]))
      .finally(() => !cancelled && setRoomsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    const list = q ? doctors.filter((d) => d.name.toLowerCase().includes(q)) : doctors;
    return list.slice(0, 8);
  }, [doctors, trimmed]);
  const isKnownName = doctors.some((d) => sameName(d.name, trimmed));

  const pickDoctor = (d: DoctorListItem) => {
    setName(d.name);
    setShowSuggestions(false);
    if (d.departmentId && d.departmentId !== departmentId) {
      pendingRoomNumber.current = d.roomNumber;
      setDepartmentId(d.departmentId);
    } else if (d.roomNumber) {
      const match = rooms.find((r) => r.roomNumber === d.roomNumber);
      if (match) setRoomId(match.id);
    }
  };

  const selectedRoom = rooms.find((r) => r.id === roomId);
  const otherDoctorInRoom =
    selectedRoom?.doctorName && !sameName(selectedRoom.doctorName, trimmed) ? selectedRoom.doctorName : null;

  const canStart = trimmed.length > 0 && !!departmentId && !!selectedRoom && !saving;

  const handleStart = async () => {
    if (!canStart || !selectedRoom) return;
    setSaving(true);
    setError('');
    try {
      const res = await assignDoctorToRoom(trimmed, departmentId, selectedRoom.id);
      onDone({
        doctorName: res?.doctor?.name || trimmed,
        departmentId,
        roomId: selectedRoom.id,
        roomNumber: selectedRoom.roomNumber,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Doctor Desk</h1>
          <p className="text-sm text-slate-500 mt-1">Choose your name and room. You only do this once.</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 min-h-11 px-4 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-700 active:bg-slate-100"
          >
            Back
          </button>
        )}
      </div>

      {/* 1. Name */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <label htmlFor="desk-doctor-name" className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Stethoscope size={16} className="text-blue-600" /> 1. Your name
        </label>
        <div className="relative mt-3">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            id="desk-doctor-name"
            type="text"
            autoComplete="off"
            value={name}
            placeholder="Search or type your name"
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            className="w-full min-h-12 pl-11 pr-10 rounded-xl border border-slate-300 bg-slate-50 text-base font-semibold outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          />
          {name && (
            <button
              type="button"
              aria-label="Clear name"
              onClick={() => {
                setName('');
                setShowSuggestions(true);
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {showSuggestions && (matches.length > 0 || (trimmed && !isKnownName)) && (
          <ul className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {matches.map((d) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={() => pickDoctor(d)}
                  className="w-full min-h-12 px-4 py-2 flex items-center justify-between gap-3 text-left active:bg-blue-50 hover:bg-slate-50"
                >
                  <span className="font-bold text-slate-800 truncate">{d.name}</span>
                  {d.roomNumber && <span className="shrink-0 text-xs font-semibold text-slate-500">Room {d.roomNumber}</span>}
                </button>
              </li>
            ))}
            {trimmed && !isKnownName && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowSuggestions(false)}
                  className="w-full min-h-12 px-4 py-2 flex items-center gap-2 text-left text-blue-700 font-bold active:bg-blue-50 hover:bg-blue-50/60"
                >
                  <UserPlus size={16} className="shrink-0" />
                  <span className="truncate">Add &ldquo;{trimmed}&rdquo; as a new doctor</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* 2. Department */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <label htmlFor="desk-department" className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Building2 size={16} className="text-blue-600" /> 2. Department
        </label>
        <select
          id="desk-department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="mt-3 w-full min-h-12 px-3 rounded-xl border border-slate-300 bg-slate-50 text-base font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {departments.length === 0 && <option value="">Loading…</option>}
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </section>

      {/* 3. Room */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-black text-slate-800">
          <DoorOpen size={16} className="text-blue-600" /> 3. Room number
        </p>
        {roomsLoading ? (
          <div className="mt-3 py-6 flex justify-center text-slate-400">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : rooms.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No rooms set up for this department yet. Ask an admin to add rooms in Settings.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Room number">
            {rooms.map((r) => {
              const selected = r.id === roomId;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRoomId(r.id)}
                  className={`min-h-16 px-2 py-2 rounded-xl border-2 flex flex-col items-center justify-center transition-colors ${
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-800 active:bg-slate-100'
                  }`}
                >
                  <span className="text-lg font-black leading-none">{r.roomNumber}</span>
                  {r.doctorName && (
                    <span className={`mt-1 text-[11px] font-semibold truncate max-w-full ${selected ? 'text-blue-100' : 'text-slate-500'}`}>
                      {r.doctorName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {otherDoctorInRoom && (
          <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Room {selectedRoom?.roomNumber} is set to <strong>{otherDoctorInRoom}</strong>. Starting will put your name on it instead.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className="w-full min-h-14 rounded-2xl bg-blue-600 text-white text-lg font-black shadow-md shadow-blue-600/20 disabled:bg-slate-300 disabled:shadow-none active:bg-blue-700 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="animate-spin" size={20} /> : null}
        {saving ? 'Saving…' : 'Start'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: the patients in this room, each with a Done button          */
/* ------------------------------------------------------------------ */

type ActivePatient = {
  id: string;
  token: string;
  room: string;
  patientName: string;
  uhid: string;
  calledAt?: number;
};

const EMPTY: ActivePatient[] = [];

function minutesAgo(ts?: number, now = Date.now()) {
  if (!ts) return '';
  const mins = Math.max(0, Math.floor((now - ts) / 60_000));
  return mins < 1 ? 'just now' : `${mins} min ago`;
}

function RoomView({ setup, onChange }: { setup: DeskSetup; onChange: () => void }) {
  const { departmentId, roomNumber, doctorName } = setup;
  const departments = useDepartmentStore((s) => s.departments);
  const deptName = departments.find((d) => d.id === departmentId)?.name;

  const activeTokens = useQueueStore((s) => s.liveQueues[departmentId]?.activeTokens) as ActivePatient[] | undefined;
  const waitingCount = useQueueStore((s) => s.liveQueues[departmentId]?.nextTokens?.length ?? 0);
  const loaded = useQueueStore((s) => !!s.liveQueues[departmentId]);

  const patients = useMemo(
    () =>
      (activeTokens ?? EMPTY)
        .filter((t) => t.room === roomNumber)
        .sort((a, b) => (a.calledAt ?? 0) - (b.calledAt ?? 0)),
    [activeTokens, roomNumber]
  );

  const [confirming, setConfirming] = useState<ActivePatient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Patients completed today, from the same numbers the Analytics page shows.
  const [served, setServed] = useState<{ room: number; doctor: number } | null>(null);
  const servedRequest = useRef(0);
  const loadServed = useCallback(async () => {
    const requestId = ++servedRequest.current;
    try {
      const data = await getDepartmentAnalytics(departmentId);
      if (requestId !== servedRequest.current) return;
      const roomServed =
        (data?.roomStats as { roomNumber: string; completedCount: number }[] | undefined)
          ?.find((r) => r.roomNumber === roomNumber)?.completedCount ?? 0;
      const doctorServed =
        (data?.doctorStats as { doctorName: string | null; servedCount: number }[] | undefined)
          ?.find((d) => sameName(d.doctorName, doctorName))?.servedCount ?? 0;
      setServed({ room: roomServed, doctor: doctorServed });
    } catch {
      // Keep the last numbers; the next refresh will try again.
    }
  }, [departmentId, roomNumber, doctorName]);

  // Reload whenever a patient enters or leaves this room (Done here or on the Doctor
  // Room screen), plus once a minute as a fallback.
  const roomPatientKey = patients.map((p) => p.id).join(',');
  useEffect(() => {
    const id = setTimeout(loadServed, 500);
    return () => clearTimeout(id);
  }, [loadServed, roomPatientKey]);
  useEffect(() => {
    const id = setInterval(loadServed, 60_000);
    return () => clearInterval(id);
  }, [loadServed]);

  useEffect(() => {
    useQueueStore.getState().initializeWebSocket(departmentId);
    return () => useQueueStore.getState().disconnectWebSocket();
  }, [departmentId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const closeConfirm = useCallback(() => {
    if (submitting) return;
    setConfirming(null);
    setError('');
  }, [submitting]);

  const confirmDone = async () => {
    if (!confirming || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Credit this doctor, even if another doctor's name is on the room.
      await markTokenAction(confirming.id, 'COMPLETE', undefined, departmentId, doctorName);
      setToast(`Token ${confirming.token} marked done`);
      setConfirming(null);
      await useQueueStore.getState().fetchQueue(departmentId);
    } catch {
      setError('Could not mark as done. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Who and where */}
      <header className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg sm:text-xl font-black truncate flex items-center gap-2">
            <Stethoscope size={18} className="text-blue-600 shrink-0" />
            <span className="truncate">{doctorName}</span>
          </p>
          <p className="text-sm text-slate-500 mt-0.5 truncate">
            {deptName ? `${deptName} · ` : ''}
            <strong className="text-slate-800">Room {roomNumber}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="shrink-0 min-h-11 px-3 sm:px-4 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-700 active:bg-slate-200 flex items-center gap-1.5"
        >
          <ArrowLeftRight size={15} /> Change
        </button>
      </header>

      {/* Served today */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <DoorOpen size={14} className="text-blue-600 shrink-0" />
            <span className="truncate">Room {roomNumber}</span>
          </p>
          <p className="mt-1 text-3xl sm:text-4xl font-black text-slate-900 leading-none">{served ? served.room : '–'}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">served in this room today</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Stethoscope size={14} className="text-emerald-600 shrink-0" />
            <span className="truncate">{doctorName}</span>
          </p>
          <p className="mt-1 text-3xl sm:text-4xl font-black text-emerald-700 leading-none">{served ? served.doctor : '–'}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">served by you today</p>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-black text-slate-800">
          Patients in your room{patients.length > 0 ? ` (${patients.length})` : ''}
        </h2>
        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
          <Users size={13} /> {waitingCount} waiting
        </span>
      </div>

      {!loaded ? (
        <div className="py-16 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : patients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-14 px-6 text-center">
          <DoorOpen size={36} className="mx-auto text-slate-300" />
          <p className="mt-3 font-bold text-slate-700">No patient in your room right now</p>
          <p className="mt-1 text-sm text-slate-500">The next patient will appear here as soon as they are called in.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {patients.map((p) => (
            <li
              key={p.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-3xl font-black tracking-tight text-slate-900">{p.token}</p>
                <p className="mt-1 text-base font-semibold text-slate-700 truncate">{p.patientName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.uhid ? `UHID ${p.uhid} · ` : ''}Called {minutesAgo(p.calledAt, now)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(p)}
                className="w-full sm:w-40 min-h-14 rounded-2xl bg-emerald-600 text-white text-lg font-black shadow-md shadow-emerald-600/20 active:bg-emerald-700 hover:bg-emerald-700 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={22} /> Done
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDoneDialog
          patient={confirming}
          submitting={submitting}
          error={error}
          onCancel={closeConfirm}
          onConfirm={confirmDone}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 max-w-[calc(100vw-2rem)] px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold shadow-xl flex items-center gap-2"
        >
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" /> {toast}
        </div>
      )}
    </div>
  );
}

function ConfirmDoneDialog({
  patient,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  patient: ActivePatient;
  submitting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Cancel has focus, so a stray Enter or a second tap does not confirm.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-done-title"
        aria-describedby="confirm-done-desc"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 id="confirm-done-title" className="text-xl font-black text-slate-900">
          Do you really want to press Done?
        </h2>
        <p id="confirm-done-desc" className="mt-2 text-slate-600">
          Token <strong className="text-slate-900">{patient.token}</strong>
          {patient.patientName ? <> · {patient.patientName}</> : null} will be marked as done.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-14 rounded-2xl bg-slate-100 border border-slate-300 text-base font-black text-slate-800 active:bg-slate-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="min-h-14 rounded-2xl bg-emerald-600 text-white text-base font-black active:bg-emerald-700 hover:bg-emerald-700 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
            {submitting ? 'Saving…' : 'Yes, Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
