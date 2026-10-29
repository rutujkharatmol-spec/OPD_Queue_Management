import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

/**
 * Room staging: sending a waiting patient to a room before the doctor calls them in.
 *
 * Mirrors the operations in src/lib/roomQueueSettings.ts, which applies them to its
 * local copy at once and sends them here. The live board returns the result to every
 * screen as `stagedByRoom`.
 *
 *   ADD          put tokenNumbers at the end of roomNumber's list, in the order given
 *                (taking them out of any other room)
 *   REMOVE       take tokenNumbers out of whatever room they are in
 *   CLEAR_ROOM   empty roomNumber's list
 *   CLEAR_ALL    empty every room's list in the department
 *
 * Only today's WAITING tokens can be staged. Numbers that do not match one are skipped,
 * not an error: the token may have been called in from another screen meanwhile.
 */

type Context = { params: Promise<{ departmentId: string }> };
type Op = 'ADD' | 'REMOVE' | 'CLEAR_ROOM' | 'CLEAR_ALL';
type Body = { op?: Op; roomNumber?: string; tokenNumbers?: string[] };

const MAX_TOKENS = 500;

/** Matches the emoji the live board appends to emergency tokens. */
function cleanNumber(token: unknown): string {
  return typeof token === 'string' ? token.replace(' 🚨', '').trim() : '';
}

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const body = await readJson<Body>(request);
  const op = body.op;

  if (op !== 'ADD' && op !== 'REMOVE' && op !== 'CLEAR_ROOM' && op !== 'CLEAR_ALL') {
    return badRequest('op must be ADD, REMOVE, CLEAR_ROOM or CLEAR_ALL.');
  }

  const roomNumber = body.roomNumber?.trim().slice(0, 40) || '';
  if ((op === 'ADD' || op === 'CLEAR_ROOM') && !roomNumber) {
    return badRequest('roomNumber is required.');
  }

  const tokenNumbers = Array.from(
    new Set((Array.isArray(body.tokenNumbers) ? body.tokenNumbers : []).map(cleanNumber).filter(Boolean))
  ).slice(0, MAX_TOKENS);
  if ((op === 'ADD' || op === 'REMOVE') && tokenNumbers.length === 0) {
    return ok({ success: true, changed: 0 });
  }

  const department = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!department) return notFound('Department not found.');

  const scoped = { departmentId, serviceDate: serviceDateFor(), status: 'WAITING' as const, deletedAt: null };

  if (op === 'CLEAR_ALL') {
    const { count } = await db.token.updateMany({
      where: { ...scoped, stagedRoom: { not: null } },
      data: { stagedRoom: null, stagedAt: null },
    });
    return ok({ success: true, changed: count });
  }

  if (op === 'CLEAR_ROOM') {
    const { count } = await db.token.updateMany({
      where: { ...scoped, stagedRoom: roomNumber },
      data: { stagedRoom: null, stagedAt: null },
    });
    return ok({ success: true, changed: count });
  }

  if (op === 'REMOVE') {
    const { count } = await db.token.updateMany({
      where: { ...scoped, tokenNumber: { in: tokenNumbers, mode: 'insensitive' } },
      data: { stagedRoom: null, stagedAt: null },
    });
    return ok({ success: true, changed: count });
  }

  // ADD: one timestamp per token, a millisecond apart, so the room's list keeps the
  // order the tokens were given in and they all land after anything already there.
  const rows = await db.token.findMany({
    where: { ...scoped, tokenNumber: { in: tokenNumbers, mode: 'insensitive' } },
    select: { id: true, tokenNumber: true },
  });
  const idByNumber = new Map(rows.map((r) => [r.tokenNumber.toLowerCase(), r.id]));
  const base = Date.now();

  const updates = tokenNumbers.flatMap((num, i) => {
    const id = idByNumber.get(num.toLowerCase());
    return id
      ? [db.token.update({ where: { id }, data: { stagedRoom: roomNumber, stagedAt: new Date(base + i) } })]
      : [];
  });
  if (updates.length > 0) await db.$transaction(updates);

  return ok({ success: true, changed: updates.length });
});
