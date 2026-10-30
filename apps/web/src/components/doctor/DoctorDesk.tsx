'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, Stethoscope, Building2, DoorOpen, UserPlus, Search, ArrowLeftRight,
  Loader2, Users, X, UserX, BellRing, ScanLine, Pause, Play, UserCheck, Clock, Camera,
} from 'lucide-react';
import {
  assignDoctorToRoom, callNextPatient, getDepartmentAnalytics, getDoctors, getRooms, markTokenAction,
  type DoctorListItem,
} from '../../lib/api';
import { splitDoctorNames } from '../../lib/roomDoctors';
import { LATE_AFTER_MINUTES } from '../../lib/queuePass';
import BarcodeScanner, { isSlipQrCode, useCameraAvailable } from '../BarcodeScanner';
import { INVALID_CRN_MESSAGE, isValidCrn, normalizeCrn } from '../../lib/crn';
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
 * Doctor Desk: a doctor picks their name, department and room once, then works through
 * their patients: Call Next Patient, the patient comes in (booklet scanned or "Came in"
 * tapped), Done (scanned again or tapped). Auto-call calls the next patient when the room
 * empties; Pause stops new calls. A called patient who doesn't come in within
 * LATE_AFTER_MINUTES is moved back automatically, further each time.
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
  // Join the doctors already in the room (true), or replace them because they have left.
  const [shareRoom, setShareRoom] = useState(true);
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
  // Several doctors can share a room; these are the ones already on it.
  const othersInRoom = splitDoctorNames(selectedRoom?.doctorName).filter((n) => !sameName(n, trimmed));

  useEffect(() => setShareRoom(true), [roomId]);

  const nameHasComma = trimmed.includes(',');
  const canStart = trimmed.length > 0 && !nameHasComma && !!departmentId && !!selectedRoom && !saving;

  const handleStart = async () => {
    if (!canStart || !selectedRoom) return;
    setSaving(true);
    setError('');
    try {
      const res = await assignDoctorToRoom(trimmed, departmentId, selectedRoom.id, othersInRoom.length === 0 || shareRoom);
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
        {othersInRoom.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">
              Room {selectedRoom?.roomNumber} already has <strong>{othersInRoom.join(', ')}</strong>.
            </p>
            <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Doctors already in this room">
              {[
                { share: true, label: 'Share the room with them' },
                { share: false, label: othersInRoom.length === 1 ? 'They have left. Replace them' : 'They have all left. Replace them' },
              ].map((o) => (
                <button
                  key={String(o.share)}
                  type="button"
                  role="radio"
                  aria-checked={shareRoom === o.share}
                  onClick={() => setShareRoom(o.share)}
                  className={`min-h-11 px-3 rounded-lg border-2 text-left text-sm font-bold flex items-center gap-2 ${
                    shareRoom === o.share ? 'border-amber-600 bg-white text-amber-900' : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <span
                    className={`w-4 h-4 shrink-0 rounded-full border-2 ${shareRoom === o.share ? 'border-amber-600 bg-amber-600' : 'border-amber-400'}`}
                  />
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {nameHasComma && (
        <p role="alert" className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          Please type your name without a comma.
        </p>
      )}

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
  /** CALLED: on the way in. IN_PROGRESS: came in, with the doctor. */
  status?: 'CALLED' | 'IN_PROGRESS';
  room: string;
  patientName: string;
  /** The booklet's CRN (staff screens only). */
  uhid: string;
  calledAt?: number;
};

const EMPTY: ActivePatient[] = [];
const LATE_MS = LATE_AFTER_MINUTES * 60_000;

function minutesAgo(ts?: number, now = Date.now()) {
  if (!ts) return '';
  const mins = Math.max(0, Math.floor((now - ts) / 60_000));
  return mins < 1 ? 'just now' : `${mins} min ago`;
}

/** "4:05" */
function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const sameCrn = (a?: string | null, b?: string | null) =>
  !!normalizeCrn(a) && normalizeCrn(a) === normalizeCrn(b);

// Auto-call and Pause, remembered on this computer for this doctor and room.
const FLOW_KEY = 'opd_doctor_desk_flow';
type DeskFlow = { autoCall: boolean; paused: boolean };

function readFlow(key: string): DeskFlow {
  try {
    const v = JSON.parse(localStorage.getItem(FLOW_KEY) || '{}')?.[key];
    return { autoCall: !!v?.autoCall, paused: !!v?.paused };
  } catch {
    return { autoCall: false, paused: false };
  }
}

function saveFlow(key: string, flow: DeskFlow) {
  try {
    const all = JSON.parse(localStorage.getItem(FLOW_KEY) || '{}') || {};
    all[key] = flow;
    localStorage.setItem(FLOW_KEY, JSON.stringify(all));
  } catch {}
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

  // The patient and the action (Done or Absent) waiting for confirmation.
  const [confirming, setConfirming] = useState<{ patient: ActivePatient; action: 'COMPLETE' | 'ABSENT' } | null>(null);
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

  // Doctors move between rooms. If an admin or another desk moved this doctor (or took
  // them off this room), say so instead of quietly showing the old room. undefined: no
  // change; null: no longer on any room; otherwise the room they are now on.
  const [movedTo, setMovedTo] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getDoctors()
        .then((list) => {
          if (cancelled) return;
          const me = list.find((d) => sameName(d.name, doctorName));
          if (!me) return;
          const sameRoom =
            me.roomNumber === roomNumber && (!me.departmentId || me.departmentId === departmentId);
          setMovedTo(sameRoom ? undefined : me.roomNumber);
        })
        .catch(() => {});
    void check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [doctorName, roomNumber, departmentId]);

  useEffect(() => {
    useQueueStore.getState().initializeWebSocket(departmentId);
    return () => useQueueStore.getState().disconnectWebSocket();
  }, [departmentId]);

  // Every second, for the "late in 4:05" countdown on a called patient.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
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

  const confirmAction = async () => {
    if (!confirming || submitting) return;
    const { patient, action } = confirming;
    setSubmitting(true);
    setError('');
    try {
      if (action === 'COMPLETE') {
        // Credit this doctor, even if another doctor's name is on the room.
        await markTokenAction(patient.id, 'COMPLETE', undefined, departmentId, doctorName);
        setToast(`Token ${patient.token} marked done`);
      } else {
        await markTokenAction(patient.id, 'ABSENT', undefined, departmentId);
        setToast(`Token ${patient.token} marked absent`);
      }
      setConfirming(null);
      await useQueueStore.getState().fetchQueue(departmentId);
    } catch {
      setError(action === 'COMPLETE' ? 'Could not mark as done. Please try again.' : 'Could not mark as absent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Call Next, Auto-call, Pause ---- */

  const flowKey = `${departmentId}|${roomNumber}|${doctorName.toLowerCase()}`;
  const [flow, setFlow] = useState<DeskFlow>({ autoCall: false, paused: false });
  useEffect(() => setFlow(readFlow(flowKey)), [flowKey]);
  const updateFlow = (change: Partial<DeskFlow>) => {
    setFlow((prev) => {
      const next = { ...prev, ...change };
      saveFlow(flowKey, next);
      return next;
    });
  };

  const [calling, setCalling] = useState(false);
  const callingRef = useRef(false);
  const [confirmingCall, setConfirmingCall] = useState(false);
  const [callError, setCallError] = useState('');
  // After "nobody to call" (or an error), auto-call waits before asking again.
  const quietUntil = useRef(0);

  // The next patient for this room: the doctor's own patients (sent here at registration)
  // and the general line, emergencies first, then in order of arrival.
  const callNext = useCallback(
    async (auto = false) => {
      if (callingRef.current) return;
      callingRef.current = true;
      setCalling(true);
      setCallError('');
      try {
        const called = await callNextPatient(departmentId, roomNumber, undefined, doctorName);
        setConfirmingCall(false);
        if (called?.tokenNumber) {
          setToast(`Token ${called.tokenNumber} called to Room ${roomNumber}`);
        } else {
          quietUntil.current = Date.now() + 20_000;
          if (!auto) setToast('No patients waiting for your room');
        }
        await useQueueStore.getState().fetchQueue(departmentId);
      } catch {
        quietUntil.current = Date.now() + 20_000;
        setCallError('Could not call the next patient. Please try again.');
      } finally {
        callingRef.current = false;
        setCalling(false);
      }
    },
    [departmentId, roomNumber, doctorName]
  );

  // With someone still in the room, ask first: an accidental tap would call a second patient.
  const onCallNextPress = () => {
    setCallError('');
    if (patients.length > 0) setConfirmingCall(true);
    else void callNext();
  };

  const closeCallConfirm = useCallback(() => {
    if (calling) return;
    setConfirmingCall(false);
    setCallError('');
  }, [calling]);

  // Auto-call: when the room is empty, call the next patient (after a short pause, so the
  // doctor sees the "done" message first).
  useEffect(() => {
    if (!flow.autoCall || flow.paused || !loaded || patients.length > 0 || waitingCount === 0) return;
    if (confirming || confirmingCall) return;
    const wait = Math.max(0, quietUntil.current - Date.now()) + 800;
    const id = setTimeout(() => void callNext(true), wait);
    return () => clearTimeout(id);
  }, [flow.autoCall, flow.paused, loaded, patients.length, waitingCount, confirming, confirmingCall, callNext]);

  /* ---- Came in, and late patients ---- */

  const [busyId, setBusyId] = useState<string | null>(null);

  const markCameIn = async (p: ActivePatient) => {
    if (busyId) return;
    setBusyId(p.id);
    try {
      await markTokenAction(p.id, 'ARRIVED', undefined, departmentId);
      setToast(`Token ${p.token} came in`);
      await useQueueStore.getState().fetchQueue(departmentId);
    } catch {
      setScanMsg({ kind: 'warn', text: `Could not save for token ${p.token}. Please try again.` });
    } finally {
      setBusyId(null);
    }
  };

  // The late clock only runs while the doctor is free. A patient waiting at the door while
  // someone else is being seen isn't late, so the clock starts at the call or when the
  // room's last consultation ended, whichever is later (or when this screen opened, so a
  // reload never penalises anyone on the spot). Null: the doctor is with a patient.
  const anyInConsult = patients.some((p) => p.status === 'IN_PROGRESS');
  const [freeSince, setFreeSince] = useState<number | null>(() => Date.now());
  useEffect(() => {
    if (anyInConsult) setFreeSince(null);
    else setFreeSince((prev) => prev ?? Date.now());
  }, [anyInConsult]);
  const lateAt = (p: ActivePatient) =>
    freeSince === null || !p.calledAt ? null : Math.max(p.calledAt, freeSince) + LATE_MS;

  // A called patient who hasn't come in by then is moved back. This screen only asks; the
  // server checks the time again and decides, so a wrong PC clock or a second desk can't
  // move anyone early. If it says "not yet", ask again in 15 s.
  const lateAsked = useRef(new Map<string, number>());
  useEffect(() => {
    for (const p of patients) {
      const due = lateAt(p);
      if ((p.status ?? 'CALLED') !== 'CALLED' || due === null || now < due) continue;
      const key = `${p.id}:${p.calledAt}`;
      const askedAt = lateAsked.current.get(key);
      if (askedAt && now - askedAt < 15_000) continue;
      lateAsked.current.set(key, now);
      markTokenAction(p.id, 'LATE', undefined, departmentId)
        .then(async (res) => {
          if (!res?.changed) return;
          setToast(
            res.outcome === 'ABSENT'
              ? `Token ${p.token} didn't come in (${res.timesLate} times): marked absent`
              : `Token ${p.token} didn't come in: moved back ${res.places} places`
          );
          await useQueueStore.getState().fetchQueue(departmentId);
        })
        .catch(() => {});
    }
    // lateAt only reads freeSince, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, patients, departmentId, freeSince]);

  /* ---- Booklet scan: first scan = came in, second scan = done ---- */

  const scanRef = useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  // The phone or webcam camera, for desks without a handheld scanner.
  const hasCamera = useCameraAvailable();
  const [cameraOpen, setCameraOpen] = useState(false);

  // On a computer with a scanner, keep the cursor in the scan box. Not on phones and
  // tablets, where focusing it would pop up the keyboard.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) scanRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!scanMsg) return;
    const id = setTimeout(() => setScanMsg(null), 6000);
    return () => clearTimeout(id);
  }, [scanMsg]);

  const handleScan = async (fromCamera?: string) => {
    const crn = (fromCamera ?? scanValue).trim();
    if (!crn || scanBusy) return;
    setScanValue(''); // the next scan starts fresh
    if (isSlipQrCode(crn)) {
      setScanMsg({ kind: 'warn', text: "That is the QR code on a queue slip. Scan the barcode on the patient's booklet." });
      return;
    }
    if (!isValidCrn(crn)) {
      setScanMsg({ kind: 'warn', text: INVALID_CRN_MESSAGE });
      return;
    }
    const p = patients.find((x) => sameCrn(x.uhid, crn));
    if (!p) {
      setScanMsg({ kind: 'warn', text: `CRN ${crn} is not a patient in your room right now.` });
      return;
    }
    setScanBusy(true);
    try {
      if ((p.status ?? 'CALLED') === 'CALLED') {
        await markTokenAction(p.id, 'ARRIVED', undefined, departmentId);
        setScanMsg({ kind: 'ok', text: `Token ${p.token} came in. Scan the booklet again when done.` });
      } else {
        // Scanning when the consultation is over is the doctor's "Done".
        await markTokenAction(p.id, 'COMPLETE', undefined, departmentId, doctorName);
        setScanMsg({ kind: 'ok', text: `Token ${p.token} marked done.` });
      }
      await useQueueStore.getState().fetchQueue(departmentId);
    } catch {
      setScanMsg({ kind: 'warn', text: 'Could not save. Please scan again.' });
    } finally {
      setScanBusy(false);
      scanRef.current?.focus();
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

      {movedTo !== undefined && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-sm text-amber-900">
            {movedTo
              ? <>You are now set to <strong>Room {movedTo}</strong>, not Room {roomNumber}.</>
              : <>Your name is no longer on <strong>Room {roomNumber}</strong>.</>}
          </p>
          <button
            type="button"
            onClick={onChange}
            className="shrink-0 min-h-11 px-4 rounded-xl bg-amber-600 text-white text-sm font-bold active:bg-amber-700"
          >
            Choose room
          </button>
        </div>
      )}

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

      {/* Call next patient, Auto-call, Pause */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onCallNextPress}
          disabled={calling || !loaded || flow.paused || waitingCount === 0}
          className="w-full min-h-16 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20 active:bg-blue-700 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none flex items-center justify-center gap-3 px-4"
        >
          {calling && !confirmingCall ? <Loader2 className="animate-spin" size={22} /> : <BellRing size={22} />}
          <span className="text-lg font-black">
            {flow.paused ? 'Paused' : loaded && waitingCount === 0 ? 'No patients waiting' : 'Call Next Patient'}
          </span>
          {waitingCount > 0 && !flow.paused && (
            <span className="text-xs font-bold bg-white/20 rounded-full px-2.5 py-1">{waitingCount} waiting</span>
          )}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={flow.autoCall}
            onClick={() => updateFlow({ autoCall: !flow.autoCall })}
            className={`min-h-12 rounded-xl border-2 text-sm font-black flex items-center justify-center gap-2 ${
              flow.autoCall ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <span className={`w-3 h-3 rounded-full ${flow.autoCall ? 'bg-blue-600' : 'bg-slate-300'}`} />
            Auto-call {flow.autoCall ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => updateFlow({ paused: !flow.paused })}
            className={`min-h-12 rounded-xl border-2 text-sm font-black flex items-center justify-center gap-2 ${
              flow.paused ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {flow.paused ? <Play size={16} /> : <Pause size={16} />}
            {flow.paused ? 'Resume' : 'Pause'}
          </button>
        </div>
        <p className="text-xs text-slate-500 px-1">
          {flow.paused
            ? 'Paused: no new patients will be called to your room.'
            : flow.autoCall
              ? 'Auto-call is on: when your room is empty, the next patient is called for you.'
              : 'Auto-call is off: press Call Next Patient for each patient.'}
        </p>
        {callError && !confirmingCall && (
          <p role="alert" className="text-sm font-semibold text-rose-700 px-1">
            {callError}
          </p>
        )}
      </div>

      {/* Booklet scan: a handheld scanner types the CRN and presses Enter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <label htmlFor="desk-scan" className="text-sm font-black text-slate-800 flex items-center gap-2">
          <ScanLine size={16} className="text-blue-600" /> Scan booklet
        </label>
        <p id="desk-scan-help" className="mt-0.5 text-xs text-slate-500">
          Scan once when the patient comes in, and again when you are done.
        </p>
        <div className="mt-2 flex gap-2">
        <input
          id="desk-scan"
          ref={scanRef}
          type="text"
          autoComplete="off"
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleScan();
            }
          }}
          disabled={scanBusy}
          placeholder="Scan or type CRN"
          aria-describedby="desk-scan-help"
          className="flex-1 min-w-0 min-h-12 px-4 rounded-xl border border-slate-300 bg-slate-50 font-mono font-bold tracking-wide placeholder:font-sans placeholder:font-normal placeholder:tracking-normal outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
        />
        {hasCamera && (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            disabled={scanBusy}
            className="shrink-0 min-h-12 px-4 rounded-xl bg-blue-600 text-white text-sm font-black active:bg-blue-700 hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            <Camera size={18} /> Camera
          </button>
        )}
        </div>
        {scanMsg && (
          <p role="status" className={`mt-2 text-sm font-semibold ${scanMsg.kind === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
            {scanMsg.text}
          </p>
        )}
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
          <p className="mt-1 text-sm text-slate-500">
            {flow.paused
              ? 'You are paused. Press Resume to start calling patients again.'
              : flow.autoCall
                ? 'The next patient will be called automatically.'
                : 'Press Call Next Patient to call the next one in line.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {patients.map((p) => {
            const inConsult = p.status === 'IN_PROGRESS';
            const due = lateAt(p);
            const lateIn = due === null ? null : due - now;
            return (
              <li
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-3xl font-black tracking-tight text-slate-900">{p.token}</p>
                  <p className="mt-1 text-base font-semibold text-slate-700 truncate">{p.patientName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {p.uhid ? `CRN ${p.uhid} · ` : ''}Called {minutesAgo(p.calledAt, now)}
                  </p>
                  {inConsult ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                      <UserCheck size={13} /> In consultation
                    </p>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                      <Clock size={13} />
                      {lateIn === null
                        ? 'Waiting at the door · you are with another patient'
                        : lateIn > 0
                          ? `Coming in · moved back if not here in ${mmss(lateIn)}`
                          : 'Late · moving back…'}
                    </p>
                  )}
                </div>
                <div className="w-full sm:w-auto grid grid-cols-[1fr_2fr] sm:flex gap-2">
                  {inConsult ? (
                    <button
                      type="button"
                      onClick={() => setConfirming({ patient: p, action: 'COMPLETE' })}
                      className="col-span-2 sm:w-40 min-h-14 rounded-2xl bg-emerald-600 text-white text-lg font-black shadow-md shadow-emerald-600/20 active:bg-emerald-700 hover:bg-emerald-700 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={22} /> Done
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirming({ patient: p, action: 'ABSENT' })}
                        className="sm:w-32 min-h-14 rounded-2xl bg-white border-2 border-amber-300 text-amber-800 text-base font-black active:bg-amber-50 hover:bg-amber-50 flex items-center justify-center gap-1.5"
                      >
                        <UserX size={20} /> Absent
                      </button>
                      <button
                        type="button"
                        onClick={() => void markCameIn(p)}
                        disabled={busyId === p.id}
                        className="sm:w-40 min-h-14 rounded-2xl bg-blue-600 text-white text-lg font-black shadow-md shadow-blue-600/20 active:bg-blue-700 hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {busyId === p.id ? <Loader2 className="animate-spin" size={20} /> : <UserCheck size={22} />} Came in
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cameraOpen && (
        <BarcodeScanner
          accept={(code) => isValidCrn(code) || isSlipQrCode(code)}
          onClose={() => setCameraOpen(false)}
          onDetected={(code) => {
            setCameraOpen(false);
            void handleScan(code);
          }}
        />
      )}

      {confirmingCall && (
        <ConfirmDialog
          title="Call the next patient?"
          confirmLabel="Yes, Call Next"
          tone="blue"
          submitting={calling}
          error={callError}
          onCancel={closeCallConfirm}
          onConfirm={() => void callNext()}
        >
          {patients.length === 1 ? (
            <>
              Token <strong className="text-slate-900">{patients[0].token}</strong> is still in your room.
            </>
          ) : (
            <>{patients.length} patients are still in your room.</>
          )}{' '}
          You can finish them later.
        </ConfirmDialog>
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.action === 'COMPLETE' ? 'Do you really want to press Done?' : 'Mark this patient absent?'}
          confirmLabel={confirming.action === 'COMPLETE' ? 'Yes, Done' : 'Yes, Absent'}
          tone={confirming.action === 'COMPLETE' ? 'green' : 'amber'}
          submitting={submitting}
          error={error}
          onCancel={closeConfirm}
          onConfirm={confirmAction}
        >
          Token <strong className="text-slate-900">{confirming.patient.token}</strong>
          {confirming.patient.patientName ? <> · {confirming.patient.patientName}</> : null}{' '}
          {confirming.action === 'COMPLETE'
            ? 'will be marked as done.'
            : 'did not come in. They will be marked absent and removed from your room.'}
        </ConfirmDialog>
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

function ConfirmDialog({
  title,
  children,
  confirmLabel,
  tone,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  tone: 'green' | 'blue' | 'amber';
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

  const confirmColor =
    tone === 'green'
      ? 'bg-emerald-600 active:bg-emerald-700 hover:bg-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-600 active:bg-amber-700 hover:bg-amber-700'
        : 'bg-blue-600 active:bg-blue-700 hover:bg-blue-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 id="confirm-dialog-title" className="text-xl font-black text-slate-900">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="mt-2 text-slate-600">
          {children}
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
            className={`min-h-14 rounded-2xl text-white text-base font-black disabled:opacity-70 flex items-center justify-center gap-2 ${confirmColor}`}
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
            {submitting ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
