import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

export const forecastRouter = Router();

// ==========================================
// 1. REORDER SUGGESTIONS & STOCK VELOCITY
// ==========================================
forecastRouter.get('/reorder-suggestions', authenticateToken, (req: Request, res: Response) => {
  try {
    const lookbackDays = parseInt((req.query.lookbackDays as string) || '30', 10);
    const leadTimeDays = parseInt((req.query.leadTimeDays as string) || '3', 10);
    const safetyDays = parseInt((req.query.safetyDays as string) || '7', 10);
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;

    let filter = ' WHERE m.is_active = 1 ';
    const params: any[] = [];

    if (categoryId) {
      filter += ' AND m.category_id = ? ';
      params.push(categoryId);
    }

    // Fetch all active medicines
    const medicines = db.prepare(`
      SELECT 
        m.id,
        m.brand_name,
        m.strength,
        m.dosage_form,
        m.pack_size,
        m.min_stock_level,
        m.reorder_level,
        m.rack_location,
        c.name as category_name,
        man.name as manufacturer_name
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
      ${filter}
      ORDER BY m.brand_name ASC
    `).all(...params) as any[];

    // Calculate sales velocity for each medicine in the lookback period
    const salesStmt = db.prepare(`
      SELECT 
        si.medicine_id,
        COALESCE(SUM(si.quantity), 0) as total_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'COMPLETED' AND DATE(s.created_at) >= DATE('now', '-' || ? || ' days')
      GROUP BY si.medicine_id
    `);
    const salesMap = new Map<number, number>();
    (salesStmt.all(lookbackDays) as { medicine_id: number; total_sold: number }[]).forEach(row => {
      salesMap.set(row.medicine_id, row.total_sold);
    });

    // Calculate current valid stock for each medicine (excluding expired batches)
    const stockStmt = db.prepare(`
      SELECT 
        medicine_id,
        COALESCE(SUM(quantity), 0) as available_stock,
        supplier_id
      FROM batches
      WHERE status = 'ACTIVE' AND quantity > 0 AND expiry_date > DATE('now')
      GROUP BY medicine_id
    `);
    const stockMap = new Map<number, { available_stock: number; supplier_id?: number }>();
    (stockStmt.all() as { medicine_id: number; available_stock: number; supplier_id?: number }[]).forEach(row => {
      stockMap.set(row.medicine_id, { available_stock: row.available_stock, supplier_id: row.supplier_id });
    });

    // Fetch supplier directory for linking
    const suppliers = db.prepare('SELECT id, name, phone FROM suppliers').all() as any[];
    const supplierLookup = new Map(suppliers.map(s => [s.id, s]));

    const suggestions = medicines.map(m => {
      const soldUnits = salesMap.get(m.id) || 0;
      const stockInfo = stockMap.get(m.id) || { available_stock: 0, supplier_id: undefined };
      const currentStock = stockInfo.available_stock;

      // Average Daily Consumption (ADC)
      const adc = soldUnits / lookbackDays;

      // Days of Stock Remaining (DOS)
      const daysOfStock = adc > 0 ? Number((currentStock / adc).toFixed(1)) : (currentStock > 0 ? 999 : 0);

      // Reorder point: (Lead Time + Safety Days) * ADC, or fallback to medicine.reorder_level
      const dynamicRop = Math.ceil(adc * (leadTimeDays + safetyDays));
      const effectiveRop = Math.max(dynamicRop, m.reorder_level || 10);

      // Status classification
      let stockStatus: 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER_NEEDED' | 'HEALTHY' | 'OVERSTOCKED';
      if (currentStock === 0) {
        stockStatus = 'OUT_OF_STOCK';
      } else if (daysOfStock <= leadTimeDays) {
        stockStatus = 'CRITICAL';
      } else if (currentStock <= effectiveRop) {
        stockStatus = 'REORDER_NEEDED';
      } else if (daysOfStock > 120 && soldUnits > 0) {
        stockStatus = 'OVERSTOCKED';
      } else {
        stockStatus = 'HEALTHY';
      }

      // Suggested Reorder Quantity (SRQ)
      // Target: bring up to 30 days of stock or 2x reorder point
      let suggestedQty = 0;
      if (['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NEEDED'].includes(stockStatus)) {
        const targetUnits = Math.max(Math.ceil(adc * 30), effectiveRop * 2);
        const rawDeficit = Math.max(0, targetUnits - currentStock);
        // Round up to multiple of pack_size
        const pack = m.pack_size > 0 ? m.pack_size : 1;
        suggestedQty = Math.ceil(rawDeficit / pack) * pack;
        if (suggestedQty === 0) suggestedQty = pack;
      }

      const supplier = stockInfo.supplier_id ? supplierLookup.get(stockInfo.supplier_id) : null;

      return {
        medicineId: m.id,
        brandName: m.brand_name,
        strength: m.strength,
        dosageForm: m.dosage_form,
        categoryName: m.category_name,
        manufacturerName: m.manufacturer_name,
        packSize: m.pack_size,
        currentStock,
        soldUnitsLastLookback: soldUnits,
        adc: Number(adc.toFixed(2)),
        daysOfStock,
        effectiveRop,
        stockStatus,
        suggestedQty,
        supplierId: stockInfo.supplier_id || null,
        supplierName: supplier ? supplier.name : 'Primary Distributor'
      };
    });

    // Optional filter by supplier
    const filtered = supplierId
      ? suggestions.filter(s => s.supplierId === supplierId)
      : suggestions;

    // Summary counts
    const outOfStockCount = filtered.filter(s => s.stockStatus === 'OUT_OF_STOCK').length;
    const criticalCount = filtered.filter(s => s.stockStatus === 'CRITICAL').length;
    const reorderNeededCount = filtered.filter(s => s.stockStatus === 'REORDER_NEEDED').length;
    const healthyCount = filtered.filter(s => s.stockStatus === 'HEALTHY').length;
    const overstockedCount = filtered.filter(s => s.stockStatus === 'OVERSTOCKED').length;

    res.json({
      parameters: { lookbackDays, leadTimeDays, safetyDays },
      summary: {
        totalMedicines: filtered.length,
        outOfStockCount,
        criticalCount,
        reorderNeededCount,
        healthyCount,
        overstockedCount,
        totalItemsNeedingReorder: outOfStockCount + criticalCount + reorderNeededCount
      },
      suggestions: filtered
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute demand forecasting', details: err.message });
  }
});

// ==========================================
// 2. MEDICINE SALES VELOCITY HISTORY
// ==========================================
forecastRouter.get('/medicine/:id/velocity', authenticateToken, (req: Request, res: Response) => {
  try {
    const medicineId = req.params.id;

    const dailyHistory = db.prepare(`
      SELECT 
        DATE(s.created_at) as sale_date,
        SUM(si.quantity) as units_sold,
        COUNT(DISTINCT s.id) as bills_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE si.medicine_id = ? AND s.status = 'COMPLETED'
        AND DATE(s.created_at) >= DATE('now', '-30 days')
      GROUP BY DATE(s.created_at)
      ORDER BY sale_date DESC
    `).all(medicineId);

    const total30d = dailyHistory.reduce((acc: number, item: any) => acc + (item.units_sold || 0), 0);
    const adc = Number((total30d / 30).toFixed(2));

    const currentStock = db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) as total FROM batches
      WHERE medicine_id = ? AND status = 'ACTIVE' AND expiry_date > DATE('now')
    `).get(medicineId) as { total: number };

    res.json({
      medicineId,
      adc,
      currentStock: currentStock.total,
      daysOfStock: adc > 0 ? Number((currentStock.total / adc).toFixed(1)) : 999,
      dailyHistory
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch medicine velocity history', details: err.message });
  }
});

// ==========================================
// 3. GENERATE DRAFT PURCHASE ORDER FROM REORDERS
// ==========================================
forecastRouter.post('/generate-po', authenticateToken, (req: Request, res: Response) => {
  try {
    const { supplierId, items, notes } = req.body;
    const userId = (req as any).user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required to generate PO.' });
    }

    const supplier = supplierId ? db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as any : null;
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;

    // Build PO preview
    const poItems = items.map((item: any) => {
      const med = db.prepare(`
        SELECT m.id, m.brand_name, m.strength, m.dosage_form,
               (SELECT purchase_price FROM batches WHERE medicine_id = m.id ORDER BY id DESC LIMIT 1) as last_purchase_price
        FROM medicines m WHERE m.id = ?
      `).get(item.medicineId) as any;

      const unitCost = item.unitCost || (med?.last_purchase_price || 0);
      const lineTotal = Number((unitCost * item.quantity).toFixed(2));

      return {
        medicineId: item.medicineId,
        brandName: med ? med.brand_name : 'Unknown Medicine',
        strength: med ? med.strength : '',
        dosageForm: med ? med.dosage_form : '',
        quantity: item.quantity,
        estimatedUnitCost: unitCost,
        estimatedLineTotal: lineTotal
      };
    });

    const totalEstimatedCost = poItems.reduce((acc: number, item: any) => acc + item.estimatedLineTotal, 0);

    res.status(201).json({
      poNumber,
      date: new Date().toISOString().split('T')[0],
      supplier: supplier ? { id: supplier.id, name: supplier.name, phone: supplier.phone } : { name: 'General Distributor' },
      items: poItems,
      totalEstimatedCost: Number(totalEstimatedCost.toFixed(2)),
      notes: notes || 'Generated automatically by NMP Demand Forecasting Engine',
      createdBy: userId
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate draft PO', details: err.message });
  }
});
