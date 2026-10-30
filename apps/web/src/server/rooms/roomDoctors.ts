import type { Prisma } from '@/generated/prisma/client';
import {
  MAX_ROOM_DOCTORS_LENGTH,
  joinDoctorNames,
  sameDoctor,
  splitDoctorNames,
  withDoctorRenamed,
  withoutDoctor,
} from '@/lib/roomDoctors';

type Tx = Prisma.TransactionClient;

const nameIs = (name: string) => ({ name: { equals: name, mode: 'insensitive' as const } });

/**
 * Checks a typed doctor list ("Dr. Roy, Dr. Das"). Returns the names, or an error
 * message for the caller to send back as a 400.
 */
export function parseDoctorList(text: string | null | undefined): { names: string[] } | { error: string } {
  const names = splitDoctorNames(text);
  if (names.some((n) => n.length > 80)) return { error: 'A doctor name is too long.' };
  if ((joinDoctorNames(names) ?? '').length > MAX_ROOM_DOCTORS_LENGTH) return { error: 'Too many doctor names for one room.' };
  return { names };
}

/** Rooms whose list may contain any of these names (exact check done by the caller). */
function roomsMentioning(tx: Tx, names: string[], exceptRoomId?: string) {
  return tx.room.findMany({
    where: {
      deletedAt: null,
      ...(exceptRoomId ? { id: { not: exceptRoomId } } : {}),
      OR: names.map((n) => ({ doctorName: { contains: n, mode: 'insensitive' as const } })),
    },
    select: { id: true, doctorName: true },
  });
}

/** Takes these doctors off every room but one. A doctor is in one room at a time. */
async function takeOffOtherRooms(tx: Tx, names: string[], keepRoomId: string): Promise<void> {
  if (names.length === 0) return;
  for (const room of await roomsMentioning(tx, names, keepRoomId)) {
    const before = splitDoctorNames(room.doctorName);
    const after = before.filter((n) => !names.some((m) => sameDoctor(n, m)));
    if (after.length !== before.length) {
      await tx.room.update({ where: { id: room.id }, data: { doctorName: joinDoctorNames(after) } });
    }
  }
}

/**
 * Sets exactly who is in a room.
 *
 * Takes the listed doctors off any other room, points their saved doctor records at
 * this room, and clears the room from doctors who were on it and are no longer listed.
 * Pass `previousRoomNumber` when the room itself was just renumbered.
 */
export async function setRoomDoctors(
  tx: Tx,
  roomId: string,
  names: string[],
  previous?: { doctorName: string | null; roomNumber: string }
) {
  const room = await tx.room.findUniqueOrThrow({
    where: { id: roomId },
    select: { id: true, roomNumber: true, departmentId: true, doctorName: true },
  });
  const before = previous ?? { doctorName: room.doctorName, roomNumber: room.roomNumber };
  const list = splitDoctorNames(names.join(','));

  await takeOffOtherRooms(tx, list, room.id);

  const removed = splitDoctorNames(before.doctorName).filter((n) => !list.some((m) => sameDoctor(n, m)));
  if (removed.length > 0) {
    await tx.doctor.updateMany({
      where: { deletedAt: null, roomNumber: before.roomNumber, OR: removed.map(nameIs) },
      data: { roomNumber: null },
    });
  }
  if (list.length > 0) {
    await tx.doctor.updateMany({
      where: { deletedAt: null, OR: list.map(nameIs) },
      data: { roomNumber: room.roomNumber, ...(room.departmentId ? { departmentId: room.departmentId } : {}) },
    });
  }

  return tx.room.update({
    where: { id: room.id },
    data: { doctorName: joinDoctorNames(list) },
    select: { id: true, roomNumber: true, departmentId: true, doctorName: true },
  });
}

/** Renames a doctor in every room list. Returns how many rooms changed. */
export async function renameDoctorInRooms(tx: Tx, oldName: string, newName: string): Promise<number> {
  let count = 0;
  for (const room of await roomsMentioning(tx, [oldName])) {
    if (!splitDoctorNames(room.doctorName).some((n) => sameDoctor(n, oldName))) continue;
    await tx.room.update({ where: { id: room.id }, data: { doctorName: withDoctorRenamed(room.doctorName, oldName, newName) } });
    count++;
  }
  return count;
}

/** Takes a doctor off every room list. Returns how many rooms changed. */
export async function removeDoctorFromRooms(tx: Tx, name: string): Promise<number> {
  let count = 0;
  for (const room of await roomsMentioning(tx, [name])) {
    if (!splitDoctorNames(room.doctorName).some((n) => sameDoctor(n, name))) continue;
    await tx.room.update({ where: { id: room.id }, data: { doctorName: withoutDoctor(room.doctorName, name) } });
    count++;
  }
  return count;
}

/**
 * Registration: the doctor the desk picked, and the room to send the patient to.
 *
 * The room is where the doctor is sitting now (their name is on its list, as on the TV).
 * If they aren't on any room right now, it is the room where they last saw a patient,
 * then the room saved on their record. Null when none of those is known.
 *
 * Doctors are matched by name ignoring case, like the Doctor Desk does. A name that is
 * only on a room list gets a doctor record, so the token can point at it.
 */
export async function doctorAndRoomFor(
  tx: Tx,
  name: string,
  departmentId: string
): Promise<{ doctorId: string; doctorName: string; roomNumber: string | null }> {
  const select = { id: true, name: true, roomNumber: true } as const;
  const doctor =
    (await tx.doctor.findFirst({ where: { deletedAt: null, ...nameIs(name) }, select })) ??
    (await tx.doctor.create({ data: { name, departmentId }, select }));
  const found = (roomNumber: string | null) => ({ doctorId: doctor.id, doctorName: doctor.name, roomNumber });

  // 1. The room they are in now. A doctor is on one room at a time; if an old list still
  //    names them twice, the room on their record wins.
  const rooms = await tx.room.findMany({
    where: { deletedAt: null, isActive: true, doctorName: { not: null }, OR: [{ departmentId }, { departmentId: null }] },
    select: { roomNumber: true, doctorName: true },
  });
  const sitting = rooms.filter((r) => splitDoctorNames(r.doctorName).some((n) => sameDoctor(n, doctor.name)));
  const current = sitting.find((r) => r.roomNumber === doctor.roomNumber) ?? sitting[0];
  if (current) return found(current.roomNumber);

  // 2. Where they last saw a patient.
  const lastSeen = await tx.token.findFirst({
    where: {
      departmentId,
      deletedAt: null,
      roomNumber: { not: null },
      calledAt: { not: null },
      servedByDoctorName: { equals: doctor.name, mode: 'insensitive' },
    },
    orderBy: { calledAt: 'desc' },
    select: { roomNumber: true },
  });

  // 3. The room on their record.
  return found(lastSeen?.roomNumber ?? doctor.roomNumber ?? null);
}
