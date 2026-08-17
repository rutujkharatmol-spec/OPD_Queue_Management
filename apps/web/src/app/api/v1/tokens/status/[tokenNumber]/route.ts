import { db } from '@/lib/db';
import { ok, notFound, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

export const GET = route(async (_request: Request, { params }: { params: Promise<{ tokenNumber: string }> }) => {
  const { tokenNumber } = await params;

  const token = await db.token.findFirst({
    where: { tokenNumber, deletedAt: null },
    include: { department: true, doctor: true },
  });

  if (!token) return notFound('Token not found');

  const serviceDate = serviceDateFor();

  // Currently serving (CALLED) tokens in this department
  const calledTokens = await db.token.findMany({
    where: {
      departmentId: token.departmentId,
      serviceDate,
      status: 'CALLED',
      deletedAt: null,
    },
    select: { tokenNumber: true, roomNumber: true },
  });

  const currentlyServing = calledTokens.map(t => t.tokenNumber);

  let patientsAhead = 0;
  let estimatedWaitTimeMins = 0;

  if (token.status === 'WAITING') {
    // All waiting tokens in this department for today
    const waitingTokens = await db.token.findMany({
      where: {
        departmentId: token.departmentId,
        serviceDate,
        status: 'WAITING',
        deletedAt: null,
      },
      select: { priority: true, issuedAt: true },
    });

    const priorityWeight: Record<string, number> = { EMERGENCY: 3, SENIOR: 2, NORMAL: 1 };
    const myWeight = priorityWeight[token.priority] ?? 1;

    patientsAhead = waitingTokens.filter(t => {
      const tWeight = priorityWeight[t.priority] ?? 1;
      if (tWeight > myWeight) return true;
      if (tWeight === myWeight && t.issuedAt.getTime() < token.issuedAt.getTime()) return true;
      return false;
    }).length;

    estimatedWaitTimeMins = patientsAhead * 5 + (currentlyServing.length > 0 ? 5 : 0);
  }

  return ok({
    tokenNumber: token.tokenNumber,
    status: token.status,
    priority: token.priority,
    departmentName: token.department?.name || 'Department',
    roomNumber: token.roomNumber || token.doctor?.roomNumber || null,
    currentlyServing,
    patientsAhead: token.status === 'WAITING' ? patientsAhead : 0,
    estimatedWaitTimeMins: token.status === 'WAITING' ? estimatedWaitTimeMins : 0,
  });
});
