import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const inventoryRouter = Router();

// Get all inventory batches with status, shelf, and days remaining
inventoryRouter.get('/batches', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const medicineId = req.query.medicineId ? Number(req.query.medicineId) : undefined;
  const status = req.query.status as string | undefined;

  let query = `
    SELECT 
      b.*,
      m.brand_name, m.strength, m.dosage_form, m.barcode, m.rack_location as medicine_rack,
      s.name as supplier_name,
      CASE 
        WHEN b.expiry_date <= date('now') THEN 'EXPIRED'
        WHEN b.expiry_date <= date('now', '+90 days') THEN 'NEAR_EXPIRY'
        ELSE 'ACTIVE'
      END as computed_expiry_status,
      CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry,
      ROUND((b.sale_price - b.purchase_price), 2) as unit_margin,
      ROUND(((b.sale_price - b.purchase_price) / b.purchase_price) * 100, 1) as margin_percent
    FROM batches b
    JOIN medicines m ON b.medicine_id = m.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (medicineId) {
    query += ' AND b.medicine_id = ?';
    params.push(medicineId);
  }

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  query += ' ORDER BY b.expiry_date ASC';

  const batches = db.prepare(query).all(...params);
  res.json({ batches });
});

// Inventory stock valuation and summary KPIs
inventoryRouter.get('/valuation', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const valuation = db.prepare(`
    SELECT 
      COALESCE(SUM(b.quantity), 0) as total_units,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') THEN b.quantity ELSE 0 END), 0) as active_units,
      COALESCE(SUM(CASE WHEN b.expiry_date <= date('now') THEN b.quantity ELSE 0 END), 0) as expired_units,
      ROUND(COALESCE(SUM(b.quantity * b.purchase_price), 0), 2) as total_purchase_value,
      ROUND(COALESCE(SUM(CASE WHEN b.expiry_date > date('now') THEN b.quantity * b.sale_price ELSE 0 END), 0), 2) as active_retail_value,
      ROUND(COALESCE(SUM(CASE WHEN b.expiry_date <= date('now') THEN b.quantity * b.purchase_price ELSE 0 END), 0), 2) as expired_loss_value,
      COUNT(DISTINCT b.medicine_id) as total_products_in_stock
    FROM batches b
  `).get() as any;

  const totalPurchase = valuation.total_purchase_value || 0;
  const activeRetail = valuation.active_retail_value || 0;
  const projectedProfit = Math.max(0, activeRetail - totalPurchase);

  res.json({
    valuation: {
      ...valuation,
      projected_gross_profit: projectedProfit,
      margin_percent: totalPurchase > 0 ? Number(((projectedProfit / totalPurchase) * 100).toFixed(1)) : 0
    }
  });
});

// Audit ledger of stock movements
inventoryRouter.get('/movements', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const batchId = req.query.batchId ? Number(req.query.batchId) : undefined;
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));

  let query = `
    SELECT 
      sm.*,
      b.batch_number, b.expiry_date,
      m.brand_name, m.strength,
      u.full_name as user_name
    FROM stock_movements sm
    JOIN batches b ON sm.batch_id = b.id
    JOIN medicines m ON b.medicine_id = m.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (batchId) {
    query += ' AND sm.batch_id = ?';
    params.push(batchId);
  }

  query += ' ORDER BY sm.created_at DESC LIMIT ?';
  params.push(limit);

  const movements = db.prepare(query).all(...params);
  res.json({ movements });
});

// Atomic stock adjustment (physical inventory count correction)
inventoryRouter.post('/adjust', authenticateToken, requirePermission('adjust_stock'), (req: AuthenticatedRequest, res: Response) => {
  const { batchId, newQuantity, reason, adjustmentType } = req.body;

  if (!batchId || newQuantity === undefined || newQuantity === null) {
    res.status(400).json({ error: 'Batch ID and new quantity are required' });
    return;
  }

  const targetQty = Number(newQuantity);
  if (isNaN(targetQty) || targetQty < 0) {
    res.status(400).json({ error: 'Negative stock is strictly prohibited by business invariants' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as any;
      if (!batch) {
        throw new Error('Batch not found');
      }

      const diff = targetQty - batch.quantity;
      if (diff === 0) {
        return { message: 'Stock quantity unchanged', previousQty: batch.quantity, newQty: targetQty, difference: 0 };
      }

      // Update batch quantity
      db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetQty, batchId);

      // Record immutable stock movement
      db.prepare(`
        INSERT INTO stock_movements (
          batch_id, movement_type, quantity_change, balance_after,
          reference_type, reference_id, notes, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        batchId,
        adjustmentType || (diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT'),
        diff,
        targetQty,
        'STOCK_ADJUSTMENT',
        `ADJ-${Date.now()}`,
        reason || 'Physical count adjustment',
        req.user?.id
      );

      // Audit log
      logAudit({
        userId: req.user?.id,
        action: 'STOCK_ADJUSTMENT',
        entity: 'BATCHES',
        entityId: batchId,
        oldValues: { quantity: batch.quantity },
        newValues: { quantity: targetQty, difference: diff, reason },
        ipAddress: req.ip
      });

      return { message: 'Stock adjusted successfully', previousQty: batch.quantity, newQty: targetQty, difference: diff };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
