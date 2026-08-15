import { db } from '@/lib/db';
import { ok, badRequest, notFound, conflict, route, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { name, code, description } = await readJson<{
    name?: string;
    code?: string;
    description?: string;
  }>(request);

  const department = await db.department.findUnique({ where: { id } });
  if (!department || department.deletedAt) return notFound('Department not found.');

  if (name !== undefined && !name.trim()) return badRequest('Department name cannot be empty.');
  if (code !== undefined && !code.trim()) return badRequest('Department code cannot be empty.');

  if (code && code.trim() !== department.code) {
    const clash = await db.department.findUnique({ where: { code: code.trim() } });
    if (clash) return conflict(`Department code "${code.trim()}" is already in use.`);
  }

  const updated = await db.department.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(code !== undefined && { code: code.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
    },
  });

  return ok(updated);
});

export const DELETE = route(async (_request: Request, { params }: Context) => {
  const { id } = await params;

  const department = await db.department.findUnique({ where: { id } });
  if (!department || department.deletedAt) return notFound('Department not found.');

  // Soft delete. Tokens reference the department and are the clinic's record of who
  // was seen, so the row has to survive; hiding it from the list is enough.
  await db.department.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  return ok({ id, deleted: true });
});
