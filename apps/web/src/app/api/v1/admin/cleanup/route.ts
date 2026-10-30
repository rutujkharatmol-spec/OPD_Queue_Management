import { db } from '@/lib/db';
import { badRequest, ok, readJson, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { requireAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

/**
 * Admin clean-up. Everything here is a soft delete (deletedAt set, status SKIPPED where
 * the token was still open), matching the bulk-delete route, so rows stay recoverable.
 *
 *  clear-waiting  today's waiting line for a department
 *  clear-rooms    today's patients still marked "in room" for a department
 *  close-stale    tokens left waiting or in a room on earlier days (one or all departments)
 *  delete-date    every token of a department on one date (needs confirm: "DELETE")
 */

type Action = 'clear-waiting' | 'clear-rooms' | 'close-stale' | 'delete-date';

function parseDate(value: string | null | undefined): Date | null {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function filters(departmentId: string | null, date: Date | null) {
  const today = serviceDateFor();
  const dept = departmentId && departmentId !== 'all' ? { departmentId } : {};
  return {
    'clear-waiting': { ...dept, serviceDate: today, status: 'WAITING' as const, deletedAt: null },
    'clear-rooms': { ...dept, serviceDate: today, status: { in: ['CALLED' as const, 'IN_PROGRESS' as const] }, deletedAt: null },
    'close-stale': {
      ...dept,
      serviceDate: { lt: today },
      status: { in: ['WAITING' as const, 'CALLED' as const, 'IN_PROGRESS' as const] },
      deletedAt: null,
    },
    'delete-date': date ? { ...dept, serviceDate: date, deletedAt: null } : null,
  };
}

/** How many tokens each action would touch. */
export const GET = route(async (request: Request) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const departmentId = url.searchParams.get('departmentId');
  const date = parseDate(url.searchParams.get('date'));
  const f = filters(departmentId, date);

  const [waiting, inRooms, stale, onDate] = await Promise.all([
    departmentId && departmentId !== 'all' ? db.token.count({ where: f['clear-waiting'] }) : Promise.resolve(0),
    departmentId && departmentId !== 'all' ? db.token.count({ where: f['clear-rooms'] }) : Promise.resolve(0),
    db.token.count({ where: f['close-stale'] }),
    f['delete-date'] && departmentId && departmentId !== 'all' ? db.token.count({ where: f['delete-date'] }) : Promise.resolve(0),
  ]);

  return ok({ waiting, inRooms, stale, onDate });
});

export const POST = route(async (request: Request) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson<{ action?: Action; departmentId?: string; date?: string; confirm?: string }>(request);
  const action = body.action;
  const departmentId = body.departmentId || null;
  const date = parseDate(body.date);

  if (!action || !['clear-waiting', 'clear-rooms', 'close-stale', 'delete-date'].includes(action)) {
    return badRequest('Unknown action.');
  }
  if (action !== 'close-stale' && (!departmentId || departmentId === 'all')) {
    return badRequest('Choose a department.');
  }

  const f = filters(departmentId, date);
  const now = new Date();

  if (action === 'delete-date') {
    if (!f['delete-date']) return badRequest('Choose a date.');
    if (body.confirm !== 'DELETE') return badRequest('Type DELETE to confirm.');
    const { count } = await db.token.updateMany({ where: f['delete-date'], data: { deletedAt: now } });
    return ok({ action, count });
  }

  const { count } = await db.token.updateMany({
    where: f[action],
    data: { status: 'SKIPPED', deletedAt: now },
  });
  return ok({ action, count });
});
