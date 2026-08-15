import { db } from '@/lib/db';
import { ok, route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const departmentId = url.searchParams.get('departmentId');

  if (!q) return ok([]);

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
    include: { patient: true, department: true, doctor: true },
    orderBy: { issuedAt: 'desc' },
    take: 20,
  });

  return ok(results);
});
