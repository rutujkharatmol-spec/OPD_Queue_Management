import type { TokenPriority, TokenStatus } from '@/generated/prisma/enums';

/**
 * The columns the summary actually reads.
 *
 * Declared as a structural type rather than the full Prisma `Token` so the callers'
 * `select` can stay narrow: the routes used to `include: { patient: true }` and never
 * touch a single patient field, which turned every analytics request into a join that
 * hauled back every patient column for the day.
 */
export type SummarisableToken = {
  status: TokenStatus;
  priority: TokenPriority;
  roomNumber: string | null;
  issuedAt: Date;
  calledAt: Date | null;
  completedAt: Date | null;
};

/** The columns above, as a Prisma `select` the routes can share. */
export const ANALYTICS_TOKEN_SELECT = {
  status: true,
  priority: true,
  roomNumber: true,
  issuedAt: true,
  calledAt: true,
  completedAt: true,
} as const;

/**
 * Rolls a day's tokens up into the analytics payload in one pass.
 *
 * The previous version swept the same array twelve times — once per status, once per
 * priority, twice for the timing averages, once for the hour histogram and once for the
 * room table — allocating an intermediate array each time. Averages are accumulated in
 * the same left-to-right order the old `reduce` calls used, so the rounded results are
 * unchanged.
 */
export function summariseTokens(tokens: SummarisableToken[], date: string) {
  let completedCount = 0;
  let waitingCount = 0;
  let calledCount = 0;
  let absentCount = 0;
  let skippedCount = 0;
  let emergency = 0;
  let senior = 0;
  let normal = 0;

  let waitTimeTotal = 0;
  let waitTimeCount = 0;
  let consultationTotal = 0;
  let consultationCount = 0;

  const hourlyDistribution: Record<string, number> = {};
  for (let h = 8; h <= 18; h++) {
    hourlyDistribution[`${String(h).padStart(2, '0')}:00`] = 0;
  }

  const roomStatsMap = new Map<string, number>();

  for (const t of tokens) {
    const isCompleted = t.status === 'COMPLETED';
    if (isCompleted) completedCount++;
    else if (t.status === 'WAITING') waitingCount++;
    else if (t.status === 'CALLED') calledCount++;
    else if (t.status === 'ABSENT') absentCount++;
    else if (t.status === 'SKIPPED') skippedCount++;

    if (t.priority === 'EMERGENCY') emergency++;
    else if (t.priority === 'SENIOR') senior++;
    else if (t.priority === 'NORMAL') normal++;

    // These are already Date objects from the driver; the old code wrapped each one in
    // `new Date(...)` again on every read.
    const issuedAtMs = t.issuedAt.getTime();
    const calledAtMs = t.calledAt ? t.calledAt.getTime() : 0;

    if (t.calledAt && t.issuedAt) {
      waitTimeTotal += (calledAtMs - issuedAtMs) / 60_000;
      waitTimeCount++;
    }

    if (isCompleted && t.calledAt && t.completedAt) {
      consultationTotal += (t.completedAt.getTime() - calledAtMs) / 60_000;
      consultationCount++;
    }

    const hour = `${String(t.issuedAt.getHours()).padStart(2, '0')}:00`;
    if (hourlyDistribution[hour] !== undefined) {
      hourlyDistribution[hour]++;
    }

    if (isCompleted) {
      const room = t.roomNumber || '101';
      roomStatsMap.set(room, (roomStatsMap.get(room) || 0) + 1);
    }
  }

  return {
    date,
    totalGenerated: tokens.length,
    completedCount,
    waitingCount,
    calledCount,
    absentCount,
    skippedCount,
    priorityCounts: { emergency, senior, normal },
    avgWaitTimeMins: waitTimeCount > 0 ? Math.round(waitTimeTotal / waitTimeCount) : 0,
    avgConsultationTimeMins:
      consultationCount > 0 ? Math.round(consultationTotal / consultationCount) : 0,
    hourlyDistribution,
    roomStats: Array.from(roomStatsMap, ([roomNumber, totalServed]) => ({
      roomNumber,
      totalServed,
    })),
  };
}
