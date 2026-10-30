import { fetchWithOfflineSync } from './offlineSync';
import type { NameLookupMatch } from './nameLookup';
import type { PatientBoard } from './patientBoard';

export type { NameLookupMatch, PatientBoard };

// The API is served by this same app (src/app/api/v1/**), so it is always same-origin.
// That holds for both deployments — Vercel and `next start` on the OPD server — which
// means no build-time URL to configure and nothing to rebuild when the server's IP
// changes. See next.config.ts for the temporary fallback to the old NestJS API.
export const API_BASE_URL = '/api/v1';

export function broadcastQueueUpdate(departmentId?: string) {
  if (typeof window === 'undefined') return;
  try {
    // 1. Same-window custom event
    window.dispatchEvent(new CustomEvent('opd-queue-updated', { detail: { departmentId } }));

    // 2. Cross-tab and cross-window BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('opd-queue-sync-channel');
      bc.postMessage({ type: 'QUEUE_UPDATED', departmentId, timestamp: Date.now() });
      bc.close();
    }

    // 3. Storage event trigger for external/minimized windows
    try {
      localStorage.setItem('opd_queue_last_updated', `${departmentId || 'all'}_${Date.now()}`);
    } catch {}
  } catch (err) {
    console.warn('Queue update broadcast warning:', err);
  }
}

export async function generateToken(
  departmentId: string,
  patientId?: string,
  doctorId?: string,
  priority: string = 'NORMAL',
  patientData?: { firstName?: string; lastName?: string; phone?: string; uhid?: string; },
  customTokenNumber?: string,
  count: number = 1,
  patients?: Array<{ firstName?: string; lastName?: string; phone?: string; uhid?: string; priority?: string; customTokenNumber?: string }>,
  // The doctor the desk chose. The server puts the token on that doctor's room list and
  // returns `assignedDoctor` ({ doctorName, roomNumber }) for the slip.
  assignedDoctorName?: string
) {
  const cleanCustomToken = customTokenNumber?.trim() || undefined;
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId,
      departmentId,
      doctorId,
      priority,
      customTokenNumber: cleanCustomToken,
      tokenNumber: cleanCustomToken,
      count,
      patients,
      assignedDoctorName: assignedDoctorName || undefined,
      ...(patientData || {})
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`generateToken failed: ${response.status} ${response.statusText} - ${text}`);
    let errorMessage = 'Failed to generate token';
    try {
      const parsed = JSON.parse(text);
      if (parsed.message) errorMessage = parsed.message;
      else if (parsed.error) errorMessage = parsed.error;
    } catch {}
    throw new Error(errorMessage);
  }
  const result = await response.json();
  broadcastQueueUpdate(departmentId);
  return result;
}

export async function callNextPatient(
  departmentId: string,
  roomNumber: string,
  tokenIdentifier?: string,
  // The doctor calling (Doctor Desk), credited instead of whoever is set on the room.
  doctorName?: string
) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/next/${departmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, tokenIdentifier, tokenNumber: tokenIdentifier, doctorName }),
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error(`callNextPatient failed (${response.status}):`, errText);
    throw new Error(`Failed to call patient: ${errText || response.statusText}`);
  }
  const text = await response.text();
  broadcastQueueUpdate(departmentId);
  return text ? JSON.parse(text) : null;
}

export async function markTokenAction(
  tokenId: string,
  // ARRIVED: the called patient came in (now in consultation). LATE: they did not come in
  // time; the server checks the clock and moves them back (see lib/queuePass.ts).
  action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE' | 'RETURN_TO_QUEUE' | 'RESET_TO_WAITING' | 'CANCEL' | 'DELETE' | 'ARRIVED' | 'LATE',
  passCount?: number,
  // Token numbers restart at 1 in every department every morning, so `tokenId` only
  // identifies a row once it is paired with a department. Pass it whenever the caller
  // holds a token *number* rather than a UUID.
  departmentId?: string,
  // COMPLETE only: the doctor who finished the patient, credited in analytics instead of
  // whoever was on the room when the patient was called.
  doctorName?: string
) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/action/${tokenId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, passCount, departmentId, doctorName }),
  });
  if (!response.ok) throw new Error('Failed to mark token action');
  const result = await response.json();
  broadcastQueueUpdate(departmentId);
  return result;
}

