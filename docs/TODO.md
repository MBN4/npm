# NMP Current Work List

## Completed locally

- [x] Import the PDF medicine list as catalog entries without inventing stock data.
- [x] Edit inventory medicine names, product classification, packaging, and batch details; retain audited stock adjustments.
- [x] Record additional Udhaar, payments, and reductions.
- [x] Route MedPrac slips through the POS printer path with browser fallback.
- [x] Add patient registration within the prescription form.
- [x] Add Edit actions for existing patients in CRM and the Rx form, including clearing optional details.
- [x] Make category menus open below their fields and standardize select arrows.
- [x] Update the user guide, API reference, release notes, status, and handoff docs.

## AI Stock Inward (2026-11-11)

- [x] Stop the scanner writing suppliers/medicines while reading an invoice.
- [x] Read invoice photos with a vision model (Groq / Gemini), with OCR and local-parser fallbacks.
- [x] Ask the admin about unclear medicines, suppliers, packing, batch/expiry conflicts and duplicates.
- [x] Same batch tops up the existing batch; a different batch creates a new batch; server-side validation.
- [ ] Set `GROQ_API_KEY` on the live server, deploy, and verify one real invoice end to end.
- [ ] Deactivate junk medicines/suppliers created by the old scanner on the live database.
- [ ] Fix packing (`pack_size`) of imported single-unit products (creams, syrups) that carry a carton size of 10.

## Remaining delivery checks

- [ ] Authenticate the configured GitHub remote, push local commits, and pull them on other devices.
- [ ] Verify a MedPrac slip on the actual Windows POS printer.
- [ ] Update legacy whole-suite medicine fixtures and rerun the full server suite.
- [ ] Confirm whether devices will share one server or use controlled SQLite export/import for live records.
