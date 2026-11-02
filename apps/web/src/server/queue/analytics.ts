import type { TokenPriority, TokenStatus } from '@/generated/prisma/enums';
import { summariseByDoctor } from '@/lib/doctorStats';
import { joinDoctorNames } from '@/lib/roomDoctors';

/**
 * The columns the summary actually reads.
 *
 * Includes patient identity metadata (patientId, UHID, phone) so the summary can
 * accurately deduplicate and report the TRUE number of individual patients rather than
 * counting the same patient twice when they hold multiple tokens or visit multiple rooms.
 */
export type SummarisableToken = {
  id?: string;
  patientId?: string | null;
  status: TokenStatus;
  priority: TokenPriority;
  roomNumber: string | null;
  servedByDoctorName: string | null;
  issuedAt: Date;
  calledAt: Date | null;
  completedAt: Date | null;
  patient?: {
    id?: string;
    uhid?: string | null;
    phone?: string | null;
  } | null;
};

/** The columns above, as a Prisma `select` the routes can share. */
export const ANALYTICS_TOKEN_SELECT = {
  id: true,
  patientId: true,
  status: true,
  priority: true,
  roomNumber: true,
  servedByDoctorName: true,
  issuedAt: true,
  calledAt: true,
  completedAt: true,
  patient: {
    select: {
      id: true,
      uhid: true,
      phone: true,
    },
  },
} as const;

/**
 * Derives a reliable, collision-resistant deduplication key for a token's patient.
 *
 * Priority:
 * 1. Normalized CR No / UHID (the physical hospital registration booklet)
 * 2. Mobile phone number (if non-placeholder)
 * 3. Foreign key patientId
 * 4. Token ID fallback for unlinked walk-ins
 */
export function patientDeduplicationKey(t: SummarisableToken): string {
  const uhid = t.patient?.uhid?.trim();
  if (uhid) return `uhid:${uhid}`;

  const phone = t.patient?.phone?.trim();
  if (phone && phone !== '0000000000' && phone.length >= 6) return `phone:${phone}`;

  if (t.patientId) return `pid:${t.patientId}`;
  if (t.patient?.id) return `pid:${t.patient.id}`;

  return `token:${t.id || `${t.issuedAt ? new Date(t.issuedAt).getTime() : ''}:${t.roomNumber || ''}`}`;
}

export type RoomPatientStats = {
  roomNumber: string;
  doctorName?: string;
  /** Real unique patients seen in this room (not counted twice). */
  totalPatients: number;
  /** Total token visits/actions in this room. */
  totalTokens: number;
  completedCount: number;
  activeCount: number;
  absentCount: number;
  totalServed: number;
  avgConsultMins: number;
};

type RoomStatAccumulator = {
  roomNumber: string;
  totalTokens: number;
  uniquePatientKeys: Set<string>;
  completedCount: number;
  activeCount: number;
  absentCount: number;
  consultationTotalMins: number;
  consultationCount: number;
  /** Doctors credited with this room's patients that day, in first-seen order. */
  doctors: string[];
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
  const allUniquePatientKeys = new Set<string>();
  const servedUniquePatientKeys = new Set<string>();
  const waitingUniquePatientKeys = new Set<string>();
  const inRoomUniquePatientKeys = new Set<string>();

  for (const t of tokens) {
    const pKey = patientDeduplicationKey(t);
    allUniquePatientKeys.add(pKey);

    const isCompleted = t.status === 'COMPLETED';
    if (isCompleted) {
      completedCount++;
      servedUniquePatientKeys.add(pKey);
    } else if (t.status === 'WAITING') {
      waitingCount++;
      waitingUniquePatientKeys.add(pKey);
    } else if (t.status === 'CALLED' || t.status === 'IN_PROGRESS') {
      calledCount++;
      inRoomUniquePatientKeys.add(pKey);
    } else if (t.status === 'ABSENT') {
      absentCount++;
    } else if (t.status === 'SKIPPED') {
      skippedCount++;
    }

    if (t.priority === 'EMERGENCY') emergency++;
    else if (t.priority === 'SENIOR') senior++;
    else if (t.priority === 'NORMAL') normal++;

    const issuedAtMs = new Date(t.issuedAt).getTime();
    const calledAtMs = t.calledAt ? new Date(t.calledAt).getTime() : 0;

    if (t.calledAt && t.issuedAt) {
      waitTimeTotal += (calledAtMs - issuedAtMs) / 60_000;
      waitTimeCount++;
    }

    if (isCompleted && t.calledAt && t.completedAt) {
      consultationTotal += (new Date(t.completedAt).getTime() - calledAtMs) / 60_000;
      consultationCount++;
    }

    const hour = `${String(new Date(t.issuedAt).getHours()).padStart(2, '0')}:00`;
    if (hourlyDistribution[hour] !== undefined) {
      hourlyDistribution[hour]++;
    }

    // Track room-wise statistics for any token assigned to or called in a room
    const room = t.roomNumber;
    if (room) {
      if (!roomStatsMap.has(room)) {
        roomStatsMap.set(room, {
          roomNumber: room,
          totalTokens: 0,
          uniquePatientKeys: new Set<string>(),
          completedCount: 0,
          activeCount: 0,
          absentCount: 0,
          consultationTotalMins: 0,
          consultationCount: 0,
          doctors: [],
        });
      }
      const acc = roomStatsMap.get(room)!;
      acc.totalTokens++;
      acc.uniquePatientKeys.add(pKey);
      if (t.servedByDoctorName) acc.doctors.push(t.servedByDoctorName);

      if (isCompleted) {
        acc.completedCount++;
        if (t.calledAt && t.completedAt) {
          acc.consultationTotalMins += (new Date(t.completedAt).getTime() - calledAtMs) / 60_000;
          acc.consultationCount++;
        }
      } else if (t.status === 'CALLED' || t.status === 'IN_PROGRESS') {
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
      // Who actually saw patients here that day (doctors share rooms and move between
      // them); the room's current list only when nobody was credited yet.
      doctorName: joinDoctorNames(acc.doctors) ?? doctorByRoom?.get(acc.roomNumber),
      totalPatients: acc.uniquePatientKeys.size,
      totalTokens: acc.totalTokens,
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
    /** Distinct individual patients who visited (same patient is NEVER counted twice). */
    uniquePatientsCount: allUniquePatientKeys.size,
    uniqueServedCount: servedUniquePatientKeys.size,
    uniqueWaitingCount: waitingUniquePatientKeys.size,
    uniqueInRoomCount: inRoomUniquePatientKeys.size,
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
    doctorStats: summariseByDoctor(tokens, doctorByRoom),
  };
}
