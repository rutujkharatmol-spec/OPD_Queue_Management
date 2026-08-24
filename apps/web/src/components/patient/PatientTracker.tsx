"use client";
import React, { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Calendar, AlertCircle, Languages } from 'lucide-react';
import { getTokenStatus, type TokenStatusResponse, type TokenStatusValue } from '../../lib/api';
import { useNetwork } from '../NetworkProvider';
import {
  t, getTodayString, formatDateDisplay, getPatientLang, setPatientLang, isPatientLang,
  PATIENT_LANGS, LANG_LABELS, LANG_NAMES, type PatientLang,
} from '../../lib/patientI18n';
import {
  isAlertsEnabled, isVoiceEnabled, setVoiceEnabled,
  enableAlerts, disableAlerts, probeCapabilities, notifyTurn, notifyAlmostThere, testAlert,
  type AlertCapabilities,
} from '../../lib/patientAlerts';
import StatusCard from './StatusCard';
import QueueStrip from './QueueStrip';
import AlertOptIn from './AlertOptIn';

/** Patients this close to the front get a heads-up to walk back to the waiting area. */
const ALMOST_THERE_THRESHOLD = 2;

/** Slowest cadence a backgrounded tab is polled at, and only when alerts are on. */
const HIDDEN_POLL_MS = 15_000;

type FetchMode = 'initial' | 'manual' | 'background';

/**
 * How often to re-check, given how close the patient is to being seen.
 *
 * The previous version polled every 10s regardless. That is too slow for someone who is
 * next and far too fast for someone with thirty people ahead — and this route is the most
 * frequently executed query in the system, so the difference is not academic.
 */
function basePollDelayMs(status: TokenStatusValue, patientsAhead: number): number {
  // A doctor can re-call an absent or skipped token — queue/next accepts a token
  // identifier and does not filter on status — so these screens must keep listening
  // rather than freeze forever, just slowly.
  if (status === 'ABSENT' || status === 'SKIPPED') return 60_000;
  if (status === 'CALLED' || status === 'IN_PROGRESS') return 10_000;
  if (patientsAhead <= ALMOST_THERE_THRESHOLD) return 5_000;
  if (patientsAhead <= 10) return 10_000;
  return 20_000;
}

/** Returns null when polling should stop entirely. */
function pollDelayMs(
  status: TokenStatusValue | null,
  patientsAhead: number,
  hidden: boolean,
  alertsEnabled: boolean,
): number | null {
  if (!status || status === 'COMPLETED') return null;

  const base = basePollDelayMs(status, patientsAhead);
  if (!hidden) return base;
  // A hidden tab with no alerts to deliver has no reason to keep a patient's phone busy.
  // With alerts on it holds a slow beat so the notification can still fire — mobile
  // browsers throttle background timers hard, so that is best-effort by nature.
  return alertsEnabled ? Math.max(base, HIDDEN_POLL_MS) : null;
}

