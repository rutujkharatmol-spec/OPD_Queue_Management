import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import { soleDoctor } from '@/lib/roomDoctors';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };
type Body = {
  roomNumber: string;
  tokenIdentifier?: string;
  tokenNumber?: string;
  tokenId?: string;
  /** The doctor calling (sent by the Doctor Desk); wins over the room's doctor name. */
  doctorName?: string;
};

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { departmentId } = await params;
  const body = await readJson<Body>(request);

  if (!body.roomNumber?.trim()) {
    return badRequest('roomNumber is required.');
  }

  const roomNumber = body.roomNumber.trim();
  // Existence check only — nothing below reads a department column.
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) return notFound('Department not found.');

  const serviceDate = serviceDateFor();

  // Who is sitting in this room right now, saved on the token for doctor-wise analytics.
  // A room set up for this department wins over a shared room with no department. When
  // several doctors share the room and the caller did not say which one, nobody is
  // credited yet: the doctor who presses Done is.
  const roomRows = await db.room.findMany({
    where: {
      roomNumber,
      deletedAt: null,
      OR: [{ departmentId }, { departmentId: null }],
    },
    select: { doctorName: true, departmentId: true },
  });
  const callingDoctor =
    typeof body.doctorName === 'string' ? body.doctorName.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
  const servedByDoctorName =
    callingDoctor ||
    soleDoctor((roomRows.find((r) => r.departmentId === departmentId) ?? roomRows[0])?.doctorName) ||
    null;

  const cleanId =(body.tokenIdentifier || body.tokenNumber || body.tokenId)?.replace(' 🚨', '').trim();

  const nextToken = await db.$transaction(async (tx) => {
    // 1. Find target token or next waiting token for today
    let waitingToken: any = null;

    if (cleanId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

      // A number is looked up in today's queue for this department only. Numbers restart
      // at 1 in every department every day, so the old wider search (any date, then any
      // department) could call last week's #12, or another department's #12, into this
      // room. Any status matches, so a patient marked absent can be called back in.
      waitingToken = await tx.token.findFirst({
        where: {
          departmentId,
          deletedAt: null,
          ...(isUuid
            ? { id: cleanId }
            : { serviceDate, tokenNumber: { equals: cleanId, mode: 'insensitive' } }),
        },
      });
    } else {
      // No specific token requested: the next waiting token for today, skipping patients
      // already sent to a different room. There is deliberately no fallback to earlier
      // days: tokens left waiting yesterday are not in the building, and calling one put
      // a patient "in the room" who appeared on no screen.
      waitingToken = await tx.token.findFirst({
        where: {
          departmentId,
          serviceDate,
          status: 'WAITING',
          deletedAt: null,
          OR: [{ stagedRoom: null }, { stagedRoom: roomNumber }],
        },
        orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
      });
    }

    if (!waitingToken && cleanId) {
      // A walk-in has no doctor assigned at registration, so none is recorded (the old
      // made-up "Doctor for Department" record is gone, as in POST /tokens). Who saw them
      // is servedByDoctorName below.
      // Create new walk-in patient
      const patient = await tx.patient.create({
        data: {
          firstName: `Patient #${cleanId}`,
          lastName: '',
          phone: '',
        },
      });

      // Create and immediately mark token as CALLED in this room
      return tx.token.create({
        data: {
          tokenNumber: cleanId,
          serviceDate,
          priority: 'NORMAL',
          status: 'CALLED',
          calledAt: new Date(),
          roomNumber,
          servedByDoctorName,
          departmentId: department.id,
          patientId: patient.id,
        },
        include: { patient: true, department: true, doctor: true },
      });
    }

    if (!waitingToken) return null;

    // 3. Mark token as CALLED in this room
    return tx.token.update({
      where: { id: waitingToken.id },
      data: {
        status: 'CALLED',
        calledAt: new Date(),
        recalledAt: null,
        roomNumber,
        servedByDoctorName,
        stagedRoom: null,
        stagedAt: null,
      },
      include: { patient: true, department: true, doctor: true },
    });
  });

  return ok(nextToken);
});
