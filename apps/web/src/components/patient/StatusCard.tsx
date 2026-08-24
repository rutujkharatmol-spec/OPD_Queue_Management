"use client";
import React from 'react';
import {
  Clock, AlertTriangle, CheckCircle2, User, Calendar, RefreshCw,
  Building2, CheckCircle, WifiOff,
} from 'lucide-react';
import {
  t, formatDateDisplay, formatTimeDisplay, type PatientLang, type StringKey,
} from '../../lib/patientI18n';
import type { TokenStatusResponse, TokenStatusValue } from '../../lib/api';

interface Props {
  lang: PatientLang;
  data: TokenStatusResponse;
  activeDate: string;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  /** True while background polls are failing or the device is offline. */
  isStale: boolean;
  staleMins: number;
  onRefresh: () => void;
  /** Queue strip and alert opt-in, slotted into the WAITING body by the page. */
  waitingExtras?: React.ReactNode;
}

const STATUS_LABEL: Record<TokenStatusValue, StringKey> = {
  WAITING: 'statusWaiting',
  CALLED: 'statusCalled',
  IN_PROGRESS: 'statusCalled',
  COMPLETED: 'statusCompleted',
  ABSENT: 'statusAbsent',
  SKIPPED: 'statusSkipped',
};

const HEADER_THEME: Record<TokenStatusValue, string> = {
  WAITING: 'bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700',
  CALLED: 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700',
  IN_PROGRESS: 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700',
  COMPLETED: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900',
  ABSENT: 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700',
  SKIPPED: 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700',
};

