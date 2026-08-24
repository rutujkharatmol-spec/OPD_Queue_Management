import { db } from '@/lib/db';
import { ok, notFound, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import type { TokenPriority } from '@/generated/prisma/enums';

export const dynamic = 'force-dynamic';

/**
 * Which priorities outrank each one. Replaces the weight table the old in-memory filter
 * used, and lets the "ahead of me" question be answered by the database.
 */
const HIGHER_PRIORITIES: Record<TokenPriority, TokenPriority[]> = {
  NORMAL: ['SENIOR', 'EMERGENCY'],
  SENIOR: ['EMERGENCY'],
  EMERGENCY: [],
};

export const GET = route(async (_request: Request, { params }: { params: Promise<{ tokenNumber: string }> }) => {
  const { tokenNumber } = await params;
  const { searchParams } = new URL(_request.url);
  const dateQuery = searchParams.get('date');

  let serviceDate: Date;
  if (dateQuery) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateQuery.trim());
    if (match) {
      const [, y, m, d] = match.map(Number);
      serviceDate = new Date(Date.UTC(y, m - 1, d));
    } else {
      const parsed = new Date(dateQuery);
      serviceDate = !isNaN(parsed.getTime()) ? serviceDateFor(parsed) : serviceDateFor();
    }
  } else {
    serviceDate = serviceDateFor();
  }

  // Every patient phone re-runs this every 10 seconds while it waits, so it is the most
  // frequently executed query in the system after the live board. Filter by serviceDate so
  // tokens from previous days (which have the same daily sequence number) are not returned.
  const token = await db.token.findFirst({
    where: {
      tokenNumber: { equals: tokenNumber, mode: 'insensitive' },
      serviceDate,
      deletedAt: null,
    },
    select: {
      tokenNumber: true,
      status: true,
      priority: true,
      issuedAt: true,
      serviceDate: true,
      roomNumber: true,
      departmentId: true,
      department: { select: { name: true } },
      doctor: { select: { roomNumber: true } },
    },
  });

  if (!token) return notFound('Token not found for selected date');

  const isWaiting = token.status === 'WAITING';
  const dateInDepartment = {
    departmentId: token.departmentId,
    serviceDate: token.serviceDate,
    deletedAt: null,
  } as const;

  // Counted in the database rather than fetched and filtered in JS. Both counts and the
  // called-list query are independent, so they go out together: one round-trip phase
  // instead of three sequential ones.
  const [calledTokens, aheadByPriority, aheadByArrival] = await Promise.all([
    db.token.findMany({
      where: { ...dateInDepartment, status: 'CALLED' },
      select: { tokenNumber: true },
    }),
    isWaiting && HIGHER_PRIORITIES[token.priority].length > 0
      ? db.token.count({
          where: {
            ...dateInDepartment,
            status: 'WAITING',
            priority: { in: HIGHER_PRIORITIES[token.priority] },
          },
        })
      : 0,
    isWaiting
      ? db.token.count({
          where: {
            ...dateInDepartment,
            status: 'WAITING',
            priority: token.priority,
            // Strictly earlier, so the caller's own token is never counted — the same
            // boundary the previous `<` comparison drew.
            issuedAt: { lt: token.issuedAt },
          },
        })
      : 0,
  ]);

  const currentlyServing = calledTokens.map((t) => t.tokenNumber);
  const patientsAhead = aheadByPriority + aheadByArrival;
  const estimatedWaitTimeMins = isWaiting
    ? patientsAhead * 5 + (currentlyServing.length > 0 ? 5 : 0)
    : 0;

  return ok({
    tokenNumber: token.tokenNumber,
    status: token.status,
    priority: token.priority,
    serviceDate: token.serviceDate,
    issuedAt: token.issuedAt,
    departmentName: token.department?.name || 'Department',
    roomNumber: token.roomNumber || token.doctor?.roomNumber || null,
    currentlyServing,
    patientsAhead: isWaiting ? patientsAhead : 0,
    estimatedWaitTimeMins: isWaiting ? estimatedWaitTimeMins : 0,
  });
});
