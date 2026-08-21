// src/lib/roomQueueSettings.ts

const ROOM_STAGED_QUEUE_PREFIX = 'opd_room_staged_queue_';
const AUTO_CALL_ROOMS_PREFIX = 'opd_auto_call_rooms_';

function getStorageKey(prefix: string, deptId?: string): string {
  return `${prefix}${deptId || 'default'}`;
}

/**
 * Retrieves all staged token queues across rooms for a department.
 */
export function getAllRoomStagedQueues(deptId?: string): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    if (deptId) {
      const raw = localStorage.getItem(getStorageKey(ROOM_STAGED_QUEUE_PREFIX, deptId));
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
          return data;
        }
      }
    }
    // Fallback: check any existing room staged queue key
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ROOM_STAGED_QUEUE_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
            return data;
          }
        }
      }
    }
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
    const cleanToken = tokenStr.replace(' 🚨', '').trim().toLowerCase();
    const allQueues = getAllRoomStagedQueues(deptId);

    // Remove token from any other room queue first
    for (const r of Object.keys(allQueues)) {
      allQueues[r] = (allQueues[r] || []).filter(
        (t) => t.replace(' 🚨', '').trim().toLowerCase() !== cleanToken
      );
    }

    const currentRoomQueue = allQueues[roomNumber] || [];
    if (!currentRoomQueue.some((t) => t.replace(' 🚨', '').trim().toLowerCase() === cleanToken)) {
      currentRoomQueue.push(tokenStr);
    }
    allQueues[roomNumber] = currentRoomQueue;

    const key = getStorageKey(ROOM_STAGED_QUEUE_PREFIX, deptId);
    localStorage.setItem(key, JSON.stringify(allQueues));
    // Also mirror to default key to prevent department mismatch
    localStorage.setItem(getStorageKey(ROOM_STAGED_QUEUE_PREFIX, 'default'), JSON.stringify(allQueues));

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
    const cleanToken = tokenStr.replace(' 🚨', '').trim().toLowerCase();
    const allQueues = getAllRoomStagedQueues(deptId);

    for (const r of Object.keys(allQueues)) {
      allQueues[r] = (allQueues[r] || []).filter(
        (t) => t.replace(' 🚨', '').trim().toLowerCase() !== cleanToken
      );
    }

    const key = getStorageKey(ROOM_STAGED_QUEUE_PREFIX, deptId);
    localStorage.setItem(key, JSON.stringify(allQueues));
    localStorage.setItem(getStorageKey(ROOM_STAGED_QUEUE_PREFIX, 'default'), JSON.stringify(allQueues));

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
    const allQueues = getAllRoomStagedQueues(deptId);
    const roomQueue = allQueues[roomNumber] || [];
    if (roomQueue.length === 0) return null;

    const nextToken = roomQueue.shift() || null;
    allQueues[roomNumber] = roomQueue;

    const key = getStorageKey(ROOM_STAGED_QUEUE_PREFIX, deptId);
    localStorage.setItem(key, JSON.stringify(allQueues));
    localStorage.setItem(getStorageKey(ROOM_STAGED_QUEUE_PREFIX, 'default'), JSON.stringify(allQueues));

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
      const raw = localStorage.getItem(getStorageKey(AUTO_CALL_ROOMS_PREFIX, deptId));
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null) return data;
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(AUTO_CALL_ROOMS_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          if (typeof data === 'object' && data !== null) return data;
        }
      }
    }
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
    const current = getAutoCallRooms(deptId);
    current[roomNumber] = enabled;
    localStorage.setItem(getStorageKey(AUTO_CALL_ROOMS_PREFIX, deptId), JSON.stringify(current));
    localStorage.setItem(getStorageKey(AUTO_CALL_ROOMS_PREFIX, 'default'), JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('auto-call-updated', { detail: { deptId, roomNumber, enabled } }));
  } catch {
    // ignore
  }
}
