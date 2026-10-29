import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { isStaff, isStaffConfigured } from '@/server/staff/auth';
import { isReadOnlyMirror, opdServerUrl } from '@/server/readOnlyMirror';

export const dynamic = 'force-dynamic';

/** Tells the staff screens whether this device is logged in, and whether this server takes changes. */
export const GET = route(async () => {
  const readOnly = isReadOnlyMirror();
  const res = NextResponse.json({
    loggedIn: await isStaff(),
    configured: isStaffConfigured(),
    readOnly,
    opdServerUrl: readOnly ? opdServerUrl() : null,
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
});
