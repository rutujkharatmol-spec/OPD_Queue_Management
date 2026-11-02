import { db } from '@/lib/db';
import { ok, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { ANALYTICS_TOKEN_SELECT, summariseTokens } from '@/server/queue/analytics';
import { isAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };

export const GET = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const url = new URL(request.url);
  const dateQuery = url.searchParams.get('date');

  // Staff (from the main menu) see today only, without per-doctor figures; the admin's
  // Analytics page sees any date, all-time, and everything.
  const admin = await isAdmin();
  const isAllTime = admin && dateQuery === 'all';
  const targetDate = isAllTime ? null : (admin && dateQuery ? serviceDateFor(new Date(dateQuery)) : serviceDateFor());

  const tokenWhere = isAllTime
    ? { departmentId, deletedAt: null }
    : { departmentId, serviceDate: targetDate!, deletedAt: null };

  const [tokens, rooms] = await Promise.all([
    db.token.findMany({
      where: tokenWhere,
      select: ANALYTICS_TOKEN_SELECT,
    }),
    db.room.findMany({
      where: { departmentId, deletedAt: null },
      select: { roomNumber: true, doctorName: true },
    }),
  ]);

  const doctorByRoom = new Map<string, string>();
  for (const r of rooms) {
    if (r.doctorName) doctorByRoom.set(r.roomNumber, r.doctorName);
  }

  const dateLabel = isAllTime ? 'All Time' : targetDate!.toISOString().slice(0, 10);
  const summary = summariseTokens(tokens, dateLabel, doctorByRoom);
  return ok(admin ? summary : { ...summary, doctorStats: [] });
});
