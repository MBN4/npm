import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

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

// Record inward purchase invoice (Atomic Transaction)
purchaseRouter.post('/', authenticateToken, requirePermission('create_purchases'), (req: AuthenticatedRequest, res: Response) => {
  const {
    supplierId, invoiceNumber, purchaseDate, items,
    subtotal, discount, tax, totalAmount, paidAmount, paymentMethod, notes
  } = req.body;

  if (!supplierId || !invoiceNumber || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Supplier, invoice number, and at least one item are required' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as any;
      if (!supplier) {
        throw new Error('Supplier does not exist');
      }

      const total = Number(totalAmount) || 0;
      const paid = Number(paidAmount) || 0;
      const remaining = Math.max(0, total - paid);
      let status = 'PAID';
      if (remaining > 0 && paid > 0) status = 'PARTIAL';
      else if (remaining > 0 && paid === 0) status = 'UNPAID';

      // 1. Insert Purchase Invoice
      const insertPurchase = db.prepare(`
        INSERT INTO purchases (
          invoice_number, supplier_id, purchase_date, subtotal, discount, tax,
          total_amount, paid_amount, remaining_amount, payment_status, payment_method,
          created_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const pResult = insertPurchase.run(
        invoiceNumber.trim(),
        supplierId,
        purchaseDate || new Date().toISOString().split('T')[0],
        Number(subtotal) || total,
        Number(discount) || 0,
        Number(tax) || 0,
        total,
        paid,
        remaining,
        status,
        paymentMethod || 'CASH',
        req.user?.id,
        notes || null
      );

      const purchaseId = pResult.lastInsertRowid;

      // 2. Process Items and update Batches & Stock Movements
      const insertItem = db.prepare(`
        INSERT INTO purchase_items (
          purchase_id, medicine_id, batch_id, batch_number, expiry_date, mfg_date,
          purchase_price, sale_price, quantity, bonus_quantity, line_discount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        const medId = Number(item.medicineId);
        const batchNum = String(item.batchNumber).trim();
        const expiry = String(item.expiryDate).trim();
        const qty = Number(item.quantity) || 0;
        const bonus = Number(item.bonusQuantity) || 0;
        const costPrice = Number(item.purchasePrice) || 0;
        const salePrice = Number(item.salePrice) || 0;
        const lineTotal = Number(item.lineTotal) || (qty * costPrice);

        if (!medId || !batchNum || !expiry || qty <= 0) {
          throw new Error(`Invalid item details for medicine ID: ${medId}`);
        }

        // Check if this batch already exists for this medicine
        const existingBatch = db.prepare(`
          SELECT id, quantity, purchase_price FROM batches WHERE medicine_id = ? AND batch_number = ?
        `).get(medId, batchNum) as any;

        let batchId: number;
        let newBatchQty: number;

        if (existingBatch) {
          batchId = existingBatch.id;
          const incomingQty = qty + bonus;
          newBatchQty = existingBatch.quantity + incomingQty;
          // Weighted-average the cost across old + newly received stock so already-received/possibly-sold
          // units aren't silently re-valued at the new invoice's cost.
          const weightedCost = newBatchQty > 0
            ? ((existingBatch.quantity * existingBatch.purchase_price) + (incomingQty * costPrice)) / newBatchQty
            : costPrice;
          db.prepare(`
            UPDATE batches SET
              quantity = ?,
              purchase_price = ?,
              sale_price = ?,
              bonus_quantity = bonus_quantity + ?,
              expiry_date = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newBatchQty, Math.round(weightedCost * 100) / 100, salePrice, bonus, expiry, batchId);
        } else {
          newBatchQty = qty + bonus;
          const bResult = db.prepare(`
            INSERT INTO batches (
              medicine_id, batch_number, expiry_date, mfg_date, purchase_price,
              sale_price, quantity, bonus_quantity, supplier_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `).run(
            medId,
            batchNum,
            expiry,
            item.mfgDate || null,
            costPrice,
            salePrice,
            newBatchQty,
            bonus,
            supplierId
          );
          batchId = Number(bResult.lastInsertRowid);
        }

        // Record stock movement (Traceability)
        db.prepare(`
          INSERT INTO stock_movements (
            batch_id, movement_type, quantity_change, balance_after,
            reference_type, reference_id, notes, user_id
          ) VALUES (?, 'PURCHASE', ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
        `).run(
          batchId,
          qty + bonus,
          newBatchQty,
          invoiceNumber,
          `Inward stock purchase from ${supplier.name}`,
          req.user?.id
        );

        // Record purchase item
        insertItem.run(
          purchaseId,
          medId,
          batchId,
          batchNum,
          expiry,
          item.mfgDate || null,
          costPrice,
          salePrice,
          qty,
          bonus,
          Number(item.lineDiscount) || 0,
          lineTotal
        );
      }

      // 3. Update Supplier Balance & Ledger
      const newSupplierBalance = supplier.current_balance + remaining;
      db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newSupplierBalance, supplierId);

      db.prepare(`
        INSERT INTO supplier_ledgers (
          supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes
        ) VALUES (?, 'PURCHASE_INWARD', ?, ?, ?, ?, ?)
      `).run(
        supplierId,
        invoiceNumber,
        paid, // debit: what was paid immediately
        total, // credit: total cost of bill
        newSupplierBalance,
        `Purchase Invoice #${invoiceNumber} (Total: Rs. ${total}, Paid: Rs. ${paid})`
      );

      // 4. If paid amount > 0, log in Cashbook
      if (paid > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (
            entry_type, category, amount, reference_type, reference_id, description, created_by
          ) VALUES ('OUT', 'SUPPLIER_PAYMENT', ?, 'PURCHASE', ?, ?, ?)
        `).run(
          paid,
          String(purchaseId),
          `Immediate cash payment for Purchase #${invoiceNumber} to ${supplier.name}`,
          req.user?.id
        );
      }

      // 5. Audit Log
      logAudit({
        userId: req.user?.id,
        action: 'CREATE_PURCHASE',
        entity: 'PURCHASES',
        entityId: Number(purchaseId),
        newValues: { invoiceNumber, supplierName: supplier.name, total, paid, remaining },
        ipAddress: req.ip
      });

      return { purchaseId, invoiceNumber, total, remaining, newSupplierBalance };
    });

    res.status(201).json({ message: 'Purchase invoice recorded and stock batches updated', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
