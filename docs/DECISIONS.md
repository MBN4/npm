# NMP Architecture Decisions Record (ADR)

## DECISION 001: Backend & Database Engine
- **Decision**: Node.js + TypeScript with Express and `better-sqlite3`.
- **Rationale**: For an on-premise pharmacy system operating across local LAN counters, SQLite with Write-Ahead Logging (WAL) delivers sub-millisecond query performance, zero database management server overhead, zero corruption risk with atomic `BEGIN IMMEDIATE` transactions, and native hot backups.
- **Alternatives Considered**: PostgreSQL (adds heavyweight local service installation, maintenance hurdles for typical pharmacy staff).

## DECISION 002: Frontend Architecture
- **Decision**: Vite + React 18 + TypeScript with custom Vanilla CSS Design System.
- **Rationale**: High performance, instant keyboard responsiveness for POS counters, zero bloated external utility runtime, bespoke dark/light theme, and direct ESC/POS thermal printer layout control.

## DECISION 003: Phased Implementation Protocol
- **Decision**: Strictly phased delivery with automated tests, manual testing walkthroughs, and user approval after each phase before continuing.
