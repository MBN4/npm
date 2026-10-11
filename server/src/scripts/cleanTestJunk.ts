import { db, initDatabase } from '../db/index.js';
import { exportSyncData } from '../services/dataSyncService.js';

initDatabase();

const junkMedicineIds = [155, 200054, 200064, 200068, 200072, 200076, 200080, 200081, 200082, 200083, 200085, 200802];
const junkGenericIds = [210206, 211639, 211928, 212217, 212506, 212795, 212832, 212851, 212870, 212997, 213016];
const junkManufacturerIds = [3536];
const junkCategoryIds = [3026];

const placeholders = (arr: number[]) => arr.map(() => '?').join(',');

const summary: Record<string, number> = {};

db.transaction(() => {
  const saleIds = db.prepare(
    `SELECT DISTINCT sale_id FROM sale_items WHERE medicine_id IN (${placeholders(junkMedicineIds)})`
  ).all(...junkMedicineIds) as { sale_id: number }[];

  const fullyJunkSaleIds = saleIds
    .map(r => r.sale_id)
    .filter(saleId => {
      const total = (db.prepare('SELECT COUNT(*) c FROM sale_items WHERE sale_id = ?').get(saleId) as { c: number }).c;
      const junk = (db.prepare(`SELECT COUNT(*) c FROM sale_items WHERE sale_id = ? AND medicine_id IN (${placeholders(junkMedicineIds)})`)
        .get(saleId, ...junkMedicineIds) as { c: number }).c;
      return total === junk;
    });

  if (fullyJunkSaleIds.length) {
    db.prepare(`DELETE FROM sale_items WHERE sale_id IN (${placeholders(fullyJunkSaleIds)})`).run(...fullyJunkSaleIds);
    db.prepare(`DELETE FROM sales WHERE id IN (${placeholders(fullyJunkSaleIds)})`).run(...fullyJunkSaleIds);
  }
  summary.fullyJunkSalesDeleted = fullyJunkSaleIds.length;

  summary.remainingJunkSaleItems = (db.prepare(
    `SELECT COUNT(*) c FROM sale_items WHERE medicine_id IN (${placeholders(junkMedicineIds)})`
  ).get(...junkMedicineIds) as { c: number }).c;
  if (summary.remainingJunkSaleItems) {
    db.prepare(`DELETE FROM sale_items WHERE medicine_id IN (${placeholders(junkMedicineIds)})`).run(...junkMedicineIds);
  }

  summary.batchesDeleted = db.prepare(
    `DELETE FROM batches WHERE medicine_id IN (${placeholders(junkMedicineIds)})`
  ).run(...junkMedicineIds).changes;

  summary.medicinesDeleted = db.prepare(
    `DELETE FROM medicines WHERE id IN (${placeholders(junkMedicineIds)})`
  ).run(...junkMedicineIds).changes;

  summary.genericsDeleted = db.prepare(
    `DELETE FROM generics WHERE id IN (${placeholders(junkGenericIds)})`
  ).run(...junkGenericIds).changes;

  summary.manufacturersDeleted = db.prepare(
    `DELETE FROM manufacturers WHERE id IN (${placeholders(junkManufacturerIds)})`
  ).run(...junkManufacturerIds).changes;

  summary.categoriesDeleted = db.prepare(
    `DELETE FROM categories WHERE id IN (${placeholders(junkCategoryIds)})`
  ).run(...junkCategoryIds).changes;
})();

console.log('Cleanup summary:', summary);

const result = exportSyncData();
console.log('Export counts after cleanup:', result.counts);
