import { db } from '@/lib/db';
import { ok, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { ANALYTICS_TOKEN_SELECT, summariseTokens } from '@/server/queue/analytics';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const dateQuery = url.searchParams.get('date');
  const targetDate = dateQuery ? serviceDateFor(new Date(dateQuery)) : serviceDateFor();

  const tokens = await db.token.findMany({
    where: {
      serviceDate: targetDate,
      deletedAt: null,
    },
    select: ANALYTICS_TOKEN_SELECT,
  });

  return ok(summariseTokens(tokens, targetDate.toISOString().slice(0, 10)));
});
