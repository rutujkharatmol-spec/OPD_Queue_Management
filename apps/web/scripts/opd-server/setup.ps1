# OPD server (mini-PC) one-time setup.
#
# Makes this PC the hospital-network server for the OPD queue: a local PostgreSQL
# database (the source of truth), the web app running at boot on port 3000, a live copy
# pushed up to Neon for patients' phones, and nightly backups.
#
# Before running:  install Node.js 22 LTS and PostgreSQL 18 (see OPD-SERVER.md).
# Run in PowerShell as Administrator, from anywhere:
#
#   powershell -ExecutionPolicy Bypass -File "<repo>\apps\web\scripts\opd-server\setup.ps1"
#
# Safe to re-run: it never overwrites a local database that already has patients, and
# keeps existing settings in .env.

param(
  [int]$Port = 3000,
  [string]$PgHost = "127.0.0.1",
  [int]$PgPort = 5432,
  [string]$DbName = "opd",
  # Neon connection string to copy from and sync to. Read from .env if not given.
  [string]$CloudUrl = "",
  # For testing this script: skip the boot task, firewall and backup task.
  [switch]$NoService,
  # For testing this script: skip installing packages and building.
  [switch]$SkipBuild,
  # Optional instead of being asked (for testing or scripted installs).
  [string]$PgSuperPassword = "",
  [string]$StaffPassword = "",
  [string]$AdminPassword = "",
  # Settings file to write; defaults to appsweb.env.
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$appDir  = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$repoDir = (Resolve-Path (Join-Path $appDir "..\..")).Path
$envFile = if ($EnvFile) { $EnvFile } else { Join-Path $appDir ".env" }

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "   OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   !!  $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host ""; Write-Host "SETUP STOPPED: $text" -ForegroundColor Red; exit 1 }

# ── .env helpers: read and set single keys, keeping everything else as it is ──
function Read-EnvValue($key) {
  if (-not (Test-Path $envFile)) { return "" }
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*$key\s*=\s*(.*)\s*$") { return $Matches[1].Trim().Trim('"').Trim("'") }
  }
  return ""
}
function Set-EnvValue($key, $value) {
  $lines = @()
  if (Test-Path $envFile) { $lines = @(Get-Content $envFile) }
  $newLine = "$key=`"$value`""
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*#?\s*$key\s*=") { $lines[$i] = $newLine; $found = $true; break }
  }
  if (-not $found) { $lines += $newLine }
  # No byte-order mark: PowerShell 5's "utf8" adds one, which breaks the first key.
  [IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
}
function Read-Secret($prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function New-RandomPassword {
  $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return -join (1..24 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}
# Splits a postgres URL into what pg_dump needs: direct host (no -pooler), password apart.
function Split-PgUrl($url) {
  $u = [Uri]$url
  $userInfo = $u.UserInfo.Split(":", 2)
  $query = ($u.Query.TrimStart("?").Split("&") | Where-Object { $_ -and $_ -notmatch "^(pgbouncer|connection_limit|pool_timeout|schema)=" }) -join "&"
  $hostName = $u.Host -replace "-pooler\.", "."
  $portPart = if ($u.Port -gt 0) { ":$($u.Port)" } else { "" }
  return @{
    Password = [Uri]::UnescapeDataString($(if ($userInfo.Count -gt 1) { $userInfo[1] } else { "" }))
    Url      = "postgresql://$($userInfo[0])@$hostName$portPart$($u.AbsolutePath)$(if ($query) { "?$query" })"
    Host     = $hostName
  }
}

# ── 1. Checks ─────────────────────────────────────────────────────────────────
Step "Checking this PC"
if (-not $NoService) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Fail "Run PowerShell as Administrator (right-click > Run as administrator)." }
}
$nodeVersion = (& node --version) 2>$null
if (-not $nodeVersion) { Fail "Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org and run this again." }
if ([int]($nodeVersion.TrimStart("v").Split(".")[0]) -lt 20) { Fail "Node.js $nodeVersion is too old. Install Node.js 22 LTS." }
Ok "Node.js $nodeVersion"

$pgBin = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match "^\d+$" } | Sort-Object { [int]$_.Name } -Descending |
  ForEach-Object { Join-Path $_.FullName "bin" } | Where-Object { Test-Path (Join-Path $_ "psql.exe") } | Select-Object -First 1
if (-not $pgBin) { Fail "PostgreSQL is not installed. Install PostgreSQL 18 from https://www.postgresql.org/download/windows/ and run this again." }
$psql = Join-Path $pgBin "psql.exe"; $pgDump = Join-Path $pgBin "pg_dump.exe"; $pgRestore = Join-Path $pgBin "pg_restore.exe"
& (Join-Path $pgBin "pg_isready.exe") -h $PgHost -p $PgPort | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "PostgreSQL is not running on ${PgHost}:$PgPort. Start the 'postgresql' service in Services." }
Ok "PostgreSQL ($pgBin)"

# ── 2. Local database ─────────────────────────────────────────────────────────
Step "Local database"
$localUrl = Read-EnvValue "DATABASE_URL"
$isLocal = $localUrl -match "@(localhost|127\.0\.0\.1)[:/]"
if (-not $isLocal) {
  $env:PGPASSWORD = if ($PgSuperPassword) { $PgSuperPassword } else { Read-Secret "Password of the 'postgres' user (chosen when PostgreSQL was installed)" }
  & $psql -h $PgHost -p $PgPort -U postgres -d postgres -Atc "select 1" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Could not log in to PostgreSQL as 'postgres'. Check the password." }

  $appPassword = New-RandomPassword
  $roleExists = & $psql -h $PgHost -p $PgPort -U postgres -d postgres -Atc "select 1 from pg_roles where rolname='opd'"
  if ($roleExists -eq "1") {
    & $psql -q -h $PgHost -p $PgPort -U postgres -d postgres -c "ALTER ROLE opd WITH LOGIN PASSWORD '$appPassword'" | Out-Null
  } else {
    & $psql -q -h $PgHost -p $PgPort -U postgres -d postgres -c "CREATE ROLE opd WITH LOGIN PASSWORD '$appPassword'" | Out-Null
  }
  $dbExists = & $psql -h $PgHost -p $PgPort -U postgres -d postgres -Atc "select 1 from pg_database where datname='$DbName'"
  if ($dbExists -ne "1") {
    & $psql -q -h $PgHost -p $PgPort -U postgres -d postgres -c "CREATE DATABASE `"$DbName`" OWNER opd" | Out-Null
  }
  if ($LASTEXITCODE -ne 0) { Fail "Could not create the database." }
  Remove-Item Env:\PGPASSWORD
  $localUrl = "postgresql://opd:$appPassword@${PgHost}:$PgPort/$DbName"
  Set-EnvValue "DATABASE_URL" $localUrl
  Set-EnvValue "LOCAL_DATABASE_URL" $localUrl
  Ok "Database '$DbName' and user 'opd' ready (password saved in apps\web\.env)"
} else {
  Ok "Already set up in .env"
}
$local = Split-PgUrl $localUrl

