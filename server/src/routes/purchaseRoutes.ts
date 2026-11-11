import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';

export const purchaseRouter = Router();

// List purchase invoices
purchaseRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;

  let query = `
    SELECT 
      p.*,
      s.name as supplier_name,
      u.full_name as creator_name,
      COUNT(pi.id) as item_count
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (supplierId) {
    query += ' AND p.supplier_id = ?';
    params.push(supplierId);
  }

  query += ' GROUP BY p.id ORDER BY p.purchase_date DESC, p.id DESC';

  const purchases = db.prepare(query).all(...params);
  res.json({ purchases });
});

// Single purchase invoice with items
purchaseRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const purchase = db.prepare(`
    SELECT p.*, s.name as supplier_name, s.phone as supplier_phone, u.full_name as creator_name
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(id);

  if (!purchase) {
    res.status(404).json({ error: 'Purchase invoice not found' });
    return;
  }

  const items = db.prepare(`
    SELECT pi.*, m.brand_name, m.strength, m.dosage_form
    FROM purchase_items pi
    JOIN medicines m ON pi.medicine_id = m.id
    WHERE pi.purchase_id = ?
  `).all(id);

  res.json({ purchase, items });
});

// Record inward purchase invoice (Atomic Transaction with 3-Tier Packaging & Box/Tablet Math)
//
// Stock rules enforced here (the UI is not trusted for any of them):
// - Same medicine + same batch number  -> quantity is ADDED to that existing batch (never a second row).
//   If the invoice expiry differs from the batch already in stock the save is refused, unless the
//   admin explicitly confirmed the correction (overrideBatchExpiry).
// - Same medicine + different batch    -> a NEW batch row under the existing medicine (FEFO keeps them apart).
// - New medicine / new supplier        -> only created here, inside the same transaction, after the
//   admin confirmed them on the review screen (newMedicine / newSupplier). The invoice scanner never
//   writes to the catalog on its own.
// - The same supplier invoice number cannot be saved twice (that would double the stock).
// - Stock that is already expired on the purchase date cannot be received.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function generateStoreBarcode(): string {
  for (let i = 0; i < 20; i++) {
    const code = `NMP-${Math.floor(100000 + Math.random() * 900000)}`;
    const taken = db.prepare('SELECT 1 FROM medicines WHERE custom_barcode = ? OR barcode = ?').get(code, code);
    if (!taken) return code;
  }
  return `NMP-${Date.now()}`;
}

class PurchaseValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

