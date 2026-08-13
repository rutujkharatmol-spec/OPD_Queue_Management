"use client";
import React, { useEffect, useState } from 'react';
import { useQueueStore } from '../../store/useQueueStore';
import { Moon, Sun } from 'lucide-react';

export default function TvDisplay({ departmentId }: { departmentId: string }) {
  const { liveQueues, initializeWebSocket } = useQueueStore();
  const queueData = liveQueues[departmentId];
  const [pulseScale, setPulseScale] = useState(false);
  const [prevActiveTokens, setPrevActiveTokens] = useState<string>('');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    initializeWebSocket(departmentId);
  }, [departmentId, initializeWebSocket]);

  // Flash animation whenever active tokens change
  useEffect(() => {
    const currentTokensStr = JSON.stringify(queueData?.activeTokens || []);
    if (queueData?.activeTokens?.length > 0 && currentTokensStr !== prevActiveTokens) {
      setPulseScale(true);
      const timer = setTimeout(() => setPulseScale(false), 500);
      setPrevActiveTokens(currentTokensStr);
      return () => clearTimeout(timer);
    }
  }, [queueData?.activeTokens]);

  if (!queueData) {
    return (
      <div className={isDark ? "dark" : ""}>
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white relative overflow-hidden transition-colors duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-white dark:from-slate-900 dark:to-black"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] bg-blue-400/20 dark:bg-blue-600/20 blur-[100px] rounded-full animate-pulse-slow"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
            <h1 className="text-[3vw] font-bold tracking-widest text-slate-500 dark:text-slate-300 uppercase">Connecting to Queue...</h1>
          </div>
        </div>
      </div>
    );
  }

  const activeTokens = queueData.activeTokens || [];
  const hasEmergency = activeTokens.some((t: any) => t.token?.includes('🚨')) || queueData.nextTokens.some(t => t.includes('🚨'));

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="flex h-screen w-full flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden relative font-sans transition-colors duration-500">
        
        {/* Theme Toggle Button */}
        <button 
          onClick={() => setIsDark(!isDark)}
          className="absolute top-6 left-6 z-50 p-4 bg-white/50 dark:bg-black/40 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-black/60 transition-all text-slate-600 dark:text-slate-300"
          title="Toggle Theme"
        >
          {isDark ? <Sun size={24} /> : <Moon size={24} />}
        </button>

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
          <h1 className="text-[3.5vh] font-black uppercase tracking-widest text-slate-800 dark:text-white dark:drop-shadow-md transition-colors duration-500">
            {queueData.department} OPD
          </h1>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex flex-1 p-6 lg:p-12 gap-8 lg:gap-12 items-stretch h-[80vh]">
          
          {/* Active Patients Grid (Left/Main) */}
          <div className={`flex-[2] flex flex-col rounded-[3rem] p-8 shadow-xl dark:shadow-2xl border relative overflow-hidden backdrop-blur-2xl transition-colors duration-500 ${
            hasEmergency 
              ? 'bg-white/90 dark:bg-red-950/40 border-red-200 dark:border-red-500/30 ring-4 ring-red-100 dark:ring-0' 
              : 'bg-white dark:bg-blue-900/20 border-slate-100 dark:border-blue-500/20'
          }`}>
            <h2 className="text-[3vh] font-bold text-slate-400 dark:text-white/50 mb-8 uppercase tracking-[0.3em] text-center transition-colors duration-500">
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
                  const tokenFontSize = activeTokens.length > 4 ? 'text-[8vh] lg:text-[10vh]' : activeTokens.length > 2 ? 'text-[10vh] lg:text-[12vh]' : 'text-[14vh] lg:text-[16vh]';
                  
                  const [prefix, number] = item.token?.includes('-') ? item.token.split('-') : [null, item.token];

                  return (
                    <div key={idx} className={`flex flex-col items-center justify-center rounded-[2rem] border transition-all duration-300 p-4 ${pulseScale ? 'scale-105' : 'scale-100'} ${
                      isEmergency 
                        ? 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] dark:shadow-[0_0_30px_rgba(220,38,38,0.3)]' 
                        : 'bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-blue-500/30 shadow-sm dark:shadow-none'
                    }`}>
                      <div className={`text-[3vh] lg:text-[3.5vh] font-bold tracking-wider mb-2 uppercase transition-colors duration-500 ${isEmergency ? 'text-red-500 dark:text-red-300' : 'text-slate-500 dark:text-blue-200'}`}>Room {item.room}</div>
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
                      <span className="text-[6vh] lg:text-[7vh] font-black tracking-widest text-center w-full whitespace-nowrap overflow-hidden text-ellipsis">
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