# ── 3. Copy today's data down from Neon (only into an empty database) ────────
Step "Copying data from the cloud (Neon)"
if (-not $CloudUrl) { $CloudUrl = Read-EnvValue "CLOUD_SYNC_DATABASE_URL" }
if (-not $CloudUrl) { $CloudUrl = Read-EnvValue "NEON_DATABASE_URL" }
if (-not $CloudUrl) { $CloudUrl = Read-Host -Prompt "Paste the Neon connection string (Neon console > Connect)" }
if ($CloudUrl -match "@(localhost|127\.0\.0\.1)[:/]" -and -not $NoService) { Fail "The cloud connection string points at this PC. Use the Neon one." }
$cloud = Split-PgUrl $CloudUrl

$env:PGPASSWORD = $local.Password
$hasTable = & $psql -d $local.Url -Atc "select to_regclass('public.tokens') is not null"
if ($LASTEXITCODE -ne 0) { Fail "Could not open the local database." }
$hasData = if ($hasTable -eq "t") { & $psql -d $local.Url -Atc "select count(*) from tokens" } else { "0" }
if ([int]$hasData -gt 0) {
  Ok "Local database already has $hasData tokens; not copying over it (this PC is the source of truth)."
} else {
  $dumpFile = Join-Path $env:TEMP "opd-cloud-copy.dump"
  $env:PGPASSWORD = $cloud.Password
  & $pgDump --format=custom --no-owner --no-privileges "--file=$dumpFile" "--dbname=$($cloud.Url)"
  if ($LASTEXITCODE -ne 0) { Fail "Could not copy from Neon. Check the internet connection and the connection string." }
  $env:PGPASSWORD = $local.Password
  & $pgRestore --no-owner --no-privileges --exit-on-error -d $local.Url $dumpFile
  if ($LASTEXITCODE -ne 0) { Fail "Could not load the copy into the local database." }
  Remove-Item $dumpFile -Force
  $count = & $psql -d $local.Url -Atc "select count(*) from tokens"
  Ok "Copied from Neon: $count tokens"
}
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# ── 4. Settings ───────────────────────────────────────────────────────────────
Step "Settings (apps\web\.env)"
Set-EnvValue "CLOUD_SYNC_DATABASE_URL" $CloudUrl
Set-EnvValue "BACKUP_DATABASE_URL" $localUrl
if (-not (Read-EnvValue "BACKUP_DIR")) { Set-EnvValue "BACKUP_DIR" "C:\OPD-Backups" }
if (-not (Read-EnvValue "STAFF_PASSWORD")) { Set-EnvValue "STAFF_PASSWORD" $(if ($StaffPassword) { $StaffPassword } else { Read-Secret "Staff password (same as on Vercel)" }) }
if (-not (Read-EnvValue "ADMIN_PASSWORD")) { Set-EnvValue "ADMIN_PASSWORD" $(if ($AdminPassword) { $AdminPassword } else { Read-Secret "Admin password (same as on Vercel)" }) }
Ok "Cloud copy, backups and passwords set"

