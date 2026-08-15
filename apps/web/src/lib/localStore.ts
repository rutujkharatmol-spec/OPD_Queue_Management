// src/lib/localStore.ts
/**
 * Fully resilient client-side persistent database using localStorage.
 * Ensures the entire webapp operates with zero downtime even if:
 * - Vercel / Serverless function fails or lacks DATABASE_URL
 * - Cloud Neon / PostgreSQL database is offline or asleep
 * - Railway API is down or restarting
 * - Device is completely offline with zero internet connection
 */

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

function getStorage<T>(key: string, defaultVal: T): T {
  if (typeof window === 'undefined') return defaultVal;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function setStorage<T>(key: string, val: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
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
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dept-${Date.now()}`,
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
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `room-${Date.now()}`,
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
  return getStorage<LocalToken[]>(TOKENS_KEY, []);
}

export function saveLocalTokens(tokens: LocalToken[]): void {
  setStorage(TOKENS_KEY, tokens);
}

export function createLocalToken(
  departmentId: string,
  priority: 'NORMAL' | 'SENIOR' | 'EMERGENCY' = 'NORMAL',
  patientData?: { firstName?: string; lastName?: string; phone?: string; uhid?: string }
): LocalToken {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const dept = depts.find(d => d.id === departmentId) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;

  const today = getTodayString();
  const todayDeptTokens = tokens.filter(t => t.departmentId === targetDeptId && t.serviceDate === today);
  const sequence = todayDeptTokens.length + 1;
  const tokenNumber = `${dept.code}-${String(sequence).padStart(3, '0')}`;

  const cleanFirstName = patientData?.firstName?.trim() || 'Patient';
  const cleanLastName = patientData?.lastName?.trim() || '';
  const cleanPhone = patientData?.phone?.trim() || '';
  const cleanUhid = patientData?.uhid?.trim() || null;

  const patientId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pat-${Date.now()}`;
  const patient: LocalPatient = {
    id: patientId,
    firstName: cleanFirstName,
    lastName: cleanLastName,
    phone: cleanPhone,
    uhid: cleanUhid,
  };

  const newToken: LocalToken = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tok-${Date.now()}`,
    tokenNumber,
    serviceDate: today,
    status: 'WAITING',
    priority,
    roomNumber: null,
    issuedAt: new Date().toISOString(),
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
  saveLocalTokens(tokens);
  return newToken;
}

export function getLocalLiveQueue(departmentId: string) {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const rooms = getLocalRooms(departmentId);

  const dept = depts.find(d => d.id === departmentId) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;
  const today = getTodayString();

  const todayTokens = tokens.filter(t => t.departmentId === targetDeptId && t.serviceDate === today);

  // Active called tokens (most recent per room)
  const calledTokens = todayTokens
    .filter(t => t.status === 'CALLED')
    .sort((a, b) => new Date(b.calledAt || 0).getTime() - new Date(a.calledAt || 0).getTime());

  const roomDoctorMap = new Map<string, string>();
  rooms.forEach(r => {
    if (r.doctorName) roomDoctorMap.set(r.roomNumber, r.doctorName);
  });

  const seenRooms = new Set<string>();
  const activeTokens = [];

  for (const t of calledTokens) {
    const room = t.roomNumber || '101';
    if (!seenRooms.has(room)) {
      seenRooms.add(room);
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
  }

  // Waiting list (emergencies first, then issuedAt)
  const waitingTokens = todayTokens
    .filter(t => t.status === 'WAITING')
    .sort((a, b) => {
      const pOrder = { EMERGENCY: 3, SENIOR: 2, NORMAL: 1 };
      const diff = (pOrder[b.priority] || 1) - (pOrder[a.priority] || 1);
      if (diff !== 0) return diff;
      return new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
    });

  return {
    department: dept.name,
    activeTokens,
    nextTokens: waitingTokens.map(t => t.priority === 'EMERGENCY' ? `${t.tokenNumber} 🚨` : t.tokenNumber),
  };
}

export function localCallNextPatient(departmentId: string, roomNumber: string): LocalToken | null {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const dept = depts.find(d => d.id === departmentId) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;
  const today = getTodayString();

  // 1. Mark existing called patient in this room as COMPLETED
  tokens.forEach(t => {
    if (t.departmentId === targetDeptId && t.roomNumber === roomNumber && t.status === 'CALLED') {
      t.status = 'COMPLETED';
      t.completedAt = new Date().toISOString();
    }
  });

  // 2. Find next waiting token
  const waitingTokens = tokens
    .filter(t => t.departmentId === targetDeptId && t.serviceDate === today && t.status === 'WAITING')
    .sort((a, b) => {
      const pOrder = { EMERGENCY: 3, SENIOR: 2, NORMAL: 1 };
      const diff = (pOrder[b.priority] || 1) - (pOrder[a.priority] || 1);
      if (diff !== 0) return diff;
      return new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
    });

  if (waitingTokens.length === 0) {
    saveLocalTokens(tokens);
    return null;
  }

  const nextToken = waitingTokens[0];
  nextToken.status = 'CALLED';
  nextToken.roomNumber = roomNumber;
  nextToken.calledAt = new Date().toISOString();
  nextToken.recalledAt = null;

  saveLocalTokens(tokens);
  return nextToken;
}

export function localRecallPatient(departmentId: string, roomNumber: string): LocalToken | null {
  const tokens = getLocalTokens();
  const depts = getLocalDepartments();
  const dept = depts.find(d => d.id === departmentId) || depts[0] || DEFAULT_DEPARTMENTS[0];
  const targetDeptId = dept.id;

  const activeToken = tokens
    .filter(t => t.departmentId === targetDeptId && t.roomNumber === roomNumber && t.status === 'CALLED')
    .sort((a, b) => new Date(b.calledAt || 0).getTime() - new Date(a.calledAt || 0).getTime())[0];

  if (!activeToken) return null;

  activeToken.recalledAt = new Date().toISOString();
  saveLocalTokens(tokens);
  return activeToken;
}

export function localMarkTokenAction(tokenId: string, action: 'COMPLETE' | 'ABSENT' | 'NOT_AVAILABLE' | 'SKIP'): LocalToken | null {
  const tokens = getLocalTokens();
  const token = tokens.find(t => t.id === tokenId);
  if (!token) return null;

  if (action === 'COMPLETE') {
    token.status = 'COMPLETED';
    token.completedAt = new Date().toISOString();
  } else if (action === 'ABSENT') {
    token.status = 'ABSENT';
  } else if (action === 'NOT_AVAILABLE' || action === 'SKIP') {
    token.status = 'WAITING';
    token.roomNumber = null;
    token.calledAt = null;
    token.absentCount = (token.absentCount || 0) + 1;
    // Push back in queue (timestamp + 10 mins)
    token.issuedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  }

  saveLocalTokens(tokens);
  return token;
}

export function localSearchTokens(query: string, departmentId?: string): LocalToken[] {
  const tokens = getLocalTokens();
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  return tokens
    .filter(t => {
      if (departmentId && t.departmentId !== departmentId) return false;
      const tNum = (t.tokenNumber || '').toLowerCase();
      const pFirst = (t.patient?.firstName || '').toLowerCase();
      const pLast = (t.patient?.lastName || '').toLowerCase();
      const pPhone = (t.patient?.phone || '').toLowerCase();
      const pUhid = (t.patient?.uhid || '').toLowerCase();

      return tNum.includes(q) || pFirst.includes(q) || pLast.includes(q) || pPhone.includes(q) || pUhid.includes(q);
    })
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
    .slice(0, 20);
}

export function getLocalAnalytics(departmentId?: string, dateStr?: string) {
  const tokens = getLocalTokens();
  const targetDate = dateStr || getTodayString();

  const filtered = tokens.filter(t => {
    if (departmentId && t.departmentId !== departmentId) return false;
    return t.serviceDate === targetDate;
  });

  const totalGenerated = filtered.length;
  const completed = filtered.filter(t => t.status === 'COMPLETED');
  const waiting = filtered.filter(t => t.status === 'WAITING');
  const called = filtered.filter(t => t.status === 'CALLED');
  const absent = filtered.filter(t => t.status === 'ABSENT');
  const skipped = filtered.filter(t => t.status === 'SKIPPED');

  const priorityCounts = {
    emergency: filtered.filter(t => t.priority === 'EMERGENCY').length,
    senior: filtered.filter(t => t.priority === 'SENIOR').length,
    normal: filtered.filter(t => t.priority === 'NORMAL').length,
  };

  const waitTimes = filtered
    .filter(t => t.calledAt && t.issuedAt)
    .map(t => (new Date(t.calledAt!).getTime() - new Date(t.issuedAt).getTime()) / (1000 * 60));

  const avgWaitTimeMins = waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;

  const consultationTimes = completed
    .filter(t => t.calledAt && t.completedAt)
    .map(t => (new Date(t.completedAt!).getTime() - new Date(t.calledAt!).getTime()) / (1000 * 60));

  const avgConsultationTimeMins =
    consultationTimes.length > 0 ? Math.round(consultationTimes.reduce((a, b) => a + b, 0) / consultationTimes.length) : 0;

  const hourlyDistribution: Record<string, number> = {};
  for (let h = 8; h <= 18; h++) {
    hourlyDistribution[`${String(h).padStart(2, '0')}:00`] = 0;
  }
  filtered.forEach(t => {
    const hr = `${String(new Date(t.issuedAt).getHours()).padStart(2, '0')}:00`;
    if (hourlyDistribution[hr] !== undefined) {
      hourlyDistribution[hr]++;
    }
  });

  const roomStatsMap = new Map<string, number>();
  completed.forEach(t => {
    const r = t.roomNumber || '101';
    roomStatsMap.set(r, (roomStatsMap.get(r) || 0) + 1);
  });

  const roomStats = Array.from(roomStatsMap.entries()).map(([roomNumber, totalServed]) => ({
    roomNumber,
    totalServed,
  }));

  return {
    date: targetDate,
    totalGenerated,
    completedCount: completed.length,
    waitingCount: waiting.length,
    calledCount: called.length,
    absentCount: absent.length,
    skippedCount: skipped.length,
    priorityCounts,
    avgWaitTimeMins,
    avgConsultationTimeMins,
    hourlyDistribution,
    roomStats,
  };
}
