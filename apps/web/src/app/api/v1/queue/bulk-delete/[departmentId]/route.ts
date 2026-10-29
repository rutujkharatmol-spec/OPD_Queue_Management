import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };
type Body = {
  /** WAITING clears the general line; ROOM clears one room's called + staged patients. */
  scope?: 'WAITING' | 'ROOM';
  roomNumber?: string;
  /**
   * Staged token numbers for a ROOM clear, as the caller sees them. The database's own
   * staging (`stagedRoom`) is cleared too; this list covers staging done offline that has
   * not reached the server yet. Only WAITING tokens of this department and day match.
   */
  tokenNumbers?: string[];
};

/** Matches the emoji the live board appends to emergency tokens. */
function cleanNumber(token: string): string {
  return token.replace(' 🚨', '').trim();
}

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const body = await readJson<Body>(request);

  const scope = body.scope ?? 'WAITING';
  if (scope !== 'WAITING' && scope !== 'ROOM') {
    return badRequest(`Unknown scope ${scope}.`);
  }

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) return notFound('Department not found.');

  const serviceDate = serviceDateFor();

  // Every branch below is bounded by department *and* service date. A token number alone
  // identifies a different patient in every department and on every past day, so a bulk
  // delete without both would reach far outside the queue the user is looking at.
  const scoped = { departmentId, serviceDate, deletedAt: null } as const;

  if (scope === 'WAITING') {
    const { count } = await db.token.updateMany({
      where: { ...scoped, status: 'WAITING' },
      data: { status: 'SKIPPED', deletedAt: new Date() },
    });
    return ok({ success: true, deleted: count, scope });
  }

  const roomNumber = body.roomNumber?.trim();
  if (!roomNumber) return badRequest('roomNumber is required to clear a room.');

  // Staged tokens are still WAITING; the room they are staged for is in `stagedRoom`.
  // The caller's list is still honoured for staging done offline that has not reached
  // the server yet. Restricting to WAITING means a number that has meanwhile been
  // called into a *different* room is not dragged out of it by this room's clear.
  const stagedNumbers = (body.tokenNumbers ?? [])
    .map(cleanNumber)
    .filter(Boolean);

  const { count } = await db.token.updateMany({
    where: {
      ...scoped,
      OR: [
        // Patients currently called into this room.
        { status: 'CALLED', roomNumber },
        // Patients staged for this room, still sitting in the general line.
        { status: 'WAITING', stagedRoom: roomNumber },
        ...(stagedNumbers.length > 0
          ? [{ status: 'WAITING' as const, tokenNumber: { in: stagedNumbers } }]
          : []),
      ],
    },
    data: { status: 'SKIPPED', deletedAt: new Date() },
  });

  return ok({ success: true, deleted: count, scope, roomNumber });
});
