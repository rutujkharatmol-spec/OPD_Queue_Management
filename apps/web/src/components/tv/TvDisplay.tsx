"use client";
import React, { useEffect, useState, useRef } from 'react';
import { useQueueStore } from '../../store/useQueueStore';
import { Moon, Sun, Volume2, VolumeX, Stethoscope, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useDepartmentStore } from '../../store/useDepartmentStore';
import {
  VoiceGender, AudioLang, announcePatientCall,
  playHospitalChime, stopAudioAnnouncement
} from '../../lib/speechService';

/**
 * Shared fallback for a department with no data yet.
 *
 * Module-level on purpose: built inline it was a new object on every render, so the
 * announcement effect below — which depends on `queueData.activeTokens` — saw a changed
 * dependency every single time and re-ran continuously before any data arrived.
 */
const EMPTY_QUEUE = { department: 'Department', activeTokens: [], nextTokens: [] as string[] };

export default function TvDisplay() {
  const searchParams = useSearchParams();
  const requestedDeptId = searchParams.get('deptId');
  // Selected individually rather than destructured off the whole store: subscribing to
  // the entire store re-rendered this (large) tree on every unrelated store write.
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);
  const getEffectiveDeptId = useDepartmentStore((state) => state.getEffectiveDeptId);

  const deptId = getEffectiveDeptId(requestedDeptId);

  const initializeWebSocket = useQueueStore((state) => state.initializeWebSocket);
  const queueData = useQueueStore((state) => state.liveQueues[deptId]) || EMPTY_QUEUE;
  const [pulseScale, setPulseScale] = useState(false);
  const [isDark, setIsDark] = useState(true); // Default to sleek dark mode for TV screens

  useEffect(() => {
    loadDepartments(requestedDeptId);
  }, [requestedDeptId, loadDepartments]);

  // Audio & Speech Settings
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioLang, setAudioLang] = useState<AudioLang>('dual');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female');
  const [audioPromptDismissed, setAudioPromptDismissed] = useState(false);
  const prevTokensSnapshotRef = useRef<string>('');

  useEffect(() => {
    try {
      const savedGender = localStorage.getItem('tv_voice_gender') as VoiceGender;
      if (savedGender === 'female' || savedGender === 'male') setVoiceGender(savedGender);
      const savedLang = localStorage.getItem('tv_audio_lang') as AudioLang;
      if (savedLang) setAudioLang(savedLang);
    } catch {}
  }, []);

  const handleSetVoiceGender = (gender: VoiceGender) => {
    setVoiceGender(gender);
    try { localStorage.setItem('tv_voice_gender', gender); } catch {}
  };

  const handleSetAudioLang = (lang: AudioLang) => {
    setAudioLang(lang);
    try { localStorage.setItem('tv_audio_lang', lang); } catch {}
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

  const handleEnableAudio = () => {
    setAudioEnabled(true);
    setAudioPromptDismissed(true);
    playHospitalChime();
  };

  const handleDisableAudio = () => {
    setAudioEnabled(false);
    stopAudioAnnouncement();
  };

  const activeTokens = queueData.activeTokens || [];
  const hasEmergency = activeTokens.some((t: any) => t.token?.includes('🚨')) || queueData.nextTokens.some(t => t.includes('🚨'));

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="flex h-screen w-full flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden relative font-sans select-none transition-colors duration-500">

        {/* Audio Enable Prompt Banner (First Load Autoplay Unlock) */}
        {!audioEnabled && !audioPromptDismissed && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-blue-400/40 animate-bounce">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Volume2 size={22} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">Enable Hospital Audio Announcements</p>
              <p className="text-xs text-blue-100">Click to activate voice and chime alerts for patient calling</p>
            </div>
            <button
              onClick={handleEnableAudio}
              className="px-4 py-2 bg-white text-blue-700 font-black text-xs uppercase tracking-wider rounded-xl shadow hover:bg-blue-50 active:scale-95 transition-all"
            >
              Turn On Audio
            </button>
            <button
              onClick={() => setAudioPromptDismissed(true)}
              className="text-white/60 hover:text-white text-xs ml-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Hospital Header & Controls */}
        <header className="relative z-10 flex min-h-[11vh] items-center justify-between bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl px-6 lg:px-12 py-3 shadow-sm dark:shadow-2xl border-b border-slate-200 dark:border-white/10 transition-colors duration-500 gap-4 flex-wrap">
          {/* Brand & Department */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/30 shrink-0">
              +
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">AIIMS Kalyani</h2>
              <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-white">
                {queueData.department} OPD
              </h1>
            </div>
          </div>

          {/* Right Controls: Status, Language, Audio, Theme */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap justify-end">
            {/* Live Calling Indicator */}
            <div className="hidden md:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active Calling</span>
            </div>

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
              onClick={() => {
                if (!audioEnabled) {
                  handleEnableAudio();
                } else {
                  handleDisableAudio();
                }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl shadow-sm backdrop-blur-md border transition-all font-bold text-xs ${audioEnabled
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
              onClick={() => setIsDark(!isDark)}
              className="p-2.5 bg-slate-100 dark:bg-black/60 backdrop-blur-md rounded-xl shadow-sm border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-black/80 transition-all text-slate-600 dark:text-slate-300"
              title="Toggle Theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="relative z-10 flex flex-1 p-6 lg:p-10 gap-6 lg:gap-8 items-stretch h-[79vh]">

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
              <div className={`flex-1 grid gap-4 lg:gap-6 ${activeTokens.length === 1
                ? 'grid-cols-1'
                : activeTokens.length > 4
                  ? 'grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-2'
                }`}>
                {activeTokens.map((item: any, idx: number) => {
                  const isEmergency = item.token?.includes('🚨');
                  const [prefix, number] = item.token?.includes('-') ? item.token.split('-') : [null, item.token];
                  const tokenFontSize = activeTokens.length > 4 ? 'text-[7vh] lg:text-[9vh]' : activeTokens.length > 2 ? 'text-[9vh] lg:text-[11vh]' : 'text-[13vh] lg:text-[15vh]';

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
                          Room {item.room}
                        </span>
                        {item.doctorName && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700/60 px-3 py-1 rounded-full truncate max-w-[180px]">
                            <Stethoscope size={13} className="text-blue-500" />
                            {item.doctorName}
                          </span>
                        )}
                      </div>

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
                          item.token
                        )}
                      </div>

                      {/* Patient Name Banner */}
                      {item.patientName && item.patientName !== 'Unknown Patient' && (
                        <div className="mt-2 text-center">
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-black/40 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10">
                            👤 {item.patientName}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
        <footer className="relative z-10 h-[10vh] bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 dark:from-slate-900 dark:via-blue-950 dark:to-slate-900 flex items-center overflow-hidden whitespace-nowrap shadow-xl border-t border-white/10">
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
