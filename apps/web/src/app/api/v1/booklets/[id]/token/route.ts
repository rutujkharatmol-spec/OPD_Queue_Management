import { db } from '@/lib/db';
import { notFound, ok, route } from '@/server/http';
import { reserveTokenNumbers, serviceDateFor } from '@/server/tokens/tokenNumber';
import { firstAvailableDoctor } from '@/server/rooms/roomDoctors';
import { BOOKLET_SELECT } from '@/server/booklets/booklets';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const TOKEN_INCLUDE = {
  patient: true,
  department: { select: { name: true } },
} as const;

/**
 * The patient has come for their booklet: issue its token now, so their place in the
 * queue starts on arrival. The doctor is picked now too, from the doctors chosen when
 * the booklet was taken in (the first one in a room right now), since doctors sit down
 * and move rooms after the pile was entered.
 *
 * Safe to press twice, or from two desks: the booklet row is locked, and a booklet that
 * already has a token returns that token (`alreadyIssued: true`) instead of a second one.
 */
export const POST = route(async (_request: Request, { params }: Context) => {
  const { id } = await params;

  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM booklets WHERE id = ${id}::uuid FOR UPDATE`;
      const booklet = await tx.booklet.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, departmentId: true, patientId: true, priority: true, doctorNames: true, tokenId: true },
      });
      if (!booklet) return null;

      if (booklet.tokenId) {
        const token = await tx.token.findUnique({ where: { id: booklet.tokenId }, include: TOKEN_INCLUDE });
        const full = await tx.booklet.findUniqueOrThrow({ where: { id }, select: BOOKLET_SELECT });
        return { token, booklet: full, assignedDoctor: null, alreadyIssued: true };
      }

      let doctorId: string | null = null;
      let assignedDoctor: { doctorName: string; roomNumber: string | null; skipped: string[] } | null = null;
      if (booklet.doctorNames.length > 0) {
        const found = await firstAvailableDoctor(tx, booklet.doctorNames, booklet.departmentId);
        doctorId = found.doctorId;
        assignedDoctor = { doctorName: found.doctorName, roomNumber: found.roomNumber, skipped: found.skipped };
      }

      const serviceDate = serviceDateFor();
      const { tokenNumbers } = await reserveTokenNumbers(tx, booklet.departmentId, serviceDate, 1);
      const now = new Date();
      const token = await tx.token.create({
        data: {
          tokenNumber: tokenNumbers[0],
          serviceDate,
          priority: booklet.priority,
          status: 'WAITING',
          issuedAt: now,
          departmentId: booklet.departmentId,
          patientId: booklet.patientId,
          doctorId,
          // On the chosen doctor's room list, as a normal registration does.
          ...(assignedDoctor?.roomNumber ? { stagedRoom: assignedDoctor.roomNumber, stagedAt: now } : {}),
        },
        include: TOKEN_INCLUDE,
      });

      const full = await tx.booklet.update({
        where: { id },
        data: { tokenId: token.id, handedAt: now },
        select: BOOKLET_SELECT,
      });
      return { token, booklet: full, assignedDoctor, alreadyIssued: false };
    },
    { maxWait: 15000, timeout: 30000 }
  );

  if (!result) return notFound('That booklet is not in the list. It may have been removed.');
  return ok(result, result.alreadyIssued ? 200 : 201);
});
