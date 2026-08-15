/**
 * One-time pull of existing cloud data down into the local database.
 *
 * The architecture is local-first: the OPD server owns the data and pushes to the
 * cloud. Anything already sitting in the cloud from before that decision has to come
 * down once, or it is stranded above a source of truth that has never seen it.
 *
 * Safe to re-run: every row is matched on its UUID and skipped if already present, so
 * nothing local is overwritten.
 *
 *   node scripts/import-from-cloud.mjs "<cloud-url>" "<local-url>"
 *
 * Tables are copied parent-first so foreign keys always resolve.
 */
import { Client } from 'pg';

const [cloudUrl, localUrl] = process.argv.slice(2);

if (!cloudUrl || !localUrl) {
  console.error('Usage: node scripts/import-from-cloud.mjs "<cloud-url>" "<local-url>"');
  process.exit(1);
}

/** Parent-first: a row can only land once everything it references exists. */
const TABLES = ['departments', 'users', 'patients', 'doctors', 'rooms', 'tokens'];

/**
 * Columns this schema has that the older cloud schema does not. `service_date` was
 * added to make per-day token numbering enforceable, so it is derived from the
 * timestamp the cloud does have.
 */
/** Where the clinic is, so a token lands on the day the hospital actually saw it. */
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';

/** Clinic-local calendar day as 'YYYY-MM-DD', which Postgres casts to `date` exactly. */
function clinicDay(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

const DERIVED = {
  tokens: {
    service_date: (row) => clinicDay(row.created_at ?? row.issued_at ?? Date.now()),

    /**
     * The old API set issued_at from application code, which serialised it in the
     * server's local timezone, while created_at came from Postgres in UTC — leaving
     * IST rows about 5.5 hours apart. Mixing both conventions corrupts queue order,
     * because tokens issued later sort ahead of patients who have waited longer.
     * created_at is database-generated and trustworthy, so it wins whenever the two
     * disagree by more than a minute.
     */
    issued_at: (row) => {
      const issued = row.issued_at ? new Date(row.issued_at) : null;
      const created = row.created_at ? new Date(row.created_at) : null;
      if (!issued) return created ?? new Date();
      if (!created) return issued;
      return Math.abs(issued.getTime() - created.getTime()) > 60_000 ? created : issued;
    },
  },
};

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

(async () => {
  const cloud = new Client({ connectionString: cloudUrl });
  const local = new Client({ connectionString: localUrl });
  await cloud.connect();
  await local.connect();

  console.log('Connected to both databases.\n');
  let grandTotal = 0;

  for (const table of TABLES) {
    const cloudCols = await columnsOf(cloud, table);
    const localCols = await columnsOf(local, table);

    if (cloudCols.size === 0) {
      console.log(`${table.padEnd(14)} not present in cloud, skipped`);
      continue;
    }

    // Only copy columns both schemas share; the rest are derived or defaulted.
    const shared = [...cloudCols].filter((c) => localCols.has(c));
    const derived = DERIVED[table] ?? {};

    // A derived column may also exist in both schemas (issued_at does), so it must
    // replace the plain copy rather than be appended beside it — listing a column
    // twice in one INSERT is a syntax error.
    const derivedCols = Object.keys(derived).filter((c) => localCols.has(c));
    const targetCols = [...shared.filter((c) => !derivedCols.includes(c)), ...derivedCols];

    const { rows } = await cloud.query(`SELECT ${shared.map((c) => `"${c}"`).join(', ')} FROM "${table}"`);

    if (rows.length === 0) {
      console.log(`${table.padEnd(14)} 0 rows in cloud`);
      continue;
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const values = targetCols.map((col) =>
        col in derived ? derived[col](row) : row[col]
      );
      const placeholders = targetCols.map((_, i) => `$${i + 1}`).join(', ');

      // DO NOTHING rather than DO UPDATE: local is authoritative, so a row that
      // already exists here must not be overwritten by an older cloud copy.
      const result = await local.query(
        `INSERT INTO "${table}" (${targetCols.map((c) => `"${c}"`).join(', ')})
         VALUES (${placeholders})
         ON CONFLICT ("id") DO NOTHING`,
        values
      );

      if (result.rowCount > 0) inserted += 1;
      else skipped += 1;
    }

    grandTotal += inserted;
    console.log(`${table.padEnd(14)} ${String(inserted).padStart(4)} imported, ${skipped} already present`);
  }

  // Token numbering reads this counter. Without seeding it the first registration
  // after an import would restart at 001 and collide with imported tokens.
  const { rowCount } = await local.query(`
    INSERT INTO token_counters (department_id, service_date, last_number)
    SELECT department_id, service_date,
           MAX((regexp_match(token_number, '(\\d+)$'))[1]::int)
      FROM tokens
     WHERE department_id IS NOT NULL
     GROUP BY department_id, service_date
    ON CONFLICT (department_id, service_date) DO UPDATE
       SET last_number = GREATEST(token_counters.last_number, EXCLUDED.last_number)
  `);

  console.log(`\ntoken counters seeded for ${rowCount} department-day pair(s)`);
  console.log(`${grandTotal} row(s) imported in total.`);

  await cloud.end();
  await local.end();
})().catch((error) => {
  console.error('\nImport failed:', error.message);
  process.exit(1);
});
