// Imports the medicine CATALOG (medicines, generics, manufacturers, categories, clinical info) into a
// database that has few or no medicines - e.g. the live server. It never imports stock/batches,
// suppliers, customers, purchases or sales.
//
// Safe by design:
// - Dry run by default: prints what it would add. Pass --apply to write.
// - Never overwrites or replaces an existing row. A medicine whose name + strength already exists
//   (active or not) is skipped; existing categories/manufacturers/generics are reused by name.
// - New rows get fresh IDs from the live database, so the source IDs can never collide with live rows.
// - With --apply it first writes a full SQLite backup next to the database
//   (nmp-before-catalog-import-<timestamp>.sqlite), then imports everything in ONE transaction.
//
// Local: npx tsx src/scripts/importCatalog.ts [--apply] [--file=path/to/catalog.json]
// Live:  fly ssh console -a nmp-api -C "node dist/scripts/importCatalog.js"           (dry run)
//        fly ssh console -a nmp-api -C "node dist/scripts/importCatalog.js --apply"   (import)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDatabase } from '../db/index.js';
import { logAudit } from '../services/auditService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

initDatabase();

const apply = process.argv.includes('--apply');
const fileArg = process.argv.find(a => a.startsWith('--file='));
const catalogPath = fileArg ? path.resolve(fileArg.slice('--file='.length)) : path.resolve(__dirname, '../../catalog/medicine_catalog.json');

if (!fs.existsSync(catalogPath)) {
  console.error(`Catalog file not found: ${catalogPath}`);
  process.exit(1);
}

type Row = Record<string, any>;
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
  sourceExportedAt?: string;
  categories: Row[];
  manufacturers: Row[];
  generics: Row[];
  drug_clinical_info: Row[];
  medicines: Row[];
};

function columnsOf(table: string): Set<string> {
  return new Set((db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(c => c.name));
}

function insertRow(table: string, row: Row, skip: string[] = ['id']): number {
  const cols = columnsOf(table);
  const keys = Object.keys(row).filter(k => cols.has(k) && !skip.includes(k) && row[k] !== undefined);
  const result = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map(k => row[k]));
  return Number(result.lastInsertRowid);
}

const before = {
  medicines: (db.prepare('SELECT COUNT(*) AS c FROM medicines WHERE is_active = 1').get() as any).c as number,
  generics: (db.prepare('SELECT COUNT(*) AS c FROM generics').get() as any).c as number
};

const stats = { categories: 0, manufacturers: 0, generics: 0, clinicalInfo: 0, medicines: 0, skippedExisting: 0, barcodesCleared: 0 };
const skippedExamples: string[] = [];

