import { fetchWithOfflineSync } from './offlineSync';

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
  patients?: Array<{ firstName?: string; lastName?: string; phone?: string; uhid?: string; priority?: string; customTokenNumber?: string }>
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

export async function callNextPatient(departmentId: string, roomNumber: string, tokenIdentifier?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/next/${departmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, tokenIdentifier, tokenNumber: tokenIdentifier }),
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
  action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE' | 'RETURN_TO_QUEUE' | 'RESET_TO_WAITING' | 'CANCEL' | 'DELETE',
  passCount?: number,
  // Token numbers restart at 1 in every department every morning, so `tokenId` only
  // identifies a row once it is paired with a department. Pass it whenever the caller
  // holds a token *number* rather than a UUID.
  departmentId?: string
) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/action/${tokenId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, passCount, departmentId }),
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

export async function getLiveQueue(departmentId: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/live/${departmentId}`);
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

export async function deleteRoom(id: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete room');
  return response.json();
}
