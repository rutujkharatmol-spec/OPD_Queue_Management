@echo off
REM ---------------------------------------------------------------------------
REM  OPD TV board launcher
REM
REM  Opens the TV board full screen in a browser set up to keep updating with
REM  nobody touching it. Double-click it on the PC that drives the TV, or pass
REM  the board's address:
REM
REM      start-tv-display.bat "http://192.168.1.50:3000/tv"
REM
REM  Press Alt+F4 to close the board.
REM ---------------------------------------------------------------------------
setlocal

set "TV_URL=%~1"
if "%TV_URL%"=="" set "TV_URL=http://localhost:3000/tv"

REM scheme://host:port of the address, e.g. http://192.168.1.50:3000
for /f "tokens=1,2 delims=/" %%a in ("%TV_URL%") do set "TV_ORIGIN=%%a//%%b"

REM Prefer Chrome, fall back to Edge (always present on Windows 10/11).
set "BROWSER="
for %%p in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist %%p set "BROWSER=%%~p"

if not defined BROWSER (
  echo Could not find Chrome or Edge on this PC.
  pause
  exit /b 1
)

REM Never let the display or the PC sleep while plugged in. A sleeping display
REM makes Windows report the board as hidden, and the browser then slows it down.
powercfg /change monitor-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-ac 0 >nul 2>&1

REM Flags:
REM  --user-data-dir          separate profile, so these flags apply even when the
REM                           browser is already open for other work on this PC
REM  --disable-backgrounding-occluded-windows, CalculateNativeWinOcclusion
REM                           a covered window is not treated as hidden
REM  --disable-background-timer-throttling, --disable-renderer-backgrounding,
REM  IntensiveWakeUpThrottling
REM                           keep timers and the page at full speed in the background
REM  --autoplay-policy        announcements play without someone clicking first
REM  --unsafely-treat-insecure-origin-as-secure
REM                           lets the board keep the screen awake when it is
REM                           opened by LAN IP over plain http
start "" "%BROWSER%" ^
  --kiosk "%TV_URL%" ^
  --user-data-dir="%LocalAppData%\OPD-TV-Browser" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-background-timer-throttling ^
  --disable-renderer-backgrounding ^
  --disable-backgrounding-occluded-windows ^
  --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling ^
  --autoplay-policy=no-user-gesture-required ^
  --unsafely-treat-insecure-origin-as-secure=%TV_ORIGIN%

endlocal