function runImport(): void {
  // Lookup tables: reuse existing rows by name, otherwise insert with a fresh ID. Map source id -> live id.
  const mapByName = (table: 'categories' | 'manufacturers' | 'generics', rows: Row[], counter: keyof typeof stats) => {
    const map = new Map<number, number>();
    const byName = new Map<string, number>();
    for (const r of rows) {
      if (!r.name) continue;
      const key = String(r.name).trim().toLowerCase();
      const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`).get(String(r.name).trim()) as { id: number } | undefined;
      const liveId = existing ? existing.id : insertRow(table, { ...r, name: String(r.name).trim() });
      if (!existing) stats[counter]++;
      map.set(Number(r.id), liveId);
      byName.set(key, liveId);
    }
    return { map, byName };
  };

  // Categories are created only when an imported medicine uses them (app startup removes empty categories).
  const sourceCategories = new Map(catalog.categories.map(c => [Number(c.id), c]));
  const categoryByName = (name: string): number => {
    const existing = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
    if (existing) return existing.id;
    const source = catalog.categories.find(c => String(c.name).trim().toLowerCase() === name.toLowerCase()) || { name };
    stats.categories++;
    return insertRow('categories', { ...source, name });
  };
  const resolveCategory = (name: unknown, sourceId: unknown): number | null => {
    const label = typeof name === 'string' && name.trim() ? name.trim()
      : sourceId != null && sourceCategories.get(Number(sourceId))?.name ? String(sourceCategories.get(Number(sourceId))!.name).trim() : null;
    return label ? categoryByName(label) : null;
  };
  const manufacturers = mapByName('manufacturers', catalog.manufacturers, 'manufacturers');
  const generics = mapByName('generics', catalog.generics, 'generics');

  const resolve = (lookup: { map: Map<number, number>; byName: Map<string, number> }, table: string, name: unknown, sourceId: unknown): number | null => {
    if (typeof name === 'string' && name.trim()) {
      const hit = lookup.byName.get(name.trim().toLowerCase());
      if (hit) return hit;
      const live = db.prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`).get(name.trim()) as { id: number } | undefined;
      if (live) return live.id;
    }
    return sourceId != null ? lookup.map.get(Number(sourceId)) ?? null : null;
  };

  // Clinical monographs are keyed by generic; add only where the live generic has none yet.
  for (const info of catalog.drug_clinical_info) {
    const genericId = generics.map.get(Number(info.generic_id));
    if (!genericId) continue;
    const exists = db.prepare('SELECT 1 FROM drug_clinical_info WHERE generic_id = ?').get(genericId);
    if (exists) continue;
    insertRow('drug_clinical_info', { ...info, generic_id: genericId });
    stats.clinicalInfo++;
  }

  const sameProduct = db.prepare(`SELECT id FROM medicines WHERE brand_name = ? COLLATE NOCASE AND COALESCE(LOWER(strength), '') = COALESCE(LOWER(?), '') LIMIT 1`);
  const barcodeTaken = db.prepare('SELECT 1 FROM medicines WHERE barcode = ? OR custom_barcode = ? LIMIT 1');

  for (const med of catalog.medicines) {
    const brand = String(med.brand_name || '').trim();
    if (!brand) continue;
    if (sameProduct.get(brand, med.strength ?? null)) {
      stats.skippedExisting++;
      if (skippedExamples.length < 10) skippedExamples.push(`${brand}${med.strength ? ` ${med.strength}` : ''}`);
      continue;
    }
    const row: Row = {
      ...med,
      brand_name: brand,
      generic_id: resolve(generics, 'generics', med.sync_generic_name, med.generic_id),
      category_id: resolveCategory(med.sync_category_name, med.category_id),
      manufacturer_id: resolve(manufacturers, 'manufacturers', med.sync_manufacturer_name, med.manufacturer_id),
      is_active: 1,
      updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    // Barcodes must stay unique: if a live product already uses one, the imported copy gets none.
    for (const field of ['barcode', 'custom_barcode']) {
      if (row[field] && barcodeTaken.get(row[field], row[field])) {
        row[field] = null;
        stats.barcodesCleared++;
      }
    }
    insertRow('medicines', row, ['id', 'sync_generic_name', 'sync_category_name', 'sync_manufacturer_name']);
    stats.medicines++;
  }
}

console.log(`\n=== Medicine catalog import (${apply ? 'APPLY' : 'DRY RUN'}) ===`);
console.log(`Catalog file: ${catalogPath}${catalog.sourceExportedAt ? ` (exported ${catalog.sourceExportedAt})` : ''}`);
console.log(`In file: ${catalog.medicines.length} medicines, ${catalog.generics.length} generics, ${catalog.manufacturers.length} manufacturers, ${catalog.categories.length} categories`);
console.log(`Database now: ${before.medicines} active medicines, ${before.generics} generics`);

if (apply) {
  const dbFile = db.name;
  const backupPath = path.join(path.dirname(dbFile), `nmp-before-catalog-import-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await db.backup(backupPath);
  console.log(`Backup written: ${backupPath}`);
}

// The dry run executes the same import inside a transaction that is rolled back, so its numbers are exact.
const ROLLBACK = new Error('dry-run rollback');
try {
  db.transaction(() => {
    runImport();
    if (!apply) throw ROLLBACK;
    logAudit({ action: 'IMPORT_MEDICINE_CATALOG', entity: 'MEDICINES', entityId: 'BULK', newValues: { ...stats, source: catalog.sourceExportedAt || catalogPath } });
  })();
} catch (err) {
  if (err !== ROLLBACK) throw err;
}

console.log(`\n${apply ? 'Added' : 'Would add'}: ${stats.medicines} medicines, ${stats.generics} generics, ${stats.manufacturers} manufacturers, ${stats.categories} categories, ${stats.clinicalInfo} clinical monographs`);
console.log(`Skipped (already in the database, left untouched): ${stats.skippedExisting}${skippedExamples.length ? ` - e.g. ${skippedExamples.join(', ')}` : ''}`);
if (stats.barcodesCleared) console.log(`Barcodes not copied because a live product already uses them: ${stats.barcodesCleared}`);
console.log('No stock, batches, suppliers, customers, purchases or sales were imported.');
if (!apply) console.log('\nDry run only - nothing was changed. Re-run with --apply to import.\n');
else console.log(`\nDone. Active medicines now: ${(db.prepare('SELECT COUNT(*) AS c FROM medicines WHERE is_active = 1').get() as any).c}\n`);
