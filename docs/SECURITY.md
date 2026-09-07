# NMP Security & Access Control

## Authentication
- Passwords are encrypted using `bcryptjs` with salt rounds = 10.
- Authenticated sessions issue signed JWT tokens containing user ID, username, and role ID.
- Tokens expire in 12 hours (configurable for daily shifts).

## Role-Based Access Control (RBAC)
- **Roles**:
  - `Admin`: Full unrestricted access to all modules, financial P&L, user management, backup/restore, audit logs, and settings.
  - `Pharmacist`: Catalog management, inventory, purchases, POS sales, prescription verification, drug AI consultation, patient CRM.
  - `Cashier`: POS sales, held bills, sales returns (standard), customer search, daily shift cashbook view.
  - `Inventory Staff`: Purchases, batch updates, stock adjustments, expiry checks, barcode printing.

## Audit Logging
- Every destructive or financial transaction (login, sale, return, stock adjustment, purchase, user edit) is logged to `audit_logs` with actor ID, IP address, timestamp, action type, and old/new delta values.
- Ordinary users cannot edit or delete audit logs.
