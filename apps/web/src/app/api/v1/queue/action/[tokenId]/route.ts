import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ tokenId: string }> };
type Body = { action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE'; passCount?: number };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { tokenId } = await params;
  const body = await readJson<Body>(request);

  if (!body.action) return badRequest('action is required.');

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenId);
  const token = isUuid
    ? await db.token.findUnique({
        where: { id: tokenId },
        include: { patient: true, department: true },
      })
    : await db.token.findFirst({
        where: { tokenNumber: tokenId, deletedAt: null },
        include: { patient: true, department: true },
      });

  if (!token) return notFound('Token not found.');

  if (body.action === 'COMPLETE') {
    const updated = await db.token.update({
      where: { id: token.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return ok(updated);
  }

  if (body.action === 'ABSENT') {
    const updated = await db.token.update({
      where: { id: token.id },
      data: { status: 'ABSENT' },
    });
    return ok(updated);
  }

  if (body.action === 'SKIP' || body.action === 'NOT_AVAILABLE') {
    const passCount = (typeof body.passCount === 'number' && body.passCount > 0)
      ? Math.floor(body.passCount)
      : 3;

    // Penalty: bump absent count and push back in queue
    const waitingTokens = await db.token.findMany({
      where: {
        departmentId: token.departmentId,
        serviceDate: token.serviceDate,
        status: 'WAITING',
        deletedAt: null,
      },
      orderBy: { issuedAt: 'asc' },
      take: passCount + 1,
    });

    // If there are waiting tokens, place this token after the Nth one
    let targetIssuedAt = new Date();
    if (waitingTokens.length >= passCount) {
      targetIssuedAt = new Date(waitingTokens[passCount - 1].issuedAt.getTime() + 1000);
    } else if (waitingTokens.length > 0) {
      targetIssuedAt = new Date(waitingTokens[waitingTokens.length - 1].issuedAt.getTime() + 1000);
    }

    const updated = await db.token.update({
      where: { id: token.id },
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
