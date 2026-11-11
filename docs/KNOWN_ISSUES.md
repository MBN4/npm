# NMP Known Issues & Limitations

## Current limitations — 2026-11-11

- **AI Stock Inward needs a server-side key:** set `GROQ_API_KEY` (or `GEMINI_API_KEY`) on the server (Fly secret for the live site). Without it, or when the AI call fails, a basic local reader is used and the review screen says so in yellow. The AI vision model can still misread a blurred or folded photo, which is why every line is shown for review and batch/expiry are never invented.
- **Junk records from the old scanner:** before 2026-11-11 the scanner added suppliers and medicines automatically while reading an invoice (e.g. medicines named "Sale Order #…", "DSS Id : …", "EE sihid THR Plot No. 36 Street" and a supplier like "fe) - A ARIS Paaris Distributors - Lahore"). The new code no longer does this, but rows already created on the live database remain and show up as choices on the review screen. Run the cleanup script (dry run first, it only lists): `fly ssh console -a nmp-api -C "node dist/scripts/cleanupInvoiceJunk.js"`, then add `--apply` to deactivate the records with no stock/history. Records with stock are listed for manual review in Inventory.
- **Catalog packing for single-unit products:** many imported creams/syrups have `pack_size = 10` (a carton), while distributors invoice single tubes/bottles. The review screen asks "boxes of 10, or single units?" for these lines; correcting the product's packing in Medicines Master removes the question.

## Earlier limitations — 2026-11-05

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
