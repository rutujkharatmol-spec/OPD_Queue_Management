"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { Home, Users, Settings, LogOut, CheckCircle, Clock, PauseCircle, PhoneOff, AlertTriangle } from 'lucide-react';
import { callNextPatient } from '../../lib/api';
import { useQueueStore } from '../../store/useQueueStore';

export default function DoctorDashboard() {
  const { liveQueues } = useQueueStore();
  
  // Hardcoded for demo, normally from auth context
  const doctorId = "550e8400-e29b-41d4-a716-446655440000"; 
  const deptId = "660e8400-e29b-41d4-a716-446655440000";
  
  const queueData = liveQueues[deptId] || { currentToken: '---', nextTokens: [] };
  
  const [isCalling, setIsCalling] = useState(false);

  const handleCallNext = async () => {
    setIsCalling(true);
    try {
      await callNextPatient(doctorId);
      // We don't need to manually update state because the WebSocket will push the new queue!
    } catch (err) {
      console.error(err);
      alert('Failed to call next patient. Ensure API is running.');
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-slate-100 font-sans">
      
      {/* Sidebar - Queue List (Responsive: Stacks on top/bottom for mobile, side for desktop) */}
      <aside className="w-full lg:w-[400px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shadow-sm flex flex-col z-20 order-2 lg:order-1 h-[50vh] lg:h-screen">
        <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users size={20} className="text-blue-400" /> Waiting Queue
            </h2>
            <p className="text-blue-200/70 text-sm mt-1 font-medium">{queueData.nextTokens.length} Patients Waiting</p>
          </div>
          <Link href="/" className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
            <Home size={20} className="text-slate-300" />
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-3">
          {queueData.nextTokens.map((tokenStr, idx) => {
            const isEmergency = tokenStr.includes('🚨');
            const token = tokenStr.replace(' 🚨', '');
            return (
            <div 
              key={idx} 
              className={`group p-5 rounded-2xl border transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${
                isEmergency
                  ? 'border-red-200 bg-gradient-to-r from-red-50 to-white text-red-900 shadow-sm' 
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xl font-black tracking-tight">{token}</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${
                  isEmergency ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Clock size={12} /> Waiting
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${isEmergency ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-blue-400'}`}></span>
                <span className="font-semibold opacity-75 uppercase tracking-wider text-[10px]">{isEmergency ? 'Emergency' : 'Normal'} Queue</span>
              </div>
            </div>
          )})}
          
          {queueData.nextTokens.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
              <CheckCircle size={48} className="mb-4 text-emerald-400 opacity-50" />
              <p className="font-semibold">Queue is completely clear!</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content - Active Consultation */}
      <main className="flex-1 flex flex-col relative overflow-hidden order-1 lg:order-2 h-[50vh] lg:h-screen">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 lg:p-10 gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Consultation OPD</h1>
            <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Medicine Dept • Room 104
            </p>
          </div>
          <div className="flex gap-3">
            <button className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 active:scale-95">
              <PauseCircle size={18} /> Pause
            </button>
            <button className="px-5 py-2.5 rounded-xl font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all shadow-sm flex items-center gap-2 active:scale-95">
              <LogOut size={18} /> Close OPD
            </button>
          </div>
        </header>

        {/* Control Panel */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-3xl bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl shadow-blue-900/5 border border-white p-8 lg:p-16 flex flex-col items-center text-center relative overflow-hidden">
            
            <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none"></div>

            <div className="relative z-10 w-full">
              <div className="inline-flex items-center justify-center px-4 py-1.5 mb-8 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-widest">
                Currently Serving
              </div>
              
              <div className={`transition-all duration-300 ${isCalling ? 'scale-95 opacity-50 blur-sm' : 'scale-100 opacity-100 blur-0'}`}>
                <div className="text-7xl lg:text-[9rem] font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-indigo-800 tracking-tighter leading-none drop-shadow-sm mb-6">
                  {queueData.currentToken || '---'}
                </div>
                
                {queueData.currentToken && (
                  <div className="inline-flex items-center gap-3 bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl">
                    <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                      R
                    </span>
                    <div className="text-left">
                      <p className="text-xl font-bold text-slate-800 leading-tight">Rahul Kumar</p>
                      <p className="text-slate-500 text-sm font-medium">45 Years, Male</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12 w-full">
                <button 
                  onClick={handleCallNext}
                  disabled={isCalling}
                  className="sm:col-span-2 py-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-2xl lg:text-3xl font-black transition-all transform active:scale-[0.98] shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3"
                >
                  <AlertTriangle size={28} className={isCalling ? "animate-spin" : ""} /> 
                  {isCalling ? 'Calling...' : 'Call Next Patient'}
                </button>
                
                <button className="py-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-lg hover:bg-emerald-100 transition-all active:scale-95 flex justify-center items-center gap-2">
                  <CheckCircle size={20} /> Complete
                </button>
                
                <button className="py-4 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 font-bold text-lg hover:bg-orange-100 transition-all active:scale-95 flex justify-center items-center gap-2">
                  <PhoneOff size={20} /> Absent
                </button>
              </div>
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}
