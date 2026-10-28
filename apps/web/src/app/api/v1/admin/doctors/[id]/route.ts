import { db } from '@/lib/db';
import { badRequest, conflict, notFound, ok, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const cleanName = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');

/**
 * Renames a doctor. The new name is also written to rooms showing the old name and to
 * past tokens credited to it, so the TV, the Doctor Desk and Analytics stay in step.
 */
export const PATCH = route(async (request: Request, { params }: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await readJson<{ name?: string }>(request);
  const name = cleanName(body.name);
  if (!name) return badRequest('Doctor name is required.');
  if (name.length > 80) return badRequest('Doctor name is too long.');

  const doctor = await db.doctor.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true } });
  if (!doctor) return notFound('Doctor not found.');

  const clash = await db.doctor.findFirst({
    where: { deletedAt: null, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (clash) return conflict(`Another doctor is already named "${name}".`);

  const oldName = doctor.name;
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.doctor.update({ where: { id }, data: { name }, select: { id: true, name: true } });
    const rooms = await tx.room.updateMany({
      where: { deletedAt: null, doctorName: { equals: oldName, mode: 'insensitive' } },
      data: { doctorName: name },
    });
    const tokens = await tx.token.updateMany({
      where: { servedByDoctorName: { equals: oldName, mode: 'insensitive' } },
      data: { servedByDoctorName: name },
    });
    return { ...updated, roomsUpdated: rooms.count, tokensUpdated: tokens.count };
  });

  return ok(result);
});

/** Removes a doctor (soft delete) and takes their name off any room. Past records keep it. */
export const DELETE = route(async (_request: Request, { params }: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const doctor = await db.doctor.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true } });
  if (!doctor) return notFound('Doctor not found.');

  const result = await db.$transaction(async (tx) => {
    await tx.doctor.update({ where: { id }, data: { deletedAt: new Date(), isAvailable: false } });
    const rooms = await tx.room.updateMany({
      where: { deletedAt: null, doctorName: { equals: doctor.name, mode: 'insensitive' } },
      data: { doctorName: null },
    });
    return { id, deleted: true, roomsCleared: rooms.count };
  });

  return ok(result);
});
