import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';
import {
  generateReturnNumber,
  getReturnPolicy,
  computeEligibility,
  getRemainingReturnable,
  computeReturnMath,
  DeductionType
} from '../services/returnsService.js';
import { linkReturn } from '../services/scheduleBDRegisterService.js';

export const returnsRouter = Router();

const RETURN_TYPES = new Set(['RETURN', 'REFUND', 'REPLACE']);
const DISPOSITIONS = new Set(['RESTOCK_SELLABLE', 'QUARANTINE', 'DAMAGED', 'EXPIRED', 'SUPPLIER_RETURN', 'DISPOSAL']);
const DEDUCTION_TYPES = new Set(['NONE', 'PERCENTAGE', 'FIXED']);

function recomputeSaleStatus(saleId: number): void {
  const saleItems = db.prepare('SELECT id, quantity FROM sale_items WHERE sale_id = ?').all(saleId) as { id: number; quantity: number }[];
  if (saleItems.length === 0) return;

  let anyReturned = false;
  let allFullyReturned = true;
  for (const si of saleItems) {
    const remaining = getRemainingReturnable(si.id);
    if (remaining < si.quantity) anyReturned = true;
    if (remaining > 0) allFullyReturned = false;
  }

  const newStatus = allFullyReturned ? 'RETURNED' : (anyReturned ? 'PARTIALLY_RETURNED' : 'COMPLETED');
  db.prepare('UPDATE sales SET status = ? WHERE id = ?').run(newStatus, saleId);
}

