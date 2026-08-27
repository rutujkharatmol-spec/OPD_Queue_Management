import { db } from '@/lib/db';
import { ok, badRequest, notFound, route, readJson } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ departmentId: string }> };
type Body = { roomNumber: string; tokenIdentifier?: string; tokenNumber?: string; tokenId?: string };

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
  const cleanId = (body.tokenIdentifier || body.tokenNumber || body.tokenId)?.replace(' 🚨', '').trim();

  const nextToken = await db.$transaction(async (tx) => {
    // 1. Find target token or next waiting token for today
    let waitingToken: any = null;

    if (cleanId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      
      // 1. Try finding in current department by UUID or tokenNumber
      waitingToken = await tx.token.findFirst({
        where: {
          departmentId,
          deletedAt: null,
          ...(isUuid ? { id: cleanId } : { tokenNumber: { equals: cleanId, mode: 'insensitive' } }),
        },
        orderBy: { createdAt: 'desc' },
      });

      // 2. Try finding globally across departments if not found in current
      if (!waitingToken && !isUuid) {
        waitingToken = await tx.token.findFirst({
          where: {
            deletedAt: null,
            tokenNumber: { equals: cleanId, mode: 'insensitive' },
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    } else {
      // 3. No specific token requested: find next waiting token for today
      waitingToken = await tx.token.findFirst({
        where: {
          departmentId,
          serviceDate,
          status: 'WAITING',
          deletedAt: null,
        },
        orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
      });

      // Fallback: any waiting token in department
      if (!waitingToken) {
        waitingToken = await tx.token.findFirst({
          where: {
            departmentId,
            status: 'WAITING',
            deletedAt: null,
          },
          orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
        });
      }
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
      },
      include: { patient: true, department: true, doctor: true },
    });
  });

  return ok(nextToken);
});
