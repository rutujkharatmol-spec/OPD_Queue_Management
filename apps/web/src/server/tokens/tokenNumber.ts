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
 * Reserves a batch of sequential numbers for a department on a given day in a single atomic query.
 */
export async function reserveTokenNumbers(
  db: Db,
  departmentId: string,
  departmentCode: string,
  serviceDate: Date,
  count: number = 1
): Promise<{ tokenNumbers: string[]; startSequence: number }> {
  const increment = Math.max(1, count);
  const rows = await db.$queryRaw<{ last_number: number }[]>(Prisma.sql`
    INSERT INTO token_counters (department_id, service_date, last_number)
    VALUES (
      ${departmentId}::uuid,
      ${serviceDate}::date,
      COALESCE((
        SELECT MAX((regexp_match(token_number, '(\\d+)$'))[1]::int)
        FROM tokens
        WHERE department_id = ${departmentId}::uuid
          AND service_date = ${serviceDate}::date
      ), 0) + ${increment}
    )
    ON CONFLICT (department_id, service_date)
    DO UPDATE SET last_number = token_counters.last_number + ${increment}
    RETURNING last_number
  `);

  const lastNumber = Number(rows[0].last_number);
  const startSequence = lastNumber - increment + 1;
  const tokenNumbers: string[] = [];
  for (let i = 0; i < increment; i++) {
    tokenNumbers.push(`${startSequence + i}`);
  }

  return {
    tokenNumbers,
    startSequence,
  };
}

/**
 * Reserves the next sequential number for a department on a given day.
 */
export async function reserveTokenNumber(
  db: Db,
  departmentId: string,
  departmentCode: string,
  serviceDate: Date
): Promise<{ tokenNumber: string; sequence: number }> {
  const { tokenNumbers, startSequence } = await reserveTokenNumbers(db, departmentId, departmentCode, serviceDate, 1);
  return {
    sequence: startSequence,
    tokenNumber: tokenNumbers[0],
  };
}
