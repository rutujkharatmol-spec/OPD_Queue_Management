// src/lib/roomQueueSettings.ts
//
// Room staging ("send this waiting patient to Room 3") is stored in the database
// (tokens.staged_room) so every screen sees the same lists. This module keeps a local
// copy in localStorage so the dashboard can read it instantly and keep working offline:
// each change is applied here at once and sent to the server, and the live board's
// `stagedByRoom` (fetched every few seconds by useQueueStore) replaces the local copy.
//
// Auto-call and auto-pull limits below are still per-browser settings.

import { fetchWithOfflineSync } from './offlineSync';

const ROOM_STAGED_QUEUE_PREFIX = 'opd_room_staged_queue_';

type StageOp = 'ADD' | 'REMOVE' | 'CLEAR_ROOM' | 'CLEAR_ALL';

/** Staging changes still on their way to the server, per department. */
const pendingByDept = new Map<string, number>();
/** When the last staging change for a department finished sending. */
const lastSentAtByDept = new Map<string, number>();

/**
 * Sends one staging change to the server. Offline, fetchWithOfflineSync queues it and
 * sends it on reconnect, in order with the token it refers to.
 */
function sendStaging(deptId: string, op: StageOp, roomNumber?: string, tokenNumbers?: string[]): void {
  if (!deptId || deptId === 'default') return;
  pendingByDept.set(deptId, (pendingByDept.get(deptId) || 0) + 1);
  fetchWithOfflineSync(`/api/v1/queue/stage/${encodeURIComponent(deptId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, roomNumber, tokenNumbers }),
  })
    .catch(() => {})
    .finally(() => {
      pendingByDept.set(deptId, Math.max(0, (pendingByDept.get(deptId) || 1) - 1));
      lastSentAtByDept.set(deptId, Date.now());
    });
}

/** The token number as stored on the server: no emergency emoji, original case. */
function plainToken(tokenStr: string): string {
  return tokenStr.replace(' 🚨', '').trim();
}

function sameStaging(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const norm = (q: Record<string, string[]>) =>
    JSON.stringify(
      Object.keys(q)
        .filter((room) => Array.isArray(q[room]) && q[room].length > 0)
        .sort()
        .map((room) => [room, q[room].map(normalizeToken)])
    );
  return norm(a) === norm(b);
}

/**
 * Replaces the local copy with the server's, from a live-board response.
 *
 * Skipped while a local change is still being sent, or when the board request started
 * before the last change finished: that response was read before the change landed and
 * would briefly undo it on screen.
 */
export function applyServerStaging(
  deptId: string,
  stagedByRoom: Record<string, string[]>,
  requestStartedAt: number
): void {
  if (typeof window === 'undefined' || !deptId) return;
  if ((pendingByDept.get(deptId) || 0) > 0) return;
  if (requestStartedAt <= (lastSentAtByDept.get(deptId) || 0)) return;
  try {
    const local = getAllRoomStagedQueues(deptId);
    if (sameStaging(local, stagedByRoom)) return;
    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, stagedByRoom);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues: stagedByRoom } }));
  } catch {
    // ignore
  }
}
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
      // This department's own list, even when empty. Falling back to another
      // department's list here showed its rooms' patients on this department's board.
      // The server's copy replaces this on the next board refresh anyway.
      return (
        readObjectKey<Record<string, string[]>>(getStorageKey(ROOM_STAGED_QUEUE_PREFIX, deptId)) || {}
      );
    }
    // No department given: any existing room staged queue key
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
    sendStaging(deptId, 'ADD', roomNumber, [plainToken(tokenStr)]);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
    return currentRoomQueue;
  } catch {
    return [];
  }
}

/**
 * Adds multiple tokens to a room's staged queue in one batch operation.
 */
export function addMultipleTokensToRoomQueue(deptId: string, roomNumber: string, tokens: string[]): string[] {
  if (typeof window === 'undefined' || !tokens || tokens.length === 0) return [];
  try {
    let allQueues = getAllRoomStagedQueues(deptId);
    for (const t of tokens) {
      allQueues = withTokenRemoved(allQueues, normalizeToken(t));
    }
    const currentRoomQueue = (allQueues[roomNumber] || []).concat(tokens);
    allQueues[roomNumber] = currentRoomQueue;

    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, allQueues);
    sendStaging(deptId, 'ADD', roomNumber, tokens.map(plainToken));
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
    sendStaging(deptId, 'REMOVE', roomNumber, [plainToken(tokenStr)]);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
    return allQueues[roomNumber] || [];
  } catch {
    return [];
  }
}

/**
 * Empties one room's staged queue, leaving every other room untouched.
 */
export function clearRoomQueue(deptId: string, roomNumber: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const allQueues = { ...getAllRoomStagedQueues(deptId), [roomNumber]: [] };

    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, allQueues);
    sendStaging(deptId, 'CLEAR_ROOM', roomNumber);
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
    return [];
  } catch {
    return [];
  }
}

/**
 * Empties every room's staged queue for a department.
 *
 * Staged tokens are ordinary WAITING tokens that a room has laid claim to, so clearing the
 * whole waiting line has to clear the staging with it — otherwise each room keeps a list of
 * token numbers that no longer exist, and the next call attempt chases a deleted patient.
 */
export function clearAllRoomQueues(deptId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const allQueues: Record<string, string[]> = {};
    for (const room of Object.keys(getAllRoomStagedQueues(deptId))) {
      allQueues[room] = [];
    }

    writeObjectKey(ROOM_STAGED_QUEUE_PREFIX, deptId, allQueues);
    sendStaging(deptId, 'CLEAR_ALL');
    window.dispatchEvent(new CustomEvent('room-queues-updated', { detail: { deptId, allQueues } }));
  } catch {
    // ignore
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

const AUTO_PULL_LIMITS_PREFIX = 'opd_auto_pull_limits_';
export const DEFAULT_AUTO_PULL_LIMIT = 4;

/**
 * Retrieves the configured Auto-Pull limits per room (default 4).
 */
export function getAutoPullLimits(deptId?: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    if (deptId) {
      const data = readObjectKey<Record<string, number>>(
        getStorageKey(AUTO_PULL_LIMITS_PREFIX, deptId)
      );
      if (data) return data;
    }
    const found = scanForPrefix<Record<string, number>>(AUTO_PULL_LIMITS_PREFIX, () => true);
    if (found) return found;
  } catch {
    // ignore
  }
  return {};
}

/**
 * Sets the Auto-Pull max patient limit for a specific room.
 */
export function setAutoPullLimit(deptId: string, roomNumber: string, limit: number): void {
  if (typeof window === 'undefined') return;
  try {
    const validLimit = Math.max(1, Math.min(20, Math.floor(limit) || DEFAULT_AUTO_PULL_LIMIT));
    const current = { ...getAutoPullLimits(deptId), [roomNumber]: validLimit };
    writeObjectKey(AUTO_PULL_LIMITS_PREFIX, deptId, current);
    window.dispatchEvent(new CustomEvent('auto-pull-limits-updated', { detail: { deptId, roomNumber, limit: validLimit } }));
  } catch {
    // ignore
  }
}

