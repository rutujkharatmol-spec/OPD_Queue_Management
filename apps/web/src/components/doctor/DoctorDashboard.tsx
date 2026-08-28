"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Home, Users, LogOut, CheckCircle, Clock, PauseCircle,
  PhoneOff, AlertTriangle, UserPlus, Settings, Bell, BarChart2, Stethoscope, ArrowRight,
  Plus, Trash2, Edit2, Check, X, Building2, SkipForward, Sliders, RotateCcw, Minus,
  CheckCircle2, GripVertical, UserCheck, CornerDownRight, Sparkles, Zap, ListOrdered,
  Play, ShieldCheck, Eye, Layers, LayoutGrid, ArrowRightLeft, ArrowLeftCircle, Undo2, Search, Hash
} from 'lucide-react';
import {
  API_BASE_URL, callNextPatient, markTokenAction, recallPatient,
  getRooms, createRoom, updateRoom, deleteRoom, searchTokens, generateToken
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
  addMultipleTokensToRoomQueue,
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

/**
 * Expands a token input string into individual token strings.
 * Supports:
 *  - Single tokens: "13"
 *  - Comma/space separated: "13, 14, 15" or "13 14 15"
 *  - Numeric ranges: "1-100" → ["1","2",...,"100"]
 *  - Mixed: "1-5, 10, 20-25" → ["1","2","3","4","5","10","20","21","22","23","24","25"]
 *  - Non-numeric tokens pass through as-is: "MED-01" stays "MED-01"
 */
function expandTokenInput(raw: string): string[] {
  const parts = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const result: string[] = [];
  for (const part of parts) {
    // Check if it's a pure numeric range like "1-100" (both sides must be integers)
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start && (end - start) <= 999) {
        for (let i = start; i <= end; i++) {
          result.push(String(i));
        }
        continue;
      }
    }
    // Not a range — use as-is (handles "MED-01" style tokens)
    result.push(part);
  }
  return result;
}

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
  const [draggingActiveToken, setDraggingActiveToken] = useState<{ token: string; tokenId: string; fromRoom: string; patientName?: string } | null>(null);
  const [isOverQueueSidebar, setIsOverQueueSidebar] = useState(false);
  const [dragOverRoom, setDragOverRoom] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'CALL_NOW' | 'STAGE_QUEUE' | null>(null);
  const [quickAssignToken, setQuickAssignToken] = useState<string | null>(null);
  const [transferModalToken, setTransferModalToken] = useState<{ token: string; tokenId: string; fromRoom: string; patientName?: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Patient Directly to Waiting Line State
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [addPatientName, setAddPatientName] = useState('');
  const [addPatientPhone, setAddPatientPhone] = useState('');
  const [addPatientUhid, setAddPatientUhid] = useState('');
  const [addPatientPriority, setAddPatientPriority] = useState<'NORMAL' | 'SENIOR' | 'EMERGENCY'>('NORMAL');
  const [addPatientCustomToken, setAddPatientCustomToken] = useState('');
  const [addPatientDestination, setAddPatientDestination] = useState<string>('WAITING_LINE');
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [addPatientError, setAddPatientError] = useState<string | null>(null);

  const resetAddPatientForm = useCallback(() => {
    setAddPatientName('');
    setAddPatientPhone('');
    setAddPatientUhid('');
    setAddPatientPriority('NORMAL');
    setAddPatientCustomToken('');
    setAddPatientDestination('WAITING_LINE');
    setAddPatientError(null);
  }, []);

  // Quick Token (Token Number Only) State
  const [isQuickTokenModalOpen, setIsQuickTokenModalOpen] = useState(false);
  const [quickTokenVal, setQuickTokenVal] = useState('');
  const [quickTokenPriority, setQuickTokenPriority] = useState<'NORMAL' | 'SENIOR' | 'EMERGENCY'>('NORMAL');
  const [quickTokenDestination, setQuickTokenDestination] = useState<string>('WAITING_LINE');
  const [isQuickAddingToken, setIsQuickAddingToken] = useState(false);
  const [quickTokenError, setQuickTokenError] = useState<string | null>(null);
  const [sidebarQuickToken, setSidebarQuickToken] = useState('');
  const [sidebarQuickEmergency, setSidebarQuickEmergency] = useState(false);
  const [isSidebarQuickAdding, setIsSidebarQuickAdding] = useState(false);

  const resetQuickTokenForm = useCallback(() => {
    setQuickTokenVal('');
    setQuickTokenPriority('NORMAL');
    setQuickTokenDestination('WAITING_LINE');
    setQuickTokenError(null);
  }, []);

  // Direct Token Entry into Free Room State
  const [directInputRoom, setDirectInputRoom] = useState<string | null>(null);
  const [directTokenVal, setDirectTokenVal] = useState<string>('');

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

  // Search Token in Doctor Dashboard
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [dbSearchResults, setDbSearchResults] = useState<any[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  /** Filtered waiting line tokens based on search query */
  const filteredNextTokens = useMemo(() => {
    const query = tokenSearchQuery.trim().toLowerCase();
    if (!query) return queueData.nextTokens || [];
    return (queueData.nextTokens || []).filter((t) => {
      const clean = t.replace(' 🚨', '').trim().toLowerCase();
      return clean.includes(query);
    });
  }, [queueData.nextTokens, tokenSearchQuery]);

  /** Async lookup from database if searching for tokens / patients */
  useEffect(() => {
    const query = tokenSearchQuery.trim();
    if (!query || query.length < 1) {
      setDbSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingDb(true);
      try {
        const results = await searchTokens(query, deptId);
        setDbSearchResults(Array.isArray(results) ? results : []);
      } catch {
        setDbSearchResults([]);
      } finally {
        setIsSearchingDb(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [tokenSearchQuery, deptId]);

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

  /** Active patients per room, so each room card can display all serving patients. */
  const activePatientsByRoom = useMemo(() => {
    const index = new Map<string, any[]>();
    for (const token of queueData.activeTokens || []) {
      const roomKey = token.room || '101';
      const list = index.get(roomKey) || [];
      list.push(token);
      index.set(roomKey, list);
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

    // Cross-tab sync: the `storage` event fires when *another* tab writes to
    // localStorage. The Registration Desk staging bulk tokens into a room queue
    // updates localStorage but its CustomEvent only reaches listeners in the
    // same tab.  Listening for `storage` lets the Doctor Dashboard (typically
    // open in a second tab) pick up those changes immediately.
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (e.key.startsWith('opd_room_staged_queue_') || e.key.startsWith('opd_auto_call_rooms_'))) {
        refreshRoomSettings();
      }
    };

    window.addEventListener('room-queues-updated', handleQueuesUpdated);
    window.addEventListener('auto-call-updated', handleQueuesUpdated);
    window.addEventListener('opd-ui-visibility-updated', handleUiUpdated);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('room-queues-updated', handleQueuesUpdated);
      window.removeEventListener('auto-call-updated', handleQueuesUpdated);
      window.removeEventListener('opd-ui-visibility-updated', handleUiUpdated);
      window.removeEventListener('storage', handleStorageChange);
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

  /** Handles adding a patient directly to the waiting line from the Doctor Room page */
  const handleAddPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingPatient(true);
    setAddPatientError(null);

    try {
      const trimmedName = addPatientName.trim();
      const nameParts = trimmedName ? trimmedName.split(' ') : [];
      const firstName = nameParts[0] || (addPatientCustomToken.trim() ? `Patient #${addPatientCustomToken.trim()}` : 'Walk-in Patient');
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const phone = addPatientPhone.trim();
      const uhid = addPatientUhid.trim();
      const cleanCustomToken = addPatientCustomToken.trim();

      const randomPatientId = crypto.randomUUID();
      const dummyDoctorId = "550e8400-e29b-41d4-a716-446655440000";

      const res = await generateToken(
        deptId,
        randomPatientId,
        dummyDoctorId,
        addPatientPriority,
        {
          firstName,
          lastName,
          phone: phone || undefined,
          uhid: uhid || undefined
        },
        cleanCustomToken || undefined,
        1
      );

      const tokensArray = res.tokens || (Array.isArray(res) ? res : [res]);
      const createdTokenObj = tokensArray[0] || res;
      const createdTokenNum: string = createdTokenObj?.tokenNumber || cleanCustomToken || 'Token';

      await useQueueStore.getState().fetchQueue(deptId);

      // Handle destination routing
      if (addPatientDestination.startsWith('ROOM_QUEUE:')) {
        const targetRoom = addPatientDestination.replace('ROOM_QUEUE:', '');
        addTokenToRoomQueue(deptId, targetRoom, createdTokenNum);
        refreshRoomSettings();
        showToast(`Patient ${createdTokenNum} added and queued for Room ${targetRoom}!`, 4000);
      } else if (addPatientDestination.startsWith('CALL_NOW:')) {
        const targetRoom = addPatientDestination.replace('CALL_NOW:', '');
        await handleCallNext(targetRoom, createdTokenNum);
        showToast(`Patient ${createdTokenNum} called directly in Room ${targetRoom}!`, 4000);
      } else {
        showToast(`Patient ${createdTokenNum} added directly to waiting line!`, 4000);
      }

      setIsAddPatientModalOpen(false);
      resetAddPatientForm();
    } catch (err: any) {
      console.error('Failed to add patient to waiting line:', err);
      setAddPatientError(err?.message || 'Failed to add patient. Please try again.');
    } finally {
      setIsAddingPatient(false);
    }
  };

  /** Quick add token number only (no patient name / details required) */
  const handleQuickAddToken = async (
    tokenNumber: string,
    priority: 'NORMAL' | 'SENIOR' | 'EMERGENCY' = 'NORMAL',
    destination: string = 'WAITING_LINE'
  ) => {
    const clean = tokenNumber.replace(' 🚨', '').trim().toUpperCase();
    if (!clean) return;

    try {
      const randomPatientId = crypto.randomUUID();
      const dummyDoctorId = "550e8400-e29b-41d4-a716-446655440000";

      await generateToken(
        deptId,
        randomPatientId,
        dummyDoctorId,
        priority,
        {
          firstName: `Patient #${clean}`,
        },
        clean,
        1
      );

      await useQueueStore.getState().fetchQueue(deptId);

      if (destination.startsWith('ROOM_QUEUE:')) {
        const targetRoom = destination.replace('ROOM_QUEUE:', '');
        addTokenToRoomQueue(deptId, targetRoom, clean);
        refreshRoomSettings();
        showToast(`Token #${clean} added to Room ${targetRoom} queue!`, 3500);
      } else if (destination.startsWith('CALL_NOW:')) {
        const targetRoom = destination.replace('CALL_NOW:', '');
        await handleCallNext(targetRoom, clean);
        showToast(`Token #${clean} called directly in Room ${targetRoom}!`, 3500);
      } else {
        showToast(`Token #${clean} added directly to waiting line!`, 3500);
      }
    } catch (err: any) {
      console.error('Failed to quick add token:', err);
      throw err;
    }
  };

  /** Deletes / cancels a token directly from the waiting queue (Instant 1-Click, No Confirmation) */
  const handleDeleteTokenDirect = async (tokenIdentifier: string) => {
    const clean = tokenIdentifier.replace(' 🚨', '').trim();
    if (!clean) return;

    // 1. Instantly remove optimistically from UI state for zero-lag responsiveness
    const currentQueue = useQueueStore.getState().liveQueues[deptId];
    if (currentQueue) {
      useQueueStore.getState().updateQueueData(deptId, {
        ...currentQueue,
        nextTokens: (currentQueue.nextTokens || []).filter(
          (t) => t.replace(' 🚨', '').trim().toLowerCase() !== clean.toLowerCase()
        ),
        activeTokens: (currentQueue.activeTokens || []).filter(
          (t) => t.token.trim().toLowerCase() !== clean.toLowerCase()
        ),
      });
    }

    // Also remove from local search results if present
    setDbSearchResults((prev) =>
      prev.filter((st) => st.tokenNumber?.toLowerCase() !== clean.toLowerCase())
    );

    try {
      // 2. Remove from room staged queue if staged
      const currentStagedRoom = getStagedRoomForToken(tokenIdentifier);
      if (currentStagedRoom) {
        removeTokenFromRoomQueue(deptId, currentStagedRoom, clean);
      }

      // 3. Mark delete in backend / local storage
      await markTokenAction(clean, 'DELETE');
      refreshRoomSettings();
      await useQueueStore.getState().fetchQueue(deptId);
      showToast(`Token #${clean} deleted`, 2500);
    } catch (err: any) {
      console.error('Failed to delete token:', err);
      // If error, re-fetch to restore true state
      await useQueueStore.getState().fetchQueue(deptId);
    }
  };

  /** Ensures a token exists in the database before calling or queuing it */
  const ensureTokenCreated = async (tokenNumber: string, priority: 'NORMAL' | 'SENIOR' | 'EMERGENCY' = 'NORMAL') => {
    const clean = tokenNumber.replace(' 🚨', '').trim();
    if (!clean) return clean;

    const inWaiting = (queueData.nextTokens || []).some(
      (t) => t.replace(' 🚨', '').trim().toLowerCase() === clean.toLowerCase()
    );
    const inActive = (queueData.activeTokens || []).some(
      (t) => t.token.trim().toLowerCase() === clean.toLowerCase()
    );

    if (inWaiting || inActive) return clean;

    try {
      await generateToken(
        deptId,
        undefined,
        undefined,
        priority,
        { firstName: `Patient #${clean}` },
        clean,
        1
      );
      await useQueueStore.getState().fetchQueue(deptId);
    } catch (err: any) {
      console.log('Token created or already existed:', err?.message);
    }
    return clean;
  };

  const handleCallNext = async (roomNumber: string, specificToken?: string) => {
    setCallingRoom(roomNumber);
    try {
      // If no specificToken passed, check if this room has a staged token
      const currentStaged = roomStagedQueues[roomNumber] || [];
      const tokenToCall = specificToken || (currentStaged.length > 0 ? currentStaged[0] : undefined);
      const cleanToken = tokenToCall ? tokenToCall.replace(' 🚨', '').trim() : undefined;

      if (cleanToken) {
        await ensureTokenCreated(cleanToken);
      }

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

  const handleTokenAction = async (tokenId: string, action: 'COMPLETE' | 'ABSENT' | 'NOT_AVAILABLE' | 'RETURN_TO_QUEUE' | 'RESET_TO_WAITING', roomNumber?: string) => {
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

  const handleReturnActiveToQueue = async (tokenId: string, tokenNumber: string, fromRoom?: string) => {
    try {
      await markTokenAction(tokenId, 'RETURN_TO_QUEUE');
      const clean = tokenNumber.replace(' 🚨', '').trim();
      if (fromRoom) {
        removeTokenFromRoomQueue(deptId, fromRoom, clean);
      }
      refreshRoomSettings();
      await useQueueStore.getState().fetchQueue(deptId);
      showToast(`Patient ${clean} returned back to waiting queue!`, 3500);
    } catch (err) {
      console.error('Failed to return patient to queue:', err);
      alert('Failed to return patient to queue.');
    }
  };

  const handleTransferToRoomQueue = async (fromRoom: string, toRoom: string, tokenId: string, tokenNumber: string) => {
    try {
      const clean = tokenNumber.replace(' 🚨', '').trim();
      // 1. Reset from CALLED to WAITING so it's not active in fromRoom
      await markTokenAction(tokenId, 'RETURN_TO_QUEUE');
      // 2. Clear from fromRoom staged queue if present
      if (fromRoom) {
        removeTokenFromRoomQueue(deptId, fromRoom, clean);
      }
      // 3. Add to toRoom staged queue
      addTokenToRoomQueue(deptId, toRoom, clean);
      refreshRoomSettings();
      await useQueueStore.getState().fetchQueue(deptId);
      showToast(`Patient ${clean} transferred from Room ${fromRoom} to Room ${toRoom} queue!`, 3500);
    } catch (err) {
      console.error('Failed to transfer patient to room queue:', err);
      alert('Failed to transfer patient.');
    }
  };

  const handleTransferAndCall = async (fromRoom: string, toRoom: string, tokenNumber: string) => {
    setCallingRoom(toRoom);
    try {
      const cleanToken = tokenNumber.replace(' 🚨', '').trim();
      await callNextPatient(deptId, toRoom, cleanToken);
      removeTokenFromRoomQueue(deptId, toRoom, cleanToken);
      if (fromRoom && fromRoom !== toRoom) {
        removeTokenFromRoomQueue(deptId, fromRoom, cleanToken);
      }
      refreshRoomSettings();
      await useQueueStore.getState().fetchQueue(deptId);
      showToast(`Patient ${cleanToken} transferred and called in Room ${toRoom}!`, 3500);
    } catch (err) {
      console.error('Failed to transfer and call patient:', err);
      alert('Failed to transfer patient to target room.');
    } finally {
      setCallingRoom(null);
    }
  };

  const handleToggleAutoCall = (roomNumber: string) => {
    const newState = !autoCallRooms[roomNumber];
    setAutoCallRoom(deptId, roomNumber, newState);
    setAutoCallRooms((prev) => ({ ...prev, [roomNumber]: newState }));
    showToast(`Auto-Call for Room ${roomNumber} is now ${newState ? 'ENABLED ⚡' : 'DISABLED'}`, 3000);
  };

  const handleAddPatientToRoomQueue = async (roomNumber: string, token: string) => {
    const clean = token.replace(' 🚨', '').trim();
    if (clean) {
      await ensureTokenCreated(clean);
    }
    addTokenToRoomQueue(deptId, roomNumber, clean || token);
    refreshRoomSettings();
    showToast(`Patient ${clean || token} added to Room ${roomNumber} queue!`, 3000);
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

  const handlePullWaitingToRoom = (roomNumber: string, count: number | 'ALL') => {
    const unstaged = (queueData.nextTokens || []).filter(t => !stagedRoomByToken.has(t.replace(' 🚨', '').trim()));
    if (unstaged.length === 0) {
      showToast('No unstaged waiting patients in the line.', 3000);
      return;
    }
    const toPull = count === 'ALL' ? unstaged : unstaged.slice(0, count);
    addMultipleTokensToRoomQueue(deptId, roomNumber, toPull);
    refreshRoomSettings();
    showToast(`Pulled ${toPull.length} patient${toPull.length === 1 ? '' : 's'} into Room ${roomNumber} Queue.`, 3000);
  };

  const handlePullWaitingToActiveRoom = async (roomNumber: string, count: number = 1) => {
    const unstaged = (queueData.nextTokens || []).filter(t => !stagedRoomByToken.has(t.replace(' 🚨', '').trim()));
    const candidates = unstaged.length > 0 ? unstaged : (queueData.nextTokens || []);
    if (candidates.length === 0) {
      showToast('No waiting patients in the line.', 3000);
      return;
    }
    const toPull = candidates.slice(0, count);
    for (const tok of toPull) {
      const clean = tok.replace(' 🚨', '').trim();
      await handleCallNext(roomNumber, clean);
    }
    showToast(`Pulled ${toPull.length} patient${toPull.length === 1 ? '' : 's'} directly into Room ${roomNumber}!`, 3000);
  };

  const handleDirectCallOrStage = async (roomNumber: string, action: 'CALL' | 'STAGE') => {
    const clean = directTokenVal.trim();
    if (!clean) return;

    setDirectInputRoom(null);
    setDirectTokenVal('');

    if (action === 'CALL') {
      await handleCallNext(roomNumber, clean);
    } else {
      await handleAddPatientToRoomQueue(roomNumber, clean);
    }
  };

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
        <aside
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!isOverQueueSidebar) setIsOverQueueSidebar(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsOverQueueSidebar(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsOverQueueSidebar(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const rawData = e.dataTransfer.getData('application/json');
            let activeInfo: { token: string; tokenId: string; fromRoom: string; isActive?: boolean } | null = draggingActiveToken;
            if (rawData) {
              try {
                const parsed = JSON.parse(rawData);
                if (parsed.isActive || parsed.tokenId) activeInfo = parsed;
              } catch {}
            }
            const droppedToken = e.dataTransfer.getData('text/plain') || draggingToken || activeInfo?.token;

            if (activeInfo) {
              handleReturnActiveToQueue(activeInfo.tokenId, droppedToken || activeInfo.token, activeInfo.fromRoom);
            } else if (droppedToken) {
              const clean = droppedToken.replace(' 🚨', '').trim();
              const currentStagedRoom = getStagedRoomForToken(droppedToken);
              if (currentStagedRoom) {
                removeTokenFromRoomQueue(deptId, currentStagedRoom, clean);
                refreshRoomSettings();
                showToast(`Patient ${clean} moved back to general waiting queue!`, 3000);
              }
            }
            setIsOverQueueSidebar(false);
            setDraggingToken(null);
            setDraggingActiveToken(null);
          }}
          className={`w-full lg:w-[420px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shadow-sm flex flex-col z-20 order-2 lg:order-1 h-[50vh] lg:h-screen animate-in fade-in duration-200 transition-colors ${
            isOverQueueSidebar ? 'ring-4 ring-blue-500/30 bg-blue-50/30' : ''
          }`}
        >
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
              <button
                type="button"
                onClick={() => {
                  resetQuickTokenForm();
                  setIsQuickTokenModalOpen(true);
                }}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors shadow-sm shadow-indigo-500/20 cursor-pointer"
                title="Quick Add Token # (Token Only)"
              >
                <Hash size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  resetAddPatientForm();
                  setIsAddPatientModalOpen(true);
                }}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors shadow-sm shadow-emerald-500/20 cursor-pointer"
                title="Add Full Patient Details"
              >
                <UserPlus size={18} />
              </button>
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

          {/* Quick Token Entry (Token # Only) Bar — supports multiple: "13, 14, 15" or "13 14 15" */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const raw = sidebarQuickToken.trim();
              if (!raw) return;
              // Expand ranges (e.g. 1-100) and split by comma/space
              const tokens = expandTokenInput(raw);
              if (tokens.length === 0) return;
              setIsSidebarQuickAdding(true);
              const priority = sidebarQuickEmergency ? 'EMERGENCY' : 'NORMAL';
              let added = 0;
              try {
                for (const tok of tokens) {
                  await handleQuickAddToken(tok, priority);
                  added++;
                }
                setSidebarQuickToken('');
                setSidebarQuickEmergency(false);
                if (tokens.length > 1) {
                  showToast(`${added} tokens added to waiting line!`, 3000);
                }
              } catch (err: any) {
                if (added > 0) {
                  showToast(`Added ${added}/${tokens.length} tokens. Error on remaining.`, 4000);
                } else {
                  alert(err?.message || 'Failed to add token');
                }
              } finally {
                setIsSidebarQuickAdding(false);
              }
            }}
            className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center gap-2"
          >
            <div className="relative flex-1 flex items-center">
              <span className="absolute left-3 text-indigo-400 font-mono font-black text-xs">#</span>
              <input
                type="text"
                value={sidebarQuickToken}
                onChange={(e) => setSidebarQuickToken(e.target.value)}
                placeholder="e.g. 13, 14, 15 or 1-100..."
                className="w-full bg-slate-950 border border-indigo-500/40 focus:border-indigo-400 rounded-xl pl-7 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono tracking-wider"
              />
            </div>

            <button
              type="button"
              onClick={() => setSidebarQuickEmergency(!sidebarQuickEmergency)}
              className={`px-2 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                sidebarQuickEmergency
                  ? 'bg-red-500/30 text-red-300 border-red-500 animate-pulse'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-red-500/40 hover:text-red-400'
              }`}
              title={sidebarQuickEmergency ? 'Priority: EMERGENCY (🚨)' : 'Click to mark as Emergency (🚨)'}
            >
              🚨
            </button>

            <button
              type="submit"
              disabled={!sidebarQuickToken.trim() || isSidebarQuickAdding}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40 active:scale-95"
              title="Add token(s) directly to waiting line (Press Enter)"
            >
              {isSidebarQuickAdding ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <Plus size={14} />
              )}
              <span>{(() => { const c = expandTokenInput(sidebarQuickToken).length; return c > 1 ? `Add ${c} Tokens` : 'Add Token'; })()}</span>
            </button>
          </form>

          {/* Token Search Bar */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 space-y-2">
            <div className="relative flex items-center">
              <Search size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={tokenSearchQuery}
                onChange={(e) => setTokenSearchQuery(e.target.value)}
                placeholder="Search token # (e.g. 5, PED-01)..."
                className="w-full bg-slate-950 border border-slate-700/90 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono tracking-wide"
              />
              {tokenSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTokenSearchQuery('')}
                  className="absolute right-2.5 text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {tokenSearchQuery.trim() && (
              <div className="flex items-center justify-between mt-2 px-1 text-[11px]">
                <span className="text-slate-400">
                  {filteredNextTokens.length > 0 ? (
                    <>
                      Found <strong className="text-blue-400">{filteredNextTokens.length}</strong> in line
                    </>
                  ) : (
                    <span className="text-amber-300">0 in waiting line</span>
                  )}
                </span>
                <span className="text-[10px] text-blue-300 font-black uppercase tracking-wider bg-blue-950 border border-blue-800/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <GripVertical size={10} /> Drag to Room
                </span>
              </div>
            )}
          </div>

          {/* Drag Return Drop Target / Hint Banner */}
          {draggingToken ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsOverQueueSidebar(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsOverQueueSidebar(true);
              }}
              className={`p-3.5 m-3 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2.5 text-xs font-black transition-all ${
                isOverQueueSidebar
                  ? 'bg-blue-600 text-white border-blue-400 scale-[1.02] shadow-xl animate-pulse ring-4 ring-blue-500/25'
                  : 'bg-blue-50 text-blue-900 border-blue-300 shadow-sm'
              }`}
            >
              <RotateCcw size={16} className={isOverQueueSidebar ? 'animate-spin' : 'text-blue-600'} />
              <span>
                {isOverQueueSidebar
                  ? 'Release to Put Patient Back in Queue ↵'
                  : draggingActiveToken
                    ? `Drop here to return ${draggingActiveToken.token} to general queue`
                    : 'Drop here to put back in general waiting queue'}
              </span>
            </div>
          ) : queueData.nextTokens.length > 0 ? (
            <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between text-[11px] text-blue-950 font-bold">
              <span className="flex items-center gap-1.5">
                <GripVertical size={14} className="text-blue-600 shrink-0" />
                <span>Drag patient to Call Now or Add to Room Queue</span>
              </span>
              <span className="text-[10px] text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full font-black uppercase">
                Drag &amp; Drop
              </span>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
            {/* Filtered Waiting Tokens */}
            {filteredNextTokens.map((tokenStr, idx) => {
              const isEmergency = tokenStr.includes('🚨');
              const token = tokenStr.replace(' 🚨', '');
              const isThisDragging = draggingToken === tokenStr;
              const stagedRoom = getStagedRoomForToken(tokenStr);

              return (
                <div
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

                      {/* Delete Token Directly Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTokenDirect(tokenStr);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title={`Delete / Cancel Token ${token}`}
                      >
                        <Trash2 size={14} />
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

            {/* Additional Database Search Matches (if searching and token not already displayed in line) */}
            {tokenSearchQuery.trim() && dbSearchResults.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="px-1 flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>Registered Patients Matching Search ({dbSearchResults.length})</span>
                  <span className="text-[10px] text-blue-600 font-black">Draggable ➔</span>
                </div>
                {dbSearchResults
                  .filter((st) => !filteredNextTokens.some((ft) => ft.replace(' 🚨', '').trim().toLowerCase() === st.tokenNumber?.toLowerCase()))
                  .map((st) => (
                    <div
                      key={st.id || st.tokenNumber}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', st.tokenNumber);
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingToken(st.tokenNumber);
                      }}
                      onDragEnd={() => {
                        setDraggingToken(null);
                        setDragOverRoom(null);
                        setDragOverZone(null);
                      }}
                      className="p-3 rounded-2xl border-2 border-blue-300 bg-white hover:bg-blue-50/50 shadow-xs cursor-grab active:cursor-grabbing select-none transition-all group"
                      title={`Drag token ${st.tokenNumber} to any room to call or stage`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <GripVertical size={15} className="text-blue-500 group-hover:text-blue-700 transition-colors" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-slate-900 font-mono">{st.tokenNumber}</span>
                              {st.patient && (
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[130px]">
                                  {st.patient.firstName} {st.patient.lastName || ''}
                                </span>
                              )}
                            </div>
                            {st.patient?.uhid && (
                              <span className="text-[10px] text-slate-400 block font-mono">UHID: {st.patient.uhid}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            st.status === 'WAITING'
                              ? 'bg-amber-100 text-amber-800'
                              : st.status === 'CALLED'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {st.status || 'TOKEN'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuickAssignToken(st.tokenNumber)}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Assign to Room"
                          >
                            <CornerDownRight size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTokenDirect(st.tokenNumber)}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title={`Delete / Cancel Token ${st.tokenNumber}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-600 font-semibold mt-1 flex items-center gap-1">
                        <span>Drag to any room to Call or Stage</span>
                      </p>
                    </div>
                  ))}
              </div>
            )}

            {/* Direct Token Create & Assign Card (if searched token not currently in line) */}
            {filteredNextTokens.length === 0 && tokenSearchQuery.trim() && dbSearchResults.length === 0 && (
              <div className="p-4 rounded-2xl bg-white border-2 border-dashed border-blue-400 text-center space-y-3 shadow-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Token: <span className="font-mono font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">"{tokenSearchQuery.trim().toUpperCase()}"</span>
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    Not in waiting line
                  </span>
                </div>

                {/* Draggable Card */}
                <div
                  draggable
                  onDragStart={(e) => {
                    const clean = tokenSearchQuery.trim().toUpperCase();
                    e.dataTransfer.setData('text/plain', clean);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingToken(clean);
                  }}
                  onDragEnd={() => {
                    setDraggingToken(null);
                    setDragOverRoom(null);
                    setDragOverZone(null);
                  }}
                  className="p-3.5 rounded-xl border-2 border-blue-600 bg-gradient-to-r from-blue-50 via-white to-indigo-50 shadow-md cursor-grab active:cursor-grabbing hover:shadow-lg transition-all text-left group select-none"
                  title="Drag this token directly into any room to auto-create and assign"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical size={16} className="text-blue-600 group-hover:text-blue-800 transition-colors" />
                      <span className="text-lg font-black text-slate-900 font-mono">{tokenSearchQuery.trim().toUpperCase()}</span>
                    </div>
                    <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-md shadow-2xs">
                      Draggable Card
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-700 font-bold mt-1.5 flex items-center gap-1">
                    <Sparkles size={12} className="text-blue-600" />
                    <span>Drag into any room to Auto-Create &amp; Assign ➔</span>
                  </p>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const clean = tokenSearchQuery.trim().toUpperCase();
                      await ensureTokenCreated(clean);
                      setTokenSearchQuery('');
                      showToast(`Token #${clean} created and added to waiting line!`, 3500);
                    }}
                    className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Create this token and put it in general waiting line"
                  >
                    <Plus size={13} />
                    <span>Create in Line</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const clean = tokenSearchQuery.trim().toUpperCase();
                      setQuickAssignToken(clean);
                    }}
                    className="py-2 px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Assign to a specific room"
                  >
                    <CornerDownRight size={13} />
                    <span>Assign Room...</span>
                  </button>
                </div>

                {/* Quick Room Direct Action Shortcuts */}
                {rooms.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-left">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Quick Room Action:</p>
                    <div className="space-y-1.5">
                      {rooms.map((r) => (
                        <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl">
                          <div>
                            <span className="text-xs font-black text-slate-800">Room {r.roomNumber}</span>
                            {r.doctorName && <p className="text-[10px] text-slate-400 truncate max-w-[90px]">{r.doctorName}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                const clean = tokenSearchQuery.trim().toUpperCase();
                                await ensureTokenCreated(clean);
                                handleCallNext(r.roomNumber, clean);
                                setTokenSearchQuery('');
                              }}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                              title={`Call token #${tokenSearchQuery.trim()} now in Room ${r.roomNumber}`}
                            >
                              ⚡ Call Now
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const clean = tokenSearchQuery.trim().toUpperCase();
                                await ensureTokenCreated(clean);
                                handleAddPatientToRoomQueue(r.roomNumber, clean);
                                setTokenSearchQuery('');
                              }}
                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                              title={`Add token #${tokenSearchQuery.trim()} to Room ${r.roomNumber} queue`}
                            >
                              ➕ Queue
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {queueData.nextTokens.length === 0 && !tokenSearchQuery.trim() && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 text-center">
                <CheckCircle size={44} className="mb-3 text-emerald-500 opacity-60" />
                <p className="font-bold text-slate-700">Waiting Line Clear</p>
                <p className="text-xs text-slate-400 mt-1">No new patients waiting in this department.</p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      resetQuickTokenForm();
                      setIsQuickTokenModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Hash size={14} />
                    <span>+ Quick Token #</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetAddPatientForm();
                      setIsAddPatientModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <UserPlus size={14} />
                    <span>+ Full Patient Form</span>
                  </button>
                </div>
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

            {/* Quick Add Token Number Only Button */}
            <button
              type="button"
              onClick={() => {
                resetQuickTokenForm();
                setIsQuickTokenModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/25 flex items-center gap-2 cursor-pointer active:scale-95"
              title="Quickly add a token number only (no patient details needed)"
            >
              <Hash size={16} />
              <span>+ Quick Token</span>
            </button>

            {/* Add Patient Directly to Waiting Line Button */}
            <button
              type="button"
              onClick={() => {
                resetAddPatientForm();
                setIsAddPatientModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/25 flex items-center gap-2 cursor-pointer active:scale-95"
              title="Add a walk-in or new patient with full details"
            >
              <UserPlus size={16} />
              <span>+ Add Patient</span>
            </button>

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
                const activeList = activePatientsByRoom.get(room.roomNumber) || [];
                const activePatient = activeList[0];
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
                      const rawData = e.dataTransfer.getData('application/json');
                      let activeInfo: { token: string; tokenId: string; fromRoom: string; isActive?: boolean } | null = draggingActiveToken;
                      if (rawData) {
                        try {
                          const parsed = JSON.parse(rawData);
                          if (parsed.isActive || parsed.tokenId) activeInfo = parsed;
                        } catch {}
                      }
                      const droppedToken = e.dataTransfer.getData('text/plain') || draggingToken || activeInfo?.token;

                      if (droppedToken) {
                        if (activeInfo && activeInfo.fromRoom !== room.roomNumber) {
                          // Transferring an ACTIVE patient from another room
                          if (dragOverZone === 'STAGE_QUEUE') {
                            handleTransferToRoomQueue(activeInfo.fromRoom, room.roomNumber, activeInfo.tokenId, droppedToken);
                          } else {
                            handleTransferAndCall(activeInfo.fromRoom, room.roomNumber, droppedToken);
                          }
                        } else if (!activeInfo) {
                          // Normal waiting token from queue
                          if (dragOverZone === 'STAGE_QUEUE') {
                            handleAddPatientToRoomQueue(room.roomNumber, droppedToken);
                          } else {
                            // Adds or calls patient directly to room
                            handleCallNext(room.roomNumber, droppedToken);
                          }
                        }
                      }
                      setDragOverRoom(null);
                      setDragOverZone(null);
                      setDraggingToken(null);
                      setDraggingActiveToken(null);
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
                        disabled={activeList.length === 0 || isRecalling}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm ${
                          isRecallSuccess
                            ? 'bg-emerald-600 text-white animate-bounce'
                            : activeList.length > 0
                              ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer active:scale-95'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                        title={activeList.length > 0 ? 'Ring Bell / Call Patient Again' : 'No active patient to recall'}
                      >
                        <Bell size={14} className={isRecalling ? 'animate-spin' : ''} />
                        <span>{isRecallSuccess ? 'Called!' : isRecalling ? 'Calling...' : 'Recall'}</span>
                      </button>
                    </div>

                    {/* Active Patients Area */}
                    {/* Direct Token Entry Box (when opened for this room) */}
                    {directInputRoom === room.roomNumber && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="border-2 border-blue-500 rounded-2xl p-4 mb-4 bg-gradient-to-b from-blue-50/90 via-white to-slate-50 shadow-lg animate-in fade-in zoom-in-95 duration-150 relative text-left"
                      >
                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-blue-100">
                          <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                            <Sparkles size={13} className="text-blue-600 animate-pulse" />
                            {activeList.length > 0
                              ? `Add More Patients into Room ${room.roomNumber}`
                              : `Direct Token Entry (Room ${room.roomNumber})`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDirectInputRoom(null);
                              setDirectTokenVal('');
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                            title="Cancel (Esc)"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleDirectCallOrStage(room.roomNumber, 'CALL');
                          }}
                          className="space-y-2.5"
                        >
                          <div className="relative">
                            <input
                              type="text"
                              autoFocus
                              value={directTokenVal}
                              onChange={(e) => setDirectTokenVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setDirectInputRoom(null);
                                  setDirectTokenVal('');
                                }
                              }}
                              placeholder="Enter token # (e.g. 101, M-05)..."
                              className="w-full bg-white border-2 border-blue-400 focus:border-blue-600 rounded-xl px-3.5 py-2.5 text-center text-lg font-black text-slate-900 placeholder:text-slate-400 placeholder:text-xs placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-blue-500/20 tracking-wider shadow-inner transition-all font-mono"
                            />
                            {directTokenVal && (
                              <button
                                type="button"
                                onClick={() => setDirectTokenVal('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
                                title="Clear"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>

                          {/* Waiting line suggestion chips */}
                          {queueData.nextTokens && queueData.nextTokens.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap justify-center pt-0.5">
                              <span className="text-[10px] text-slate-400 font-bold">Pick from line:</span>
                              {queueData.nextTokens.slice(0, 4).map((tok) => {
                                const clean = tok.replace(' 🚨', '').trim();
                                return (
                                  <button
                                    key={tok}
                                    type="button"
                                    onClick={() => setDirectTokenVal(clean)}
                                    className={`text-[10px] font-black px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                                      directTokenVal.toLowerCase() === clean.toLowerCase()
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                        : 'bg-slate-100 hover:bg-blue-100 text-slate-700 border-slate-200 hover:border-blue-300'
                                    }`}
                                  >
                                    {clean}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="submit"
                              disabled={!directTokenVal.trim()}
                              className="py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              title="Call this token immediately into this room"
                            >
                              <Zap size={13} className="fill-white" />
                              <span>{activeList.length > 0 ? '+ Add into Room ↵' : 'Call Now ↵'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={!directTokenVal.trim()}
                              onClick={() => handleDirectCallOrStage(room.roomNumber, 'STAGE')}
                              className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-900 border border-indigo-200 hover:border-indigo-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                              title="Add this token to this room's staged queue"
                            >
                              <ListOrdered size={13} className="text-indigo-600" />
                              <span>+ Queue Here</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Free Room State (when room is empty and direct input not active) */}
                    {activeList.length === 0 && directInputRoom !== room.roomNumber && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setDirectInputRoom(room.roomNumber);
                          setDirectTokenVal('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDirectInputRoom(room.roomNumber);
                            setDirectTokenVal('');
                          }
                        }}
                        className="border border-slate-200/80 hover:border-blue-400 rounded-2xl p-5 mb-4 flex flex-col justify-center items-center text-center bg-slate-50 hover:bg-gradient-to-b hover:from-blue-50/70 hover:to-slate-50 transition-all cursor-pointer group/ready shadow-2xs hover:shadow-md select-none relative"
                        title="Click to directly enter and call / stage a token number for this room"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 group-hover/ready:border-blue-300 group-hover/ready:bg-blue-600 group-hover/ready:text-white text-slate-400 flex items-center justify-center mb-1.5 transition-all shadow-2xs group-hover/ready:scale-105">
                          <Users size={20} className="group-hover/ready:hidden" />
                          <Plus size={20} className="hidden group-hover/ready:block animate-in zoom-in-75 duration-150" />
                        </div>
                        <p className="text-xs font-black text-slate-700 group-hover/ready:text-blue-700 transition-colors">
                          Room Free &amp; Ready
                        </p>
                        <p className="text-[10px] text-slate-400 group-hover/ready:text-slate-600 mt-0.5 transition-colors">
                          {isAutoCallOn ? '⚡ Auto-Call active: ready for next patient' : "Click 'Call Next' or drag patients here"}
                        </p>

                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-50/90 group-hover/ready:bg-blue-100/90 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors shadow-2xs">
                          <Plus size={11} className="text-blue-600" />
                          <span>Click to Enter Token # Directly</span>
                        </div>

                        {/* Quick Pull Directly into Room Controls */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 pt-2.5 border-t border-slate-200/80 w-full flex items-center justify-between"
                        >
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <CornerDownRight size={11} className="text-blue-600" />
                            <span>Pull into room:</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePullWaitingToActiveRoom(room.roomNumber, 1);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 1 patient directly into this room"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePullWaitingToActiveRoom(room.roomNumber, 2);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 2 patients directly into this room"
                            >
                              +2
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePullWaitingToActiveRoom(room.roomNumber, 3);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 3 patients directly into this room"
                            >
                              +3
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Single Active Patient Card */}
                    {activeList.length === 1 && (
                      <div
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            token: activePatient.token,
                            tokenId: activePatient.id,
                            fromRoom: room.roomNumber,
                            patientName: activePatient.patientName,
                            isActive: true,
                          };
                          e.dataTransfer.setData('text/plain', activePatient.token);
                          e.dataTransfer.setData('application/json', JSON.stringify(payload));
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggingToken(activePatient.token);
                          setDraggingActiveToken(payload);
                        }}
                        onDragEnd={() => {
                          setDraggingToken(null);
                          setDraggingActiveToken(null);
                          setDragOverRoom(null);
                          setDragOverZone(null);
                          setIsOverQueueSidebar(false);
                        }}
                        className="border border-blue-200/90 rounded-2xl p-4 mb-4 flex flex-col justify-center items-center text-center transition-all bg-gradient-to-b from-blue-50/50 to-slate-50 shadow-xs cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md select-none group/card relative"
                        title="Drag to transfer patient or click token to add more patients to this room"
                      >
                        <div className="w-full flex items-center justify-between mb-1 text-[11px] font-black uppercase tracking-wider text-blue-600">
                          <span className="flex items-center gap-1">
                            <GripVertical size={13} className="text-blue-400 group-hover/card:text-blue-600 transition-colors" />
                            Currently In Room
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDirectInputRoom(room.roomNumber);
                              setDirectTokenVal('');
                            }}
                            className="text-[10px] text-blue-700 bg-blue-100 hover:bg-blue-200 font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Click to add another patient into this room"
                          >
                            <Plus size={11} />
                            <span>+ Add More</span>
                          </button>
                        </div>

                        {/* Interactive Token Click Area */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDirectInputRoom(room.roomNumber);
                            setDirectTokenVal('');
                          }}
                          className="my-0.5 px-4 py-1 rounded-2xl hover:bg-blue-100/70 border border-transparent hover:border-blue-300 transition-all cursor-pointer group/tok flex flex-col items-center"
                          title="Click on token to add more patients into this room"
                        >
                          <span className="text-3xl font-black text-slate-900 tracking-tight group-hover/tok:text-blue-700 transition-colors">
                            {activePatient.token}
                          </span>
                          <span className="text-[10px] text-blue-600 font-bold opacity-0 group-hover/tok:opacity-100 transition-opacity flex items-center gap-0.5 -mt-0.5">
                            <Plus size={10} /> Click to add more patient
                          </span>
                        </div>

                        <p className="text-xs font-bold text-slate-700 mt-0.5">{activePatient.patientName}</p>
                        {activePatient.uhid && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            UHID: {activePatient.uhid}
                          </span>
                        )}

                        {/* Quick Action Buttons: Add Patient, Put Back in Queue & Transfer Room */}
                        <div className="mt-3 pt-2 border-t border-blue-100/80 w-full flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDirectInputRoom(room.roomNumber);
                              setDirectTokenVal('');
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 hover:border-blue-300 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                            title="Add another patient into this consultation room"
                          >
                            <Plus size={12} className="text-blue-600" />
                            <span>+ Add Patient</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReturnActiveToQueue(activePatient.id, activePatient.token, room.roomNumber);
                            }}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 hover:border-amber-300 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                            title="Put this patient back into the general waiting queue"
                          >
                            <RotateCcw size={11} className="text-amber-600" />
                            <span>Put Back</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTransferModalToken({
                                token: activePatient.token,
                                tokenId: activePatient.id,
                                fromRoom: room.roomNumber,
                                patientName: activePatient.patientName,
                              });
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 hover:border-slate-300 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                            title="Transfer patient to another consultation room"
                          >
                            <ArrowRightLeft size={11} className="text-slate-600" />
                            <span>Transfer...</span>
                          </button>
                        </div>

                        {/* Quick Pull Controls for Currently In Room */}
                        <div className="mt-2.5 pt-2 border-t border-blue-100/80 w-full flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <CornerDownRight size={11} className="text-blue-600" />
                            <span>Pull into room:</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePullWaitingToActiveRoom(room.roomNumber, 1);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 1 patient directly into this room"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePullWaitingToActiveRoom(room.roomNumber, 2);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 2 patients directly into this room"
                            >
                              +2
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePullWaitingToActiveRoom(room.roomNumber, 3);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 3 patients directly into this room"
                            >
                              +3
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Multiple Active Patients In Same Room */}
                    {activeList.length > 1 && (
                      <div className="mb-4 space-y-2">
                        <div className="flex items-center justify-between px-1 flex-wrap gap-1.5">
                          <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 shadow-2xs">
                            <Users size={13} className="text-blue-600" />
                            {activeList.length} In Room
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Quick Pull into Room */}
                            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-blue-200 shadow-2xs">
                              <span className="text-[9px] font-bold text-slate-500">Pull:</span>
                              <button
                                type="button"
                                onClick={() => handlePullWaitingToActiveRoom(room.roomNumber, 1)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                                title="Pull next 1 patient directly into this room"
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePullWaitingToActiveRoom(room.roomNumber, 2)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                                title="Pull next 2 patients directly into this room"
                              >
                                +2
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDirectInputRoom(room.roomNumber);
                                setDirectTokenVal('');
                              }}
                              className="text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer flex items-center gap-1"
                              title="Add another patient into this room"
                            >
                              <Plus size={11} /> + Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                for (const p of activeList) {
                                  handleTokenAction(p.id, 'COMPLETE', room.roomNumber);
                                }
                              }}
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                              title="Complete all patients in this room"
                            >
                              ✓ Done All
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                          {activeList.map((p: any) => (
                            <div
                              key={p.id}
                              draggable
                              onDragStart={(e) => {
                                const payload = {
                                  token: p.token,
                                  tokenId: p.id,
                                  fromRoom: room.roomNumber,
                                  patientName: p.patientName,
                                  isActive: true,
                                };
                                e.dataTransfer.setData('text/plain', p.token);
                                e.dataTransfer.setData('application/json', JSON.stringify(payload));
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggingToken(p.token);
                                setDraggingActiveToken(payload);
                              }}
                              onDragEnd={() => {
                                setDraggingToken(null);
                                setDraggingActiveToken(null);
                                setDragOverRoom(null);
                                setDragOverZone(null);
                                setIsOverQueueSidebar(false);
                              }}
                              className="border border-blue-200/90 rounded-2xl p-3 bg-gradient-to-r from-blue-50/60 via-white to-slate-50 shadow-xs cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md transition-all group/item select-none"
                              title="Drag patient to another room or click to add more patients"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    setDirectInputRoom(room.roomNumber);
                                    setDirectTokenVal('');
                                  }}
                                  className="flex items-center gap-2 cursor-pointer group/tok hover:opacity-80 transition-opacity"
                                  title="Click to add another patient into this room"
                                >
                                  <GripVertical size={14} className="text-blue-400 group-hover/item:text-blue-600 transition-colors shrink-0" />
                                  <div className="text-left">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-base font-black text-slate-900 leading-none group-hover/tok:text-blue-700 transition-colors">{p.token}</span>
                                      <span className="text-[11px] font-bold text-slate-600 truncate max-w-[110px]">{p.patientName}</span>
                                    </div>
                                    {p.uhid && (
                                      <span className="text-[9px] text-slate-400 block">UHID: {p.uhid}</span>
                                    )}
                                  </div>
                                </div>

                                {/* Individual patient action buttons */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleTokenAction(p.id, 'COMPLETE', room.roomNumber)}
                                    className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                                    title="Complete this patient"
                                  >
                                    Done
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTokenAction(p.id, 'NOT_AVAILABLE', room.roomNumber)}
                                    className="px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                                    title={`Pass (+${passCount})`}
                                  >
                                    +{passCount}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTokenAction(p.id, 'ABSENT', room.roomNumber)}
                                    className="px-1.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                                    title="Mark absent"
                                  >
                                    Abs
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReturnActiveToQueue(p.id, p.token, room.roomNumber)}
                                    className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                    title="Return to waiting queue"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTransferModalToken({ token: p.token, tokenId: p.id, fromRoom: room.roomNumber, patientName: p.patientName })}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                    title="Transfer to another room"
                                  >
                                    <ArrowRightLeft size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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

                        {/* Quick Pull Controls from Waiting Line */}
                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-indigo-100/80">
                          <span className="text-[10px] font-bold text-slate-500">Pull from line:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handlePullWaitingToRoom(room.roomNumber, 1)}
                              className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 1 patient from waiting line"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePullWaitingToRoom(room.roomNumber, 3)}
                              className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Pull next 3 patients from waiting line"
                            >
                              +3
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePullWaitingToRoom(room.roomNumber, 'ALL')}
                              className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-colors cursor-pointer shadow-xs"
                              title="Pull all waiting patients from line into this room"
                            >
                              +All
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2 mt-auto pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            const targetTok = stagedList.length > 0 ? stagedList[0] : undefined;
                            handleCallNext(room.roomNumber, targetTok);
                          }}
                          disabled={isCalling}
                          className={`flex-1 py-3 rounded-2xl font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
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
                                ? `Call Staged: ${stagedList[0].replace(' 🚨', '')}`
                                : activeList.length > 0
                                  ? `+ Add Next Patient`
                                  : queueData.nextTokens.length === 0
                                    ? 'Call Next (0 in line)'
                                    : 'Call Next Patient'}
                          </span>
                        </button>

                        {/* Quick Pull Controls Directly into Room */}
                        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200/80 rounded-2xl p-1 shrink-0" title="Pull patients from waiting line directly into this room">
                          <button
                            type="button"
                            onClick={() => handlePullWaitingToActiveRoom(room.roomNumber, 1)}
                            className="px-2.5 py-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200 text-blue-700 font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                            title="Pull next 1 patient directly into this room"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePullWaitingToActiveRoom(room.roomNumber, 2)}
                            className="px-2.5 py-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200 text-blue-700 font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                            title="Pull next 2 patients directly into this room"
                          >
                            +2
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePullWaitingToActiveRoom(room.roomNumber, 3)}
                            className="px-2.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                            title="Pull next 3 patients directly into this room"
                          >
                            +3
                          </button>
                        </div>
                      </div>

                      {activeList.length <= 1 && (
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => activePatient && handleTokenAction(activePatient.id, 'COMPLETE', room.roomNumber)}
                            disabled={!activePatient}
                            className="py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Complete {isAutoCallOn ? '⚡' : ''}
                          </button>
                          
                          {/* Dynamic Configurable Pass (+N) Button */}
                          <button
                            onClick={() => activePatient && handleTokenAction(activePatient.id, 'NOT_AVAILABLE', room.roomNumber)}
                            disabled={!activePatient}
                            className="w-full py-2.5 rounded-xl bg-amber-50 text-amber-800 font-bold text-xs hover:bg-amber-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-center cursor-pointer flex items-center justify-center gap-1"
                            title={`Patient stepped away (Push +${passCount} spots back in queue)`}
                          >
                            <span>Pass (+{passCount})</span>
                          </button>

                          <button
                            onClick={() => activePatient && handleTokenAction(activePatient.id, 'ABSENT', room.roomNumber)}
                            disabled={!activePatient}
                            className="py-2.5 rounded-xl bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Absent
                          </button>
                        </div>
                      )}
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

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const tok = quickAssignToken;
                  setQuickAssignToken(null);
                  handleDeleteTokenDirect(tok);
                }}
                className="px-3 py-2 bg-red-950/60 hover:bg-red-900/80 text-red-400 hover:text-red-200 border border-red-800/80 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Delete this token from the queue"
              >
                <Trash2 size={13} />
                <span>Delete Token</span>
              </button>

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

      {/* Transfer Patient Modal */}
      {transferModalToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative flex flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-black">
                  <ArrowRightLeft size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Transfer / Move Patient</h3>
                  <p className="text-xs text-slate-400">
                    Patient <strong className="text-blue-400">{transferModalToken.token}</strong> {transferModalToken.patientName ? `(${transferModalToken.patientName})` : ''} from Room {transferModalToken.fromRoom}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTransferModalToken(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Option 1: Put back in general queue */}
            <div className="mb-4">
              <button
                onClick={() => {
                  handleReturnActiveToQueue(transferModalToken.tokenId, transferModalToken.token, transferModalToken.fromRoom);
                  setTransferModalToken(null);
                }}
                className="w-full p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-sm flex items-center justify-between transition-all group cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <RotateCcw size={18} className="text-amber-400" />
                  <span>Put Back in General Waiting Queue</span>
                </span>
                <span className="text-xs bg-amber-500/20 px-2.5 py-1 rounded-lg text-amber-300 font-black">
                  Return ↵
                </span>
              </button>
            </div>

            {/* Option 2: Send to another room */}
            <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
              Or Send to Another Consultation Room:
            </p>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {rooms.filter((r) => r.roomNumber !== transferModalToken.fromRoom).length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs bg-slate-950/60 rounded-2xl border border-slate-800">
                  No other consultation rooms available. Add more rooms in settings.
                </div>
              ) : (
                rooms
                  .filter((r) => r.roomNumber !== transferModalToken.fromRoom)
                  .map((targetRoom) => (
                    <div
                      key={targetRoom.id}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                    >
                      <div>
                        <span className="font-black text-sm text-white">Room {targetRoom.roomNumber}</span>
                        {targetRoom.doctorName && (
                          <p className="text-[11px] text-slate-400 font-semibold">{targetRoom.doctorName}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            handleTransferToRoomQueue(transferModalToken.fromRoom, targetRoom.roomNumber, transferModalToken.tokenId, transferModalToken.token);
                            setTransferModalToken(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-bold text-xs border border-indigo-500/30 transition-all cursor-pointer"
                          title="Add to target room's staged queue"
                        >
                          + Queue
                        </button>
                        <button
                          onClick={() => {
                            handleTransferAndCall(transferModalToken.fromRoom, targetRoom.roomNumber, transferModalToken.token);
                            setTransferModalToken(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                          title="Call immediately in target room"
                        >
                          Call Now
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800 flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setTransferModalToken(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Patient Directly to Waiting Line Modal */}
      {isAddPatientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] flex flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Add Patient to Waiting Line</h2>
                  <p className="text-xs text-slate-400">
                    Department: <strong className="text-blue-400">{queueData.department || 'Medicine'} OPD</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddPatientModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddPatientSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Error Message */}
              {addPatientError && (
                <div className="p-3 bg-red-950/80 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertTriangle size={15} className="text-red-400 shrink-0" />
                  <span>{addPatientError}</span>
                </div>
              )}

              {/* Patient Name */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Patient Name (Optional)
                </label>
                <input
                  type="text"
                  value={addPatientName}
                  onChange={(e) => setAddPatientName(e.target.value)}
                  placeholder="e.g. Rahul Sharma (Leave blank for Walk-in)"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium placeholder:text-slate-500 focus:outline-none transition-all"
                  autoFocus
                />
              </div>

              {/* Phone & UHID in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={addPatientPhone}
                    onChange={(e) => setAddPatientPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    UHID / Hospital ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={addPatientUhid}
                    onChange={(e) => setAddPatientUhid(e.target.value)}
                    placeholder="e.g. AIIMS-10928"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Priority Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Queue Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddPatientPriority('NORMAL')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                      addPatientPriority === 'NORMAL'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🟢 Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPatientPriority('SENIOR')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                      addPatientPriority === 'SENIOR'
                        ? 'bg-amber-600/30 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🟡 Senior / PwD
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPatientPriority('EMERGENCY')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                      addPatientPriority === 'EMERGENCY'
                        ? 'bg-red-600/30 border-red-500 text-red-300 shadow-sm animate-pulse'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🚨 Emergency
                  </button>
                </div>
              </div>

              {/* Custom Token Number */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Custom Token Number (Optional)
                </label>
                <input
                  type="text"
                  value={addPatientCustomToken}
                  onChange={(e) => setAddPatientCustomToken(e.target.value)}
                  placeholder="Auto-generated if empty (or enter e.g. 15, MED-15)"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none transition-all"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Leave empty to automatically assign the next sequential token number.
                </p>
              </div>

              {/* Placement Destination */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Placement Destination
                </label>
                <select
                  value={addPatientDestination}
                  onChange={(e) => setAddPatientDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-2.5 text-xs text-white font-semibold focus:outline-none transition-all cursor-pointer"
                >
                  <option value="WAITING_LINE">📋 General Waiting Line (Up Next in OPD)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={`ROOM_QUEUE:${r.roomNumber}`}>
                      🚪 Stage into Room {r.roomNumber} Queue {r.doctorName ? `(${r.doctorName})` : ''}
                    </option>
                  ))}
                  {rooms.map((r) => (
                    <option key={`call-${r.id}`} value={`CALL_NOW:${r.roomNumber}`}>
                      ⚡ Call Immediately in Room {r.roomNumber} {r.doctorName ? `(${r.doctorName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Footer Buttons inside form */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddPatientModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingPatient}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/30 flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isAddingPatient ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={15} />
                      <span>{addPatientDestination.startsWith('CALL_NOW:') ? 'Add & Call Now' : 'Add to Waiting Line'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Token Modal (Token Number Only) */}
      {isQuickTokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative flex flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-black">
                  <Hash size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Quick Add Token</h2>
                  <p className="text-xs text-slate-400">
                    Add token number only to waiting line — no name or details required.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsQuickTokenModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const raw = quickTokenVal.trim();
                if (!raw) return;
                const tokens = expandTokenInput(raw);
                if (tokens.length === 0) return;
                setIsQuickAddingToken(true);
                setQuickTokenError(null);
                let added = 0;
                try {
                  for (const tok of tokens) {
                    await handleQuickAddToken(tok, quickTokenPriority, quickTokenDestination);
                    added++;
                  }
                  setIsQuickTokenModalOpen(false);
                  resetQuickTokenForm();
                  if (tokens.length > 1) {
                    showToast(`${added} tokens added!`, 3000);
                  }
                } catch (err: any) {
                  if (added > 0) {
                    setQuickTokenError(`Added ${added}/${tokens.length}. Error on remaining: ${err?.message || 'Unknown error'}`);
                  } else {
                    setQuickTokenError(err?.message || 'Failed to add token');
                  }
                } finally {
                  setIsQuickAddingToken(false);
                }
              }}
              className="py-5 space-y-4"
            >
              {quickTokenError && (
                <div className="p-3 bg-red-950/80 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} className="text-red-400 shrink-0" />
                  <span>{quickTokenError}</span>
                </div>
              )}

              {/* Big Token Number Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Token Number(s) * <span className="text-slate-500 normal-case font-normal">(separate multiple with commas or spaces)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-indigo-400 font-mono">#</span>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickTokenVal}
                    onChange={(e) => setQuickTokenVal(e.target.value)}
                    placeholder="e.g. 13, 14, 15 or 101 102 103"
                    className="w-full bg-slate-950 border-2 border-indigo-500/50 focus:border-indigo-400 rounded-2xl pl-10 pr-4 py-3 text-2xl font-black text-white font-mono placeholder:text-slate-600 placeholder:text-base focus:outline-none focus:ring-4 focus:ring-indigo-500/20 tracking-wider transition-all"
                  />
                </div>
                {expandTokenInput(quickTokenVal).length > 1 && (
                  <p className="mt-1.5 text-xs text-indigo-400 font-bold">
                    {expandTokenInput(quickTokenVal).length} tokens will be added{expandTokenInput(quickTokenVal).length <= 20 ? `: ${expandTokenInput(quickTokenVal).join(', ')}` : ''}
                  </p>
                )}
              </div>

              {/* Priority Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickTokenPriority('NORMAL')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      quickTokenPriority === 'NORMAL'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🟢 Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTokenPriority('SENIOR')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      quickTokenPriority === 'SENIOR'
                        ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🟡 Senior
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTokenPriority('EMERGENCY')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      quickTokenPriority === 'EMERGENCY'
                        ? 'bg-red-600/30 border-red-500 text-red-300 animate-pulse'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🚨 Emergency
                  </button>
                </div>
              </div>

              {/* Placement Destination */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Destination
                </label>
                <select
                  value={quickTokenDestination}
                  onChange={(e) => setQuickTokenDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none transition-all cursor-pointer"
                >
                  <option value="WAITING_LINE">📋 General Waiting Line (Default)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={`ROOM_QUEUE:${r.roomNumber}`}>
                      🚪 Stage into Room {r.roomNumber} Queue {r.doctorName ? `(${r.doctorName})` : ''}
                    </option>
                  ))}
                  {rooms.map((r) => (
                    <option key={`call-${r.id}`} value={`CALL_NOW:${r.roomNumber}`}>
                      ⚡ Call Immediately in Room {r.roomNumber} {r.doctorName ? `(${r.doctorName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsQuickTokenModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!quickTokenVal.trim() || isQuickAddingToken}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isQuickAddingToken ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      <span>
                        {(() => {
                          const count = expandTokenInput(quickTokenVal).length;
                          const label = quickTokenDestination.startsWith('CALL_NOW:') ? 'Add & Call' : 'Add';
                          return count > 1 ? `${label} ${count} Tokens` : `${label} Token`;
                        })()}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
