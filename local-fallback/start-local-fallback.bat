@echo off
REM Starts the NMP offline-backup instance on this PC. Safe to leave running in the
REM background at all times - it does nothing unless someone opens its address in a browser.
REM Put a shortcut to this file in your Windows Startup folder (Win+R, type: shell:startup)
REM so it's always ready, even after a reboot, with zero manual steps during an outage.

cd /d "%~dp0\..\server"

set PORT=5050
set HOST=127.0.0.1
set NODE_ENV=production
set JWT_SECRET=change_this_to_a_random_local_secret
set DB_PATH=./data/nmp-local-fallback.sqlite
set SERVE_LOCAL_CLIENT=true

echo Starting NMP offline-backup instance...
echo Once it says "Running on: http://127.0.0.1:5050", open that address in your browser.
echo Keep this window open - closing it stops the backup instance.
echo.

node dist\index.js

pause
