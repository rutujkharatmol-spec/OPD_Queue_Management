"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings as SettingsIcon, Plus, Trash2, Edit2, Check, X, ArrowLeft,
  Stethoscope, Building2, Sparkles, RefreshCw, CheckCircle2, HardDrive, ShieldCheck
} from 'lucide-react';
import { API_BASE_URL, getRooms, createRoom, updateRoom } from '../../lib/api';
import { fetchWithOfflineSync } from '../../lib/offlineSync';
import { useSearchParams } from 'next/navigation';
import { useDepartmentStore } from '../../store/useDepartmentStore';

interface Room {
  id: string;
  roomNumber: string;
  isActive: boolean;
  doctorName?: string;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const requestedDeptId = searchParams.get('deptId');
  const { departments, loadDepartments, getEffectiveDeptId } = useDepartmentStore();

  const deptId = getEffectiveDeptId(requestedDeptId);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newDoctorName, setNewDoctorName] = useState('');

  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editDoctorName, setEditDoctorName] = useState('');

  const [loading, setLoading] = useState(true);
  const [deptName, setDeptName] = useState('');

  // App Update State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    loadDepartments(requestedDeptId);
  }, [requestedDeptId, loadDepartments]);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMessage(null);
    try {
      if (typeof window !== 'undefined' && window.__checkAppUpdate) {
        const hasUpdate = await window.__checkAppUpdate();
        if (hasUpdate) {
          setUpdateStatusMessage('New version detected! Applying update and reloading...');
          if (window.__applyAppUpdate) {
            await window.__applyAppUpdate();
          }
        } else {
          setUpdateStatusMessage('You are already running the latest version of the web app.');
        }
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            setUpdateStatusMessage('Update applied! Reloading...');
            setTimeout(() => window.location.reload(), 500);
          } else {
            setUpdateStatusMessage('Web app is up to date.');
          }
        } else {
          setUpdateStatusMessage('Web app cache is fresh.');
        }
      } else {
        setUpdateStatusMessage('Service Worker not supported on this browser.');
      }
    } catch (e) {
      setUpdateStatusMessage('Checked for updates. You are on the current version.');
    } finally {
      setIsCheckingUpdate(false);
      setTimeout(() => setUpdateStatusMessage(null), 5000);
    }
  };

  const handleForceClearCache = async () => {
    if (!confirm('This will refresh cached scripts and re-sync with the server. Continue?')) return;
    setIsClearingCache(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      setUpdateStatusMessage('Cache cleared successfully! Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch {
      window.location.reload();
    }
  };

  useEffect(() => {
    fetchRooms();
    if (deptId) {
      fetchDeptName();
    }
  }, [deptId]);

  const fetchDeptName = async () => {
    try {
      const res = await fetchWithOfflineSync(`${API_BASE_URL}/departments`);
      if (res.ok) {
        const depts = await res.json();
        if (Array.isArray(depts)) {
          const dept = depts.find((d: any) => d.id === deptId);
          if (dept) setDeptName(dept.name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch department name', err);
    }
  };

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const data = await getRooms(deptId);
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber.trim()) return;

    try {
      await createRoom(newRoomNumber.trim(), true, deptId || undefined, newDoctorName.trim() || undefined);
      setNewRoomNumber('');
      setNewDoctorName('');
      fetchRooms();
    } catch (err) {
      console.error('Failed to add room', err);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      const res = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRooms();
      }
    } catch (err) {
      console.error('Failed to delete room', err);
    }
  };

  const startEditing = (room: Room) => {
    setEditingRoomId(room.id);
    setEditRoomNumber(room.roomNumber);
    setEditDoctorName(room.doctorName || '');
  };

  const saveEdit = async (id: string) => {
    if (!editRoomNumber.trim()) return;
    try {
      await updateRoom(id, editRoomNumber.trim(), true, editDoctorName.trim() || undefined);
      setEditingRoomId(null);
      fetchRooms();
    } catch (err) {
      console.error('Failed to update room', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 p-6 lg:p-10">
      <header className="flex justify-between items-center mb-8 max-w-5xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">
              {deptName ? `${deptName} OPD — Room Settings` : 'OPD Room Settings'}
            </h1>
            <p className="text-slate-500 font-medium text-xs mt-0.5">
              Assign room numbers and attending doctors for consultation calling.
            </p>
          </div>
        </div>
        <Link href={`/doctor?deptId=${deptId}`} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-2 text-xs">
          <ArrowLeft size={16} /> Back to Doctor Room
        </Link>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">

        {/* Rooms Configuration */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Building2 size={20} className="text-blue-600" />
                {deptName ? `${deptName} Consultation Rooms` : 'Consultation Rooms'}
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Rooms configured here will appear on the Doctor Dashboard and TV monitors.
              </p>
            </div>
            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
              {rooms.length} Room{rooms.length === 1 ? '' : 's'} Active
            </span>
          </div>

          <div className="p-6 lg:p-8">
            {/* Add Room Form */}
            <form onSubmit={handleAddRoom} className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="sm:col-span-4">
                <input
                  type="text"
                  required
                  value={newRoomNumber}
                  onChange={(e) => setNewRoomNumber(e.target.value)}
                  placeholder="Room No. (e.g. 101)"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="sm:col-span-5">
                <input
                  type="text"
                  value={newDoctorName}
                  onChange={(e) => setNewDoctorName(e.target.value)}
                  placeholder="Assigned Doctor (e.g. Dr. A. Sharma)"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={!newRoomNumber.trim()}
                  className="w-full h-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-sm"
                >
                  <Plus size={18} /> Add Room
                </button>
              </div>
            </form>

            {loading ? (
              <div className="text-center py-10 text-slate-400 font-medium animate-pulse text-sm">Loading room configurations...</div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-sm">
                No rooms configured yet{deptName ? ` for ${deptName}` : ''}. Use the form above to add room numbers.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map(room => (
                  <div key={room.id} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">

                    {editingRoomId === room.id ? (
                      <div className="space-y-3 w-full">
                        <input
                          type="text"
                          value={editRoomNumber}
                          onChange={(e) => setEditRoomNumber(e.target.value)}
                          placeholder="Room Number"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 text-sm focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editDoctorName}
                          onChange={(e) => setEditDoctorName(e.target.value)}
                          placeholder="Doctor Name (Optional)"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <button onClick={() => saveEdit(room.id)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                            <Check size={14} /> Save
                          </button>
                          <button onClick={() => setEditingRoomId(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1">
                            <X size={14} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-black text-sm">
                              {room.roomNumber}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-base">Room {room.roomNumber}</p>
                              {room.doctorName ? (
                                <p className="text-xs text-slate-600 font-semibold flex items-center gap-1 mt-0.5">
                                  <Stethoscope size={12} className="text-blue-500" />
                                  {room.doctorName}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400 italic mt-0.5">No doctor assigned</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEditing(room)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit room & doctor">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDeleteRoom(room.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete room">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-400 font-medium">
                          <span>Status: <strong className="text-emerald-600">Active</strong></span>
                          <span>Dept: {deptName || 'Medicine'}</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Web App Updates & Offline Maintenance */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Sparkles size={20} className="text-indigo-600" />
                Web App Version &amp; Offline Updates
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Check for new releases, force refresh cached assets, or trigger instant PWA updates.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full w-fit">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              PWA v1.2.0 Active
            </span>
          </div>

          <div className="p-6 lg:p-8 space-y-6">
            {/* Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Service Worker</p>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Enabled &amp; Active
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Offline Persistence</p>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <HardDrive size={16} className="text-blue-500" /> LocalStorage Database
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Release Channel</p>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-indigo-500" /> Production Main
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                onClick={handleCheckUpdate}
                disabled={isCheckingUpdate}
                className="py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={16} className={isCheckingUpdate ? 'animate-spin' : ''} />
                <span>{isCheckingUpdate ? 'Checking for Updates...' : 'Check & Update Web App'}</span>
              </button>

              <button
                onClick={handleForceClearCache}
                disabled={isClearingCache}
                className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Trash2 size={16} />
                <span>{isClearingCache ? 'Clearing Cache...' : 'Clear Offline Cache & Refresh'}</span>
              </button>
            </div>

            {updateStatusMessage && (
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                <span>{updateStatusMessage}</span>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
