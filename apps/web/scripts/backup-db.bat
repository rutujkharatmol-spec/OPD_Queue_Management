@echo off
REM Runs the OPD database backup (scripts\backup-db.mjs). Settings come from apps\web\.env.
REM The scheduled task created by install-backup-task.ps1 runs this every night.
cd /d "%~dp0.."
node scripts\backup-db.mjs
exit /b %errorlevel%
