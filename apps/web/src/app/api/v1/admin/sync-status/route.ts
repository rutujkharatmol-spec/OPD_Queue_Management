import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { route } from '@/server/http';
import { requireAdmin } from '@/server/admin/auth';

export const dynamic = 'force-dynamic';

/**
 * Is the OPD server's copy to the cloud working? For IT, behind the admin login.
 *
 * `healthy` is false when the cloud copy is switched off, has not run in the last two
 * minutes, or its last pass failed (for example, the internet is down).
 */
export const GET = route(async () => {
  const denied = await requireAdmin();
  if (denied) return denied;

  const enabled = Boolean(process.env.CLOUD_SYNC_DATABASE_URL) && !process.env.VERCEL;
  const rows = enabled
    ? await db.syncState.findMany({ orderBy: { tableName: 'asc' } })
    : [];
  const overall = rows.find((r) => r.tableName === '_all');
  const lastRunAt = overall?.lastRunAt ?? null;
  const fresh = lastRunAt ? Date.now() - lastRunAt.getTime() < 2 * 60 * 1000 : false;

  const res = NextResponse.json({
    enabled,
    healthy: enabled && fresh && !overall?.lastError,
    lastRunAt,
    lastError: overall?.lastError ?? null,
    tables: rows
      .filter((r) => r.tableName !== '_all')
      .map((r) => ({
        table: r.tableName,
        sentUpTo: r.lastSyncedAt,
        lastRunAt: r.lastRunAt,
        lastBatchSize: r.lastBatchSize,
        skipped: r.lastError,
      })),
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
});
