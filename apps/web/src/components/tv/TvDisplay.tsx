"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useQueueStore, requestQueueWake } from '../../store/useQueueStore';
import { Moon, Sun, Volume2, VolumeX, Stethoscope, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useDepartmentStore } from '../../store/useDepartmentStore';
import {
  VoiceGender, AudioLang, announcePatientCall,
  playHospitalChime, stopAudioAnnouncement
} from '../../lib/speechService';

/**
 * Shared fallback for a department with no data yet.
 */
const EMPTY_QUEUE = { department: 'Department', activeTokens: [], nextTokens: [] as string[] };

/**
 * Filter out auto-generated placeholder names like "Patient #10", "Patient #11", "Patient", "Walk-in Patient"
 * so only real patient names are displayed on the TV.
 */
function shouldShowPatientName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'unknown patient' ||
    lower === 'patient' ||
    lower === 'walk-in patient' ||
    lower.startsWith('patient #') ||
    lower.startsWith('patient#') ||
    /^patient\s*#?\s*\d+/i.test(lower)
  ) {
    return false;
  }
  return true;
}

export default function TvDisplay() {
  const searchParams = useSearchParams();
  const requestedDeptId = searchParams.get('deptId');
  // Selected individually rather than destructured off the whole store: subscribing to
  // the entire store re-rendered this (large) tree on every unrelated store write.
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);
  const getEffectiveDeptId = useDepartmentStore((state) => state.getEffectiveDeptId);

  const deptId = getEffectiveDeptId(requestedDeptId);

  const initializeWebSocket = useQueueStore((state) => state.initializeWebSocket);
  const fetchQueue = useQueueStore((state) => state.fetchQueue);
  const queueData = useQueueStore((state) => state.liveQueues[deptId]) || EMPTY_QUEUE;
  const [pulseScale, setPulseScale] = useState(false);
  const [isDark, setIsDark] = useState(false); // Default to clean, high-contrast light mode for TV screens
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDepartments(requestedDeptId);
  }, [requestedDeptId, loadDepartments]);

  // Fullscreen event listener, window resize/focus/visibility synchronization
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFull);
      if (deptId) {
        void fetchQueue(deptId);
      }
    };

    // Coalesced in the store: a window drag emits `resize` at display rate, and this
    // handler used to turn each one into its own live-queue request.
    const handleWindowWake = () => {
      if (deptId) {
        requestQueueWake(deptId);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    window.addEventListener('resize', handleWindowWake);
    window.addEventListener('focus', handleWindowWake);
    document.addEventListener('visibilitychange', handleWindowWake);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle fullscreen on 'f' or 'F' key if not typing in an input
      if ((e.key === 'f' || e.key === 'F') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('resize', handleWindowWake);
      window.removeEventListener('focus', handleWindowWake);
      document.removeEventListener('visibilitychange', handleWindowWake);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deptId, fetchQueue]);

  const toggleFullscreen = useCallback(async () => {
    try {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isCurrentlyFullscreen) {
        const elem = containerRef.current || document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).msRequestFullscreen) {
          await (elem as any).msRequestFullscreen();
        } else {
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed, falling back to layout toggle:', err);
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  // Audio & Speech Settings (Always ON by default)
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioLang, setAudioLang] = useState<AudioLang>('dual');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female');
  const prevTokensSnapshotRef = useRef<string>('');

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('tv_theme');
      if (savedTheme === 'dark') setIsDark(true);
      else if (savedTheme === 'light') setIsDark(false);

      const savedAudio = localStorage.getItem('tv_audio_enabled');
      if (savedAudio === 'false') setAudioEnabled(false);
      else setAudioEnabled(true);

      const savedGender = localStorage.getItem('tv_voice_gender') as VoiceGender;
      if (savedGender === 'female' || savedGender === 'male') setVoiceGender(savedGender);
      const savedLang = localStorage.getItem('tv_audio_lang') as AudioLang;
      if (savedLang) setAudioLang(savedLang);
    } catch {}
  }, []);

  const handleToggleTheme = () => {
    const nextVal = !isDark;
    setIsDark(nextVal);
    try {
      localStorage.setItem('tv_theme', nextVal ? 'dark' : 'light');
    } catch {}
  };

  const handleSetVoiceGender = (gender: VoiceGender) => {
    setVoiceGender(gender);
    try { localStorage.setItem('tv_voice_gender', gender); } catch {}
  };

  const handleSetAudioLang = (lang: AudioLang) => {
    setAudioLang(lang);
    try { localStorage.setItem('tv_audio_lang', lang); } catch {}
  };

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    if (next) {
      playHospitalChime();
    } else {
      stopAudioAnnouncement();
    }
    try { localStorage.setItem('tv_audio_enabled', String(next)); } catch {}
  };

  useEffect(() => {
    initializeWebSocket(deptId);
  }, [deptId, initializeWebSocket]);

  // Trigger announcement whenever active tokens change or are recalled
  useEffect(() => {
    const active = queueData?.activeTokens || [];
    if (active.length === 0) return;

    // Snapshot signature includes token, room, calledAt, and recalledAt
    const currentSnapshot = active.map((t: any) => `${t.token}:${t.room}:${t.calledAt || 0}:${t.recalledAt || 0}`).join('|');

    if (prevTokensSnapshotRef.current && currentSnapshot !== prevTokensSnapshotRef.current) {
      setPulseScale(true);
      const timer = setTimeout(() => setPulseScale(false), 800);

      if (audioEnabled) {
        // Identify which token was just called or recalled. A Set makes each lookup O(1);
        // `Array.includes` inside `find` made this a full rescan of the previous
        // snapshot per active room.
        const prevItems = new Set(prevTokensSnapshotRef.current.split('|'));
        const changedItem = active.find(
          (t: any) => !prevItems.has(`${t.token}:${t.room}:${t.calledAt || 0}:${t.recalledAt || 0}`)
        ) || active[0];

        if (changedItem) {
          const isEmerg = changedItem.token?.includes('🚨');
          announcePatientCall({
            tokenNumber: changedItem.token,
            roomNumber: changedItem.room,
            isEmergency: isEmerg,
            lang: audioLang,
            gender: voiceGender,
          });
        }
      }

      prevTokensSnapshotRef.current = currentSnapshot;
      return () => clearTimeout(timer);
    } else if (!prevTokensSnapshotRef.current && active.length > 0) {
      prevTokensSnapshotRef.current = currentSnapshot;
    }
  }, [queueData?.activeTokens, audioEnabled, audioLang, voiceGender]);

  const activeTokens = queueData.activeTokens || [];
  const hasEmergency = activeTokens.some((t: any) => t.token?.includes('🚨')) || queueData.nextTokens.some(t => t.includes('🚨'));

  return (
    <div ref={containerRef} className={isDark ? "dark" : ""}>
      <div className="flex h-screen w-full flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden relative font-sans select-none transition-colors duration-500">

        {/* Hospital Header & Controls */}
        <header className={`relative z-10 flex items-center justify-between bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl px-6 lg:px-12 transition-all duration-500 gap-4 flex-wrap border-b border-slate-200 dark:border-white/10 shadow-sm dark:shadow-2xl ${
          isFullscreen ? 'min-h-[7vh] py-2' : 'min-h-[11vh] py-3'
        }`}>
          {/* Brand & Department */}
          <div className="flex items-center gap-4">
            <div className={`${isFullscreen ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-xl'} rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/30 shrink-0 transition-all`}>
              +
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">AIIMS Kalyani</h2>
              <h1 className={`${isFullscreen ? 'text-lg sm:text-xl' : 'text-lg sm:text-2xl'} font-black uppercase tracking-wider text-slate-900 dark:text-white transition-all`}>
                {queueData.department} OPD
              </h1>
            </div>
          </div>

          {/* Right Controls: Status & Settings/Fullscreen */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap justify-end">
            {/* Live Calling Indicator */}
            <div className="hidden md:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active Calling</span>
            </div>

            {/* FULLSCREEN MODE: ONLY Token Section active - Hide all settings functions */}
            {isFullscreen ? (
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white/90 hover:text-white text-xs font-bold border border-white/20 shadow-md backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                title="Exit Full Screen (Show Settings)"
              >
                <Minimize2 size={15} />
                <span>Exit Full Screen</span>
              </button>
            ) : (
              /* NORMAL MODE: Setting Functions + Full Screen button */
              <>
                {/* Audio Language Selector */}
                <div className="flex items-center bg-slate-100 dark:bg-black/60 backdrop-blur-md rounded-xl p-1 border border-slate-200 dark:border-white/10 shadow-sm text-xs font-bold">
                  <button
                    onClick={() => handleSetAudioLang('dual')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-xs ${audioLang === 'dual' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    title="English + Hindi"
                  >
                    Dual (EN+HI)
                  </button>
                  <button
                    onClick={() => handleSetAudioLang('en')}
                    className={`px-2 py-1 rounded-lg transition-all text-xs ${audioLang === 'en' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => handleSetAudioLang('hi')}
                    className={`px-2 py-1 rounded-lg transition-all text-xs ${audioLang === 'hi' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    HI
                  </button>
                  <button
                    onClick={() => handleSetAudioLang('bn')}
                    className={`px-2 py-1 rounded-lg transition-all text-xs ${audioLang === 'bn' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    BN
                  </button>
                </div>

                {/* Voice Gender Selector */}
                <div className="flex items-center bg-slate-100 dark:bg-black/60 backdrop-blur-md rounded-xl p-1 border border-slate-200 dark:border-white/10 shadow-sm text-xs font-bold">
                  <button
                    onClick={() => handleSetVoiceGender('female')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-xs flex items-center gap-1 ${voiceGender === 'female' ? 'bg-pink-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    title="Female Realistic Voice"
                  >
                    <span>👩 Female</span>
                  </button>
                  <button
                    onClick={() => handleSetVoiceGender('male')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-xs flex items-center gap-1 ${voiceGender === 'male' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    title="Male Realistic Voice"
                  >
                    <span>👨 Male</span>
                  </button>
                </div>

                {/* Sound Toggle Button */}
                <button
                  onClick={handleToggleAudio}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl shadow-sm backdrop-blur-md border transition-all font-bold text-xs cursor-pointer ${audioEnabled
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-600/30'
                    : 'bg-slate-100 dark:bg-black/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10'
                    }`}
                >
                  {audioEnabled ? (
                    <>
                      <Volume2 size={15} className="animate-pulse" />
                      <span>Audio: ON</span>
                    </>
                  ) : (
                    <>
                      <VolumeX size={15} />
                      <span>Audio: OFF</span>
                    </>
                  )}
                </button>

                {/* Theme Toggle Button */}
                <button
                  onClick={handleToggleTheme}
                  className="p-2.5 bg-slate-100 dark:bg-black/60 backdrop-blur-md rounded-xl shadow-sm border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-black/80 transition-all text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Toggle Light / Dark Theme"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                {/* Full Screen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/25 border border-blue-400/40 active:scale-95 transition-all cursor-pointer"
                  title="Enter Full Screen TV View (Hides Settings)"
                >
                  <Maximize2 size={15} />
                  <span>Full Screen</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className={`relative z-10 flex flex-1 ${
          isFullscreen ? 'p-4 lg:p-6 gap-4 lg:gap-6 h-[83vh]' : 'p-6 lg:p-10 gap-6 lg:gap-8 h-[79vh]'
        } items-stretch transition-all duration-500`}>

          {/* Active Patients Grid (Left / Major Area) */}
          <div className={`flex-[2.2] flex flex-col rounded-[2.5rem] p-6 lg:p-8 shadow-xl dark:shadow-2xl border relative overflow-hidden backdrop-blur-2xl transition-all duration-500 ${hasEmergency
            ? 'bg-white/95 dark:bg-red-950/40 border-red-200 dark:border-red-500/30 ring-4 ring-red-100 dark:ring-0'
            : 'bg-white/90 dark:bg-slate-900/60 border-slate-200/80 dark:border-blue-500/20'
            }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[2.8vh] font-black text-slate-500 dark:text-blue-300/80 uppercase tracking-[0.25em] flex items-center gap-3">
                <Sparkles size={22} className="text-blue-500 animate-pulse" />
                Currently Serving
              </h2>
              <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full">
                {activeTokens.length} Room{activeTokens.length === 1 ? '' : 's'} Active
              </span>
            </div>

            {activeTokens.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-[2.8vh] font-medium">
                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-3xl mb-4">
                  ⏳
                </div>
                Waiting for doctor to call next patient...
              </div>
            ) : (
              <div className={`flex-1 grid gap-4 lg:gap-6 ${(() => {
                const map = new Map<string, { room: string; doctorName?: string; isEmergency: boolean; tokens: any[] }>();
                for (const item of activeTokens) {
                  const rKey = item.room || '101';
                  if (!map.has(rKey)) {
                    map.set(rKey, {
                      room: rKey,
                      doctorName: item.doctorName,
                      isEmergency: Boolean(item.token?.includes('🚨')),
                      tokens: [],
                    });
                  }
                  const rEntry = map.get(rKey)!;
                  if (item.token?.includes('🚨')) rEntry.isEmergency = true;
                  rEntry.tokens.push(item);
                }
                const count = map.size;
                return count === 1 ? 'grid-cols-1' : count > 4 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2';
              })()}`}>
                {(() => {
                  const map = new Map<string, { room: string; doctorName?: string; isEmergency: boolean; tokens: any[] }>();
                  for (const item of activeTokens) {
                    const rKey = item.room || '101';
                    if (!map.has(rKey)) {
                      map.set(rKey, {
                        room: rKey,
                        doctorName: item.doctorName,
                        isEmergency: Boolean(item.token?.includes('🚨')),
                        tokens: [],
                      });
                    }
                    const rEntry = map.get(rKey)!;
                    if (item.token?.includes('🚨')) rEntry.isEmergency = true;
                    rEntry.tokens.push(item);
                  }
                  const roomsList = Array.from(map.values());
                  const roomCount = roomsList.length;

                  return roomsList.map((roomItem, idx) => {
                    const isEmergency = roomItem.isEmergency;
                    const isSingle = roomItem.tokens.length === 1;
                    const firstItem = roomItem.tokens[0];
                    const [prefix, number] = firstItem?.token?.includes('-') ? firstItem.token.split('-') : [null, firstItem?.token];
                    const tokenFontSize = roomCount > 4 ? 'text-[7vh] lg:text-[9vh]' : roomCount > 2 ? 'text-[9vh] lg:text-[11vh]' : 'text-[13vh] lg:text-[15vh]';

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col items-center justify-center rounded-[2rem] border transition-all duration-500 p-6 relative overflow-hidden ${pulseScale ? 'scale-[1.02] shadow-2xl ring-4 ring-blue-400/40' : 'scale-100'
                          } ${isEmergency
                            ? 'bg-red-50/90 dark:bg-red-950/60 border-red-300 dark:border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.25)]'
                            : 'bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/80 dark:to-slate-900/90 border-slate-200 dark:border-blue-500/30 shadow-md'
                          }`}
                      >
                        {/* Room Header & Doctor Name */}
                        <div className="w-full flex justify-between items-center mb-2 px-2">
                          <span className={`text-[2.6vh] lg:text-[3vh] font-black tracking-wider uppercase ${isEmergency ? 'text-red-600 dark:text-red-300' : 'text-blue-600 dark:text-blue-300'
                            }`}>
                            Room {roomItem.room} {roomItem.tokens.length > 1 ? `(${roomItem.tokens.length} Patients)` : ''}
                          </span>
                          {roomItem.doctorName && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700/60 px-3 py-1 rounded-full truncate max-w-[180px]">
                              <Stethoscope size={13} className="text-blue-500" />
                              {roomItem.doctorName}
                            </span>
                          )}
                        </div>

                        {isSingle ? (
                          <>
                            {/* Giant Token Number */}
                            <div className={`${tokenFontSize} font-black leading-none tracking-tighter w-full text-center whitespace-nowrap overflow-hidden text-ellipsis my-auto transition-colors duration-500 ${isEmergency ? 'text-red-600 dark:text-red-100' : 'text-slate-900 dark:text-white'
                              }`}>
                              {prefix ? (
                                <>
                                  <span className={`text-[0.42em] font-bold align-middle mr-1 ${isEmergency ? 'text-red-400 dark:text-red-200' : 'text-slate-400 dark:text-blue-300/60'
                                    }`}>
                                    {prefix}-
                                  </span>
                                  {number}
                                </>
                              ) : (
                                firstItem?.token
                              )}
                            </div>

                            {/* Patient Name Banner */}
                            {shouldShowPatientName(firstItem?.patientName) && (
                              <div className="mt-2 text-center">
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-black/40 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10">
                                  👤 {firstItem.patientName}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          /* Multiple Active Patients In Same Room */
                          <div className="w-full flex-1 flex flex-wrap items-center justify-center gap-3 my-auto py-2">
                            {roomItem.tokens.map((tok: any, tIdx: number) => (
                              <div
                                key={tIdx}
                                className="flex flex-col items-center justify-center bg-white/90 dark:bg-slate-800/90 border border-blue-200 dark:border-blue-500/40 rounded-2xl px-5 py-3 shadow-md min-w-[120px]"
                              >
                                <span className="text-[5.5vh] lg:text-[6.5vh] font-black text-slate-900 dark:text-white leading-none">
                                  {tok.token}
                                </span>
                                {shouldShowPatientName(tok.patientName) && (
                                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1 max-w-[130px] truncate text-center">
                                    {tok.patientName}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Up Next Sidebar (Right) */}
          <div className="flex-[1] flex flex-col rounded-[2.5rem] bg-white/90 dark:bg-slate-900/60 backdrop-blur-xl p-6 lg:p-8 shadow-xl dark:shadow-2xl border border-slate-200/80 dark:border-white/10 transition-colors duration-500">
            <h3 className="text-[2.4vh] font-black text-slate-400 dark:text-slate-400 mb-4 pb-3 border-b border-slate-200 dark:border-white/10 uppercase tracking-widest text-center">
              Up Next in Line
            </h3>

            <div className="flex flex-col gap-3 overflow-hidden flex-1 justify-start">
              {queueData.nextTokens.length > 0 ? (
                queueData.nextTokens.slice(0, 5).map((token, index) => {
                  const isEmergency = token.includes('🚨');
                  const [prefix, number] = token.includes('-') ? token.split('-') : [null, token];
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between px-5 py-3.5 rounded-2xl border shadow-sm transition-all duration-300 ${isEmergency
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-200'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/10 text-slate-800 dark:text-white'
                        }`}
                    >
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        #{index + 1}
                      </span>
                      <span className="text-[4.5vh] font-black tracking-tight text-center whitespace-nowrap overflow-hidden text-ellipsis">
                        {prefix ? (
                          <>
                            <span className={`text-[0.45em] font-bold mr-1 ${isEmergency ? 'text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                              {prefix}-
                            </span>
                            {number}
                          </>
                        ) : (
                          token
                        )}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${isEmergency ? 'bg-red-200 text-red-800' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                        {isEmergency ? 'Urgent' : 'Waiting'}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-sm font-medium">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-200 dark:border-white/20 mb-3 flex items-center justify-center text-2xl">
                    ☕
                  </div>
                  No other patients waiting
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer Marquee Banner */}
        <footer className={`relative z-10 ${isFullscreen ? 'h-[8vh]' : 'h-[10vh]'} bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 dark:from-slate-900 dark:via-blue-950 dark:to-slate-900 flex items-center overflow-hidden whitespace-nowrap shadow-xl border-t border-white/10 transition-all duration-500`}>
          <div className="animate-marquee inline-block text-[2.2vh] font-bold text-white tracking-widest uppercase">
            <span className="mx-6">🚨</span> EMERGENCY PATIENTS RECEIVE IMMEDIATE PRIORITY
            <span className="mx-6">🔊</span> PLEASE LISTEN FOR AUDIO CHIMES &amp; TOKEN ANNOUNCEMENTS
            <span className="mx-6">📱</span> TRACK YOUR QUEUE POSITION BY SCANNING QR CODE ON PRINT SLIP
            <span className="mx-6">🏥</span> AIIMS KALYANI OPD SERVICES — COMMITTED TO EXCELLENCE
          </div>
        </footer>

      </div>
    </div>
  );
}