export async function deleteToken(tokenId: string, departmentId?: string) {
  return markTokenAction(tokenId, 'DELETE', undefined, departmentId);
}

/**
 * Clears a whole queue in one request.
 *
 * Deliberately not a loop over `markTokenAction`: a hundred sequential PATCHes is slow
 * enough for the board to visibly drain, and a failure halfway leaves the line in a state
 * neither the user nor the retry can reason about. The server decides the membership of
 * `WAITING` and a room's called patients, so a stale sidebar cannot widen the delete.
 */
export async function bulkDeleteTokens(
  departmentId: string,
  scope: 'WAITING' | 'ROOM',
  options: { roomNumber?: string; tokenNumbers?: string[] } = {}
): Promise<{ deleted: number }> {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/bulk-delete/${departmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, ...options }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to clear queue');
  }
  const result = await response.json();
  broadcastQueueUpdate(departmentId);
  return result;
}

export type TokenStatusValue = 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'ABSENT';
export type TokenPriorityValue = 'NORMAL' | 'SENIOR' | 'EMERGENCY';

/**
 * Shape returned by both `/tokens/status/:tokenNumber` and its offline mirror
 * (`getLocalTokenStatus` in ./localStore). The two must stay in step — the patient page
 * cannot tell which one answered it.
 */
export interface TokenStatusResponse {
  tokenNumber: string;
  patientName?: string | null;
  status: TokenStatusValue;
  priority: TokenPriorityValue;
  serviceDate: string;
  issuedAt: string;
  calledAt?: number | string | null;
  recalledAt?: number | string | null;
  departmentId: string;
  departmentName: string;
  roomNumber: string | null;
  /** Token numbers currently being consulted anywhere in the department. */
  currentlyServing: string[];
  /** The same tokens, paired with the room to walk to. */
  servingByRoom: { tokenNumber: string; roomNumber: string | null }[];
  patientsAhead: number;
  /**
   * How many were issued before this token today, regardless of what became of them.
   * The denominator for queue progress — stable across reloads, unlike a count taken
   * when the page happened to be opened.
   */
  initiallyAhead: number;
  /** Up to five tokens immediately in front of this one, in service order. */
  aheadTokens: string[];
  estimatedWaitTimeMins: number;
  /** What the estimate was derived from, so the UI can explain or hedge it. */
  etaBasis: {
    avgConsultMins: number;
    activeRooms: number;
    sampleSize: number;
    isReliable: boolean;
  };
}

export async function getTokenStatus(
  tokenNumber: string,
  date?: string,
  departmentId?: string,
  signal?: AbortSignal,
): Promise<TokenStatusResponse> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (departmentId) params.set('departmentId', departmentId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens/status/${encodeURIComponent(tokenNumber)}${query}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error('Failed to fetch token status');
  return response.json();
}

/**
 * The patient page's department board: token numbers and rooms only, CDN-cached for a
 * few seconds. Staff screens read the full board through useQueueStore instead.
 */
export async function getLiveQueue(departmentId: string): Promise<PatientBoard> {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/live/${departmentId}?view=patient`);
  if (!response.ok) throw new Error('Failed to fetch live queue');
  return response.json();
}

export async function getDepartments() {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments`);
  if (!response.ok) throw new Error('Failed to fetch departments');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createDepartment(name: string, code: string, description?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, description }),
  });
  if (!response.ok) throw new Error('Failed to create department');
  return response.json();
}

export async function updateDepartment(id: string, name: string, code: string, description?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, description }),
  });
  if (!response.ok) throw new Error('Failed to update department');
  return response.json();
}

