// src/lib/localStore.ts
/**
 * Fully resilient client-side persistent database using localStorage.
 * Ensures the entire webapp operates with zero downtime even if:
 * - Vercel / Serverless function fails or lacks DATABASE_URL
 * - Cloud Neon / PostgreSQL database is offline or asleep
 * - Railway API is down or restarting
 * - Device is completely offline with zero internet connection
 */

import { getStoredPassCount } from './queueSettings';
import { popNextFromRoomQueue } from './roomQueueSettings';

export interface LocalDepartment {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface LocalRoom {
  id: string;
  roomNumber: string;
  isActive: boolean;
  departmentId?: string;
  doctorName?: string;
}

export interface LocalPatient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  uhid?: string | null;
}

export interface LocalToken {
  id: string;
  tokenNumber: string;
  serviceDate: string; // YYYY-MM-DD
  status: 'WAITING' | 'CALLED' | 'COMPLETED' | 'ABSENT' | 'SKIPPED';
  priority: 'NORMAL' | 'SENIOR' | 'EMERGENCY';
  roomNumber?: string | null;
  issuedAt: string;
  calledAt?: string | null;
  recalledAt?: string | null;
  completedAt?: string | null;
  absentCount: number;
  departmentId: string;
  doctorId?: string;
  patientId: string;
  patient?: LocalPatient;
  department?: LocalDepartment;
  deletedAt?: string | null;
}

const DEPARTMENTS_KEY = 'opd_local_departments';
const ROOMS_KEY = 'opd_local_rooms';
const TOKENS_KEY = 'opd_local_tokens';

const DEFAULT_DEPARTMENTS: LocalDepartment[] = [
  {
    id: '660e8400-e29b-41d4-a716-446655440000',
    name: 'Medicine',
    code: 'MED',
    description: 'General Medicine OPD',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'db44b97c-bce6-4678-8739-fdc74b94823f',
    name: 'Ortho',
    code: 'ORTHO',
    description: 'Orthopedics & Joint Care',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: '00e85abf-791b-4fdd-aaec-a1140ed3eb04',
    name: 'ENT',
    code: 'ENT',
    description: 'Ear, Nose & Throat',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'd3910b90-019b-4960-a597-c1556c20d637',
    name: 'Physiology',
    code: 'PHY',
    description: 'Clinical Physiology OPD',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_ROOMS: LocalRoom[] = [
  { id: 'r-101', roomNumber: '101', isActive: true, doctorName: 'Dr. A. K. Sharma', departmentId: '660e8400-e29b-41d4-a716-446655440000' },
  { id: 'r-102', roomNumber: '102', isActive: true, doctorName: 'Dr. S. Roy', departmentId: '660e8400-e29b-41d4-a716-446655440000' },
  { id: 'r-103', roomNumber: '103', isActive: true, doctorName: 'Dr. P. Sen', departmentId: '660e8400-e29b-41d4-a716-446655440000' },
  { id: 'r-111', roomNumber: '111', isActive: true, doctorName: 'Dr. M. Banerjee', departmentId: '660e8400-e29b-41d4-a716-446655440000' },
];

/**
 * Parsed-value cache, keyed by storage key and validated against the raw string.
 *
 * The TV board and doctor dashboard poll the queue every 2.5s, and offline every one
 * of those polls used to re-parse the whole token array from scratch — three times
 * over, since a single live-queue read touches tokens, departments and rooms. Holding
 * the parsed value and re-using it while the underlying string is byte-identical turns
 * that into a string comparison. A write from another tab changes the raw string, so
 * the check catches it and re-parses; writes from this tab refresh the entry directly.
 *
 * Callers now share one array rather than each getting a private deep copy, which is
 * also where most of the memory saving comes from. Every mutating helper in this file
 * saves before returning, so the shared copy never drifts from what is persisted.
 */
const parseCache = new Map<string, { raw: string; value: unknown }>();

function getStorage<T>(key: string, defaultVal: T): T {
  if (typeof window === 'undefined') return defaultVal;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      setStorage(key, defaultVal);
      return defaultVal;
    }
    const cached = parseCache.get(key);
    if (cached && cached.raw === raw) return cached.value as T;

    const value = JSON.parse(raw) as T;
    parseCache.set(key, { raw, value });
    return value;
  } catch {
    return defaultVal;
  }
}