purchaseRouter.post('/', authenticateToken, requirePermission('create_purchases'), (req: AuthenticatedRequest, res: Response) => {
  const {
    supplierId, newSupplier, invoiceNumber, purchaseDate, items,
    subtotal, discount, tax, totalAmount, paidAmount, paymentMethod, notes, requestKey
  } = req.body;

  const invoiceNo = typeof invoiceNumber === 'string' ? invoiceNumber.trim() : String(invoiceNumber ?? '').trim();
  const newSupplierName = newSupplier && typeof newSupplier.name === 'string' ? newSupplier.name.replace(/\s+/g, ' ').trim() : '';

  if ((!supplierId && !newSupplierName) || !invoiceNo || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Supplier, invoice number, and at least one item are required' });
    return;
  }

  const purchaseDay = typeof purchaseDate === 'string' && purchaseDate.trim() ? purchaseDate.trim() : new Date().toISOString().split('T')[0];
  if (!isValidIsoDate(purchaseDay)) {
    res.status(400).json({ error: `Purchase date "${purchaseDay}" is not a valid date (YYYY-MM-DD)` });
    return;
  }

  // Idempotency: a repeated click / network retry with the same key returns the saved purchase.
  const idemKey = requestKey ? String(requestKey).trim() : null;
  if (idemKey) {
    const existing = db.prepare('SELECT id, invoice_number, total_amount, remaining_amount FROM purchases WHERE request_key = ?').get(idemKey) as any;
    if (existing) {
      res.status(200).json({
        message: 'Purchase invoice was already recorded',
        purchaseId: existing.id,
        invoiceNumber: existing.invoice_number,
        total: existing.total_amount,
        remaining: existing.remaining_amount,
        duplicateRequest: true
      });
      return;
    }
  }

  try {
    const result = runTransaction(() => {
      // 0. Supplier: existing, or a new one the admin confirmed on the review screen.
      let supplier: any;
      if (supplierId) {
        supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as any;
        if (!supplier) throw new PurchaseValidationError('Supplier does not exist');
      } else {
        supplier = db.prepare('SELECT * FROM suppliers WHERE name = ? COLLATE NOCASE').get(newSupplierName) as any;
        if (!supplier) {
          const ins = db.prepare(`
            INSERT INTO suppliers (name, contact_person, phone, address, opening_balance, current_balance, is_active)
            VALUES (?, ?, ?, ?, 0, 0, 1)
          `).run(
            newSupplierName,
            newSupplier.contactPerson ? String(newSupplier.contactPerson).trim() : null,
            newSupplier.phone ? String(newSupplier.phone).trim() : null,
            newSupplier.address ? String(newSupplier.address).trim() : null
          );
          supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(ins.lastInsertRowid) as any;
          logAudit({
            userId: req.user?.id,
            action: 'CREATE_SUPPLIER',
            entity: 'SUPPLIERS',
            entityId: supplier.id,
            newValues: { name: newSupplierName, source: 'purchase invoice review' },
            ipAddress: req.ip
          });
        }
      }

      // 1. Duplicate invoice guard (same supplier + same invoice number).
      const duplicate = db.prepare(`
        SELECT id, purchase_date FROM purchases WHERE supplier_id = ? AND TRIM(invoice_number) = ? COLLATE NOCASE
      `).get(supplier.id, invoiceNo) as any;
      if (duplicate) {
        throw new PurchaseValidationError(
          `Invoice #${invoiceNo} from ${supplier.name} was already entered on ${duplicate.purchase_date} (purchase ID ${duplicate.id}). Saving it again would add the stock twice.`,
          409
        );
      }

      const total = Number(totalAmount) || 0;
      const paid = Number(paidAmount) || 0;
      if (total < 0 || paid < 0) throw new PurchaseValidationError('Total and paid amounts cannot be negative');
      const remaining = Math.max(0, total - paid);
      let status = 'PAID';
      if (remaining > 0 && paid > 0) status = 'PARTIAL';
      else if (remaining > 0 && paid === 0) status = 'UNPAID';

      // 2. Insert Purchase Invoice
      const pResult = db.prepare(`
        INSERT INTO purchases (
          invoice_number, supplier_id, purchase_date, subtotal, discount, tax,
          total_amount, paid_amount, remaining_amount, payment_status, payment_method,
          created_by, notes, request_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceNo,
        supplier.id,
        purchaseDay,
        Number(subtotal) || total,
        Number(discount) || 0,
        Number(tax) || 0,
        total,
        paid,
        remaining,
        status,
        paymentMethod || 'CASH',
        req.user?.id,
        notes || null,
        idemKey
      );

      const purchaseId = pResult.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO purchase_items (
          purchase_id, medicine_id, batch_id, batch_number, expiry_date, mfg_date,
          purchase_price, sale_price, quantity, bonus_quantity, line_discount, line_total,
          boxes_received, strips_per_box, units_per_strip, printed_mrp_per_box, confirmed_purchase_cost_per_box, rate_basis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const findBatch = db.prepare('SELECT id, quantity, purchase_price, expiry_date FROM batches WHERE medicine_id = ? AND batch_number = ? COLLATE NOCASE');
      const createdMedicines: Array<{ id: number; brandName: string }> = [];
      const stockSummary: Array<{ medicineId: number; batchNumber: string; action: 'NEW_BATCH' | 'ADDED_TO_EXISTING_BATCH'; unitsAdded: number; batchQuantityAfter: number }> = [];

      items.forEach((item: any, index: number) => {
        const lineLabel = `Item #${index + 1}`;
        // 0 paid boxes is valid for a bonus-only (free goods) line; older callers that send no box
        // count at all keep the previous default of 1 box with an explicit unit quantity.
        const explicitBoxes = item.boxesReceived ?? item.boxes;
        const boxesReceived = explicitBoxes !== undefined && explicitBoxes !== null && explicitBoxes !== '' && Number.isFinite(Number(explicitBoxes))
          ? Math.max(0, Number(explicitBoxes))
          : 1;
        const stripsPerBox = Math.max(1, Math.round(Number(item.stripsPerBox) || Number(item.blistersPerBox) || 1));
        const unitsPerStrip = Math.max(1, Math.round(Number(item.unitsPerStrip) || Number(item.tabsPerBlister) || 1));
        const unitsPerBox = stripsPerBox * unitsPerStrip;

        // 2a. Medicine: existing, or a new one the admin confirmed.
        let medId = Number(item.medicineId) || 0;
        if (!medId && item.newMedicine) {
          const nm = item.newMedicine;
          const brandName = typeof nm.brandName === 'string' ? nm.brandName.replace(/\s+/g, ' ').trim() : '';
          if (brandName.length < 2) throw new PurchaseValidationError(`${lineLabel}: the new medicine needs a name`);
          const strength = nm.strength ? String(nm.strength).trim() : null;
          const packagingType = nm.packagingType === 'SIMPLE' ? 'SIMPLE' : 'MULTI_TIER';
          // Reuse an identical active catalog entry instead of creating a duplicate.
          const same = db.prepare(`
            SELECT id FROM medicines
            WHERE is_active = 1 AND brand_name = ? COLLATE NOCASE AND IFNULL(LOWER(strength), '') = IFNULL(LOWER(?), '')
          `).get(brandName, strength) as any;
          if (same) {
            medId = same.id;
          } else {
            const ins = db.prepare(`
              INSERT INTO medicines (brand_name, strength, dosage_form, packaging_type, pack_size, tablets_per_pack, custom_barcode, is_active, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
              brandName,
              strength,
              nm.dosageForm ? String(nm.dosageForm).trim() : (packagingType === 'SIMPLE' ? 'Item' : 'Tablet'),
              packagingType,
              unitsPerBox,
              packagingType === 'SIMPLE' ? 1 : unitsPerStrip,
              generateStoreBarcode(),
              `Added from supplier invoice #${invoiceNo}`
            );
            medId = Number(ins.lastInsertRowid);
            createdMedicines.push({ id: medId, brandName });
            logAudit({
              userId: req.user?.id,
              action: 'CREATE_MEDICINE',
              entity: 'MEDICINES',
              entityId: medId,
              newValues: { brandName, strength, packagingType, unitsPerBox, source: `purchase invoice ${invoiceNo}` },
              ipAddress: req.ip
            });
          }
        }
        if (!medId) throw new PurchaseValidationError(`${lineLabel}: select a medicine from the catalog or confirm adding it as a new medicine`);
        const medicine = db.prepare('SELECT id, brand_name FROM medicines WHERE id = ?').get(medId) as any;
        if (!medicine) throw new PurchaseValidationError(`${lineLabel}: medicine ID ${medId} does not exist`);
        const medLabel = `${lineLabel} (${medicine.brand_name})`;

        // 2b. Batch / expiry validation.
        const batchNum = String(item.batchNumber ?? '').trim();
        const expiry = String(item.expiryDate ?? '').trim();
        if (!batchNum) throw new PurchaseValidationError(`${medLabel}: batch number is required`);
        if (!isValidIsoDate(expiry)) throw new PurchaseValidationError(`${medLabel}: expiry date is missing or invalid`);
        if (expiry <= purchaseDay) throw new PurchaseValidationError(`${medLabel}: batch ${batchNum} expired on ${expiry} - expired stock cannot be received`);
        const mfgDate = item.mfgDate && isValidIsoDate(String(item.mfgDate)) ? String(item.mfgDate) : null;

        const quantityUnits = Number(item.quantity);
        const totalSellableUnits = Number.isFinite(quantityUnits) && quantityUnits > 0
          ? Math.round(quantityUnits)
          : Math.round(boxesReceived * unitsPerBox);
        const bonusUnits = Math.max(0, Math.round(Number(item.bonusQuantity) || 0));
        if (totalSellableUnits < 0 || totalSellableUnits + bonusUnits <= 0) {
          throw new PurchaseValidationError(`${medLabel}: quantity (or bonus) must be greater than zero`);
        }

        const boxCost = Number(item.confirmedPurchaseCostPerBox) || Number(item.purchasePrice) || 0;
        const boxMrp = Number(item.printedMrpPerBox) || Number(item.mrp) || Number(item.salePrice) || Number((boxCost * 1.25).toFixed(2));
        if (boxCost < 0 || boxMrp < 0) throw new PurchaseValidationError(`${medLabel}: prices cannot be negative`);

        const perUnitCost = unitsPerBox > 1 ? Math.round((boxCost / unitsPerBox) * 10000) / 10000 : boxCost;
        const perUnitSaleMrp = unitsPerBox > 1 ? Math.round((boxMrp / unitsPerBox) * 100) / 100 : boxMrp;
        const lineTotal = Number(item.lineTotal) || Number((boxesReceived * boxCost).toFixed(2));

        const existingBatch = findBatch.get(medId, batchNum) as any;
        let batchId: number;
        let newBatchQty: number;
        const incomingQty = totalSellableUnits + bonusUnits;

        if (existingBatch) {
          // Same medicine + same batch: top up the existing batch, do not create a parallel row.
          if (existingBatch.expiry_date !== expiry && !item.overrideBatchExpiry) {
            throw new PurchaseValidationError(
              `${medLabel}: batch ${batchNum} is already in stock with expiry ${existingBatch.expiry_date}, but this invoice says ${expiry}. Correct the expiry (or confirm the stock expiry should change) and save again.`
            );
          }
          batchId = existingBatch.id;
          newBatchQty = existingBatch.quantity + incomingQty;
          const weightedUnitCost = newBatchQty > 0
            ? ((existingBatch.quantity * existingBatch.purchase_price) + (incomingQty * perUnitCost)) / newBatchQty
            : perUnitCost;

          db.prepare(`
            UPDATE batches SET
              quantity = ?,
              purchase_price = ?,
              sale_price = ?,
              bonus_quantity = bonus_quantity + ?,
              expiry_date = ?,
              mfg_date = COALESCE(?, mfg_date),
              supplier_id = COALESCE(supplier_id, ?),
              status = 'ACTIVE',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newBatchQty, Math.round(weightedUnitCost * 10000) / 10000, perUnitSaleMrp, bonusUnits, expiry, mfgDate, supplier.id, batchId);
          stockSummary.push({ medicineId: medId, batchNumber: batchNum, action: 'ADDED_TO_EXISTING_BATCH', unitsAdded: incomingQty, batchQuantityAfter: newBatchQty });
        } else {
          // Same medicine + different batch (or a brand-new medicine): a separate batch row.
          newBatchQty = incomingQty;
          const bResult = db.prepare(`
            INSERT INTO batches (
              medicine_id, batch_number, expiry_date, mfg_date, purchase_price,
              sale_price, quantity, bonus_quantity, supplier_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `).run(medId, batchNum, expiry, mfgDate, perUnitCost, perUnitSaleMrp, newBatchQty, bonusUnits, supplier.id);
          batchId = Number(bResult.lastInsertRowid);
          stockSummary.push({ medicineId: medId, batchNumber: batchNum, action: 'NEW_BATCH', unitsAdded: incomingQty, batchQuantityAfter: newBatchQty });
        }

        db.prepare(`
          INSERT INTO stock_movements (
            batch_id, movement_type, quantity_change, balance_after,
            reference_type, reference_id, notes, user_id
          ) VALUES (?, 'PURCHASE', ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
        `).run(
          batchId,
          incomingQty,
          newBatchQty,
          invoiceNo,
          `Inward stock purchase from ${supplier.name} (${boxesReceived} boxes × ${unitsPerBox} units${bonusUnits ? ` + ${bonusUnits} bonus` : ''})`,
          req.user?.id
        );

        insertItem.run(
          purchaseId,
          medId,
          batchId,
          batchNum,
          expiry,
          mfgDate,
          perUnitCost,
          perUnitSaleMrp,
          totalSellableUnits,
          bonusUnits,
          Number(item.lineDiscount) || 0,
          lineTotal,
          boxesReceived,
          stripsPerBox,
          unitsPerStrip,
          boxMrp,
          boxCost,
          'PER_BOX'
        );
      });

      // 3. Update Supplier Balance & Ledger
      const newSupplierBalance = supplier.current_balance + remaining;
      db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newSupplierBalance, supplier.id);

      db.prepare(`
        INSERT INTO supplier_ledgers (
          supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes
        ) VALUES (?, 'PURCHASE_INWARD', ?, ?, ?, ?, ?)
      `).run(
        supplier.id,
        invoiceNo,
        paid,
        total,
        newSupplierBalance,
        `Purchase Invoice #${invoiceNo} (Total: Rs. ${total}, Paid: Rs. ${paid})`
      );

      // 4. Cashbook Entry if cash paid
      if (paid > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (
            entry_type, category, amount, reference_type, reference_id, description, created_by
          ) VALUES ('OUT', 'SUPPLIER_PAYMENT', ?, 'PURCHASE', ?, ?, ?)
        `).run(
          paid,
          String(purchaseId),
          `Immediate cash payment for Purchase #${invoiceNo} to ${supplier.name}`,
          req.user?.id
        );
      }

      // 5. Audit Log
      logAudit({
        userId: req.user?.id,
        action: 'CREATE_PURCHASE',
        entity: 'PURCHASES',
        entityId: Number(purchaseId),
        newValues: { invoiceNumber: invoiceNo, supplierName: supplier.name, total, paid, remaining, createdMedicines, stockSummary },
        ipAddress: req.ip
      });

      return {
        purchaseId: Number(purchaseId),
        invoiceNumber: invoiceNo,
        supplierId: supplier.id,
        total,
        remaining,
        newSupplierBalance,
        createdMedicines,
        stockSummary
      };
    });

    triggerAutoSync(`purchase ${result.invoiceNumber}`);
    res.status(201).json({ message: 'Purchase invoice recorded and stock batches updated', ...result });
  } catch (err: any) {
    res.status(err instanceof PurchaseValidationError ? err.status : 400).json({ error: err.message });
  }
});
