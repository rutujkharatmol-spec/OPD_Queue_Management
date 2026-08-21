// src/lib/queueSettings.ts

export const DEFAULT_PASS_COUNT = 3;
export const PASS_COUNT_STORAGE_KEY = 'opd_pass_count';

/**
 * Retrieves the currently configured queue pass / skip count from localStorage.
 * Defaults to 3 if not set or invalid.
 */
export function getStoredPassCount(): number {
  if (typeof window === 'undefined') return DEFAULT_PASS_COUNT;
  try {
    const stored = localStorage.getItem(PASS_COUNT_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_PASS_COUNT;
}

/**
 * Saves a new queue pass / skip count to localStorage.
 */
export function setStoredPassCount(count: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const validCount = Math.max(1, Math.min(50, Math.floor(count)));
    localStorage.setItem(PASS_COUNT_STORAGE_KEY, String(validCount));
    return true;
  } catch {
    return false;
  }
}

/**
 * Resets the queue pass count back to default (3).
 */
export function resetStoredPassCount(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PASS_COUNT_STORAGE_KEY, String(DEFAULT_PASS_COUNT));
  } catch {
    // ignore
  }
}
