import { db } from '@/lib/db';
import { ok, notFound, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import {
  getServiceRate,
  estimateWaitMins,
  resolvePerPatientMins,
  MIN_RELIABLE_SAMPLE,
} from '@/server/queue/serviceRate';
import type { TokenPriority } from '@/generated/prisma/enums';

export const dynamic = 'force-dynamic';

/** How many of the people immediately in front of the caller the response names. */
const AHEAD_PREVIEW_LIMIT = 5;

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
  const deptQuery = searchParams.get('departmentId') || searchParams.get('deptId');

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
      ...(deptQuery ? { departmentId: deptQuery } : {}),
    },
    select: {
      tokenNumber: true,
      status: true,
      priority: true,
      issuedAt: true,
      calledAt: true,
      recalledAt: true,
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
  const [
    calledTokens, aheadByPriority, aheadByArrival, aheadPreviewRaw, initiallyAhead, serviceRate,
  ] = await Promise.all([
    db.token.findMany({
      where: { ...dateInDepartment, status: 'CALLED' },
      select: { tokenNumber: true, roomNumber: true },
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
    // The handful of people immediately in front of the caller, so the page can show the
    // queue rather than only a count. Service order is [priority desc, issuedAt asc], so
    // the nearest neighbours sit at the *end* of it — this reads that order backwards and
    // takes the first few, then flips them back below.
    isWaiting
      ? db.token.findMany({
          where: {
            ...dateInDepartment,
            status: 'WAITING',
            OR: [
              { priority: { in: HIGHER_PRIORITIES[token.priority] } },
              { priority: token.priority, issuedAt: { lt: token.issuedAt } },
            ],
          },
          orderBy: [{ priority: 'asc' }, { issuedAt: 'desc' }],
          take: AHEAD_PREVIEW_LIMIT,
          select: { tokenNumber: true, priority: true },
        })
      : ([] as { tokenNumber: string; priority: TokenPriority }[]),
    // Everyone issued before this token today, whatever became of them. This is the
    // denominator for "how far through the queue am I", and unlike a count taken when the
    // page opened it does not reset every time the patient reloads.
    db.token.count({
      where: { ...dateInDepartment, issuedAt: { lt: token.issuedAt } },
    }),
    getServiceRate(token.departmentId, token.serviceDate),
  ]);

  const currentlyServing = calledTokens.map((t) => t.tokenNumber);
  const patientsAhead = aheadByPriority + aheadByArrival;
  const estimatedWaitTimeMins = isWaiting
    ? estimateWaitMins(patientsAhead, serviceRate, currentlyServing.length > 0)
    : 0;

  return ok({
    tokenNumber: token.tokenNumber,
    status: token.status,
    priority: token.priority,
    serviceDate: token.serviceDate,
    issuedAt: token.issuedAt,
    calledAt: token.calledAt?.getTime() ?? null,
    recalledAt: token.recalledAt?.getTime() ?? null,
    departmentId: token.departmentId,
    departmentName: token.department?.name || 'Department',
    roomNumber: token.roomNumber || token.doctor?.roomNumber || null,
    currentlyServing,
    // Same tokens as `currentlyServing`, paired with where to find them. Kept alongside
    // rather than replacing it: the offline mirror and the existing UI both read the
    // flat list.
    servingByRoom: calledTokens.map((t) => ({
      tokenNumber: t.tokenNumber,
      roomNumber: t.roomNumber || null,
    })),
    patientsAhead: isWaiting ? patientsAhead : 0,
    initiallyAhead,
    // Reversed back into service order: front of the queue first, caller's immediate
    // predecessor last.
    aheadTokens: aheadPreviewRaw
      .map((t) => (t.priority === 'EMERGENCY' ? `${t.tokenNumber} 🚨` : t.tokenNumber))
      .reverse(),
    estimatedWaitTimeMins: isWaiting ? estimatedWaitTimeMins : 0,
    // Lets the page explain the estimate instead of asserting it, and soften the wording
    // when the day is too young for the average to mean anything.
    etaBasis: {
      avgConsultMins: resolvePerPatientMins(serviceRate),
      activeRooms: serviceRate.activeRooms,
      sampleSize: serviceRate.sampleSize,
      isReliable: serviceRate.sampleSize >= MIN_RELIABLE_SAMPLE,
    },
  });
});
