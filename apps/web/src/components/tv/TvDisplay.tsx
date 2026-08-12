"use client";
import React, { useEffect, useState } from 'react';
import { useQueueStore } from '../../store/useQueueStore';

export default function TvDisplay({ departmentId }: { departmentId: string }) {
  const { liveQueues, initializeWebSocket } = useQueueStore();
  const queueData = liveQueues[departmentId];
  const [pulseScale, setPulseScale] = useState(false);

  useEffect(() => {
    initializeWebSocket(departmentId);
  }, [departmentId, initializeWebSocket]);

  // Flash animation whenever current token changes
  useEffect(() => {
    if (queueData?.currentToken) {
      setPulseScale(true);
      const timer = setTimeout(() => setPulseScale(false), 500);
      return () => clearTimeout(timer);
    }
  }, [queueData?.currentToken]);

  if (!queueData) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] bg-blue-600/20 blur-[100px] rounded-full animate-pulse-slow"></div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
          <h1 className="text-[3vw] font-bold tracking-widest text-slate-300 uppercase">Connecting to Queue...</h1>
        </div>
      </div>
    );
  }

  const isEmergency = queueData.currentToken?.includes('🚨');

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-white overflow-hidden relative">
      
      {/* Animated Mesh Background */}
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-700/30 blur-[120px] rounded-full mix-blend-screen animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-purple-900/40 blur-[150px] rounded-full mix-blend-screen animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        {isEmergency && (
          <div className="absolute inset-0 bg-red-600/10 animate-pulse mix-blend-overlay z-0"></div>
        )}
      </div>

      {/* Header */}
      <header className="relative z-10 flex h-[10vh] items-center justify-between bg-black/40 backdrop-blur-xl px-12 shadow-2xl border-b border-white/5">
        <h1 className="text-[3.5vh] font-black uppercase tracking-widest text-white drop-shadow-md">
          {queueData.department} OPD
        </h1>
        <div className="text-right flex items-center gap-6">
          <div className="text-right">
            <p className="text-[1.8vh] font-bold text-blue-300 tracking-wider uppercase">Consulting</p>
            <p className="text-[3vh] font-black text-white">{queueData.doctorName}</p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center font-black text-[3vh] shadow-[0_0_20px_rgba(37,99,235,0.5)]">
            {queueData.roomNumber}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex flex-1 p-6 lg:p-12 gap-8 lg:gap-12 items-stretch justify-center h-[80vh]">
        
        {/* Current Token (Left/Main) */}
        <div className={`flex flex-1 flex-col items-center justify-center rounded-[3rem] transition-all duration-500 shadow-2xl border-4 relative overflow-hidden backdrop-blur-2xl ${
          isEmergency 
            ? 'bg-red-950/80 border-red-500 shadow-[0_0_50px_rgba(220,38,38,0.3)]' 
            : 'bg-blue-900/40 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.2)]'
        }`}>
          {isEmergency && (
            <div className="absolute inset-0 bg-gradient-to-t from-red-600/20 to-transparent animate-pulse"></div>
          )}
          
          <h2 className="text-[3vh] font-bold text-white/70 mb-[2vh] uppercase tracking-[0.5em] relative z-10">
            Currently Serving
          </h2>
          
          <div className={`relative z-10 transition-transform duration-300 ${pulseScale ? 'scale-110' : 'scale-100'}`}>
            <div className={`text-[18vw] lg:text-[22vh] font-black leading-none tracking-tighter drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] ${isEmergency ? 'text-red-100' : 'text-white'}`}>
              {queueData.currentToken || '---'}
            </div>
          </div>
          
          {queueData.currentToken && (
            <div className={`mt-[6vh] text-[4vh] font-medium relative z-10 px-10 py-4 rounded-full border ${isEmergency ? 'bg-red-900/50 border-red-400/50 text-red-100' : 'bg-black/30 border-white/10 text-blue-100'}`}>
              Proceed to <span className="font-black">Room {queueData.roomNumber}</span> immediately
            </div>
          )}
        </div>

        {/* Up Next (Right Sidebar) */}
        <div className="flex w-1/3 max-w-[400px] flex-col rounded-[3rem] bg-black/40 backdrop-blur-xl p-8 shadow-2xl border border-white/10">
          <h3 className="text-[2.5vh] font-bold text-white/50 mb-[3vh] pb-[2vh] border-b border-white/10 uppercase tracking-widest text-center">
            Up Next
          </h3>
          
          <div className="flex flex-col gap-[2vh] overflow-hidden flex-1">
            {queueData.nextTokens.length > 0 ? (
              queueData.nextTokens.slice(0, 5).map((token, index) => (
                <div 
                  key={index} 
                  className={`flex items-center justify-center rounded-2xl py-[2.5vh] text-[4.5vh] font-black shadow-lg border transition-all ${
                    token.includes('🚨') 
                      ? 'bg-red-950/80 border-red-800 text-red-200' 
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  {token}
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-white/30 text-[2vh] font-medium">
                <div className="w-[10vh] h-[10vh] rounded-full border-2 border-dashed border-white/20 mb-4 flex items-center justify-center text-[4vh]">☕</div>
                No patients waiting
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Marquee */}
      <footer className="relative z-10 h-[8vh] bg-gradient-to-r from-red-700 via-rose-700 to-red-700 flex items-center overflow-hidden whitespace-nowrap shadow-[0_-10px_30px_rgba(220,38,38,0.3)]">
        <div className="animate-marquee inline-block text-[2.5vh] font-bold text-white tracking-widest uppercase">
          <span className="mx-8">🚨</span> EMERGENCY PATIENTS HAVE PRIORITY 
          <span className="mx-8">🚨</span> PLEASE WAIT FOR YOUR TOKEN NUMBER TO BE DISPLAYED 
          <span className="mx-8">🚨</span> SILENCE YOUR MOBILE PHONES
          <span className="mx-8">🚨</span> PLEASE MAINTAIN SOCIAL DISTANCING
        </div>
      </footer>
    </div>
  );
}
