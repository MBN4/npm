# Naveed Medical Pharmacy (NMP) — Administrator & Pharmacist Guide

This guide covers system administration, inventory controls, purchasing workflows, financial oversight, demand forecasting, hardware configuration, and staff management for **Naveed Medical Pharmacy (NMP)**.

---

## 1. System Administration & Access Control

### User Management & Roles
Navigate to **Users & Roles**:
- **Admin**: Full system authority, financial closeouts, backup snapshots, system settings, staff management.
- **Pharmacist**: Inventory master control, purchase orders, supplier management, batch write-offs, clinical validation.
- **Cashier**: POS billing, customer registration, cashbook receipt entries, held bill parking.

### Adding & Deactivating Staff Accounts
1. Click **Add User**, enter username, full name, phone, email, and temporary password.
2. Select role assignment.
3. To revoke staff access immediately, toggle **Active Status** to *Inactive*. Active JWT tokens for deactivated accounts are invalidated on subsequent requests.

### Audit Trail Inspection
- Navigate to **Audit Logs** to view immutable event logs (timestamp, user, action, entity affected, old values, new values, IP address).
- All sensitive operations—such as batch adjustments, supplier payment records, system setting modifications, and database backup downloads—are permanently audited.

---

## 2. Medicine Master & Batch Inventory

### Managing Medicine Master Catalog
- Navigate to **Medicines**:
- Click **Add Medicine** to define:
  - Brand Name, Generic Molecule, Therapeutic Category, Manufacturer.
  - Strength, Dosage Form (Tablet, Capsule, Syrup, Injection, Cream, Drops, Inhaler).
  - Pack Size (units per box/pack), Primary EAN Barcode, Shelf Rack Location (e.g. Rack A-4).
  - Min Stock Warning Level and Dynamic Reorder Point.

### Batch Ledger & Stock Movements
- Each inward stock shipment is tracked as an individual **Batch** with its own:
  - Batch Number, Manufacturing Date, Expiry Date, Purchase Rate, MRP / Sale Price, Initial & Remaining Quantity.
- Stock movements (INWARD, SALE, RETURN, ADJUSTMENT, WRITE_OFF) are recorded in the ledger with audit references.

---

## 3. Supplier Management & Inward Purchasing (GRN)

### Registering Suppliers
- Navigate to **Suppliers**:
- Record Supplier/Distributor Company Name, Contact Representative, Mobile, Physical Address, NTN / STRN tax registration.
- View outstanding supplier payables balance and historical payment vouchers.

### Inward Purchase Invoices
1. Navigate to **Purchases > New Purchase Invoice**.
2. Select the Supplier and enter the distributor's physical invoice number.
3. Add line items: Medicine, Batch Number, Expiry Date, Boxes, Bonus boxes, packing (strips per box × units per strip), Cost price, and Retail MRP.
4. The system validates that the expiry date is after the purchase date and that the same supplier invoice number has not been saved before.
5. Save the invoice. In one transaction the system adds the stock, logs inward stock movements, and updates the supplier's balance in the accounts ledger.

**How stock is added**
- Same medicine + **same batch number** → the quantity is added to that existing batch (no duplicate row). If the invoice expiry differs from the batch already in stock, saving is refused until you confirm which expiry is correct.
- Same medicine + **different batch number** → a new, separate batch under the same medicine, so FEFO sells the earlier expiry first.
- Expired stock, a line with no medicine, and a repeated invoice number are rejected by the server.

