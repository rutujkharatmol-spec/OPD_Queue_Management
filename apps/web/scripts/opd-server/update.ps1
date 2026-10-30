# Installs a new version of the app on the OPD server. Run after OPD hours, in
# PowerShell as Administrator:
#
#   powershell -ExecutionPolicy Bypass -File "<repo>\apps\web\scripts\opd-server\update.ps1"
#
# If the new version adds a database migration (a new folder in apps\web\prisma\migrations),
# apply its migration.sql to BOTH databases first: this PC's (psql) and Neon (SQL editor).
# See OPD-SERVER.md, "Updating".

$ErrorActionPreference = "Stop"
$repoDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path

Push-Location $repoDir
try {
  Write-Host "== Getting the new version"
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "git pull failed. Local changes on this PC? Run 'git status'." }

  Write-Host "== Installing and building"
  $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
  & pnpm install --frozen-lockfile --filter "web..."
  if ($LASTEXITCODE -ne 0) { throw "Installing packages failed." }

  # Build before stopping the server, so staff are only interrupted for the restart.
  & pnpm --filter web run build
  if ($LASTEXITCODE -ne 0) { throw "Build failed. The running server was not touched." }
} finally { Pop-Location }

Write-Host "== Restarting the OPD server"
Stop-ScheduledTask -TaskName "OPD Server" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match "next(\.js)?`"? start" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName "OPD Server"

$up = $false
for ($i = 0; $i -lt 60 -and -not $up; $i++) {
  try { $up = (Invoke-WebRequest -Uri "http://localhost:3000/api/v1/departments" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { Start-Sleep -Seconds 2 }
}
if ($up) { Write-Host "Updated and running." -ForegroundColor Green }
else { Write-Host "The server did not come back. See C:\ProgramData\OPD-Server\server.log" -ForegroundColor Red; exit 1 }
