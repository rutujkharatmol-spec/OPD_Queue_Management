import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import {
  ABSENT_AFTER_TIMES_LATE,
  LATE_AFTER_MINUTES,
  latePassCount,
  passIssuedAt,
} from '@/lib/queuePass';
import type { TokenPriority, TokenStatus } from '@/generated/prisma/enums';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ tokenId: string }> };
type Body = {
  /**
   * ARRIVED: the called patient came into the room (booklet scanned or "Came in" tapped);
   *          they are now in consultation (IN_PROGRESS).
   * LATE:    the called patient didn't come in time. The server checks the time itself and
   *          moves them back further each time they are late (see lib/queuePass.ts).
   */
  action:
    | 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE' | 'RETURN_TO_QUEUE' | 'RESET_TO_WAITING'
    | 'CANCEL' | 'DELETE' | 'ARRIVED' | 'LATE';
  passCount?: number;
  /**
   * Scopes a lookup by token *number* to one department. Token numbers restart at 1 for
   * every department every day, so without this the identifier is ambiguous.
   */
  departmentId?: string;
  /**
   * COMPLETE only: the doctor who finished the consultation (sent by the Doctor Desk).
   * Overrides the name copied from the room at call time, which is wrong when two
   * doctors share a room.
   */
  doctorName?: string;
};

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { tokenId } = await params;
  const body = await readJson<Body>(request);

  if (!body.action) return badRequest('action is required.');

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenId);

  // Only the columns below are read, and the response returns the *updated* row, not
  // this one. The previous `include: { patient: true, department: true }` joined and
  // shipped both rows in full on every Complete / Absent / Pass click and then dropped
  // them on the floor. The rest are for Pass and the late check.
  const TOKEN_LOOKUP_SELECT = {
    id: true,
    departmentId: true,
    serviceDate: true,
    status: true,
    priority: true,
    issuedAt: true,
    calledAt: true,
    absentCount: true,
  } as const;

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

  // Every action below changes the token's status, which ends any room staging. Without
  // this a patient sent back to the line would reappear in the room they were staged for.
  const UNSTAGE = { stagedRoom: null, stagedAt: null };

  if (body.action === 'DELETE' || body.action === 'CANCEL') {
    // Targeted by primary key: exactly the one row resolved above, never a pattern match.
    await db.token.update({
      where: { id: token.id },
      data: { status: 'SKIPPED', deletedAt: new Date(), ...UNSTAGE },
    });
    return ok({ success: true, deleted: tokenId, id: token.id });
  }

  if (body.action === 'COMPLETE') {
    const doneBy =
      typeof body.doctorName === 'string' ? body.doctorName.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
    const updated = await db.token.update({
      where: { id: token.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...(doneBy ? { servedByDoctorName: doneBy } : {}),
        ...UNSTAGE,
      },
    });
    return ok(updated);
  }

  if (body.action === 'ABSENT') {
    const updated = await db.token.update({
      where: { id: token.id },
      data: { status: 'ABSENT', ...UNSTAGE },
    });
    return ok(updated);
  }

  if (body.action === 'RETURN_TO_QUEUE' || body.action === 'RESET_TO_WAITING') {
    const updated = await db.token.update({
      where: { id: token.id },
      data: {
        ...UNSTAGE,
        status: 'WAITING',
        calledAt: null,
        recalledAt: null,
        roomNumber: null,
        servedByDoctorName: null,
      },
    });
    return ok(updated);
  }

  // Back into the line after being passed or late: no room, not called, one more pass.
  const BACK_IN_LINE = {
    status: 'WAITING' as const,
    calledAt: null,
    roomNumber: null,
    servedByDoctorName: null,
    absentCount: { increment: 1 },
    ...UNSTAGE,
  };

  if (body.action === 'SKIP' || body.action === 'NOT_AVAILABLE') {
    // Same 1–50 range the doctor's screen allows.
    const passCount = (typeof body.passCount === 'number' && body.passCount > 0)
      ? Math.min(50, Math.floor(body.passCount))
      : 3;
    const movedTo = await passTarget(token, passCount);

    const updated = await db.token.update({
      where: { id: token.id },
      data: { ...BACK_IN_LINE, ...(movedTo ? { issuedAt: movedTo } : {}) },
    });
    return ok(updated);
  }

  if (body.action === 'ARRIVED') {
    // Only a called patient can come in. Anything else (already in, done, moved back)
    // is left alone, so a second scan or a slow tap can't undo a later change.
    const { count } = await db.token.updateMany({
      where: { id: token.id, status: 'CALLED' },
      data: { status: 'IN_PROGRESS' },
    });
    return ok({ changed: count > 0, status: count > 0 ? 'IN_PROGRESS' : token.status });
  }

  if (body.action === 'LATE') {
    // The screen asks; the server decides, from its own clock, so two desks or a wrong
    // PC clock can't penalise anyone early.
    const lateSince = Date.now() - LATE_AFTER_MINUTES * 60_000;
    if (token.status !== 'CALLED' || !token.calledAt || token.calledAt.getTime() > lateSince) {
      return ok({ changed: false });
    }

    // The update only applies if the token is still late when it lands: still called, and
    // called before the cutoff. A "Came in" or a fresh call at the same moment wins, and the
    // patient keeps their place. (A cutoff, not the exact call time: the database keeps
    // microseconds that a JavaScript date drops, so exact equality can miss.)
    const stillLate = { id: token.id, status: 'CALLED' as const, calledAt: { lte: new Date(lateSince) } };
    const timesLate = token.absentCount + 1;

    if (timesLate >= ABSENT_AFTER_TIMES_LATE) {
      const { count } = await db.token.updateMany({
        where: stillLate,
        data: { status: 'ABSENT', absentCount: { increment: 1 }, ...UNSTAGE },
      });
      return ok({ changed: count > 0, outcome: 'ABSENT', timesLate });
    }

    const places = latePassCount(token.absentCount);
    const movedTo = await passTarget(token, places);
    const { count } = await db.token.updateMany({
      where: stillLate,
      data: { ...BACK_IN_LINE, ...(movedTo ? { issuedAt: movedTo } : {}) },
    });
    return ok({ changed: count > 0, outcome: 'MOVED_BACK', places, timesLate });
  }

  return badRequest(`Unknown action ${body.action}`);
});

/**
 * The new issue time for a patient moved `passCount` places back, or null to leave it.
 * Finds the patients they can go behind: same priority, waiting, and for a patient still
 * in the line, already behind them. passIssuedAt explains why.
 */
async function passTarget(
  token: { id: string; departmentId: string; serviceDate: Date; status: TokenStatus; priority: TokenPriority; issuedAt: Date },
  passCount: number
): Promise<Date | null> {
  const stillWaiting = token.status === 'WAITING';
  const others = await db.token.findMany({
    where: {
      id: { not: token.id },
      departmentId: token.departmentId,
      serviceDate: token.serviceDate,
      status: 'WAITING',
      priority: token.priority,
      deletedAt: null,
      ...(stillWaiting ? { issuedAt: { gt: token.issuedAt } } : {}),
    },
    orderBy: { issuedAt: 'asc' },
    take: passCount,
    select: { issuedAt: true },
  });
  return passIssuedAt(
    others.map((t) => t.issuedAt),
    passCount,
    stillWaiting ? token.issuedAt : null
  );
}
