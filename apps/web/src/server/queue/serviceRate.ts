import { db } from '@/lib/db';

/**
 * How fast a department is actually getting through its queue today.
 *
 * The patient-facing wait estimate used to be `patientsAhead * 5`, which was wrong twice
 * over: five minutes was a guess, and it assumed the queue drains one patient at a time
 * when a department routinely runs three rooms in parallel. With 12 ahead and 3 doctors
 * that produced "65 minutes" for a ~20 minute wait, which is worse than showing nothing.
 *
 * Both corrections come from timestamps the tokens already carry.
 */
export type ServiceRate = {
  /** Mean consultation length today, clamped to a plausible range. */
  avgConsultMins: number;
  /** How many rooms the department is actually working out of today. Never below 1. */
  activeRooms: number;
  /** Completed consultations the average was drawn from. */
  sampleSize: number;
};

/**
 * A single 90-second consultation is real but not representative, and a token left CALLED
 * over lunch would otherwise drag the average into hours. Clamping keeps one outlier from
 * dominating a small sample.
 */
const MIN_CONSULT_MINS = 3;
const MAX_CONSULT_MINS = 30;

/** Used until the day has enough completed consultations to speak for itself. */
export const DEFAULT_CONSULT_MINS = 5;

/** Below this many samples the day's average is noise, so the default is used instead. */
export const MIN_RELIABLE_SAMPLE = 5;

/**
 * The token-status route this feeds is polled every few seconds by every waiting
 * patient's phone — its own comment calls it the busiest query in the system after the
 * live board. The rate it needs moves on the scale of minutes, not seconds, so it is
 * computed once a minute per department and served from memory in between.
 *
 * Module scope, so it is shared by every request the server instance handles.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: ServiceRate }>();

/** Keeps yesterday's departments from accumulating in a long-running server. */
function prune(now: number) {
  if (cache.size < 64) return;
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export async function getServiceRate(departmentId: string, serviceDate: Date): Promise<ServiceRate> {
  const key = `${departmentId}|${serviceDate.toISOString()}`;
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  // COMPLETED gives the consultation lengths; CALLED contributes rooms that are busy right
  // now but have not finished anyone yet — the first patient of the morning in a room
  // would otherwise make that room invisible. Covered by the
  // [departmentId, serviceDate, status] index.
  const tokens = await db.token.findMany({
    where: {
      departmentId,
      serviceDate,
      deletedAt: null,
      status: { in: ['COMPLETED', 'CALLED'] },
    },
    select: { status: true, roomNumber: true, calledAt: true, completedAt: true },
  });

  let totalMins = 0;
  let sampleSize = 0;
  const rooms = new Set<string>();

  for (const token of tokens) {
    if (token.roomNumber) rooms.add(token.roomNumber);

    if (token.status === 'COMPLETED' && token.calledAt && token.completedAt) {
      const mins = (token.completedAt.getTime() - token.calledAt.getTime()) / 60_000;
      // Guards against clock skew and against rows completed by the bulk update in
      // queue/next, which stamps completedAt on a token whose calledAt may be later.
      if (mins > 0) {
        totalMins += mins;
        sampleSize++;
      }
    }
  }

  const rawAvg = sampleSize > 0 ? totalMins / sampleSize : DEFAULT_CONSULT_MINS;

  const value: ServiceRate = {
    avgConsultMins: Math.min(MAX_CONSULT_MINS, Math.max(MIN_CONSULT_MINS, Math.round(rawAvg))),
    activeRooms: Math.max(1, rooms.size),
    sampleSize,
  };

  prune(now);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });

  return value;
}

/** The per-patient figure the estimate should actually use, given how thin the day's data is. */
export function resolvePerPatientMins(rate: ServiceRate): number {
  return rate.sampleSize >= MIN_RELIABLE_SAMPLE ? rate.avgConsultMins : DEFAULT_CONSULT_MINS;
}

/**
 * Wait for a patient with `patientsAhead` people in front of them.
 *
 * The rooms work in parallel, so the queue drains in batches of `activeRooms`. Consults
 * already under way are counted as half done on average, which is a better expectation
 * than the flat +5 the previous formula added.
 */
export function estimateWaitMins(
  patientsAhead: number,
  rate: ServiceRate,
  isAnyoneBeingServed: boolean,
): number {
  const perPatient = resolvePerPatientMins(rate);
  const batches = Math.ceil(patientsAhead / rate.activeRooms);
  const inFlight = isAnyoneBeingServed ? Math.round(perPatient / 2) : 0;
  return batches * perPatient + inFlight;
}
