import { db } from '@/lib/db';
import { ok, badRequest, route, readJson } from '@/server/http';
import { parseDoctorList, setRoomDoctors } from '@/server/rooms/roomDoctors';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const departmentId = new URL(request.url).searchParams.get('departmentId') || undefined;

  const rooms = await db.room.findMany({
    where: { deletedAt: null, ...(departmentId && { departmentId }) },
    orderBy: { roomNumber: 'asc' },
  });

  return ok(rooms);
});

export const POST = route(async (request: Request) => {
  const { roomNumber, isActive, departmentId, doctorName } = await readJson<{
    roomNumber?: string;
    isActive?: boolean;
    departmentId?: string;
    doctorName?: string;
  }>(request);

  if (!roomNumber?.trim()) return badRequest('Room number is required.');
  const doctors = parseDoctorList(doctorName);
  if ('error' in doctors) return badRequest(doctors.error);

  if (departmentId) {
    const department = await db.department.findUnique({ where: { id: departmentId } });
    if (!department) return badRequest('That department does not exist.');
  }

  const room = await db.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        roomNumber: roomNumber.trim(),
        isActive: isActive ?? true,
        departmentId: departmentId || null,
      },
    });
    if (doctors.names.length === 0) return created;
    await setRoomDoctors(tx, created.id, doctors.names);
    return tx.room.findUniqueOrThrow({ where: { id: created.id } });
  });

  return ok(room, 201);
});
