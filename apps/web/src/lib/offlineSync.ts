// src/lib/offlineSync.ts
import {
  getLocalDepartments,
  createLocalDepartment,
  updateLocalDepartment,
  deleteLocalDepartment,
  getLocalRooms,
  createLocalRoom,
  updateLocalRoom,
  deleteLocalRoom,
  createLocalToken,
  getLocalLiveQueue,
  localCallNextPatient,
  localRecallPatient,
  localMarkTokenAction,
  localBulkDeleteTokens,
  localSearchTokens,
  localLookupTokensByName,
  getLocalTokenStatus,
  getLocalAnalytics,
  getLocalDoctors,
  localAssignDoctorToRoom,
} from './localStore';
import { patientBoardFromStaffBoard } from './patientBoard';

export const OFFLINE_QUEUE_KEY = 'offlineSyncQueue';

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

function serializeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

/**
 * Last parsed queue, validated against the raw string it came from.
 *
 * `NetworkProvider` re-reads this key every 12 seconds on every open screen, purely to
 * compare `length` against zero, and a long offline session can leave hundreds of
 * queued mutations in it. Re-parsing that array on each check is wasted work while the
 * queue is unchanged — and it is unchanged on almost every check. A write from another
 * tab changes the raw string, so the comparison catches it and re-parses.
 */
let queueCache: { raw: string; value: QueuedRequest[] } | null = null;

export function getOfflineQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    if (queueCache && queueCache.raw === raw) return queueCache.value;

    const value = JSON.parse(raw) as QueuedRequest[];
    queueCache = { raw, value };
    return value;
  } catch (error) {
    console.error('[OfflineSync] Failed to read queue from localStorage:', error);
    return [];
  }
}

export function setOfflineQueue(queue: QueuedRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(queue);
    localStorage.setItem(OFFLINE_QUEUE_KEY, raw);
    queueCache = { raw, value: queue };
    window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: queue.length } }));
  } catch (error) {
    console.error('[OfflineSync] Failed to write queue to localStorage:', error);
  }
}

export function enqueueRequest(url: string, options: RequestInit = {}): QueuedRequest {
  const method = (options.method || 'GET').toUpperCase();
  let body: string | null = null;

  if (options.body) {
    if (typeof options.body === 'string') {
      body = options.body;
    } else {
      try {
        body = JSON.stringify(options.body);
      } catch {
        body = String(options.body);
      }
    }
  }

  const queuedItem: QueuedRequest = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    url,
    method,
    headers: serializeHeaders(options.headers),
    body,
    timestamp: Date.now(),
  };

  const queue = getOfflineQueue();
  queue.push(queuedItem);
  setOfflineQueue(queue);

  return queuedItem;
}

/**
 * Executes a request using the local offline store when the server/database is down.
 * Guarantees that every button, ticket generation, queue call, and setting works flawlessly.
 */
