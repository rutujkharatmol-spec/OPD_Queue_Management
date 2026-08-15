import { db } from '@/lib/db';
import { ok, badRequest, route, readJson } from '@/server/http';

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

  if (departmentId) {
    const department = await db.department.findUnique({ where: { id: departmentId } });
    if (!department) return badRequest('That department does not exist.');
  }

  const room = await db.room.create({
    data: {
      roomNumber: roomNumber.trim(),
      isActive: isActive ?? true,
      doctorName: doctorName?.trim() || null,
      departmentId: departmentId || null,
    },
  });

  return ok(room, 201);
});
