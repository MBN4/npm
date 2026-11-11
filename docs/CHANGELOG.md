# NMP Changelog & Release Notes

All notable changes and architectural deliverables for **Naveed Medical Pharmacy (NMP)** are documented below.

## 2026-11-11 (follow-up 2) — cleaner matching on OCR text, junk cleanup script

- **OCR-glued names are split before matching:** `260GAVISCONLIQUID 120ML` → `GAVISCON LIQUID`, so it now links
  to catalog `GAVISCON 120 mL` (only ALL-CAPS tokens with long dosage-form words are split, so brands
  like "ANGEL GEL" are untouched). The item code is no longer read as a strength ("260G" → 260g).
- **One answer for repeated products:** choosing the medicine for one line applies it to every other
  unanswered line with the same product name (e.g. HIGH-C batch Y1975 and its bonus line Y1961).
- **Gemini reads the photo when Groq can't:** if the Groq key has no vision model and `GEMINI_API_KEY` is
  also set, Gemini reads the photo and Groq is still used for OCR text.
- **`server/src/scripts/cleanupInvoiceJunk.ts`:** lists the suppliers and medicines that the old scanner
  created automatically (dry run by default) and, with `--apply`, deactivates the ones with no stock or
  history. Nothing is deleted. Records with stock/history are listed for manual review.

## 2026-11-11 (follow-up) — Groq model auto-selection, bonus-only lines

- **Groq model names are no longer hard-coded.** A local test showed both default models returning
  `404 model_not_found` for the configured key, so every scan fell back to the basic reader. The server now
  asks Groq (`GET /openai/v1/models`) which models the key can use, prefers a vision model for photos and a
  strong text model for OCR text, and tries the next one if a model is missing. `GROQ_VISION_MODEL` /
  `GROQ_TEXT_MODEL` still take priority when they are available. The available list is logged once per 30 minutes.
- **The review banner now says why the AI was not used** (key rejected, usage limit reached, no usable model, timeout).
- **Bonus-only invoice lines** (e.g. Babar Medicine: HIGH-C batch Y1961, Qty blank, Bonus 1) are kept as 0 paid
  boxes + bonus boxes, instead of being treated as missing quantity. Previously a 0-box line also defaulted to 1 paid box on save.
- **Sachet/single-unit packs printed as `1X10'S`** are read as 10 units per box.

## 2026-11-11 — AI Stock Inward: reads correctly, asks instead of guessing

A scanned Paaris Distributors invoice with one item (Clobevate Cream, batch AX2K) was entered as 9
lines such as "Sale Order #1393635", "DSS Id : 0051722" and "EE sihid THR Plot No. 36 Street", with
made-up batch numbers (`BN-9104`) and expiries (scan date + 1 year), and those lines were added to the
medicine catalog as new products.

- **Scanning no longer writes to the database.** The old reader created suppliers and medicines while
  extracting, before anyone reviewed them. Extraction now returns a review draft only; new suppliers and
  medicines are created when the admin saves, in the same transaction as the stock.
- **Reads the photo with a vision model.** With `GROQ_API_KEY` set, the invoice image goes straight to
  Groq's vision model (`meta-llama/llama-4-scout-17b-16e-instruct`, configurable) instead of noisy OCR
  text. OCR + `llama-3.3-70b-versatile` remains the fallback, then the local parser. Gemini works the same way.
  The screen shows which method was used.
