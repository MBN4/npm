# NMP Changelog & Release Notes

All notable changes and architectural deliverables for **Naveed Medical Pharmacy (NMP)** are documented below.

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
