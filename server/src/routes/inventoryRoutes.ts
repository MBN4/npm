import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

try {
  db.exec('ALTER TABLE medicines ADD COLUMN tablets_per_pack INTEGER DEFAULT 10');
} catch {}

export const inventoryRouter = Router();

inventoryRouter.get('/batches', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const medicineId = req.query.medicineId ? Number(req.query.medicineId) : undefined;
  const status = req.query.status as string | undefined;

  let query = `
    SELECT 
      b.*,
      m.brand_name, m.strength, m.dosage_form, m.pack_size,
      COALESCE(m.tablets_per_pack, 10) as tablets_per_pack,
      m.barcode, m.rack_location as medicine_rack,
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

inventoryRouter.put('/batches/:id', authenticateToken, requirePermission('manage_inventory'), (req: AuthenticatedRequest, res: Response) => {
  const batchId = Number(req.params.id);
  const { batchNumber, expiryDate, mfgDate, purchasePrice, salePrice, rackLocation, status } = req.body;

  const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as any;
  if (!existing) {
    res.status(404).json({ error: 'Batch not found' });
    return;
  }

  try {
    db.prepare(`
      UPDATE batches SET
        batch_number = COALESCE(?, batch_number),
        expiry_date = COALESCE(?, expiry_date),
        mfg_date = COALESCE(?, mfg_date),
        purchase_price = COALESCE(?, purchase_price),
        sale_price = COALESCE(?, sale_price),
        rack_location = COALESCE(?, rack_location),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      batchNumber ? batchNumber.trim() : null,
      expiryDate || null,
      mfgDate || null,
      purchasePrice !== undefined ? Number(purchasePrice) : null,
      salePrice !== undefined ? Number(salePrice) : null,
      rackLocation ? rackLocation.trim() : null,
      status || null,
      batchId
    );

    logAudit({
      userId: req.user?.id,
      action: 'UPDATE_BATCH',
      entity: 'BATCHES',
      entityId: batchId,
      oldValues: existing,
      newValues: { batchNumber, expiryDate, salePrice, purchasePrice, rackLocation },
      ipAddress: req.ip
    });

    res.json({ message: 'Batch updated successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

inventoryRouter.delete('/batches/:id', authenticateToken, requirePermission('manage_inventory'), (req: AuthenticatedRequest, res: Response) => {
  const batchId = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as any;
  if (!existing) {
    res.status(404).json({ error: 'Batch not found' });
    return;
  }

  const hasSales = db.prepare('SELECT COUNT(*) as cnt FROM sale_items WHERE batch_id = ?').get(batchId) as { cnt: number };
  if (hasSales.cnt > 0) {
    res.status(400).json({ error: `Cannot delete batch ${existing.batch_number}: It is linked to ${hasSales.cnt} historic sales invoices. You can adjust its stock to 0 instead.` });
    return;
  }

  try {
    runTransaction(() => {
      db.prepare('DELETE FROM stock_movements WHERE batch_id = ?').run(batchId);
      db.prepare('DELETE FROM batches WHERE id = ?').run(batchId);

      logAudit({
        userId: req.user?.id,
        action: 'DELETE_BATCH',
        entity: 'BATCHES',
        entityId: batchId,
        oldValues: existing,
        ipAddress: req.ip
      });
    });

    res.json({ message: `Batch ${existing.batch_number} deleted successfully` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

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

      db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetQty, batchId);

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

inventoryRouter.post('/direct-entry', authenticateToken, requirePermission('manage_inventory'), (req: AuthenticatedRequest, res: Response) => {
  const {
    medicineId,
    brandName,
    genericId,
    genericName,
    categoryId,
    categoryName,
    manufacturerId,
    manufacturerName,
    strength,
    dosageForm,
    packSize = 1,
    tabletsPerPack = 10,
    barcode,
    customBarcode,
    rackLocation,
    minStockLevel = 10,
    reorderLevel = 20,
    isPrescriptionRequired = 0,
    batchNumber,
    mfgDate,
    expiryDate,
    packsReceived = 1,
    bonusQuantity = 0,
    packPurchasePrice = 0,
    unitPurchasePrice = 0,
    packSalePrice = 0,
    unitSalePrice = 0,
    discountPercent = 0,
    supplierId,
    notes
  } = req.body;

  if (!batchNumber || !batchNumber.trim()) {
    res.status(400).json({ error: 'Batch number is required' });
    return;
  }

  if (!expiryDate) {
    res.status(400).json({ error: 'Expiry date is required' });
    return;
  }

  const numericPackSize = Math.max(1, Number(packSize) || 1);
  const numericTabletsPerPack = Math.max(1, Number(tabletsPerPack) || 1);
  const numericPacks = Math.max(0, Number(packsReceived) || 0);
  const numericBonus = Math.max(0, Number(bonusQuantity) || 0);
  const totalUnits = (numericPacks * numericPackSize) + numericBonus;

  if (totalUnits <= 0) {
    res.status(400).json({ error: 'Quantity must be greater than zero' });
    return;
  }

  let finalUnitPurchase = Number(unitPurchasePrice);
  if (!finalUnitPurchase && packPurchasePrice) {
    finalUnitPurchase = Number(packPurchasePrice) / numericPackSize;
  }

  let finalUnitSale = Number(unitSalePrice);
  if (!finalUnitSale && packSalePrice) {
    finalUnitSale = Number(packSalePrice) / numericPackSize;
  }

  if (finalUnitSale <= 0) {
    res.status(400).json({ error: 'Sale price must be greater than zero' });
    return;
  }

  try {
    const result = runTransaction(() => {
      let finalMedId = medicineId ? Number(medicineId) : null;

      if (!finalMedId) {
        if (!brandName || !brandName.trim()) {
          throw new Error('Brand name is required for new medicine');
        }

        let finalCatId = categoryId ? Number(categoryId) : null;
        if (!finalCatId && categoryName && categoryName.trim()) {
          const existingCat = db.prepare('SELECT id FROM categories WHERE name LIKE ?').get(categoryName.trim()) as any;
          if (existingCat) {
            finalCatId = existingCat.id;
          } else {
            const newCat = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(categoryName.trim(), 'Auto-created category');
            finalCatId = Number(newCat.lastInsertRowid);
          }
        }

        let finalManId = manufacturerId ? Number(manufacturerId) : null;
        if (!finalManId && manufacturerName && manufacturerName.trim()) {
          const existingMan = db.prepare('SELECT id FROM manufacturers WHERE name LIKE ?').get(manufacturerName.trim()) as any;
          if (existingMan) {
            finalManId = existingMan.id;
          } else {
            const newMan = db.prepare('INSERT INTO manufacturers (name) VALUES (?)').run(manufacturerName.trim());
            finalManId = Number(newMan.lastInsertRowid);
          }
        }

        let finalGenId = genericId ? Number(genericId) : null;
        if (!finalGenId && genericName && genericName.trim()) {
          const existingGen = db.prepare('SELECT id FROM generics WHERE name LIKE ?').get(genericName.trim()) as any;
          if (existingGen) {
            finalGenId = existingGen.id;
          } else {
            const newGen = db.prepare('INSERT INTO generics (name) VALUES (?, ?, ?)').run(genericName.trim(), 'General', 'Auto-created generic');
            finalGenId = Number(newGen.lastInsertRowid);
          }
        }

        let finalBarcode = barcode && barcode.trim() ? barcode.trim() : null;
        let finalCustom = customBarcode && customBarcode.trim() ? customBarcode.trim() : null;
        if (!finalBarcode && !finalCustom) {
          finalCustom = `NMP-${Math.floor(100000 + Math.random() * 900000)}`;
        }

        const medInsert = db.prepare(`
          INSERT INTO medicines (
            brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form,
            pack_size, tablets_per_pack, barcode, custom_barcode, rack_location, min_stock_level, reorder_level,
            is_prescription_required, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          brandName.trim(),
          finalGenId,
          finalCatId,
          finalManId,
          strength ? strength.trim() : null,
          dosageForm || 'Tablet',
          numericPackSize,
          numericTabletsPerPack,
          finalBarcode,
          finalCustom,
          rackLocation ? rackLocation.trim() : null,
          minStockLevel,
          reorderLevel,
          isPrescriptionRequired ? 1 : 0,
          notes ? notes.trim() : null
        );

        finalMedId = Number(medInsert.lastInsertRowid);
      } else {
        db.prepare('UPDATE medicines SET pack_size = ?, tablets_per_pack = ? WHERE id = ?').run(numericPackSize, numericTabletsPerPack, finalMedId);
      }

      const existingBatch = db.prepare('SELECT id, quantity FROM batches WHERE medicine_id = ? AND batch_number = ?').get(finalMedId, batchNumber.trim()) as any;
      let batchId: number;

      if (existingBatch) {
        const newTotal = existingBatch.quantity + totalUnits;
        db.prepare(`
          UPDATE batches SET
            quantity = ?,
            purchase_price = ?,
            sale_price = ?,
            expiry_date = ?,
            mfg_date = ?,
            rack_location = COALESCE(?, rack_location),
            status = 'ACTIVE',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          newTotal,
          finalUnitPurchase,
          finalUnitSale,
          expiryDate,
          mfgDate || null,
          rackLocation || null,
          existingBatch.id
        );
        batchId = existingBatch.id;
      } else {
        const batchInsert = db.prepare(`
          INSERT INTO batches (
            medicine_id, batch_number, mfg_date, expiry_date,
            purchase_price, sale_price, quantity, bonus_quantity,
            supplier_id, rack_location, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run(
          finalMedId,
          batchNumber.trim(),
          mfgDate || null,
          expiryDate,
          finalUnitPurchase,
          finalUnitSale,
          totalUnits,
          numericBonus,
          supplierId || null,
          rackLocation ? rackLocation.trim() : null
        );
        batchId = Number(batchInsert.lastInsertRowid);
      }

      db.prepare(`
        INSERT INTO stock_movements (
          batch_id, movement_type, quantity_change, balance_after,
          reference_type, reference_id, notes, user_id
        ) VALUES (?, 'INWARD_MANUAL', ?, ?, 'MANUAL_ENTRY', ?, ?, ?)
      `).run(
        batchId,
        totalUnits,
        totalUnits,
        `DIR-${Date.now()}`,
        `Manual stock: ${numericPacks} boxes (${numericPackSize} tablets/box, ${numericTabletsPerPack} tablets/pack) @ Rs. ${finalUnitSale.toFixed(2)}/tablet | ${notes || ''}`.trim(),
        req.user?.id
      );

      logAudit({
        userId: req.user?.id,
        action: 'MANUAL_STOCK_ENTRY',
        entity: 'BATCHES',
        entityId: batchId,
        newValues: {
          medicineId: finalMedId,
          batchNumber,
          totalUnits,
          numericPacks,
          packSize: numericPackSize,
          tabletsPerPack: numericTabletsPerPack,
          unitPurchasePrice: finalUnitPurchase,
          unitSalePrice: finalUnitSale,
          discountPercent
        },
        ipAddress: req.ip
      });

      return {
        message: 'Medicine and stock batch registered successfully',
        medicineId: finalMedId,
        batchId,
        totalUnits,
        tabletsPerPack: numericTabletsPerPack,
        unitSalePrice: finalUnitSale,
        unitPurchasePrice: finalUnitPurchase
      };
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});