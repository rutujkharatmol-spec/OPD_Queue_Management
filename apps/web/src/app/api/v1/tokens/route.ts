import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { reserveTokenNumber, serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Body = {
  patientId?: string;
  departmentId?: string;
  doctorId?: string;
  priority?: 'NORMAL' | 'SENIOR' | 'EMERGENCY';
  firstName?: string;
  lastName?: string;
  phone?: string;
  uhid?: string;
  customTokenNumber?: string;
  tokenNumber?: string;
};

// Registration sends this when the desk has no real number on file.
const PLACEHOLDER_PHONE = '0000000000';

export const POST = route(async (request: Request) => {
  const body = await readJson<Body>(request);

  if (!body.departmentId) return badRequest('A department is required to issue a token.');

  // The four columns the rest of this handler reads.
  const department = await db.department.findUnique({
    where: { id: body.departmentId },
    select: { id: true, name: true, code: true, deletedAt: true },
  });

  // The NestJS version silently fell back to a department with code 'MED' when the id
  // did not resolve, so a bad id quietly issued a token for the wrong clinic. Better to
  // refuse: the desk can see something is wrong before handing the patient a slip.
  if (!department || department.deletedAt) {
    return notFound('That department does not exist.');
  }

  const uhid = body.uhid?.trim() || null;
  const phone = body.phone?.trim() || '';
  const usablePhone = phone && phone !== PLACEHOLDER_PHONE ? phone : null;
  const priority = body.priority ?? 'NORMAL';
  const serviceDate = serviceDateFor();
  const customToken = (body.customTokenNumber || body.tokenNumber)?.trim();

  // If a custom token number is provided, verify it is not already used in this department today
  if (customToken) {
    const existing = await db.token.findFirst({
      where: {
        departmentId: department.id,
        serviceDate,
        tokenNumber: customToken,
      },
    });
    if (existing) {
      return badRequest(`Token "${customToken}" is already in use for ${department.name} today.`);
    }
  }

  const token = await db.$transaction(async (tx) => {
    // Every department needs a doctor to attach tokens to. Registration does not pick
    // one, so fall back to any doctor in the department and create one if the clinic
    // has none yet.
    let doctorId = body.doctorId ?? null;

    if (doctorId) {
      const named = await tx.doctor.findUnique({ where: { id: doctorId } });
      if (!named) doctorId = null;
    }

    if (!doctorId) {
      const existing = await tx.doctor.findFirst({ where: { departmentId: department.id } });
      doctorId =
        existing?.id ??
        (
          await tx.doctor.create({
            data: {
              name: `Doctor for ${department.name}`,
              roomNumber: '101',
              departmentId: department.id,
            },
          })
        ).id;
    }

    // Identify the patient from whatever the desk supplied, in decreasing confidence:
    // hospital number, then an explicit id, then phone. uhid is neither unique nor
    // required in this schema, so this is findFirst rather than a lookup by key.
    let patient =
      (uhid ? await tx.patient.findFirst({ where: { uhid } }) : null) ??
      (body.patientId ? await tx.patient.findUnique({ where: { id: body.patientId } }) : null) ??
      (usablePhone ? await tx.patient.findFirst({ where: { phone: usablePhone } }) : null);

    if (patient) {
      // Only overwrite with values the desk actually typed; a blank field should not
      // erase details captured on an earlier visit.
      patient = await tx.patient.update({
        where: { id: patient.id },
        data: {
          ...(uhid && { uhid }),
          ...(body.firstName?.trim() && { firstName: body.firstName.trim() }),
          ...(body.lastName?.trim() && { lastName: body.lastName.trim() }),
          ...(usablePhone && { phone: usablePhone }),
        },
      });
    } else {
      patient = await tx.patient.create({
        data: {
          ...(body.patientId && { id: body.patientId }),
          uhid,
          firstName: body.firstName?.trim() || 'Patient',
          lastName: body.lastName?.trim() || '',
          phone: usablePhone || '',
        },
      });
    }

    // Inside the transaction on purpose: the counter row stays locked until commit, so
    // concurrent desks serialise here, and a token that fails to insert does not burn
    // a number.
    let tokenNumber: string;
    if (customToken) {
      tokenNumber = customToken;
    } else {
      const reserved = await reserveTokenNumber(tx, department.id, department.code, serviceDate);
      tokenNumber = reserved.tokenNumber;
    }

    return tx.token.create({
      data: {
        tokenNumber,
        serviceDate,
        priority,
        status: 'WAITING',
        issuedAt: new Date(),
        departmentId: department.id,
        patientId: patient.id,
        doctorId,
      },
      include: { patient: true, doctor: true, department: true },
    });
  });

  return ok(token, 201);
});