- **Prompt rewritten for Pakistani distributor invoices.** Items are only the product-table rows; header
  fields (Invoice #, Sale Order #, DSS Id, Booking Man, Due Date, NTN, License...) and totals are excluded,
  and unreadable values must be null.
- **Header/footer filter + "ignored lines" list** as a second line of defence, visible to the admin.
- **Catalog matching rewritten.** Item codes and pack tokens are stripped (`007/Clobevate Cream 1x20G 20gm`
  → `Clobevate Cream`), names are scored on brand word, full-name coverage, strength and dosage form, with one-letter OCR
  tolerance. A line is pre-linked only for a clear match; otherwise the admin picks from ranked candidates,
  adds a new medicine, or removes the line. The old matcher linked any token overlap.
- **Questions for the admin:** unknown supplier, unclear medicine, boxes vs single units for single-unit
  products, strip split for `100'S`-style packs, batch already in stock with a different expiry, item-count
  and total mismatches, and an invoice that was already entered. Required questions block saving.
- **Never invents data:** no fake batch numbers, expiries, invoice numbers or 10×10 packing. Missing values
  are shown as problems on the line until the admin fills them in.
- **Saving into inventory is stricter (server-enforced):** same medicine + same batch adds to the existing
  batch; a different batch creates a separate batch; the same batch with a different expiry is refused
  unless confirmed; the same supplier invoice cannot be posted twice; expired stock is refused; a
  `requestKey` prevents a double click posting twice. The response reports new vs topped-up batches.
- **Purchase form:** new Bonus (boxes) column, Advance Tax / Other Charges field (pre-filled with the WHT
  difference so the supplier balance matches the printed net total), errors shown inside the form, MRP
  required, and a warning when MRP is below cost.
- **New medicines get correct packing:** `pack_size` = units per box and `tablets_per_pack` = units per strip,
  matching how POS reads them. The old auto-creation stored strips-per-box in `pack_size`.
- `ai-status` now reports the active provider (Groq or Gemini).

## 2026-11-05 — Receipt Printing Overhaul

A field report of garbled, misaligned thermal receipts on the live site traced back to several
independent bugs across both the direct-hardware ESC/POS engine and the browser-print fallback
path. See `docs/ADMIN_GUIDE.md` §8.1 for the new print-bridge setup this depends on.

- **Fixed column alignment on real hardware**: the ESC/POS engine assumed a hardcoded 44-char
  line width that matched neither 80mm (48 chars) nor 58mm (32 chars) paper, so lines wrapped
  mid-word/mid-number on the printer's real line. Line width is now derived from the configured
  paper width, overflowing text word-wraps properly, and two-column rows that don't fit stack
  into a label line + a right-aligned value line instead of overflowing.
- **Fixed the paper-width setting being silently ignored**: the settings lookup never selected
  `printer_*` keys, so `printer_paper_width` from Settings had no effect on the print engine -
  it always rendered as if on 80mm paper.
- **Fixed printer auto-detection failing on real units**: direct-print printer matching only
  widened its search to generic thermal/POS discovery when no printer name was given at all; in
  practice every caller hardcodes a guessed name ("Speed-X 400UL"), so a unit installed under a
  different model name (e.g. "SPEED-X 300U") never matched and silently fell back to the browser
  dialog every time.
- **Fixed a false "printed successfully" report**: the cloud print relay assumed success when the
  local print agent didn't acknowledge a job within 3.5 seconds, instead of reporting failure -
  this masked real failures (e.g. the agent running on a machine with no matching printer
  attached) and skipped the fallback entirely, so nothing printed at all while the UI said it had.
- **Fixed duplicate printing**: a single sale could print two or three times (the
  auto-print-on-checkout trigger racing a manual click, or a slow hardware acknowledgement
  triggering the browser fallback after the direct print already went through). Added a
  short-lived per-invoice guard so a repeat trigger for the same invoice is ignored.
- **Fixed non-functional QR codes and barcodes**: `Barcode128` and `SimpleQRCodeSVG` (used by every
  browser-rendered receipt) never actually encoded anything - both just hashed the invoice number
  into a random-looking but meaningless pattern of SVG rectangles. No scanner could ever read
  them. Replaced with real `jsbarcode` (Code 128) and `qrcode` (QR) rendering. (The direct-hardware
  path already used a real barcode library server-side and was unaffected.)
- **Unified receipt content across all three independent renderers**: the checkout receipt
  (`PosView`), the cash-memo popup (`CashMemoModal`), and the reprint slip (`BillHistoryView`)
  each had their own separate copy of the thermal-receipt markup, which had drifted out of sync
  with the ESC/POS engine's format. All three now show the same header, per-item batch/expiry,
  a Total Line Items / Total Units row, the Clinical Advisory & Storage and Store Return Policy
  sections, and matching footer wording.
- **Added `server/start-print-bridge.bat`**: a standalone script that runs only the printer
  bridge (not the full local-fallback offline instance) so a PC with a USB thermal printer
  attached can serve direct hardware prints to the live cloud site with a single Windows Startup
  shortcut and no further manual steps.

## Unreleased local changes — 2026-09-22

- **Patients & prescriptions:** Existing patient profiles can be edited from Patients & CRM or beside the selected patient in an Rx (with patient management permission) without changing their ID or financial history. Name, mobile, age, gender, allergy notes, and credit limit can be corrected in CRM; optional fields can be cleared. A new patient can also be registered and selected while writing a prescription.
- **Medicine catalog & inventory:** Imported the 30 medicines from `New_Rack_Medicines_List.pdf` into Medicines Master as catalog entries only. No stock quantity, price, or expiry was invented. Inventory batch editing now corrects medicine names and product details (including custom categories, therapeutic class, generic, manufacturer, strength, barcode, packaging, reorder levels, and notes) as well as batch fields. Product edits apply to every batch of the medicine; stock quantity changes use the audited Adjust action.
- **Udhaar:** Added ways to record additional credit and reduce the outstanding balance through payments or adjustments; amounts use `Rs.`.
- **Printing:** MedPrac slips use the POS Speed-X direct printer path on the Windows POS computer and fall back to the thermal browser print dialog when direct access is unavailable.
- **Dropdowns:** Main Category and Therapeutic Class menus in medicine forms render below their fields inside scrolling dialogs. Native select arrows have a consistent appearance across tabs.
- **Delivery status:** These changes are committed locally. GitHub push is pending because this computer has no credentials for the HTTPS remote; other devices will not receive the new code through Git until push and pull succeed. SQLite data also requires an explicit export/import or a shared server.

---

## [1.1.0] - 2026-09-19 — Store Balance & Day-End Closing Settlement Release

### Store Cash Balance & Settlement System
- **`daily_closings` Database Engine**: Created structured schema with `closing_date` constraint (`YYYY-MM-DD`), opening cash balance, cash sales breakdown, customer recoveries, supplier payouts, operating expenses, expected drawer cash, actual counted cash, overage (+)/shortage (-) variance tracking, notes, and closing audit timestamp.
- **`+ Add Money (Cash In)` Modal**: Enables manual cash float additions and owner investments with detailed transaction notes saved in `cashbook_entries`.
- **`- Subtract Money (Cash Out)` Modal**: Enables recording operating expenses, vendor payouts, and petty cash withdrawals with payee names and detailed description fields saved in DB.
- **Day-End Shift Closing Settlement Wizard**: Calculates expected drawer cash based on liquid register flow, allows cashiers/admins to input physical drawer count, automatically calculates cash variance (+ overage / - shortage), records variance adjustment in cashbook, and seals shift closing.
- **Thermal & PDF Printable Closing Receipts**: Formatted settlement receipt preview supporting 80mm ESC/POS thermal printers and A4 PDF export with itemized register breakdown and variance badge.
- **Historical Settlement Log**: Tabbed historical closing log table with date filters and instant receipt re-printing.
- **UI & Navigation Integration**: Added `Balance & Day-End 💰` tab in primary navigation sidebar and Accounts dashboard.
- **Automated Test Coverage**: Updated vitest suite covering cash inflows (+), cash outflows (-), and Day-End settlements, maintaining 100% test pass rate across 70 tests in 12 test files.

---

## [1.0.0] - 2026-09-07 — Official Production Release

### Architecture & Database (Phases 0 & 1)
- Initialized SQLite 3.44+ engine with Write-Ahead Logging (`WAL`), `foreign_keys = ON`, and `busy_timeout = 5000`.
- Implemented `runTransaction` atomic wrapper guaranteeing multi-table ACID transactions.
- Created complete relational schema: 18+ tables including `roles`, `permissions`, `users`, `medicines`, `batches`, `stock_movements`, `suppliers`, `purchases`, `sales`, `sale_items`, `customers`, `prescriptions`, `accounts_cashbook`, and `audit_logs`.
- Implemented JWT authentication with instant revocation on user deactivation.
- Granular Role-Based Access Control (RBAC) with permissions for Admin, Pharmacist, and Cashier.

### Medicine Master & Inventory (Phase 2)
- Added comprehensive medicine master catalog with generic molecules, therapeutic classes, dosage forms, and shelf rack locations.
- Integrated batch ledger with real-time remaining quantities and unit cost tracking.
- Implemented barcode lookups for both standard retail barcodes (EAN-13 / UPC) and custom internal barcodes.

### Suppliers & Purchasing (Phase 3)
- Multi-line inward purchase invoice recording with automatic batch generation.
- Dynamic supplier payables tracking and historical payment ledger.

### POS & Sales Counter (Phase 4)
- High-performance barcode scanner integration and real-time medicine search.
- First-Expiry-First-Out (FEFO) automatic batch allocation algorithm.
- Server-side hard validation preventing sales of expired medications.
- Held bills parking and restoration queue (`F4` hold, recall modal).
- Multiple payment modes (Cash, Card, Credit/Udhar).
- Instant change calculation and thermal receipt generation.

### Customer CRM & Prescriptions (Phase 5)
- Patient health records with allergy warnings and contact details.
- Customer debt ledger tracking with partial and full debt recovery payment recording.
- Doctor prescription archive with direct one-click dispensing into POS cart.

### Expiry Control & Notifications (Phase 6)
- Multi-horizon expiry tracking dashboard (180, 90, 60, 30, and 7-day windows).
- Batch disposal write-off engine with reasons (Expired, Damaged, Recalled).
- Supplier return claim vouchers.

### Financial Accounts & Cashbook (Phase 7)
- Double-entry cashbook ledger tracking cash inflows and outflows.
- Real-time operating expense categorization.
- Comprehensive Profit & Loss (P&L) statement featuring exact Cost of Goods Sold (COGS) snapshots taken at moment of sale.

### Reports & Business Intelligence (Phase 8)
- Real-time sales analytics, payment method distribution, and revenue trends.
- Cashier performance audits and basket size analytics.
- Inventory valuation calculated on both Cost Basis and Retail MRP Basis.
- Dead stock & slow-moving capital report.
- Customer credit aging breakdown (0–30d, 31–60d, 61+d).
- Universal CSV data export.

### Demand Forecasting Intelligence (Phase 9)
- Sliding lookback Average Daily Consumption (ADC).
- Days of Stock Remaining (DOS) metric.
- Dynamic Reorder Point (ROP) with supplier lead-time buffers.
- Pack-size rounded automated Purchase Order generator.

### Drug AI & Clinical Safety Assistant (Phase 10)
- Multi-drug interaction checker (DDI) with severity ratings and clinical guidance.
- Duplicate therapeutic class detection.
- Patient allergy cross-matching against active ingredients.
- FDA pregnancy & lactation risk category lookup.
- Verified monographs and in-stock generic bioequivalent brand suggestions.

### Hardware Integrations & Bulk Data (Phase 11)
- ESC/POS thermal receipt hex generator supporting 80mm and 58mm paper rolls.
- Cash drawer kick pulse (`\x1B\x70\x00\x19\xFA`) and auto-cutter trigger (`\x1D\x56\x41\x00`).
- Interactive barcode label sticker generator with printable grid layouts and SVG Code 128 barcodes.
- Bulk CSV import engine with column mapping, row validation, and conflict resolution.

### Resilience & Disaster Recovery (Phase 12)
- Native online hot SQLite backup snapshot engine (`db.backup()`).
- Automated PRAGMA integrity verification (`PRAGMA integrity_check`).
- Snapshot download, listing, and storage metrics in the Admin Portal.

### Security Hardening & Release Verification (Phases 13 & 14)
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`).
- Rate limiting protection on `/api/auth/login` preventing brute-force credential attacks.
- 100% test pass rate: 63 automated integration tests across 12 test suites.
- Production-ready Vite client build.
- Complete operational documentation: User Guide, Admin Manual, Disaster Recovery Runbook, and API Reference.