export default function StatusCard({
  lang, data, activeDate, lastUpdated, isRefreshing, isStale, staleMins, onRefresh, waitingExtras,
}: Props) {
  const { status, etaBasis } = data;
  const isWaiting = status === 'WAITING';
  const isCalled = status === 'CALLED' || status === 'IN_PROGRESS';
  const isMissed = status === 'ABSENT' || status === 'SKIPPED';

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-100 overflow-hidden motion-safe:animate-fade-in-up">

      <div className={`p-6 text-center text-white relative overflow-hidden ${HEADER_THEME[status]}`}>
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex justify-between items-center text-white/80 text-xs font-bold uppercase tracking-wider mb-2">
          <span className="flex items-center gap-1">
            <Calendar size={13} />
            {formatDateDisplay(activeDate, lang)}
          </span>
          {data.priority !== 'NORMAL' && (
            <span className="bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-xs font-black text-amber-200">
              ★ {data.priority}
            </span>
          )}
        </div>

        <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-1">
          {t(lang, 'yourToken')}
        </p>
        <h2 className="text-5xl sm:text-6xl font-black tracking-tight drop-shadow-md my-1 tabular-nums">
          {data.tokenNumber}
        </h2>

        {/* Assertive: a status flip while the patient is on this screen is the one thing
            a screen reader must interrupt for. */}
        <div
          aria-live="assertive"
          className="mt-3 inline-flex items-center gap-2 bg-white/20 border border-white/20 px-4 py-1.5 rounded-full backdrop-blur-md font-bold text-sm"
        >
          {isWaiting && <span className="w-2 h-2 rounded-full bg-amber-300 motion-safe:animate-ping" />}
          {isCalled && <span className="w-2 h-2 rounded-full bg-white motion-safe:animate-bounce" />}
          {isWaiting && <Clock size={16} />}
          {isCalled && <CheckCircle2 size={16} />}
          {status === 'COMPLETED' && <CheckCircle size={16} />}
          {isMissed && <AlertTriangle size={16} />}
          {t(lang, STATUS_LABEL[status])}
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">

        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100 grid grid-cols-2 gap-4">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
              <Building2 size={12} /> {t(lang, 'department')}
            </p>
            <p className="font-bold text-slate-800 text-sm sm:text-base leading-tight">
              {data.departmentName}
            </p>
            {data.roomNumber && (
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {t(lang, 'room', { room: data.roomNumber })}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">
              {t(lang, 'servingNow')}
            </p>
            <p className="font-black text-lg sm:text-xl text-blue-600 tracking-tight tabular-nums">
              {data.currentlyServing.length > 0 ? data.currentlyServing.join(', ') : t(lang, 'none')}
            </p>
          </div>
        </div>

        {isWaiting && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4" aria-live="polite">
              <div className="bg-blue-50/70 rounded-2xl p-4 sm:p-5 border border-blue-100 text-center">
                <h4 className="text-3xl sm:text-4xl font-black text-blue-600 mb-1 tabular-nums">
                  {data.patientsAhead}
                </h4>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  {t(lang, data.patientsAhead === 1 ? 'patientAhead' : 'patientsAhead')}
                </p>
              </div>
              <div className="bg-amber-50/70 rounded-2xl p-4 sm:p-5 border border-amber-200/80 text-center">
                <h4 className="text-3xl sm:text-4xl font-black text-amber-700 mb-1 tabular-nums">
                  ~{data.estimatedWaitTimeMins}
                </h4>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  {t(lang, 'estimatedMins')}
                </p>
              </div>
            </div>

            {/* Shows its working. When the day is too young for a meaningful average the
                estimate says so rather than presenting a guess as a measurement. */}
            <p className="text-xs text-slate-500 text-center leading-relaxed px-2">
              {etaBasis.isReliable
                ? t(lang, etaBasis.activeRooms === 1 ? 'etaBasisOne' : 'etaBasis', {
                    rooms: etaBasis.activeRooms,
                    mins: etaBasis.avgConsultMins,
                  })
                : t(lang, 'etaUnreliable')}
            </p>

            {waitingExtras}

            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-900">
              <AlertTriangle className="shrink-0 text-amber-700 mt-0.5" size={18} />
              <p className="text-sm font-medium leading-relaxed">
                {t(lang, 'waitNotice', { dept: data.departmentName })}
              </p>
            </div>
          </div>
        )}

        {isCalled && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center text-emerald-900 motion-safe:animate-pulse">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-700">
              <User size={26} />
            </div>
            <h3 className="font-black text-xl mb-1 text-emerald-800">{t(lang, 'yourTurn')}</h3>
            <p className="text-sm text-emerald-700 font-semibold">
              {data.roomNumber
                ? t(lang, 'proceedTo', { room: data.roomNumber })
                : t(lang, 'proceedToUnassigned')}
            </p>
          </div>
        )}

        {status === 'COMPLETED' && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center text-slate-700">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={28} />
            <h3 className="font-bold text-base text-slate-800">{t(lang, 'completedTitle')}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {t(lang, 'completedBody', { date: formatDateDisplay(activeDate, lang) })}
            </p>
          </div>
        )}

        {isMissed && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center text-rose-800">
            <AlertTriangle className="mx-auto mb-2 text-rose-600" size={28} />
            <h3 className="font-bold text-base">{t(lang, 'missedTitle')}</h3>
            <p className="text-sm text-rose-700 mt-1">
              {t(lang, 'missedBody', { status: t(lang, STATUS_LABEL[status]) })}
            </p>
          </div>
        )}

        {/* Freshness. A failing background poll degrades this line rather than replacing
            the card with an error — the last known status is still the useful thing. */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
          <div className={`flex items-center gap-1.5 ${isStale ? 'text-amber-600' : 'text-slate-500'}`}>
            {isStale ? (
              <>
                <WifiOff size={13} className="shrink-0" />
                <span>
                  {staleMins > 0 ? t(lang, 'staleNotice', { mins: staleMins }) : t(lang, 'offlineNotice')}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-500 motion-safe:animate-ping" />
                <span>
                  {lastUpdated
                    ? t(lang, 'updatedAt', { time: formatTimeDisplay(lastUpdated, lang) })
                    : t(lang, 'liveTracking')}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="shrink-0 min-h-[44px] px-3 -mr-3 text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? t(lang, 'refreshing') : t(lang, 'refresh')}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
