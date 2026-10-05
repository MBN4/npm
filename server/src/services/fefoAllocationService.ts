import { db } from '../db/index.js';

export interface BatchAllocation {
  batchId: number;
  quantity: number;
  batch: any;
}

/**
 * Allocates `quantity` units of a medicine across one or more ACTIVE, non-expired FEFO batches.
 * Used specifically for verified Schedule B/D line items so a split dispense produces one
 * traceable allocation per batch (register entries are created 1:1 with these allocations).
 * Prefers the client-selected `preferredBatchId` first, then fills the remainder strictly by
 * earliest expiry date among the medicine's other valid batches.
 */
export function allocateFefo(medicineId: number, preferredBatchId: number | null, quantity: number, today: string): BatchAllocation[] {
  const allocations: BatchAllocation[] = [];
  let remaining = quantity;

  const batchQuery = `
    SELECT b.*, m.brand_name, m.strength, m.pack_size, COALESCE(m.tablets_per_pack, 10) as tablets_per_pack
    FROM batches b JOIN medicines m ON b.medicine_id = m.id WHERE b.id = ?
  `;

  if (preferredBatchId) {
    const preferred = db.prepare(batchQuery).get(preferredBatchId) as any;
    if (preferred && preferred.medicine_id === medicineId && preferred.quantity > 0 && preferred.expiry_date > today && preferred.status === 'ACTIVE') {
      const take = Math.min(preferred.quantity, remaining);
      allocations.push({ batchId: preferred.id, quantity: take, batch: preferred });
      remaining -= take;
    }
  }

  if (remaining > 0) {
    const excludeId = preferredBatchId || -1;
    const candidates = db.prepare(`
      SELECT b.*, m.brand_name, m.strength, m.pack_size, COALESCE(m.tablets_per_pack, 10) as tablets_per_pack
      FROM batches b JOIN medicines m ON b.medicine_id = m.id
      WHERE b.medicine_id = ? AND b.id != ? AND b.quantity > 0 AND b.expiry_date > ? AND b.status = 'ACTIVE'
      ORDER BY b.expiry_date ASC
    `).all(medicineId, excludeId, today) as any[];

    for (const b of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      allocations.push({ batchId: b.id, quantity: take, batch: b });
      remaining -= take;
    }
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock across all valid batches for this medicine. Short by ${remaining} unit(s).`);
  }

  return allocations;
}
