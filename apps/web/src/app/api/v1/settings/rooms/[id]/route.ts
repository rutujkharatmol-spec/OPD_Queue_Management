import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';

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

  const updated = await db.room.update({
    where: { id },
    data: {
      ...(roomNumber !== undefined && { roomNumber: roomNumber.trim() }),
      ...(isActive !== undefined && { isActive }),
      ...(doctorName !== undefined && { doctorName: doctorName?.trim() || null }),
    },
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
