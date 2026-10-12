import { db, initDatabase } from '../db/index.js';
import { exportSyncData } from '../services/dataSyncService.js';

initDatabase();

// These 4 batches are confirmed duplicates: the same physical register page was
// scanned into both the first PDF upload and the Naveed Register Part 1 & 2 upload.
// Keeping the batch from the second (more carefully re-read) upload for each,
// removing the first upload's duplicate batch.
const batchIdsToDelete = [1511, 1504, 1503, 1502]; // Gestofil, Sharbat Faulad, Naunehal, Safi(dup medicine)
const medicineIdsToDelete = [200881]; // duplicate "Safi" medicine record left with no other batches

db.transaction(() => {
  const ph = batchIdsToDelete.map(() => '?').join(',');
  const deleted = db.prepare(`DELETE FROM batches WHERE id IN (${ph})`).run(...batchIdsToDelete).changes;
  console.log(`Deleted ${deleted} duplicate batches`);

  const ph2 = medicineIdsToDelete.map(() => '?').join(',');
  const deletedMeds = db.prepare(`DELETE FROM medicines WHERE id IN (${ph2})`).run(...medicineIdsToDelete).changes;
  console.log(`Deleted ${deletedMeds} duplicate medicine records`);
})();

const result = exportSyncData();
console.log('Export counts after dedupe:', result.counts);
