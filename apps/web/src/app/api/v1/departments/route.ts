import { db } from '@/lib/db';
import { ok, badRequest, conflict, route, readJson } from '@/server/http';

// Queue state changes constantly; never serve a cached department list to a TV board.
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const departments = await db.department.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  return ok(departments);
});

export const POST = route(async (request: Request) => {
  const { name, code, description } = await readJson<{
    name?: string;
    code?: string;
    description?: string;
  }>(request);

  if (!name?.trim()) return badRequest('Department name is required.');
  if (!code?.trim()) return badRequest('Department code is required.');

  // The code prefixes every token number in the department, so it has to be unique.
  const existing = await db.department.findUnique({ where: { code: code.trim() } });
  if (existing) return conflict(`Department code "${code.trim()}" is already in use.`);

  const department = await db.department.create({
    data: {
      name: name.trim(),
      code: code.trim(),
      description: description?.trim() || null,
    },
  });

  return ok(department, 201);
});
