import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { reserveTokenNumbers, serviceDateFor } from '@/server/tokens/tokenNumber';
import { isPlaceholderPatientName } from '@/lib/nameLookup';
import { cleanDoctorName } from '@/lib/roomDoctors';
import { doctorAndRoomFor } from '@/server/rooms/roomDoctors';

export const dynamic = 'force-dynamic';

type Body = {
  patientId?: string;
  departmentId?: string;
  doctorId?: string;
  /** The doctor the registration desk chose, by name (doctors are named, as on the rooms). */
  assignedDoctorName?: string;
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

  const wantedDoctor = cleanDoctorName(body.assignedDoctorName);
  if (wantedDoctor.length > 80 || wantedDoctor.includes(',')) return badRequest('That doctor name is not valid.');

  const uhid = body.uhid?.trim() || null;
  const phone = body.phone?.trim() || '';
  const usablePhone = phone && phone !== PLACEHOLDER_PHONE ? phone : null;
  const priority = body.priority ?? 'NORMAL';
  const serviceDate = serviceDateFor();
  const customToken = (body.customTokenNumber || body.tokenNumber)?.trim();
  const requestedCount = Math.min(100, Math.max(1, body.patients?.length || body.count || 1));

  const department = await db.department.findUnique({
    where: { id: body.departmentId },
    select: { id: true, name: true, deletedAt: true },
  });

  if (!department || department.deletedAt) {
    return notFound('That department does not exist.');
  }

  const result = await db.$transaction(
    async (tx) => {
      // The doctor the desk chose, and the room they are in today. The token goes on that
      // room's list, so that doctor's Call Next reaches it and the slip can say where to
      // go. With no doctor chosen the token waits in the general line, for any room.
      //
      // Tokens used to get the department's first doctor (or a made-up "Doctor for ..."
      // in room 101) when none was chosen. That told the patient tracker a room nobody had
      // assigned, and made "which doctor was chosen" impossible to read back, so the token
      // now records a doctor only when one was really chosen.
      //
      // Deliberately sequential: a transaction runs on a single connection and the driver
      // queues statements on it, so `Promise.all` here would still execute one after the
      // other — it would only make the ordering harder to read.
      let doctorId: string | null = null;
      let assigned: { doctorName: string; roomNumber: string | null } | null = null;

      if (wantedDoctor) {
        const found = await doctorAndRoomFor(tx, wantedDoctor, department.id);
        doctorId = found.doctorId;
        assigned = { doctorName: found.doctorName, roomNumber: found.roomNumber };
      } else if (body.doctorId) {
        const named = await tx.doctor.findUnique({
          where: { id: body.doctorId },
          select: { id: true },
        });
        doctorId = named?.id ?? null;
      }
      // On the room's list in the order issued; cleared when the token is called.
      const staging = (i: number) =>
        assigned?.roomNumber ? { stagedRoom: assigned.roomNumber, stagedAt: new Date(Date.now() + i) } : {};

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

        // A doctor calling a patient back by number (say one marked absent who has now
        // arrived) re-issues a number that already exists today, sending only a
        // placeholder name. That used to create a new "Patient #12" and attach it to the
        // token, so the real name vanished from every screen. When the request names
        // nobody, keep the patient already on the token.
        const namesNobody =
          !itemUhid &&
          !(i === 0 && body.patientId) &&
          !(itemPhone && itemPhone !== PLACEHOLDER_PHONE) &&
          isPlaceholderPatientName(`${itemFirstName} ${itemLastName}`);
        const keptPatientId =
          itemCustomToken && namesNobody
            ? (
                await tx.token.findUnique({
                  where: {
                    departmentId_serviceDate_tokenNumber: {
                      departmentId: department.id,
                      serviceDate,
                      tokenNumber: itemCustomToken,
                    },
                  },
                  select: { patientId: true },
                })
              )?.patientId ?? null
            : null;

        let patient =
          (keptPatientId ? { id: keptPatientId } : null) ??
          (itemUhid ? await tx.patient.findFirst({ where: { uhid: itemUhid }, select: ID_ONLY }) : null) ??
          (i === 0 && body.patientId ? await tx.patient.findUnique({ where: { id: body.patientId }, select: ID_ONLY }) : null) ??
          (itemPhone && itemPhone !== PLACEHOLDER_PHONE ? await tx.patient.findFirst({ where: { phone: itemPhone }, select: ID_ONLY }) : null);

        if (keptPatientId) {
          // Nothing to update: the request carried no details about them.
        } else if (patient) {
          // A returning patient found by UHID or mobile keeps their saved name when the
          // desk leaves the name blank. Blank arrives as the placeholder "Patient", which
          // used to overwrite the real name.
          const gaveRealName = !isPlaceholderPatientName(`${itemFirstName} ${itemLastName}`);
          patient = await tx.patient.update({
            where: { id: patient.id },
            data: {
              ...(itemUhid && { uhid: itemUhid }),
              ...(gaveRealName && itemFirstName && { firstName: itemFirstName }),
              ...(gaveRealName && itemLastName && { lastName: itemLastName }),
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

        const created = await tx.token.upsert({
          where: {
            departmentId_serviceDate_tokenNumber: {
              departmentId: department.id,
              serviceDate,
              tokenNumber,
            },
          },
          update: {
            priority: itemPriority,
            status: 'WAITING',
            deletedAt: null,
            roomNumber: null,
            calledAt: null,
            recalledAt: null,
            completedAt: null,
            issuedAt: new Date(Date.now() + i * 50),
            patientId: patient.id,
            doctorId,
            ...staging(i),
          },
          create: {
            tokenNumber,
            serviceDate,
            priority: itemPriority,
            status: 'WAITING',
            deletedAt: null,
            issuedAt: new Date(Date.now() + i * 50),
            departmentId: department.id,
            patientId: patient.id,
            doctorId,
            ...staging(i),
          },
          include: { patient: true, doctor: true, department: true },
        });

        createdTokens.push(created);
      }

      return { tokens: createdTokens, assigned };
    },
    { maxWait: 15000, timeout: 60000 }
  );

  // For the slip: the doctor chosen and the room to go to (null when none was chosen).
  const assignedDoctor = result.assigned;

  if (requestedCount === 1) {
    const single = result.tokens[0];
    return ok({ ...single, tokens: result.tokens, count: 1, assignedDoctor }, 201);
  }

  return ok({ tokens: result.tokens, count: result.tokens.length, tokenNumber: result.tokens[0]?.tokenNumber, assignedDoctor }, 201);
});