export async function deleteDepartment(id: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete department');
  return response.json();
}

export async function recallPatient(departmentId: string, roomNumber: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/recall/${departmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to recall patient');
  }
  const result = await response.json();
  broadcastQueueUpdate(departmentId);
  return result;
}

/** Patient page: today's (or `date`'s) tokens whose patient name matches, across departments. */
export async function findTokensByName(name: string, date?: string, signal?: AbortSignal): Promise<NameLookupMatch[]> {
  const params = new URLSearchParams({ name });
  if (date) params.set('date', date);
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens/lookup?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Failed to look up name');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export type PatientLookup =
  | { found: false }
  | {
      found: true;
      name: string;
      phone: string;
      uhid: string | null;
      /** Who saw them last in this department (or was given to them last time). */
      lastDoctorName: string | null;
      lastVisit: { date: string; department: string } | null;
    };

/**
 * Registration: who a scanned or typed UHID belongs to. Null when the look-up couldn't be
 * done (offline, logged out); the desk then types the details as before. Plain fetch, not
 * the offline layer: there is no offline copy of patients to answer from.
 */
export async function lookupPatientByUhid(uhid: string, departmentId?: string): Promise<PatientLookup | null> {
  try {
    const params = new URLSearchParams({ uhid });
    if (departmentId) params.set('departmentId', departmentId);
    const response = await fetch(`${API_BASE_URL}/patients/lookup?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as PatientLookup;
  } catch {
    return null;
  }
}

export async function searchTokens(query: string, departmentId?: string) {
  const params = new URLSearchParams({ q: query });
  if (departmentId) params.append('departmentId', departmentId);
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens/search?${params.toString()}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function getDepartmentAnalytics(departmentId?: string, date?: string) {
  const url = departmentId
    ? `${API_BASE_URL}/queue/analytics/${departmentId}${date ? `?date=${date}` : ''}`
    : `${API_BASE_URL}/queue/analytics${date ? `?date=${date}` : ''}`;
  const response = await fetchWithOfflineSync(url);
  if (!response.ok) throw new Error('Failed to fetch analytics');
  return response.json();
}

export async function getRooms(departmentId?: string) {
  const url = departmentId ? `${API_BASE_URL}/settings/rooms?departmentId=${departmentId}` : `${API_BASE_URL}/settings/rooms`;
  const response = await fetchWithOfflineSync(url);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createRoom(roomNumber: string, isActive: boolean = true, departmentId?: string, doctorName?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, isActive, departmentId, doctorName }),
  });
  if (!response.ok) throw new Error('Failed to create room');
  return response.json();
}

export async function updateRoom(id: string, roomNumber?: string, isActive?: boolean, doctorName?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, isActive, doctorName }),
  });
  if (!response.ok) throw new Error('Failed to update room');
  return response.json();
}

export type DoctorListItem = { name: string; departmentId: string | null; roomNumber: string | null };

export async function getDoctors(): Promise<DoctorListItem[]> {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/doctors`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Adds the doctor's name to the room (shown on TV) and takes it off any other room.
 * shareRoom false replaces the doctors already in the room instead of joining them.
 */
export async function assignDoctorToRoom(doctorName: string, departmentId: string, roomId: string, shareRoom = true) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/doctors/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doctorName, departmentId, roomId, shareRoom }),
  });
  if (!response.ok) {
    let message = 'Could not save your room. Please try again.';
    try {
      const parsed = await response.json();
      if (parsed?.message) message = parsed.message;
    } catch {}
    throw new Error(message);
  }
  const result = await response.json();
  broadcastQueueUpdate(departmentId);
  return result as {
    doctor: { id: string; name: string };
    room: { id: string; roomNumber: string; departmentId: string | null; doctorName: string | null };
  };
}

export async function deleteRoom(id: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete room');
  return response.json();
}
