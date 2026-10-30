import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { parseDoctorList, setRoomDoctors } from '@/server/rooms/roomDoctors';
import { splitDoctorNames } from '@/lib/roomDoctors';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PUT = route(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { roomNumber, isActive, doctorName } = await readJson<{
    roomNumber?: string;
    isActive?: boolean;
    doctorName?: string;
  }>(request);

  const room = await db.room.findUnique({ where: { id } });
  if (!room || room.deletedAt) return notFound('Room not found.');

  if (roomNumber !== undefined && !roomNumber.trim()) {
    return badRequest('Room number cannot be empty.');
  }

  const parsed = doctorName !== undefined ? parseDoctorList(doctorName) : null;
  if (parsed && 'error' in parsed) return badRequest(parsed.error);
  const doctors = parsed as { names: string[] } | null;

  const renumbered = roomNumber !== undefined && roomNumber.trim() !== room.roomNumber;

  const updated = await db.$transaction(async (tx) => {
    await tx.room.update({
      where: { id },
      data: {
        ...(roomNumber !== undefined && { roomNumber: roomNumber.trim() }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    // A new doctor list, or a new room number the doctors' saved rooms must follow.
    if (doctors || renumbered) {
      await setRoomDoctors(tx, id, doctors ? doctors.names : splitDoctorNames(room.doctorName), {
        doctorName: room.doctorName,
        roomNumber: room.roomNumber,
      });
    }
    return tx.room.findUniqueOrThrow({ where: { id } });
  });

  return ok(updated);
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const { id } = await params;

  const room = await db.room.findUnique({ where: { id } });
  if (!room || room.deletedAt) return notFound('Room not found.');

  await db.room.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  return ok({ id, deleted: true });
});
