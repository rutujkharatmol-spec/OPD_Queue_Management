import { db } from '@/lib/db';
import { badRequest, ok, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';
import { patientCounts } from '@/server/patients/counts';
import { normalizeCrn } from '@/lib/crn';
import type { Prisma } from '@/generated/prisma/client';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 50;

/**
 * Admin Patients screen: how many patients are registered, and a search by name, CR No
 * or mobile.
 *
 * ?q=  digits search CR No and mobile; words search the name, every word must match
 *      the first or last name ("ravi kum" finds Ravi Kumar). Empty: counts only.
 */
export const GET = route(async (request: Request) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const counts = await patientCounts();

  if (!q) return ok({ ...counts, query: '', patients: [] });

  let where: Prisma.PatientWhereInput;
  const digits = normalizeCrn(q);
  if (/^\d+$/.test(digits)) {
    where = { deletedAt: null, OR: [{ uhid: { contains: digits } }, { phone: { contains: digits } }] };
  } else {
    where = {
      deletedAt: null,
      AND: q.split(' ').map((word) => ({
        OR: [
          { firstName: { contains: word, mode: 'insensitive' as const } },
          { lastName: { contains: word, mode: 'insensitive' as const } },
        ],
      })),
    };
  }

  const rows = await db.patient.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: MAX_RESULTS + 1,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      uhid: true,
      createdAt: true,
      _count: { select: { tokens: { where: { deletedAt: null } } } },
      tokens: {
        where: { deletedAt: null },
        orderBy: { issuedAt: 'desc' },
        take: 1,
        select: { serviceDate: true, tokenNumber: true, department: { select: { name: true } } },
      },
    },
  });

  const patients = rows.slice(0, MAX_RESULTS).map((p) => ({
    id: p.id,
    name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient',
    phone: p.phone && p.phone !== '0000000000' ? p.phone : '',
    uhid: p.uhid ?? '',
    registeredAt: p.createdAt.toISOString(),
    tokenCount: p._count.tokens,
    lastVisit: p.tokens[0]
      ? {
          date: p.tokens[0].serviceDate.toISOString().slice(0, 10),
          tokenNumber: p.tokens[0].tokenNumber,
          department: p.tokens[0].department?.name ?? '',
        }
      : null,
  }));

  return ok({ ...counts, query: q, patients, more: rows.length > MAX_RESULTS });
});

/**
 * Deletes all registered patients and their tokens, removing them from every queue, TV,
 * search and report. Soft-deleted in the database so rows remain recoverable.
 */
export const DELETE = route(async (request: Request) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await readJson<{ confirm?: string }>(request).catch(() => ({ confirm: undefined }));
  if (body.confirm !== 'DELETE' && body.confirm !== 'DELETE ALL') {
    return badRequest('Type DELETE to confirm.');
  }

  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    // 1. Open tokens are closed as SKIPPED and removed from queues
    const openTokens = await tx.token.updateMany({
      where: { deletedAt: null, status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
      data: { deletedAt: now, status: 'SKIPPED', stagedRoom: null, stagedAt: null },
    });

    // 2. All remaining active tokens marked deleted
    const allTokens = await tx.token.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: now },
    });

    // 3. Clear currentToken on any active queue
    await tx.queue.updateMany({
      where: { currentTokenId: { not: null } },
      data: { currentTokenId: null },
    });

    // 4. Soft-delete all active patients
    const patients = await tx.patient.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: now },
    });

    return {
      deleted: true,
      patientsCount: patients.count,
      tokensCount: allTokens.count,
      openTokensSkipped: openTokens.count,
    };
  });

  return ok(result);
});
