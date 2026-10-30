import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { db, getConnectionString } from '@/lib/db';

/**
 * Pushes the OPD server's database up to the cloud copy (Neon), so patient phones on
 * Vercel see the live queue.
 *
 * Runs only on the OPD server, inside its own `next start` process, and only when
 * CLOUD_SYNC_DATABASE_URL is set (see src/instrumentation.ts). One direction only: the
 * OPD server is the source of truth and the cloud is a copy, so nothing ever comes back
 * down. Never in the path of a request: it runs on its own timer and its own
 * connection, and when the internet is down it just keeps retrying and catches up later.
 *
 * Each table is copied by `updated_at`: every pass sends rows changed since the last
 * one, a batch per round trip, as `INSERT ... ON CONFLICT (id) DO UPDATE`. The app
 * never hard-deletes (deletes set `deleted_at`), and Prisma stamps `updated_at` on every
 * write, so "changed since" catches everything. Each pass re-reads the last two minutes
 * as well, so a transaction that committed late with an earlier timestamp is not missed;
 * re-sending a row is harmless.
 *
 * Progress and the last error per table are kept in the local `sync_state` table.
 */

/** Parent tables first, so foreign keys always resolve in the cloud. */
const TABLES = ['departments', 'users', 'patients', 'doctors', 'rooms', 'tokens'] as const;
type Table = (typeof TABLES)[number];

const PAGE_SIZE = 500;
const OVERLAP_SECONDS = 120;
const INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const START_CURSOR = { ts: '1970-01-01 00:00:00', id: '00000000-0000-0000-0000-000000000000' };

let cloud: PrismaClient | null = null;
let started = false;
let columnsByTable: Map<Table, string[]> | null = null;
let lastLoggedError = '';

/** Same server and database, ignoring Neon's "-pooler" alias and the password. */
function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const host = (u: URL) => u.hostname.replace('-pooler.', '.').toLowerCase();
    return host(ua) === host(ub) && (ua.port || '5432') === (ub.port || '5432') && ua.pathname === ub.pathname;
  } catch {
    return a === b;
  }
}

function cloudClient(url: string): PrismaClient {
  if (!cloud) {
    cloud = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 2, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000 }),
    });
  }
  return cloud;
}

function errorText(err: unknown): string {
  const e = err as { message?: string; meta?: { code?: string; message?: string } };
  return (e?.meta?.message || e?.message || String(err)).replace(/\s+/g, ' ').slice(0, 500);
}

function isUniqueViolation(err: unknown): boolean {
  const text = `${(err as { code?: string })?.code ?? ''} ${JSON.stringify((err as { meta?: unknown })?.meta ?? '')} ${errorText(err)}`;
  return text.includes('23505') || /unique constraint|duplicate key/i.test(text);
}

async function tableColumns(client: PrismaClient, table: Table): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    table
  );
  return rows.map((r) => r.column_name);
}

/**
 * The columns to copy for each table. Refuses to run if the cloud is missing a column
 * the OPD server has: copying would silently drop that data. That happens when a
 * migration was applied here but not to Neon.
 */
async function checkSchemas(target: PrismaClient): Promise<Map<Table, string[]>> {
  const result = new Map<Table, string[]>();
  const missing: string[] = [];
  for (const table of TABLES) {
    const [local, remote] = await Promise.all([tableColumns(db, table), tableColumns(target, table)]);
    if (local.length === 0) throw new Error(`Table ${table} not found in the OPD server database.`);
    const remoteSet = new Set(remote);
    for (const col of local) if (!remoteSet.has(col)) missing.push(`${table}.${col}`);
    result.set(table, local);
  }
  if (missing.length > 0) {
    throw new Error(
      `The cloud database is missing columns: ${missing.join(', ')}. Apply the same migrations to Neon (apps/web/prisma/migrations).`
    );
  }
  return result;
}

function upsertSql(table: Table, columns: string[]): string {
  const cols = columns.map((c) => `"${c}"`).join(', ');
  const updates = columns.filter((c) => c !== 'id');
  return `
    INSERT INTO "${table}" (${cols})
    SELECT ${cols} FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)
    ON CONFLICT ("id") DO UPDATE
       SET (${updates.map((c) => `"${c}"`).join(', ')}) = (${updates.map((c) => `EXCLUDED."${c}"`).join(', ')})
     WHERE "${table}"."updated_at" <= EXCLUDED."updated_at"`;
}

/**
 * Sends rows one at a time after a batch hit a unique-key clash. For tokens the clash is
 * a cloud row with the same department, day and number but a different id (written on
 * the cloud side before it became a copy); the OPD server's row wins, so that cloud row
 * is removed. Any other row that still cannot be sent is reported and skipped.
 */
async function upsertOneByOne(
  target: PrismaClient,
  table: Table,
  sql: string,
  rows: Record<string, unknown>[]
): Promise<string[]> {
  const skipped: string[] = [];
  for (const row of rows) {
    try {
      await target.$executeRawUnsafe(sql, JSON.stringify([row]));
    } catch (err) {
      if (table === 'tokens' && isUniqueViolation(err)) {
        await target.$executeRawUnsafe(
          `DELETE FROM "tokens" WHERE department_id = $1::uuid AND service_date = $2::date
              AND token_number = $3 AND id <> $4::uuid`,
          row.department_id,
          row.service_date,
          row.token_number,
          row.id
        );
        await target.$executeRawUnsafe(sql, JSON.stringify([row]));
      } else if (isUniqueViolation(err)) {
        skipped.push(`${table} ${String(row.id)}: ${errorText(err)}`);
      } else {
        throw err;
      }
    }
  }
  return skipped;
}

