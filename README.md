# Naveed Medical Pharmacy (NMP) — Enterprise Management System & POS

A production-grade, full-stack Pharmacy Management System, POS, Inventory, Accounts, Expiry Tracking, and Clinical Safety Assistant built for retail and hospital pharmacy operations.

---

## Key Modules & Capabilities

- **Point of Sale (POS)**: Real-time barcode scanning, FEFO (First-Expiry-First-Out) automatic batch allocation, held bills queue, server-side hard block on expired medications, and cash/card/credit (udhar) settlement.
- **Medicine Master & Inventory**: Dosage forms, brand catalog, generic molecules, shelf rack coordinates, EAN-13 barcodes, and batch ledger.
- **Suppliers & Purchases**: Inward purchase orders (GRN), multi-line intake, and dynamic supplier payables.
- **Customer CRM & Rx**: Patient profiles, allergy alert tags, credit balance (udhar) tracking with recovery payment vouchers, and doctor prescription archive.
- **Expiry Control & Write-offs**: Multi-horizon dashboard (180/90/60/30/7d), batch disposal write-off engine, and vendor return claims.
- **Financial Accounts & Cashbook**: Double-entry cashbook ledger, daily register closeout, and accurate P&L with historical COGS snapshots.
- **Reports & Business Intelligence**: Revenue trends, cashier performance, inventory valuation (cost vs retail basis), dead stock analysis, customer udhar aging, and universal CSV exports.
- **Demand Forecasting Engine**: Average Daily Consumption (ADC), Days of Stock Remaining (DOS), dynamic Reorder Points (ROP), and automated box-rounded Purchase Order generator.
- **Drug AI & Safety Assistant**: Multi-drug interaction checker (DDI), duplicate therapy warnings, patient allergy cross-matching, FDA pregnancy risk categories, and in-stock generic substitution.
- **Hardware Integrations**: ESC/POS 80mm & 58mm thermal receipt printing, cash drawer kick pulse, auto-cut, and printable barcode shelf sticker sheet generator.
- **Database Resilience**: SQLite 3.44+ in WAL mode with online hot backup snapshots (`db.backup()`) and `PRAGMA integrity_check`.

---

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Lucide Icons, Vanilla CSS Design System (Light/Dark mode).
- **Backend**: Node.js, Express, TypeScript, better-sqlite3 (WAL Mode, ACID transactions).
- **Security**: JWT authentication, RBAC (Admin, Pharmacist, Cashier), brute-force rate limiter, security headers, and comprehensive audit trail.

---

## Quickstart

### 1. Install Dependencies
```bash
# Root & sub-packages
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Seed Database
```bash
cd server
npm run seed
```

### 3. Run Development Servers
```bash
# Backend (Port 5000)
cd server
npm run dev

# Frontend (Port 5173)
cd client
npm run dev
```

### 4. Run Automated Tests
```bash
cd server
npm test
```

### Default Credentials
- **Admin**: `admin` / `admin123`
- **Pharmacist**: `pharmacist` / `pharma123`
- **Cashier**: `cashier` / `cashier123`

---

## Documentation

Full operational and architectural documentation is maintained in the [`/docs/`](./docs) directory:
- [Project Status](./docs/PROJECT_STATUS.md)
- [Cashier & Staff User Guide](./docs/USER_GUIDE.md)
- [Admin & Pharmacist Guide](./docs/ADMIN_GUIDE.md)
- [Disaster Recovery & Backup Runbook](./docs/RECOVERY_GUIDE.md)
- [API Reference](./docs/API.md)
- [Release Changelog](./docs/CHANGELOG.md)
