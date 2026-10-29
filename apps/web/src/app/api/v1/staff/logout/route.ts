import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { STAFF_COOKIE } from '@/server/staff/auth';

export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
});
