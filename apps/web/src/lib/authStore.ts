// src/lib/authStore.ts

export const DEFAULT_STAFF_PASSWORD = '89';
export const AUTH_STORAGE_KEY = 'opd_auth';
export const PASSWORD_STORAGE_KEY = 'opd_staff_password';

/**
 * Retrieves the currently active staff access password from localStorage.
 * Defaults to '89' if not customized.
 */
export function getStoredStaffPassword(): string {
  if (typeof window === 'undefined') return DEFAULT_STAFF_PASSWORD;
  try {
    const stored = localStorage.getItem(PASSWORD_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      return stored.trim();
    }
  } catch {
    // ignore localstorage errors
  }
  return DEFAULT_STAFF_PASSWORD;
}

/**
 * Updates the staff access password in localStorage.
 */
export function setStoredStaffPassword(newPassword: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!newPassword || newPassword.trim().length === 0) return false;
    localStorage.setItem(PASSWORD_STORAGE_KEY, newPassword.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Resets the staff access password back to '89'.
 */
export function resetStoredStaffPassword(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PASSWORD_STORAGE_KEY, DEFAULT_STAFF_PASSWORD);
  } catch {
    // ignore
  }
}

/**
 * Checks if the current session is authenticated.
 */
export function isStaffAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets or clears authentication state.
 */
export function setStaffAuthenticated(authenticated: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (authenticated) {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
