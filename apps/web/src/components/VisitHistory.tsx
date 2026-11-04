'use client';

import { useEffect, useRef, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';

type Visit = {
  id: string;
  tokenNumber: string;
  date: string; // YYYY-MM-DD, the clinic day
  issuedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  status: 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'ABSENT';
  room: string;
  doctor: string;
  department: string;
};

type HistoryData = {
  patient: { name: string; uhid: string; registeredAt: string };
  total: number;
  visits: Visit[];
};

// Times are stored in UTC; staff read them in clinic time wherever the screen is.
const TZ = 'Asia/Kolkata';
const showDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const showTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const showDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });

const STATUS: Record<Visit['status'], { label: string; tone: string }> = {
  COMPLETED: { label: 'Seen', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  IN_PROGRESS: { label: 'With doctor', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  CALLED: { label: 'Called', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  WAITING: { label: 'Waiting', tone: 'bg-slate-50 text-slate-700 border-slate-200' },
  ABSENT: { label: 'Absent', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  SKIPPED: { label: 'Cancelled', tone: 'bg-slate-50 text-slate-500 border-slate-200' },
};

/**
 * Pop-up listing every visit of one patient, newest first: date, time issued,
 * department, token, room, doctor and whether they were seen. Pass the patient (admin)
 * or one of their tokens (Doctor Desk); `currentTokenId` marks the visit on screen now.
 */
export default function VisitHistoryDialog({
  patientId,
  tokenId,
  currentTokenId,
  fallbackName,
  onClose,
}: {
  patientId?: string;
  tokenId?: string;
  currentTokenId?: string;
  fallbackName?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(patientId ? { patientId } : { tokenId: tokenId ?? '' });
    fetch(`/api/v1/patients/visits?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.status === 404) setError('No visit history saved for this patient yet.');
        else if (res.status === 401) setError('Please log in again to see visit history.');
        else if (!res.ok || !body) setError('Could not load visit history. Check the connection and try again.');
        else setData(body as HistoryData);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load visit history. Check the connection and try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, tokenId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const name = data?.patient.name || fallbackName || 'Patient';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-history-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88vh] flex flex-col bg-white text-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 id="visit-history-title" className="text-lg font-black flex items-center gap-2">
              <History size={18} className="text-blue-600 shrink-0" /> Visit history
            </h2>
            <p className="mt-1 font-bold text-slate-800 truncate">{name}</p>
            {data && (
              <p className="text-xs text-slate-500 mt-0.5">
                {data.patient.uhid ? `CR No ${data.patient.uhid} · ` : ''}
                <strong className="text-slate-800">
                  {data.total} visit{data.total === 1 ? '' : 's'}
                </strong>
                {' · '}first registered {showDate(data.patient.registeredAt)}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close visit history"
            className="shrink-0 w-10 h-10 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p role="alert" className="py-8 text-center text-sm font-semibold text-amber-700">
              {error}
            </p>
          ) : !data ? (
            <div className="py-12 flex justify-center text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : data.visits.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No visits saved yet.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {data.visits.map((v) => {
                const status = STATUS[v.status] ?? STATUS.WAITING;
                const waited =
                  v.calledAt ? Math.max(0, Math.round((Date.parse(v.calledAt) - Date.parse(v.issuedAt)) / 60_000)) : null;
                const isCurrent = v.id === currentTokenId;
                return (
                  <li key={v.id} className={`py-3 ${isCurrent ? 'bg-blue-50/60 -mx-3 px-3 rounded-xl' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-slate-900">
                        {showDay(v.date)}
                        <span className="ml-2 text-sm font-semibold text-slate-500">{showTime(v.issuedAt)}</span>
                      </p>
                      <span className={`shrink-0 text-[11px] font-black border rounded-full px-2 py-0.5 ${status.tone}`}>
                        {isCurrent ? 'Now' : status.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {[
                        v.department,
                        `Token ${v.tokenNumber}`,
                        v.room ? `Room ${v.room}` : '',
                        v.doctor,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {waited !== null && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Waited {waited} min
                        {v.completedAt ? ` · done at ${showTime(v.completedAt)}` : ''}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {data && data.total > data.visits.length && (
            <p className="mt-3 text-xs text-center text-slate-500">
              Showing the latest {data.visits.length} of {data.total} visits.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
