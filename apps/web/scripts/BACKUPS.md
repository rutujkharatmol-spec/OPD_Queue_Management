# OPD database backups

Neon keeps only 6 hours of history on the current plan. A mistake noticed the next
morning, such as a bulk delete, can only be undone from these backups.

## Set up (once)

1. On a PC that is usually on in the evening, install Node.js and the PostgreSQL 18
   client tools (they come with the PostgreSQL installer).
2. In `apps/web/.env`, make sure `NEON_DATABASE_URL` is set, and set where backups go:
   ```
   BACKUP_DIR="E:\OPD-Backups"      # a USB drive or network share is best
   BACKUP_KEEP_DAYS="14"
   ```
3. Register the nightly task (runs at 21:00):
   ```
   powershell -ExecutionPolicy Bypass -File "apps\web\scripts\install-backup-task.ps1"
   ```
4. Test it: `Start-ScheduledTask -TaskName "OPD Database Backup"`, then look for a new
   `opd-backup-….dump` file and an `OK` line in `backup.log` in the backup folder.

Check `backup.log` now and then. Any failure is written there as `BACKUP FAILED`.

The files hold patient names and phone numbers. Keep the folder private.

## Restore

Restore into a **new, empty** database first and check it, rather than straight over the
live one.

1. In the Neon console, create a new database (or a new branch) and copy its connection
   string, using the address **without** `-pooler`.
2. Restore:
   ```
   "C:\Program Files\PostgreSQL\18\bin\pg_restore" --no-owner --no-privileges -d "<new-database-url>" "E:\OPD-Backups\opd-backup-2026-10-29_2100.dump"
   ```
3. Check the data (for example, today's tokens). When it is right, point
   `NEON_DATABASE_URL` in Vercel at the restored database and redeploy.

To recover only one table, add `--table=tokens` (or another table name) to the
`pg_restore` command.
