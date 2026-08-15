// src/lib/offlineSync.ts

export const OFFLINE_QUEUE_KEY = 'offlineSyncQueue';
const OFFLINE_CACHE_PREFIX = 'offline_cached_query_';

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
}

/**
 * Helper to extract headers into a plain serializable object
 */
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
 * Retrieve current offline queue from localStorage
 */
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

/**
 * Save updated queue to localStorage
 */
export function setOfflineQueue(queue: QueuedRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    // Dispatch custom event to notify React context/providers immediately
    window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: queue.length } }));
  } catch (error) {
    console.error('[OfflineSync] Failed to write queue to localStorage:', error);
  }
}

/**
 * Cache successful GET queries for offline availability
 */
export function setCachedQuery(url: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_CACHE_PREFIX + url, JSON.stringify(data));
  } catch {
    // LocalStorage quota may be exceeded; ignore
  }
}

/**
 * Retrieve cached GET query
 */
export function getCachedQuery<T = unknown>(url: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_PREFIX + url);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Enqueue a failed or offline mutation request
 */
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
 * Decides whether a mutation may be replayed later or must fail immediately.
 *
 * Safe to queue: operations that act on an entity which already exists by id, so
 * replaying them later still means the same thing — marking a known token COMPLETE,
 * renaming a department.
 *
 * Never queued: operations that mint new state or depend on live queue ordering.
 * Issuing a token offline would hand the patient a number no other terminal can see,
 * and a "call next" replayed minutes later would summon the wrong patient. These have
 * to surface as errors so staff retry, rather than believing the action landed.
 */
function isReplaySafe(url: string, method: string): boolean {
  if (method === 'POST' && /\/tokens(\?|$)/.test(url)) return false; // issues a new token number
  if (/\/queue\/next\//.test(url)) return false; // depends on live queue ordering
  if (/\/queue\/recall\//.test(url)) return false; // depends on who was called last
  return true;
}

/** Read while offline: serve the last cached copy, or report the outage honestly. */
function createOfflineReadResponse(url: string): Response {
  const cached = getCachedQuery(url);
  if (cached !== null) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      statusText: 'OK (Offline Cache)',
      headers: { 'Content-Type': 'application/json', 'X-Offline-Cached': 'true' },
    });
  }

  // Deliberately not an empty list. A doctor shown "no patients waiting" cannot tell
  // that apart from a genuinely empty queue and may leave the room. Callers keep their
  // last known data when a fetch fails, which is the safer failure mode.
  return new Response(
    JSON.stringify({
      offline: true,
      message: 'No connection to the OPD server, and no cached copy is available.',
    }),
    {
      status: 503,
      statusText: 'Offline (no cached data)',
      headers: { 'Content-Type': 'application/json', 'X-Offline-Response': 'true' },
    }
  );
}

/** Mutation safely stored for replay once the server is reachable. */
function createQueuedResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      offline: true,
      queued: true,
      message: 'Saved on this device. It will sync when the OPD server is reachable again.',
    }),
    {
      status: 202,
      statusText: 'Accepted (Queued Offline)',
      headers: { 'Content-Type': 'application/json', 'X-Offline-Queued': 'true' },
    }
  );
}

/** Mutation that must not be faked — the caller has to know it did not happen. */
function createOfflineRejection(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      offline: true,
      message:
        'Cannot reach the OPD server. This action was NOT saved — please retry once the connection is restored.',
    }),
    {
      status: 503,
      statusText: 'Offline (action not saved)',
      headers: { 'Content-Type': 'application/json', 'X-Offline-Response': 'true' },
    }
  );
}

/** Single decision point for what to return when the server cannot be reached. */
function handleOffline(url: string, method: string, options: RequestInit, isMutation: boolean): Response {
  if (!isMutation) return createOfflineReadResponse(url);
  if (!isReplaySafe(url, method)) return createOfflineRejection();

  enqueueRequest(url, options);
  return createQueuedResponse();
}

/**
 * Drop-in replacement for window.fetch with automatic offline queuing and read caching
 */
export async function fetchWithOfflineSync(url: string | URL, options: RequestInit = {}): Promise<Response> {
  const targetUrl = url.toString();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // If already offline
  if (!isOnline) {
    console.warn(`[OfflineSync] Device is offline: ${method} ${targetUrl}`);
    return handleOffline(targetUrl, method, options, isMutation);
  }

  try {
    const response = await fetch(url, options);

    // If successful GET query, cache the result for offline viewing
    if (response.ok && method === 'GET') {
      try {
        const cloned = response.clone();
        cloned.json().then((data) => setCachedQuery(targetUrl, data)).catch(() => {});
      } catch {}
    }

    // Server reachable but unhealthy (restarting, behind a dead proxy)
    if (!response.ok && [502, 503, 504].includes(response.status)) {
      console.warn(`[OfflineSync] Server error ${response.status}: ${method} ${targetUrl}`);
      return handleOffline(targetUrl, method, options, isMutation);
    }

    return response;
  } catch (error) {
    // Network failure (DNS error, connection drop, server starting up / ECONNREFUSED)
    console.warn(`[OfflineSync] Network error for ${method} ${targetUrl}:`, error);
    return handleOffline(targetUrl, method, options, isMutation);
  }
}

/**
 * Replays all queued requests in sequence when connection is restored
 */
export async function processOfflineQueue(): Promise<{ total: number; succeeded: number; remaining: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { total: 0, succeeded: 0, remaining: 0 };
  }

  console.log(`[OfflineSync] Replaying ${queue.length} queued requests...`);
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
        // The server rejected it on the merits (validation, already applied, gone).
        // Retrying cannot change that, so drop it instead of looping forever.
        console.error(
          `[OfflineSync] Dropping permanently rejected request (${response.status}): ${item.method} ${item.url}`
        );
      } else {
        // 5xx — server is unhealthy, worth retrying later.
        console.warn(`[OfflineSync] Replay failed with status ${response.status}, will retry: ${item.url}`);
        remainingQueue.push(item);
      }
    } catch (err) {
      // Keep in queue if network error persists
      console.warn(`[OfflineSync] Network error while replaying ${item.url}:`, err);
      remainingQueue.push(item);
    }
  }

  setOfflineQueue(remainingQueue);
  return { total: queue.length, succeeded, remaining: remainingQueue.length };
}
