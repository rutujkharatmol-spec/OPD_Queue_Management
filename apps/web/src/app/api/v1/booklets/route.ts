import { db } from '@/lib/db';
import { badRequest, notFound, ok, readJson, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { BOOKLET_SELECT, findOrCreatePatient, nextBookletSerial } from '@/server/booklets/booklets';
import { MAX_DOCTOR_CHOICES, cleanDoctorName, sameDoctor } from '@/lib/roomDoctors';
import { INVALID_CRN_MESSAGE, isValidCrn, normalizeCrn } from '@/lib/crn';

export const dynamic = 'force-dynamic';

/**
 * "All at once" registration (see the Booklet model): today's booklets for a department,
 * waiting ones and ones already given back with a token, by serial number.
 */
export const GET = route(async (request: Request) => {
  const departmentId = new URL(request.url).searchParams.get('departmentId');
  if (!departmentId) return badRequest('A department is required.');

  const booklets = await db.booklet.findMany({
    where: { departmentId, serviceDate: serviceDateFor(), deletedAt: null },
    select: BOOKLET_SELECT,
    orderBy: { serialNumber: 'asc' },
  });
  return ok(booklets);
});

type Body = {
  departmentId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  uhid?: string;
  priority?: 'NORMAL' | 'SENIOR' | 'EMERGENCY';
  doctorNames?: string[];
};

const PRIORITIES = new Set(['NORMAL', 'SENIOR', 'EMERGENCY']);

/**
 * Takes in one booklet: saves the patient and the chosen doctors and gives the booklet
 * the next serial number. No token is issued; that happens when the patient comes back
 * (POST /booklets/[id]/token).
 *
 * The same patient already waiting in today's pile gets their existing booklet back
 * (`existing: true`) instead of a second serial number, so a booklet scanned twice
 * doesn't end up in the list twice.
 */
export const POST = route(async (request: Request) => {
  const body = await readJson<Body>(request);
  if (!body.departmentId) return badRequest('A department is required.');

  const doctorNames: string[] = [];
  for (const raw of Array.isArray(body.doctorNames) ? body.doctorNames : []) {
    const name = cleanDoctorName(typeof raw === 'string' ? raw : '');
    if (!name || doctorNames.some((n) => sameDoctor(n, name))) continue;
    if (name.length > 80 || name.includes(',')) return badRequest('That doctor name is not valid.');
    doctorNames.push(name);
  }
  if (doctorNames.length > MAX_DOCTOR_CHOICES) return badRequest(`Choose at most ${MAX_DOCTOR_CHOICES} doctors.`);

  const uhid = normalizeCrn(body.uhid) || null;
  if (uhid && !isValidCrn(uhid)) return badRequest(INVALID_CRN_MESSAGE);
  const priority = body.priority && PRIORITIES.has(body.priority) ? body.priority : 'NORMAL';
  const firstName = body.firstName?.trim().slice(0, 100) || 'Patient';
  const lastName = body.lastName?.trim().slice(0, 100) || '';
  const phone = body.phone?.trim().slice(0, 20) || null;

  const department = await db.department.findUnique({
    where: { id: body.departmentId },
    select: { id: true, deletedAt: true },
  });
  if (!department || department.deletedAt) return notFound('That department does not exist.');

  const serviceDate = serviceDateFor();
  const result = await db.$transaction(
    async (tx) => {
      // Taken first, so two desks saving the same patient can't both miss the other's booklet.
      const serialNumber = await nextBookletSerial(tx, department.id, serviceDate);
      const patientId = await findOrCreatePatient(tx, { uhid, firstName, lastName, phone });

      const waiting = await tx.booklet.findFirst({
        where: { departmentId: department.id, serviceDate, patientId, deletedAt: null, tokenId: null },
        select: BOOKLET_SELECT,
      });
      if (waiting) return { booklet: waiting, existing: true };

      const booklet = await tx.booklet.create({
        data: { departmentId: department.id, serviceDate, serialNumber, priority, doctorNames, patientId },
        select: BOOKLET_SELECT,
      });
      return { booklet, existing: false };
    },
    { maxWait: 15000, timeout: 30000 }
  );

  return ok(result, result.existing ? 200 : 201);
});