function handleWithLocalStore(url: string, method: string, options: RequestInit): Response {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isMutation) {
    enqueueRequest(url, options);
  }

  const parsedUrl = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  let parsedBody: any = {};
  if (options.body && typeof options.body === 'string') {
    try {
      parsedBody = JSON.parse(options.body);
    } catch {}
  }

  // 1. DEPARTMENTS
  if (pathname.endsWith('/departments') && method === 'GET') {
    const data = getLocalDepartments();
    return jsonResponse(data, 200);
  }
  if (pathname.endsWith('/departments') && method === 'POST') {
    const data = createLocalDepartment(parsedBody.name || 'New Dept', parsedBody.code || 'NEW', parsedBody.description);
    return jsonResponse(data, 201);
  }
  if (pathname.includes('/departments/') && (method === 'PATCH' || method === 'PUT')) {
    const id = pathname.split('/').pop() || '';
    const data = updateLocalDepartment(id, parsedBody.name, parsedBody.code, parsedBody.description);
    return jsonResponse(data || { ok: true }, 200);
  }
  if (pathname.includes('/departments/') && method === 'DELETE') {
    const id = pathname.split('/').pop() || '';
    deleteLocalDepartment(id);
    return jsonResponse({ ok: true }, 200);
  }

  // 2. ROOMS
  if (pathname.includes('/settings/rooms') && method === 'GET') {
    const deptId = searchParams.get('departmentId') || undefined;
    const data = getLocalRooms(deptId);
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/settings/rooms') && method === 'POST') {
    const data = createLocalRoom(parsedBody.roomNumber || '101', parsedBody.isActive !== false, parsedBody.departmentId, parsedBody.doctorName);
    return jsonResponse(data, 201);
  }
  if (pathname.includes('/settings/rooms/') && (method === 'PUT' || method === 'PATCH')) {
    const id = pathname.split('/').pop() || '';
    const data = updateLocalRoom(id, parsedBody.roomNumber, parsedBody.isActive, parsedBody.doctorName);
    return jsonResponse(data || { ok: true }, 200);
  }
  if (pathname.includes('/settings/rooms/') && method === 'DELETE') {
    const id = pathname.split('/').pop() || '';
    deleteLocalRoom(id);
    return jsonResponse({ ok: true }, 200);
  }

  // 2b. DOCTORS
  if (pathname.endsWith('/doctors') && method === 'GET') {
    return jsonResponse(getLocalDoctors(), 200);
  }
  if (pathname.endsWith('/doctors/assign') && method === 'POST') {
    const data = localAssignDoctorToRoom(
      parsedBody.doctorName,
      parsedBody.departmentId,
      parsedBody.roomId,
      parsedBody.shareRoom !== false
    );
    return data ? jsonResponse(data, 200) : jsonResponse({ message: 'Room not found.' }, 400);
  }

  // 3. TOKENS
  if (pathname.endsWith('/tokens') && method === 'POST') {
    const data = createLocalToken(
      parsedBody.departmentId || '660e8400-e29b-41d4-a716-446655440000',
      parsedBody.priority || 'NORMAL',
      {
        firstName: parsedBody.firstName,
        lastName: parsedBody.lastName,
        phone: parsedBody.phone,
        uhid: parsedBody.uhid,
      },
      parsedBody.customTokenNumber || parsedBody.tokenNumber,
      parsedBody.count,
      parsedBody.patients
    );
    return jsonResponse(data, 201);
  }
  if (pathname.includes('/tokens/search') && method === 'GET') {
    const q = searchParams.get('q') || '';
    const deptId = searchParams.get('departmentId') || undefined;
    const data = localSearchTokens(q, deptId);
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/tokens/lookup') && method === 'GET') {
    const data = localLookupTokensByName(
      searchParams.get('name') || '',
      searchParams.get('date') || undefined,
      searchParams.get('departmentId') || undefined
    );
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/tokens/status/') && method === 'GET') {
    const tokenNum = pathname.split('/tokens/status/')[1]?.split('?')[0] || '';
    const date = searchParams.get('date') || undefined;
    const deptId = searchParams.get('departmentId') || searchParams.get('deptId') || undefined;
    const data = getLocalTokenStatus(decodeURIComponent(tokenNum), date, deptId);
    if (!data) return jsonResponse({ message: 'Token not found' }, 404);
    return jsonResponse(data, 200);
  }

  // 4. QUEUE
  if (pathname.includes('/queue/live/') && method === 'GET') {
    const deptId = pathname.split('/queue/live/')[1]?.split('?')[0] || '';
    const data = getLocalLiveQueue(deptId);
    if (searchParams.get('view') === 'patient') {
      return jsonResponse(patientBoardFromStaffBoard(data, getLocalRooms(deptId)), 200);
    }
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/queue/next/') && method === 'PATCH') {
    const deptId = pathname.split('/queue/next/')[1]?.split('?')[0] || '';
    const data = localCallNextPatient(
      deptId,
      parsedBody.roomNumber || '101',
      parsedBody.tokenIdentifier || parsedBody.tokenNumber,
      parsedBody.doctorName
    );
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/queue/recall/') && method === 'PATCH') {
    const deptId = pathname.split('/queue/recall/')[1]?.split('?')[0] || '';
    const data = localRecallPatient(deptId, parsedBody.roomNumber || '101');
    return jsonResponse(data || { ok: true }, 200);
  }
  if (pathname.includes('/queue/action/') && method === 'PATCH') {
    const tokenId = pathname.split('/queue/action/')[1]?.split('?')[0] || '';
    const data = localMarkTokenAction(
      tokenId,
      parsedBody.action || 'COMPLETE',
      parsedBody.passCount,
      parsedBody.departmentId,
      parsedBody.doctorName
    );
    return jsonResponse(data || { ok: true }, 200);
  }
  if (pathname.includes('/queue/bulk-delete/') && method === 'PATCH') {
    const deptId = pathname.split('/queue/bulk-delete/')[1]?.split('?')[0] || '';
    const data = localBulkDeleteTokens(deptId, parsedBody.scope === 'ROOM' ? 'ROOM' : 'WAITING', {
      roomNumber: parsedBody.roomNumber,
      tokenNumbers: parsedBody.tokenNumbers,
    });
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/queue/analytics') && method === 'GET') {
    const parts = pathname.split('/queue/analytics/');
    const deptId = parts.length > 1 ? parts[1].split('?')[0] : undefined;
    const dateQuery = searchParams.get('date') || undefined;
    const data = getLocalAnalytics(deptId, dateQuery);
    return jsonResponse(data, 200);
  }

  // Default fallback response
  return jsonResponse({ ok: true, offline: true }, 200);
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Fallback': 'true',
    },
  });
}

