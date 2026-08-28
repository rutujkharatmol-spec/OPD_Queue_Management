import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ tokenId: string }> };
type Body = {
  action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE' | 'RETURN_TO_QUEUE' | 'RESET_TO_WAITING' | 'CANCEL' | 'DELETE';
  passCount?: number;
  /**
   * Scopes a lookup by token *number* to one department. Token numbers restart at 1 for
   * every department every day, so without this the identifier is ambiguous.
   */
  departmentId?: string;
};

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { tokenId } = await params;
  const body = await readJson<Body>(request);

  if (!body.action) return badRequest('action is required.');

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenId);

  // Only the three columns below are read, and the response returns the *updated* row,
  // not this one. The previous `include: { patient: true, department: true }` joined and
  // shipped both rows in full on every Complete / Absent / Pass click and then dropped
  // them on the floor.
  const TOKEN_LOOKUP_SELECT = { id: true, departmentId: true, serviceDate: true } as const;

  // A token number is only unique within (department, service date) — `token_counters` is
  // keyed on exactly that pair, so every department restarts at 1 each morning. Resolving
  // one to a single row therefore has to carry both, and the result is still narrowed to
  // the newest match. This used to be an unscoped `updateMany` for DELETE, which soft
  // deleted that number in every department and on every past date at once.
  const rawNumber = tokenId.replace(/^.*-/, '').trim();
  const token = isUuid
    ? await db.token.findUnique({
        where: { id: tokenId },
        select: TOKEN_LOOKUP_SELECT,
      })
    : await db.token.findFirst({
        where: {
          deletedAt: null,
          serviceDate: serviceDateFor(),
          ...(body.departmentId ? { departmentId: body.departmentId } : {}),
          OR: [
            { tokenNumber: { equals: tokenId, mode: 'insensitive' } },
            { tokenNumber: { equals: rawNumber, mode: 'insensitive' } },
            { tokenNumber: { endsWith: `-${rawNumber}`, mode: 'insensitive' } },
          ],
        },
        orderBy: { issuedAt: 'desc' },
        select: TOKEN_LOOKUP_SELECT,
      });

  if (!token) return notFound('Token not found.');

  if (body.action === 'DELETE' || body.action === 'CANCEL') {
    // Targeted by primary key: exactly the one row resolved above, never a pattern match.
    await db.token.update({
      where: { id: token.id },
      data: { status: 'SKIPPED', deletedAt: new Date() },
    });
    return ok({ success: true, deleted: tokenId, id: token.id });
  }

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

  if (body.action === 'RETURN_TO_QUEUE' || body.action === 'RESET_TO_WAITING') {
    const updated = await db.token.update({
      where: { id: token.id },
      data: {
        status: 'WAITING',
        calledAt: null,
        recalledAt: null,
        roomNumber: null,
      },
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
      // Only the timestamp is read below.
      select: { issuedAt: true },
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
