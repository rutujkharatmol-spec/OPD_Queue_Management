// src/lib/roomQueueSettings.ts

const ROOM_STAGED_QUEUE_PREFIX = 'opd_room_staged_queue_';
const AUTO_CALL_ROOMS_PREFIX = 'opd_auto_call_rooms_';

function getStorageKey(prefix: string, deptId?: string): string {
  return `${prefix}${deptId || 'default'}`;
}

/**
 * Parsed-value cache, keyed by storage key and validated against the raw string.
 *
 * Mirrors the cache in `localStore.ts`. The doctor dashboard re-reads these keys on
 * every `room-queues-updated` / `auto-call-updated` event and on every call into a
 * room, and each read used to re-parse the whole staged-queue object from scratch.
 * Comparing the raw string first turns a repeat read into a string compare. A write
 * from another tab changes the raw string, so the check catches it; writes from this
 * tab refresh the entry directly.
 *
 * The cached object is shared with callers, so nothing here mutates a value it read —
 * every mutator below builds a fresh object and writes that. That is also what keeps
 * React honest: the identity changes exactly when the data changes, so
 * `setRoomStagedQueues(...)` re-renders on a real edit and bails out otherwise.
 */
const parseCache = new Map<string, { raw: string; value: unknown }>();

function readObjectKey<T extends object>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  const cached = parseCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  const value = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) return null;

  parseCache.set(key, { raw, value });
  return value as T;
}

/** First key with the given prefix holding an object the caller accepts. */
function scanForPrefix<T extends object>(prefix: string, accept: (value: T) => boolean): T | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const value = readObjectKey<T>(key);
    if (value && accept(value)) return value;
  }
  return null;
}

/**
 * Persists to the department key and mirrors to the default key.
 *
 * Serialised once and reused for both writes — the previous version called
 * `JSON.stringify` twice on the same object, doubling the cost of the most expensive
 * step in a staged-queue edit.
 */
function writeObjectKey(prefix: string, deptId: string, value: object): void {
  const raw = JSON.stringify(value);
  const key = getStorageKey(prefix, deptId);
  const defaultKey = getStorageKey(prefix, 'default');

  localStorage.setItem(key, raw);
  parseCache.set(key, { raw, value });

  if (defaultKey !== key) {
    localStorage.setItem(defaultKey, raw);
    parseCache.set(defaultKey, { raw, value });
  }
}

/** `MED-004 🚨` and ` med-004 ` are the same patient. */
function normalizeToken(tokenStr: string): string {
  return tokenStr.replace(' 🚨', '').trim().toLowerCase();
}

/**
 * A copy of `queues` with `cleanToken` removed from every room.
 *
 * Rooms containing no match keep their existing array instance instead of a filtered
 * copy: a department with eight rooms used to allocate eight arrays per edit in order
 * to change one of them. Nothing mutates these arrays afterwards, so sharing is safe.
 */
function withTokenRemoved(
  queues: Record<string, string[]>,
  cleanToken: string
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const room of Object.keys(queues)) {
    const list = Array.isArray(queues[room]) ? queues[room] : [];
    let kept: string[] | null = null;

    for (let i = 0; i < list.length; i++) {
      if (normalizeToken(list[i]) === cleanToken) {
        if (!kept) kept = list.slice(0, i);
      } else if (kept) {
        kept.push(list[i]);
      }
    }

    result[room] = kept || list;
  }

  return result;
}

/**
 * Retrieves all staged token queues across rooms for a department.
 */
export function getAllRoomStagedQueues(deptId?: string): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const hasEntries = (value: Record<string, string[]>) => Object.keys(value).length > 0;

    if (deptId) {
      const data = readObjectKey<Record<string, string[]>>(
        getStorageKey(ROOM_STAGED_QUEUE_PREFIX, deptId)
      );
      if (data && hasEntries(data)) return data;
    }
    // Fallback: check any existing room staged queue key
    const found = scanForPrefix<Record<string, string[]>>(ROOM_STAGED_QUEUE_PREFIX, hasEntries);
    if (found) return found;
  } catch {
    // ignore
  }
  return {};
}

/**
 * Retrieves the staged token queue for a specific room in a department.
 */
export function getRoomStagedQueue(deptId: string, roomNumber: string): string[] {
  const all = getAllRoomStagedQueues(deptId);
  return Array.isArray(all[roomNumber]) ? all[roomNumber] : [];
}

/**
 * Adds a token to a room's staged queue.
 * Ensures the token is not duplicated across other rooms in the same department.
 */
export function addTokenToRoomQueue(deptId: string, roomNumber: string, tokenStr: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const cleanToken = normalizeToken(tokenStr);
    const allQueues = withTokenRemoved(getAllRoomStagedQueues(deptId), cleanToken);

    // The token was just stripped from every room above, so it cannot still be present.
    const currentRoomQueue = (allQueues[roomNumber] || []).concat(tokenStr);
    allQueues[roomNumber] = currentRoomQueue;

    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, allQueues);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
    return currentRoomQueue;
  } catch {
    return [];
  }
}

/**
 * Removes a token from a room's staged queue.
 */
export function removeTokenFromRoomQueue(deptId: string, roomNumber: string, tokenStr: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const allQueues = withTokenRemoved(getAllRoomStagedQueues(deptId), normalizeToken(tokenStr));

    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, allQueues);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
    return allQueues[roomNumber] || [];
  } catch {
    return [];
  }
}

/**
 * Clears and returns the next token from a room's staged queue.
 */
export function popNextFromRoomQueue(deptId: string, roomNumber: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = getAllRoomStagedQueues(deptId);
    const roomQueue = current[roomNumber] || [];
    if (roomQueue.length === 0) return null;

    const nextToken = roomQueue[0] || null;
    const allQueues = { ...current, [roomNumber]: roomQueue.slice(1) };

    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, allQueues);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
    return nextToken;
  } catch {
    return null;
  }
}

/**
 * Retrieves the Auto-Call state for all rooms in a department.
 */
export function getAutoCallRooms(deptId?: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    if (deptId) {
      const data = readObjectKey<Record<string, boolean>>(
        getStorageKey(AUTO_CALL_ROOMS_PREFIX, deptId)
      );
      if (data) return data;
    }
    const found = scanForPrefix<Record<string, boolean>>(AUTO_CALL_ROOMS_PREFIX, () => true);
    if (found) return found;
  } catch {
    // ignore
  }
  return {};
}

/**
 * Toggles or sets Auto-Call for a specific room.
 */
export function setAutoCallRoom(deptId: string, roomNumber: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const current = { ...getAutoCallRooms(deptId), [roomNumber]: enabled };
    writeObjectKey(AUTO_CALL_ROOMS_PREFIX, deptId, current);
    window.dispatchEvent(new CustomEvent('auto-call-updated', { detail: { deptId, roomNumber, enabled } }));
  } catch {
    // ignore
  }
}
