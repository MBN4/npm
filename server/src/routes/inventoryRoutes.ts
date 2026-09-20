import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const inventoryRouter = Router();

inventoryRouter.get('/batches', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const medicineId = req.query.medicineId ? Number(req.query.medicineId) : undefined;
  const status = req.query.status as string | undefined;

  let query = `
    SELECT 
      b.*,
      m.brand_name, m.strength, m.dosage_form, m.pack_size,
      COALESCE(m.tablets_per_pack, 10) as tablets_per_pack,
      m.stock_unit, m.packaging_type,
      c.name as category_name,
      m.barcode,
      COALESCE(NULLIF(b.rack_location, ''), m.rack_location) as medicine_rack,
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
    LEFT JOIN categories c ON m.category_id = c.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.id != 0
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

  const trimmedBatchNumber = batchNumber ? String(batchNumber).trim() : null;

  if (trimmedBatchNumber && trimmedBatchNumber !== existing.batch_number) {
    const duplicate = db.prepare('SELECT id FROM batches WHERE medicine_id = ? AND batch_number = ? AND id != ?')
      .get(existing.medicine_id, trimmedBatchNumber, batchId);
    if (duplicate) {
      res.status(400).json({ error: `A batch with number '${trimmedBatchNumber}' already exists for this medicine. Please specify a unique batch number.` });
      return;
    }
  }

  try {
    const trimmedRack = rackLocation !== undefined && rackLocation !== null ? String(rackLocation).trim() : null;

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
      trimmedBatchNumber,
      expiryDate || null,
      mfgDate || null,
      purchasePrice !== undefined ? Number(purchasePrice) : null,
      salePrice !== undefined ? Number(salePrice) : null,
      trimmedRack,
      status || null,
      batchId
    );

    if (trimmedRack) {
      db.prepare('UPDATE medicines SET rack_location = ? WHERE id = ?').run(trimmedRack, existing.medicine_id);
    }

    if (trimmedBatchNumber && trimmedBatchNumber !== existing.batch_number) {
      db.prepare('UPDATE purchase_items SET batch_number = ? WHERE batch_id = ?').run(trimmedBatchNumber, batchId);
    }

    logAudit({
      userId: req.user?.id,
      action: 'UPDATE_BATCH',
      entity: 'BATCHES',
      entityId: batchId,
      oldValues: existing,
      newValues: { batchNumber: trimmedBatchNumber, expiryDate, salePrice, purchasePrice, rackLocation },
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

  try {
    runTransaction(() => {
      db.prepare(`
        INSERT OR IGNORE INTO batches (
          id, medicine_id, batch_number, expiry_date, purchase_price, sale_price, quantity, status
        ) VALUES (0, ?, 'SYSTEM-ARCHIVED', '2099-12-31', 0, 0, 0, 'DEPLETED')
      `).run(existing.medicine_id);

      db.prepare('UPDATE sale_items SET batch_id = 0 WHERE batch_id = ?').run(batchId);
      db.prepare('UPDATE purchase_items SET batch_id = 0 WHERE batch_id = ?').run(batchId);
      db.prepare('DELETE FROM expiry_claim_items WHERE batch_id = ?').run(batchId);
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
    console.error('Delete batch error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete batch' });
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
    therapeuticClass,
    stockUnit,
    packagingType,
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
            const newCat = db.prepare('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, 999)').run(categoryName.trim(), 'Auto-created category');
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
            const newGen = db.prepare('INSERT INTO generics (name, therapeutic_class, description) VALUES (?, ?, ?)').run(genericName.trim(), therapeuticClass ? String(therapeuticClass).trim() : 'General', 'Auto-created generic');
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
            therapeutic_class, stock_unit, packaging_type,
            pack_size, tablets_per_pack, barcode, custom_barcode, rack_location, min_stock_level, reorder_level,
            is_prescription_required, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          brandName.trim(),
          finalGenId,
          finalCatId,
          finalManId,
          strength ? strength.trim() : null,
          dosageForm || 'Tablet',
          therapeuticClass ? String(therapeuticClass).trim() : null,
          stockUnit ? String(stockUnit).trim() : null,
          packagingType === 'SIMPLE' ? 'SIMPLE' : 'MULTI_TIER',
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
        db.prepare(`
          UPDATE medicines SET
            pack_size = ?, tablets_per_pack = ?,
            stock_unit = COALESCE(?, stock_unit),
            packaging_type = COALESCE(?, packaging_type),
            barcode = COALESCE(?, barcode)
          WHERE id = ?
        `).run(
          numericPackSize,
          numericTabletsPerPack,
          stockUnit ? String(stockUnit).trim() : null,
          packagingType === 'SIMPLE' || packagingType === 'MULTI_TIER' ? packagingType : null,
          barcode && String(barcode).trim() ? String(barcode).trim() : null,
          finalMedId
        );
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
        `Manual stock: ${numericPacks} outer packages (${numericPackSize} ${stockUnit || 'units'} each${packagingType === 'MULTI_TIER' ? `, ${numericTabletsPerPack} ${stockUnit || 'units'}/pack` : ''}) @ Rs. ${finalUnitSale.toFixed(2)}/${stockUnit || 'unit'} | ${notes || ''}`.trim(),
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

/**
 * GET /api/inventory/lookup-barcode
 * SpeedX 1D/2D Barcode Reader instant lookup endpoint
 * Auto-parses GS1 2D DataMatrix (GTIN, Batch, Expiry) and retrieves exact product specs & prices
 */
inventoryRouter.get('/lookup-barcode', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCode = String(req.query.code || req.query.barcode || '').trim();
    if (!rawCode) {
      res.status(400).json({ error: 'Barcode parameter is required' });
      return;
    }

    // 1. GS1 2D DataMatrix Parser (01 = GTIN, 17 = Expiry YYMMDD, 10 = Batch)
    let parsedGTIN = '';
    let parsedBatch = '';
    let parsedExpiry = '';

    if (rawCode.includes('(01)')) {
      const gMatch = rawCode.match(/\(01\)(\d{13,14})/);
      if (gMatch) parsedGTIN = gMatch[1];
      const eMatch = rawCode.match(/\(17\)(\d{6})/);
      if (eMatch) {
        const yy = eMatch[1].substring(0, 2);
        const mm = eMatch[1].substring(2, 4);
        const dd = eMatch[1].substring(4, 6);
        parsedExpiry = `20${yy}-${mm}-${dd}`;
      }
      const bMatch = rawCode.match(/\(10\)([A-Za-z0-9\-]+)/);
      if (bMatch) parsedBatch = bMatch[1];
    } else {
      const clean = rawCode.replace(/[\(\)]/g, '');
      if (clean.startsWith('01') && clean.length >= 16) {
        parsedGTIN = clean.substring(2, 16);
        if (clean.substring(16, 18) === '17' && clean.length >= 24) {
          const yy = clean.substring(18, 20);
          const mm = clean.substring(20, 22);
          const dd = clean.substring(22, 24);
          parsedExpiry = `20${yy}-${mm}-${dd}`;
          if (clean.substring(24, 26) === '10') {
            parsedBatch = clean.substring(26);
          }
        }
      }
    }

    const searchCode = parsedGTIN || rawCode;
    const strippedCode = searchCode.replace(/^0+/, '');

    // 2. Search active inventory medicines table strictly by barcode
    const existingMed = db.prepare(`
      SELECT 
        m.*,
        g.name as generic_name,
        c.name as category_name,
        man.name as manufacturer_name,
        (SELECT sale_price FROM batches WHERE medicine_id = m.id ORDER BY id DESC LIMIT 1) as last_sale_price,
        (SELECT purchase_price FROM batches WHERE medicine_id = m.id ORDER BY id DESC LIMIT 1) as last_purchase_price,
        (SELECT batch_number FROM batches WHERE medicine_id = m.id ORDER BY id DESC LIMIT 1) as last_batch_number,
        (SELECT expiry_date FROM batches WHERE medicine_id = m.id ORDER BY id DESC LIMIT 1) as last_expiry_date
      FROM medicines m
      LEFT JOIN generics g ON m.generic_id = g.id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
      WHERE m.barcode = ? OR m.custom_barcode = ? OR m.barcode = ? OR m.custom_barcode = ? OR m.barcode = ? OR m.custom_barcode = ?
    `).get(rawCode, rawCode, searchCode, searchCode, strippedCode, strippedCode) as any;


    if (existingMed) {
      const tabletsPerPack = Number(existingMed.tablets_per_pack) > 0 ? Number(existingMed.tablets_per_pack) : 10;
      const packSize = Number(existingMed.pack_size) > 0 ? Number(existingMed.pack_size) : 100;
      const isMultiTier = existingMed.packaging_type === 'MULTI_TIER' || ['Tablet', 'Capsule', 'Chewable Tablet'].includes(existingMed.dosage_form);
      const packsPerBox = isMultiTier ? Math.max(1, Math.floor(packSize / tabletsPerPack)) : 1;

      // Pricing logic: 100% precision from active DB
      const unitSalePrice = Number(existingMed.last_sale_price) || 0;
      const unitPurchasePrice = Number(existingMed.last_purchase_price) || 0;
      const packSalePrice = (unitSalePrice * tabletsPerPack).toFixed(2);
      const totalBoxTablets = isMultiTier ? packsPerBox * tabletsPerPack : packSize;
      const boxSalePrice = (unitSalePrice * totalBoxTablets).toFixed(2);

      const packPurchasePrice = (unitPurchasePrice * tabletsPerPack).toFixed(2);
      const boxPurchasePrice = (unitPurchasePrice * totalBoxTablets).toFixed(2);

      res.json({
        found: true,
        source: 'existing_medicine',
        medicineId: existingMed.id,
        brandName: existingMed.brand_name,
        genericName: existingMed.generic_name || '',
        categoryName: existingMed.category_name || 'Tablets',
        manufacturerName: existingMed.manufacturer_name || '',
        strength: existingMed.strength || '',
        dosageForm: existingMed.dosage_form || 'Regular',
        therapeuticClass: existingMed.therapeutic_class || '',
        stockUnit: existingMed.stock_unit || 'Tablet',
        packagingType: existingMed.packaging_type || 'MULTI_TIER',
        tabletsPerPack: String(tabletsPerPack),
        packsPerBox: String(packsPerBox),
        packSize: packSize,
        barcode: existingMed.barcode || rawCode,
        rackLocation: existingMed.rack_location || 'Rack A-01',
        
        // Exact 100% price breakdown
        boxSalePrice,
        packSalePrice,
        tabletSalePrice: unitSalePrice.toFixed(2),
        boxPurchasePrice,
        packPurchasePrice,
        tabletPurchasePrice: unitPurchasePrice.toFixed(2),

        // Auto Batch & Expiry from GS1 scan or defaults
        batchNumber: parsedBatch || existingMed.last_batch_number || `BN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        expiryDate: parsedExpiry || existingMed.last_expiry_date || new Date(Date.now() + 730 * 86400000).toISOString().split('T')[0]
      });
      return;
    }

    // 3. Unregistered Barcode: Check master catalog dictionary or online barcode databases
    const onlineMatch = await lookupOnlineBarcode(searchCode || rawCode);
    if (onlineMatch) {
      try {
        const result = runTransaction(() => {
          let catRow = db.prepare('SELECT id FROM categories WHERE name LIKE ?').get(`%${onlineMatch.categoryName}%`) as any;
          if (!catRow) {
            catRow = db.prepare('SELECT id FROM categories LIMIT 1').get() as any;
          }
          const catId = catRow ? catRow.id : 1;

          let manId: number | null = null;
          if (onlineMatch.manufacturerName) {
            const existingMan = db.prepare('SELECT id FROM manufacturers WHERE name LIKE ?').get(`%${onlineMatch.manufacturerName}%`) as any;
            if (existingMan) {
              manId = existingMan.id;
            } else {
              const newMan = db.prepare('INSERT INTO manufacturers (name) VALUES (?)').run(onlineMatch.manufacturerName);
              manId = Number(newMan.lastInsertRowid);
            }
          }

          let genId: number | null = null;
          if (onlineMatch.genericName) {
            const existingGen = db.prepare('SELECT id FROM generics WHERE name LIKE ?').get(`%${onlineMatch.genericName}%`) as any;
            if (existingGen) {
              genId = existingGen.id;
            } else {
              const newGen = db.prepare('INSERT INTO generics (name, therapeutic_class, description) VALUES (?, ?, ?)').run(onlineMatch.genericName, 'General', 'Auto-registered generic');
              genId = Number(newGen.lastInsertRowid);
            }
          }

          const medInsert = db.prepare(`
            INSERT INTO medicines (
              brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form,
              therapeutic_class, stock_unit, packaging_type, pack_size, tablets_per_pack,
              barcode, rack_location, min_stock_level, reorder_level, is_prescription_required
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 20, 0)
            ON CONFLICT(barcode) DO UPDATE SET brand_name = excluded.brand_name
          `).run(
            onlineMatch.brandName,
            genId,
            catId,
            manId,
            onlineMatch.strength || 'Standard',
            onlineMatch.dosageForm || 'Regular',
            onlineMatch.therapeuticClass || 'General',
            onlineMatch.stockUnit || 'Piece',
            onlineMatch.packagingType || 'SIMPLE',
            1,
            1,
            rawCode,
            'Rack A-01'
          );

          let newMedId = Number(medInsert.lastInsertRowid);
          if (!newMedId || newMedId === 0) {
            const existing = db.prepare('SELECT id FROM medicines WHERE barcode = ?').get(rawCode) as any;
            if (existing) newMedId = existing.id;
          }

          const batchNo = parsedBatch || `BN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const expDate = parsedExpiry || new Date(Date.now() + 730 * 86400000).toISOString().split('T')[0];
          const unitPurchase = Number(onlineMatch.boxPurchasePrice) || 100;
          const unitSale = Number(onlineMatch.boxSalePrice) || 120;

          const batchInsert = db.prepare(`
            INSERT INTO batches (
              medicine_id, batch_number, expiry_date, purchase_price, sale_price,
              quantity, bonus_quantity, rack_location, status
            ) VALUES (?, ?, ?, ?, ?, 10, 0, 'Rack A-01', 'ACTIVE')
            ON CONFLICT(medicine_id, batch_number) DO UPDATE SET quantity = quantity + 10
          `).run(
            newMedId,
            batchNo,
            expDate,
            unitPurchase,
            unitSale
          );

          let batchId = Number(batchInsert.lastInsertRowid);
          if (!batchId || batchId === 0) {
            const existingB = db.prepare('SELECT id FROM batches WHERE medicine_id = ? AND batch_number = ?').get(newMedId, batchNo) as any;
            if (existingB) batchId = existingB.id;
          }

          db.prepare(`
            INSERT INTO stock_movements (
              batch_id, movement_type, quantity_change, balance_after,
              reference_type, notes, user_id
            ) VALUES (?, 'INWARD_MANUAL', 10, 10, 'AUTO_CATALOG', 'Auto-registered from master barcode catalog', ?)
          `).run(batchId, req.user?.id || null);



          return { newMedId, batchId, unitPurchase, unitSale, batchNo, expDate };
        });

        res.json({
          found: true,
          source: 'existing_medicine',
          autoRegistered: true,
          medicineId: result.newMedId,
          brandName: onlineMatch.brandName,
          genericName: onlineMatch.genericName || '',
          categoryName: onlineMatch.categoryName || 'General',
          manufacturerName: onlineMatch.manufacturerName || '',
          strength: onlineMatch.strength || '',
          dosageForm: onlineMatch.dosageForm || 'Regular',
          therapeuticClass: onlineMatch.therapeuticClass || '',
          stockUnit: onlineMatch.stockUnit || 'Piece',
          packagingType: onlineMatch.packagingType || 'SIMPLE',
          tabletsPerPack: '1',
          packsPerBox: '1',
          packSize: 1,
          barcode: rawCode,
          rackLocation: 'Rack A-01',
          boxSalePrice: result.unitSale.toFixed(2),
          packSalePrice: result.unitSale.toFixed(2),
          tabletSalePrice: result.unitSale.toFixed(2),
          boxPurchasePrice: result.unitPurchase.toFixed(2),
          packPurchasePrice: result.unitPurchase.toFixed(2),
          tabletPurchasePrice: result.unitPurchase.toFixed(2),
          batchNumber: result.batchNo,
          expiryDate: result.expDate
        });
        return;
      } catch (err: any) {
        console.error('AUTO_REG_ERR STACK:', err.stack || err);
        // Fall back to returning catalog match for user confirmation if auto-registration hits constraint


        res.json({
          found: true,
          source: 'online_catalog',
          barcode: rawCode,
          brandName: onlineMatch.brandName,
          genericName: onlineMatch.genericName || '',
          categoryName: onlineMatch.categoryName || 'Syrups & Oral Liquids',
          manufacturerName: onlineMatch.manufacturerName || '',
          strength: onlineMatch.strength || '',
          dosageForm: onlineMatch.dosageForm || 'Syrup',
          stockUnit: onlineMatch.stockUnit || 'Bottle',
          packagingType: onlineMatch.packagingType || 'SIMPLE',
          tabletsPerPack: onlineMatch.tabletsPerPack || '1',
          packsPerBox: onlineMatch.packsPerBox || '1',
          boxSalePrice: onlineMatch.boxSalePrice || '0.00',
          packSalePrice: onlineMatch.packSalePrice || onlineMatch.boxSalePrice || '0.00',
          tabletSalePrice: onlineMatch.tabletSalePrice || '0.00',
          boxPurchasePrice: onlineMatch.boxPurchasePrice || '0.00',
          packPurchasePrice: onlineMatch.packPurchasePrice || onlineMatch.boxPurchasePrice || '0.00',
          tabletPurchasePrice: onlineMatch.tabletPurchasePrice || '0.00',
          batchNumber: parsedBatch || `BN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          expiryDate: parsedExpiry || new Date(Date.now() + 730 * 86400000).toISOString().split('T')[0]
        });
        return;
      }
    }


    res.json({
      found: false,
      source: 'new_scan',
      barcode: rawCode,
      batchNumber: parsedBatch || `BN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: parsedExpiry || new Date(Date.now() + 730 * 86400000).toISOString().split('T')[0]
    });

  } catch (err: any) {
    console.error('Barcode lookup error:', err);
    res.status(500).json({ error: err.message || 'Barcode lookup failed' });
  }
});

/**
 * Online / Master Barcode Dictionary Lookup Helper
 */
async function lookupOnlineBarcode(code: string): Promise<any | null> {
  const cleanCode = code.replace(/\D/g, '');
  if (!cleanCode || cleanCode.length < 8) return null;

  // Master Barcode Dictionary (Pakistani & Global Retail FMCG / Baby Care / Pharma Products)
  const MASTER_BARCODE_DICT: Record<string, any> = {
    '8964000881122': {
      brandName: 'Pulmonol Cough Syrup (120ml)',
      genericName: 'Diphenhydramine + Ammonium Chloride + Menthol',
      categoryName: 'Syrups & Oral Liquids',
      dosageForm: 'Syrup',
      manufacturerName: 'CCL Pharmaceuticals',
      strength: '120ml',
      stockUnit: 'Bottle',
      packagingType: 'SIMPLE',
      boxSalePrice: '140.00',
      packSalePrice: '140.00',
      tabletSalePrice: '140.00',
      boxPurchasePrice: '110.00',
      packPurchasePrice: '110.00',
      tabletPurchasePrice: '110.00'
    },
    '8964000881139': {
      brandName: 'Pulmonol-S Sugar Free Syrup (120ml)',
      genericName: 'Salbutamol + Guaiphenesin',
      categoryName: 'Syrups & Oral Liquids',
      dosageForm: 'Syrup',
      manufacturerName: 'CCL Pharmaceuticals',
      strength: '120ml',
      stockUnit: 'Bottle',
      packagingType: 'SIMPLE',
      boxSalePrice: '160.00',
      packSalePrice: '160.00',
      tabletSalePrice: '160.00',
      boxPurchasePrice: '130.00',
      packPurchasePrice: '130.00',
      tabletPurchasePrice: '130.00'
    },
    '855434001358': {

      brandName: 'Qarshi Sharbat Faulad (240ml)',
      genericName: 'Iron & Herbal Tonic',
      categoryName: 'Syrups & Oral Liquids',
      dosageForm: 'Syrup',
      manufacturerName: 'Qarshi Industries',
      strength: '240ml',
      stockUnit: 'Bottle',
      packagingType: 'SIMPLE',
      boxSalePrice: '220.00',
      packSalePrice: '220.00',
      tabletSalePrice: '220.00',
      boxPurchasePrice: '180.00',
      packPurchasePrice: '180.00',
      tabletPurchasePrice: '180.00'
    },
    '855434001013': {
      brandName: 'Qarshi Johar Joshanda (Natural Tea Sachet)',
      genericName: 'Herbal Cold & Cough Relief',
      categoryName: 'Sachets & Powders',
      dosageForm: 'Sachet',
      manufacturerName: 'Qarshi Industries',
      strength: 'Standard',
      stockUnit: 'Piece',
      packagingType: 'SIMPLE',
      boxSalePrice: '30.00',
      boxPurchasePrice: '22.00'
    },
    '855434001129': {
      brandName: 'Qarshi Jam-e-Shirin Syrup (800ml)',
      genericName: 'Herbal Beverage Syrup',
      categoryName: 'Syrups & Oral Liquids',
      dosageForm: 'Syrup',
      manufacturerName: 'Qarshi Industries',
      strength: '800ml',
      stockUnit: 'Bottle',
      packagingType: 'SIMPLE',
      boxSalePrice: '420.00',
      boxPurchasePrice: '360.00'
    },
    '726529872460': {
      brandName: 'Morinaga BF-1 Infant Formula (400g)',
      genericName: 'Infant Milk Formula Stage 1',
      categoryName: 'Milk & Infant Formula',
      dosageForm: 'Stage 1',
      manufacturerName: 'Morinaga Milk Industry',
      strength: '400g',
      stockUnit: 'Tin / Pack',
      packagingType: 'SIMPLE',
      boxSalePrice: '1850.00',
      packSalePrice: '1850.00',
      tabletSalePrice: '1850.00',
      boxPurchasePrice: '1650.00',
      packPurchasePrice: '1650.00',
      tabletPurchasePrice: '1650.00'
    },
    '726529872477': {
      brandName: 'Morinaga BF-2 Follow-up Formula (400g)',
      genericName: 'Infant Milk Formula Stage 2',
      categoryName: 'Milk & Infant Formula',
      dosageForm: 'Stage 2',
      manufacturerName: 'Morinaga Milk Industry',
      strength: '400g',
      stockUnit: 'Tin / Pack',
      packagingType: 'SIMPLE',
      boxSalePrice: '1850.00',
      packSalePrice: '1850.00',
      tabletSalePrice: '1850.00',
      boxPurchasePrice: '1650.00',
      packPurchasePrice: '1650.00',
      tabletPurchasePrice: '1650.00'
    },
    '8964000123456': {
      brandName: 'Panadol 500mg Tablets',
      genericName: 'Paracetamol',
      categoryName: 'Tablets',
      dosageForm: 'Regular',
      manufacturerName: 'GSK Pakistan',
      strength: '500mg',
      stockUnit: 'Tablet',
      packagingType: 'MULTI_TIER',
      tabletsPerPack: '10',
      packsPerBox: '10',
      boxSalePrice: '400.00',
      packSalePrice: '40.00',
      tabletSalePrice: '4.00',
      boxPurchasePrice: '300.00',
      packPurchasePrice: '30.00',
      tabletPurchasePrice: '3.00'
    },
    '8964000654321': {
      brandName: 'Augmentin 625mg Tablets',
      genericName: 'Amoxicillin + Clavulanic Acid',
      categoryName: 'Tablets',
      dosageForm: 'Regular',
      manufacturerName: 'GSK Pakistan',
      strength: '625mg',
      stockUnit: 'Tablet',
      packagingType: 'MULTI_TIER',
      tabletsPerPack: '6',
      packsPerBox: '2',
      boxSalePrice: '450.00',
      packSalePrice: '225.00',
      tabletSalePrice: '37.50',
      boxPurchasePrice: '360.00',
      packPurchasePrice: '180.00',
      tabletPurchasePrice: '30.00'
    }
  };

  if (MASTER_BARCODE_DICT[cleanCode]) {
    return MASTER_BARCODE_DICT[cleanCode];
  }

  // Check manufacturer GS1 barcode prefix rules (Pakistani FMCG / Pharma)
  if (cleanCode.startsWith('855434')) {
    return {
      brandName: 'Qarshi Herbal Product',
      genericName: 'Herbal Supplement',
      categoryName: 'Syrups & Oral Liquids',
      dosageForm: 'Syrup',
      manufacturerName: 'Qarshi Industries',
      strength: 'Standard',
      stockUnit: 'Bottle',
      packagingType: 'SIMPLE',
      boxSalePrice: '200.00',
      boxPurchasePrice: '160.00'
    };
  }

  // Fallback: Query online UPC / EAN databases with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanCode}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as any;
      const item = data.items?.[0];
      if (item && item.title) {
        const brand = item.brand || item.title.split(' ')[0] || 'Scanned Brand';
        const category = item.category || 'General / FMCG';
        return {
          brandName: item.title,
          genericName: brand,
          categoryName: category.includes('Food') || category.includes('Milk') || category.includes('Baby') ? 'Milk & Infant Formula' : 'General / FMCG',
          dosageForm: 'Regular',
          manufacturerName: brand,
          strength: 'Standard',
          stockUnit: 'Piece',
          packagingType: 'SIMPLE',
          boxSalePrice: '500.00',
          packSalePrice: '500.00',
          tabletSalePrice: '500.00',
          boxPurchasePrice: '400.00',
          packPurchasePrice: '400.00',
          tabletPurchasePrice: '400.00'
        };
      }
    }
  } catch (e) {
    // ignore online lookup timeout/failure
  }

  return null;
}


