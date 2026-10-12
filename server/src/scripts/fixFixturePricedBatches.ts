import { db, initDatabase } from '../db/index.js';
import { exportSyncData } from '../services/dataSyncService.js';

initDatabase();

const fixture = db.prepare(`SELECT id FROM batches WHERE purchase_price = 3 AND sale_price = 4.5`).all() as { id: number }[];
const fixtureIds = fixture.map(r => r.id);
console.log(`Found ${fixtureIds.length} fixture-priced batches (purchase=3, sale=4.5)`);

if (fixtureIds.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

const placeholders = fixtureIds.map(() => '?').join(',');
const referenced = new Set<number>();
for (const table of ['sale_items', 'purchase_items', 'sale_return_items', 'replacement_items']) {
  const rows = db.prepare(`SELECT DISTINCT batch_id FROM ${table} WHERE batch_id IN (${placeholders})`).all(...fixtureIds) as { batch_id: number }[];
  for (const r of rows) referenced.add(r.batch_id);
}

const toDelete = fixtureIds.filter(id => !referenced.has(id));
const toQuarantine = [...referenced];

console.log(`Deleting ${toDelete.length} fixture batches with no transaction history...`);
console.log(`Quarantining ${toQuarantine.length} fixture batches referenced by real sales/returns (preserving history, zeroing stock so they can't be sold from again)...`);

db.transaction(() => {
  if (toDelete.length) {
    const ph = toDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM batches WHERE id IN (${ph})`).run(...toDelete);
  }
  if (toQuarantine.length) {
    const ph = toQuarantine.map(() => '?').join(',');
    db.prepare(`UPDATE batches SET status = 'QUARANTINED', quantity = 0, updated_at = ? WHERE id IN (${ph})`).run(new Date().toISOString().replace('T', ' ').slice(0, 19), ...toQuarantine);
  }
})();

const result = exportSyncData();
console.log('Export counts after fix:', result.counts);
