"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Home, Users, LogOut, CheckCircle, Clock, PauseCircle,
  PhoneOff, AlertTriangle, UserPlus, Settings, Bell, BarChart2, Stethoscope, ArrowRight,
  Plus, Trash2, Edit2, Check, X, Building2
} from 'lucide-react';
import {
  API_BASE_URL, callNextPatient, markTokenAction, recallPatient,
  getRooms, createRoom, updateRoom, deleteRoom
} from '../../lib/api';
import { useQueueStore } from '../../store/useQueueStore';
import { useSearchParams } from 'next/navigation';

import { useDepartmentStore } from '../../store/useDepartmentStore';

interface Room {
  id: string;
  roomNumber: string;
  isActive: boolean;
  doctorName?: string;
}

export default function DoctorDashboard() {
  const searchParams = useSearchParams();
  const requestedDeptId = searchParams.get('deptId');
  const { loadDepartments, getEffectiveDeptId } = useDepartmentStore();

  const deptId = getEffectiveDeptId(requestedDeptId);

  const queueData = useQueueStore((state) => state.liveQueues[deptId]) || { department: 'Medicine', activeTokens: [], nextTokens: [] };

  const [rooms, setRooms] = useState<Room[]>([]);
  const [callingRoom, setCallingRoom] = useState<string | null>(null);
  const [recallingRoom, setRecallingRoom] = useState<string | null>(null);
  const [recallSuccessRoom, setRecallSuccessRoom] = useState<string | null>(null);

  // Room Management Popup State
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newDoctorName, setNewDoctorName] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editDoctorName, setEditDoctorName] = useState('');

  useEffect(() => {
    loadDepartments(requestedDeptId);
  }, [requestedDeptId, loadDepartments]);

  const fetchRooms = async () => {
    try {
      const data = await getRooms(deptId);
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof Error && err.name !== 'TypeError') {
        console.error('Failed to fetch rooms', err);
      }
    }
  };

  useEffect(() => {
    // Start polling the queue state
    useQueueStore.getState().initializeWebSocket(deptId);
    fetchRooms();

    // Cleanup on unmount
    return () => {
      useQueueStore.getState().disconnectWebSocket();
    };
  }, [deptId]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber.trim()) return;
    try {
      await createRoom(newRoomNumber.trim(), true, deptId || undefined, newDoctorName.trim() || undefined);
      setNewRoomNumber('');
      setNewDoctorName('');
      await fetchRooms();
    } catch (err) {
      console.error('Failed to add room', err);
      alert('Failed to add room.');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      await deleteRoom(id);
      await fetchRooms();
    } catch (err) {
      console.error('Failed to delete room', err);
      alert('Failed to delete room.');
    }
  };

  const saveEditRoom = async (id: string) => {
    if (!editRoomNumber.trim()) return;
    try {
      await updateRoom(id, editRoomNumber.trim(), true, editDoctorName.trim() || undefined);
      setEditingRoomId(null);
      await fetchRooms();
    } catch (err) {
      console.error('Failed to update room', err);
      alert('Failed to update room.');
    }
  };

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
            <button
              onClick={() => setIsRoomModalOpen(true)}
              className="p-2.5 bg-slate-800 rounded-xl hover:bg-blue-600 transition-colors text-slate-300 hover:text-white"
              title="Add / Configure Rooms"
            >
              <Settings size={18} />
            </button>
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
            <button
              onClick={() => setIsRoomModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
            >
              <Plus size={16} />
              <span>+ Add / Manage Rooms</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {rooms.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">
                <Settings size={44} className="mb-3 text-slate-300" />
                <p className="font-bold text-slate-800 text-base mb-1">No Rooms Configured</p>
                <p className="text-xs text-slate-400 mb-6">Add consultation rooms to start calling patients in this department.</p>
                <button
                  onClick={() => setIsRoomModalOpen(true)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
                >
                  <Plus size={16} />
                  <span>+ Add Consultation Room</span>
                </button>
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
                            ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer active:scale-95'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        title={activePatient ? 'Ring Bell / Call Patient Again' : 'No active patient to recall'}
                      >
                        <Bell size={14} className={isRecalling ? 'animate-spin' : ''} />
                        <span>{isRecallSuccess ? 'Called!' : isRecalling ? 'Calling...' : 'Recall'}</span>
                      </button>
                    </div>

                    {/* Active Patient Card */}
                    <div className="flex-1 bg-slate-50 border border-slate-200/80 rounded-2xl p-5 mb-6 flex flex-col justify-center items-center text-center">
                      {activePatient ? (
                        <>
                          <span className="text-xs font-black uppercase tracking-wider text-blue-600 mb-1">
                            Currently In Room
                          </span>
                          <span className="text-4xl font-black text-slate-900 tracking-tight my-1">
                            {activePatient.token}
                          </span>
                          <p className="text-sm font-bold text-slate-700 mt-1">{activePatient.patientName}</p>
                          {activePatient.uhid && (
                            <span className="text-[11px] font-semibold text-slate-400">
                              UHID: {activePatient.uhid}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Users size={32} className="text-slate-300 mb-2" />
                          <p className="text-sm font-bold text-slate-500">Room Ready</p>
                          <p className="text-xs text-slate-400 mt-0.5">Click &apos;Call Next&apos; to invite the next patient</p>
                        </>
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

      {/* Configure Consultation Rooms Modal Popup */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] flex flex-col text-white">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Building2 className="text-blue-500 w-5 h-5" />
                  Rooms — {queueData.department || 'Medicine'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add, edit, or delete consultation rooms for this department.
                </p>
              </div>
              <button
                onClick={() => setIsRoomModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content: Add Room Form + Existing Rooms List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5">
              {/* Add Room Form */}
              <form onSubmit={handleAddRoom} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Add New Room</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Room Number *</label>
                    <input
                      type="text"
                      required
                      value={newRoomNumber}
                      onChange={(e) => setNewRoomNumber(e.target.value)}
                      placeholder="e.g. 101"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Doctor Name (Optional)</label>
                    <input
                      type="text"
                      value={newDoctorName}
                      onChange={(e) => setNewDoctorName(e.target.value)}
                      placeholder="e.g. Dr. A. Sharma"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-medium placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!newRoomNumber.trim()}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={16} /> Add Room
                </button>
              </form>

              {/* Existing Rooms List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Existing Rooms ({rooms.length})
                  </p>
                </div>

                {rooms.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/60 rounded-2xl border border-dashed border-slate-800">
                    No consultation rooms added yet for this department.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {rooms.map((r) => (
                      <div
                        key={r.id}
                        className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between gap-2"
                      >
                        {editingRoomId === r.id ? (
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={editRoomNumber}
                                onChange={(e) => setEditRoomNumber(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-blue-500"
                                placeholder="Room No."
                                autoFocus
                              />
                              <input
                                type="text"
                                value={editDoctorName}
                                onChange={(e) => setEditDoctorName(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                placeholder="Doctor Name"
                              />
                            </div>
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => saveEditRoom(r.id)}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                              >
                                <Check size={12} /> Save
                              </button>
                              <button
                                onClick={() => setEditingRoomId(null)}
                                className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold text-xs flex items-center justify-center">
                                {r.roomNumber}
                              </div>
                              <div>
                                <p className="font-bold text-white text-xs">Room {r.roomNumber}</p>
                                <p className="text-[11px] text-slate-400">
                                  {r.doctorName || 'No doctor assigned'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingRoomId(r.id);
                                  setEditRoomNumber(r.roomNumber);
                                  setEditDoctorName(r.doctorName || '');
                                }}
                                className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteRoom(r.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRoomModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
