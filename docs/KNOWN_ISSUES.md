# NMP Known Issues & Limitations

## Current limitations — 2026-11-05

- **Direct hardware printing requires a running print bridge:** the live/cloud site cannot reach
  a USB printer by itself. The PC the printer is physically attached to must run
  `server/start-print-bridge.bat` continuously (set up via a Windows Startup shortcut - see
  `docs/ADMIN_GUIDE.md` §8.1). If that process isn't running, "Auto-Print" still works but
  silently falls back to the browser's own print dialog, which prints visibly fainter and with a
  smaller logo/QR/barcode than the direct ESC/POS engine.
- **`better-sqlite3` requires a native compiler on first install:** a PC without Visual Studio's
  "Desktop development with C++" workload will fail `npm install` on `better-sqlite3` specifically.
  `docs/ADMIN_GUIDE.md` §8.1 documents a workaround (copying a prebuilt `node_modules/better-sqlite3`
  folder from another Windows PC) that avoids installing a compiler at all.
- **Local data:** SQLite files are local and ignored by Git. A code pull does not move patient, stock, or sales records created on another device. Use one shared server or the documented export/import flow where appropriate.
- **Test fixtures:** Focused tests for recent changes pass. Some older whole-suite tests assume the previous seeded medicine catalog and need fixture updates before the full suite can be reported as passing.