function setStorage<T>(key: string, val: T): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(val);
    localStorage.setItem(key, raw);
    parseCache.set(key, { raw, value: val });
  } catch {}
}

/**
 * Today in UTC as YYYY-MM-DD, recomputed only when the day actually rolls over.
 *
 * Deliberately still UTC, matching the original `toISOString()` behaviour: service
 * dates already stored by this module are UTC-based, and switching to local time would
 * re-file every token issued before 05:30 IST under the previous day.
 */
let cachedDayIndex = -1;
let cachedTodayString = '';

function getTodayString(): string {
  const now = Date.now();
  const dayIndex = Math.floor(now / 86_400_000); // UTC day, flips exactly when the date does
  if (dayIndex !== cachedDayIndex) {
    cachedDayIndex = dayIndex;
    cachedTodayString = new Date(now).toISOString().slice(0, 10);
  }
  return cachedTodayString;
}

/** Emergencies first, then seniors. Hoisted so sorting does not rebuild it per comparison. */
const PRIORITY_ORDER: Record<string, number> = { EMERGENCY: 3, SENIOR: 2, NORMAL: 1 };

/** `crypto.randomUUID` where available, with the same timestamp fallback as before. */
function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

/**
 * Queue order: highest priority first, then longest-waiting first.
 *
 * Timestamps are parsed once per token instead of once per comparison — the comparator
 * runs O(n log n) times, so parsing inside it made date parsing dominate the sort.
 * `Array.prototype.sort` is stable, so equal entries keep their original order exactly
 * as they did before.
 */
function sortByQueueOrder(tokens: LocalToken[]): LocalToken[] {
  return tokens
    .map((token) => ({
      token,
      weight: PRIORITY_ORDER[token.priority] || 1,
      issuedAt: new Date(token.issuedAt).getTime(),
    }))
    .sort((a, b) => b.weight - a.weight || a.issuedAt - b.issuedAt)
    .map((entry) => entry.token);
}

/** Most recently called first, with the same null-safe `|| 0` fallback as before. */
function sortByCalledAtDesc(tokens: LocalToken[]): LocalToken[] {
  return tokens
    .map((token) => ({ token, calledAt: new Date(token.calledAt || 0).getTime() }))
    .sort((a, b) => b.calledAt - a.calledAt)
    .map((entry) => entry.token);
}

// ----------------- DEPARTMENTS -----------------

export function getLocalDepartments(): LocalDepartment[] {
  return getStorage<LocalDepartment[]>(DEPARTMENTS_KEY, DEFAULT_DEPARTMENTS);
}

export function saveLocalDepartments(depts: LocalDepartment[]): void {
  setStorage(DEPARTMENTS_KEY, depts);
}

