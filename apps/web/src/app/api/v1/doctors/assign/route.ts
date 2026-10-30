import { db } from '@/lib/db';
import { ok, badRequest, route, readJson } from '@/server/http';
import { cleanDoctorName, splitDoctorNames, withDoctor } from '@/lib/roomDoctors';
import { setRoomDoctors } from '@/server/rooms/roomDoctors';

export const dynamic = 'force-dynamic';

type Body = {
  doctorName?: string;
  departmentId?: string;
  roomId?: string;
  /**
   * true (the default): join the doctors already in the room. false: the others have
   * left, so this doctor replaces them.
   */
  shareRoom?: boolean;
};

/**
 * A doctor sits down in a room: adds their name to that room and saves them as a doctor.
 *
 * Several doctors can share a room. The room's list is what the TV shows. A doctor is in
 * one room at a time, so their name comes off any other room.
 */
export const POST = route(async (request: Request) => {
  const body = await readJson<Body>(request);
  const doctorName = cleanDoctorName(body.doctorName);

  if (!doctorName) return badRequest('Doctor name is required.');
  if (doctorName.length > 80) return badRequest('Doctor name is too long.');
  if (doctorName.includes(',')) return badRequest('A doctor name cannot contain a comma.');
  if (!body.departmentId) return badRequest('Department is required.');
  if (!body.roomId) return badRequest('Room is required.');

  const room = await db.room.findUnique({
    where: { id: body.roomId },
    select: { id: true, roomNumber: true, departmentId: true, doctorName: true, deletedAt: true },
  });
  // 400, not 404: the offline layer reads a 404 as "server down" and falls back to local data.
  if (!room || room.deletedAt) return badRequest('Room not found.');
  if (room.departmentId && room.departmentId !== body.departmentId) {
    return badRequest('That room belongs to a different department.');
  }

  const departmentId = body.departmentId;
  const shareRoom = body.shareRoom !== false;

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

    // Sharing keeps the room's order; a doctor already on the list keeps their place.
    const list = shareRoom ? splitDoctorNames(withDoctor(room.doctorName, doctor.name)) : [doctor.name];
    const updatedRoom = await setRoomDoctors(tx, room.id, list);

    return { doctor, room: updatedRoom };
  });

  return ok(result);
});
