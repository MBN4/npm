# NMP Architecture Document

## Overview
NAVEED MEDICAL PHARMACY (NMP) is engineered as an offline-first, local-LAN-ready client-server pharmacy system.

### Tech Stack
- **Server**: Node.js v22 with Express and TypeScript.
- **Database**: SQLite3 via `better-sqlite3` configured with:
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for concurrent reads & writes)
  - `PRAGMA foreign_keys = ON;` (Strict referential integrity)
  - `PRAGMA busy_timeout = 5000;` (Handles concurrent counter transactions gracefully)
  - Atomic transactions using `db.transaction()`
- **Frontend**: Vite + React 18 + TypeScript + Vanilla CSS modern design system.
  - Dark & Light mode support.
  - Desktop-first responsive POS counter layout.
  - Keyboard-driven hotkeys (F1–F12, Enter, Escape, Arrow keys).
  - Print styles optimized for 80mm & 58mm ESC/POS thermal printers as well as A4/A5 invoices.
- **Network / Multi-PC**:
  - Main Server binds to `0.0.0.0:5000`.
  - Secondary pharmacy billing counters connect to `http://<server-ip>:5000` via browser or PWA.
