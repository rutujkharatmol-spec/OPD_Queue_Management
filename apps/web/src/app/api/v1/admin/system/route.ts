import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { ADMIN_SESSION_SECONDS, isAdminConfigured, requireAdmin } from '@/server/admin/auth';
import { STAFF_SESSION_SECONDS, isStaffConfigured } from '@/server/staff/auth';
import { isReadOnlyMirror, opdServerUrl } from '@/server/readOnlyMirror';

export const dynamic = 'force-dynamic';

/**
 * Hospital-wide set-up, for the admin's Settings page: where this copy of the app runs,
 * whether the logins are set, and whether it is the read-only copy. Nothing secret: it
 * says whether a password is set, never what it is.
 */
export const GET = route(async () => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = NextResponse.json({
    runsOn: process.env.VERCEL ? 'cloud' : 'server',
    staffLogin: { set: isStaffConfigured(), signedInForDays: Math.round(STAFF_SESSION_SECONDS / 86400) },
    adminLogin: { set: isAdminConfigured(), signedInForHours: Math.round(ADMIN_SESSION_SECONDS / 3600) },
    readOnlyMirror: isReadOnlyMirror(),
    opdServerUrl: opdServerUrl(),
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
});