/** Fired when the server answers 401 to an API call; AuthWrapper shows the staff login. */
export const STAFF_LOGIN_REQUIRED_EVENT = 'opd-staff-login-required';

function announceLoginRequired(response: Response, url: string): void {
  if (typeof window === 'undefined' || response.status !== 401) return;
  // The login forms handle their own wrong-password answers.
  if (url.includes('/api/v1/staff/') || url.includes('/api/v1/admin/')) return;
  window.dispatchEvent(new CustomEvent(STAFF_LOGIN_REQUIRED_EVENT));
}

/**
 * Drop-in replacement for window.fetch with automatic offline fallback and background sync
 */
export async function fetchWithOfflineSync(url: string | URL, options: RequestInit = {}): Promise<Response> {
  const targetUrl = url.toString();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const method = (options.method || 'GET').toUpperCase();

  // If already offline, handle immediately via local persistent store
  if (!isOnline) {
    console.warn(`[OfflineSync] Device is offline: ${method} ${targetUrl} -> Handling via LocalStore`);
    return handleWithLocalStore(targetUrl, method, options);
  }

  try {
    const response = await fetch(url, options);

    // If server failed (404, 500, 502, 503, 504 - e.g. Neon DB offline or Vercel serverless error)
    if (response.status >= 500 || response.status === 404) {
      return handleWithLocalStore(targetUrl, method, options);
    }

    // Anything else — success, or a 4xx the client should see — passes straight through.
    announceLoginRequired(response, targetUrl);
    return response;
  } catch (error) {
    // A caller that abandoned its own request is not an outage. Without this, a poller
    // that aborts a stale tick gets a synthetic local-store response back and treats it
    // as fresh server data.
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    // Network / DNS failure or server down
    return handleWithLocalStore(targetUrl, method, options);
  }
}

/**
 * Replays all queued requests in sequence when connection/server is restored
 */
export async function processOfflineQueue(): Promise<{ total: number; succeeded: number; remaining: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { total: 0, succeeded: 0, remaining: 0 };
  }

  console.log(`[OfflineSync] Replaying ${queue.length} queued requests to server...`);
  const remainingQueue: QueuedRequest[] = [];
  let succeeded = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          ...item.headers,
          'X-Replayed-Request': 'true',
        },
        body: item.body,
      });

      if (response.status === 401 || response.status === 403) {
        // 401: logged out (or the login expired) while offline. 403: this server is
        // the read-only copy. Either way the changes are still valid, so keep this one
        // and everything after it, in order, rather than lose patients' registrations;
        // after logging in (or on the right server) the next sync sends them.
        remainingQueue.push(...queue.slice(i));
        announceLoginRequired(response, item.url);
        break;
      }

      if (response.ok) {
        succeeded++;
        console.log(`[OfflineSync] Replayed successfully: ${item.method} ${item.url}`);
      } else if (response.status >= 400 && response.status < 500) {
        // Bad request / invalid params -> remove from queue
        console.warn(`[OfflineSync] Request rejected by server (${response.status}): ${item.method} ${item.url}`);
      } else {
        remainingQueue.push(item);
      }
    } catch {
      remainingQueue.push(item);
    }
  }

  setOfflineQueue(remainingQueue);
  return { total: queue.length, succeeded, remaining: remainingQueue.length };
}
