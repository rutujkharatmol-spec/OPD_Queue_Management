"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Home, Users, LogOut, CheckCircle, Clock, PauseCircle,
  PhoneOff, AlertTriangle, UserPlus, Settings, Bell, BarChart2, Stethoscope, ArrowRight,
  Plus, Trash2, Edit2, Check, X, Building2, SkipForward, Sliders, RotateCcw, Minus,
  CheckCircle2, GripVertical, UserCheck, CornerDownRight, Sparkles, Zap, ListOrdered,
  Play, ShieldCheck, Eye, Layers, LayoutGrid
} from 'lucide-react';
import {
  API_BASE_URL, callNextPatient, markTokenAction, recallPatient,
  getRooms, createRoom, updateRoom, deleteRoom
} from '../../lib/api';
import { useQueueStore } from '../../store/useQueueStore';
import { useSearchParams } from 'next/navigation';
import { useDepartmentStore } from '../../store/useDepartmentStore';
import {
  getStoredPassCount,
  setStoredPassCount,
  resetStoredPassCount,
  DEFAULT_PASS_COUNT
} from '../../lib/queueSettings';
import {
  getAllRoomStagedQueues,
  addTokenToRoomQueue,
  removeTokenFromRoomQueue,
  getAutoCallRooms,
  setAutoCallRoom
} from '../../lib/roomQueueSettings';
import {
  UiVisibilitySettings,
  DEFAULT_UI_SETTINGS,
  getUiVisibilitySettings,
  setUiVisibilitySettings,
  resetUiVisibilitySettings
} from '../../lib/uiSettings';

interface Room {
  id: string;
  roomNumber: string;
  isActive: boolean;
  doctorName?: string;
}

/** Stable fallback so an empty queue does not produce a new object identity per render. */
const EMPTY_QUEUE = { department: 'Medicine', activeTokens: [], nextTokens: [] as string[] };

