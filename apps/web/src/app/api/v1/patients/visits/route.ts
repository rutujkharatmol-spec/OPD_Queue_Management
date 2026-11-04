import { db } from '@/lib/db';
import { badRequest, notFound, ok, route } from '@/server/http';
import type { Prisma } from '@/generated/prisma/client';

export const dynamic = 'force-dynamic';

const MAX_VISITS = 200;

/**
 * Visit history: every token one patient has been given, newest first. Used by the
 * Visit history pop-up on the Doctor Desk and the admin Patients screen.
 *
 * ?patientId=  the patient (admin Patients screen)
 * ?tokenId=    a token of theirs (Doctor Desk, which knows the token, not the patient)
 *
 * Staff only (src/proxy.ts covers /api/v1/patients). A CR No belongs to one person but
 * isn't unique in the table yet, so visits are gathered by CR No across records.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  let patientId = url.searchParams.get('patientId') || '';
  const tokenId = url.searchParams.get('tokenId') || '';
  if (!patientId && !tokenId) return badRequest('patientId or tokenId is required.');

  if (!patientId) {
    const token = await db.token.findFirst({ where: { id: tokenId }, select: { patientId: true } });
    if (!token?.patientId) return notFound('No visit history for this patient.');
    patientId = token.patientId;
  }

  const patient = await db.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, uhid: true, createdAt: true },
  });
  if (!patient) return notFound('No visit history for this patient.');

  const where: Prisma.TokenWhereInput = patient.uhid
    ? { deletedAt: null, patient: { uhid: patient.uhid, deletedAt: null } }
    : { deletedAt: null, patientId: patient.id };

  const [total, rows] = await Promise.all([
    db.token.count({ where }),
    db.token.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: MAX_VISITS,
      select: {
        id: true,
        tokenNumber: true,
        serviceDate: true,
        issuedAt: true,
        calledAt: true,
        completedAt: true,
        status: true,
        roomNumber: true,
        servedByDoctorName: true,
        doctor: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
  ]);

  return ok({
    patient: {
      name: `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim() || 'Patient',
      uhid: patient.uhid ?? '',
      registeredAt: patient.createdAt.toISOString(),
    },
    total,
    visits: rows.map((t) => ({
      id: t.id,
      tokenNumber: t.tokenNumber,
      date: t.serviceDate.toISOString().slice(0, 10),
      issuedAt: t.issuedAt.toISOString(),
      calledAt: t.calledAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      status: t.status,
      room: t.roomNumber ?? '',
      doctor: t.servedByDoctorName || t.doctor?.name || '',
      department: t.department?.name ?? '',
    })),
  });
});
