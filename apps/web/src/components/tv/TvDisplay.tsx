"use client";
import React, { useEffect, useState, useRef } from 'react';
import { useQueueStore } from '../../store/useQueueStore';
import { Moon, Sun, Volume2, VolumeX, Globe, BellRing } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function playHospitalChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // High Tone: 659.25 Hz (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.8);

    // Low Tone: 523.25 Hz (C5) at +0.25s
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.25);
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 1.2);
  } catch (e) {
    console.error('Audio chime error', e);
  }
}

function announcePatient(token: string, room: string, lang: 'en' | 'hi' | 'bn' | 'dual' = 'en') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const cleanToken = token.replace('🚨', '').trim();

  // Play chime first
  playHospitalChime();

  // Voice announcement after chime
  setTimeout(() => {
    try {
      window.speechSynthesis.cancel();

      if (lang === 'hi') {
        const u = new SpeechSynthesisUtterance(`टोकन नंबर ${cleanToken}, कृपया रूम नंबर ${room} में जाएँ`);
        u.lang = 'hi-IN';
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      } else if (lang === 'bn') {
        const u = new SpeechSynthesisUtterance(`টোকেন নম্বর ${cleanToken}, দয়া করে রুম নম্বর ${room}-এ যান`);
        u.lang = 'bn-IN';
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      } else if (lang === 'dual') {
        const u1 = new SpeechSynthesisUtterance(`Token ${cleanToken}, please proceed to Room ${room}`);
        u1.lang = 'en-IN';
        u1.rate = 0.95;
        const u2 = new SpeechSynthesisUtterance(`टोकन ${cleanToken}, रूम नंबर ${room}`);
        u2.lang = 'hi-IN';
        u2.rate = 0.95;
        window.speechSynthesis.speak(u1);
        window.speechSynthesis.speak(u2);
      } else {
        const u = new SpeechSynthesisUtterance(`Token ${cleanToken}, please proceed to Room ${room}`);
        u.lang = 'en-IN';
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      console.error('TTS error', e);
    }
  }, 700);
}

