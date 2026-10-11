import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDatabase } from '../db/index.js';
import { importSyncData, exportSyncData } from '../services/dataSyncService.js';
import { upsertSyncRows } from '../services/syncRowHelpers.js';

interface IncomingRow {
  brand: string;
  strength: string | null;
  generic: string;
  therapeutic_class: string;
  category: string;
  dosage_form: string;
  manufacturer: string;
  mfg_date: string | null;
  expiry_date: string;
  batch_number: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  notes: string | null;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: tsx bulkAddStockBatch1.ts <path-to-json>');
const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as IncomingRow[];

initDatabase();
importSyncData();

const byName = (name: string) => name.trim().toLowerCase();

function getCategoryId(name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
  if (!row) throw new Error(`Unknown category: ${name}`);
  return row.id;
}

function getOrCreateManufacturer(name: string): number {
  const existing = db.prepare('SELECT id FROM manufacturers WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const maxId = (db.prepare('SELECT MAX(id) as m FROM manufacturers').get() as { m: number }).m || 0;
  const id = Math.max(maxId + 1, 3600);
  db.prepare('INSERT INTO manufacturers (id, name, is_active) VALUES (?, ?, 1)').run(id, name);
  return id;
}

function getOrCreateGeneric(name: string, therapeuticClass: string): number {
  const existing = db.prepare('SELECT id FROM generics WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const maxId = (db.prepare('SELECT MAX(id) as m FROM generics').get() as { m: number }).m || 0;
  const id = Math.max(maxId + 1, 213100);
  db.prepare('INSERT INTO generics (id, name, therapeutic_class) VALUES (?, ?, ?)').run(id, name, therapeuticClass);
  return id;
}

function getOrCreateMedicine(row: IncomingRow, genericId: number, categoryId: number, manufacturerId: number): number {
  const existing = db.prepare(
    `SELECT id FROM medicines WHERE brand_name = ? COLLATE NOCASE AND COALESCE(strength,'') = COALESCE(?,'')`
  ).get(row.brand, row.strength) as { id: number } | undefined;
  if (existing) return existing.id;

  const maxId = (db.prepare('SELECT MAX(id) as m FROM medicines').get() as { m: number }).m || 0;
  const id = Math.max(maxId + 1, 200200);
  const isMultiTier = row.dosage_form === 'Tablet' || row.dosage_form === 'Capsule';
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const fullNotes = ['Source: manual stock register (CamScanner upload).', row.notes].filter(Boolean).join(' ');

  db.prepare(`
    INSERT INTO medicines (
      id, brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form,
      therapeutic_class, stock_unit, tablets_per_pack, packaging_type, pack_size,
      barcode, custom_barcode, rack_location, min_stock_level, reorder_level,
      is_prescription_required, is_active, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 10, 20, 0, 1, ?, ?, ?)
  `).run(
    id, row.brand, genericId, categoryId, manufacturerId, row.strength, row.dosage_form,
    row.therapeutic_class, row.dosage_form, isMultiTier ? 10 : null, isMultiTier ? 'MULTI_TIER' : 'SIMPLE', 1,
    fullNotes, now, now
  );
  return id;
}

function addBatch(medicineId: number, row: IncomingRow): void {
  let batchNumber = row.batch_number;
  let attempt = 0;
  while (db.prepare('SELECT 1 FROM batches WHERE medicine_id = ? AND batch_number = ?').get(medicineId, batchNumber)) {
    attempt += 1;
    batchNumber = `${row.batch_number}-${attempt}`;
  }
  const maxId = (db.prepare('SELECT MAX(id) as m FROM batches').get() as { m: number }).m || 0;
  const id = Math.max(maxId + 1, 200);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`
    INSERT INTO batches (
      id, medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price,
      quantity, bonus_quantity, supplier_id, rack_location, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'ACTIVE', ?, ?)
  `).run(id, medicineId, batchNumber, row.mfg_date, row.expiry_date, row.purchase_price, row.sale_price, row.quantity, now, now);
}

let medicinesCreated = 0;
let medicinesReused = 0;
let batchesCreated = 0;
const flagged: string[] = [];

db.transaction(() => {
  for (const row of rows) {
    const categoryId = getCategoryId(row.category);
    const manufacturerId = getOrCreateManufacturer(row.manufacturer);
    const genericId = getOrCreateGeneric(row.generic, row.therapeutic_class);

    const beforeCount = (db.prepare('SELECT COUNT(*) as c FROM medicines').get() as { c: number }).c;
    const medicineId = getOrCreateMedicine(row, genericId, categoryId, manufacturerId);
    const afterCount = (db.prepare('SELECT COUNT(*) as c FROM medicines').get() as { c: number }).c;
    if (afterCount > beforeCount) medicinesCreated++; else medicinesReused++;

    addBatch(medicineId, row);
    batchesCreated++;

    if (row.notes) flagged.push(`${row.brand}${row.strength ? ' ' + row.strength : ''} (batch ${row.batch_number}): ${row.notes}`);
  }
})();

const result = exportSyncData();

console.log(`Medicines created: ${medicinesCreated}, reused (existing product, new batch): ${medicinesReused}`);
console.log(`Batches created: ${batchesCreated}`);
console.log(`Export counts:`, result.counts);
console.log(`\n--- FLAGGED ITEMS (${flagged.length}) ---`);
for (const f of flagged) console.log(' - ' + f);
