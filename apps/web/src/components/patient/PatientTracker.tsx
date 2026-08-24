"use client";
import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, Clock, AlertTriangle, CheckCircle2, User,
  Calendar, RefreshCw, Building2, MapPin, Sparkles, CheckCircle, AlertCircle, ArrowRight
} from 'lucide-react';
import { getTokenStatus } from '../../lib/api';

function getTodayString(): string {
  try {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function formatDateDisplay(dateStr: string): string {
  try {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const todayStr = getTodayString();
    const isToday = dateStr === todayStr;
    const formatted = dateObj.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return isToday ? `Today (${formatted})` : formatted;
  } catch {
    return dateStr;
  }
}

export default function PatientTracker() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const initialTokenParam = searchParams.get('token') || '';
  const initialDateParam = searchParams.get('date') || getTodayString();

  const [tokenInput, setTokenInput] = useState(initialTokenParam);
  const [dateInput, setDateInput] = useState(initialDateParam);
  const [activeToken, setActiveToken] = useState('');
  const [activeDate, setActiveDate] = useState('');
  const [statusData, setStatusData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const todayStr = getTodayString();

  const fetchStatus = useCallback(async (token: string, date: string, isManualRefresh = false) => {
    if (!token.trim()) return;
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');

    const cleanToken = token.trim().toUpperCase();
    const cleanDate = date.trim() || todayStr;

    try {
      const data = await getTokenStatus(cleanToken, cleanDate);
      setStatusData(data);
      setActiveToken(cleanToken);
      setActiveDate(cleanDate);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to fetch token status:', err);
      setError(`Token "${cleanToken}" not found for ${formatDateDisplay(cleanDate)}. Please verify your token number or select the date when your token was generated.`);
      setStatusData(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [todayStr]);

  // Initial load if query parameters are present
  useEffect(() => {
    if (initialTokenParam) {
      fetchStatus(initialTokenParam, initialDateParam);
    }
  }, [initialTokenParam, initialDateParam, fetchStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      const cleanToken = tokenInput.trim().toUpperCase();
      const cleanDate = dateInput.trim() || todayStr;

      // Update URL query parameters seamlessly
      startTransition(() => {
        const params = new URLSearchParams();
        params.set('token', cleanToken);
        if (cleanDate) params.set('date', cleanDate);
        router.replace(`?${params.toString()}`, { scroll: false });
      });

      fetchStatus(cleanToken, cleanDate);
    }
  };

  const handleSetToday = () => {
    setDateInput(todayStr);
  };

  // Poll for updates every 10 seconds if a token is active and waiting or called
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeToken && (statusData?.status === 'WAITING' || statusData?.status === 'CALLED')) {
      interval = setInterval(() => {
        fetchStatus(activeToken, activeDate || todayStr, true);
      }, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeToken, activeDate, statusData?.status, todayStr, fetchStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 flex flex-col items-center p-4 sm:p-6 font-sans selection:bg-blue-500/30">
      <div className="w-full max-w-lg mt-4 sm:mt-8">

        {/* Hospital Branding & Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/80 px-3.5 py-1.5 rounded-full mb-3 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-blue-900 tracking-wider uppercase">AIIMS Kalyani OPD</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Patient Queue Tracker</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1.5">Check your live queue position and estimated waiting time</p>
        </div>

        {/* Input Form */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100/80 mb-6 transition-all">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Token Number Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Token Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="e.g. MED-001 or OP-045"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-black text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all uppercase placeholder:text-slate-400 placeholder:font-normal"
                  required
                />
              </div>
            </div>

            {/* Date Input with Quick Today Toggle */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-slate-400" />
                  Service Date
                </label>
                {dateInput !== todayStr && (
                  <button
                    type="button"
                    onClick={handleSetToday}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Reset to Today
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 font-semibold text-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={handleSetToday}
                  className={`px-4 py-3 rounded-2xl text-xs font-bold transition-all border ${
                    dateInput === todayStr
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                >
                  Today
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Tokens reset daily at 00:00. Select the exact date your token was issued.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !tokenInput.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl py-4 font-bold shadow-lg shadow-blue-600/25 transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Searching Live Queue...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Track Token Status</span>
                </>
              )}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-sm">
              <AlertCircle className="shrink-0 mt-0.5 text-rose-600" size={18} />
              <p className="leading-snug font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Live Status Display Card */}
        {statusData && (
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-100 overflow-hidden transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Card Header with Status Theme */}
            <div className={`p-6 text-center text-white relative overflow-hidden ${
              statusData.status === 'WAITING'
                ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700'
                : statusData.status === 'CALLED'
                ? 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700'
                : statusData.status === 'COMPLETED'
                ? 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900'
                : 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700'
            }`}>
              {/* Background ambient glow */}
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex justify-between items-center text-white/80 text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1">
                  <Calendar size={13} />
                  {formatDateDisplay(activeDate || todayStr)}
                </span>
                {statusData.priority && statusData.priority !== 'NORMAL' && (
                  <span className="bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-black text-amber-200">
                    ★ {statusData.priority}
                  </span>
                )}
              </div>

              <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-1">Your Token</p>
              <h2 className="text-5xl sm:text-6xl font-black tracking-tight drop-shadow-md my-1">
                {statusData.tokenNumber}
              </h2>

              {/* Status Badge */}
              <div className="mt-3 inline-flex items-center gap-2 bg-white/20 border border-white/20 px-4 py-1.5 rounded-full backdrop-blur-md font-bold text-sm shadow-xs">
                {statusData.status === 'WAITING' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping"></span>
                    <Clock size={16} /> In Queue (Waiting)
                  </>
                )}
                {statusData.status === 'CALLED' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-bounce"></span>
                    <CheckCircle2 size={16} /> Currently Serving
                  </>
                )}
                {statusData.status === 'COMPLETED' && (
                  <>
                    <CheckCircle size={16} /> Consultation Completed
                  </>
                )}
                {statusData.status === 'ABSENT' && (
                  <>
                    <AlertTriangle size={16} /> Marked Absent
                  </>
                )}
                {statusData.status === 'SKIPPED' && (
                  <>
                    <AlertTriangle size={16} /> Skipped
                  </>
                )}
              </div>
            </div>

            {/* Status Details Body */}
            <div className="p-6 space-y-5">
              
              {/* Department & Current Room/Serving Summary */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Building2 size={12} /> Department
                  </p>
                  <p className="font-bold text-slate-800 text-sm sm:text-base leading-tight">
                    {statusData.departmentName}
                  </p>
                  {statusData.roomNumber && (
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Room {statusData.roomNumber}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                    Serving Now
                  </p>
                  <p className="font-black text-lg sm:text-xl text-blue-600 tracking-tight">
                    {statusData.currentlyServing && statusData.currentlyServing.length > 0
                      ? statusData.currentlyServing.join(', ')
                      : 'None'}
                  </p>
                </div>
              </div>

              {/* Waiting Stats: Patients Ahead + Estimated Time */}
              {statusData.status === 'WAITING' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50/70 rounded-2xl p-4 sm:p-5 border border-blue-100 text-center">
                      <h4 className="text-3xl sm:text-4xl font-black text-blue-600 mb-1">
                        {statusData.patientsAhead}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                        {statusData.patientsAhead === 1 ? 'Patient Ahead' : 'Patients Ahead'}
                      </p>
                    </div>
                    <div className="bg-amber-50/70 rounded-2xl p-4 sm:p-5 border border-amber-200/80 text-center">
                      <h4 className="text-3xl sm:text-4xl font-black text-amber-700 mb-1">
                        ~{statusData.estimatedWaitTimeMins}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                        Estimated Mins
                      </p>
                    </div>
                  </div>

                  {/* Proximity Notice */}
                  <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-900">
                    <AlertTriangle className="shrink-0 text-amber-700 mt-0.5" size={18} />
                    <p className="text-xs sm:text-sm font-medium leading-relaxed">
                      Estimated wait time is an approximation. Please stay near <strong>{statusData.departmentName}</strong> waiting area as consultation times vary.
                    </p>
                  </div>
                </div>
              )}

              {/* Called State: Actionable Call to Proceed */}
              {statusData.status === 'CALLED' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center text-emerald-900 shadow-xs animate-pulse">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-700">
                    <User size={26} />
                  </div>
                  <h3 className="font-black text-xl mb-1 text-emerald-800">It's your turn now!</h3>
                  <p className="text-sm text-emerald-700">
                    Please proceed immediately to{' '}
                    <strong className="text-emerald-900 font-black underline">
                      Room {statusData.roomNumber || 'assigned OPD room'}
                    </strong>
                    .
                  </p>
                </div>
              )}

              {/* Completed State */}
              {statusData.status === 'COMPLETED' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center text-slate-700">
                  <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={28} />
                  <h3 className="font-bold text-base text-slate-800">Consultation Completed</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    This token consultation has been concluded for {formatDateDisplay(activeDate || todayStr)}.
                  </p>
                </div>
              )}

              {/* Absent or Skipped State */}
              {(statusData.status === 'ABSENT' || statusData.status === 'SKIPPED') && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center text-rose-800">
                  <AlertTriangle className="mx-auto mb-2 text-rose-600" size={28} />
                  <h3 className="font-bold text-base">Token Missed / On Hold</h3>
                  <p className="text-xs text-rose-700 mt-1">
                    Your token was called and was marked {statusData.status.toLowerCase()}. Please contact the registration counter or nursing desk.
                  </p>
                </div>
              )}

              {/* Live Polling & Manual Refresh Bar */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  <span>
                    {lastUpdated
                      ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : 'Live tracking active'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchStatus(activeToken, activeDate || todayStr, true)}
                  disabled={isRefreshing}
                  className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 hover:underline"
                >
                  <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Information & Help Footer */}
        <div className="mt-8 text-center text-slate-400 text-xs space-y-1">
          <p>AIIMS Kalyani OPD Automated Queue System</p>
          <p>For queue queries or assistance, please visit the central OPD reception.</p>
        </div>

      </div>
    </div>
  );
}
