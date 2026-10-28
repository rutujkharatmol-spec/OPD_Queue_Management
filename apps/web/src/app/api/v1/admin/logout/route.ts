import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { ADMIN_COOKIE } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
});
