import { db } from '@/lib/db';
import { ok, notFound, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };

export const GET = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const url = new URL(request.url);
  const dateQuery = url.searchParams.get('date');

  const targetDate = dateQuery ? serviceDateFor(new Date(dateQuery)) : serviceDateFor();

  const tokens = await db.token.findMany({
    where: {
      departmentId,
      serviceDate: targetDate,
      deletedAt: null,
    },
    include: { patient: true },
  });

  const totalGenerated = tokens.length;
  const completed = tokens.filter((t) => t.status === 'COMPLETED');
  const waiting = tokens.filter((t) => t.status === 'WAITING');
  const called = tokens.filter((t) => t.status === 'CALLED');
  const absent = tokens.filter((t) => t.status === 'ABSENT');
  const skipped = tokens.filter((t) => t.status === 'SKIPPED');

  const priorityCounts = {
    emergency: tokens.filter((t) => t.priority === 'EMERGENCY').length,
    senior: tokens.filter((t) => t.priority === 'SENIOR').length,
    normal: tokens.filter((t) => t.priority === 'NORMAL').length,
  };

  const waitTimes = tokens
    .filter((t) => t.calledAt && t.issuedAt)
    .map((t) => (new Date(t.calledAt!).getTime() - new Date(t.issuedAt).getTime()) / (1000 * 60));

  const avgWaitTimeMins =
    waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;

  const consultationTimes = completed
    .filter((t) => t.calledAt && t.completedAt)
    .map((t) => (new Date(t.completedAt!).getTime() - new Date(t.calledAt!).getTime()) / (1000 * 60));

  const avgConsultationTimeMins =
    consultationTimes.length > 0
      ? Math.round(consultationTimes.reduce((a, b) => a + b, 0) / consultationTimes.length)
      : 0;

  const hourlyDistribution: Record<string, number> = {};
  for (let h = 8; h <= 18; h++) {
    hourlyDistribution[`${String(h).padStart(2, '0')}:00`] = 0;
  }

  tokens.forEach((t) => {
    const hr = `${String(new Date(t.issuedAt).getHours()).padStart(2, '0')}:00`;
    if (hourlyDistribution[hr] !== undefined) {
      hourlyDistribution[hr]++;
    }
  });

  const roomStatsMap = new Map<string, number>();
  completed.forEach((t) => {
    const room = t.roomNumber || '101';
    roomStatsMap.set(room, (roomStatsMap.get(room) || 0) + 1);
  });

  const roomStats = Array.from(roomStatsMap.entries()).map(([roomNumber, totalServed]) => ({
    roomNumber,
    totalServed,
  }));

  return ok({
    date: targetDate.toISOString().split('T')[0],
    totalGenerated,
    completedCount: completed.length,
    waitingCount: waiting.length,
    calledCount: called.length,
    absentCount: absent.length,
    skippedCount: skipped.length,
    priorityCounts,
    avgWaitTimeMins,
    avgConsultationTimeMins,
    hourlyDistribution,
    roomStats,
  });
});
