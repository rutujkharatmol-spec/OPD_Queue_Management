import { db } from '@/lib/db';
import { ok, badRequest, conflict, route, readJson } from '@/server/http';

// Queue state changes constantly; never serve a cached department list to a TV board.
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  let departments = await db.department.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  // If a fresh database is connected, seed standard default departments and rooms automatically
  if (departments.length === 0) {
    try {
      const defaults = [
        { name: 'Medicine', code: 'MED', description: 'General Medicine OPD' },
        { name: 'ENT', code: 'ENT', description: 'Ear, Nose, Throat OPD' },
        { name: 'Orthopedics', code: 'ORTHO', description: 'Orthopedics & Joint Clinic' },
        { name: 'Pediatrics', code: 'PED', description: 'Child Health & Care' },
      ];

      for (const d of defaults) {
        const created = await db.department.create({ data: d });
        // Add sample room
        await db.room.create({
          data: {
            roomNumber: d.code === 'MED' ? '101' : d.code === 'ENT' ? '201' : '301',
            departmentId: created.id,
            doctorName: `Dr. ${d.name} Specialist`,
          },
        });
      }

      departments = await db.department.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    } catch {
      // Ignored if concurrently seeded
    }
  }

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
