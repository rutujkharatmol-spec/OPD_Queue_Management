import { Prisma } from '@/generated/prisma/client';
import { isPlaceholderPatientName } from '@/lib/nameLookup';

type Tx = Prisma.TransactionClient;

/** Registration sends this when the desk has no real number on file. */
export const PLACEHOLDER_PHONE = '0000000000';

/** What the desk's booklet list shows for each booklet. */
export const BOOKLET_SELECT = {
  id: true,
  serialNumber: true,
  priority: true,
  doctorNames: true,
  createdAt: true,
  handedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, phone: true, uhid: true } },
  token: { select: { id: true, tokenNumber: true, status: true, roomNumber: true, stagedRoom: true, issuedAt: true } },
} satisfies Prisma.BookletSelect;

/**
 * The next serial number for a department's booklets on a clinic day: 1, 2, 3...
 *
 * Two desks can save a booklet at the same moment. A transaction-scoped lock on this
 * department and day makes the second wait until the first has saved its number, so
 * both can't read the same highest number. The unique index on the table backs this up.
 */
export async function nextBookletSerial(tx: Tx, departmentId: string, serviceDate: Date): Promise<number> {
  const day = serviceDate.toISOString().slice(0, 10);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booklet:${departmentId}:${day}`}))`;
  const top = await tx.booklet.aggregate({
    where: { departmentId, serviceDate },
    _max: { serialNumber: true },
  });
  return (top._max.serialNumber ?? 0) + 1;
}

/**
 * The patient a booklet belongs to: found by CR No, then by mobile, or created.
 *
 * Same matching as a normal registration (POST /tokens): a patient deleted in the admin
 * panel is not matched again, and a returning patient keeps their saved name when the
 * desk leaves the name blank.
 */
export async function findOrCreatePatient(
  tx: Tx,
  details: { uhid: string | null; firstName: string; lastName: string; phone: string | null }
): Promise<string> {
  const { uhid, firstName, lastName } = details;
  const phone = details.phone && details.phone !== PLACEHOLDER_PHONE ? details.phone : null;

  const existing =
    (uhid ? await tx.patient.findFirst({ where: { uhid, deletedAt: null }, select: { id: true } }) : null) ??
    (phone ? await tx.patient.findFirst({ where: { phone, deletedAt: null }, select: { id: true } }) : null);

  if (existing) {
    const gaveRealName = !isPlaceholderPatientName(`${firstName} ${lastName}`);
    await tx.patient.update({
      where: { id: existing.id },
      data: {
        ...(uhid && { uhid }),
        ...(gaveRealName && firstName && { firstName }),
        ...(gaveRealName && lastName && { lastName }),
        ...(phone && { phone }),
      },
    });
    return existing.id;
  }

  const created = await tx.patient.create({
    data: { uhid, firstName: firstName || 'Patient', lastName, phone: phone ?? '' },
    select: { id: true },
  });
  return created.id;
}
