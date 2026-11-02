import { db } from '@/lib/db';
import { badRequest, conflict, notFound, ok, readJson, route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';
import { INVALID_CRN_MESSAGE, isValidCrn, normalizeCrn } from '@/lib/crn';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Changes a patient's name, CR No or mobile. Blank CR No or mobile clears it. Their
 * tokens show the new details everywhere, since tokens point at the patient.
 */
export const PATCH = route(async (request: Request, { params }: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await readJson<{ name?: string; uhid?: string; phone?: string }>(request);

  const name = (body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return badRequest('Name is required.');
  if (name.length > 100) return badRequest('Name is too long.');

  const uhid = normalizeCrn(body.uhid) || null;
  if (uhid && !isValidCrn(uhid)) return badRequest(INVALID_CRN_MESSAGE);

  const phone = (body.phone ?? '').replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{6,15}$/.test(phone)) return badRequest('Mobile number should be digits only.');

  const patient = await db.patient.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!patient) return notFound('Patient not found. They may have been deleted.');

  // A booklet scan finds the patient by CR No, so two patients with one CR No would
  // send the scan to the wrong person.
  if (uhid) {
    const clash = await db.patient.findFirst({
      where: { uhid, deletedAt: null, id: { not: id } },
      select: { firstName: true, lastName: true },
    });
    if (clash) {
      const who = `${clash.firstName ?? ''} ${clash.lastName ?? ''}`.trim() || 'another patient';
      return conflict(`CR No ${uhid} already belongs to ${who}. Delete or change that patient first.`);
    }
  }

  const [firstName, ...rest] = name.split(' ');
  const updated = await db.patient.update({
    where: { id },
    data: { firstName, lastName: rest.join(' '), uhid, phone },
    select: { id: true, firstName: true, lastName: true, uhid: true, phone: true },
  });

  return ok({ ...updated, name: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim() });
});

/**
 * Deletes a patient and all their tokens, so they leave every queue, TV, search and
 * report. A soft delete, like the Clean up tab: rows stay in the database and can be
 * recovered. Scanning the same booklet again registers them as a new patient.
 */
export const DELETE = route(async (_request: Request, { params }: Context) => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const patient = await db.patient.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!patient) return notFound('Patient not found. They may already be deleted.');

  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    // Open tokens are closed as SKIPPED, as the Clean up tab does, and taken off any
    // room's list. Finished ones keep their status.
    const open = await tx.token.updateMany({
      where: { patientId: id, deletedAt: null, status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
      data: { deletedAt: now, status: 'SKIPPED', stagedRoom: null, stagedAt: null },
    });
    const closed = await tx.token.updateMany({
      where: { patientId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    // A deleted token must not stay as a queue's "current" patient.
    await tx.queue.updateMany({
      where: { currentToken: { patientId: id } },
      data: { currentTokenId: null },
    });
    await tx.patient.update({ where: { id }, data: { deletedAt: now } });
    return { id, deleted: true, tokensRemoved: open.count + closed.count };
  });

  return ok(result);
});
