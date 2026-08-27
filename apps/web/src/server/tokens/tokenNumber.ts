import { Prisma } from '@/generated/prisma/client';

/** A Prisma client or an interactive-transaction handle — both can run these queries. */
type Db = { $queryRaw: <T = unknown>(q: Prisma.Sql) => Promise<T> };

/** Where the clinic actually is. Override only if the hospital is in another zone. */
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';

/**
 * The clinic day a moment belongs to, as a UTC-midnight Date for a `date` column.
 *
 * Resolved in the clinic's own timezone rather than the server's. The two deployments
 * run in different zones — the OPD server in IST, Vercel in UTC — and in IST anything
 * before 05:30 local falls on the previous UTC day. A server-local calculation would
 * therefore file the first tokens of the morning under yesterday and restart numbering
 * mid-clinic, and the two deployments would disagree about which day a token belongs to.
 */
export function serviceDateFor(when: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD, which is exactly the field order needed here.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(when)
    .split('-')
    .map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Reserves the next sequential number for a department on a given day.
 *
 * The increment and the read happen in one statement, so concurrent registration
 * desks are serialised by Postgres on the counter row: the second caller blocks on
 * the first's row lock and then reads the already-incremented value. This replaces a
 * count-then-add-one that raced under READ COMMITTED and could hand two patients the
 * same number.
 *
 * Call inside the same transaction that writes the token, so an abandoned token does
 * not leave a consumed number behind.
 */
export async function reserveTokenNumber(
  db: Db,
  departmentId: string,
  departmentCode: string,
  serviceDate: Date
): Promise<{ tokenNumber: string; sequence: number }> {
  const rows = await db.$queryRaw<{ last_number: number }[]>(Prisma.sql`
    INSERT INTO token_counters (department_id, service_date, last_number)
    VALUES (
      ${departmentId}::uuid,
      ${serviceDate}::date,
      -- Seed from tokens already on record rather than starting at 1. A counter row is
      -- created the first time a department issues on a given day, which includes the
      -- first issue after adopting a database that already holds tokens (the Neon
      -- cutover) — starting at 1 there would collide with existing numbers.
      COALESCE((
        SELECT MAX((regexp_match(token_number, '(\\d+)$'))[1]::int)
        FROM tokens
        WHERE department_id = ${departmentId}::uuid
          AND service_date = ${serviceDate}::date
      ), 0) + 1
    )
    ON CONFLICT (department_id, service_date)
    DO UPDATE SET last_number = token_counters.last_number + 1
    RETURNING last_number
  `);

  const sequence = Number(rows[0].last_number);

  return {
    sequence,
    tokenNumber: `${sequence}`,
  };
}