# ── 5. Install and build ──────────────────────────────────────────────────────
if (-not $SkipBuild) {
  Step "Installing and building the app (a few minutes)"
  Push-Location $repoDir
  try {
    $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"   # fetch pnpm without asking
    & corepack enable | Out-Null
    & pnpm install --frozen-lockfile --filter "web..."
    if ($LASTEXITCODE -ne 0) { Fail "Installing packages failed." }
    & pnpm --filter web run build
    if ($LASTEXITCODE -ne 0) { Fail "Building the app failed." }
  } finally { Pop-Location }
  Ok "Built"
}

if ($NoService) { Write-Host ""; Write-Host "Done (test mode: no boot task, firewall or backup task)."; exit 0 }

# ── 6. Start at boot, restart if it stops ────────────────────────────────────
Step "Starting the OPD server at boot"
$logDir = "C:\ProgramData\OPD-Server"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$runner = Join-Path $logDir "run-opd-server.cmd"
Set-Content -Path $runner -Encoding ascii -Value @(
  "@echo off",
  "cd /d `"$appDir`"",
  "node node_modules\next\dist\bin\next start -p $Port >> `"$logDir\server.log`" 2>&1"
)
$action    = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$runner`""
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
               -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "OPD Server" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Stop-ScheduledTask -TaskName "OPD Server" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "OPD Server"
Ok "Task 'OPD Server' registered and started (log: $logDir\server.log)"

# ── 7. Let other computers on the network reach it ──────────────────────────
Step "Firewall"
Get-NetFirewallRule -DisplayName "OPD Server (port $Port)" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "OPD Server (port $Port)" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Domain,Private | Out-Null
Ok "Port $Port open on private and domain networks"
$public = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq "Public" }
if ($public) { Warn "This PC's network '$($public.Name)' is set to Public, so other computers cannot connect. Run: Set-NetConnectionProfile -Name '$($public.Name)' -NetworkCategory Private" }

# ── 8. Nightly backup of the local database ──────────────────────────────────
Step "Nightly backup"
& (Join-Path $appDir "scripts\install-backup-task.ps1") -AsSystem
Ok "Backups to $(Read-EnvValue 'BACKUP_DIR') every night at 21:00"

# ── 9. Check it answers ──────────────────────────────────────────────────────
Step "Checking the server"
$up = $false
for ($i = 0; $i -lt 60 -and -not $up; $i++) {
  try { $up = (Invoke-WebRequest -Uri "http://localhost:$Port/api/v1/departments" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { Start-Sleep -Seconds 2 }
}
if (-not $up) { Fail "The server did not answer on port $Port. See $logDir\server.log" }
Ok "Answering on port $Port"

$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -ExpandProperty IPAddress
Write-Host ""
Write-Host "OPD server is running." -ForegroundColor Green
foreach ($ip in $ips) {
  Write-Host "   Staff screens:  http://${ip}:$Port/registration   http://${ip}:$Port/doctor"
  Write-Host "   TV board:       http://${ip}:$Port/tv"
}
Write-Host "   Give this PC a fixed address in the router (DHCP reservation) so these links keep working."
Write-Host "   Next steps: OPD-SERVER.md, 'Switching over'."
