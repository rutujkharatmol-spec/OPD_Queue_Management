"use client";
import React from 'react';
import { MapPin, Users } from 'lucide-react';
import { t, type PatientLang } from '../../lib/patientI18n';
import type { TokenStatusResponse } from '../../lib/api';

interface Props {
  lang: PatientLang;
  data: TokenStatusResponse;
}

/**
 * Turns "6 patients ahead" into something a waiting patient can watch move.
 *
 * A bare count gives no sense of whether the queue is advancing; a strip of the tokens
 * immediately in front, with their own token pinned at the end, does. Everything here
 * comes from the status response the page already polls — no second request.
 */
export default function QueueStrip({ lang, data }: Props) {
  const { patientsAhead, initiallyAhead, aheadTokens, servingByRoom, tokenNumber } = data;

  // Measured against the patient's position when their token was issued, not when they
  // opened the page — otherwise every reload would reset the bar to zero. The max() keeps
  // it sane if an emergency token is inserted ahead after issue.
  const baseline = Math.max(initiallyAhead, patientsAhead);
  const served = Math.max(0, baseline - patientsAhead);
  const progress = baseline > 0 ? Math.min(100, Math.round((served / baseline) * 100)) : 100;

  // The response names at most five predecessors; anything beyond that is summarised.
  const notShown = Math.max(0, patientsAhead - aheadTokens.length);

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Users size={14} className="text-slate-400" />
          {t(lang, 'queueHeading')}
        </p>
        <p className="text-xs font-bold text-slate-500 tabular-nums">{progress}%</p>
      </div>

      <div
        className="h-2 w-full rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={t(lang, 'queueHeading')}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Who is with a doctor right now, and where to find them. */}
      {servingByRoom.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {t(lang, 'nowServing')}
          </p>
          <ul className="space-y-1.5">
            {servingByRoom.map((entry) => (
              <li
                key={`${entry.roomNumber ?? 'unassigned'}-${entry.tokenNumber}`}
                className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-3 py-2"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                  <MapPin size={14} className="text-emerald-600 shrink-0" />
                  {entry.roomNumber ? t(lang, 'room', { room: entry.roomNumber }) : '—'}
                </span>
                <span className="font-black text-slate-800 text-sm tabular-nums">
                  {entry.tokenNumber}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The tail of the queue: the last few before this patient, then this patient. */}
      <div className="flex items-center gap-2 flex-wrap">
        {notShown > 0 && (
          <span className="text-xs font-bold text-slate-400 tabular-nums">+{notShown}</span>
        )}
        {aheadTokens.map((token) => (
          <span
            key={token}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-500 tabular-nums"
          >
            {token}
          </span>
        ))}
        <span className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-black tabular-nums shadow-sm shadow-blue-600/30">
          {tokenNumber}
          <span className="ml-1.5 font-bold text-blue-100 text-xs">{t(lang, 'youLabel')}</span>
        </span>
      </div>
    </div>
  );
}
