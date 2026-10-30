import { db } from '@/lib/db';
import { ok, route } from '@/server/http';
import { splitDoctorNames } from '@/lib/roomDoctors';

export const dynamic = 'force-dynamic';

/**
 * Doctor names for the Doctor Desk name search.
 *
 * Merges saved doctors with names typed into room settings, so a doctor who was only
 * ever set on a room still shows up. The "Doctor for ..." rows are placeholders that
 * token registration creates, not real people, so they are left out.
 */
export const GET = route(async () => {
  const [doctors, rooms] = await Promise.all([
    db.doctor.findMany({
      where: { deletedAt: null },
      select: { name: true, departmentId: true, roomNumber: true },
      orderBy: { updatedAt: 'desc' },
    }),
    db.room.findMany({
      where: { deletedAt: null, doctorName: { not: null } },
      select: { doctorName: true, departmentId: true, roomNumber: true },
    }),
  ]);

  const byKey = new Map<string, { name: string; departmentId: string | null; roomNumber: string | null }>();
  const add = (name: string | null, departmentId: string | null, roomNumber: string | null) => {
    const clean = name?.trim().replace(/\s+/g, ' ');
    if (!clean || /^doctor for /i.test(clean)) return;
    const key = clean.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { name: clean, departmentId, roomNumber });
  };

  for (const d of doctors) add(d.name, d.departmentId, d.roomNumber);
  // A room's list can name several doctors sharing it.
  for (const r of rooms) for (const name of splitDoctorNames(r.doctorName)) add(name, r.departmentId, r.roomNumber);

  return ok(Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name)));
});
