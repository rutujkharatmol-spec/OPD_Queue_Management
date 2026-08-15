import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ tokenId: string }> };
type Body = { action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE' };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { tokenId } = await params;
  const body = await readJson<Body>(request);

  if (!body.action) return badRequest('action is required.');

  const token = await db.token.findUnique({
    where: { id: tokenId },
    include: { patient: true, department: true },
  });

  if (!token) return notFound('Token not found.');

  if (body.action === 'COMPLETE') {
    const updated = await db.token.update({
      where: { id: tokenId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return ok(updated);
  }

  if (body.action === 'ABSENT') {
    const updated = await db.token.update({
      where: { id: tokenId },
      data: { status: 'ABSENT' },
    });
    return ok(updated);
  }

  if (body.action === 'SKIP' || body.action === 'NOT_AVAILABLE') {
    // Penalty: bump absent count and push back in queue
    const waitingTokens = await db.token.findMany({
      where: {
        departmentId: token.departmentId,
        serviceDate: token.serviceDate,
        status: 'WAITING',
        deletedAt: null,
      },
      orderBy: { issuedAt: 'asc' },
      take: 4,
    });

    // If there are waiting tokens, place this token after the 3rd one
    let targetIssuedAt = new Date();
    if (waitingTokens.length >= 3) {
      targetIssuedAt = new Date(waitingTokens[2].issuedAt.getTime() + 1000);
    }

    const updated = await db.token.update({
      where: { id: tokenId },
      data: {
        status: 'WAITING',
        calledAt: null,
        roomNumber: null,
        absentCount: { increment: 1 },
        issuedAt: targetIssuedAt,
      },
    });
    return ok(updated);
  }

  return badRequest(`Unknown action ${body.action}`);
});
