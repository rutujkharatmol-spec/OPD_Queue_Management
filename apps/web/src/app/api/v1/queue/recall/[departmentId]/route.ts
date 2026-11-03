import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };
type Body = {
  roomNumber: string;
  /** Recall this patient. Without it, the room's most recently called patient. */
  tokenId?: string;
};

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const body = await readJson<Body>(request);

  if (!body.roomNumber?.trim()) {
    return badRequest('roomNumber is required.');
  }

  const roomNumber = body.roomNumber.trim();
  const serviceDate = serviceDateFor();
  const tokenId = body.tokenId?.trim() || undefined;

  const activeToken = await db.token.findFirst({
    where: {
      ...(tokenId ? { id: tokenId } : {}),
      departmentId,
      roomNumber,
      status: 'CALLED',
      serviceDate,
      deletedAt: null,
    },
    orderBy: { calledAt: 'desc' },
    // Only the id is used, to target the update below — which re-reads the row with the
    // relations the response actually needs. Joining patient, department and doctor here
    // as well fetched all three twice per recall.
    select: { id: true },
  });

  if (!activeToken) {
    return notFound(
      tokenId
        ? `That patient is no longer waiting to come in to room ${roomNumber}`
        : `No active patient currently called in room ${roomNumber}`
    );
  }

  const updated = await db.token.update({
    where: { id: activeToken.id },
    data: { recalledAt: new Date() },
    include: { patient: true, department: true, doctor: true },
  });

  return ok(updated);
});
