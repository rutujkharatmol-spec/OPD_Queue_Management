import { NextResponse } from 'next/server';
import { readJson, route } from '@/server/http';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  checkAdminPassword,
  isAdminConfigured,
  isHttps,
  newAdminSession,
} from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

export const POST = route(async (request: Request) => {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { message: 'Admin login is not set up on this server (ADMIN_PASSWORD is missing).' },
      { status: 503 }
    );
  }

  const { password } = await readJson<{ password?: string }>(request);

  if (!checkAdminPassword(password)) {
    // Slow down guessing a short password.
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ message: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, newAdminSession(), {
    httpOnly: true,
    secure: isHttps(request),
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return res;
});
