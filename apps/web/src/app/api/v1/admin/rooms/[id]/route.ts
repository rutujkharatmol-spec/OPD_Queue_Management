import { db } from '@/lib/db';
import { badRequest, notFound, ok, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Sets or clears the doctor name shown for a room (TV board, Doctor Desk, Analytics). */
export const PATCH = route(async (request: Request, { params }: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await readJson<{ doctorName?: string | null }>(request);
  if (body.doctorName === undefined) return badRequest('doctorName is required (use null to clear).');

  const doctorName = (body.doctorName ?? '').trim().replace(/\s+/g, ' ') || null;
  if (doctorName && doctorName.length > 80) return badRequest('Doctor name is too long.');

  const room = await db.room.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!room) return notFound('Room not found.');

  const updated = await db.room.update({
    where: { id },
    data: { doctorName },
    select: { id: true, roomNumber: true, doctorName: true, departmentId: true },
  });
  return ok(updated);
});
