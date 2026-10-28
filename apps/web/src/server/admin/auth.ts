import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Admin access for /admin, /settings, /analytics and /api/v1/admin/*.
 *
 * The password is checked on the server only (never shipped to the browser). Logging in
 * sets an httpOnly cookie holding `<issued-at>.<HMAC>`; the server re-computes the HMAC
 * on every request. Changing ADMIN_PASSWORD (or ADMIN_SESSION_SECRET) signs everyone out.
 *
 * The password comes only from the ADMIN_PASSWORD environment variable (Vercel project
 * settings, or .env on the OPD server). It is never in the code or the repository.
 * Without it, admin login is switched off.
 */

export const ADMIN_COOKIE = 'opd_admin';
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || '';
}

export function isAdminConfigured(): boolean {
  return adminPassword().length > 0;
}

function signingKey(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    'opd-admin';
  return `${adminPassword()}|${secret}`;
}

function sign(issuedAt: string): string {
  return createHmac('sha256', signingKey()).update(`opd-admin:${issuedAt}`).digest('hex');
}

function sameText(a: string, b: string): boolean {
  // Hash first so the comparison is constant-time whatever the lengths.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkAdminPassword(input: unknown): boolean {
  if (!isAdminConfigured()) return false;
  return typeof input === 'string' && sameText(input.trim(), adminPassword());
}

export function newAdminSession(): string {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function isValidAdminSession(value: string | undefined | null): boolean {
  if (!value || !isAdminConfigured()) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const issuedAt = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts)) return false;
  const age = Date.now() - ts;
  if (age < -60_000 || age > ADMIN_SESSION_SECONDS * 1000) return false;
  return sameText(mac, sign(issuedAt));
}

/** For Server Components and layouts. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return isValidAdminSession(store.get(ADMIN_COOKIE)?.value);
}

/** For admin API routes: returns a 401 response, or null when the caller is signed in. */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ message: 'Admin login required.' }, { status: 401 });
}

/** Cookies marked Secure are dropped over plain http (the on-site server on the LAN). */
export function isHttps(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}
