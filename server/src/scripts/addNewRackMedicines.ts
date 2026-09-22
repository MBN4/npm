import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDatabase } from '../db/index.js';
import { upsertSyncRows } from '../services/syncRowHelpers.js';
import type { SyncDataExport } from '../services/dataSyncService.js';

interface RackMedicine {
  brand: string;
  generic: string | null;
  strength: string | null;
  therapeutic: string;
  subcategory: string;
  form: string | null;
  category: string | null;
  company: string | null;
  verify?: string;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, '../../data');
const manifestPath = path.join(dataDir, 'new_rack_medicines.json');
const syncPath = process.env.CATALOG_SYNC_PATH || path.join(dataDir, 'sync_data.json');
const medicines = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as RackMedicine[];
if (medicines.length !== 30 || new Set(medicines.map(medicine => medicine.brand.toLowerCase())).size !== 30) {
  throw new Error('Expected 30 unique medicines from New_Rack_Medicines_List.pdf');
}

initDatabase();
const snapshot = JSON.parse(fs.readFileSync(syncPath, 'utf8')) as SyncDataExport;
const byName = (name: string) => name.trim().toLowerCase();
const categoryIds = new Map(snapshot.categories.map(row => [byName(row.name), row.id]));
const manufacturerIds = new Map(snapshot.manufacturers.map(row => [byName(row.name), row.id]));
const genericIds = new Map(snapshot.generics.map(row => [byName(row.name), row.id]));
const existingBrands = new Set(snapshot.medicines.map(row => byName(row.brand_name)));
const newGenerics: any[] = [];
const newMedicines: any[] = [];
let nextGenericId = Math.max(210000, ...snapshot.generics.map(row => Number(row.id) || 0)) + 1;
const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

for (const [index, medicine] of medicines.entries()) {
  if (existingBrands.has(byName(medicine.brand))) continue;
  const categoryId = medicine.category ? categoryIds.get(byName(medicine.category)) : null;
  const manufacturerId = medicine.company ? manufacturerIds.get(byName(medicine.company)) : null;
  if (medicine.category && !categoryId) throw new Error(`Unknown category: ${medicine.category}`);
  if (medicine.company && !manufacturerId) throw new Error(`Unknown manufacturer: ${medicine.company}`);

  let genericId: number | null = null;
  if (medicine.generic) {
    genericId = genericIds.get(byName(medicine.generic)) ?? null;
    if (genericId === null) {
      genericId = nextGenericId++;
      newGenerics.push({ id: genericId, name: medicine.generic, therapeutic_class: medicine.therapeutic,
        description: `Formula listed in New_Rack_Medicines_List.pdf; verify physical pack where noted.` });
      genericIds.set(byName(medicine.generic), genericId);
    }
  }

  const id = 200001 + index;
  const notes = [
    'Source: New_Rack_Medicines_List.pdf.',
    `Therapeutic sub-category: ${medicine.subcategory}.`,
    medicine.verify ? `Verification: ${medicine.verify}.` : '',
    'Catalog only; stock quantity, price, expiry date, and barcode were not supplied.'
  ].filter(Boolean).join(' ');
  newMedicines.push({
    id, brand_name: medicine.brand, generic_id: genericId, category_id: categoryId,
    manufacturer_id: manufacturerId, strength: medicine.strength, dosage_form: medicine.form,
    therapeutic_class: medicine.therapeutic, stock_unit: null,
    packaging_type: medicine.category === 'Tablets' ? 'MULTI_TIER' : 'SIMPLE',
    pack_size: null, tablets_per_pack: null, barcode: null, custom_barcode: null,
    rack_location: null, min_stock_level: 0, reorder_level: 0,
    is_prescription_required: 0, is_active: 1, notes,
    created_at: timestamp, updated_at: timestamp,
    sync_generic_name: medicine.generic, sync_category_name: medicine.category,
    sync_manufacturer_name: medicine.company
  });
}

// Verify stable IDs before writing either the database or the shared snapshot.
for (const row of newGenerics) {
  const local = db.prepare('SELECT name FROM generics WHERE id = ?').get(row.id) as { name: string } | undefined;
  if (local && byName(local.name) !== byName(row.name)) {
    throw new Error(`Generic ID ${row.id} is already in use`);
  }
}
for (const row of newMedicines) {
  const existing = db.prepare('SELECT brand_name FROM medicines WHERE id = ?').get(row.id) as { brand_name: string } | undefined;
  if (existing && byName(existing.brand_name) !== byName(row.brand_name)) throw new Error(`Medicine ID ${row.id} is already in use`);
}

db.transaction(() => {
  upsertSyncRows(db, 'generics', newGenerics);
  upsertSyncRows(db, 'medicines', newMedicines);
})();

if (newMedicines.length) {
  snapshot.generics.push(...newGenerics);
  snapshot.medicines.push(...newMedicines);
  const genericNames = new Map(snapshot.generics.map(row => [row.id, row.name]));
  const categoryNames = new Map(snapshot.categories.map(row => [row.id, row.name]));
  const manufacturerNames = new Map(snapshot.manufacturers.map(row => [row.id, row.name]));
  for (const row of snapshot.medicines) {
    row.sync_generic_name ??= genericNames.get(row.generic_id) || null;
    row.sync_category_name ??= categoryNames.get(row.category_id) || null;
    row.sync_manufacturer_name ??= manufacturerNames.get(row.manufacturer_id) || null;
  }
  snapshot.exportedAt = new Date().toISOString();
  snapshot.counts = Object.fromEntries([
    'categories', 'manufacturers', 'generics', 'suppliers', 'medicines', 'drug_clinical_info', 'batches'
  ].map(key => [key, (snapshot as any)[key].length]));
  fs.writeFileSync(syncPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

console.log(`New rack catalog: ${newMedicines.length} medicines and ${newGenerics.length} generics added. No stock batches created.`);
console.log(`Shared sync file: ${syncPath}`);
