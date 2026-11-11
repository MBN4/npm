# NMP Development Handoff

## Current state (2026-11-11)

AI Stock Inward (Purchases) was reworked: `server/src/services/invoiceReviewService.ts` builds a read-only review draft (matching, questions, ignored lines); `invoiceScanService.ts` reads the photo with Groq/Gemini vision, then OCR+AI text, then the local parser; `POST /api/purchases` creates confirmed new suppliers/medicines and enforces same-batch top-up, separate new batches, expiry conflicts, duplicate invoices and `requestKey` idempotency. `server/src/tests/invoiceInward.test.ts` covers it.

Next checks for this work:
1. Make sure `GROQ_API_KEY` is set as a Fly secret on `nmp-api`, deploy, and scan one real invoice. The review banner must say "AI read the invoice photo (Groq)".
2. Deactivate the junk medicines/suppliers the old scanner created on the live database (see `docs/KNOWN_ISSUES.md`).

## Earlier state (2026-09-22)

The current local `main` branch includes recent work on Udhaar transactions, the 30-medicine PDF catalog import, inventory product and batch editing, MedPrac thermal printing, category menus, prescription patient registration, and editing existing patients. Patient edits preserve the original patient ID, financial balance, prescriptions, and purchase history.

## Verified locally

- `npm --prefix client run build` and `npm --prefix server run build` pass.
- Focused inventory, patient registration, and patient edit tests pass with `DB_PATH` pointing to temporary SQLite files.
- A physical MedPrac slip has not been tested here because the Linux development machine has no configured printer.

## Delivery and data

- `origin` is an HTTPS GitHub remote. Push attempts fail because this machine has no GitHub credentials. The recent commits remain local; other devices have not received them through Git.
- Live SQLite database files are ignored by Git. For data shared across devices, use one server or the export/import process described in [README](../README.md).

## Next checks

1. Authenticate GitHub and push local `main`, then pull it on the other devices.
2. Verify a MedPrac slip on the Windows POS computer and its Speed-X printer.
3. Refresh legacy test fixtures that assume the previous medicine seed before claiming a full-suite pass.

Use the existing RBAC permission checks, stock movement audit trail, and server-side validation when extending these workflows.
