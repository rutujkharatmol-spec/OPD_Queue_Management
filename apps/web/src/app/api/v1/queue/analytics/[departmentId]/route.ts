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

  const tokens = await db.token.findMany({
    where: {
      departmentId,
      serviceDate: targetDate,
      deletedAt: null,
    },
    select: ANALYTICS_TOKEN_SELECT,
  });

  return ok(summariseTokens(tokens, targetDate.toISOString().slice(0, 10)));
});
