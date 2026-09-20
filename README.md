# Naveed Medical Pharmacy (NMP) — Enterprise Pharmacy System & POS

[![Test Status](https://img.shields.io/badge/Tests-67%2F67%20Passing%20(100%25)-success)](https://github.com/naveedmedicalpharmacy-ship-it/nmp)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![Database](https://img.shields.io/badge/Database-SQLite%20WAL%20Embedded-orange)](https://www.sqlite.org/)
[![Organization](https://img.shields.io/badge/GitHub-naveedmedicalpharmacy--ship--it-purple)](https://github.com/naveedmedicalpharmacy-ship-it)

A modern, comprehensive pharmacy management platform built specifically for **Naveed Medical Pharmacy (NMP)**. It integrates high-speed point-of-sale counter operations, batch-level FEFO stock tracking, pack & individual tablet pricing, clinical drug monographs, AI assistance with verified pharmacopoeia data separation, an isolated educational practice sandbox (MedPrac), and offline-first sales synchronization.

---

## 🔗 Official Repositories

- **Main Repository**: [https://github.com/naveedmedicalpharmacy-ship-it/nmp](https://github.com/naveedmedicalpharmacy-ship-it/nmp)
- **Mirror Repository**: [https://github.com/MBN4/npm](https://github.com/MBN4/npm)

---

## 🏛️ System Modules (17 Navigation Areas)

| Module | Purpose & Highlights |
| :--- | :--- |
| **1. Dashboard** | Real-time sales, net profit, cash/card/udhar breakdown, low-stock alerts, near-expiry horizons, dead stock metrics, and quick action launchpad. |
| **2. POS / Counter** | Barcode camera scanner & USB wedge input, automatic FEFO batch allocation, held bills queue, credit checkout, and WhatsApp digital receipts. |
| **3. Medicines Master** | Formularies, dosage forms, strengths, pack sizes, shelf/rack coordinates, and custom barcodes. |
| **4. Inventory & Stock** | Batch-wise stock ledger, valuation (Cost vs. MRP), physical count adjustments, and **Manual Medicine & Stock Entry Modal** with pack vs. tablet pricing math and live discount calculation. |
| **5. Purchases (GRN)** | Multi-line inward distributor invoices, automated batch creation, bonus quantities, and purchase returns. |
| **6. Suppliers** | Distributor directory, payment vouchers (Cash/Cheque/Bank Transfer), and payables ledger. |
| **7. Barcode Center** | Scanner Hub (live camera feed & hardware diagnostics) + Multi-column printable Code-128/QR sticker sheets. |
| **8. Pharma Dictionary 📚** | Clinical drug reference monographs, generic active molecules, adult/pediatric doses, FDA pregnancy categories (A/B/C/D/X), and food administration timings. |
| **9. Pharma.AI 🤖** | Clinical safety assistant featuring multi-drug interaction (DDI) checking, pediatric dose calculations, and clear badge separation of verified pharmacopoeia facts from AI suggestions. |
| **10. MedPrac 🧪** | **100% isolated learning sandbox** with custom manual practice quantities, simulated doctor Rx generator, case library, and interactive self-grading dosage quizzes. |
| **11. Prescriptions (Rx)** | Digitized doctor prescriptions, clinical diagnoses, dosage frequencies (OD, BD, TDS), and direct POS cart dispensing. |
| **12. Patients & CRM** | Patient medical profiles, drug allergy tags with checkout alerts, and Udhar credit ledger. |
| **13. Expiry Control** | Configurable expiry windows (180/90/60/30/7 days), hard FEFO blocking of expired stock, disposal write-offs, and distributor return claims. |
| **14. Accounts & Cashbook** | Daily double-entry cashbook (Cash IN / OUT), operating expense vouchers, and live Profit & Loss (P&L) statements. |
| **15. Reports & BI** | Sales velocity, fast/slow moving items, dead stock analysis, cashier audits, and universal CSV export. |
| **16. Staff & Security** | Role-based access control (Admin, Pharmacist, Cashier, Inventory), immutable audit logs, and security OTP authentication. |
| **17. System Settings** | 80mm/58mm thermal receipt printing, ESC/POS hardware controls, bulk CSV imports, and online hot SQLite snapshots. |

---

## 💻 Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Lucide Icons, Vanilla CSS Design System (Light & Dark themes).
- **Backend**: Node.js (LTS v20/v22), Express 5, TypeScript, `better-sqlite3` (WAL Mode, ACID transactions).
- **Embedded Database**: SQLite (self-contained file inside `server/data/nmp.sqlite` — **no MySQL or external SQL server required**).
- **Resilience**: Offline-first queueing engine (`client/src/services/offlineSync.ts`) and SQLite native hot online backup API.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Install **Node.js LTS (v20 or v22)** from [nodejs.org](https://nodejs.org/).

### 2. Install Dependencies
```bash
npm install
npm --prefix server install
npm --prefix client install
```

### 3. Initialize / Seed Database
```bash
npm run seed
```

### 4. Start Development Application
```bash
npm run dev
```
- **Web Interface**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

---

## 🔐 Default Login Credentials

| Role | Username | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Full access to all 17 modules & hot backups |
| **Pharmacist** | `pharmacist` | `pharma123` | POS, Prescriptions, Dictionary, Pharma.AI |
| **Billing Cashier** | `cashier` | `cash123` | High-speed POS Counter & Customer CRM |
| **Inventory Store** | `inventory` | `inv123` | Purchases, GRN, Batch adjustments & Expiry |

---

## 🧪 Automated Testing

To run the complete automated test suite (67 unit & integration tests):
```bash
npm test
```

---

## 🔄 Multi-Device Data Sync (Laptop ↔ PC)

SQLite database binary files (`.sqlite`) are kept local to each computer and ignored by `.gitignore`. To sync medicines, categories, generics, clinical info, and batches between your Laptop and PC:

### 1. On Laptop (where data was added):
```bash
npm run db:export
git add .
git commit -m "Add new medicine data"
git push
```
*(Or click **"1. Export Data for Git"** in the Settings tab in the Web App)*

### 2. On PC (to receive the data):
```bash
git pull
npm run db:import
```
*(Or simply start the server with `npm run dev` — it will auto-sync on startup!)*

---

## 🔄 Dual Git Push Configuration

To push code updates to both GitHub repositories simultaneously:
```bash
# Push to both MBN4 and naveedmedicalpharmacy-ship-it repositories
git push origin main
```
To push specifically to the organization repo:
```bash
git push nmp-org main
```

---

## 📚 Living Documentation

Full operational guides and architectural specs are located in the [`/docs/`](./docs) folder:
- [Master Specification](./docs/MASTER_SPEC.md)
- [UI Navigation Map](./docs/UI_MAP.md)
- [Project Roadmap & Status](./docs/PROJECT_STATUS.md)
- [Cashier & Staff User Guide](./docs/USER_GUIDE.md)
- [Administrator & Pharmacist Guide](./docs/ADMIN_GUIDE.md)
- [Disaster Recovery & Backup Runbook](./docs/RECOVERY_GUIDE.md)
- [API Reference](./docs/API.md)