export default function DoctorDashboard() {
  const searchParams = useSearchParams();
  const requestedDeptId = searchParams.get('deptId');
  // Narrow selectors: destructuring the store subscribed this component to every field.
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);
  const getEffectiveDeptId = useDepartmentStore((state) => state.getEffectiveDeptId);

  const deptId = getEffectiveDeptId(requestedDeptId);

  const queueData = useQueueStore((state) => state.liveQueues[deptId]) || EMPTY_QUEUE;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [callingRoom, setCallingRoom] = useState<string | null>(null);
  const [recallingRoom, setRecallingRoom] = useState<string | null>(null);
  const [recallSuccessRoom, setRecallSuccessRoom] = useState<string | null>(null);

  // UI Visibility State (Show/Hide checkboxes)
  const [uiSettings, setUiSettings] = useState<UiVisibilitySettings>(DEFAULT_UI_SETTINGS);
  const [isShowUiModalOpen, setIsShowUiModalOpen] = useState(false);

  // Room Staged Queue & Auto-Call State
  const [roomStagedQueues, setRoomStagedQueues] = useState<Record<string, string[]>>({});
  const [autoCallRooms, setAutoCallRooms] = useState<Record<string, boolean>>({});

  // Drag and Drop Queue State
  const [draggingToken, setDraggingToken] = useState<string | null>(null);
  const [dragOverRoom, setDragOverRoom] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'CALL_NOW' | 'STAGE_QUEUE' | null>(null);
  const [quickAssignToken, setQuickAssignToken] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Pass (+N) Queue Step State
  const [passCount, setPassCount] = useState(DEFAULT_PASS_COUNT);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passInputVal, setPassInputVal] = useState(String(DEFAULT_PASS_COUNT));
  const [passSuccessMessage, setPassSuccessMessage] = useState<string | null>(null);

  // Room Management Popup State
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newDoctorName, setNewDoctorName] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editDoctorName, setEditDoctorName] = useState('');

  /**
   * Which room a waiting token is staged for, indexed once per change.
   *
   * The sidebar asked this question per waiting token, and answering it walked every
   * room's staged list and re-normalised every entry — O(waiting x staged) string
   * allocations on each of the 24 renders a minute the queue poll can produce. One
   * pass over the staged lists builds the whole index instead.
   */
  const stagedRoomByToken = useMemo(() => {
    const index = new Map<string, string>();
    for (const room of Object.keys(roomStagedQueues)) {
      for (const staged of roomStagedQueues[room] || []) {
        const clean = staged.replace(' 🚨', '').trim();
        // First room wins, matching the original `for…return` scan order.
        if (!index.has(clean)) index.set(clean, room);
      }
    }
    return index;
  }, [roomStagedQueues]);

  /** Active patient per room, so each room card is a lookup rather than a linear scan. */
  const activeByRoom = useMemo(() => {
    const index = new Map<string, any>();
    for (const token of queueData.activeTokens || []) {
      // First match wins, exactly as `Array.prototype.find` did.
      if (!index.has(token.room)) index.set(token.room, token);
    }
    return index;
  }, [queueData.activeTokens]);

  /**
   * Deferred UI resets, tracked so they can be cancelled.
   *
   * Every one of these timers used to outlive the component and fire a state update on
   * an unmounted tree. The toast also keeps a single slot, so a second message is no
   * longer cut short by the first message's expiry.
   */
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }, []);

  const showToast = useCallback((message: string, ms: number) => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastMessage(null);
    }, ms);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const refreshRoomSettings = useCallback(() => {
    setRoomStagedQueues(getAllRoomStagedQueues(deptId));
    setAutoCallRooms(getAutoCallRooms(deptId));
    setUiSettings(getUiVisibilitySettings());
  }, [deptId]);

  useEffect(() => {
    loadDepartments(requestedDeptId);
    const count = getStoredPassCount();
    setPassCount(count);
    setPassInputVal(String(count));
    refreshRoomSettings();

    const handleQueuesUpdated = () => refreshRoomSettings();
    const handleUiUpdated = () => setUiSettings(getUiVisibilitySettings());

    window.addEventListener('room-queues-updated', handleQueuesUpdated);
    window.addEventListener('auto-call-updated', handleQueuesUpdated);
    window.addEventListener('opd-ui-visibility-updated', handleUiUpdated);

    return () => {
      window.removeEventListener('room-queues-updated', handleQueuesUpdated);
      window.removeEventListener('auto-call-updated', handleQueuesUpdated);
      window.removeEventListener('opd-ui-visibility-updated', handleUiUpdated);
    };
  }, [requestedDeptId, loadDepartments, deptId, refreshRoomSettings]);

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

  const handleCallNext = async (roomNumber: string, specificToken?: string) => {
    setCallingRoom(roomNumber);
    try {
      // If no specificToken passed, check if this room has a staged token
      const currentStaged = roomStagedQueues[roomNumber] || [];
      const tokenToCall = specificToken || (currentStaged.length > 0 ? currentStaged[0] : undefined);
      const cleanToken = tokenToCall ? tokenToCall.replace(' 🚨', '').trim() : undefined;

      const called = await callNextPatient(deptId, roomNumber, cleanToken);
      
      // If a specific/staged token was called, remove it from the staged queue
      if (cleanToken) {
        removeTokenFromRoomQueue(deptId, roomNumber, cleanToken);
        showToast(`Patient ${cleanToken} called into Room ${roomNumber}!`, 3500);
      }
      refreshRoomSettings();
      await useQueueStore.getState().fetchQueue(deptId);
    } catch (err) {
      console.error('Failed to call patient:', err);
      await useQueueStore.getState().fetchQueue(deptId);
    } finally {
      setCallingRoom(null);
    }
  };

  const handleRecall = async (roomNumber: string) => {
    setRecallingRoom(roomNumber);
    try {
      await recallPatient(deptId, roomNumber);
      setRecallSuccessRoom(roomNumber);
      later(() => setRecallSuccessRoom(null), 2500);
      await useQueueStore.getState().fetchQueue(deptId);
    } catch (err) {
      console.error('Failed to recall patient:', err);
      alert('Could not recall patient. Ensure a patient is currently called in this room.');
    } finally {
      setRecallingRoom(null);
    }
  };

  const handleTokenAction = async (tokenId: string, action: 'COMPLETE' | 'ABSENT' | 'NOT_AVAILABLE', roomNumber?: string) => {
    try {
      await markTokenAction(tokenId, action, passCount);
      await useQueueStore.getState().fetchQueue(deptId);

      // Auto-Call trigger: automatically call next patient if enabled for this room
      if (roomNumber && autoCallRooms[roomNumber]) {
        later(() => {
          handleCallNext(roomNumber);
        }, 750);
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to mark token as ${action}`);
    }
  };

  const handleToggleAutoCall = (roomNumber: string) => {
    const newState = !autoCallRooms[roomNumber];
    setAutoCallRoom(deptId, roomNumber, newState);
    setAutoCallRooms((prev) => ({ ...prev, [roomNumber]: newState }));
    showToast(`Auto-Call for Room ${roomNumber} is now ${newState ? 'ENABLED ⚡' : 'DISABLED'}`, 3000);
  };

  const handleAddPatientToRoomQueue = (roomNumber: string, token: string) => {
    addTokenToRoomQueue(deptId, roomNumber, token);
    refreshRoomSettings();
    showToast(`Patient ${token} added to Room ${roomNumber} queue!`, 3000);
  };

  const handleRemoveFromRoomQueue = (roomNumber: string, token: string) => {
    removeTokenFromRoomQueue(deptId, roomNumber, token);
    refreshRoomSettings();
  };

  const handleToggleUiSetting = (key: keyof UiVisibilitySettings) => {
    const updated = setUiVisibilitySettings({
      [key]: !uiSettings[key],
    });
    setUiSettings(updated);
  };

  const handleSavePassCount = (newVal: number) => {
    const valid = Math.max(1, Math.min(50, Math.floor(newVal)));
    setStoredPassCount(valid);
    setPassCount(valid);
    setPassInputVal(String(valid));
    setPassSuccessMessage(`Queue pass count set to +${valid}`);
    later(() => setPassSuccessMessage(null), 3000);
  };

  const handleResetPassCount = () => {
    resetStoredPassCount();
    setPassCount(DEFAULT_PASS_COUNT);
    setPassInputVal(String(DEFAULT_PASS_COUNT));
    setPassSuccessMessage(`Reset back to default (+${DEFAULT_PASS_COUNT})`);
    later(() => setPassSuccessMessage(null), 3000);
  };

  // Which room a token is staged for — an index lookup, see `stagedRoomByToken` above.
  const getStagedRoomForToken = (tokenStr: string): string | null =>
    stagedRoomByToken.get(tokenStr.replace(' 🚨', '').trim()) ?? null;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-slate-100 font-sans">

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-blue-500/40 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <Sparkles size={16} />
          </div>
          <p className="font-bold text-xs">{toastMessage}</p>
        </div>
      )}

      {/* Sidebar - Waiting Queue List with Room Badges & Drag/Drop (Toggleable via Show UI) */}
      {uiSettings.showQueueSidebar && (
        <aside className="w-full lg:w-[420px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shadow-sm flex flex-col z-20 order-2 lg:order-1 h-[50vh] lg:h-screen animate-in fade-in duration-200">
          <div className="p-6 border-b border-slate-800 bg-slate-950 text-white flex justify-between items-center sticky top-0 z-10">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <h2 className="text-lg font-black tracking-wide uppercase">
                  {queueData.department || 'Medicine'} Queue
                </h2>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-blue-300 text-xs font-semibold">
                  {queueData.nextTokens.length} Patients in Waiting Line
                </p>
              </div>
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
                className="p-2.5 bg-slate-800 rounded-xl hover:bg-blue-600 transition-colors text-slate-300 hover:text-white cursor-pointer"
                title="Add / Configure Rooms"
              >
                <Settings size={18} />
              </button>
              <button
                onClick={() => setIsShowUiModalOpen(true)}
                className="p-2.5 bg-slate-800 rounded-xl hover:bg-blue-600 transition-colors text-slate-300 hover:text-white cursor-pointer"
                title="Show UI / Customize View"
              >
                <Eye size={18} />
              </button>
            </div>
          </div>

          {/* Drag Hint Banner */}
          {queueData.nextTokens.length > 0 && (
            <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between text-[11px] text-blue-950 font-bold">
              <span className="flex items-center gap-1.5">
                <GripVertical size={14} className="text-blue-600 shrink-0" />
                <span>Drag patient to Call Now or Add to Room Queue</span>
              </span>
              <span className="text-[10px] text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full font-black uppercase">
                Drag &amp; Drop
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
            {queueData.nextTokens.map((tokenStr, idx) => {
              const isEmergency = tokenStr.includes('🚨');
              const token = tokenStr.replace(' 🚨', '');
              const isThisDragging = draggingToken === tokenStr;
              const stagedRoom = getStagedRoomForToken(tokenStr);

              return (
                <div
                  // Keyed by token, not index: when the head of the queue is called, an
                  // index key makes React rewrite every remaining row instead of
                  // dropping one and reusing the rest.
                  key={tokenStr}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', tokenStr);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingToken(tokenStr);
                  }}
                  onDragEnd={() => {
                    setDraggingToken(null);
                    setDragOverRoom(null);
                    setDragOverZone(null);
                  }}
                  className={`p-4 rounded-2xl border transition-all duration-200 cursor-grab active:cursor-grabbing select-none group relative ${
                    isThisDragging
                      ? 'opacity-40 border-blue-500 bg-blue-50 scale-95 shadow-inner'
                      : stagedRoom
                        ? 'border-indigo-300 bg-indigo-50/70 text-indigo-950 hover:shadow-md'
                        : isEmergency
                          ? 'border-red-200 bg-red-50/70 text-red-950 hover:shadow-md hover:border-red-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:shadow-md hover:border-blue-300'
                  }`}
                  title="Drag this token into any room to call immediately or stage for that room"
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md text-slate-300 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
                        <GripVertical size={16} />
                      </div>
                      <span className="text-xl font-black tracking-tight">{token}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Staged Room Badge */}
                      {stagedRoom && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-600 text-white shadow-xs flex items-center gap-1 animate-in fade-in">
                          <ListOrdered size={10} /> Room {stagedRoom} Queue
                        </span>
                      )}

                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isEmergency ? 'bg-red-200 text-red-800 animate-pulse' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Clock size={11} /> #{idx + 1}
                      </span>

                      {/* Quick Assign / Action Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuickAssignToken(tokenStr);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        title={`Assign ${token} to a specific room or queue`}
                      >
                        <CornerDownRight size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isEmergency ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                      <span className="font-bold opacity-75 uppercase tracking-wider text-[10px]">
                        {isEmergency ? '🚨 Emergency Priority' : 'Normal Queue'}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Drag to room ➔
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
      )}

      {/* Main Content - Active Consultation Rooms */}
      <main className="flex-1 flex flex-col relative overflow-hidden order-1 lg:order-2 h-[50vh] lg:h-screen w-full transition-all">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 lg:p-8 bg-white border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Consultation Rooms</h1>
              <span className="text-xs font-black bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase">
                {queueData.department || 'Medicine'} OPD
              </span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-1">
              Toggle Auto-Call for zero-touch consultations, or queue specific patients per room.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* If sidebar is hidden, show quick Restore Sidebar button */}
            {!uiSettings.showQueueSidebar && (
              <button
                type="button"
                onClick={() => handleToggleUiSetting('showQueueSidebar')}
                className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                title="Show waiting line queue sidebar"
              >
                <Users size={14} className="text-blue-600" />
                <span>Show Queue</span>
              </button>
            )}

            {/* Quick Show UI Trigger Button */}
            <button
              type="button"
              onClick={() => setIsShowUiModalOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300/80 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              title="Customize UI visibility checkboxes"
            >
              <Eye size={14} className="text-blue-600" />
              <span>Show UI</span>
            </button>

            {/* Quick Pass (+N) Editable Pill */}
            {uiSettings.showQuickActions && (
              <>
                <button
                  onClick={() => {
                    setPassInputVal(String(passCount));
                    setIsPassModalOpen(true);
                  }}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 hover:border-amber-300 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  title="Click to edit Pass (+N) queue number"
                >
                  <SkipForward size={14} className="text-amber-600" />
                  <span>Pass: <strong className="text-amber-700 font-black">+{passCount}</strong></span>
                  <Edit2 size={11} className="text-amber-500 opacity-75" />
                </button>

                <Link
                  href={`/analytics?deptId=${deptId}`}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 border border-blue-200"
                >
                  <BarChart2 size={16} />
                  <span>OPD Metrics</span>
                </Link>
              </>
            )}

            <button
              onClick={() => setIsRoomModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              <span>+ Add / Manage Rooms</span>
            </button>
          </div>
        </header>

        {/* Rooms Grid */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {rooms.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">
                <Settings size={44} className="mb-3 text-slate-300" />
                <p className="font-bold text-slate-800 text-base mb-1">No Rooms Configured</p>
                <p className="text-xs text-slate-400 mb-6">Add consultation rooms to start calling patients in this department.</p>
                <button
                  onClick={() => setIsRoomModalOpen(true)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
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
                const isOver = dragOverRoom === room.roomNumber;
                const activePatient = activeByRoom.get(room.roomNumber);
                const isAutoCallOn = Boolean(autoCallRooms[room.roomNumber]);
                const stagedList = roomStagedQueues[room.roomNumber] || [];

                return (
                  <div
                    key={room.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverRoom !== room.roomNumber) {
                        setDragOverRoom(room.roomNumber);
                      }
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragOverRoom(room.roomNumber);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverRoom(null);
                        setDragOverZone(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedToken = e.dataTransfer.getData('text/plain') || draggingToken;
                      if (droppedToken) {
                        if (dragOverZone === 'STAGE_QUEUE' || activePatient) {
                          handleAddPatientToRoomQueue(room.roomNumber, droppedToken);
                        } else {
                          handleCallNext(room.roomNumber, droppedToken);
                        }
                      }
                      setDragOverRoom(null);
                      setDragOverZone(null);
                      setDraggingToken(null);
                    }}
                    className={`bg-white rounded-3xl p-6 flex flex-col h-full relative overflow-hidden transition-all duration-200 ${
                      isOver
                        ? 'border-2 border-blue-500 bg-blue-50/60 ring-4 ring-blue-500/25 shadow-2xl scale-[1.02]'
                        : draggingToken
                          ? 'border-2 border-dashed border-blue-400/80 bg-white/90 shadow-md ring-2 ring-blue-500/10'
                          : 'shadow-sm border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Room Top Bar */}
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 font-black px-3.5 py-1 rounded-xl text-sm">
                            Room {room.roomNumber}
                          </div>

                          {/* Auto-Call Toggle Switch Button (Toggleable via Show UI) */}
                          {uiSettings.showAutoCallToggle && (
                            <button
                              type="button"
                              onClick={() => handleToggleAutoCall(room.roomNumber)}
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                                isAutoCallOn
                                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm shadow-emerald-500/30'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                              }`}
                              title={isAutoCallOn ? 'Auto-Call is ACTIVE: Automatically calls next patient when room is free' : 'Click to enable Auto-Call for this room'}
                            >
                              <Zap size={12} className={isAutoCallOn ? 'fill-white text-white animate-pulse' : 'text-slate-400'} />
                              <span>Auto-Call {isAutoCallOn ? 'ON' : 'OFF'}</span>
                            </button>
                          )}
                        </div>

                        {/* Doctor Name Badge (Toggleable via Show UI) */}
                        {uiSettings.showDoctorNames && room.doctorName && (
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
                        className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm ${
                          isRecallSuccess
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
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-4 flex flex-col justify-center items-center text-center">
                      {activePatient ? (
                        <>
                          <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 mb-1">
                            Currently In Room
                          </span>
                          <span className="text-3xl font-black text-slate-900 tracking-tight my-0.5">
                            {activePatient.token}
                          </span>
                          <p className="text-xs font-bold text-slate-700 mt-0.5">{activePatient.patientName}</p>
                          {activePatient.uhid && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              UHID: {activePatient.uhid}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Users size={28} className="text-slate-300 mb-1.5" />
                          <p className="text-xs font-bold text-slate-600">Room Free &amp; Ready</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {isAutoCallOn ? '⚡ Auto-Call active: ready for next patient' : "Click 'Call Next' or drag a patient here"}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Room-Specific Dedicated Staged Queue Area (Toggleable via Show UI) */}
                    {uiSettings.showRoomStagedQueue && (
                      <div
                        onDragEnter={(e) => {
                          e.stopPropagation();
                          setDragOverZone('STAGE_QUEUE');
                        }}
                        className={`mb-4 p-3 rounded-2xl border transition-all ${
                          dragOverZone === 'STAGE_QUEUE' && isOver
                            ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-400/30'
                            : stagedList.length > 0
                              ? 'bg-indigo-50/60 border-indigo-200/80'
                              : 'bg-slate-50/60 border-slate-200 border-dashed'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                            <ListOrdered size={13} className="text-indigo-600" />
                            Room {room.roomNumber} Staged Queue ({stagedList.length})
                          </span>
                          {stagedList.length > 0 && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                              Next in line
                            </span>
                          )}
                        </div>

                        {stagedList.length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic">
                            {draggingToken ? 'Drop here to queue specifically for this room' : 'No room-specific patients queued (will pull from general line)'}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {stagedList.map((tokenStr, idx) => {
                              const tok = tokenStr.replace(' 🚨', '');
                              return (
                                <div
                                  key={tok}
                                  className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-950 font-black text-xs px-2.5 py-1 rounded-xl shadow-xs"
                                >
                                  <span className="text-[10px] text-indigo-500 font-mono">#{idx + 1}</span>
                                  <span>{tok}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCallNext(room.roomNumber, tokenStr)}
                                    className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-md transition-colors"
                                    title="Call this staged patient now"
                                  >
                                    <Play size={11} className="fill-emerald-600" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromRoomQueue(room.roomNumber, tokenStr)}
                                    className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                                    title="Remove from room queue"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2 mt-auto pt-3 border-t border-slate-100">
                      <button
                        onClick={() => {
                          const targetTok = stagedList.length > 0 ? stagedList[0] : undefined;
                          handleCallNext(room.roomNumber, targetTok);
                        }}
                        disabled={isCalling}
                        className={`w-full py-3 rounded-2xl font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          stagedList.length > 0
                            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-indigo-500/20'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20'
                        }`}
                      >
                        {isCalling ? <AlertTriangle size={16} className="animate-spin" /> : <UserPlus size={16} />}
                        <span>
                          {isCalling
                            ? 'Calling...'
                            : stagedList.length > 0
                              ? `Call Staged: ${stagedList[0].replace(' 🚨', '')} (${stagedList.length} queued)`
                              : queueData.nextTokens.length === 0
                                ? 'Call Next Patient (Queue 0)'
                                : 'Call Next Patient'}
                        </span>
                      </button>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleTokenAction(activePatient.id, 'COMPLETE', room.roomNumber)}
                          disabled={!activePatient}
                          className="py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Complete {isAutoCallOn ? '⚡' : ''}
                        </button>
                        
                        {/* Dynamic Configurable Pass (+N) Button */}
                        <button
                          onClick={() => handleTokenAction(activePatient.id, 'NOT_AVAILABLE', room.roomNumber)}
                          disabled={!activePatient}
                          className="w-full py-2.5 rounded-xl bg-amber-50 text-amber-800 font-bold text-xs hover:bg-amber-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-center cursor-pointer flex items-center justify-center gap-1"
                          title={`Patient stepped away (Push +${passCount} spots back in queue)`}
                        >
                          <span>Pass (+{passCount})</span>
                        </button>

                        <button
                          onClick={() => handleTokenAction(activePatient.id, 'ABSENT', room.roomNumber)}
                          disabled={!activePatient}
                          className="py-2.5 rounded-xl bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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

      {/* Show UI Customization Modal */}
      {isShowUiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative flex flex-col text-white">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Eye size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Show UI Sections</h2>
                  <p className="text-xs text-slate-400">Uncheck to hide unwanted UI sections.</p>
                </div>
              </div>
              <button
                onClick={() => setIsShowUiModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Checkbox Items */}
            <div className="py-5 space-y-2.5 max-h-80 overflow-y-auto pr-1">
              
              {/* 1. Waiting Queue Sidebar */}
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group">
                <input
                  type="checkbox"
                  checked={uiSettings.showQueueSidebar}
                  onChange={() => handleToggleUiSetting('showQueueSidebar')}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                    <Users size={13} className="text-blue-400" />
                    Waiting Line Queue Sidebar
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Uncheck to hide the left waiting queue. Consultation rooms will expand to 100% full width.
                  </p>
                </div>
              </label>

              {/* 2. Room Staged Queues */}
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group">
                <input
                  type="checkbox"
                  checked={uiSettings.showRoomStagedQueue}
                  onChange={() => handleToggleUiSetting('showRoomStagedQueue')}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                    <LayoutGrid size={13} className="text-indigo-400" />
                    Room Staged Patient Queues
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Uncheck to hide the dedicated upcoming patient staging strip inside room cards.
                  </p>
                </div>
              </label>

              {/* 3. Auto-Call Controls */}
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group">
                <input
                  type="checkbox"
                  checked={uiSettings.showAutoCallToggle}
                  onChange={() => handleToggleUiSetting('showAutoCallToggle')}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                    <Zap size={13} className="text-emerald-400" />
                    Auto-Call ⚡ Toggle Buttons
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Show or hide the Auto-Call switch button on room headers.
                  </p>
                </div>
              </label>

              {/* 4. Doctor Names & Badges */}
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group">
                <input
                  type="checkbox"
                  checked={uiSettings.showDoctorNames}
                  onChange={() => handleToggleUiSetting('showDoctorNames')}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                    <Stethoscope size={13} className="text-blue-400" />
                    Doctor Names &amp; Badges
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Show assigned doctor names underneath room numbers.
                  </p>
                </div>
              </label>

              {/* 5. Header Quick Actions & Metrics */}
              <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group">
                <input
                  type="checkbox"
                  checked={uiSettings.showQuickActions}
                  onChange={() => handleToggleUiSetting('showQuickActions')}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-400" />
                    Header Actions &amp; Pass (+N) Pill
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Show the Pass (+N) config pill and OPD Metrics link in header.
                  </p>
                </div>
              </label>

            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const res = resetUiVisibilitySettings();
                  setUiSettings(res);
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} /> Reset All
              </button>

              <button
                type="button"
                onClick={() => setIsShowUiModalOpen(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick-Assign Token to Room Modal (Click / Touch / Queue Options) */}
      {quickAssignToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative flex flex-col text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">Assign Patient</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Target patient: <span className="text-blue-400 font-bold font-mono">{quickAssignToken}</span>
                </p>
              </div>
              <button
                onClick={() => setQuickAssignToken(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-4 space-y-3 max-h-72 overflow-y-auto">
              {rooms.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No consultation rooms available.</p>
              ) : (
                rooms.map((r) => (
                  <div key={r.id} className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-black text-xs text-white">Room {r.roomNumber}</p>
                        {r.doctorName && <p className="text-[10px] text-slate-400">{r.doctorName}</p>}
                      </div>
                      <span className="text-[10px] text-indigo-400 font-bold">
                        {(roomStagedQueues[r.roomNumber] || []).length} Staged
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => {
                          const tok = quickAssignToken;
                          setQuickAssignToken(null);
                          handleCallNext(r.roomNumber, tok);
                        }}
                        className="py-2 px-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Zap size={13} />
                        <span>Call Now</span>
                      </button>

                      <button
                        onClick={() => {
                          const tok = quickAssignToken;
                          setQuickAssignToken(null);
                          handleAddPatientToRoomQueue(r.roomNumber, tok);
                        }}
                        className="py-2 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <ListOrdered size={13} />
                        <span>Queue Here</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setQuickAssignToken(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Pass (+N) Queue Step Modal Popup */}
      {isPassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative flex flex-col text-white">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <SkipForward size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Edit Queue Pass (+N)</h2>
                  <p className="text-xs text-slate-400">Set how many queue spots skipped patients are moved back.</p>
                </div>
              </div>
              <button
                onClick={() => setIsPassModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Number of Pass Positions (Textbox)
                </label>
                
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(passInputVal, 10) || passCount;
                      const next = Math.max(1, cur - 1);
                      setPassInputVal(String(next));
                      handleSavePassCount(next);
                    }}
                    className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white flex items-center justify-center font-black transition-all cursor-pointer text-base"
                    title="Decrease pass count"
                  >
                    <Minus size={18} />
                  </button>

                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={passInputVal}
                      onChange={(e) => {
                        setPassInputVal(e.target.value);
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 50) {
                          handleSavePassCount(val);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl px-4 py-3 text-center text-2xl font-black text-amber-400 font-mono focus:outline-none transition-all"
                      autoFocus
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(passInputVal, 10) || passCount;
                      const next = Math.min(50, cur + 1);
                      setPassInputVal(String(next));
                      handleSavePassCount(next);
                    }}
                    className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white flex items-center justify-center font-black transition-all cursor-pointer text-base"
                    title="Increase pass count"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Presets</p>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleSavePassCount(num)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        passCount === num
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      +{num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Button Preview */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Button preview in room:</span>
                <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 font-black text-xs">
                  Pass (+{passCount})
                </span>
              </div>

              {passSuccessMessage && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>{passSuccessMessage}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetPassCount}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} /> Reset to Default (+{DEFAULT_PASS_COUNT})
              </button>

              <button
                type="button"
                onClick={() => setIsPassModalOpen(false)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

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
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
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
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Check size={12} /> Save
                              </button>
                              <button
                                onClick={() => setEditingRoomId(null)}
                                className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
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
                                className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteRoom(r.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
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