async function syncTable(target: PrismaClient, table: Table, columns: string[]): Promise<number> {
  const state = await db.syncState.findUnique({ where: { tableName: table } });
  const cursorTs = state?.lastSyncedAt || START_CURSOR.ts;
  const sql = upsertSql(table, columns);

  // Nothing new since the last pass (same rows in the re-read window, same newest
  // timestamp): skip without contacting the cloud at all, so Neon can go to sleep at
  // night instead of being woken every few seconds. A late-committed row adds to the
  // window's count, so it is still noticed.
  const [window] = await db.$queryRawUnsafe<{ n: number; newest: string | null }[]>(
    `SELECT count(*)::int AS n, max(updated_at)::text AS newest FROM "${table}"
      WHERE updated_at > $1::timestamp - make_interval(secs => ${OVERLAP_SECONDS})`,
    cursorTs
  );
  if (state && window.n === state.lastBatchSize && (window.newest ?? cursorTs) === cursorTs) {
    return 0;
  }

  // Start two minutes before the last cursor; see the note at the top.
  let after = { ts: '', id: START_CURSOR.id };
  let newest = cursorTs;
  let sent = 0;
  const skipped: string[] = [];

  for (;;) {
    const page = await db.$queryRawUnsafe<{ ts: string; id: string; row: Record<string, unknown> }[]>(
      `SELECT t.updated_at::text AS ts, t.id::text AS id, to_jsonb(t) AS row
         FROM "${table}" t
        WHERE (t.updated_at, t.id) > (
                COALESCE(NULLIF($1, '')::timestamp, $2::timestamp - make_interval(secs => ${OVERLAP_SECONDS})),
                $3::uuid)
        ORDER BY t.updated_at, t.id
        LIMIT ${PAGE_SIZE}`,
      after.ts,
      cursorTs,
      after.id
    );
    if (page.length === 0) break;

    const rows = page.map((r) => r.row);
    try {
      await target.$executeRawUnsafe(sql, JSON.stringify(rows));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      skipped.push(...(await upsertOneByOne(target, table, sql, rows)));
    }

    sent += page.length;
    const last = page[page.length - 1];
    after = { ts: last.ts, id: last.id };
    if (last.ts > newest) newest = last.ts;
    if (page.length < PAGE_SIZE) break;
  }

  await db.syncState.upsert({
    where: { tableName: table },
    create: {
      tableName: table,
      lastSyncedAt: newest,
      lastRunAt: new Date(),
      lastBatchSize: sent,
      lastError: skipped.length ? skipped.join(' | ').slice(0, 2000) : null,
    },
    update: {
      lastSyncedAt: newest,
      lastRunAt: new Date(),
      lastBatchSize: sent,
      lastError: skipped.length ? skipped.join(' | ').slice(0, 2000) : null,
    },
  });
  return sent;
}

async function recordFailure(message: string): Promise<void> {
  if (message !== lastLoggedError) {
    console.warn(`[cloud-sync] ${message}`);
    lastLoggedError = message;
  }
  try {
    await db.syncState.upsert({
      where: { tableName: '_all' },
      create: { tableName: '_all', lastRunAt: new Date(), lastError: message.slice(0, 2000) },
      update: { lastRunAt: new Date(), lastError: message.slice(0, 2000) },
    });
  } catch {
    // The local database is down too; nothing to record into.
  }
}

/** One full pass over every table. Exported for the sync-status route and tests. */
export async function syncOnce(url: string): Promise<{ sent: number }> {
  const target = cloudClient(url);
  if (!columnsByTable) columnsByTable = await checkSchemas(target);

  let sent = 0;
  for (const table of TABLES) {
    sent += await syncTable(target, table, columnsByTable.get(table)!);
  }

  await db.syncState.upsert({
    where: { tableName: '_all' },
    create: { tableName: '_all', lastRunAt: new Date(), lastError: null, lastBatchSize: sent },
    update: { lastRunAt: new Date(), lastError: null, lastBatchSize: sent },
  });
  if (lastLoggedError) {
    console.info('[cloud-sync] Connected to the cloud copy again; changes are being sent.');
    lastLoggedError = '';
  }
  return { sent };
}

/** Starts the background loop. Safe to call more than once. */
export function startCloudSync(): void {
  if (started) return;
  const url = process.env.CLOUD_SYNC_DATABASE_URL?.trim();
  if (!url || process.env.VERCEL) return;

  const source = getConnectionString();
  if (!source) {
    console.warn('[cloud-sync] Not started: this server has no database configured.');
    return;
  }
  if (sameDatabase(source, url)) {
    console.warn(
      '[cloud-sync] Not started: CLOUD_SYNC_DATABASE_URL is the same database this server uses. ' +
        'On the OPD server, DATABASE_URL must point at the local Postgres.'
    );
    return;
  }

  started = true;
  console.info('[cloud-sync] Started: sending changes to the cloud copy every few seconds.');

  let delay = INTERVAL_MS;
  const tick = async () => {
    try {
      await syncOnce(url);
      delay = INTERVAL_MS;
    } catch (err) {
      // A schema problem needs a person; anything else (internet down) just retries.
      if (/missing columns/.test(errorText(err))) columnsByTable = null;
      await recordFailure(errorText(err));
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    }
    setTimeout(tick, delay).unref?.();
  };
  setTimeout(tick, 2_000).unref?.();
}
