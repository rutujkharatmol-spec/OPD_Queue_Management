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
  count?: number;
  patients?: Array<{
    firstName?: string;
    lastName?: string;
    phone?: string;
    uhid?: string;
    priority?: 'NORMAL' | 'SENIOR' | 'EMERGENCY';
    customTokenNumber?: string;
  }>;
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

  if (!department || department.deletedAt) {
    return notFound('That department does not exist.');
  }

  const uhid = body.uhid?.trim() || null;
  const phone = body.phone?.trim() || '';
  const usablePhone = phone && phone !== PLACEHOLDER_PHONE ? phone : null;
  const priority = body.priority ?? 'NORMAL';
  const serviceDate = serviceDateFor();
  const customToken = (body.customTokenNumber || body.tokenNumber)?.trim();
  const requestedCount = Math.min(100, Math.max(1, body.patients?.length || body.count || 1));

  // If a single custom token number is provided, verify it is not already used in this department today
  if (customToken && requestedCount === 1) {
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

  const result = await db.$transaction(async (tx) => {
    // Every department needs a doctor to attach tokens to.
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

    const createdTokens = [];

    for (let i = 0; i < requestedCount; i++) {
      const pItem = body.patients?.[i] || {};
      const itemUhid = pItem.uhid?.trim() || (i === 0 ? uhid : null);
      const itemPhone = pItem.phone?.trim() || (i === 0 ? usablePhone : '') || '';
      const itemPriority = pItem.priority ?? priority;
      const itemCustomToken = (pItem.customTokenNumber || (i === 0 && requestedCount === 1 ? customToken : undefined))?.trim();

      const defaultFirstName = body.firstName?.trim()
        ? (requestedCount > 1 ? `${body.firstName.trim()} (#${i + 1})` : body.firstName.trim())
        : (requestedCount > 1 ? `Walk-in Patient #${i + 1}` : 'Patient');

      const itemFirstName = pItem.firstName?.trim() || defaultFirstName;
      const itemLastName = pItem.lastName?.trim() || body.lastName?.trim() || '';

      // Identify or create patient
      let patient =
        (itemUhid ? await tx.patient.findFirst({ where: { uhid: itemUhid } }) : null) ??
        (i === 0 && body.patientId ? await tx.patient.findUnique({ where: { id: body.patientId } }) : null) ??
        (itemPhone && itemPhone !== PLACEHOLDER_PHONE ? await tx.patient.findFirst({ where: { phone: itemPhone } }) : null);

      if (patient) {
        patient = await tx.patient.update({
          where: { id: patient.id },
          data: {
            ...(itemUhid && { uhid: itemUhid }),
            ...(itemFirstName && { firstName: itemFirstName }),
            ...(itemLastName && { lastName: itemLastName }),
            ...(itemPhone && itemPhone !== PLACEHOLDER_PHONE && { phone: itemPhone }),
          },
        });
      } else {
        patient = await tx.patient.create({
          data: {
            ...(i === 0 && body.patientId && { id: body.patientId }),
            uhid: itemUhid,
            firstName: itemFirstName,
            lastName: itemLastName,
            phone: itemPhone || '',
          },
        });
      }

      let tokenNumber: string;
      if (itemCustomToken) {
        tokenNumber = itemCustomToken;
      } else {
        const reserved = await reserveTokenNumber(tx, department.id, department.code, serviceDate);
        tokenNumber = reserved.tokenNumber;
      }

      const created = await tx.token.create({
        data: {
          tokenNumber,
          serviceDate,
          priority: itemPriority,
          status: 'WAITING',
          issuedAt: new Date(Date.now() + i * 50), // slightly offset for deterministic FIFO
          departmentId: department.id,
          patientId: patient.id,
          doctorId,
        },
        include: { patient: true, doctor: true, department: true },
      });

      createdTokens.push(created);
    }

    return createdTokens;
  });

  if (requestedCount === 1) {
    const single = result[0];
    return ok({ ...single, tokens: result, count: 1 }, 201);
  }

  return ok({ tokens: result, count: result.length, tokenNumber: result[0]?.tokenNumber }, 201);
});
