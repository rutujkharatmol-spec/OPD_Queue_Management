import { db } from '@/lib/db';
import { conflict, notFound, ok, route } from '@/server/http';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Takes a booklet out of the pile (entered by mistake, or the patient left). Its serial
 * number is not reused, so numbers already written on other booklets stay right. A
 * booklet already given back with a token stays: the token is in the queue.
 */
export const DELETE = route(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const booklet = await db.booklet.findFirst({ where: { id, deletedAt: null }, select: { tokenId: true } });
  if (!booklet) return notFound('That booklet is not in the list. It may have been removed already.');
  if (booklet.tokenId) return conflict('This booklet already has a token, so it is in the queue.');

  await db.booklet.update({ where: { id }, data: { deletedAt: new Date() } });
  return ok({ removed: true });
});
