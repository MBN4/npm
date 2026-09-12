import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const posRouter = Router();

// Fast live search for POS counter with auto-FEFO batch selection
posRouter.get('/search', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const query = (req.query.q as string || '').trim();
  if (!query) {
    res.json({ results: [] });
    return;
  }

  const s = `%${query}%`;

  // Search medicines that match barcode exactly or brand/generic partially
  const medicines = db.prepare(`
    SELECT 
      m.id, m.brand_name, m.strength, m.dosage_form, m.barcode, m.custom_barcode,
      m.rack_location, m.is_prescription_required,
      g.name as generic_name,
      c.name as category_name
    FROM medicines m
    LEFT JOIN generics g ON m.generic_id = g.id
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.is_active = 1 AND (
      m.barcode = ? OR
      m.custom_barcode = ? OR
      m.brand_name LIKE ? OR
      g.name LIKE ?
    )
    LIMIT 25
  `).all(query, query, s, s) as any[];

  // For each medicine, fetch all non-expired active batches ordered by FEFO (earliest expiry first)
  const results = medicines.map(med => {
    const validBatches = db.prepare(`
      SELECT 
        b.id as batch_id, b.batch_number, b.expiry_date, b.sale_price, b.purchase_price,
        b.quantity, b.rack_location as batch_rack,
        CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
      FROM batches b
      WHERE b.medicine_id = ? 
        AND b.quantity > 0 
        AND b.expiry_date > date('now')
        AND b.status = 'ACTIVE'
      ORDER BY b.expiry_date ASC
    `).all(med.id) as any[];

    const totalAvailableStock = validBatches.reduce((acc, b) => acc + b.quantity, 0);
    const fefoBatch = validBatches.length > 0 ? validBatches[0] : null;

    return {
      ...med,
      total_stock: totalAvailableStock,
      fefo_batch: fefoBatch,
      available_batches: validBatches
    };
  });

  res.json({ results });
});

// Single medicine batches (for batch selector dropdown in POS cart)
posRouter.get('/medicines/:id/batches', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const medicineId = Number(req.params.id);

  const batches = db.prepare(`
    SELECT 
      b.*,
      CASE 
        WHEN b.expiry_date <= date('now') THEN 'EXPIRED'
        WHEN b.expiry_date <= date('now', '+90 days') THEN 'NEAR_EXPIRY'
        ELSE 'VALID'
      END as computed_status,
      CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
    FROM batches b
    WHERE b.medicine_id = ? AND b.quantity > 0
    ORDER BY b.expiry_date ASC
  `).all(medicineId);

  res.json({ batches });
});

