/**
 * Nightly backup of the OPD database.
 *
 * Neon keeps only 6 hours of history on the current plan, so a mistake found the next
 * morning (a bulk delete, a bad migration) could not be undone. This takes a full
 * pg_dump to a folder you choose, checks the file can be read back, and keeps the last
 * KEEP_DAYS days of files.
 *
 *   node scripts/backup-db.mjs                    # backs up NEON_DATABASE_URL from .env
 *   node scripts/backup-db.mjs "<database-url>"   # or any database you name
 *
 * Settings (environment variables, or .env next to package.json):
 *   BACKUP_DATABASE_URL  database to back up (default: NEON_DATABASE_URL, then DATABASE_URL,
 *                        then LOCAL_DATABASE_URL)
 *   BACKUP_DIR           where files go (default: <your home folder>/OPD-Backups). Point it
 *                        at a USB drive or network share so a dead disk does not take the
 *                        backups with it.
 *   BACKUP_KEEP_DAYS     how many days of backups to keep (default 14)
 *   PG_BIN               folder holding pg_dump.exe, if it is not found automatically
 *
 * The files contain patient names and phone numbers. Keep the folder private.
 *
 * Restoring is described in scripts/BACKUPS.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, appendFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE_PATTERN = /^opd-backup-\d{4}-\d{2}-\d{2}_\d{4}\.dump$/;

/** Reads KEY=value lines from .env without overriding real environment variables. */
function loadDotEnv() {
  const file = join(appDir, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function findPgBin() {
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
      // Newest version first: pg_dump must be at least as new as the server.
      const versions = readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of versions) candidates.push(join(base, v, 'bin'));
    }
  }
  const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  for (const dir of candidates) if (existsSync(join(dir, exe))) return dir;
  return ''; // fall back to PATH
}

function tool(binDir, name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return binDir ? join(binDir, exe) : exe;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function main() {
  loadDotEnv();

  const url =
    process.argv[2] ||
    process.env.BACKUP_DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL;
  if (!url?.trim()) throw new Error('No database to back up. Set BACKUP_DATABASE_URL or NEON_DATABASE_URL.');

  const parsed = new URL(url.trim());
  // pg_dump needs a direct connection; Neon's "-pooler" address runs through PgBouncer.
  parsed.hostname = parsed.hostname.replace('-pooler.', '.');
  // Pass the password through the environment, not the command line, so it does not
  // show up in the process list.
  const password = decodeURIComponent(parsed.password);
  parsed.password = '';
  // Prisma-only options that pg_dump rejects.
  for (const key of ['pgbouncer', 'connection_limit', 'pool_timeout', 'schema']) {
    parsed.searchParams.delete(key);
  }
  const env = { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: '30' };

  const dir = process.env.BACKUP_DIR?.trim() || join(homedir(), 'OPD-Backups');
  const keepDays = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 14);
  mkdirSync(dir, { recursive: true });
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    appendFileSync(join(dir, 'backup.log'), `${line}\n`);
  };

  const binDir = findPgBin();
  const finalFile = join(dir, `opd-backup-${stamp()}.dump`);
  const partFile = `${finalFile}.part`;

  log(`Backing up ${parsed.hostname}${parsed.pathname} -> ${finalFile}`);

  // Custom format: compressed, and pg_restore can restore all of it or single tables.
  const dump = spawnSync(
    tool(binDir, 'pg_dump'),
    ['--format=custom', '--no-owner', '--no-privileges', `--file=${partFile}`, `--dbname=${parsed.toString()}`],
    { env, encoding: 'utf8' }
  );
  if (dump.error) throw new Error(`Could not run pg_dump (${dump.error.message}). Install PostgreSQL client tools or set PG_BIN.`);
  if (dump.status !== 0) {
    if (existsSync(partFile)) unlinkSync(partFile);
    throw new Error(`pg_dump failed: ${(dump.stderr || '').trim()}`);
  }

  // Prove the file is readable before calling it a backup.
  const check = spawnSync(tool(binDir, 'pg_restore'), ['--list', partFile], { encoding: 'utf8' });
  if (check.status !== 0 || !/TABLE DATA public tokens/.test(check.stdout || '')) {
    throw new Error(`Backup file failed its check: ${(check.stderr || 'tokens table missing').trim()}`);
  }
  renameSync(partFile, finalFile);
  log(`OK, ${(statSync(finalFile).size / 1024).toFixed(0)} KB`);

  // Remove our own old files only; anything else in the folder is left alone.
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(dir)) {
    if (!FILE_PATTERN.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      log(`Removed old backup ${name}`);
    }
  }
}

try {
  main();
} catch (err) {
  const msg = `BACKUP FAILED: ${err instanceof Error ? err.message : err}`;
  console.error(msg);
  try {
    const dir = process.env.BACKUP_DIR?.trim() || join(homedir(), 'OPD-Backups');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'backup.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
  process.exit(1);
}
