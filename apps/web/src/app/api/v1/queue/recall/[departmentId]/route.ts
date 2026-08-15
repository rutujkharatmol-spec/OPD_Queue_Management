import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };
type Body = { roomNumber: string };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const body = await readJson<Body>(request);

  if (!body.roomNumber?.trim()) {
    return badRequest('roomNumber is required.');
  }

  const roomNumber = body.roomNumber.trim();
  const serviceDate = serviceDateFor();

  const activeToken = await db.token.findFirst({
    where: {
      departmentId,
      roomNumber,
      status: 'CALLED',
      serviceDate,
      deletedAt: null,
    },
    orderBy: { calledAt: 'desc' },
    include: { patient: true, department: true, doctor: true },
  });

  if (!activeToken) {
    return notFound(`No active patient currently called in room ${roomNumber}`);
  }

  const updated = await db.token.update({
    where: { id: activeToken.id },
    data: { recalledAt: new Date() },
    include: { patient: true, department: true, doctor: true },
  });

  return ok(updated);
});
