"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Home, Users, LogOut, CheckCircle, Clock, PauseCircle,
  PhoneOff, AlertTriangle, UserPlus, Settings, Bell, BarChart2, Stethoscope, ArrowRight
} from 'lucide-react';
import { API_BASE_URL, callNextPatient, markTokenAction, recallPatient, getRooms } from '../../lib/api';
import { useQueueStore } from '../../store/useQueueStore';
import { useSearchParams } from 'next/navigation';

interface Room {
  id: string;
  roomNumber: string;
  isActive: boolean;
  doctorName?: string;
}

export default function DoctorDashboard() {
  const searchParams = useSearchParams();
  const deptId = searchParams.get('deptId') || '660e8400-e29b-41d4-a716-446655440000';

  const queueData = useQueueStore((state) => state.liveQueues[deptId]) || { department: 'Medicine', activeTokens: [], nextTokens: [] };

  const [rooms, setRooms] = useState<Room[]>([]);
  const [callingRoom, setCallingRoom] = useState<string | null>(null);
  const [recallingRoom, setRecallingRoom] = useState<string | null>(null);
  const [recallSuccessRoom, setRecallSuccessRoom] = useState<string | null>(null);

  useEffect(() => {
    // Start polling the queue state
    useQueueStore.getState().initializeWebSocket(deptId);

    // Fetch available rooms
    const fetchRooms = async () => {
      try {
        const data = await getRooms(deptId);
        setRooms(data.filter((r: Room) => r.isActive));
      } catch (err) {
        if (err instanceof Error && err.name !== 'TypeError') {
          console.error('Failed to fetch rooms', err);
        }
      }
    };
    fetchRooms();

    // Cleanup on unmount
    return () => {
      useQueueStore.getState().disconnectWebSocket();
    };
  }, [deptId]);

  const handleCallNext = async (roomNumber: string) => {
    setCallingRoom(roomNumber);
    try {
      const called = await callNextPatient(deptId, roomNumber);
      if (!called) {
        alert('No more patients currently waiting in the queue.');
      }
      await useQueueStore.getState().fetchQueue(deptId);
    } catch (err) {
      console.error('Failed to call next patient:', err);
      alert(err instanceof Error ? err.message : 'Failed to call next patient');
    } finally {
      setCallingRoom(null);
    }
  };

  const handleRecall = async (roomNumber: string) => {
    setRecallingRoom(roomNumber);
    try {
      await recallPatient(deptId, roomNumber);
      setRecallSuccessRoom(roomNumber);
      setTimeout(() => setRecallSuccessRoom(null), 2500);
      await useQueueStore.getState().fetchQueue(deptId);
    } catch (err) {
      console.error('Failed to recall patient:', err);
      alert('Could not recall patient. Ensure a patient is currently called in this room.');
    } finally {
      setRecallingRoom(null);
    }
  };

  const handleTokenAction = async (tokenId: string, action: 'COMPLETE' | 'ABSENT' | 'NOT_AVAILABLE') => {
    try {
      await markTokenAction(tokenId, action);
      await useQueueStore.getState().fetchQueue(deptId);
    } catch (err) {
      console.error(err);
      alert(`Failed to mark token as ${action}`);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-slate-100 font-sans">

      {/* Sidebar - Waiting Queue List */}
      <aside className="w-full lg:w-[400px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shadow-sm flex flex-col z-20 order-2 lg:order-1 h-[50vh] lg:h-screen">
        <div className="p-6 border-b border-slate-800 bg-slate-950 text-white flex justify-between items-center sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h2 className="text-lg font-black tracking-wide uppercase">
                {queueData.department || 'Medicine'} Queue
              </h2>
            </div>
            <p className="text-blue-300 text-xs mt-1 font-semibold">
              {queueData.nextTokens.length} Patients in Waiting Line
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/analytics?deptId=${deptId}`}
              className="p-2.5 bg-slate-800 rounded-xl hover:bg-blue-600 transition-colors text-slate-300 hover:text-white"
              title="OPD Analytics"
            >
              <BarChart2 size={18} />
            </Link>
            <Link
              href={`/settings?deptId=${deptId}`}
              className="p-2.5 bg-slate-800 rounded-xl hover:bg-blue-600 transition-colors text-slate-300 hover:text-white"
              title="Room Settings"
            >
              <Settings size={18} />
            </Link>
            <Link
              href={`/?deptId=${deptId}`}
              className="p-2.5 bg-slate-800 rounded-xl hover:bg-blue-600 transition-colors text-slate-300 hover:text-white"
              title="Home"
            >
              <Home size={18} />
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
          {queueData.nextTokens.map((tokenStr, idx) => {
            const isEmergency = tokenStr.includes('🚨');
            const token = tokenStr.replace(' 🚨', '');
            return (
              <div
                key={idx}
                className={`p-4 rounded-2xl border transition-all duration-200 hover:shadow-md ${isEmergency
                  ? 'border-red-200 bg-red-50/70 text-red-950 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700'
                  }`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xl font-black tracking-tight">{token}</span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${isEmergency ? 'bg-red-200 text-red-800 animate-pulse' : 'bg-slate-100 text-slate-600'
                    }`}>
                    <Clock size={11} /> #{idx + 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${isEmergency ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                  <span className="font-bold opacity-75 uppercase tracking-wider text-[10px]">
                    {isEmergency ? '🚨 Emergency Priority' : 'Normal Queue'}
                  </span>
                </div>
              </div>
            );
          })}

          {queueData.nextTokens.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 text-center">
              <CheckCircle size={44} className="mb-3 text-emerald-500 opacity-60" />
              <p className="font-bold text-slate-700">Waiting Line Clear</p>
              <p className="text-xs text-slate-400 mt-1">No new patients waiting in this department.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content - Active Consultation Rooms */}
      <main className="flex-1 flex flex-col relative overflow-hidden order-1 lg:order-2 h-[50vh] lg:h-screen">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 lg:p-8 bg-white border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Consultation Rooms</h1>
              <span className="text-xs font-black bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase">
                {queueData.department || 'Medicine'} OPD
              </span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-1">
              Call, recall, and manage live patients across consultation rooms.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/analytics?deptId=${deptId}`}
              className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 border border-blue-200"
            >
              <BarChart2 size={16} />
              <span>OPD Metrics</span>
            </Link>
            <Link
              href={`/settings?deptId=${deptId}`}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 border border-slate-200"
            >
              <Settings size={16} />
              <span>Configure Rooms</span>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {rooms.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">
                <Settings size={44} className="mb-3 text-slate-300" />
                <p className="font-bold text-slate-800 text-base mb-1">No Rooms Configured</p>
                <p className="text-xs text-slate-400 mb-6">Please configure rooms in settings before calling patients.</p>
                <Link href={`/settings?deptId=${deptId}`} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm">
                  Go to Settings
                </Link>
              </div>
            ) : (
              rooms.map(room => {
                const isCalling = callingRoom === room.roomNumber;
                const isRecalling = recallingRoom === room.roomNumber;
                const isRecallSuccess = recallSuccessRoom === room.roomNumber;
                const activePatient = queueData.activeTokens?.find((t: any) => t.room === room.roomNumber);

                return (
                  <div
                    key={room.id}
                    className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col h-full relative overflow-hidden"
                  >
                    {/* Room Top Bar */}
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 font-black px-3.5 py-1 rounded-xl text-sm">
                          Room {room.roomNumber}
                        </div>
                        {room.doctorName && (
                          <p className="text-xs font-bold text-slate-600 mt-2 flex items-center gap-1.5">
                            <Stethoscope size={13} className="text-blue-600" />
                            {room.doctorName}
                          </p>
                        )}
                      </div>

                      {/* Recall / Ring Bell Button */}
                      <button
                        onClick={() => handleRecall(room.roomNumber)}
                        disabled={!activePatient || isRecalling}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm ${isRecallSuccess
                          ? 'bg-emerald-600 text-white animate-bounce'
                          : activePatient
                            ? 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95 shadow-amber-500/20'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        title="Re-announce and ring bell on TV monitor"
                      >
                        <Bell size={14} className={isRecalling ? 'animate-spin' : isRecallSuccess ? 'animate-ping' : ''} />
                        {isRecalling ? 'Ringing...' : isRecallSuccess ? 'Rang TV Bell!' : 'Recall'}
                      </button>
                    </div>

                    {/* Active Patient Card */}
                    <div className="my-auto py-6 flex flex-col justify-center items-center text-center">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Currently Serving
                      </div>

                      {activePatient ? (
                        <div className="space-y-3">
                          <div className="text-5xl font-black text-slate-900 tracking-tight">
                            {activePatient.token}
                          </div>
                          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl text-left">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                              👤
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{activePatient.patientName}</p>
                              {activePatient.uhid && activePatient.uhid !== '---' ? (
                                <p className="text-xs text-slate-400 font-mono">UHID: {activePatient.uhid}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-4xl font-black text-slate-300 tracking-widest py-4">
                          ---
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2.5 mt-auto pt-4 border-t border-slate-100">
                      <button
                        onClick={() => handleCallNext(room.roomNumber)}
                        disabled={isCalling}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm transition-all active:scale-95 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isCalling ? <AlertTriangle size={18} className="animate-spin" /> : <UserPlus size={18} />}
                        {isCalling ? 'Calling...' : queueData.nextTokens.length === 0 ? 'Call Next Patient (Queue 0)' : 'Call Next Patient'}
                      </button>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleTokenAction(activePatient.id, 'COMPLETE')}
                          disabled={!activePatient}
                          className="py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleTokenAction(activePatient.id, 'NOT_AVAILABLE')}
                          disabled={!activePatient}
                          className="py-2.5 rounded-xl bg-amber-50 text-amber-800 font-bold text-xs hover:bg-amber-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-center"
                          title="Patient stepped away (Push +3 back in queue)"
                        >
                          Pass (+3)
                        </button>
                        <button
                          onClick={() => handleTokenAction(activePatient.id, 'ABSENT')}
                          disabled={!activePatient}
                          className="py-2.5 rounded-xl bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
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
