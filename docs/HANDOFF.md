# NMP Development Handoff

## Current state (2026-09-22)

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