// Helper to generate unique sequential invoice number
function generateInvoiceNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM sales WHERE invoice_number LIKE ?
  `).get(`INV-${dateStr}-%`) as { cnt: number };

  const nextSeq = String(countRow.cnt + 1).padStart(4, '0');
  return `INV-${dateStr}-${nextSeq}`;
}

// Atomic POS Checkout with strict FEFO and Expired Stock Hard Block
posRouter.post('/checkout', authenticateToken, requirePermission('create_sales'), (req: AuthenticatedRequest, res: Response) => {
  const {
    customerId,
    items, // Array of { medicineId, batchId, quantity, unitPrice, discount }
    subtotal,
    discount,
    tax,
    totalAmount,
    paidAmount,
    paymentMethod, // CASH, CARD, CREDIT, SPLIT
    notes
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Cart is empty. At least one item is required.' });
    return;
  }

  const billTotal = Number(totalAmount) || 0;
  const billPaid = Number(paidAmount) || 0;
  const billDiscount = Number(discount) || 0;
  const billTax = Number(tax) || 0;
  const billSubtotal = Number(subtotal) || billTotal;
  const remaining = Math.max(0, billTotal - billPaid);
  const change = Math.max(0, billPaid - billTotal);

  // If credit sale, customer is strictly required
  if (remaining > 0 && !customerId) {
    res.status(400).json({ error: 'Credit / Udhar sales require a registered customer account' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const invoiceNumber = generateInvoiceNumber();
      const today = new Date().toISOString().split('T')[0];

      // 1. Verify and decrement batches (Strict Expiry Hard Block & Stock Invariants)
      const processedItems: any[] = [];

      for (const item of items) {
        const batchId = Number(item.batchId);
        const qty = Number(item.quantity);

        if (!batchId || isNaN(qty) || qty <= 0) {
          throw new Error('Invalid item quantity or batch selection');
        }

        const batch = db.prepare(`
          SELECT b.*, m.brand_name, m.strength
          FROM batches b
          JOIN medicines m ON b.medicine_id = m.id
          WHERE b.id = ?
        `).get(batchId) as any;

        if (!batch) {
          throw new Error(`Batch ID ${batchId} does not exist`);
        }

        // SERVER-SIDE INVARIANT: EXPIRED STOCK HARD BLOCK
        if (batch.expiry_date <= today) {
          throw new Error(`EXPIRED STOCK CANNOT BE SOLD! Batch ${batch.batch_number} of ${batch.brand_name} expired on ${batch.expiry_date}.`);
        }

        // SERVER-SIDE INVARIANT: NEGATIVE STOCK PROHIBITED
        if (batch.quantity < qty) {
          throw new Error(`Insufficient stock for ${batch.brand_name} (Batch ${batch.batch_number}). Requested: ${qty}, Available: ${batch.quantity}`);
        }

        const newBatchQty = batch.quantity - qty;

        // Decrement batch stock
        db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBatchQty, batchId);

        // Record stock movement (Traceability)
        db.prepare(`
          INSERT INTO stock_movements (
            batch_id, movement_type, quantity_change, balance_after,
            reference_type, reference_id, notes, user_id
          ) VALUES (?, 'SALE', ?, ?, 'POS_SALE', ?, ?, ?)
        `).run(
          batchId,
          -qty,
          newBatchQty,
          invoiceNumber,
          `Sale to ${customerId ? 'Customer #' + customerId : 'Walk-in Cashier Counter'}`,
          req.user?.id
        );

        const unitPrice = Number(item.unitPrice) || batch.sale_price;
        const itemDiscount = Number(item.discount) || 0;
        const lineTotal = (unitPrice * qty) - itemDiscount;

        processedItems.push({
          medicineId: batch.medicine_id,
          batchId: batch.id,
          batchNumber: batch.batch_number,
          expiryDate: batch.expiry_date,
          brandName: batch.brand_name,
          strength: batch.strength,
          quantity: qty,
          unitPrice,
          discount: itemDiscount,
          lineTotal,
          purchasePriceSnapshot: batch.purchase_price
        });
      }

      // 2. Insert Sale Record
      const insertSale = db.prepare(`
        INSERT INTO sales (
          invoice_number, customer_id, cashier_id, subtotal, discount, tax,
          total_amount, paid_amount, remaining_amount, change_amount, payment_method,
          status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
      `);

      const saleResult = insertSale.run(
        invoiceNumber,
        customerId || null,
        req.user?.id,
        billSubtotal,
        billDiscount,
        billTax,
        billTotal,
        billPaid,
        remaining,
        change,
        paymentMethod || 'CASH',
        notes || null
      );

      const saleId = saleResult.lastInsertRowid;

      // 3. Insert Sale Items
      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (
          sale_id, medicine_id, batch_id, quantity, unit_price,
          discount, line_total, purchase_price_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of processedItems) {
        insertSaleItem.run(
          saleId,
          it.medicineId,
          it.batchId,
          it.quantity,
          it.unitPrice,
          it.discount,
          it.lineTotal,
          it.purchasePriceSnapshot
        );
      }

      // 4. Record Cashbook Inflow (for cash portion)
      const cashPortion = paymentMethod === 'CASH' ? Math.min(billPaid, billTotal) : (paymentMethod === 'SPLIT' ? Number(billPaid) : 0);
      if (cashPortion > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (
            entry_type, category, amount, reference_type, reference_id, description, created_by
          ) VALUES ('IN', 'SALE', ?, 'SALE', ?, ?, ?)
        `).run(
          cashPortion,
          String(saleId),
          `Sale counter receipt #${invoiceNumber}`,
          req.user?.id
        );
      }

      // 5. Update Customer Ledger & Balance if Credit Sale
      if (remaining > 0 && customerId) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
        if (customer) {
          const newCustomerBalance = customer.current_balance + remaining;
          db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newCustomerBalance, customerId);

          db.prepare(`
            INSERT INTO customer_ledgers (
              customer_id, transaction_type, reference_id, debit, credit, balance_after, notes
            ) VALUES (?, 'SALE_CREDIT', ?, ?, 0.0, ?, ?)
          `).run(
            customerId,
            invoiceNumber,
            remaining,
            newCustomerBalance,
            `Credit sale #${invoiceNumber} (Total: Rs. ${billTotal}, Remaining: Rs. ${remaining})`
          );
        }
      }

      // 6. Audit Logging
      logAudit({
        userId: req.user?.id,
        action: 'CREATE_SALE',
        entity: 'SALES',
        entityId: saleId,
        newValues: { invoiceNumber, total: billTotal, paid: billPaid, paymentMethod, itemsCount: processedItems.length },
        ipAddress: req.ip
      });

      return {
        saleId,
        invoiceNumber,
        subtotal: billSubtotal,
        discount: billDiscount,
        tax: billTax,
        totalAmount: billTotal,
        paidAmount: billPaid,
        changeAmount: change,
        remainingAmount: remaining,
        items: processedItems,
        createdAt: new Date().toISOString()
      };
    });

    res.status(201).json({ message: 'Sale completed successfully', invoice: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Held Bills API
posRouter.get('/held', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const held = db.prepare(`
    SELECT h.*, u.full_name as cashier_name
    FROM held_bills h
    JOIN users u ON h.cashier_id = u.id
    ORDER BY h.created_at DESC
  `).all();

  res.json({
    heldBills: held.map((h: any) => ({
      ...h,
      cart: JSON.parse(h.cart_json)
    }))
  });
});

posRouter.post('/hold', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { customerName, cart } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    res.status(400).json({ error: 'Cart is empty' });
    return;
  }

  const billId = 'HOLD-' + Date.now().toString().slice(-6);

  db.prepare(`
    INSERT INTO held_bills (bill_identifier, cashier_id, customer_name, cart_json)
    VALUES (?, ?, ?, ?)
  `).run(billId, req.user?.id, customerName || 'Walk-in Patient', JSON.stringify(cart));

  res.status(201).json({ message: 'Bill held successfully', billIdentifier: billId });
});

