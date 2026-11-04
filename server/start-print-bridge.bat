@echo off
REM Starts ONLY the background printer bridge for the live cloud site (nmp-api.fly.dev) -
REM this is NOT the offline-backup instance (that's local-fallback\start-local-fallback.bat,
REM a separate full local copy of the app with its own database).
REM
REM This bridges the USB-attached Speed-X / SPEED-X thermal printer on THIS PC to the live
REM website: when a cashier clicks "Auto-Print Receipt" on the normal live site (on any
REM computer, not just this one), it reaches this PC over the internet and prints here.
REM
REM Safe to leave running in the background permanently, including minimized. Put a shortcut
REM to this file in your Windows Startup folder (Win+R, type: shell:startup) so it starts
REM automatically every time this PC turns on - you never need to run anything by hand again.

cd /d "%~dp0"

set PORT=5055
set HOST=127.0.0.1
set NODE_ENV=production

echo Starting NMP print bridge (connects this PC's printer to the live website)...
echo Keep this window open (or minimized). Closing it stops live-site auto-printing on this PC.
echo.

node dist\index.js

pause
