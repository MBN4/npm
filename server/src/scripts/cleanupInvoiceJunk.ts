// Lists (and optionally deactivates) suppliers and medicines that the OLD invoice scanner created on its
// own while reading an invoice (before 2026-11-11), e.g. medicines named "Sale Order #1393635" or
// "260GAVISCONLIQUID 120m 6183" and suppliers like "Babar Medicine Company oo".
//
// Safe by design:
// - Dry run by default: prints what it would change. Pass --apply to change anything.
// - Only DEACTIVATES (is_active = 0). Nothing is deleted, so a mistake can be undone in Medicines Master /
//   Suppliers, or with: UPDATE medicines SET is_active = 1 WHERE id = ...
// - Only touches records with the exact fingerprint of the old auto-creation, created on/after --since,
//   and with no stock, purchases, sales, prescriptions or other references. Anything with history is
//   listed for manual review instead.
//
// Local:  npx tsx src/scripts/cleanupInvoiceJunk.ts [--apply] [--since=2026-11-09]
// Live:   fly ssh console -a nmp-api -C "node dist/scripts/cleanupInvoiceJunk.js"            (dry run)
//         fly ssh console -a nmp-api -C "node dist/scripts/cleanupInvoiceJunk.js --apply"    (deactivate)
import { db, initDatabase } from '../db/index.js';
import { logAudit } from '../services/auditService.js';

initDatabase();

const apply = process.argv.includes('--apply');
const sinceArg = process.argv.find(a => a.startsWith('--since='));
// The auto-creating scanner shipped on 2026-11-09.
const since = sinceArg ? sinceArg.slice('--since='.length) : '2026-11-09';

function tableExists(name: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

const MEDICINE_REFERENCES = [
  'batches', 'purchase_items', 'purchase_invoice_scan_items', 'sale_items', 'prescription_items', 'sale_return_items',
  'replacement_items', 'medprac_visit_medicines', 'label_print_jobs', 'medicine_ingredients', 'medicine_classification_links'
].filter(tableExists);

// Fingerprint of the old auto-created medicine: only brand/strength/form/packaging were set. Medicines added
// through Medicines Master always get a store barcode (NMP-xxxxxx), and imported catalog rows carry a
// category/generic/manufacturer, so neither matches this.
const candidates = db.prepare(`
  SELECT id, brand_name, strength, dosage_form, created_at
  FROM medicines
  WHERE is_active = 1
    AND date(created_at) >= date(?)
    AND category_id IS NULL AND generic_id IS NULL AND manufacturer_id IS NULL
    AND barcode IS NULL AND custom_barcode IS NULL AND notes IS NULL
    AND therapeutic_class IS NULL AND stock_unit IS NULL
  ORDER BY id
`).all(since) as Array<{ id: number; brand_name: string; strength: string | null; dosage_form: string | null; created_at: string }>;

const safeMedicines: typeof candidates = [];
const reviewMedicines: Array<(typeof candidates)[number] & { usedIn: string[] }> = [];
for (const med of candidates) {
  const usedIn = MEDICINE_REFERENCES.filter(t => db.prepare(`SELECT 1 FROM ${t} WHERE medicine_id = ? LIMIT 1`).get(med.id));
  if (usedIn.length === 0) safeMedicines.push(med);
  else reviewMedicines.push({ ...med, usedIn });
}

const supplierRows = db.prepare(`
  SELECT s.id, s.name, s.created_at,
    (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) AS purchases,
    (SELECT COUNT(*) FROM batches b WHERE b.supplier_id = s.id) AS batches,
    (SELECT COUNT(*) FROM supplier_ledgers l WHERE l.supplier_id = s.id) AS ledger
  FROM suppliers s
  WHERE s.is_active = 1 AND s.contact_person = 'Invoice Auto-Created'
  ORDER BY s.id
`).all() as Array<{ id: number; name: string; created_at: string; purchases: number; batches: number; ledger: number }>;
const safeSuppliers = supplierRows.filter(s => s.purchases === 0 && s.batches === 0 && s.ledger === 0);
const reviewSuppliers = supplierRows.filter(s => !safeSuppliers.includes(s));

console.log(`\n=== Old invoice-scanner records (created on/after ${since}) ===`);
console.log(`\nMedicines safe to deactivate (no stock, no history): ${safeMedicines.length}`);
for (const m of safeMedicines) console.log(`  #${m.id}  ${m.brand_name}${m.strength ? ` ${m.strength}` : ''}  [${m.dosage_form || '-'}]  ${m.created_at}`);
console.log(`\nMedicines with stock/history - review manually in Medicines Master / Inventory: ${reviewMedicines.length}`);
for (const m of reviewMedicines) console.log(`  #${m.id}  ${m.brand_name}  (used in: ${m.usedIn.join(', ')})`);
console.log(`\nSuppliers safe to deactivate: ${safeSuppliers.length}`);
for (const s of safeSuppliers) console.log(`  #${s.id}  ${s.name}  ${s.created_at}`);
console.log(`\nSuppliers with purchases/ledger - review manually in Suppliers: ${reviewSuppliers.length}`);
for (const s of reviewSuppliers) console.log(`  #${s.id}  ${s.name}  (purchases: ${s.purchases}, batches: ${s.batches}, ledger rows: ${s.ledger})`);

if (!apply) {
  console.log('\nDry run only - nothing was changed. Re-run with --apply to deactivate the "safe" records above.\n');
} else {
  db.transaction(() => {
    const deactivateMed = db.prepare('UPDATE medicines SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    for (const m of safeMedicines) deactivateMed.run(m.id);
    const deactivateSup = db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?');
    for (const s of safeSuppliers) deactivateSup.run(s.id);
    logAudit({
      action: 'CLEANUP_INVOICE_SCANNER_JUNK',
      entity: 'MEDICINES',
      entityId: 'BULK',
      newValues: { deactivatedMedicineIds: safeMedicines.map(m => m.id), deactivatedSupplierIds: safeSuppliers.map(s => s.id), since }
    });
  })();
  console.log(`\nDeactivated ${safeMedicines.length} medicine(s) and ${safeSuppliers.length} supplier(s). Nothing was deleted.\n`);
}