export default function TvDisplay() {
  const searchParams = useSearchParams();
  const deptId = searchParams.get('deptId') || '660e8400-e29b-41d4-a716-446655440000';

  const { liveQueues, initializeWebSocket } = useQueueStore();
  const queueData = liveQueues[deptId] || { department: 'Department', activeTokens: [], nextTokens: [] };
  const [pulseScale, setPulseScale] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Audio State
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [audioLang, setAudioLang] = useState<'en' | 'hi' | 'bn' | 'dual'>('dual');
  const [lastAnnouncedSnapshot, setLastAnnouncedSnapshot] = useState<string>('');
  const isInitialMount = useRef(true);

  useEffect(() => {
    initializeWebSocket(deptId);
  }, [deptId, initializeWebSocket]);

  // Monitor active token changes or recall events
  useEffect(() => {
    if (!queueData?.activeTokens) return;

    // Snapshot includes token numbers + calledAt timestamps to detect both new calls & recalls
    const currentSnapshot = queueData.activeTokens
      .map(t => `${t.token}:${t.room}:${t.calledAt || ''}`)
      .join('|');

    if (isInitialMount.current) {
      isInitialMount.current = false;
      setLastAnnouncedSnapshot(currentSnapshot);
      return;
    }

    if (currentSnapshot && currentSnapshot !== lastAnnouncedSnapshot) {
      setPulseScale(true);
      const timer = setTimeout(() => setPulseScale(false), 600);

      // Find which token changed or was newly called/recalled
      const prevTokens = lastAnnouncedSnapshot ? lastAnnouncedSnapshot.split('|') : [];
      const currentTokens = currentSnapshot.split('|');

      // The newly added or updated item
      const updatedItemStr = currentTokens.find(t => !prevTokens.includes(t)) || currentTokens[currentTokens.length - 1];
      if (updatedItemStr && isAudioEnabled) {
        const [tok, rm] = updatedItemStr.split(':');
        if (tok && rm) {
          announcePatient(tok, rm, audioLang);
        }
      }

      setLastAnnouncedSnapshot(currentSnapshot);
      return () => clearTimeout(timer);
    }
  }, [queueData?.activeTokens, isAudioEnabled, audioLang, lastAnnouncedSnapshot]);

  const toggleAudio = () => {
    const next = !isAudioEnabled;
    setIsAudioEnabled(next);
    if (next) {
      // Play a short chime to unlock AudioContext on user interaction
      playHospitalChime();
    }
  };

  const activeTokens = queueData.activeTokens || [];
  const hasEmergency = activeTokens.some((t: any) => t.token?.includes('🚨')) || queueData.nextTokens.some(t => t.includes('🚨'));

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="flex h-screen w-full flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden relative font-sans transition-colors duration-500">
        
        {/* Floating Top Controls (Audio & Theme) */}
        <div className="absolute top-5 left-6 z-50 flex items-center gap-3">
          <button 
            onClick={toggleAudio}
            className={`px-4 py-2.5 backdrop-blur-md rounded-2xl shadow-lg border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              isAudioEnabled 
                ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/20' 
                : 'bg-white/70 dark:bg-black/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10'
            }`}
            title={isAudioEnabled ? "Audio Announcements Enabled" : "Click to Enable Audio Announcements"}
          >
            {isAudioEnabled ? <Volume2 size={18} className="animate-pulse" /> : <VolumeX size={18} />}
            <span>{isAudioEnabled ? 'Audio: ON' : 'Audio: OFF'}</span>
          </button>

          {isAudioEnabled && (
            <select
              value={audioLang}
              onChange={(e) => setAudioLang(e.target.value as any)}
              className="px-3 py-2 bg-white/70 dark:bg-black/40 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="dual">Dual (Eng + Hindi)</option>
              <option value="en">English Only</option>
              <option value="hi">Hindi (हिंदी)</option>
              <option value="bn">Bengali (বাংলা)</option>
            </select>
          )}

          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-2.5 bg-white/70 dark:bg-black/40 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-black/60 transition-all text-slate-600 dark:text-slate-300"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Animated Mesh Background */}
        <div className="absolute inset-0 z-0 opacity-60 dark:opacity-40 pointer-events-none transition-opacity duration-500">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-300/30 dark:bg-blue-700/30 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen animate-pulse-slow"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-indigo-200/40 dark:bg-purple-900/40 blur-[150px] rounded-full mix-blend-multiply dark:mix-blend-screen animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
          {hasEmergency && (
            <div className="absolute inset-0 bg-red-100/50 dark:bg-red-600/10 animate-pulse mix-blend-multiply dark:mix-blend-overlay z-0"></div>
          )}
        </div>

        {/* Header */}
        <header className="relative z-10 flex h-[10vh] items-center justify-center bg-white/80 dark:bg-black/40 backdrop-blur-xl px-12 shadow-sm dark:shadow-2xl border-b border-slate-200 dark:border-white/5 transition-colors duration-500">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h1 className="text-[3.5vh] font-black uppercase tracking-widest text-slate-800 dark:text-white dark:drop-shadow-md transition-colors duration-500">
              {queueData.department} OPD
            </h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex flex-1 p-6 lg:p-10 gap-6 lg:gap-10 items-stretch h-[80vh]">
          
          {/* Active Patients Grid (Left/Main) */}
          <div className={`flex-[2] flex flex-col rounded-[3rem] p-8 shadow-xl dark:shadow-2xl border relative overflow-hidden backdrop-blur-2xl transition-colors duration-500 ${
            hasEmergency 
              ? 'bg-white/90 dark:bg-red-950/40 border-red-200 dark:border-red-500/30 ring-4 ring-red-100 dark:ring-0' 
              : 'bg-white dark:bg-blue-900/20 border-slate-100 dark:border-blue-500/20'
          }`}>
            <h2 className="text-[2.8vh] font-bold text-slate-400 dark:text-white/50 mb-6 uppercase tracking-[0.3em] text-center transition-colors duration-500">
              Currently Serving
            </h2>
            
            {activeTokens.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-white/30 text-[3vh] font-medium transition-colors duration-500">
                 No patients currently being served
              </div>
            ) : (
              <div className={`flex-1 grid gap-4 lg:gap-6 ${
                activeTokens.length === 1 ? 'grid-cols-1' 
                : activeTokens.length > 4 ? 'grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-2'
              }`}>
                {activeTokens.map((item: any, idx: number) => {
                  const isEmergency = item.token?.includes('🚨');
                  const tokenFontSize = activeTokens.length > 4 ? 'text-[7vh] lg:text-[9vh]' : activeTokens.length > 2 ? 'text-[9vh] lg:text-[11vh]' : 'text-[13vh] lg:text-[15vh]';
                  
                  const [prefix, number] = item.token?.includes('-') ? item.token.split('-') : [null, item.token];

                  return (
                    <div key={idx} className={`flex flex-col items-center justify-center rounded-[2rem] border transition-all duration-300 p-4 relative ${pulseScale ? 'scale-105' : 'scale-100'} ${
                      isEmergency 
                        ? 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] dark:shadow-[0_0_30px_rgba(220,38,38,0.3)]' 
                        : 'bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-blue-500/30 shadow-sm dark:shadow-none'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[2.8vh] lg:text-[3.2vh] font-black tracking-wider uppercase transition-colors duration-500 ${isEmergency ? 'text-red-500 dark:text-red-300' : 'text-slate-600 dark:text-blue-200'}`}>
                          Room {item.room}
                        </span>
                        {item.doctorName && (
                          <span className="text-xs font-bold text-slate-400 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                            {item.doctorName}
                          </span>
                        )}
                      </div>

                      <div className={`${tokenFontSize} font-black leading-none tracking-tighter w-full text-center whitespace-nowrap overflow-hidden text-ellipsis transition-colors duration-500 ${isEmergency ? 'text-red-600 dark:text-red-100' : 'text-slate-900 dark:text-white'}`}>
                        {prefix ? (
                          <>
                            <span className={`text-[0.4em] font-bold align-middle mr-1 transition-colors duration-500 ${isEmergency ? 'text-red-400 dark:text-red-200' : 'text-slate-400 dark:text-white/60'}`}>{prefix}-</span>
                            {number}
                          </>
                        ) : (
                          item.token
                        )}
                      </div>

                      {item.patientName && item.patientName !== 'Unknown Patient' && (
                        <div className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-400 truncate max-w-[80%]">
                          {item.patientName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Up Next (Right Sidebar) */}
          <div className="flex-[1] flex flex-col rounded-[3rem] bg-white/90 dark:bg-black/40 backdrop-blur-xl p-8 shadow-xl dark:shadow-2xl border border-slate-100 dark:border-white/10 transition-colors duration-500">
            <h3 className="text-[2.5vh] font-bold text-slate-400 dark:text-white/50 mb-[3vh] pb-[2vh] border-b border-slate-100 dark:border-white/10 uppercase tracking-widest text-center transition-colors duration-500">
              Up Next
            </h3>
            
            <div className="flex flex-col gap-[2vh] overflow-hidden flex-1">
              {queueData.nextTokens.length > 0 ? (
                queueData.nextTokens.slice(0, 5).map((token, index) => {
                  const isEmergency = token.includes('🚨');
                  const [prefix, number] = token.includes('-') ? token.split('-') : [null, token];
                  return (
                    <div 
                      key={index} 
                      className={`flex items-center justify-center p-[2.5vh] rounded-2xl border shadow-sm dark:shadow-none transition-colors duration-500 ${
                        isEmergency
                        ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-100'
                        : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-800 dark:text-white'
                      }`}
                    >
                      <span className="text-[5.5vh] lg:text-[6.5vh] font-black tracking-widest text-center w-full whitespace-nowrap overflow-hidden text-ellipsis">
                        {prefix ? (
                          <>
                            <span className={`text-[0.5em] font-bold align-middle mr-1 transition-colors duration-500 ${isEmergency ? 'text-red-400 dark:text-red-300' : 'text-slate-400 dark:text-white/50'}`}>{prefix}-</span>
                            {number}
                          </>
                        ) : (
                          token
                        )}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-white/30 text-[2vh] font-medium transition-colors duration-500">
                  <div className="w-[10vh] h-[10vh] rounded-full border-2 border-dashed border-slate-200 dark:border-white/20 mb-4 flex items-center justify-center text-[4vh]">☕</div>
                  No patients waiting
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer Marquee */}
        <footer className="relative z-10 h-[8vh] bg-blue-600 dark:bg-gradient-to-r dark:from-red-700 dark:via-rose-700 dark:to-red-700 flex items-center overflow-hidden whitespace-nowrap shadow-md dark:shadow-[0_-10px_30px_rgba(220,38,38,0.3)] transition-all duration-500">
          <div className="animate-marquee inline-block text-[2.5vh] font-bold text-white tracking-widest uppercase">
            <span className="mx-8">🚨</span> EMERGENCY PATIENTS HAVE PRIORITY 
            <span className="mx-8">🚨</span> PLEASE WAIT FOR YOUR TOKEN NUMBER TO BE DISPLAYED 
            <span className="mx-8">🚨</span> SILENCE YOUR MOBILE PHONES
            <span className="mx-8">🚨</span> PLEASE MAINTAIN SOCIAL DISTANCING
          </div>
        </footer>
      </div>
    </div>
  );
}

