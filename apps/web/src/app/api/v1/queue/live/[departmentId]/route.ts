import { db } from '@/lib/db';
import { ok, notFound, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

// Polled every 3 seconds by every TV board and doctor dashboard.
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };

export const GET = route(async (_request: Request, { params }: Context) => {
  const { departmentId } = await params;

  const serviceDate = serviceDateFor();

  // Two differences from the NestJS version, both deliberate:
  //
  // 1. Scoped by department, not by an arbitrary "first doctor of the department".
  //    The old query picked one doctor and showed only their tokens, so a second
  //    doctor's patients silently vanished from the board.
  // 2. Scoped to today. The old query matched WAITING tokens of any age, so a token
  //    left unserved yesterday reappeared on this morning's display.
  //
  // All four queries are independent, so they go out together rather than as four
  // sequential round-trips. That matters most on Vercel, where each hop to Neon's
  // pooler costs real latency and this route is polled every 2.5s by every board in
  // the department — the wall time drops to roughly that of the slowest single query.
  //
  // Each also selects only the columns the response actually projects. `include:
  // { patient: true }` pulled every patient column (dob, gender, audit timestamps) to
  // read two names and a UHID.
  const [department, rooms, activeRaw, waiting] = await Promise.all([
    db.department.findUnique({
      where: { id: departmentId },
      select: { name: true },
    }),
    db.room.findMany({
      where: { departmentId, deletedAt: null },
      select: { roomNumber: true, doctorName: true },
    }),
    db.token.findMany({
      where: { departmentId, serviceDate, status: 'CALLED', deletedAt: null },
      orderBy: { calledAt: 'desc' },
      select: {
        id: true,
        tokenNumber: true,
        roomNumber: true,
        calledAt: true,
        recalledAt: true,
        patient: { select: { firstName: true, lastName: true, uhid: true } },
      },
    }),
    db.token.findMany({
      where: { departmentId, serviceDate, status: 'WAITING', deletedAt: null },
      // Enum order is NORMAL, SENIOR, EMERGENCY, so descending puts emergencies first.
      orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
      select: { tokenNumber: true, priority: true },
    }),
  ]);

  if (!department) return notFound('Department not found.');

  const doctorByRoom = new Map<string, string>();
  for (const room of rooms) {
    if (room.doctorName) doctorByRoom.set(room.roomNumber, room.doctorName);
  }

  // Return all currently active called tokens for all rooms
  const activeTokens = [];

  for (const token of activeRaw) {
    const room = token.roomNumber || '101';
    const name = `${token.patient?.firstName || ''} ${token.patient?.lastName || ''}`.trim();

    activeTokens.push({
      id: token.id,
      token: token.tokenNumber,
      room,
      doctorName: doctorByRoom.get(room) || undefined,
      patientName: name || 'Patient',
      uhid: token.patient?.uhid || '',
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
