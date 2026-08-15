import { Prisma } from '@/generated/prisma/client';

/** A Prisma client or an interactive-transaction handle — both can run these queries. */
type Db = { $queryRaw: <T = unknown>(q: Prisma.Sql) => Promise<T> };

/**
 * The clinic day a moment belongs to, as a UTC-midnight Date for a `date` column.
 *
 * Built from the local calendar date rather than `toISOString()`: the OPD server runs
 * in the hospital's timezone, and in IST (UTC+5:30) anything before 05:30 local
 * converts to the previous UTC day. Using the UTC date directly would file the first
 * tokens of the morning under yesterday and restart numbering mid-clinic.
 */
export function serviceDateFor(when: Date = new Date()): Date {
  return new Date(Date.UTC(when.getFullYear(), when.getMonth(), when.getDate()));
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
    VALUES (${departmentId}::uuid, ${serviceDate}::date, 1)
    ON CONFLICT (department_id, service_date)
    DO UPDATE SET last_number = token_counters.last_number + 1
    RETURNING last_number
  `);

  const sequence = Number(rows[0].last_number);

  return {
    sequence,
    tokenNumber: `${departmentCode}-${String(sequence).padStart(3, '0')}`,
  };
}