export default function PatientTracker() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { isOffline } = useNetwork();

  const todayStr = getTodayString();
  const initialTokenParam = searchParams.get('token') || '';
  const initialDateParam = searchParams.get('date') || todayStr;
  const langParam = searchParams.get('lang');

  const [lang, setLang] = useState<PatientLang>('en');
  const [tokenInput, setTokenInput] = useState(initialTokenParam);
  const [dateInput, setDateInput] = useState(initialDateParam);
  const [activeToken, setActiveToken] = useState('');
  const [activeDate, setActiveDate] = useState('');
  const [statusData, setStatusData] = useState<TokenStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pollFailing, setPollFailing] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const [alertsOn, setAlertsOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [capabilities, setCapabilities] = useState<AlertCapabilities | null>(null);

  const prevStatusRef = useRef<TokenStatusValue | null>(null);
  const almostThereFiredRef = useRef(false);
  const pollGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // localStorage is client-only, so the stored language and alert preferences are picked
  // up after mount rather than during the first render.
  useEffect(() => {
    setLang(isPatientLang(langParam) ? langParam : getPatientLang());
    setAlertsOn(isAlertsEnabled());
    setVoiceOn(isVoiceEnabled());
    setCapabilities(probeCapabilities());
  }, [langParam]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLang = (next: PatientLang) => {
    setLang(next);
    setPatientLang(next);
  };

  const fetchStatus = useCallback(
    async (token: string, date: string, mode: FetchMode) => {
      if (!token.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === 'initial') setIsLoading(true);
      else setIsRefreshing(true);
      if (mode !== 'background') setError('');

      const cleanToken = token.trim().toUpperCase();
      const cleanDate = date.trim() || getTodayString();

      try {
        const data = await getTokenStatus(cleanToken, cleanDate, controller.signal);
        setStatusData(data);
        setActiveToken(cleanToken);
        setActiveDate(cleanDate);
        setLastUpdated(new Date());
        setPollFailing(false);
        setError('');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;

        // A dropped background poll is a connectivity blip, not a missing token. Wiping
        // the card here — which the previous version did — replaced a patient's live
        // status with "token not found" on a single flaky tick of hospital wifi.
        if (mode === 'background') {
          setPollFailing(true);
          return;
        }

        console.error('Failed to fetch token status:', err);
        setError(t(lang, 'notFound', {
          token: cleanToken,
          date: formatDateDisplay(cleanDate, lang),
        }));
        setStatusData(null);
      } finally {
        // Only the request that is still current may clear the spinners. A superseded
        // request (the patient hit Refresh while a poll was in flight) settles second and
        // would otherwise switch the spinner off while its replacement is still running.
        if (abortRef.current === controller) {
          abortRef.current = null;
          if (mode === 'initial') setIsLoading(false);
          else setIsRefreshing(false);
        }
      }
    },
    [lang],
  );

  // Deep link from the printed token slip's QR code.
  useEffect(() => {
    if (initialTokenParam) {
      void fetchStatus(initialTokenParam, initialDateParam, 'initial');
    }
    // Deliberately not re-running when `fetchStatus` changes: it depends on `lang`, and
    // switching language must not re-trigger the initial lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTokenParam, initialDateParam]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    const cleanToken = tokenInput.trim().toUpperCase();
    const cleanDate = dateInput.trim() || todayStr;

    startTransition(() => {
      const params = new URLSearchParams({ token: cleanToken, date: cleanDate });
      router.replace(`?${params.toString()}`, { scroll: false });
    });

    void fetchStatus(cleanToken, cleanDate, 'initial');
  };

  // A new token is a new queue: drop the previous token's alert latches so nothing
  // carries over.
  useEffect(() => {
    prevStatusRef.current = null;
    almostThereFiredRef.current = false;
  }, [activeToken, activeDate]);

  const status = statusData?.status ?? null;
  const patientsAhead = statusData?.patientsAhead ?? 0;

  // Alerts fire on transitions only, latched in refs, so a repeated poll reporting the
  // same call cannot alert twice.
  useEffect(() => {
    if (!statusData) return;

    const previous = prevStatusRef.current;
    const current = statusData.status;
    prevStatusRef.current = current;

    if (!alertsOn) return;

    const isCalled = current === 'CALLED' || current === 'IN_PROGRESS';
    const wasCalled = previous === 'CALLED' || previous === 'IN_PROGRESS';

    // `previous === null` is the first observation of this token. The card already says
    // it loudly on screen, and the patient is by definition looking at it.
    if (isCalled && !wasCalled && previous !== null) {
      void notifyTurn({
        tokenNumber: statusData.tokenNumber,
        roomNumber: statusData.roomNumber,
        lang,
        speak: voiceOn,
      });
      return;
    }

    if (
      current === 'WAITING' &&
      statusData.patientsAhead <= ALMOST_THERE_THRESHOLD &&
      !almostThereFiredRef.current
    ) {
      almostThereFiredRef.current = true;
      void notifyAlmostThere(statusData.tokenNumber, statusData.patientsAhead, lang);
    }
  }, [statusData, alertsOn, voiceOn, lang]);

  // Self-rescheduling poll: the next request is only queued once the previous one has
  // settled, so a slow response (a sleeping Neon instance can take seconds to wake)
  // cannot stack requests faster than they drain. Same approach as useQueueStore.
  useEffect(() => {
    if (!activeToken || !status) return;

    const generation = ++pollGenerationRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const delay = pollDelayMs(status, patientsAhead, document.hidden, alertsOn);
      if (delay === null) return;
      timer = setTimeout(() => void run(), delay);
    };

    const run = async () => {
      if (generation !== pollGenerationRef.current) return;
      await fetchStatus(activeToken, activeDate || todayStr, 'background');
      if (generation !== pollGenerationRef.current) return;
      schedule();
    };

    // Returning to the tab should show current data at once, and restarts the chain if it
    // stopped while hidden.
    const onVisibility = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      void run();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      // Retires any in-flight tick: it sees the changed generation and stops rescheduling.
      pollGenerationRef.current++;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeToken, activeDate, status, patientsAhead, alertsOn, todayStr, fetchStatus]);

  // Drives the "last updated N min ago" line while polls are failing.
  useEffect(() => {
    if (!statusData) return;
    const interval = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [statusData]);

  const handleEnableAlerts = async () => {
    // Switch the card over at once. Waiting on the chime and the permission prompt would
    // leave the button looking dead for as long as the patient takes to answer.
    setAlertsOn(true);
    setCapabilities(await enableAlerts());
  };

  const handleDisableAlerts = () => {
    disableAlerts();
    setAlertsOn(false);
  };

  const handleToggleVoice = (next: boolean) => {
    setVoiceEnabled(next);
    setVoiceOn(next);
  };

  const isStale = pollFailing || isOffline;
  const staleMins = lastUpdated ? Math.floor((nowTs - lastUpdated.getTime()) / 60_000) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 flex flex-col items-center p-4 sm:p-6 font-sans selection:bg-blue-500/30">
      <div className="w-full max-w-lg mt-4 sm:mt-8">

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/80 px-3.5 py-1.5 rounded-full mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            <span className="text-xs font-bold text-blue-900 tracking-wider uppercase">
              {t(lang, 'brand')}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t(lang, 'title')}
          </h1>
          <p className="text-slate-600 text-sm mt-1.5">{t(lang, 'subtitle')}</p>

          <div
            className="mt-4 inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full p-1 shadow-sm"
            role="group"
            aria-label={t(lang, 'languageLabel')}
          >
            <Languages size={15} className="text-slate-400 ml-2 mr-0.5 shrink-0" />
            {PATIENT_LANGS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeLang(option)}
                aria-pressed={lang === option}
                aria-label={LANG_NAMES[option]}
                className={`min-w-[52px] min-h-[36px] px-3 rounded-full text-sm font-bold transition-all ${
                  lang === option
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {LANG_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100/80 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="patient-token"
                className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5"
              >
                {t(lang, 'tokenLabel')}
              </label>
              <input
                id="patient-token"
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={t(lang, 'tokenPlaceholder')}
                autoComplete="off"
                autoCapitalize="characters"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-black text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all uppercase placeholder:text-slate-400 placeholder:font-normal placeholder:normal-case"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5 gap-2">
                <label
                  htmlFor="patient-date"
                  className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Calendar size={14} className="text-slate-400" />
                  {t(lang, 'dateLabel')}
                </label>
                {dateInput !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setDateInput(todayStr)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline py-1"
                  >
                    {t(lang, 'resetToday')}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  id="patient-date"
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 font-semibold text-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setDateInput(todayStr)}
                  className={`shrink-0 px-4 min-h-[48px] rounded-2xl text-xs font-bold transition-all border ${
                    dateInput === todayStr
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                >
                  {t(lang, 'today')}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">{t(lang, 'dateHint')}</p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !tokenInput.trim()}
              className="w-full min-h-[52px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl py-4 font-bold shadow-lg shadow-blue-600/25 transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t(lang, 'searching')}</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>{t(lang, 'trackButton')}</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-sm"
            >
              <AlertCircle className="shrink-0 mt-0.5 text-rose-600" size={18} />
              <p className="leading-snug font-medium">{error}</p>
            </div>
          )}
        </div>

        {statusData && (
          <StatusCard
            lang={lang}
            data={statusData}
            activeDate={activeDate || todayStr}
            lastUpdated={lastUpdated}
            isRefreshing={isRefreshing}
            isStale={isStale}
            staleMins={staleMins}
            onRefresh={() => void fetchStatus(activeToken, activeDate || todayStr, 'manual')}
            waitingExtras={
              <div className="space-y-4">
                <QueueStrip lang={lang} data={statusData} />
                <AlertOptIn
                  lang={lang}
                  enabled={alertsOn}
                  voice={voiceOn}
                  capabilities={capabilities}
                  onEnable={() => void handleEnableAlerts()}
                  onDisable={handleDisableAlerts}
                  onToggleVoice={handleToggleVoice}
                  onTest={() => void testAlert(lang)}
                />
              </div>
            }
          />
        )}

        <div className="mt-8 text-center text-slate-500 text-xs space-y-1">
          <p>{t(lang, 'footerSystem')}</p>
          <p>{t(lang, 'footerHelp')}</p>
        </div>

      </div>
    </div>
  );
}
