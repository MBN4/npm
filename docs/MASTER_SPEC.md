# NAVEED MEDICAL PHARMACY (NMP) — MASTER SPECIFICATION

## Purpose
This document is the authoritative master specification for building NMP as a production-ready pharmacy management system.

## 0. Role & Mission
Complete, maintainable, secure, tested Pharmacy Management System containing:
- Pharmacy POS
- Medicine Master
- Batch-wise inventory with FEFO stock handling
- Purchases & Suppliers
- Expiry management
- Customer/patient CRM
- Prescription management (Rx)
- Accounts and ledgers
- Business & financial reports
- Staff / roles / permissions / audit logging
- Backup / restore
- Multi-PC synchronization & offline capabilities
- AI-assisted demand forecasting & drug-information assistant with strict safety boundaries
- Barcode / thermal printing & Excel import/export
- Notification center & real-time operational dashboard

## 1. Non-Negotiable Development Rules
- Build the actual system, not a mockup.
- Work in phases with automated testing, manual workflow testing, and documentation updates at each step.
- Token/context survival is mandatory: Maintain the `/docs/` directory as living documentation.
- Continuation/Handoff protocol must be updated at every session.

## 2. Invariants
- Negative stock is prohibited unless explicitly configured.
- Expired stock cannot be sold (server-side block).
- FEFO (First Expiry, First Out) must be strictly applied.
- All transactional operations must run in atomic database transactions (`BEGIN IMMEDIATE ... COMMIT`).
- Comprehensive audit trails for all operations.
