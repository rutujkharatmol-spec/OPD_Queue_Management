# Registers a Windows scheduled task that backs up the OPD database every night.
#
# Run once on a PC that is usually switched on in the evening and has Node.js and the
# PostgreSQL tools installed:
#
#   powershell -ExecutionPolicy Bypass -File "apps\web\scripts\install-backup-task.ps1"
#
# Optional: -At "21:30" to pick the time (default 21:00, after OPD hours).
# If the PC was off at that time, the backup runs as soon as it is next switched on.
# To remove it:  Unregister-ScheduledTask -TaskName "OPD Database Backup"
#
# -AsSystem (needs Administrator) runs it whether or not anyone is logged in; the OPD
# server setup uses this. Set BACKUP_DIR in .env then, since SYSTEM has no home folder.

param([string]$At = "21:00", [switch]$AsSystem)

$bat = Join-Path $PSScriptRoot "backup-db.bat"
if (-not (Test-Path $bat)) { throw "Cannot find $bat" }

$action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$bat`"`""
$trigger  = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

$extra = @{}
if ($AsSystem) {
  $extra.Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
}

Register-ScheduledTask -TaskName "OPD Database Backup" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Nightly pg_dump of the OPD queue database (apps\web\scripts\backup-db.mjs)" -Force @extra | Out-Null

Write-Host "Scheduled 'OPD Database Backup' daily at $At."
Write-Host "Test it now with:  Start-ScheduledTask -TaskName 'OPD Database Backup'"
Write-Host "Results are logged to backup.log in the backup folder."
