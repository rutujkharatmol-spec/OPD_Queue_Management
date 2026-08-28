import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { reserveTokenNumbers, serviceDateFor } from '@/server/tokens/tokenNumber';

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

  const uhid = body.uhid?.trim() || null;
  const phone = body.phone?.trim() || '';
  const usablePhone = phone && phone !== PLACEHOLDER_PHONE ? phone : null;
  const priority = body.priority ?? 'NORMAL';
  const serviceDate = serviceDateFor();
  const customToken = (body.customTokenNumber || body.tokenNumber)?.trim();
  const requestedCount = Math.min(100, Math.max(1, body.patients?.length || body.count || 1));

  // Both lookups key off `body.departmentId`, so neither has to wait for the other — one
  // round-trip phase instead of two before the transaction even opens. The duplicate check
  // selects a single column: it only ever asks whether a row exists.
  const [department, duplicateToken] = await Promise.all([
    db.department.findUnique({
      where: { id: body.departmentId },
      // The two columns the rest of this handler reads, plus the soft-delete flag.
      select: { id: true, name: true, deletedAt: true },
    }),
    customToken && requestedCount === 1
      ? db.token.findFirst({
          where: { departmentId: body.departmentId, serviceDate, tokenNumber: customToken },
          select: { id: true },
        })
      : null,
  ]);

  if (!department || department.deletedAt) {
    return notFound('That department does not exist.');
  }

  if (duplicateToken) {
    return badRequest(`Token "${customToken}" is already in use for ${department.name} today.`);
  }

  const result = await db.$transaction(
    async (tx) => {
      // Every department needs a doctor to attach tokens to. Only existence is checked,
      // so each lookup selects the id alone rather than hauling back the whole row.
      //
      // Deliberately sequential: a transaction runs on a single connection and the driver
      // queues statements on it, so `Promise.all` here would still execute one after the
      // other — it would only make the ordering harder to read.
      let doctorId: string | null = null;

      if (body.doctorId) {
        const named = await tx.doctor.findUnique({
          where: { id: body.doctorId },
          select: { id: true },
        });
        doctorId = named?.id ?? null;
      }

      if (!doctorId) {
        const existing = await tx.doctor.findFirst({
          where: { departmentId: department.id },
          select: { id: true },
        });
        doctorId =
          existing?.id ??
          (
            await tx.doctor.create({
              data: {
                name: `Doctor for ${department.name}`,
                roomNumber: '101',
                departmentId: department.id,
              },
              select: { id: true },
            })
          ).id;
      }

      // Pre-calculate how many automatic token numbers are needed
      let autoCount = 0;
      for (let i = 0; i < requestedCount; i++) {
        const pItem = body.patients?.[i] || {};
        const itemCustomToken = (pItem.customTokenNumber || (i === 0 && requestedCount === 1 ? customToken : undefined))?.trim();
        if (!itemCustomToken) autoCount++;
      }

      // Allocate all required sequence numbers in a single atomic SQL query
      let reservedList: string[] = [];
      if (autoCount > 0) {
        const reserved = await reserveTokenNumbers(tx, department.id, serviceDate, autoCount);
        reservedList = reserved.tokenNumbers;
      }

      let autoIdx = 0;
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

        // Identify or create patient. Only the id is used below — the full row comes back
        // with the token's `include` — so every branch selects that one column. The UHID
        // lookup in particular used to return every patient column, and before the index
        // added alongside this change it scanned the whole table to do it.
        const ID_ONLY = { id: true } as const;

        let patient =
          (itemUhid ? await tx.patient.findFirst({ where: { uhid: itemUhid }, select: ID_ONLY }) : null) ??
          (i === 0 && body.patientId ? await tx.patient.findUnique({ where: { id: body.patientId }, select: ID_ONLY }) : null) ??
          (itemPhone && itemPhone !== PLACEHOLDER_PHONE ? await tx.patient.findFirst({ where: { phone: itemPhone }, select: ID_ONLY }) : null);

        if (patient) {
          patient = await tx.patient.update({
            where: { id: patient.id },
            data: {
              ...(itemUhid && { uhid: itemUhid }),
              ...(itemFirstName && { firstName: itemFirstName }),
              ...(itemLastName && { lastName: itemLastName }),
              ...(itemPhone && itemPhone !== PLACEHOLDER_PHONE && { phone: itemPhone }),
            },
            select: ID_ONLY,
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
            select: ID_ONLY,
          });
        }

        let tokenNumber: string;
        if (itemCustomToken) {
          tokenNumber = itemCustomToken;
        } else {
          tokenNumber = reservedList[autoIdx++];
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
    },
    { maxWait: 15000, timeout: 60000 }
  );

  if (requestedCount === 1) {
    const single = result[0];
    return ok({ ...single, tokens: result, count: 1 }, 201);
  }

  return ok({ tokens: result, count: result.length, tokenNumber: result[0]?.tokenNumber }, 201);
});
