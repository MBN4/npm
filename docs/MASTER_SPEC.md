# NAVEED MEDICAL PHARMACY (NMP) — MASTER SPECIFICATION

## Purpose
This document is the authoritative master specification for building NMP as a production-ready pharmacy management system.

## 0. Role & Mission
Complete, maintainable, secure, tested Pharmacy Management System containing:
- Pharmacy POS (with camera & hardware barcode scanning, FEFO, WhatsApp receipts, and offline mode)
- Medicine Master & Generic Dictionary
- Batch-wise inventory with FEFO stock handling & disposal registers
- Purchases & Suppliers with full ledgers
- Dedicated Barcode Center (Scanner Hub & Label/QR Generator)
- Pharma Dictionary 📚 (Comprehensive clinical monographs, pediatric/adult doses, food timing)
- Pharma.AI 🤖 (Dedicated clinical AI assistant with verified DB boundaries)
- MedPrac 🧪 (100% isolated sandbox for prescription practice, custom test quantities, and quizzes)
- Customer/patient CRM & Rx prescription management
- Accounts, daily cashbook, and P&L statements
- Business & financial reports (20+ analytical reports with multi-format export)
- Staff / roles / permissions / audit logging
- Online hot backup / restore and disaster recovery
- Offline-first resilience & automatic sync engine
- Real-time notification center & global search

## 1. Navigation Menu Hierarchy
`Dashboard | POS | Medicines | Inventory | Purchases | Suppliers | Barcode | Pharma Dictionary | Pharma.AI 🤖 | MedPrac | Rx | Patients | Expiry | Accounts | Reports | Staff | Settings`

## 2. Non-Negotiable Development Rules
- Build the actual system, not a mockup.
- Work in phases with automated testing, manual workflow testing, and documentation updates at each step.
- Token/context survival is mandatory: Maintain the `/docs/` directory as living documentation.
- Continuation/Handoff protocol must be updated at every session.

## 3. Invariants
- Negative stock is prohibited unless explicitly configured.
- Expired stock cannot be sold (server-side hard block).
- FEFO (First Expiry, First Out) must be strictly applied.
- All transactional operations must run in atomic database transactions (`BEGIN IMMEDIATE ... COMMIT`).
- Comprehensive audit trails for all operations.
- MedPrac entries MUST be 100% isolated and NEVER mutate actual inventory, sales, accounts, or patient histories.
- Pharma.AI outputs must clearly distinguish verified database information from AI-generated explanations.
