import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isValidAdminSession, sameText, sessionSecret } from '@/server/admin/auth';

/**
 * Staff access for everything that changes the queue: issuing tokens, calling, done,
 * absent, deleting, room and department settings.
 *
 * Works like the admin login: the password lives only in the STAFF_PASSWORD environment
 * variable (never in the code or the browser), and logging in sets an httpOnly cookie
 * holding `<issued-at>.<HMAC>` that the server re-checks on every request. Changing
 * STAFF_PASSWORD signs every device out. An admin session also counts as staff.
 *
 * The check itself runs in src/proxy.ts, in front of every API route.
 */

export const STAFF_COOKIE = 'opd_staff';
// Long enough that a registration PC or doctor's desk logs in about once a week.
export const STAFF_SESSION_SECONDS = 7 * 24 * 60 * 60;

function staffPassword(): string {
  return process.env.STAFF_PASSWORD?.trim() || '';
}

export function isStaffConfigured(): boolean {
  return staffPassword().length > 0;
}

function sign(issuedAt: string): string {
  return createHmac('sha256', `${staffPassword()}|${sessionSecret()}`)
    .update(`opd-staff:${issuedAt}`)
    .digest('hex');
}

export function checkStaffPassword(input: unknown): boolean {
  if (!isStaffConfigured()) return false;
  return typeof input === 'string' && sameText(input.trim(), staffPassword());
}

export function newStaffSession(): string {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function isValidStaffSession(value: string | undefined | null): boolean {
  if (!value || !isStaffConfigured()) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const issuedAt = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts)) return false;
  const age = Date.now() - ts;
  if (age < -60_000 || age > STAFF_SESSION_SECONDS * 1000) return false;
  return sameText(mac, sign(issuedAt));
}

/** True when the request carries a valid staff or admin session. */
export function hasStaffAccess(staffCookie?: string | null, adminCookie?: string | null): boolean {
  return isValidStaffSession(staffCookie) || isValidAdminSession(adminCookie);
}

/** For route handlers that show extra detail to staff only. */
export async function isStaff(): Promise<boolean> {
  const store = await cookies();
  return hasStaffAccess(store.get(STAFF_COOKIE)?.value, store.get(ADMIN_COOKIE)?.value);
}
