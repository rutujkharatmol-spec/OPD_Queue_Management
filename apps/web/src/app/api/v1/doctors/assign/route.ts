import { db } from '@/lib/db';
import { ok, badRequest, route, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

type Body = { doctorName?: string; departmentId?: string; roomId?: string };

/**
 * A doctor sits down in a room: puts their name on that room and saves them as a doctor.
 *
 * The room's name is what the TV shows and what each called patient is credited to in
 * analytics. A doctor is in one room at a time, so their name comes off any other room.
 */
export const POST = route(async (request: Request) => {
  const body = await readJson<Body>(request);
  const doctorName = body.doctorName?.trim().replace(/\s+/g, ' ');

  if (!doctorName) return badRequest('Doctor name is required.');
  if (doctorName.length > 80) return badRequest('Doctor name is too long.');
  if (!body.departmentId) return badRequest('Department is required.');
  if (!body.roomId) return badRequest('Room is required.');

  const room = await db.room.findUnique({
    where: { id: body.roomId },
    select: { id: true, roomNumber: true, departmentId: true, deletedAt: true },
  });
  // 400, not 404: the offline layer reads a 404 as "server down" and falls back to local data.
  if (!room || room.deletedAt) return badRequest('Room not found.');
  if (room.departmentId && room.departmentId !== body.departmentId) {
    return badRequest('That room belongs to a different department.');
  }

  const departmentId = body.departmentId;

  const result = await db.$transaction(async (tx) => {
    // Doctor names are matched ignoring case, so "dr. roy" does not create a second Dr. Roy.
    const existing = await tx.doctor.findFirst({
      where: { deletedAt: null, name: { equals: doctorName, mode: 'insensitive' } },
      select: { id: true },
    });

    const doctor = existing
      ? await tx.doctor.update({
          where: { id: existing.id },
          data: { departmentId, roomNumber: room.roomNumber, isAvailable: true },
          select: { id: true, name: true },
        })
      : await tx.doctor.create({
          data: { name: doctorName, departmentId, roomNumber: room.roomNumber },
          select: { id: true, name: true },
        });

    await tx.room.updateMany({
      where: {
        id: { not: room.id },
        deletedAt: null,
        doctorName: { equals: doctorName, mode: 'insensitive' },
      },
      data: { doctorName: null },
    });

    const updatedRoom = await tx.room.update({
      where: { id: room.id },
      data: { doctorName: doctor.name },
      select: { id: true, roomNumber: true, departmentId: true, doctorName: true },
    });

    return { doctor, room: updatedRoom };
  });

  return ok(result);
});
