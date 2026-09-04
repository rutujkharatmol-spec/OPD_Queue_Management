import { db } from '@/lib/db';
import { ok, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { ANALYTICS_TOKEN_SELECT, summariseTokens } from '@/server/queue/analytics';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };

export const GET = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const url = new URL(request.url);
  const dateQuery = url.searchParams.get('date');

  const targetDate = dateQuery ? serviceDateFor(new Date(dateQuery)) : serviceDateFor();

  const [tokens, rooms] = await Promise.all([
    db.token.findMany({
      where: {
        departmentId,
        serviceDate: targetDate,
        deletedAt: null,
      },
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

  return ok(summariseTokens(tokens, targetDate.toISOString().slice(0, 10), doctorByRoom));
});
