import { db } from '@/lib/db';
import { ok, route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const departmentId = url.searchParams.get('departmentId');

  if (!q) return ok([]);

  // Both callers (the doctor dashboard's sidebar and the registration desk's lookup
  // modal) render exactly these fields. The previous `include` pulled all three relations
  // whole — every patient column, every department column, and a doctor row that neither
  // screen reads — on a query the dashboard re-issues 250ms after every keystroke.
  const results = await db.token.findMany({
    where: {
      ...(departmentId ? { departmentId } : {}),
      deletedAt: null,
      OR: [
        { tokenNumber: { contains: q } },
        { patient: { firstName: { contains: q } } },
        { patient: { lastName: { contains: q } } },
        { patient: { phone: { contains: q } } },
        { patient: { uhid: { contains: q } } },
      ],
    },
    select: {
      id: true,
      tokenNumber: true,
      status: true,
      priority: true,
      issuedAt: true,
      patient: { select: { firstName: true, lastName: true, phone: true, uhid: true } },
      department: { select: { name: true } },
    },
    orderBy: { issuedAt: 'desc' },
    take: 20,
  });

  return ok(results);
});
