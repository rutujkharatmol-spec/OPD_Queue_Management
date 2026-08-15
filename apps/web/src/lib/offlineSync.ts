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
 * Creates a synthetic optimistic 200 OK Response
 */
function createOptimisticResponse(url: string, method: string): Response {
  const isTokenEndpoint = url.includes('/tokens');
  const isListEndpoint = url.includes('/departments') || url.includes('/settings/rooms') || url.includes('/queue');

  // Check if we have cached query data for GET requests
  if (method === 'GET') {
    const cached = getCachedQuery(url);
    if (cached !== null) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        statusText: 'OK (Offline Cache)',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Cached': 'true',
        },
      });
    }

    // Default fallback for list queries if not in cache yet
    if (isListEndpoint) {
      return new Response(JSON.stringify([]), {
        status: 200,
        statusText: 'OK (Offline Empty List)',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Fallback': 'true',
        },
      });
    }
  }

  const fallbackTokenNumber = `OFF-${Math.floor(100 + Math.random() * 900)}`;

  const payload = JSON.stringify({
    ok: true,
    offline: true,
    message: 'Action saved locally. It will automatically sync when connection returns.',
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `off-${Date.now()}`,
    tokenNumber: isTokenEndpoint ? fallbackTokenNumber : undefined,
    status: 'WAITING',
    timestamp: new Date().toISOString(),
  });

  return new Response(payload, {
    status: 200,
    statusText: 'OK (Offline Optimistic)',
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Response': 'true',
    },
  });
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
    if (isMutation) {
      console.warn(`[OfflineSync] Device is offline. Queuing request to: ${targetUrl}`);
      enqueueRequest(targetUrl, options);
    }
    return createOptimisticResponse(targetUrl, method);
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

    // If server responds with 502/503/504 gateway/service down errors
    if (!response.ok && [502, 503, 504].includes(response.status)) {
      if (isMutation) {
        console.warn(`[OfflineSync] Server error ${response.status}. Queuing for retry: ${targetUrl}`);
        enqueueRequest(targetUrl, options);
      }
      return createOptimisticResponse(targetUrl, method);
    }

    return response;
  } catch (error) {
    // Network failure (DNS error, connection drop, server starting up / ECONNREFUSED)
    if (isMutation) {
      console.warn(`[OfflineSync] Network error caught for ${targetUrl}. Enqueuing request:`, error);
      enqueueRequest(targetUrl, options);
    }
    return createOptimisticResponse(targetUrl, method);
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
      } else {
        // Keep in queue if server error (5xx)
        console.warn(`[OfflineSync] Replay failed with status ${response.status}: ${item.url}`);
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