export function createLocalDepartment(name: string, code: string, description?: string): LocalDepartment {
  const depts = getLocalDepartments();
  const existing = depts.find(d => d.code.toLowerCase() === code.trim().toLowerCase());
  if (existing) {
    existing.name = name.trim();
    if (description !== undefined) existing.description = description;
    saveLocalDepartments(depts);
    return existing;
  }

  const newDept: LocalDepartment = {
    id: newId('dept'),
    name: name.trim(),
    code: code.trim().toUpperCase(),
    description: description?.trim() || null,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  depts.push(newDept);
  saveLocalDepartments(depts);

  // Auto create Room 101 for new department
  createLocalRoom('101', true, newDept.id, `Dr. in ${newDept.name}`);

  return newDept;
}

export function updateLocalDepartment(id: string, name?: string, code?: string, description?: string): LocalDepartment | null {
  const depts = getLocalDepartments();
  const index = depts.findIndex(d => d.id === id);
  if (index === -1) return null;

  if (name) depts[index].name = name.trim();
  if (code) depts[index].code = code.trim().toUpperCase();
  if (description !== undefined) depts[index].description = description;

  saveLocalDepartments(depts);
  return depts[index];
}

export function deleteLocalDepartment(id: string): boolean {
  const depts = getLocalDepartments();
  const filtered = depts.filter(d => d.id !== id);
  saveLocalDepartments(filtered);
  return true;
}

// ----------------- ROOMS -----------------

export function getLocalRooms(departmentId?: string): LocalRoom[] {
  const rooms = getStorage<LocalRoom[]>(ROOMS_KEY, DEFAULT_ROOMS);
  if (departmentId) {
    const deptRooms = rooms.filter(r => r.departmentId === departmentId);
    if (deptRooms.length === 0) {
      // Fallback: provide at least Room 101 for this department
      const fallbackRoom: LocalRoom = {
        id: `room-${departmentId.slice(0, 6)}-101`,
        roomNumber: '101',
        isActive: true,
        departmentId,
        doctorName: 'Consultant Doctor',
      };
      rooms.push(fallbackRoom);
      saveLocalRooms(rooms);
      return [fallbackRoom];
    }
    return deptRooms;
  }
  return rooms;
}

export function saveLocalRooms(rooms: LocalRoom[]): void {
  setStorage(ROOMS_KEY, rooms);
}

export function createLocalRoom(roomNumber: string, isActive: boolean = true, departmentId?: string, doctorName?: string): LocalRoom {
  const rooms = getLocalRooms();
  const newRoom: LocalRoom = {
    id: newId('room'),
    roomNumber: roomNumber.trim(),
    isActive,
    departmentId: departmentId || '660e8400-e29b-41d4-a716-446655440000',
    doctorName: doctorName?.trim() || undefined,
  };
  rooms.push(newRoom);
  saveLocalRooms(rooms);
  return newRoom;
}

export function updateLocalRoom(id: string, roomNumber?: string, isActive?: boolean, doctorName?: string): LocalRoom | null {
  const rooms = getLocalRooms();
  const index = rooms.findIndex(r => r.id === id);
  if (index === -1) return null;

  if (roomNumber !== undefined) rooms[index].roomNumber = roomNumber.trim();
  if (isActive !== undefined) rooms[index].isActive = isActive;
  if (doctorName !== undefined) rooms[index].doctorName = doctorName.trim() || undefined;

  saveLocalRooms(rooms);
  return rooms[index];
}

export function deleteLocalRoom(id: string): boolean {
  const rooms = getLocalRooms();
  const filtered = rooms.filter(r => r.id !== id);
  saveLocalRooms(filtered);
  return true;
}

// ----------------- TOKENS & QUEUE -----------------

export function getLocalTokens(): LocalToken[] {
  const tokens = getStorage<LocalToken[]>(TOKENS_KEY, []);
  // Ensure any ENT- or department prefix is stripped, keeping only the number
  return tokens
    .filter(t => !t.deletedAt)
    .map(t => ({
      ...t,
      tokenNumber: t.tokenNumber ? t.tokenNumber.replace(/^ENT-?/i, '') : t.tokenNumber,
    }));
}

export function saveLocalTokens(tokens: LocalToken[]): void {
  setStorage(TOKENS_KEY, tokens);
}

export function createLocalToken(
  departmentId: string,
  priority: 'NORMAL' | 'SENIOR' | 'EMERGENCY' = 'NORMAL',
  patientData?: { firstName?: string; lastName?: string; phone?: string; uhid?: string },
  customTokenNumber?: string,
  count: number = 1,
  patients?: Array<{ firstName?: string; lastName?: string; phone?: string; uhid?: string; priority?: 'NORMAL' | 'SENIOR' | 'EMERGENCY'; customTokenNumber?: string }>
): LocalToken | any {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const dept = depts.find(d => d.id === departmentId) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;
  const today = getTodayString();
  const totalCount = Math.min(100, Math.max(1, patients?.length || count || 1));

  let issuedToday = 0;
  for (const t of tokens) {
    if (t.departmentId === targetDeptId && t.serviceDate === today) issuedToday++;
  }

  const createdTokens: LocalToken[] = [];

  for (let i = 0; i < totalCount; i++) {
    const pItem = patients?.[i] || {};
    const itemPriority = pItem.priority || priority;
    let itemTokenNumber = (pItem.customTokenNumber || (i === 0 && totalCount === 1 ? customTokenNumber : undefined))?.trim();
    if (itemTokenNumber) {
      itemTokenNumber = itemTokenNumber.replace(/^ENT-?/i, '');
    } else {
      const sequence = issuedToday + i + 1;
      itemTokenNumber = `${sequence}`;
    }

    const defaultFirst = patientData?.firstName?.trim()
      ? (totalCount > 1 ? `${patientData.firstName.trim()} (#${i + 1})` : patientData.firstName.trim())
      : (totalCount > 1 ? `Walk-in Patient #${i + 1}` : 'Patient');

    const cleanFirstName = pItem.firstName?.trim() || defaultFirst;
    const cleanLastName = pItem.lastName?.trim() || patientData?.lastName?.trim() || '';
    const cleanPhone = pItem.phone?.trim() || (i === 0 ? patientData?.phone?.trim() : '') || '';
    const cleanUhid = pItem.uhid?.trim() || (i === 0 ? patientData?.uhid?.trim() : null) || null;

    const patientId = newId('pat');
    const patient: LocalPatient = {
      id: patientId,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      phone: cleanPhone,
      uhid: cleanUhid,
    };

    const newToken: LocalToken = {
      id: newId('tok'),
      tokenNumber: itemTokenNumber,
      serviceDate: today,
      status: 'WAITING',
      priority: itemPriority,
      roomNumber: null,
      issuedAt: new Date(Date.now() + i * 50).toISOString(),
      calledAt: null,
      recalledAt: null,
      completedAt: null,
      absentCount: 0,
      departmentId: targetDeptId,
      patientId: patient.id,
      patient,
      department: dept,
    };

    tokens.push(newToken);
    createdTokens.push(newToken);
  }

  saveLocalTokens(tokens);
  if (totalCount === 1) {
    return { ...createdTokens[0], tokens: createdTokens, count: 1 };
  }
  return { tokens: createdTokens, count: createdTokens.length, tokenNumber: createdTokens[0]?.tokenNumber };
}

export function getLocalLiveQueue(departmentId: string) {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const rooms = getLocalRooms(departmentId);

  const dept = depts.find(d => d.id === departmentId || (d.code && departmentId && d.code.toLowerCase() === departmentId.toLowerCase())) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;
  const today = getTodayString();

  // One pass over the token array instead of three chained filters
  const calledRaw: LocalToken[] = [];
  const waitingRaw: LocalToken[] = [];

  for (const t of tokens) {
    const isDeptMatch = t.departmentId === targetDeptId || t.departmentId === departmentId || (dept && t.department?.code === dept.code);
    if (!isDeptMatch || t.serviceDate !== today) continue;
    if (t.status === 'CALLED') calledRaw.push(t);
    else if (t.status === 'WAITING') waitingRaw.push(t);
  }

  // Active called tokens (most recent per room)
  const calledTokens = sortByCalledAtDesc(calledRaw);

  const roomDoctorMap = new Map<string, string>();
  for (const r of rooms) {
    if (r.doctorName) roomDoctorMap.set(r.roomNumber, r.doctorName);
  }

  const activeTokens = [];

  for (const t of calledTokens) {
    const room = t.roomNumber || '101';
    const name = t.patient ? `${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() || 'Patient' : 'Patient';
    activeTokens.push({
      id: t.id,
      token: t.tokenNumber,
      room,
      doctorName: roomDoctorMap.get(room) || undefined,
      patientName: name,
      uhid: t.patient?.uhid || '',
      calledAt: t.calledAt ? new Date(t.calledAt).getTime() : undefined,
      recalledAt: t.recalledAt ? new Date(t.recalledAt).getTime() : undefined,
    });
  }

  // Waiting list (emergencies first, then issuedAt)
  const waitingTokens = sortByQueueOrder(waitingRaw);

  return {
    department: dept.name,
    activeTokens,
    nextTokens: waitingTokens.map(t => t.priority === 'EMERGENCY' ? `${t.tokenNumber} 🚨` : t.tokenNumber),
  };
}

export function localCallNextPatient(departmentId: string, roomNumber: string, tokenIdentifier?: string): LocalToken | null {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const dept = depts.find(d => d.id === departmentId || (d.code && departmentId && d.code.toLowerCase() === departmentId.toLowerCase())) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;
  const today = getTodayString();

  const cleanIdentifier = tokenIdentifier?.replace(' 🚨', '').trim();

  // 1. Collect today's waiting tokens
  const waitingRaw: LocalToken[] = [];

  for (const t of tokens) {
    const isDeptMatch = t.departmentId === targetDeptId || t.departmentId === departmentId || (dept && t.department?.code === dept.code);
    if (isDeptMatch && t.serviceDate === today && t.status === 'WAITING') {
      waitingRaw.push(t);
    }
  }

  // 2. Find next waiting token or specifically requested token
  let nextToken: LocalToken | undefined;
  let targetId = cleanIdentifier;

  // If no direct token specified, check if this room has staged tokens queued
  if (!targetId) {
    const staged = popNextFromRoomQueue(departmentId, roomNumber);
    if (staged) {
      targetId = staged.replace(' 🚨', '').trim();
    }
  }

  if (targetId) {
    const norm = targetId.toLowerCase();
    
    // Check in waitingRaw
    nextToken = waitingRaw.find(t => t.id === targetId || (t.tokenNumber && t.tokenNumber.toLowerCase() === norm));
    
    // Check in all tokens for this department
    if (!nextToken) {
      nextToken = tokens.find(t => t.departmentId === targetDeptId && (t.id === targetId || (t.tokenNumber && t.tokenNumber.toLowerCase() === norm)));
    }

    // Check across all tokens regardless of department ID (handles seed/default UUID variations)
    if (!nextToken) {
      nextToken = tokens.find(t => t.id === targetId || (t.tokenNumber && t.tokenNumber.toLowerCase() === norm));
    }
  } else {
    nextToken = sortByQueueOrder(waitingRaw)[0];
  }

  if (!nextToken) {
    saveLocalTokens(tokens);
    return null;
  }

  nextToken.status = 'CALLED';
  nextToken.roomNumber = roomNumber;
  nextToken.calledAt = new Date().toISOString();
  nextToken.recalledAt = null;
  if (targetDeptId) {
    nextToken.departmentId = targetDeptId;
  }

  saveLocalTokens(tokens);
  return nextToken;
}

export function localRecallPatient(departmentId: string, roomNumber: string): LocalToken | null {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const dept = depts.find(d => d.id === departmentId) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;

  const activeToken = sortByCalledAtDesc(
    tokens.filter(t => t.departmentId === targetDeptId && t.roomNumber === roomNumber && t.status === 'CALLED')
  )[0];

  if (!activeToken) return null;

  activeToken.recalledAt = new Date().toISOString();
  saveLocalTokens(tokens);
  return activeToken;
}

export function localMarkTokenAction(
  tokenId: string,
  action: 'COMPLETE' | 'ABSENT' | 'NOT_AVAILABLE' | 'SKIP' | 'RETURN_TO_QUEUE' | 'RESET_TO_WAITING' | 'CANCEL' | 'DELETE',
  passCount?: number
): LocalToken | null {
  const tokens = getLocalTokens();
  const token = tokens.find(t => t.id === tokenId || t.tokenNumber === tokenId);
  if (!token) return null;

  if (action === 'DELETE' || action === 'CANCEL') {
    token.status = 'SKIPPED';
    token.deletedAt = new Date().toISOString();
    saveLocalTokens(tokens);
    return token;
  } else if (action === 'COMPLETE') {
    token.status = 'COMPLETED';
    token.completedAt = new Date().toISOString();
  } else if (action === 'ABSENT') {
    token.status = 'ABSENT';
  } else if (action === 'RETURN_TO_QUEUE' || action === 'RESET_TO_WAITING') {
    token.status = 'WAITING';
    token.roomNumber = null;
    token.calledAt = null;
    token.recalledAt = null;
  } else if (action === 'NOT_AVAILABLE' || action === 'SKIP') {
    token.status = 'WAITING';
    token.roomNumber = null;
    token.calledAt = null;
    token.absentCount = (token.absentCount || 0) + 1;

    // Configurable pass count (defaults to stored pass count or 3)
    const effectivePassCount = (typeof passCount === 'number' && passCount > 0)
      ? passCount
      : getStoredPassCount();

    const today = getTodayString();
    const otherWaiting = tokens.filter(t =>
      t.id !== token.id &&
      t.departmentId === token.departmentId &&
      t.serviceDate === today &&
      t.status === 'WAITING'
    );
    const sortedWaiting = sortByQueueOrder(otherWaiting);

    if (sortedWaiting.length >= effectivePassCount) {
      // Place after the Nth waiting token
      const targetToken = sortedWaiting[effectivePassCount - 1];
      token.issuedAt = new Date(new Date(targetToken.issuedAt).getTime() + 1000).toISOString();
    } else if (sortedWaiting.length > 0) {
      // Place at the very end of waiting list
      const lastToken = sortedWaiting[sortedWaiting.length - 1];
      token.issuedAt = new Date(new Date(lastToken.issuedAt).getTime() + 1000).toISOString();
    } else {
      // If no other tokens are waiting, push by 5 minutes
      token.issuedAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
  }

  saveLocalTokens(tokens);
  return token;
}

export function localSearchTokens(query: string, departmentId?: string): LocalToken[] {
  const tokens = getLocalTokens();
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  // Fields are lowercased inline so `||` short-circuits: previously all five strings
  // were allocated for every token even when the token number matched on the first test.
  const matches = (t: LocalToken): boolean => {
    if (departmentId && t.departmentId !== departmentId) return false;
    if ((t.tokenNumber || '').toLowerCase().includes(q)) return true;
    const patient = t.patient;
    if (!patient) return false;
    return (
      (patient.firstName || '').toLowerCase().includes(q) ||
      (patient.lastName || '').toLowerCase().includes(q) ||
      (patient.phone || '').toLowerCase().includes(q) ||
      (patient.uhid || '').toLowerCase().includes(q)
    );
  };

  return tokens
    .filter(matches)
    .map((token) => ({ token, issuedAt: new Date(token.issuedAt).getTime() }))
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .slice(0, 20)
    .map((entry) => entry.token);
}

export function getLocalTokenStatus(tokenNumber: string, dateStr?: string, departmentId?: string) {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const targetDate = dateStr || getTodayString();
  const normToken = (tokenNumber || '').trim().toLowerCase();

  // Find token matching tokenNumber, date, and optional departmentId (or latest token if date not specified)
  const token =
    tokens.find(
      (t) =>
        (t.tokenNumber || '').toLowerCase() === normToken &&
        t.serviceDate === targetDate &&
        (!departmentId || t.departmentId === departmentId)
    ) ||
    (!dateStr
      ? tokens
          .filter(
            (t) =>
              (t.tokenNumber || '').toLowerCase() === normToken &&
              (!departmentId || t.departmentId === departmentId)
          )
          .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0]
      : null);

  if (!token) return null;

  const dept = depts.find((d) => d.id === token.departmentId);
  const departmentName = dept?.name || 'Department';
  const tokenDate = token.serviceDate || targetDate;

  // Single pass: collect who is being served and count who is ahead at the same time.
  // The caller's own issuedAt is parsed once here rather than once per comparison.
  const isWaiting = token.status === 'WAITING';
  const myWeight = PRIORITY_ORDER[token.priority] || 1;
  const myIssuedAt = new Date(token.issuedAt).getTime();

  const currentlyServing: string[] = [];
  const servingByRoom: { tokenNumber: string; roomNumber: string | null }[] = [];
  // The people in front of the caller, kept so the offline screen can show the same
  // queue preview the server sends. Sorted into service order after the sweep.
  const ahead: { tokenNumber: string; priority: string; weight: number; issuedAt: number }[] = [];
  const activeRooms = new Set<string>();
  let patientsAhead = 0;
  // Everyone issued before this token, whatever became of them — the denominator for
  // "how far through the queue am I".
  let initiallyAhead = 0;

  for (const t of tokens) {
    if (t.departmentId !== token.departmentId || t.serviceDate !== tokenDate) continue;

    if (new Date(t.issuedAt).getTime() < myIssuedAt) initiallyAhead++;

    if (t.status === 'CALLED') {
      currentlyServing.push(t.tokenNumber);
      servingByRoom.push({ tokenNumber: t.tokenNumber, roomNumber: t.roomNumber || null });
      if (t.roomNumber) activeRooms.add(t.roomNumber);
    } else if (isWaiting && t.status === 'WAITING') {
      const tWeight = PRIORITY_ORDER[t.priority] || 1;
      const tIssuedAt = new Date(t.issuedAt).getTime();
      if (tWeight > myWeight || (tWeight === myWeight && tIssuedAt < myIssuedAt)) {
        patientsAhead++;
        ahead.push({ tokenNumber: t.tokenNumber, priority: t.priority, weight: tWeight, issuedAt: tIssuedAt });
      }
    } else if (t.status === 'COMPLETED' && t.roomNumber) {
      activeRooms.add(t.roomNumber);
    }
  }

  // Service order: highest priority first, then earliest issued. The caller's immediate
  // predecessors are the tail of that, which is what the preview shows.
  ahead.sort((a, b) => (b.weight - a.weight) || (a.issuedAt - b.issuedAt));
  const aheadTokens = ahead
    .slice(-5)
    .map((t) => (t.priority === 'EMERGENCY' ? `${t.tokenNumber} 🚨` : t.tokenNumber));

  // No timing history is mirrored locally, so this stays on the flat default rather than
  // inventing an average. `sampleSize: 0` tells the UI to say so.
  const perPatientMins = 5;
  const roomCount = Math.max(1, activeRooms.size);
  const estimatedWaitTimeMins = isWaiting
    ? Math.ceil(patientsAhead / roomCount) * perPatientMins +
      (currentlyServing.length > 0 ? Math.round(perPatientMins / 2) : 0)
    : 0;

  return {
    tokenNumber: token.tokenNumber,
    status: token.status,
    priority: token.priority,
    serviceDate: token.serviceDate,
    issuedAt: token.issuedAt,
    calledAt: token.calledAt ? new Date(token.calledAt).getTime() : null,
    recalledAt: token.recalledAt ? new Date(token.recalledAt).getTime() : null,
    departmentId: token.departmentId,
    departmentName,
    roomNumber: token.roomNumber || null,
    currentlyServing,
    servingByRoom,
    patientsAhead: token.status === 'WAITING' ? patientsAhead : 0,
    initiallyAhead,
    aheadTokens: token.status === 'WAITING' ? aheadTokens : [],
    estimatedWaitTimeMins: token.status === 'WAITING' ? estimatedWaitTimeMins : 0,
    etaBasis: {
      avgConsultMins: perPatientMins,
      activeRooms: roomCount,
      sampleSize: 0,
      isReliable: false,
    },
  };
}

export function getLocalAnalytics(departmentId?: string, dateStr?: string) {
  const tokens = getLocalTokens();
  const targetDate = dateStr || getTodayString();

  // Previously this built a `filtered` array and then swept it twelve more times, once
  // per statistic, allocating an intermediate array each time. Everything below is
  // accumulated in a single pass; sums are added in the same left-to-right order the
  // old `reduce` used, so the rounded averages come out bit-for-bit identical.
  let totalGenerated = 0;
  let completedCount = 0;
  let waitingCount = 0;
  let calledCount = 0;
  let absentCount = 0;
  let skippedCount = 0;
  let emergency = 0;
  let senior = 0;
  let normal = 0;

  let waitTimeTotal = 0;
  let waitTimeCount = 0;
  let consultationTotal = 0;
  let consultationCount = 0;

  const hourlyDistribution: Record<string, number> = {};
  for (let h = 8; h <= 18; h++) {
    hourlyDistribution[`${String(h).padStart(2, '0')}:00`] = 0;
  }

  const roomStatsMap = new Map<string, number>();

  for (const t of tokens) {
    if (departmentId && t.departmentId !== departmentId) continue;
    if (t.serviceDate !== targetDate) continue;

    totalGenerated++;

    const isCompleted = t.status === 'COMPLETED';
    if (isCompleted) completedCount++;
    else if (t.status === 'WAITING') waitingCount++;
    else if (t.status === 'CALLED') calledCount++;
    else if (t.status === 'ABSENT') absentCount++;
    else if (t.status === 'SKIPPED') skippedCount++;

    if (t.priority === 'EMERGENCY') emergency++;
    else if (t.priority === 'SENIOR') senior++;
    else if (t.priority === 'NORMAL') normal++;

    // Parsed once and reused for the wait time, the consultation time and the hour bucket.
    const issuedAt = new Date(t.issuedAt);
    const calledAtMs = t.calledAt ? new Date(t.calledAt).getTime() : 0;

    if (t.calledAt && t.issuedAt) {
      waitTimeTotal += (calledAtMs - issuedAt.getTime()) / 60_000;
      waitTimeCount++;
    }

    if (isCompleted && t.calledAt && t.completedAt) {
      consultationTotal += (new Date(t.completedAt).getTime() - calledAtMs) / 60_000;
      consultationCount++;
    }

    const hr = `${String(issuedAt.getHours()).padStart(2, '0')}:00`;
    if (hourlyDistribution[hr] !== undefined) {
      hourlyDistribution[hr]++;
    }

    if (isCompleted) {
      const r = t.roomNumber || '101';
      roomStatsMap.set(r, (roomStatsMap.get(r) || 0) + 1);
    }
  }

  const roomStats = Array.from(roomStatsMap, ([roomNumber, totalServed]) => ({
    roomNumber,
    totalServed,
  }));

  return {
    date: targetDate,
    totalGenerated,
    completedCount,
    waitingCount,
    calledCount,
    absentCount,
    skippedCount,
    priorityCounts: { emergency, senior, normal },
    avgWaitTimeMins: waitTimeCount > 0 ? Math.round(waitTimeTotal / waitTimeCount) : 0,
    avgConsultationTimeMins:
      consultationCount > 0 ? Math.round(consultationTotal / consultationCount) : 0,
    hourlyDistribution,
    roomStats,
  };
}
