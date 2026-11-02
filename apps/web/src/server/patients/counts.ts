import { db } from '@/lib/db';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export type PatientCountsResult = {
  /** Raw database patient rows (may include duplicates created before constraint). */
  total: number;
  /** True unique individual human patients of ALL TIME (deduplicated by UHID, phone, and patient ID). */
  totalUnique: number;
  /** True unique individual human patients who visited today (deduplicated, never counted twice). */
  cameToday: number;
  /** Total tokens issued across all time. */
  totalTokens: number;
  /** Total tokens issued today. */
  tokensToday: number;
};

/**
 * Calculates deduplicated patient counts for both all-time and today.
 *
 * Guaranteed deduplication: A patient who holds multiple tokens, visited multiple
 * departments, or has duplicate registration entries is NEVER counted twice.
 */
export async function patientCounts(): Promise<PatientCountsResult> {
  const serviceDate = serviceDateFor();

  const [patients, cameTodayRows, totalTokens, tokensToday] = await Promise.all([
    db.patient.findMany({
      where: { deletedAt: null },
      select: { id: true, uhid: true, phone: true },
    }),
    db.patient.count({
      where: { deletedAt: null, tokens: { some: { serviceDate, deletedAt: null } } },
    }),
    db.token.count({ where: { deletedAt: null } }),
    db.token.count({ where: { serviceDate, deletedAt: null } }),
  ]);

  // All-time deduplication: Group by physical hospital CR No (UHID), then valid phone
  const uhidToKey = new Map<string, string>();
  const phoneToKey = new Map<string, string>();
  let totalUnique = 0;

  for (const p of patients) {
    const uhid = p.uhid?.trim() || null;
    const phone =
      p.phone?.trim() && p.phone !== '0000000000' && p.phone.length >= 6 ? p.phone.trim() : null;

    let existingKey: string | undefined;
    if (uhid && uhidToKey.has(uhid)) {
      existingKey = uhidToKey.get(uhid);
    } else if (phone && phoneToKey.has(phone)) {
      existingKey = phoneToKey.get(phone);
    }

    if (!existingKey) {
      totalUnique++;
      const key = `p:${p.id}`;
      if (uhid) uhidToKey.set(uhid, key);
      if (phone) phoneToKey.set(phone, key);
    } else {
      if (uhid && !uhidToKey.has(uhid)) uhidToKey.set(uhid, existingKey);
      if (phone && !phoneToKey.has(phone)) phoneToKey.set(phone, existingKey);
    }
  }

  return {
    total: patients.length,
    totalUnique,
    cameToday: cameTodayRows,
    totalTokens,
    tokensToday,
  };
}