posRouter.delete('/held/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM held_bills WHERE id = ?').run(id);
  res.json({ message: 'Held bill removed' });
});

// Receipt / Invoice lookup
posRouter.get('/invoices/:invoiceNumber', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const invoiceNum = req.params.invoiceNumber;

  const sale = db.prepare(`
    SELECT 
      s.*,
      c.name as customer_name, c.mobile as customer_phone,
      u.full_name as cashier_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.cashier_id = u.id
    WHERE s.invoice_number = ?
  `).get(invoiceNum);

  if (!sale) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }

  const items = db.prepare(`
    SELECT 
      si.*,
      m.brand_name, m.strength, m.dosage_form,
      b.batch_number, b.expiry_date
    FROM sale_items si
    JOIN medicines m ON si.medicine_id = m.id
    JOIN batches b ON si.batch_id = b.id
    WHERE si.sale_id = ?
  `).all((sale as any).id);

  res.json({ sale, items });
});

// ==========================================
// Offline Sales Batch Sync Endpoint
// ==========================================
posRouter.post('/sync-offline', authenticateToken, requirePermission('create_sales'), (req: AuthenticatedRequest, res: Response) => {
  const { sales } = req.body; // Array of offline sale objects

  if (!sales || !Array.isArray(sales) || sales.length === 0) {
    res.status(400).json({ error: 'No offline sales provided for synchronization.' });
    return;
  }

  const syncedInvoices: any[] = [];
  const failedInvoices: any[] = [];

  for (const rawSale of sales) {
    try {
      const syncResult = runTransaction(() => {
        const {
          offlineId,
          customerId,
          items,
          subtotal,
          discount,
          tax,
          totalAmount,
          paidAmount,
          paymentMethod,
          notes,
          timestamp
        } = rawSale;

        const billTotal = Number(totalAmount) || 0;
        const billPaid = Number(paidAmount) || 0;
        const billDiscount = Number(discount) || 0;
        const billTax = Number(tax) || 0;
        const billSubtotal = Number(subtotal) || billTotal;
        const remaining = Math.max(0, billTotal - billPaid);
        const change = Math.max(0, billPaid - billTotal);

        const invoiceNumber = generateInvoiceNumber();
        const processedItems: any[] = [];

        for (const item of items) {
          const batchId = Number(item.batchId);
          const qty = Number(item.quantity);

          if (!batchId || isNaN(qty) || qty <= 0) {
            throw new Error(`Invalid item quantity or batch for offline item`);
          }

          const batch = db.prepare(`
            SELECT b.*, m.brand_name, m.strength
            FROM batches b
            JOIN medicines m ON b.medicine_id = m.id
            WHERE b.id = ?
          `).get(batchId) as any;

          if (!batch) {
            throw new Error(`Batch ID ${batchId} not found on server`);
          }

          // Decrement batch stock (allow zero floor)
          const newBatchQty = Math.max(0, batch.quantity - qty);
          db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBatchQty, batchId);

          // Stock movement
          db.prepare(`
            INSERT INTO stock_movements (
              batch_id, movement_type, quantity_change, balance_after,
              reference_type, reference_id, notes, user_id
            ) VALUES (?, 'SALE', ?, ?, 'POS_OFFLINE_SYNC', ?, ?, ?)
          `).run(
            batchId,
            -qty,
            newBatchQty,
            invoiceNumber,
            `Offline Sync Sale (Offline ID: ${offlineId || 'N/A'})`,
            req.user?.id
          );

          const unitPrice = Number(item.unitPrice) || batch.sale_price;
          const itemDiscount = Number(item.discount) || 0;
          const lineTotal = (unitPrice * qty) - itemDiscount;

          processedItems.push({
            medicineId: batch.medicine_id,
            batchId: batch.id,
            quantity: qty,
            unitPrice,
            discount: itemDiscount,
            lineTotal,
            purchasePriceSnapshot: batch.purchase_price
          });
        }

        // Insert Sale
        const saleResult = db.prepare(`
          INSERT INTO sales (
            invoice_number, customer_id, cashier_id, subtotal, discount, tax,
            total_amount, paid_amount, remaining_amount, change_amount, payment_method,
            status, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
        `).run(
          invoiceNumber,
          customerId || null,
          req.user?.id,
          billSubtotal,
          billDiscount,
          billTax,
          billTotal,
          billPaid,
          remaining,
          change,
          paymentMethod || 'CASH',
          notes ? `[OFFLINE SYNC] ${notes}` : '[OFFLINE SYNC]',
          timestamp || new Date().toISOString()
        );

        const saleId = saleResult.lastInsertRowid;

        // Insert Sale Items
        const insertSaleItem = db.prepare(`
          INSERT INTO sale_items (
            sale_id, medicine_id, batch_id, quantity, unit_price,
            discount, line_total, purchase_price_snapshot
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of processedItems) {
          insertSaleItem.run(
            saleId,
            it.medicineId,
            it.batchId,
            it.quantity,
            it.unitPrice,
            it.discount,
            it.lineTotal,
            it.purchasePriceSnapshot
          );
        }

        // Cashbook entry
        const cashPortion = paymentMethod === 'CASH' ? Math.min(billPaid, billTotal) : (paymentMethod === 'SPLIT' ? Number(billPaid) : 0);
        if (cashPortion > 0) {
          db.prepare(`
            INSERT INTO cashbook_entries (
              entry_type, category, amount, reference_type, reference_id, description, created_by, created_at
            ) VALUES ('IN', 'SALE', ?, 'SALE', ?, ?, ?, ?)
          `).run(
            cashPortion,
            String(saleId),
            `Offline Sync Sale receipt #${invoiceNumber}`,
            req.user?.id,
            timestamp || new Date().toISOString()
          );
        }

        // Customer ledger if credit
        if (remaining > 0 && customerId) {
          const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
          if (customer) {
            const newCustomerBalance = customer.current_balance + remaining;
            db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newCustomerBalance, customerId);
            db.prepare(`
              INSERT INTO customer_ledgers (
                customer_id, transaction_type, reference_id, debit, credit, balance_after, notes, created_at
              ) VALUES (?, 'SALE_CREDIT', ?, ?, 0.0, ?, ?, ?)
            `).run(
              customerId,
              invoiceNumber,
              remaining,
              newCustomerBalance,
              `Offline Sync Credit sale #${invoiceNumber}`,
              timestamp || new Date().toISOString()
            );
          }
        }

        logAudit({
          userId: req.user?.id,
          action: 'OFFLINE_SALE_SYNCED',
          entity: 'SALES',
          entityId: saleId,
          newValues: { offlineId, invoiceNumber, total: billTotal },
          ipAddress: req.ip
        });

        return {
          offlineId,
          serverSaleId: saleId,
          invoiceNumber,
          status: 'SYNCED'
        };
      });

      syncedInvoices.push(syncResult);
    } catch (err: any) {
      failedInvoices.push({
        offlineId: rawSale.offlineId,
        error: err.message
      });
    }
  }

  res.status(200).json({
    message: `Synchronized ${syncedInvoices.length} of ${sales.length} offline transactions.`,
    syncedCount: syncedInvoices.length,
    failedCount: failedInvoices.length,
    synced: syncedInvoices,
    failed: failedInvoices
  });
});

