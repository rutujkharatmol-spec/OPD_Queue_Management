import { db } from '@/lib/db';
import { ok, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { ANALYTICS_TOKEN_SELECT, summariseTokens } from '@/server/queue/analytics';
import { requireAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

/** Today across every department: queue counts, per-room and per-doctor numbers. */
export const GET = route(async () => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const serviceDate = serviceDateFor();
  const date = serviceDate.toISOString().slice(0, 10);

  const [departments, rooms, tokens] = await Promise.all([
    db.department.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    db.room.findMany({
      where: { deletedAt: null },
      select: { roomNumber: true, doctorName: true, departmentId: true },
    }),
    db.token.findMany({
      where: { serviceDate, deletedAt: null },
      select: { ...ANALYTICS_TOKEN_SELECT, departmentId: true },
    }),
  ]);

  const result = departments.map((d) => {
    const doctorByRoom = new Map<string, string>();
    for (const r of rooms) {
      if (r.departmentId === d.id && r.doctorName) doctorByRoom.set(r.roomNumber, r.doctorName);
    }
    const s = summariseTokens(
      tokens.filter((t) => t.departmentId === d.id),
      date,
      doctorByRoom
    );
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      totalGenerated: s.totalGenerated,
      waitingCount: s.waitingCount,
      inRoomCount: s.calledCount,
      servedCount: s.completedCount,
      absentCount: s.absentCount,
      avgWaitTimeMins: s.avgWaitTimeMins,
      avgConsultationTimeMins: s.avgConsultationTimeMins,
      roomStats: s.roomStats,
      doctorStats: s.doctorStats,
    };
  });

  return ok({ date, departments: result });
});