// GET /api/returns/lookup/:invoiceNumber - find an original sale and its return-eligibility
returnsRouter.get('/lookup/:invoiceNumber', authenticateToken, requirePermission('return_sales'), (req: AuthenticatedRequest, res: Response) => {
  const rawNum = String(req.params.invoiceNumber || '').trim();
  const cleanNum = rawNum.replace(/^#/, '').trim();
  if (!cleanNum) {
    res.status(400).json({ error: 'Invoice number required' });
    return;
  }

  const saleQuery = `
    SELECT s.*, c.name as customer_name, c.mobile as customer_phone, c.current_balance as customer_balance,
      u.full_name as cashier_name, bp.name as billing_person_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.cashier_id = u.id
    LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
    WHERE LOWER(s.invoice_number) = LOWER(?) OR s.invoice_number = ?
  `;
  let sale = db.prepare(saleQuery).get(cleanNum, cleanNum) as any;

  if (!sale) {
    sale = db.prepare(`
      SELECT s.*, c.name as customer_name, c.mobile as customer_phone, c.current_balance as customer_balance,
        u.full_name as cashier_name, bp.name as billing_person_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
      WHERE s.invoice_number LIKE ?
      ORDER BY s.id DESC LIMIT 1
    `).get(`%${cleanNum}%`) as any;
  }

  if (!sale) {
    res.status(404).json({ error: `Invoice '${cleanNum}' not found in system` });
    return;
  }

  const items = db.prepare(`
    SELECT si.*, m.brand_name, m.strength, m.dosage_form, m.pack_size,
      COALESCE(m.tablets_per_pack, 10) as tablets_per_pack, m.stock_unit,
      b.batch_number, b.expiry_date, b.quantity as batch_current_quantity
    FROM sale_items si
    JOIN medicines m ON si.medicine_id = m.id
    JOIN batches b ON si.batch_id = b.id
    WHERE si.sale_id = ?
    ORDER BY si.id ASC
  `).all(sale.id) as any[];

  const itemsWithReturnInfo = items.map((it) => {
    const remaining = getRemainingReturnable(it.id);
    return { ...it, already_returned: it.quantity - remaining, remaining_returnable: remaining };
  });

  const policy = getReturnPolicy();
  const eligibility = computeEligibility(sale.created_at, policy);

  const previousReturns = db.prepare(`
    SELECT * FROM sales_returns WHERE sale_id = ? ORDER BY id DESC
  `).all(sale.id);

  res.json({ sale, items: itemsWithReturnInfo, eligibility, policy, previousReturns });
});

// GET /api/returns - list/search return history
returnsRouter.get('/', authenticateToken, requirePermission('return_sales'), (req: AuthenticatedRequest, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const status = req.query.status as string | undefined;

  let query = `
    SELECT sr.*, c.name as customer_name, u.full_name as cashier_name
    FROM sales_returns sr
    LEFT JOIN customers c ON sr.customer_id = c.id
    LEFT JOIN users u ON sr.cashier_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (q) {
    query += ` AND (sr.return_number LIKE ? OR sr.invoice_number LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    query += ` AND sr.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY sr.id DESC LIMIT 200`;

  const returns = db.prepare(query).all(...params);
  res.json({ returns });
});

// GET /api/returns/:id - single return with line items (for reprint/reversal)
returnsRouter.get('/:id', authenticateToken, requirePermission('return_sales'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const sr = db.prepare(`
    SELECT sr.*, c.name as customer_name, u.full_name as cashier_name
    FROM sales_returns sr
    LEFT JOIN customers c ON sr.customer_id = c.id
    LEFT JOIN users u ON sr.cashier_id = u.id
    WHERE sr.id = ?
  `).get(id);

  if (!sr) {
    res.status(404).json({ error: 'Return not found' });
    return;
  }

  const items = db.prepare('SELECT * FROM sale_return_items WHERE sales_return_id = ?').all(id);
  const replacementItems = db.prepare('SELECT * FROM replacement_items WHERE sales_return_id = ?').all(id);

  res.json({ return: sr, items, replacementItems });
});

interface ReturnItemInput {
  saleItemId: number;
  quantityReturned: number;
  disposition: string;
}

interface ReplacementItemInput {
  medicineId: number;
  batchId?: number;
  quantity: number;
  unitPrice?: number;
}

// POST /api/returns - the atomic RETURN / REFUND / REPLACE handler
returnsRouter.post('/', authenticateToken, requirePermission('return_sales'), (req: AuthenticatedRequest, res: Response) => {
  const {
    saleId,
    returnType,
    returnReason,
    reasonNotes,
    items,
    deductionType,
    deductionValue,
    refundMethod,
    replacementItems,
    notes,
    requestKey
  } = req.body;

  if (!saleId) {
    res.status(400).json({ error: 'saleId is required' });
    return;
  }
  if (!RETURN_TYPES.has(returnType)) {
    res.status(400).json({ error: 'returnType must be RETURN, REFUND or REPLACE' });
    return;
  }
  if (!returnReason || !String(returnReason).trim()) {
    res.status(400).json({ error: 'Return reason is required' });
    return;
  }

  const returnItems: ReturnItemInput[] = Array.isArray(items) ? items : [];
  const newReplacementItems: ReplacementItemInput[] = Array.isArray(replacementItems) ? replacementItems : [];

  if (returnItems.length === 0 && newReplacementItems.length === 0) {
    res.status(400).json({ error: 'At least one returned item or replacement item is required' });
    return;
  }
  if (returnType === 'REPLACE' && newReplacementItems.length === 0) {
    res.status(400).json({ error: 'Replacement requires at least one replacement item' });
    return;
  }

  const dType: DeductionType = DEDUCTION_TYPES.has(deductionType) ? deductionType : 'NONE';
  const dValue = Number(deductionValue) || 0;
  const key = requestKey ? String(requestKey).trim() : null;

  // Fast-path idempotency check before opening a transaction.
  if (key) {
    const existing = db.prepare('SELECT * FROM sales_returns WHERE request_key = ?').get(key) as any;
    if (existing) {
      res.status(200).json({ message: 'Return already processed', return: existing, idempotentReplay: true });
      return;
    }
  }

  try {
    const result = runTransaction(() => {
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(Number(saleId)) as any;
      if (!sale) throw new Error('Original sale not found');

      const returnNumber = generateReturnNumber();
      const today = new Date().toISOString().split('T')[0];

      // 1. Validate + compute returned items (no writes yet)
      const processedReturnItems: any[] = [];
      let grossReturnAmount = 0;

      for (const raw of returnItems) {
        const saleItemId = Number(raw.saleItemId);
        const qty = Number(raw.quantityReturned);
        const disposition = String(raw.disposition || '');

        if (!saleItemId || isNaN(qty) || qty <= 0) throw new Error('Invalid return item or quantity');
        if (!DISPOSITIONS.has(disposition)) throw new Error(`Invalid stock disposition: ${disposition}`);

        const saleItem = db.prepare(`
          SELECT si.*, b.batch_number, b.expiry_date
          FROM sale_items si JOIN batches b ON si.batch_id = b.id
          WHERE si.id = ? AND si.sale_id = ?
        `).get(saleItemId, sale.id) as any;

        if (!saleItem) throw new Error(`Sale item ${saleItemId} does not belong to invoice ${sale.invoice_number}`);

        // Re-validate remaining quantity INSIDE the transaction - never trust client-sent values.
        const remaining = getRemainingReturnable(saleItemId);
        if (qty > remaining) {
          throw new Error(`Cannot return ${qty} units — only ${remaining} unit(s) remain returnable for this item`);
        }

        const lineReturnAmount = round2(saleItem.unit_price * qty);
        grossReturnAmount += lineReturnAmount;

        processedReturnItems.push({
          saleItemId,
          medicineId: saleItem.medicine_id,
          batchId: saleItem.batch_id,
          quantityReturned: qty,
          unitPrice: saleItem.unit_price,
          lineReturnAmount,
          disposition,
          descriptionSnapshot: saleItem.description_snapshot,
          batchNumberSnapshot: saleItem.batch_number,
          expiryDateSnapshot: saleItem.expiry_date
        });
      }

      const { deductionAmount, netReturnAmount } = computeReturnMath(round2(grossReturnAmount), dType, dValue);

      // 2. Validate + stock-out replacement items (writes happen here; rolled back automatically on any later throw)
      const processedReplacementItems: any[] = [];
      let replacementSaleAmount = 0;

      for (const raw of newReplacementItems) {
        const medicineId = Number(raw.medicineId);
        const qty = Number(raw.quantity);
        if (!medicineId || isNaN(qty) || qty <= 0) throw new Error('Invalid replacement item or quantity');

        let batch: any;
        if (raw.batchId) {
          batch = db.prepare('SELECT * FROM batches WHERE id = ? AND medicine_id = ?').get(Number(raw.batchId), medicineId);
          if (!batch) throw new Error(`Replacement batch ${raw.batchId} not found for the selected medicine`);
        } else {
          batch = db.prepare(`
            SELECT * FROM batches
            WHERE medicine_id = ? AND quantity > 0 AND expiry_date > date('now') AND status = 'ACTIVE'
            ORDER BY expiry_date ASC LIMIT 1
          `).get(medicineId);
          if (!batch) throw new Error('No available stock to issue as a replacement for the selected medicine');
        }

        if (batch.expiry_date <= today) throw new Error(`Replacement batch ${batch.batch_number} is expired`);
        if (batch.quantity < qty) throw new Error(`Insufficient replacement stock in batch ${batch.batch_number}. Available: ${batch.quantity}`);

        const medicine = db.prepare('SELECT brand_name, strength FROM medicines WHERE id = ?').get(medicineId) as any;
        const unitPrice = Number(raw.unitPrice) || batch.sale_price;
        const lineTotal = round2(unitPrice * qty);
        replacementSaleAmount += lineTotal;

        const newBatchQty = batch.quantity - qty;
        db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBatchQty, batch.id);
        db.prepare(`
          INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
          VALUES (?, 'SALE', ?, ?, 'SALE_RETURN_REPLACEMENT', ?, ?, ?)
        `).run(batch.id, -qty, newBatchQty, returnNumber, `Replacement issued on return #${returnNumber}`, req.user?.id);

        processedReplacementItems.push({
          medicineId,
          batchId: batch.id,
          quantity: qty,
          unitPrice,
          lineTotal,
          descriptionSnapshot: medicine ? `${medicine.brand_name}${medicine.strength ? ' ' + medicine.strength : ''}` : null,
          batchNumberSnapshot: batch.batch_number,
          expiryDateSnapshot: batch.expiry_date
        });
      }

      // 3. Settlement math
      const netAfterReplacement = round2(netReturnAmount - replacementSaleAmount);
      const customerId = sale.customer_id;

      let cashRefundAmount = 0;
      let creditAdjustmentAmount = 0;
      let balanceDueFromCustomer = 0;
      let balanceDueToCustomer = 0;
      let extraChargeMethod: string | null = null;

      // A plain RETURN just moves stock — no money changes hands. Only REFUND and REPLACE settle money.
      if (returnType !== 'RETURN') {
        if (netAfterReplacement > 0) {
          balanceDueToCustomer = netAfterReplacement;
          if (!refundMethod) throw new Error('Refund method is required when an amount is owed back to the customer');
          if (refundMethod === 'CREDIT_NOTE') {
            if (!customerId) throw new Error('Credit note requires a registered customer on the original sale');
            creditAdjustmentAmount = netAfterReplacement;
          } else {
            cashRefundAmount = netAfterReplacement;
          }
        } else if (netAfterReplacement < 0) {
          balanceDueFromCustomer = Math.abs(netAfterReplacement);
          if (!refundMethod) throw new Error('Payment method is required for the extra amount owed by the customer');
          if (refundMethod === 'CREDIT_NOTE') {
            if (!customerId) throw new Error('Crediting the extra amount owed requires a registered customer on the original sale');
            extraChargeMethod = 'CREDIT_NOTE';
          } else {
            extraChargeMethod = 'CASH_IN';
          }
        }
      }

      // 4. Insert sales_returns header
      const insertReturn = db.prepare(`
        INSERT INTO sales_returns (
          return_number, sale_id, invoice_number, customer_id, cashier_id,
          return_type, return_reason, reason_notes,
          gross_return_amount, deduction_type, deduction_value, deduction_amount, net_return_amount,
          refund_method, cash_refund_amount, credit_adjustment_amount, replacement_sale_amount,
          balance_due_from_customer, balance_due_to_customer, extra_charge_method,
          status, request_key, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
      `);

      const returnResult = insertReturn.run(
        returnNumber, sale.id, sale.invoice_number, customerId || null, req.user?.id,
        returnType, String(returnReason).trim(), reasonNotes ? String(reasonNotes).trim() : null,
        round2(grossReturnAmount), dType, dValue, deductionAmount, netReturnAmount,
        refundMethod || null, cashRefundAmount, creditAdjustmentAmount, round2(replacementSaleAmount),
        balanceDueFromCustomer, balanceDueToCustomer, extraChargeMethod,
        key, notes ? String(notes).trim() : null
      );

      const returnId = returnResult.lastInsertRowid;

      // 5. Insert sale_return_items + apply stock-in per disposition
      const insertReturnItem = db.prepare(`
        INSERT INTO sale_return_items (
          sales_return_id, sale_item_id, medicine_id, batch_id, quantity_returned, unit_price,
          line_return_amount, disposition, description_snapshot, batch_number_snapshot, expiry_date_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ri of processedReturnItems) {
        const returnItemResult = insertReturnItem.run(
          returnId, ri.saleItemId, ri.medicineId, ri.batchId, ri.quantityReturned, ri.unitPrice,
          ri.lineReturnAmount, ri.disposition, ri.descriptionSnapshot, ri.batchNumberSnapshot, ri.expiryDateSnapshot
        );

        // If this sale item was a Schedule B/D dispense, keep its register entry linked to the return
        // (financial refund stays separate from this inventory disposition - see disposition above).
        const registerEntry = db.prepare('SELECT id FROM schedule_bd_register_entries WHERE sale_item_id = ?').get(ri.saleItemId) as { id: number } | undefined;
        if (registerEntry) {
          linkReturn(registerEntry.id, Number(returnId), Number(returnItemResult.lastInsertRowid), ri.quantityReturned);
        }

        if (ri.disposition === 'RESTOCK_SELLABLE') {
          const batch = db.prepare('SELECT quantity FROM batches WHERE id = ?').get(ri.batchId) as any;
          const newQty = (batch?.quantity || 0) + ri.quantityReturned;
          db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, ri.batchId);
          db.prepare(`
            INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
            VALUES (?, 'RETURN_IN', ?, ?, 'SALE_RETURN', ?, ?, ?)
          `).run(ri.batchId, ri.quantityReturned, newQty, returnNumber, `Return restocked to sellable inventory on #${returnNumber}`, req.user?.id);
        } else {
          const batch = db.prepare('SELECT quantity FROM batches WHERE id = ?').get(ri.batchId) as any;
          db.prepare(`
            INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
            VALUES (?, 'RETURN_IN', 0, ?, 'SALE_RETURN', ?, ?, ?)
          `).run(ri.batchId, batch?.quantity || 0, returnNumber, `Returned item set to ${ri.disposition} on #${returnNumber} (not restocked to sellable)`, req.user?.id);
        }
      }

      // 6. Insert replacement_items rows (stock-out already applied above)
      const insertReplacementItem = db.prepare(`
        INSERT INTO replacement_items (
          sales_return_id, medicine_id, batch_id, quantity, unit_price, line_total,
          description_snapshot, batch_number_snapshot, expiry_date_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const rep of processedReplacementItems) {
        insertReplacementItem.run(
          returnId, rep.medicineId, rep.batchId, rep.quantity, rep.unitPrice, rep.lineTotal,
          rep.descriptionSnapshot, rep.batchNumberSnapshot, rep.expiryDateSnapshot
        );
      }

      // 7. Money settlement writes
      if (cashRefundAmount > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
          VALUES ('OUT', 'SALE_RETURN', ?, 'SALE_RETURN', ?, ?, ?)
        `).run(cashRefundAmount, returnNumber, `Refund for return #${returnNumber} (Invoice ${sale.invoice_number})`, req.user?.id);
      }

      if (creditAdjustmentAmount > 0 && customerId) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
        if (customer) {
          const newBal = round2(customer.current_balance - creditAdjustmentAmount);
          db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBal, customerId);
          db.prepare(`
            INSERT INTO customer_ledgers (customer_id, transaction_type, reference_id, debit, credit, balance_after, notes)
            VALUES (?, 'RETURN_REFUND', ?, 0, ?, ?, ?)
          `).run(customerId, returnNumber, creditAdjustmentAmount, newBal, `Return credit for #${returnNumber} (Invoice ${sale.invoice_number})`);
        }
      }

      if (balanceDueFromCustomer > 0) {
        if (extraChargeMethod === 'CREDIT_NOTE' && customerId) {
          const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
          if (customer) {
            const newBal = round2(customer.current_balance + balanceDueFromCustomer);
            db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBal, customerId);
            db.prepare(`
              INSERT INTO customer_ledgers (customer_id, transaction_type, reference_id, debit, credit, balance_after, notes)
              VALUES (?, 'SALE_CREDIT', ?, ?, 0, ?, ?)
            `).run(customerId, returnNumber, balanceDueFromCustomer, newBal, `Extra charge for replacement on return #${returnNumber}`);
          }
        } else {
          db.prepare(`
            INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
            VALUES ('IN', 'SALE_RETURN_REPLACEMENT', ?, 'SALE_RETURN', ?, ?, ?)
          `).run(balanceDueFromCustomer, returnNumber, `Extra payment for replacement on return #${returnNumber}`, req.user?.id);
        }
      }

      // 8. Recompute original sale status (only if something was actually returned)
      if (processedReturnItems.length > 0) {
        recomputeSaleStatus(sale.id);
      }

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_RETURN',
        entity: 'SALES_RETURNS',
        entityId: Number(returnId),
        newValues: {
          returnNumber, invoiceNumber: sale.invoice_number, returnType,
          grossReturnAmount: round2(grossReturnAmount), deductionAmount, netReturnAmount,
          replacementSaleAmount: round2(replacementSaleAmount), cashRefundAmount, creditAdjustmentAmount,
          balanceDueFromCustomer, balanceDueToCustomer
        },
        ipAddress: req.ip
      });

      return {
        returnId,
        returnNumber,
        saleId: sale.id,
        invoiceNumber: sale.invoice_number,
        returnType,
        items: processedReturnItems,
        replacementItems: processedReplacementItems,
        grossReturnAmount: round2(grossReturnAmount),
        deductionType: dType,
        deductionValue: dValue,
        deductionAmount,
        netReturnAmount,
        replacementSaleAmount: round2(replacementSaleAmount),
        cashRefundAmount,
        creditAdjustmentAmount,
        balanceDueFromCustomer,
        balanceDueToCustomer,
        refundMethod: refundMethod || null,
        createdAt: new Date().toISOString()
      };
    });

    triggerAutoSync(`return ${result.returnNumber}`);
    res.status(201).json({ message: 'Return processed successfully', return: result });
  } catch (err: any) {
    if (String(err.message || '').includes('UNIQUE constraint failed') && String(err.message || '').includes('request_key')) {
      const existing = key ? db.prepare('SELECT * FROM sales_returns WHERE request_key = ?').get(key) : null;
      res.status(200).json({ message: 'Return already processed', return: existing, idempotentReplay: true });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to process return' });
  }
});

