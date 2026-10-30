import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE } from '@/server/admin/auth';
import { STAFF_COOKIE, hasStaffAccess, isStaffConfigured } from '@/server/staff/auth';
import { READ_ONLY_CODE, isReadOnlyMirror, readOnlyMessage } from '@/server/readOnlyMirror';

/**
 * The one place that decides who may call the API.
 *
 * Default deny: every request that changes data (POST, PUT, PATCH, DELETE) needs a staff
 * or admin login, so a new route is protected without anyone remembering to add a check.
 * Reads stay open because patient phones and the TV boards (including the plain
 * tv-lite page) have no login, except the few listed below that return patients'
 * phone numbers, UHIDs or staff figures.
 *
 * /api/v1/admin/* checks the admin login inside each route, and /api/v1/staff/* is the
 * login itself, so both pass straight through here.
 */

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const SELF_CHECKED_PREFIXES = ['/api/v1/admin/', '/api/v1/staff/'];

const LOGIN_PATHS = new Set([
  '/api/v1/staff/login',
  '/api/v1/staff/logout',
  '/api/v1/admin/login',
  '/api/v1/admin/logout',
]);

const STAFF_ONLY_READS = [
  '/api/v1/tokens/search', // patient phone numbers and UHIDs
  '/api/v1/patients', // booklet look-up at registration: phone numbers and UHIDs
  '/api/v1/queue/analytics', // per-doctor figures
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isRead = READ_METHODS.has(request.method.toUpperCase());

  // On the read-only copy nothing may change, whoever is logged in. Logging in and out
  // still works so the admin pages can be viewed there.
  if (!isRead && isReadOnlyMirror() && !LOGIN_PATHS.has(pathname)) {
    // 403, never 5xx: the client's offline layer would treat a 5xx as an outage.
    return NextResponse.json(
      { message: readOnlyMessage(), code: READ_ONLY_CODE },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  if (SELF_CHECKED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (isRead && !STAFF_ONLY_READS.some((p) => matches(pathname, p))) {
    return NextResponse.next();
  }

  if (hasStaffAccess(request.cookies.get(STAFF_COOKIE)?.value, request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // 401, never 5xx: the client's offline layer would treat a 5xx as an outage and
  // quietly queue the change for later instead of asking the user to log in.
  return NextResponse.json(
    {
      message: isStaffConfigured()
        ? 'Staff login required.'
        : 'Staff login is not set up on this server (STAFF_PASSWORD is missing).',
      code: 'STAFF_LOGIN_REQUIRED',
    },
    { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export const config = {
  matcher: '/api/:path*',
};
