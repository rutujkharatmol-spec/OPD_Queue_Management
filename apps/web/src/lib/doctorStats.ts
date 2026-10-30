/**
 * Doctor-wise patient counts for one day.
 *
 * Plain functions with no server or browser imports, so the API routes and the
 * offline local store produce exactly the same numbers.
 */

import { soleDoctor } from './roomDoctors';

export type DoctorStatsToken = {
  status: string;
  roomNumber?: string | null;
  /** Doctor name copied onto the token when it was called into a room. */
  servedByDoctorName?: string | null;
  calledAt?: Date | string | null;
  completedAt?: Date | string | null;
};

export type DoctorPatientStats = {
  /** null when the room had no doctor name set. */
  doctorName: string | null;
  rooms: string[];
  /** Consultations completed. This is the "patients served" number. */
  servedCount: number;
  /** Currently with the doctor. */
  inConsultationCount: number;
  /** Called by the doctor but marked absent. */
  noShowCount: number;
  avgConsultMins: number;
};

const toMs = (v: Date | string | null | undefined) =>
  v ? (v instanceof Date ? v.getTime() : new Date(v).getTime()) : 0;

// "Dr. S. Roy" and "dr. s. roy " are the same person.
const keyFor = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Groups the tokens a doctor actually saw (called, completed, or called then absent).
 *
 * The doctor is the name saved on the token (who called them in or pressed Done).
 * Tokens without one fall back to the room's current doctor, but only when the room
 * has exactly one: a patient in a shared room is not guessed onto either doctor.
 */
export function summariseByDoctor(
  tokens: DoctorStatsToken[],
  doctorByRoom?: Map<string, string>
): DoctorPatientStats[] {
  const map = new Map<
    string,
    {
      doctorName: string | null;
      rooms: Set<string>;
      servedCount: number;
      inConsultationCount: number;
      noShowCount: number;
      consultTotalMins: number;
      consultCount: number;
    }
  >();

  for (const t of tokens) {
    const seen =
      t.status === 'COMPLETED' ||
      t.status === 'CALLED' ||
      t.status === 'IN_PROGRESS' ||
      (t.status === 'ABSENT' && !!t.calledAt);
    if (!seen) continue;

    const room = t.roomNumber || null;
    const rawName =
      t.servedByDoctorName?.trim() || (room ? soleDoctor(doctorByRoom?.get(room)) : '') || '';
    if (!rawName && !room) continue;

    const key = rawName ? keyFor(rawName) : '';
    let acc = map.get(key);
    if (!acc) {
      acc = {
        doctorName: rawName || null,
        rooms: new Set(),
        servedCount: 0,
        inConsultationCount: 0,
        noShowCount: 0,
        consultTotalMins: 0,
        consultCount: 0,
      };
      map.set(key, acc);
    }
    if (room) acc.rooms.add(room);

    if (t.status === 'COMPLETED') {
      acc.servedCount++;
      if (t.calledAt && t.completedAt) {
        acc.consultTotalMins += (toMs(t.completedAt) - toMs(t.calledAt)) / 60_000;
        acc.consultCount++;
      }
    } else if (t.status === 'CALLED' || t.status === 'IN_PROGRESS') {
      acc.inConsultationCount++;
    } else {
      acc.noShowCount++;
    }
  }

  return Array.from(map.values())
    .map((acc) => ({
      doctorName: acc.doctorName,
      rooms: Array.from(acc.rooms).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
      servedCount: acc.servedCount,
      inConsultationCount: acc.inConsultationCount,
      noShowCount: acc.noShowCount,
      avgConsultMins:
        acc.consultCount > 0 ? Math.round((acc.consultTotalMins / acc.consultCount) * 10) / 10 : 0,
    }))
    .sort((a, b) => {
      // Rooms with no doctor set go last.
      if (!a.doctorName !== !b.doctorName) return a.doctorName ? -1 : 1;
      return b.servedCount - a.servedCount || (a.doctorName ?? '').localeCompare(b.doctorName ?? '');
    });
}
