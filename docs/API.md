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

## Purchases & AI Stock Inward

- `GET /api/purchases/scans/ai-status` -> `{ aiEnabled, provider: 'groq' | 'gemini' | null, model }`. Never returns the key.
- `POST /api/purchases/scans/ai-quick-extract` (multipart `files`, up to 10 photos/PDF pages; requires `create_purchases`) -> a **review draft** only; it writes nothing to the catalog, suppliers or stock. Response:
  `{ extractionMethod: 'AI_VISION' | 'AI_TEXT' | 'LOCAL_PARSER', aiProvider, supplierName, matchedSupplierId, supplierCandidates[], invoiceNumber, purchaseDate, printedNetTotal, printedItemCount, calculatedTotal, duplicatePurchase, items[], ignoredLines[], questions[], warnings[] }`.
  Each item has `invoiceName`, `productName`, `matchStatus` (`MATCHED` | `NEEDS_REVIEW` | `NEW`), `matchedMedicineId`, ranked `candidates[]` (with catalog packing), `newMedicine` proposal, `batchNumber`, `expiryDate` (null when unreadable, never invented), `boxes`, `bonusBoxes`, `blistersPerBox`, `tabsPerBlister`, `purchasePrice`, `mrp`, `existingBatch`, and `issues[]`. Each question has `type` (`SUPPLIER`, `MEDICINE_MATCH`, `PACKING`, `QTY_UNIT`, `BATCH_EXPIRY_CONFLICT`, `ITEM_COUNT`, `TOTAL_MISMATCH`, `DUPLICATE_INVOICE`), `blocking`, and `options[]`.
- `POST /api/purchases` (requires `create_purchases`) -> Records the invoice and adds stock atomically.
  Body: `{ supplierId | newSupplier: { name }, invoiceNumber, purchaseDate, subtotal, discount, tax, totalAmount, paidAmount, paymentMethod, notes, requestKey?, items[] }`.
  Item: `{ medicineId | newMedicine: { brandName, strength, dosageForm, packagingType }, batchNumber, expiryDate, mfgDate?, boxesReceived, stripsPerBox, unitsPerStrip, quantity (units), bonusQuantity (units), purchasePrice / confirmedPurchaseCostPerBox (per box), mrp / printedMrpPerBox (per box), lineTotal, overrideBatchExpiry? }`.
  Same medicine + same batch adds to the existing batch; a different batch creates a new batch row. Returns `201 { purchaseId, supplierId, createdMedicines[], stockSummary[{ action: 'NEW_BATCH' | 'ADDED_TO_EXISTING_BATCH', unitsAdded, batchQuantityAfter }] }`.
  Errors: `409` same supplier + invoice number already saved; `400` expired stock, invalid date, missing medicine/batch, or same batch with a different expiry (unless `overrideBatchExpiry`). A repeated `requestKey` returns `200` with the original purchase instead of saving again.