### AI Stock Inward (scan an invoice photo)
1. Click **AI Stock Inward** in Purchases and take/upload a clear, flat photo (or PDF) of the distributor invoice.
2. The server reads it with the configured AI (Groq first, then Gemini; see below). A vision model reads the photo directly; if that fails, OCR text is sent to the AI; if no AI is available, a basic local reader is used and the screen says so.
3. **Nothing is created while reading.** No supplier, medicine or batch is added until you press **Save Purchase & Add Stock**.
4. Review the screen:
   - Header lines (Sale Order #, DSS Id, Booking Man, address, NTN, totals...) are ignored and listed under *"line(s) ignored as not medicines"*.
   - **Questions marked "Required"** must be answered before saving: which supplier / medicine an invoice line is, whether to add a new supplier or medicine, whether a quantity is boxes or single units, and which expiry is right when a batch already exists.
   - A medicine is pre-linked only when the match is unambiguous (e.g. invoice `007/Clobevate Cream 1x20G` → catalog `CLOBEVATE 20g`). Otherwise pick it from the list, choose **Add as a new medicine** (name, strength, strips or single units), or remove the line.
   - Batch numbers and expiry dates are copied from the invoice only; if one could not be read it is left empty for you to type. Nothing is made up.
   - Retail MRP is required (it becomes the POS selling price). It is pre-filled from the current selling price only when that is not below cost. A warning appears if MRP is below cost.
   - **Advance Tax / Other Charges** is pre-filled with the small difference between the line totals and the printed net total (e.g. WHT u/s 236H) so the supplier balance matches the invoice.
5. Save. The result message says how many new batches were created, how many existing batches were topped up, and how many new medicines were added.

**Configuring the AI key** (server side only, never in the browser): set `GROQ_API_KEY` (or `GEMINI_API_KEY`) in `server/.env`, or on the cloud server with `fly secrets set GROQ_API_KEY=... -a nmp-api`. The server picks the best Groq model your key can use automatically (the list is printed in the server log as `[invoice-ai] Groq models available to this key: ...`). Optional overrides: `GROQ_VISION_MODEL`, `GROQ_TEXT_MODEL`, `GEMINI_MODEL`. If your Groq key has no vision model, also setting `GEMINI_API_KEY` lets Gemini read the photo while Groq handles OCR text. If the banner shows "Basic local reader", it also shows the reason (key rejected, usage limit, no usable model). `GET /api/purchases/scans/ai-status` shows which provider is active (the key itself is never returned).

---

## 4. Expiry Management & Disposals

- Navigate to **Expiry Control**:
- View categorized batches across multiple time horizons:
  - **Critical (Under 30 Days)**: High priority for promotional clearance or return.
  - **Upcoming (30–90 Days)**: Proactive vendor return window.
  - **Monitoring (90–180 Days)**: Safe shelf stock.
  - **Expired Stock**: Hard-blocked from POS sales counter.
- **Disposal / Write-Off Action**: Click *Write-Off Batch*, specify quantity and reason (Damaged, Expired, Recalled). The system zeros the batch quantity, generates an inventory adjustment movement, and logs the write-off for accounting P&L.
- **Vendor Return Claims**: Generate a Supplier Return voucher to adjust credit from the distributor.

---

## 5. Financial Accounts, Cashbook & Profit / Loss

- Navigate to **Accounts**:
- **Daily Cashbook**: Live tracking of Cash IN (Sales cash tendered, customer credit recovery) and Cash OUT (Petty cash expenses, supplier bill payments).
- **Profit & Loss Statement (P&L)**:
  - Net Sales Revenue (Gross Sales minus Discounts).
  - Cost of Goods Sold (COGS) calculated from batch purchase rates at time of sale.
  - Operating Gross Profit & Gross Margin %.
  - Operating Expenses (Rent, Utilities, Staff Salaries, Disposals).
  - Net Operating Income.

---

## 6. Reports & Business Intelligence (BI)

- Navigate to **Reports**:
- **Sales Analytics**: Daily, weekly, monthly revenue trends and payment method distribution (Cash vs Card vs Credit).
- **Cashier Performance**: Transaction volume, average basket size, and revenue generated per counter operator.
- **Inventory Valuation**: Current stock value evaluated on both Cost Basis and Retail MRP Basis.
- **Dead Stock & Slow Movers**: Identifies medicines with zero sales over 60–90 days to free up trapped capital.
- **Customer Udhar Aging**: Categorizes outstanding customer receivables into 0–30, 31–60, and 61+ days past due.
- **CSV Export**: One-click export for accountants and external tax compliance.

---

## 7. Demand Forecasting & Automated Reordering

- Navigate to **Forecasting**:
- **Average Daily Consumption (ADC)**: Calculated using sliding lookback sales volume.
- **Days of Stock Remaining (DOS)**: Predicts remaining stock duration based on current consumption rates.
- **Dynamic Reorder Point (ROP)**: Accounts for supplier lead time and safety stock buffer.
- **Auto-Generate Purchase Order**: Creates a draft purchase order rounded to whole box/pack sizes for immediate supplier dispatch.

---

## 8. Hardware & Thermal Receipt Configuration

Navigate to **Settings > Thermal Printer & POS**:
- **Paper Roll Width**: Select **80mm Standard** (48 columns) or **58mm Compact** (32 columns).
- **Receipt Header & Footer**: Configure pharmacy trade name, phone numbers, drug sale license (DSL), NTN, and return policy wording.
- **Hardware Triggers**: Toggle ESC/POS auto-cutter command (`\x1D\x56\x41\x00`) and cash drawer kick pulse (`\x1B\x70\x00\x19\xFA`).
- **Barcode Sticker Printing**: Navigate to **Settings > Barcode Label Generator** to generate and print shelf stickers formatted for standard 2-column or 3-column sticker sheets using `window.print()`.

### 8.1 Direct Hardware Printing From the Live (Cloud) Site — the Print Bridge

The live/cloud site (Fly.io + Vercel) has no way to reach a USB thermal printer by itself — a
printer is physically attached to one specific PC, and the cloud backend cannot talk to local
hardware. To get the crisp, full-size ESC/POS receipt (bold text, large logo/QR/barcode) when
billing from the live site, the PC the printer is actually plugged into must run a small
background process — the **print bridge** — which:
- opens a local WebSocket bridge (`ws://127.0.0.1:5001`) so the browser on that same PC can print
  instantly, and
- polls the live site in the background so a cashier on *any* device (another counter, a phone)
  can still trigger a print that comes out on this PC's printer.

**One-time setup, on the PC the printer is physically connected to:**
1. `git clone` this repository there (or keep it updated with `git pull` — it must track `main`,
   not an old feature branch, or it will silently miss printer fixes).
2. `cd server && npm install && npm run build`.
   - If `npm install` fails compiling `better-sqlite3` with a "Visual Studio" / `node-gyp` error,
     either install Visual Studio Build Tools ("Desktop development with C++" workload), **or**
     avoid that entirely: run `npm install --ignore-scripts` instead (skips the native build for
     every package), then copy a working `node_modules/better-sqlite3` folder from another
     Windows PC with the same Node.js version onto this PC, replacing the one that install step
     created. The compiled binary is portable across machines with the same OS/architecture/Node
     version, so no compiler is needed on this PC at all.
3. Press `Win+R` → `shell:startup` → create a shortcut there to `server\start-print-bridge.bat`.
4. Restart the PC once and confirm a small console window appears on its own, showing
   `[localPrinterWs] ... listening on ws://127.0.0.1:5001` and
   `[cloudPrinterRelay] Starting local Speed-X 400UL agent polling: ...`.

**Without this running**, clicking "Auto-Print" on the live site still works — it automatically
falls back to the browser's own print dialog — but that output is visibly fainter and smaller
(logo, QR, barcode) than the direct ESC/POS print, because the browser rasterizes the whole page
as a grayscale image rather than sending native printer commands. If receipts suddenly look
faint/small again after previously printing crisply, the print bridge on that PC has stopped
running (closed terminal, PC restarted without the Startup shortcut set up yet, etc.) — restart it
via the Startup shortcut, or run `server\start-print-bridge.bat` directly.
