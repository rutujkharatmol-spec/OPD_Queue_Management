"use client";
import React, { useEffect, useState } from 'react';
import { Bell, MapPin, Stethoscope, Clock, ShieldAlert } from 'lucide-react';
import { useQueueStore } from '../../store/useQueueStore';

export default function PatientMobileView({ tokenNumber = 'MED-049', departmentId = 'med_dept_1' }) {
  const { liveQueues, initializeWebSocket } = useQueueStore();
  
  useEffect(() => {
    initializeWebSocket(departmentId);
  }, [departmentId, initializeWebSocket]);

  // For demonstration, fallback to mock data if store is empty
  const queueData = liveQueues[departmentId] || {
    department: 'Medicine',
    roomNumber: '104',
    currentToken: 'MED-042',
    nextTokens: ['MED-043', 'MED-044', 'MED-045', 'MED-046', 'MED-047', 'MED-048', 'MED-049']
  };

  const isMyTurn = tokenNumber === queueData.currentToken;
  
  const myIndex = queueData.nextTokens.indexOf(tokenNumber);
  const patientsAhead = myIndex !== -1 ? myIndex + 1 : 0;
  const estimatedWaitTime = patientsAhead * 5;

  return (
    <div className="flex flex-col w-full h-[100dvh] bg-slate-50 font-sans sm:max-w-md sm:mx-auto sm:border-x border-slate-200 shadow-2xl relative overflow-hidden selection:bg-blue-200">
      
      {/* Background Graphic */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-blue-600 to-indigo-700 pointer-events-none rounded-b-[3rem]"></div>
      
      {/* Header */}
      <header className="pt-12 px-6 pb-6 text-white z-10 relative">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200">AIIMS KALYANI</h1>
            <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mt-1">Live OPD Status</p>
          </div>
          <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/30 flex items-center gap-2 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs font-bold tracking-wide">Live</span>
          </div>
        </div>
        
        <div className="flex justify-between items-end">
          <div>
            <p className="text-blue-200 text-sm font-medium mb-1">Your Token</p>
            <h2 className="text-5xl font-black tracking-tighter drop-shadow-md">{tokenNumber}</h2>
          </div>
          {tokenNumber.includes('🚨') && (
            <div className="bg-red-500 text-white p-2 rounded-full mb-1">
              <ShieldAlert size={24} />
            </div>
          )}
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 overflow-y-auto px-6 py-2 pb-28 z-10 relative">
        
        {/* Status Card */}
        {isMyTurn ? (
          <div className="bg-emerald-500 rounded-3xl p-8 text-white shadow-xl shadow-emerald-500/30 text-center animate-pulse-slow mb-6 relative overflow-hidden border border-emerald-400">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-600/50 to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-3xl font-black tracking-tight mb-2 drop-shadow-md">IT IS YOUR TURN!</h3>
              <p className="text-emerald-100 font-medium mb-8">Please proceed to the doctor immediately.</p>
              <div className="bg-white text-emerald-600 rounded-2xl py-6 shadow-inner border border-emerald-100">
                <p className="text-xs uppercase font-bold text-emerald-400 mb-1">Go To</p>
                <div className="font-black text-5xl">Room {queueData.roomNumber}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 mb-6 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 animate-pulse w-[40%] rounded-r-full"></div>
            </div>
            
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 mt-2">Currently Serving</p>
            <div className="text-7xl font-black text-slate-800 tracking-tighter mb-8 drop-shadow-sm">
              {queueData.currentToken}
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-6">
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-slate-400 text-[10px] uppercase font-bold mb-2 tracking-wider flex items-center justify-center gap-1">
                  <UsersIcon /> Ahead
                </p>
                <p className="text-3xl font-black text-slate-700">{patientsAhead}</p>
              </div>
              <div className="bg-blue-50/50 p-4 rounded-2xl">
                <p className="text-blue-400 text-[10px] uppercase font-bold mb-2 tracking-wider flex items-center justify-center gap-1">
                  <Clock size={12} /> Wait Time
                </p>
                <p className="text-3xl font-black text-blue-600">~{estimatedWaitTime}<span className="text-base text-blue-400">m</span></p>
              </div>
            </div>
          </div>
        )}

        {/* Doctor Details */}
        <div className="bg-white rounded-3xl p-6 shadow-lg shadow-slate-200/50 border border-slate-100">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-3">Consultation Details</h3>
          
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-inner border border-blue-100">
              <Stethoscope size={20} />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-lg leading-tight">{queueData.department} Dept</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Consultation</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner border border-emerald-100">
              <MapPin size={20} />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-lg leading-tight">Room {queueData.roomNumber}</p>
              <p className="text-xs font-medium text-slate-500">First floor, OPD Wing C</p>
            </div>
          </div>
        </div>

      </main>

      {/* Floating Notification Opt-in (Safe area friendly) */}
      {!isMyTurn && patientsAhead > 2 && (
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent pb-8">
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between border border-slate-800 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 p-2 rounded-xl text-yellow-400">
                <Bell size={20} />
              </div>
              <div className="flex-1 pr-2">
                <p className="font-bold text-sm tracking-wide">SMS Alert</p>
                <p className="text-[10px] text-slate-400 font-medium">Get notified when you're next</p>
              </div>
            </div>
            <button className="bg-blue-600 hover:bg-blue-500 active:scale-95 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/50">
              Enable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
