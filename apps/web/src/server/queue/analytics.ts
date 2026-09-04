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

export type RoomPatientStats = {
  roomNumber: string;
  doctorName?: string;
  totalPatients: number;
  completedCount: number;
  activeCount: number;
  absentCount: number;
  totalServed: number;
  avgConsultMins: number;
};

type RoomStatAccumulator = {
  roomNumber: string;
  totalPatients: number;
  completedCount: number;
  activeCount: number;
  absentCount: number;
  consultationTotalMins: number;
  consultationCount: number;
};

/**
 * Rolls a day's tokens up into the analytics payload in one pass.
 */
export function summariseTokens(
  tokens: SummarisableToken[],
  date: string,
  doctorByRoom?: Map<string, string>
) {
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

  const roomStatsMap = new Map<string, RoomStatAccumulator>();

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

    // Track room-wise statistics for any token assigned to or called in a room
    const room = t.roomNumber;
    if (room) {
      if (!roomStatsMap.has(room)) {
        roomStatsMap.set(room, {
          roomNumber: room,
          totalPatients: 0,
          completedCount: 0,
          activeCount: 0,
          absentCount: 0,
          consultationTotalMins: 0,
          consultationCount: 0,
        });
      }
      const acc = roomStatsMap.get(room)!;
      acc.totalPatients++;

      if (isCompleted) {
        acc.completedCount++;
        if (t.calledAt && t.completedAt) {
          acc.consultationTotalMins += (t.completedAt.getTime() - calledAtMs) / 60_000;
          acc.consultationCount++;
        }
      } else if (t.status === 'CALLED') {
        acc.activeCount++;
      } else if (t.status === 'ABSENT' || t.status === 'SKIPPED') {
        acc.absentCount++;
      }
    }
  }

  const roomStats: RoomPatientStats[] = Array.from(roomStatsMap.values())
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
    .map((acc) => ({
      roomNumber: acc.roomNumber,
      doctorName: doctorByRoom?.get(acc.roomNumber),
      totalPatients: acc.totalPatients,
      completedCount: acc.completedCount,
      activeCount: acc.activeCount,
      absentCount: acc.absentCount,
      totalServed: acc.completedCount,
      avgConsultMins:
        acc.consultationCount > 0
          ? Math.round((acc.consultationTotalMins / acc.consultationCount) * 10) / 10
          : 0,
    }));

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
    roomStats,
  };
}
