import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const medicineRouter = Router();

// List medicines with search, filters, pagination, and stock aggregates
medicineRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const search = req.query.search as string | undefined;
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
  const manufacturerId = req.query.manufacturerId ? Number(req.query.manufacturerId) : undefined;
  const genericId = req.query.genericId ? Number(req.query.genericId) : undefined;
  const lowStockOnly = req.query.lowStock === 'true';

  let query = `
    SELECT 
      m.id, m.brand_name, m.strength, m.dosage_form, m.pack_size,
      m.barcode, m.custom_barcode, m.rack_location,
      m.min_stock_level, m.reorder_level, m.is_prescription_required, m.is_active, m.notes,
      c.name as category_name,
      mf.name as manufacturer_name,
      g.name as generic_name, g.therapeutic_class,
      COALESCE(SUM(CASE WHEN b.expiry_date > date('now') AND b.status = 'ACTIVE' THEN b.quantity ELSE 0 END), 0) as available_stock,
      COALESCE(SUM(CASE WHEN b.expiry_date <= date('now') THEN b.quantity ELSE 0 END), 0) as expired_stock,
      COUNT(b.id) as total_batches,
      MIN(CASE WHEN b.expiry_date > date('now') AND b.quantity > 0 THEN b.sale_price END) as current_sale_price
    FROM medicines m
    LEFT JOIN categories c ON m.category_id = c.id
    LEFT JOIN manufacturers mf ON m.manufacturer_id = mf.id
    LEFT JOIN generics g ON m.generic_id = g.id
    LEFT JOIN batches b ON m.id = b.medicine_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    query += ` AND (
      m.brand_name LIKE ? OR 
      g.name LIKE ? OR 
      m.barcode LIKE ? OR 
      m.custom_barcode LIKE ? OR 
      m.rack_location LIKE ?
    )`;
    params.push(s, s, s, s, s);
  }

  if (categoryId) {
    query += ' AND m.category_id = ?';
    params.push(categoryId);
  }

  if (manufacturerId) {
    query += ' AND m.manufacturer_id = ?';
    params.push(manufacturerId);
  }

  if (genericId) {
    query += ' AND m.generic_id = ?';
    params.push(genericId);
  }

  query += ` GROUP BY m.id`;

  if (lowStockOnly) {
    query += ` HAVING available_stock <= m.reorder_level`;
  }

  query += ` ORDER BY m.brand_name ASC`;

  const medicines = db.prepare(query).all(...params);
  res.json({ medicines });
});

// Single medicine with batches
medicineRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const medicine = db.prepare(`
    SELECT 
      m.*,
      c.name as category_name,
      mf.name as manufacturer_name,
      g.name as generic_name, g.therapeutic_class
    FROM medicines m
    LEFT JOIN categories c ON m.category_id = c.id
    LEFT JOIN manufacturers mf ON m.manufacturer_id = mf.id
    LEFT JOIN generics g ON m.generic_id = g.id
    WHERE m.id = ?
  `).get(id);

  if (!medicine) {
    res.status(404).json({ error: 'Medicine not found' });
    return;
  }

  const batches = db.prepare(`
    SELECT b.*, s.name as supplier_name,
      CASE 
        WHEN b.expiry_date <= date('now') THEN 'EXPIRED'
        WHEN b.expiry_date <= date('now', '+90 days') THEN 'NEAR_EXPIRY'
        ELSE 'VALID'
      END as expiry_status,
      CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
    FROM batches b
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.medicine_id = ?
    ORDER BY b.expiry_date ASC
  `).all(id);

  res.json({ medicine, batches });
});

// Create medicine
medicineRouter.post('/', authenticateToken, requirePermission('manage_medicines'), (req: AuthenticatedRequest, res: Response) => {
  const {
    brandName, genericId, categoryId, manufacturerId, strength, dosageForm,
    packSize, barcode, customBarcode, rackLocation, minStockLevel, reorderLevel,
    isPrescriptionRequired, notes
  } = req.body;

  if (!brandName || !brandName.trim()) {
    res.status(400).json({ error: 'Brand name is required' });
    return;
  }

  // Check unique barcode if supplied
  if (barcode && barcode.trim()) {
    const existing = db.prepare('SELECT id FROM medicines WHERE barcode = ?').get(barcode.trim());
    if (existing) {
      res.status(400).json({ error: 'Barcode is already assigned to another medicine' });
      return;
    }
  }

  // Handle custom barcode or auto-generate one if neither barcode is provided
  let finalCustomBarcode = customBarcode && customBarcode.trim() ? customBarcode.trim() : null;
  if (finalCustomBarcode) {
    const existing = db.prepare('SELECT id FROM medicines WHERE custom_barcode = ? OR barcode = ?').get(finalCustomBarcode, finalCustomBarcode);
    if (existing) {
      res.status(400).json({ error: 'Custom barcode is already assigned to another medicine' });
      return;
    }
  } else if (!barcode || !barcode.trim()) {
    // Auto-generate internal store barcode: NMP-XXXXXX
    finalCustomBarcode = `NMP-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  try {
    const result = db.prepare(`
      INSERT INTO medicines (
        brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form,
        pack_size, barcode, custom_barcode, rack_location, min_stock_level, reorder_level,
        is_prescription_required, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      brandName.trim(),
      genericId || null,
      categoryId || null,
      manufacturerId || null,
      strength || null,
      dosageForm || 'Tablet',
      packSize || 1,
      barcode ? barcode.trim() : null,
      finalCustomBarcode,
      rackLocation || null,
      minStockLevel != null ? Number(minStockLevel) : 10,
      reorderLevel != null ? Number(reorderLevel) : 20,
      isPrescriptionRequired ? 1 : 0,
      notes || null
    );

    logAudit({
      userId: req.user?.id,
      action: 'CREATE_MEDICINE',
      entity: 'MEDICINES',
      entityId: result.lastInsertRowid,
      newValues: { brandName, strength, dosageForm, barcode },
      ipAddress: req.ip
    });

    res.status(201).json({ message: 'Medicine created successfully', medicineId: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update medicine
medicineRouter.put('/:id', authenticateToken, requirePermission('manage_medicines'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const {
    brandName, genericId, categoryId, manufacturerId, strength, dosageForm,
    packSize, barcode, customBarcode, rackLocation, minStockLevel, reorderLevel,
    isPrescriptionRequired, isActive, notes
  } = req.body;

  const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Medicine not found' });
    return;
  }

  // Barcode conflict check
  if (barcode && barcode.trim() !== existing.barcode) {
    const conflict = db.prepare('SELECT id FROM medicines WHERE barcode = ? AND id != ?').get(barcode.trim(), id);
    if (conflict) {
      res.status(400).json({ error: 'Barcode already in use by another product' });
      return;
    }
  }

  try {
    db.prepare(`
      UPDATE medicines SET
        brand_name = ?, generic_id = ?, category_id = ?, manufacturer_id = ?,
        strength = ?, dosage_form = ?, pack_size = ?, barcode = ?, custom_barcode = ?,
        rack_location = ?, min_stock_level = ?, reorder_level = ?,
        is_prescription_required = ?, is_active = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      brandName ?? existing.brand_name,
      genericId ?? existing.generic_id,
      categoryId ?? existing.category_id,
      manufacturerId ?? existing.manufacturer_id,
      strength ?? existing.strength,
      dosageForm ?? existing.dosage_form,
      packSize ?? existing.pack_size,
      barcode ?? existing.barcode,
      customBarcode ?? existing.custom_barcode,
      rackLocation ?? existing.rack_location,
      minStockLevel ?? existing.min_stock_level,
      reorderLevel ?? existing.reorder_level,
      isPrescriptionRequired !== undefined ? (isPrescriptionRequired ? 1 : 0) : existing.is_prescription_required,
      isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      notes ?? existing.notes,
      id
    );

    logAudit({
      userId: req.user?.id,
      action: 'UPDATE_MEDICINE',
      entity: 'MEDICINES',
      entityId: id,
      oldValues: { brandName: existing.brand_name },
      newValues: { brandName },
      ipAddress: req.ip
    });

    res.json({ message: 'Medicine updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
