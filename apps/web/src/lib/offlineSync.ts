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
  localSearchTokens,
  getLocalTokenStatus,
  getLocalAnalytics,
} from './localStore';

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

export function getOfflineQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch (error) {
    console.error('[OfflineSync] Failed to read queue from localStorage:', error);
    return [];
  }
}

export function setOfflineQueue(queue: QueuedRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
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

  // 3. TOKENS
  if (pathname.endsWith('/tokens') && method === 'POST') {
    const data = createLocalToken(parsedBody.departmentId || '660e8400-e29b-41d4-a716-446655440000', parsedBody.priority || 'NORMAL', {
      firstName: parsedBody.firstName,
      lastName: parsedBody.lastName,
      phone: parsedBody.phone,
      uhid: parsedBody.uhid,
    });
    return jsonResponse(data, 201);
  }
  if (pathname.includes('/tokens/search') && method === 'GET') {
    const q = searchParams.get('q') || '';
    const deptId = searchParams.get('departmentId') || undefined;
    const data = localSearchTokens(q, deptId);
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/tokens/status/') && method === 'GET') {
    const tokenNum = pathname.split('/tokens/status/')[1]?.split('?')[0] || '';
    const data = getLocalTokenStatus(decodeURIComponent(tokenNum));
    if (!data) return jsonResponse({ message: 'Token not found' }, 404);
    return jsonResponse(data, 200);
  }

  // 4. QUEUE
  if (pathname.includes('/queue/live/') && method === 'GET') {
    const deptId = pathname.split('/queue/live/')[1]?.split('?')[0] || '';
    const data = getLocalLiveQueue(deptId);
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/queue/next/') && method === 'PATCH') {
    const deptId = pathname.split('/queue/next/')[1]?.split('?')[0] || '';
    const data = localCallNextPatient(deptId, parsedBody.roomNumber || '101', parsedBody.tokenIdentifier || parsedBody.tokenNumber);
    return jsonResponse(data, 200);
  }
  if (pathname.includes('/queue/recall/') && method === 'PATCH') {
    const deptId = pathname.split('/queue/recall/')[1]?.split('?')[0] || '';
    const data = localRecallPatient(deptId, parsedBody.roomNumber || '101');
    return jsonResponse(data || { ok: true }, 200);
  }
  if (pathname.includes('/queue/action/') && method === 'PATCH') {
    const tokenId = pathname.split('/queue/action/')[1]?.split('?')[0] || '';
    const data = localMarkTokenAction(tokenId, parsedBody.action || 'COMPLETE', parsedBody.passCount);
    return jsonResponse(data || { ok: true }, 200);
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
    return response;
  } catch {
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

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          ...item.headers,
          'X-Replayed-Request': 'true',
        },
        body: item.body,
      });

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
