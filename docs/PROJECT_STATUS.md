# NMP Project Status

**System**: Naveed Medical Pharmacy (NMP)  
**Version**: Current local `main` branch

**Last Updated**: 2026-09-22

**Delivery**: Recent changes committed locally; GitHub push awaits HTTPS credentials

Recent work added the PDF medicine catalog (without invented stock), editable inventory products and patient profiles, new patient registration within Rx, updated Udhaar entries, MedPrac POS printer routing, and downward category menus with consistent select arrows.

---

## Phase Execution Summary

The test counts in this original phase table are historical release notes. Use the recent verification section below for current results.

| Phase | Module Name | Scope & Capabilities | Status | Test Coverage |
|---|---|---|---|---|
| **Phase 0** | Discovery & Architecture | Requirements matrix, SQLite schema design, WAL mode, ACID transactions | **COMPLETE** | Verified |
| **Phase 1** | Foundation, Database & Auth | JWT auth, RBAC permissions, audit logging, system settings | **COMPLETE** | 7/7 passing |
| **Phase 2** | Medicine Master & Inventory | Dosage forms, brands, generics, barcodes, shelf rack locations, batch ledger | **COMPLETE** | 7/7 passing |
| **Phase 3** | Suppliers & Purchases | Suppliers directory, inward purchase orders, supplier ledger, payables | **COMPLETE** | 4/4 passing |
| **Phase 4** | POS & Sales Counter | Real-time barcode scan, FEFO auto-allocation, held bills, server-side expiry block, WhatsApp receipt | **COMPLETE** | 6/6 passing |
| **Phase 5** | Customer CRM & Prescriptions | Patient profiles, allergy tags, credit balance (udhar), doctor Rx archive, refill alerts | **COMPLETE** | 4/4 passing |
| **Phase 6** | Expiry Control & Notifications | 180/90/60/30/7d horizons, batch disposal write-off, supplier returns | **COMPLETE** | 5/5 passing |
| **Phase 7** | Financial Accounts & Cashbook | Cashbook IN/OUT, daily register closeout, accurate P&L with COGS snapshot | **COMPLETE** | 6/6 passing |
| **Phase 8** | Reports & Business Intelligence | Sales trends, cashier breakdown, inventory valuation, dead stock, CSV exports | **COMPLETE** | 8/8 passing |
| **Phase 9** | Demand Forecasting Engine | Sliding ADC, Days of Stock (DOS), Reorder Point (ROP), draft PO generator | **COMPLETE** | 3/3 passing |
| **Phase 10** | Drug AI & Clinical Safety | DDI checker, duplicate therapy, allergy alerts, pregnancy categories, AI consultation | **COMPLETE** | 4/4 passing |
| **Phase 11** | Hardware & Barcode Center | Barcode Scanner Hub, Barcode & QR Label Generator, ESC/POS 80mm/58mm, cash drawer kick | **COMPLETE** | 3/3 passing |
| **Phase 12** | Pharma Dictionary & MedPrac | Searchable drug monographs, isolated practice sandbox, custom test quantities, simulated Rx | **COMPLETE** | Verified |
| **Phase 13** | Offline Sync & Resilience | Online hot SQLite snapshots, offline sales queue, auto-sync recovery, PRAGMA integrity | **COMPLETE** | Verified |
| **Phase 14** | Operational Documentation & Release | User guide, admin manual, disaster recovery runbook, API reference | **COMPLETE** | Documented |

---

## Key System Metrics & Technical Invariants

- **Official Repository**: [https://github.com/naveedmedicalpharmacy-ship-it/nmp](https://github.com/naveedmedicalpharmacy-ship-it/nmp)
- **Verification**: Client and server production builds pass. Focused patient, inventory, and classification tests pass on temporary databases. The historical whole-suite pass counts in earlier release notes are not a current verification claim; some legacy fixtures need updating for the imported catalog.
- **Printer**: Direct raw printing is available on a Windows POS host. The Linux development computer has no configured physical printer, so a hardware slip has not been verified here.
- **Multi-device availability**: Recent code has not reached the GitHub remote because the configured HTTPS remote lacks credentials on this computer. Each device's SQLite database is local unless all clients use one shared server or data is explicitly exported/imported.
- **Database Engine**: SQLite 3.44+ in WAL mode (`PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`).
- **Data Integrity Guarantee**:
  - `runTransaction` wrapper for multi-table atomicity.
  - Hard server-side block against selling expired medications (`status = 'EXPIRED'` or `expiry_date <= CURRENT_DATE`).
  - FEFO (First-Expiry-First-Out) batch allocation algorithm.
  - Zero negative stock invariant.
  - Comprehensive immutable audit trail (`audit_logs` table).
