import { db } from '@/lib/db';
import { badRequest, notFound, ok, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';
import { parseDoctorList, setRoomDoctors } from '@/server/rooms/roomDoctors';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Sets or clears the doctors shown for a room (TV board, Doctor Desk, Analytics).
 * Several doctors sharing the room are separated by commas.
 */
export const PATCH = route(async (request: Request, { params }: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await readJson<{ doctorName?: string | null }>(request);
  if (body.doctorName === undefined) return badRequest('doctorName is required (use null to clear).');

  const parsed = parseDoctorList(body.doctorName);
  if ('error' in parsed) return badRequest(parsed.error);

  const room = await db.room.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!room) return notFound('Room not found.');

  const updated = await db.$transaction((tx) => setRoomDoctors(tx, room.id, parsed.names));
  return ok(updated);
});
