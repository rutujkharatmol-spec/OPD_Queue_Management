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
  const department = await db.department.findUnique({ where: { id: departmentId } });
  if (!department) return notFound('Department not found.');

  const serviceDate = serviceDateFor();

  const nextToken = await db.$transaction(async (tx) => {
    // 1. Mark any currently CALLED token in this room as COMPLETED
    await tx.token.updateMany({
      where: {
        departmentId,
        roomNumber,
        status: 'CALLED',
        deletedAt: null,
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // 2. Find next waiting token for today
    const waitingToken = await tx.token.findFirst({
      where: {
        departmentId,
        serviceDate,
        status: 'WAITING',
        deletedAt: null,
      },
      orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
    });

    if (!waitingToken) return null;

    // 3. Mark token as CALLED in this room
    return tx.token.update({
      where: { id: waitingToken.id },
      data: {
        status: 'CALLED',
        calledAt: new Date(),
        recalledAt: null,
        roomNumber,
      },
      include: { patient: true, department: true, doctor: true },
    });
  });

  return ok(nextToken);
});
