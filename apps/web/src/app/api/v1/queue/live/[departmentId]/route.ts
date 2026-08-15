import { db } from '@/lib/db';
import { ok, notFound, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

// Polled every 3 seconds by every TV board and doctor dashboard.
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };

export const GET = route(async (_request: Request, { params }: Context) => {
  const { departmentId } = await params;

  const department = await db.department.findUnique({ where: { id: departmentId } });
  if (!department) return notFound('Department not found.');

  const serviceDate = serviceDateFor();

  // Two differences from the NestJS version, both deliberate:
  //
  // 1. Scoped by department, not by an arbitrary "first doctor of the department".
  //    The old query picked one doctor and showed only their tokens, so a second
  //    doctor's patients silently vanished from the board.
  // 2. Scoped to today. The old query matched WAITING tokens of any age, so a token
  //    left unserved yesterday reappeared on this morning's display.
  const [rooms, activeRaw, waiting] = await Promise.all([
    db.room.findMany({ where: { departmentId, deletedAt: null } }),
    db.token.findMany({
      where: { departmentId, serviceDate, status: 'CALLED', deletedAt: null },
      orderBy: { calledAt: 'desc' },
      include: { patient: true },
    }),
    db.token.findMany({
      where: { departmentId, serviceDate, status: 'WAITING', deletedAt: null },
      // Enum order is NORMAL, SENIOR, EMERGENCY, so descending puts emergencies first.
      orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
    }),
  ]);

  const doctorByRoom = new Map(
    rooms.filter((r) => r.doctorName).map((r) => [r.roomNumber, r.doctorName as string])
  );

  // One patient per room: several tokens can sit in CALLED if a doctor moved on
  // without completing, and the board should show each room's most recent call.
  const seenRooms = new Set<string>();
  const activeTokens = [];

  for (const token of activeRaw) {
    const room = token.roomNumber || '101';
    if (seenRooms.has(room)) continue;
    seenRooms.add(room);

    const name = `${token.patient?.firstName || ''} ${token.patient?.lastName || ''}`.trim();

    activeTokens.push({
      id: token.id,
      token: token.tokenNumber,
      room,
      doctorName: doctorByRoom.get(room) || undefined,
      patientName: name || 'Unknown Patient',
      uhid: token.patient?.uhid || '---',
      calledAt: token.calledAt?.getTime(),
      recalledAt: token.recalledAt?.getTime(),
    });
  }

  return ok({
    department: department.name,
    activeTokens,
    nextTokens: waiting.map((t) => (t.priority === 'EMERGENCY' ? `${t.tokenNumber} 🚨` : t.tokenNumber)),
  });
});
