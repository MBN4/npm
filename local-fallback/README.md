# NMP Offline Backup (Local Fallback)

This is a second, independent copy of the pharmacy system that runs entirely on this
Windows PC, with its own local database. Use it **only** when the regular cloud
system (the normal website you use every day) is unreachable - internet down, or a
cloud maintenance window.

It is not a live mirror of the cloud system. It starts out with whatever data was
last pulled down from the cloud (medicines, patients, pricing, etc. - see "Keeping it
up to date" below), and anything you do on it while the cloud is down (sales, new
patients, purchases) stays local until you deliberately bring it back into the cloud
system afterwards. **Never use both systems for live sales/dispensing at the same
time** - that's how duplicate invoices or wrong stock counts happen.

## One-time setup (do this once, on this PC)

1. **Install Node.js.** Download the LTS installer from https://nodejs.org and run it
   with default options. (If you're not sure whether it's already installed, open
   Command Prompt and type `node --version` - if you see a version number, skip this
   step.)

2. **Get the app onto this PC.** Copy the whole project folder here (the same one
   that's deployed to Vercel/Fly.io), or `git clone` it if Git is set up on this PC.

3. **Install dependencies and build**, open Command Prompt in the project folder and run:
   ```
   cd server
   npm install
   npm run build
   cd ../client
   npm install
   npm run build
   cd ..
   ```

4. **Create a login for this local instance.** Still in the project folder:
   ```
   cd server
   set DB_PATH=./data/nmp-local-fallback.sqlite
   npm run seed
   ```
   This creates a default admin login (check `server/src/db/seed.ts` for the exact
   username/password it creates, or ask whoever set this up) in the local-only
   database. Change this password the first time you log into the backup instance.

   This default login is separate from your real staff logins on the cloud system.
   Stage 2 (catalog sync, not built yet) will bring your real patient/medicine data
   and eventually real staff accounts into this local copy automatically - until
   then, this backup instance only has whatever you manually add to it.

5. **Change the local secret.** Open `local-fallback\start-local-fallback.bat` in
   Notepad and replace `change_this_to_a_random_local_secret` with any random string
   of your own (doesn't need to be memorable, just different from the placeholder).

6. **Make it start automatically.** Press Win+R, type `shell:startup`, press Enter -
   this opens your Windows Startup folder. Create a shortcut to
   `local-fallback\start-local-fallback.bat` inside that folder. From now on, the
   backup instance quietly starts in the background every time this PC turns on -
   you don't need to do anything when an outage happens, it's already running.

7. **Test it now, while everything is working**, so you're not learning this during
   a real outage:
   - Double-click `start-local-fallback.bat` (or restart the PC to confirm the
     Startup shortcut works).
   - A black window should appear saying `Running on: http://127.0.0.1:5050`.
   - Open a browser and go to `http://127.0.0.1:5050` - you should see the same
     login screen as the normal system.
   - Log in with the login you created in step 4.
   - Bookmark this address, or put a desktop shortcut to it labeled something like
     "NMP (Backup - No Internet)", so staff can find it fast under pressure.

## During an outage

1. Open `http://127.0.0.1:5050` in a browser on this PC (it should already be
   running in the background - see step 6 above).
2. Use it exactly like the normal system for billing, patient lookup, dispensing.
3. Everything you do is saved locally on this PC only, for now.

## After the outage ends

Do **not** try to manually copy/merge the local database file into the cloud
system - that's exactly the kind of error-prone step this setup is meant to avoid.
Stage 3 (not built yet) will add a proper "Review and send to cloud" screen that
lists everything done locally during the outage and lets you approve sending each
record to the cloud system through its normal, validated process - so a staff
member can check it before anything is finalized, and nothing gets double-counted
or double-billed.

Until Stage 3 exists: keep a simple paper note of what was sold/dispensed locally
during the outage, and re-enter it into the cloud system by hand once it's back,
the same way you would with any manual fallback.

## Current limitations (being worked on)

- No automatic data sync yet (Stage 2) - this local copy won't have today's new
  patients/medicines/prices unless manually kept up to date.
- No reconciliation screen yet (Stage 3) - outage-time sales/patients must be
  re-entered into the cloud system by hand afterward.
- Separate login from the cloud system until Stage 2 lands.
