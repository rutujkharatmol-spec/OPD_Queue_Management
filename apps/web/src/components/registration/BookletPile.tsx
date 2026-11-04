"use client";
import React, { useMemo, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Search, Stethoscope, Ticket, Trash2 } from 'lucide-react';
import type { Booklet } from '../../lib/api';
import BarcodeScanner, { isSlipQrCode, useCameraAvailable } from '../BarcodeScanner';
import { isValidCrn, normalizeCrn } from '../../lib/crn';

/**
 * "All at once" registration, step 2: the patient has come back to the desk. Find their
 * booklet in the pile by name, mobile, CR No (typed, handheld scanner or camera) or the
 * serial number written on it, and press Give token. Only then is the token issued, so
 * the patient's place in the queue starts on arrival.
 */

export function bookletName(b: Booklet): string {
  return `${b.patient.firstName || ''} ${b.patient.lastName || ''}`.trim() || 'Patient';
}

function realPhone(phone: string | null): string {
  return phone && phone !== '0000000000' ? phone : '';
}

function matches(b: Booklet, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // A short number is the serial written on the booklet: exact, so "1" isn't also 10-19.
  if (/^#?\d{1,4}$/.test(q)) return String(b.serialNumber) === q.replace('#', '');
  const digits = q.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits)) {
    return realPhone(b.patient.phone).includes(digits) || (b.patient.uhid || '').includes(digits);
  }
  return bookletName(b).toLowerCase().includes(q);
}

export default function BookletPile({
  booklets,
  loading,
  error,
  onReload,
  onGiveToken,
  onRemove,
  busyId,
  roomFor,
}: {
  booklets: Booklet[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onGiveToken: (b: Booklet) => void;
  onRemove: (b: Booklet) => void;
  /** The booklet whose token is being issued or which is being removed. */
  busyId: string | null;
  /** The room a doctor is in now, if any, to show next to each chosen doctor. */
  roomFor: (doctorName: string) => string | null;
}) {
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [showGiven, setShowGiven] = useState(false);
  const hasCamera = useCameraAvailable();
  const firstGiveRef = useRef<HTMLButtonElement>(null);

  const waiting = useMemo(() => booklets.filter((b) => !b.token && matches(b, query)), [booklets, query]);
  const given = useMemo(
    () =>
      booklets
        .filter((b) => b.token && matches(b, query))
        .sort((a, b) => (b.handedAt || '').localeCompare(a.handedAt || '')),
    [booklets, query]
  );
  const waitingTotal = booklets.filter((b) => !b.token).length;

  const onScanned = (code: string) => {
    if (isSlipQrCode(code)) {
      setNote("That is the QR code on a queue slip. Scan the barcode on the patient's booklet.");
      return;
    }
    setNote('');
    setQuery(normalizeCrn(code));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-4">
        <label htmlFor="booklet-find" className="block text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
          <Search size={18} className="text-emerald-600" /> Find the patient's booklet
        </label>
        <div className="flex gap-2">
          <input
            id="booklet-find"
            type="text"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNote('');
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              // A handheld scanner types the CR No and presses Enter.
              if (isValidCrn(query)) setQuery(normalizeCrn(query));
              // One match: jump to its Give token button, so a second Enter issues it.
              if (waiting.length === 1) firstGiveRef.current?.focus();
            }}
            placeholder="Name, mobile, CRN or serial no."
            className="flex-1 min-w-0 bg-white border border-emerald-300 rounded-xl px-4 py-3 text-slate-800 font-semibold focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
          />
          {hasCamera && (
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              title="Scan the booklet barcode with the camera"
              className="px-4 rounded-xl bg-white border border-emerald-300 text-emerald-700 font-bold text-sm hover:bg-emerald-50 cursor-pointer flex items-center gap-1.5"
            >
              <Camera size={16} /> <span className="hidden sm:inline">Scan</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReload}
            title="Refresh the list"
            aria-label="Refresh the list"
            className="px-3 rounded-xl bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer flex items-center"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {note && <p className="mt-2 text-sm font-semibold text-amber-700">{note}</p>}
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-emerald-800">
          {waitingTotal === 0
            ? 'No booklets waiting. Take in booklets first.'
            : `${waitingTotal} booklet${waitingTotal === 1 ? '' : 's'} waiting for their patient.`}
        </p>
      </div>

      <div className="space-y-2">
        {waiting.map((b, i) => {
          const phone = realPhone(b.patient.phone);
          const busy = busyId === b.id;
          return (
            <div key={b.id} className="p-3 sm:p-4 rounded-2xl border border-slate-200 bg-white flex items-center gap-3">
              <div className="shrink-0 w-14 h-14 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Serial</span>
                <span className="text-xl font-black leading-none">{b.serialNumber}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900 truncate">{bookletName(b)}</span>
                  {b.priority === 'EMERGENCY' && (
                    <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-md">🚨 Emergency</span>
                  )}
                  {b.priority === 'SENIOR' && (
                    <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">🟡 Senior</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {[phone, b.patient.uhid ? `CRN ${b.patient.uhid}` : ''].filter(Boolean).join(' · ') || 'No mobile or CRN'}
                </p>
                <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                  <Stethoscope size={12} className="shrink-0 text-blue-600" />
                  <span className="truncate">
                    {b.doctorNames.length === 0
                      ? 'Any doctor'
                      : b.doctorNames
                          .map((n) => {
                            const room = roomFor(n);
                            return room ? `${n} (Room ${room})` : `${n} (not in a room)`;
                          })
                          .join(', then ')}
                  </span>
                </p>
              </div>
              <div className="shrink-0 flex flex-col sm:flex-row gap-1.5">
                <button
                  ref={i === 0 ? firstGiveRef : undefined}
                  type="button"
                  disabled={!!busyId}
                  onClick={() => onGiveToken(b)}
                  className="px-3 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 cursor-pointer focus:ring-4 focus:ring-emerald-500/30 outline-none"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Ticket size={16} />} Give token
                </button>
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => onRemove(b)}
                  title="Remove from the list"
                  aria-label={`Remove booklet ${b.serialNumber}`}
                  className="px-3 py-2 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}

        {!loading && waiting.length === 0 && waitingTotal > 0 && (
          <p className="text-center py-8 text-slate-400 text-sm">No waiting booklet matches “{query}”.</p>
        )}
      </div>

      {given.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setShowGiven((v) => !v)}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            {showGiven ? '▾' : '▸'} Given back with a token ({given.length})
          </button>
          {showGiven && (
            <div className="mt-2 space-y-1.5">
              {given.map((b) => (
                <div key={b.id} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-sm">
                  <span className="shrink-0 font-black text-slate-500 w-10">#{b.serialNumber}</span>
                  <span className="flex-1 min-w-0 truncate font-semibold text-slate-700">{bookletName(b)}</span>
                  <span className="shrink-0 font-black text-slate-900">Token {b.token!.tokenNumber}</span>
                  <button
                    type="button"
                    disabled={!!busyId}
                    onClick={() => onGiveToken(b)}
                    title="Show this token's slip again"
                    className="shrink-0 px-2.5 py-1 text-xs font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-white cursor-pointer"
                  >
                    Slip
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cameraOpen && (
        <BarcodeScanner
          title="Scan booklet to find patient"
          accept={(code) => isValidCrn(code) || isSlipQrCode(code)}
          onClose={() => setCameraOpen(false)}
          onDetected={(code) => {
            setCameraOpen(false);
            onScanned(code);
          }}
        />
      )}
    </div>
  );
}
