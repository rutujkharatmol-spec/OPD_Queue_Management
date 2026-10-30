import { db } from '@/lib/db';
import { ok, badRequest, route } from '@/server/http';
import { isPlaceholderPatientName } from '@/lib/nameLookup';

export const dynamic = 'force-dynamic';

// Registration sends this when the desk has no real number on file.
const PLACEHOLDER_PHONE = '0000000000';

/**
 * Registration desk: whose booklet is this? Called when a CRN (stored as `uhid`) is
 * scanned or typed, so a returning patient's name, mobile and doctor fill in without
 * being re-typed.
 *
 * Staff only (listed in src/proxy.ts): it returns phone numbers. An exact match, unlike
 * /tokens/search, so a scanned "12345" can't pick up "123456" or a phone number that
 * contains it. Exact is also how POST /tokens matches the CRN when the token is issued.
 *
 * ?departmentId= narrows "last doctor" to the department being registered for: a patient
 * seen in ENT last week and in Medicine today keeps their Medicine doctor.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const uhid = url.searchParams.get('uhid')?.trim() || '';
  const departmentId = url.searchParams.get('departmentId') || undefined;
  if (!uhid) return badRequest('uhid is required.');

  // CRN is not unique in the table yet, so take the most recently updated record.
  const patient = await db.patient.findFirst({
    where: { uhid, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      uhid: true,
    },
  });

  if (!patient) return ok({ found: false });

  // Their recent visits, newest first: the last one for the date, and the doctor.
  const visits = await db.token.findMany({
    where: { patientId: patient.id, deletedAt: null },
    orderBy: { issuedAt: 'desc' },
    take: 10,
    select: {
      serviceDate: true,
      departmentId: true,
      servedByDoctorName: true,
      department: { select: { name: true } },
      doctor: { select: { name: true } },
    },
  });
  const lastVisit = visits[0];

  // The doctor who actually saw them last in this department; failing that, the doctor
  // the desk gave them last time (they may not have been seen yet).
  const inDept = departmentId ? visits.filter((v) => v.departmentId === departmentId) : visits;
  const lastDoctorName =
    inDept.find((v) => v.servedByDoctorName)?.servedByDoctorName ??
    inDept.find((v) => v.doctor?.name && !/^doctor for /i.test(v.doctor.name))?.doctor?.name ??
    null;

  const name = `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim();

  return ok({
    found: true,
    // A placeholder ("Patient") is not a name worth filling in.
    name: isPlaceholderPatientName(name) ? '' : name,
    phone: patient.phone && patient.phone !== PLACEHOLDER_PHONE ? patient.phone : '',
    uhid: patient.uhid,
    lastDoctorName,
    lastVisit: lastVisit
      ? {
          date: lastVisit.serviceDate.toISOString().slice(0, 10),
          department: lastVisit.department?.name ?? '',
        }
      : null,
  });
});
