"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Users, LogOut, CheckCircle, Clock, PauseCircle, PhoneOff, AlertTriangle, UserPlus, Settings } from 'lucide-react';
import { API_BASE_URL, callNextPatient } from '../../lib/api';
import { useQueueStore } from '../../store/useQueueStore';

interface Room {
  id: string;
  roomNumber: string;
  isActive: boolean;
}

export default function DoctorDashboard() {
  const { liveQueues } = useQueueStore();
  
  // Hardcoded for demo, normally from auth context
  const doctorId = "550e8400-e29b-41d4-a716-446655440000"; 
  const deptId = "660e8400-e29b-41d4-a716-446655440000";
  
  const queueData = liveQueues[deptId] || { department: 'Medicine', activeTokens: [], nextTokens: [] };
  
  const [rooms, setRooms] = useState<Room[]>([]);
  const [callingRoom, setCallingRoom] = useState<string | null>(null);

  useEffect(() => {
    // Fetch available rooms
    const fetchRooms = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/settings/rooms`);
        if (res.ok) {
          const data = await res.json();
          setRooms(data.filter((r: Room) => r.isActive));
        }
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchRooms();
  }, []);

  const handleCallNext = async (roomNumber: string) => {
    setCallingRoom(roomNumber);
    try {
      // Temporary fetch because the original `callNextPatient` didn't take a second arg in lib/api.ts
      // Ideally update lib/api.ts, but we'll do it inline here for safety
      await fetch(`${API_BASE_URL}/queue/next/${doctorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomNumber })
      });
      // WebSocket handles state update
    } catch (err) {
      console.error(err);
      alert('Failed to call next patient. Ensure API is running.');
    } finally {
      setCallingRoom(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-slate-100 font-sans">
      
      {/* Sidebar - Queue List */}
      <aside className="w-full lg:w-[400px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shadow-sm flex flex-col z-20 order-2 lg:order-1 h-[50vh] lg:h-screen">
        <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users size={20} className="text-blue-400" /> Waiting Queue
            </h2>
            <p className="text-blue-200/70 text-sm mt-1 font-medium">{queueData.nextTokens.length} Patients Waiting</p>
          </div>
          <div className="flex gap-2">
            <Link href="/settings" className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <Settings size={20} className="text-slate-300" />
            </Link>
            <Link href="/" className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
              <Home size={20} className="text-slate-300" />
            </Link>
          </div>
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
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 lg:p-10 gap-4 relative z-10">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Department Consultation</h1>
            <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {queueData.department || 'Medicine'} Dept
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            
            {rooms.length === 0 ? (
               <div className="col-span-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">
                 <Settings size={48} className="mb-4 opacity-50" />
                 <p className="font-bold text-lg mb-2">No Rooms Configured</p>
                 <p className="mb-6">Please configure rooms in the settings before calling patients.</p>
                 <Link href="/settings" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold">Go to Settings</Link>
               </div>
            ) : (
              rooms.map(room => {
                const isCalling = callingRoom === room.roomNumber;
                const activePatient = queueData.activeTokens?.find((t: any) => t.room === room.roomNumber);
                
                return (
                  <div key={room.id} className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl shadow-blue-900/5 border border-white p-6 flex flex-col h-full relative overflow-hidden group">
                    {/* Room Badge */}
                    <div className="absolute top-0 right-0 bg-blue-50 text-blue-700 font-black px-6 py-3 rounded-bl-[2rem] border-b border-l border-white shadow-sm flex items-center gap-2">
                       Room {room.roomNumber}
                    </div>

                    <div className="mt-8 mb-6 flex-1 flex flex-col justify-center items-center">
                      <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Currently Serving</div>
                      
                      <div className={`transition-all duration-300 text-center ${isCalling ? 'scale-95 opacity-50 blur-sm' : 'scale-100 opacity-100 blur-0'}`}>
                        {activePatient ? (
                          <>
                            <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-indigo-800 tracking-tighter leading-none mb-4">
                              {activePatient.token}
                            </div>
                            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl">
                              <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                                P
                              </span>
                              <div className="text-left">
                                <p className="text-sm font-bold text-slate-700">Patient Details</p>
                                <p className="text-slate-400 text-xs font-medium">Pending Sync</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-5xl font-black text-slate-200 tracking-tighter">---</div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3 mt-auto">
                      <button 
                        onClick={() => handleCallNext(room.roomNumber)}
                        disabled={isCalling || queueData.nextTokens.length === 0}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold transition-all active:scale-95 shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isCalling ? <AlertTriangle size={20} className="animate-spin" /> : <UserPlus size={20} />}
                        {isCalling ? 'Assigning...' : 'Assign Next Patient'}
                      </button>
                      
                      <div className="flex gap-2">
                        <button disabled={!activePatient} className="flex-1 py-3 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-50">
                          Complete
                        </button>
                        <button disabled={!activePatient} className="flex-1 py-3 rounded-xl bg-orange-50 text-orange-700 font-bold text-sm hover:bg-orange-100 transition-all active:scale-95 disabled:opacity-50">
                          Absent
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
