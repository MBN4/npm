# NMP API Documentation

## Base URL
`http://localhost:5000/api`

## Authentication
- `POST /api/auth/login` -> `{ token, user: { id, username, fullName, role, permissions } }`
- `GET /api/auth/me` -> Current authenticated user profile & permissions
- `POST /api/auth/change-password` -> Change own password

## Users & Roles (Admin)
- `GET /api/users` -> List users
- `POST /api/users` -> Create user
- `PUT /api/users/:id` -> Update user / toggle active
- `GET /api/roles` -> List roles and assigned permissions

## Audit Logs (Admin)
- `GET /api/audit-logs` -> Query audit trail with filters (date range, user, action, entity)

## System & Status
- `GET /api/health` -> Health check & DB connection status
- `GET /api/settings` -> System configuration & store profile
- `PUT /api/settings` -> Update settings

## Patients & Prescriptions

- `GET /api/patients?search=...` -> Patient list with balance and visit summary.
- `POST /api/patients` -> Register `{ name, mobile?, age?, gender?, allergyNotes?, creditLimit? }`; returns `patientId`.
- `PUT /api/patients/:id` -> Correct the same fields (requires `manage_patients`). An empty string or `null` clears mobile, age, and allergy notes. Rejects an empty name, invalid age or credit limit, and another patient's mobile number. Preserves the patient ID and balance.
- `GET /api/patients/:id` -> Patient profile, sales, and receivable ledger.
- `POST /api/prescriptions` -> Record an Rx with `patientId`, optional `doctorId`, diagnosis, notes, and medicine items. The `patientId` returned by registration can be used immediately.

## Inventory & Credit

- `GET /api/inventory/batches` -> Batches joined to medicine product details, including generic, manufacturer, category, and stock thresholds.
- `PUT /api/inventory/batches/:id` -> Edit batch fields (`batchNumber`, `expiryDate`, `mfgDate`, `purchasePrice`, `salePrice`, `rackLocation`) and product fields (`brandName`, `genericName`, `manufacturerName`, `strength`, `barcode`, `categoryName`, `dosageForm`, `therapeuticClass`, `stockUnit`, `packagingType`, `packSize`, `tabletsPerPack`, `minStockLevel`, `reorderLevel`, `notes`). `customCategory: true` permits creating a new main category. Product edits apply to all batches of that medicine; use the stock adjustment endpoint for quantity.
- `POST /api/udhaar/transactions` -> Record a credit purchase, payment, or noncash balance reduction with a reason.

## Printing

- `POST /api/integrations/print-receipt-direct` -> Send a POS invoice to the Windows Speed-X printer.
- `POST /api/integrations/print-medprac-direct` with `{ visitId }` -> Send the saved MedPrac visit as an ESC/POS slip to the same printer path. Returns `fallbackToDialog: true` when direct printer access is unavailable.
