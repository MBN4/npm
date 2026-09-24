import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const expiryRouter = Router();

// Expiry Dashboard Metric Windows (180, 90, 60, 30, 7 days, and expired)
expiryRouter.get('/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const stats = db.prepare(`
    SELECT
      COUNT(CASE WHEN b.expiry_date <= date('now') THEN 1 END) as expired_batch_count,
      COALESCE(SUM(CASE WHEN b.expiry_date <= date('now') THEN b.quantity ELSE 0 END), 0) as expired_units,
      ROUND(COALESCE(SUM(CASE WHEN b.expiry_date <= date('now') THEN b.quantity * b.purchase_price ELSE 0 END), 0), 2) as expired_cost_loss,

      COUNT(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+7 days') THEN 1 END) as days_7_count,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+7 days') THEN b.quantity ELSE 0 END), 0) as days_7_units,

      COUNT(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+30 days') THEN 1 END) as days_30_count,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+30 days') THEN b.quantity ELSE 0 END), 0) as days_30_units,

      COUNT(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+60 days') THEN 1 END) as days_60_count,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+60 days') THEN b.quantity ELSE 0 END), 0) as days_60_units,

      COUNT(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+90 days') THEN 1 END) as days_90_count,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+90 days') THEN b.quantity ELSE 0 END), 0) as days_90_units,

      COUNT(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+180 days') THEN 1 END) as days_180_count,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+180 days') THEN b.quantity ELSE 0 END), 0) as days_180_units,
      ROUND(COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.expiry_date <= date('now', '+90 days') THEN b.quantity * b.purchase_price ELSE 0 END), 0), 2) as near_expiry_at_risk_value
    FROM batches b
    WHERE b.quantity > 0
  `).get();

  res.json({ stats });
});

// Query batches by expiry window
expiryRouter.get('/batches', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const window = req.query.window as string || '90'; // 'EXPIRED', '7', '30', '60', '90', '180'
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;

  let query = `
    SELECT 
      b.*,
      m.brand_name, m.strength, m.dosage_form, m.rack_location as shelf_location,
      s.name as supplier_name, s.phone as supplier_phone,
      ROUND((b.quantity * b.purchase_price), 2) as total_cost_value,
      ROUND((b.quantity * b.sale_price), 2) as total_retail_value,
      CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry,
      CASE 
        WHEN b.expiry_date <= date('now') THEN 'EXPIRED'
        WHEN b.expiry_date <= date('now', '+7 days') THEN '7_DAYS'
        WHEN b.expiry_date <= date('now', '+30 days') THEN '30_DAYS'
        WHEN b.expiry_date <= date('now', '+60 days') THEN '60_DAYS'
        WHEN b.expiry_date <= date('now', '+90 days') THEN '90_DAYS'
        ELSE '180_DAYS'
      END as expiry_bucket
    FROM batches b
    JOIN medicines m ON b.medicine_id = m.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.quantity > 0
  `;
  const params: any[] = [];

  if (window === 'EXPIRED') {
    query += ` AND b.expiry_date <= date('now')`;
  } else {
    const days = parseInt(window, 10) || 90;
    query += ` AND b.expiry_date > date('now') AND b.expiry_date <= date('now', '+${days} days')`;
  }

  if (supplierId) {
    query += ' AND b.supplier_id = ?';
    params.push(supplierId);
  }

  query += ' ORDER BY b.expiry_date ASC';

  const batches = db.prepare(query).all(...params);
  res.json({ batches });
});

// Safe write-off / disposal of expired stock
expiryRouter.post('/dispose', authenticateToken, requirePermission('adjust_stock'), (req: AuthenticatedRequest, res: Response) => {
  const { batchId, quantity, reason } = req.body;

  if (!batchId || !quantity || Number(quantity) <= 0) {
    res.status(400).json({ error: 'Batch ID and quantity greater than zero are required' });
    return;
  }

  const disposeQty = Number(quantity);

  try {
    const result = runTransaction(() => {
      const batch = db.prepare(`
        SELECT b.*, m.brand_name
        FROM batches b
        JOIN medicines m ON b.medicine_id = m.id
        WHERE b.id = ?
      `).get(batchId) as any;

      if (!batch) {
        throw new Error('Batch not found');
      }

      if (batch.expiry_date > new Date().toISOString().split('T')[0]) {
        throw new Error(`Batch ${batch.batch_number} of ${batch.brand_name} has not expired yet (expires ${batch.expiry_date}) and cannot be written off as expired stock.`);
      }

      if (batch.quantity < disposeQty) {
        throw new Error(`Cannot dispose ${disposeQty} units. Only ${batch.quantity} units available.`);
      }

      const newQty = batch.quantity - disposeQty;
      const status = newQty === 0 ? 'DEPLETED' : 'EXPIRED';

      // Update batch
      db.prepare(`
        UPDATE batches SET quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(newQty, status, batchId);

      // Record in stock movements
      db.prepare(`
        INSERT INTO stock_movements (
          batch_id, movement_type, quantity_change, balance_after,
          reference_type, reference_id, notes, user_id
        ) VALUES (?, 'EXPIRED', ?, ?, 'EXPIRY_DISPOSAL', ?, ?, ?)
      `).run(
        batchId,
        -disposeQty,
        newQty,
        `DISP-${Date.now()}`,
        reason || `Quarantined expired stock disposal for ${batch.brand_name}`,
        req.user?.id
      );

      // Audit log
      logAudit({
        userId: req.user?.id,
        action: 'DISPOSE_EXPIRED_STOCK',
        entity: 'BATCHES',
        entityId: batchId,
        oldValues: { quantity: batch.quantity },
        newValues: { disposed: disposeQty, balance: newQty, reason },
        ipAddress: req.ip
      });

      return { batchId, disposedQuantity: disposeQty, remainingQuantity: newQty };
    });

    res.json({ message: 'Expired stock disposed and written off', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Generate Supplier Expiry Return Claim
expiryRouter.post('/claims', authenticateToken, requirePermission('manage_suppliers'), (req: AuthenticatedRequest, res: Response) => {
  const { supplierId, batchIds, notes } = req.body;

  if (!supplierId || !batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
    res.status(400).json({ error: 'Supplier and at least one batch are required for claim' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const claimNumber = 'CLM-' + Date.now().toString().slice(-6);
      const claimDate = new Date().toISOString().split('T')[0];

      // Calculate total claim value
      const placeholders = batchIds.map(() => '?').join(',');
      const selectedBatches = db.prepare(`
        SELECT * FROM batches WHERE id IN (${placeholders}) AND supplier_id = ?
      `).all(...batchIds, supplierId) as any[];

      if (selectedBatches.length === 0) {
        throw new Error('No eligible batches found for selected supplier');
      }

      const totalClaimValue = selectedBatches.reduce((acc, b) => acc + (b.quantity * b.purchase_price), 0);

      // Create claim
      const claimResult = db.prepare(`
        INSERT INTO expiry_claims (supplier_id, claim_number, claim_date, total_value, status, notes, created_by)
        VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(supplierId, claimNumber, claimDate, totalClaimValue, notes || null, req.user?.id);

      const claimId = claimResult.lastInsertRowid;

      // Insert claim items
      const insertClaimItem = db.prepare(`
        INSERT INTO expiry_claim_items (claim_id, batch_id, quantity, purchase_price)
        VALUES (?, ?, ?, ?)
      `);

      for (const b of selectedBatches) {
        insertClaimItem.run(claimId, b.id, b.quantity, b.purchase_price);
      }

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_EXPIRY_CLAIM',
        entity: 'EXPIRY_CLAIMS',
        entityId: Number(claimId),
        newValues: { claimNumber, supplierId, totalValue: totalClaimValue },
        ipAddress: req.ip
      });

      return { claimId, claimNumber, totalClaimValue, itemsCount: selectedBatches.length };
    });

    res.status(201).json({ message: 'Expiry claim submitted to supplier', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