// POST /api/returns/:id/reverse - Admin-only reversal (never deletes the original record)
returnsRouter.post('/:id/reverse', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    res.status(400).json({ error: 'Reversal reason is required' });
    return;
  }

  try {
    const existing = db.prepare('SELECT * FROM sales_returns WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Return not found' });
      return;
    }
    if (existing.status === 'REVERSED') {
      res.status(400).json({ error: 'This return has already been reversed' });
      return;
    }

    const userId = req.user?.id;
    const trimmedReason = String(reason).trim();

    runTransaction(() => {
      const returnItemRows = db.prepare('SELECT * FROM sale_return_items WHERE sales_return_id = ?').all(id) as any[];
      const replacementItemRows = db.prepare('SELECT * FROM replacement_items WHERE sales_return_id = ?').all(id) as any[];

      // 1. Undo stock-in from the return
      for (const ri of returnItemRows) {
        if (ri.disposition === 'RESTOCK_SELLABLE') {
          const batch = db.prepare('SELECT quantity FROM batches WHERE id = ?').get(ri.batch_id) as any;
          const newQty = Math.max(0, (batch?.quantity || 0) - ri.quantity_returned);
          db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, ri.batch_id);
          db.prepare(`
            INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
            VALUES (?, 'RETURN_OUT', ?, ?, 'SALE_RETURN_REVERSAL', ?, ?, ?)
          `).run(ri.batch_id, -ri.quantity_returned, newQty, existing.return_number, `Reversal of return #${existing.return_number}: ${trimmedReason}`, userId);
        } else {
          const batch = db.prepare('SELECT quantity FROM batches WHERE id = ?').get(ri.batch_id) as any;
          db.prepare(`
            INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
            VALUES (?, 'RETURN_OUT', 0, ?, 'SALE_RETURN_REVERSAL', ?, ?, ?)
          `).run(ri.batch_id, batch?.quantity || 0, existing.return_number, `Reversal of return #${existing.return_number} (disposition was ${ri.disposition}, no stock change to undo): ${trimmedReason}`, userId);
        }
      }

      // 2. Undo replacement stock-out (restock the batch it was issued from)
      for (const rep of replacementItemRows) {
        const batch = db.prepare('SELECT quantity FROM batches WHERE id = ?').get(rep.batch_id) as any;
        const newQty = (batch?.quantity || 0) + rep.quantity;
        db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, rep.batch_id);
        db.prepare(`
          INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
          VALUES (?, 'RETURN_IN', ?, ?, 'SALE_RETURN_REVERSAL', ?, ?, ?)
        `).run(rep.batch_id, rep.quantity, newQty, existing.return_number, `Reversal of replacement on return #${existing.return_number}: ${trimmedReason}`, userId);
      }

      // 3. Reverse cashbook refund (offsetting entry, original never deleted)
      if (existing.cash_refund_amount > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
          VALUES ('IN', 'REVERSAL', ?, 'SALE_RETURN_REVERSAL', ?, ?, ?)
        `).run(existing.cash_refund_amount, existing.return_number, `Reversal of refund for return #${existing.return_number}: ${trimmedReason}`, userId);
      }
      if (existing.balance_due_from_customer > 0 && existing.extra_charge_method === 'CASH_IN') {
        db.prepare(`
          INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
          VALUES ('OUT', 'REVERSAL', ?, 'SALE_RETURN_REVERSAL', ?, ?, ?)
        `).run(existing.balance_due_from_customer, existing.return_number, `Reversal of extra replacement payment for return #${existing.return_number}: ${trimmedReason}`, userId);
      }

      // 4. Reverse customer ledger / balance
      if (existing.customer_id) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.customer_id) as any;
        if (customer) {
          let newBal = customer.current_balance;
          if (existing.credit_adjustment_amount > 0) {
            newBal = round2(newBal + existing.credit_adjustment_amount);
            db.prepare(`
              INSERT INTO customer_ledgers (customer_id, transaction_type, reference_id, debit, credit, balance_after, notes)
              VALUES (?, 'PAYMENT_RECEIVED', ?, ?, 0, ?, ?)
            `).run(existing.customer_id, existing.return_number, existing.credit_adjustment_amount, newBal, `Reversal of return credit #${existing.return_number}: ${trimmedReason}`);
          }
          if (existing.balance_due_from_customer > 0 && existing.extra_charge_method === 'CREDIT_NOTE') {
            newBal = round2(newBal - existing.balance_due_from_customer);
            db.prepare(`
              INSERT INTO customer_ledgers (customer_id, transaction_type, reference_id, debit, credit, balance_after, notes)
              VALUES (?, 'RETURN_REFUND', ?, 0, ?, ?, ?)
            `).run(existing.customer_id, existing.return_number, existing.balance_due_from_customer, newBal, `Reversal of extra replacement charge on return #${existing.return_number}: ${trimmedReason}`);
          }
          if (newBal !== customer.current_balance) {
            db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBal, existing.customer_id);
          }
        }
      }

      // 5. Mark the return reversed FIRST, then recompute sale status so it no longer counts this return
      db.prepare(`
        UPDATE sales_returns SET status = 'REVERSED', reversed_by = ?, reversed_at = CURRENT_TIMESTAMP, reversal_reason = ?
        WHERE id = ?
      `).run(userId, trimmedReason, id);

      recomputeSaleStatus(existing.sale_id);

      logAudit({
        userId,
        action: 'REVERSE_RETURN',
        entity: 'SALES_RETURNS',
        entityId: id,
        oldValues: { status: 'COMPLETED' },
        newValues: { status: 'REVERSED', reason: trimmedReason },
        ipAddress: req.ip
      });
    });

    triggerAutoSync(`return reversal ${existing.return_number}`);
    res.json({ message: `Return ${existing.return_number} reversed successfully` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reverse return' });
  }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
