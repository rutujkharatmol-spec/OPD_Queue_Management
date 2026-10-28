import { db } from '@/lib/db';
import { badRequest, conflict, ok, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

const cleanName = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');

/** Doctors, rooms and departments for the admin Doctors & Rooms screen. */
export const GET = route(async () => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [departments, doctors, rooms] = await Promise.all([
    db.department.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    db.doctor.findMany({
      // "Doctor for <dept>" rows are placeholders token registration creates, not people.
      where: { deletedAt: null, NOT: { name: { startsWith: 'Doctor for', mode: 'insensitive' } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, departmentId: true, roomNumber: true, updatedAt: true },
    }),
    db.room.findMany({
      where: { deletedAt: null },
      orderBy: { roomNumber: 'asc' },
      select: { id: true, roomNumber: true, doctorName: true, departmentId: true, isActive: true },
    }),
  ]);

  return ok({ departments, doctors, rooms });
});

/** Adds a doctor, optionally putting their name on a room. */
export const POST = route(async (request: Request) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson<{ name?: string; departmentId?: string; roomId?: string }>(request);
  const name = cleanName(body.name);
  if (!name) return badRequest('Doctor name is required.');
  if (name.length > 80) return badRequest('Doctor name is too long.');

  const existing = await db.doctor.findFirst({
    where: { deletedAt: null, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return conflict(`A doctor named "${name}" already exists.`);

  const room = body.roomId
    ? await db.room.findFirst({ where: { id: body.roomId, deletedAt: null }, select: { id: true, roomNumber: true, departmentId: true } })
    : null;
  if (body.roomId && !room) return badRequest('Room not found.');

  const doctor = await db.$transaction(async (tx) => {
    const created = await tx.doctor.create({
      data: {
        name,
        departmentId: body.departmentId || room?.departmentId || null,
        roomNumber: room?.roomNumber ?? null,
      },
      select: { id: true, name: true },
    });
    if (room) await tx.room.update({ where: { id: room.id }, data: { doctorName: name } });
    return created;
  });

  return ok(doctor, 201);
});
