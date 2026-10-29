import { NextResponse } from 'next/server';
import { readJson, route } from '@/server/http';
import { isHttps } from '@/server/admin/auth';
import {
  STAFF_COOKIE,
  STAFF_SESSION_SECONDS,
  checkStaffPassword,
  isStaffConfigured,
  newStaffSession,
} from '@/server/staff/auth';
import { loginRetryAfter, recordLoginFailure } from '@/server/loginThrottle';

export const dynamic = 'force-dynamic';

export const POST = route(async (request: Request) => {
  // 4xx, not 5xx: the client's offline layer treats a 5xx as "server down".
  if (!isStaffConfigured()) {
    return NextResponse.json(
      { message: 'Staff login is not set up on this server (STAFF_PASSWORD is missing). Ask IT to set it.' },
      { status: 401 }
    );
  }

  const wait = loginRetryAfter(request);
  if (wait > 0) {
    return NextResponse.json(
      { message: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(wait) } }
    );
  }

  const { password } = await readJson<{ password?: string }>(request);

  if (!checkStaffPassword(password)) {
    recordLoginFailure(request);
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ message: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, newStaffSession(), {
    httpOnly: true,
    secure: isHttps(request),
    sameSite: 'strict',
    path: '/',
    maxAge: STAFF_SESSION_SECONDS,
  });
  return res;
});
