import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const cashOutRouter = Router();

// 1. Get Categories
cashOutRouter.get('/categories', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const categories = db.prepare(`
      SELECT * FROM cash_out_categories
      WHERE is_active = 1
      ORDER BY sort_order ASC, name ASC
    `).all();
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve categories', details: err.message });
  }
});

// Admin Manage Categories
cashOutRouter.post('/categories', authenticateToken, requirePermission('manage_system'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, defaultNature, sortOrder = 0, isActive = 1 } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO cash_out_categories (name, default_nature, sort_order, is_active)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        default_nature = excluded.default_nature,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active
    `);

    stmt.run(name.trim(), defaultNature || 'BUSINESS_EXPENSE', Number(sortOrder) || 0, isActive ? 1 : 0);
    res.json({ message: 'Category saved successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Record New Cash Out Entry
cashOutRouter.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      amount,
      category,
      transactionNature = 'BUSINESS_EXPENSE',
      paymentMethod = 'CASH',
      recipientType = 'OTHER',
      supplierId,
      recipientName,
      recipientPhone,
      recipientRole,
      bankName,
      accountName,
      accountRef,
      trxRef,
      purpose,
      referenceNo,
      notes,
      attachmentPath
    } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Valid amount greater than zero is required' });
      return;
    }

    if (!purpose || !String(purpose).trim()) {
      res.status(400).json({ error: 'Purpose / Description is required' });
      return;
    }

    const userId = req.user?.id || 1;
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random() * 90000);
    const transactionId = `CO-${year}-${rand}`;

    const result = runTransaction(() => {
      // 1. Insert Cash Out record
      const stmt = db.prepare(`
        INSERT INTO cash_outs (
          transaction_id, amount, category, transaction_nature, payment_method,
          recipient_type, supplier_id, recipient_name, recipient_phone, recipient_role,
          bank_name, account_name, account_ref, trx_ref, purpose,
          reference_no, notes, attachment_path, created_by, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `);

      const insertRes = stmt.run(
        transactionId,
        numAmount,
        category || 'Miscellaneous',
        transactionNature,
        paymentMethod,
        recipientType,
        supplierId ? Number(supplierId) : null,
        recipientName ? String(recipientName).trim() : null,
        recipientPhone ? String(recipientPhone).trim() : null,
        recipientRole ? String(recipientRole).trim() : null,
        bankName ? String(bankName).trim() : null,
        accountName ? String(accountName).trim() : null,
        accountRef ? String(accountRef).trim() : null,
        trxRef ? String(trxRef).trim() : null,
        String(purpose).trim(),
        referenceNo ? String(referenceNo).trim() : null,
        notes ? String(notes).trim() : null,
        attachmentPath || null,
        userId
      );

      const cashOutId = Number(insertRes.lastInsertRowid);

      // 2. Automatically sync with Cashbook Entries (OUT)
      db.prepare(`
        INSERT INTO cashbook_entries (
          entry_type, category, amount, reference_type, reference_id, description, created_by
        ) VALUES ('OUT', ?, ?, 'CASHOUT', ?, ?, ?)
      `).run(
        category || 'Miscellaneous',
        numAmount,
        transactionId,
        `${transactionNature}: ${purpose} (Paid to: ${recipientName || supplierId || recipientType})`,
        userId
      );

      // 3. Supplier Ledger Integration
      let supplierBalanceAfter: number | null = null;
      if (supplierId && Number(supplierId) > 0) {
        const supp = db.prepare('SELECT id, name, current_balance FROM suppliers WHERE id = ?').get(Number(supplierId)) as any;
        if (supp) {
          supplierBalanceAfter = Number(supp.current_balance || 0) - numAmount;
          db.prepare(`
            INSERT INTO supplier_ledgers (
              supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes
            ) VALUES (?, 'PAYMENT_OUT', ?, ?, 0, ?, ?)
          `).run(
            supp.id,
            transactionId,
            numAmount,
            supplierBalanceAfter,
            `Cash Out Payment: ${purpose}`
          );

          db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(supplierBalanceAfter, supp.id);
        }
      }

      logAudit({
        userId,
        action: 'CREATE_CASHOUT',
        entity: 'CASH_OUTS',
        entityId: cashOutId,
        newValues: { transactionId, amount: numAmount, transactionNature, category, recipientType, supplierId },
        ipAddress: req.ip
      });

      return {
        cashOutId,
        transactionId,
        amount: numAmount,
        transactionNature,
        category,
        supplierBalanceAfter
      };
    });

    res.status(201).json({
      message: 'Cash Out recorded successfully',
      ...result
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to record Cash Out' });
  }
});

// 3. Search & List Cash Out History
cashOutRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      nature,
      recipientType,
      supplierId,
      category,
      paymentMethod,
      status,
      search,
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        co.*,
        u.full_name as created_by_name, u.username as created_by_username,
        ru.full_name as reversed_by_name,
        s.name as supplier_name
      FROM cash_outs co
      LEFT JOIN users u ON co.created_by = u.id
      LEFT JOIN users ru ON co.reversed_by = ru.id
      LEFT JOIN suppliers s ON co.supplier_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      query += ` AND DATE(co.created_at) >= DATE(?)`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(co.created_at) <= DATE(?)`;
      params.push(endDate);
    }
    if (nature) {
      query += ` AND co.transaction_nature = ?`;
      params.push(nature);
    }
    if (recipientType) {
      query += ` AND co.recipient_type = ?`;
      params.push(recipientType);
    }
    if (supplierId) {
      query += ` AND co.supplier_id = ?`;
      params.push(Number(supplierId));
    }
    if (category) {
      query += ` AND co.category = ?`;
      params.push(category);
    }
    if (paymentMethod) {
      query += ` AND co.payment_method = ?`;
      params.push(paymentMethod);
    }
    if (status) {
      query += ` AND co.status = ?`;
      params.push(status);
    }

    if (search && String(search).trim()) {
      const s = `%${String(search).trim()}%`;
      query += ` AND (
        co.transaction_id LIKE ? OR
        co.recipient_name LIKE ? OR
        co.purpose LIKE ? OR
        co.reference_no LIKE ? OR
        s.name LIKE ?
      )`;
      params.push(s, s, s, s, s);
    }

    query += ` ORDER BY co.created_at DESC, co.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const records = db.prepare(query).all(...params);
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve Cash Out history', details: err.message });
  }
});

// 4. Reverse Cash Out Transaction
cashOutRouter.post('/:id/reverse', authenticateToken, requirePermission('manage_system'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;

    if (!reason || !String(reason).trim()) {
      res.status(400).json({ error: 'Reason for reversal is required' });
      return;
    }

    const existing = db.prepare('SELECT * FROM cash_outs WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Cash Out transaction not found' });
      return;
    }

    if (existing.status === 'REVERSED') {
      res.status(400).json({ error: 'Transaction is already reversed' });
      return;
    }

    const userId = req.user?.id || 1;

    runTransaction(() => {
      // 1. Mark transaction REVERSED
      db.prepare(`
        UPDATE cash_outs SET
          status = 'REVERSED',
          reversed_by = ?,
          reversed_at = CURRENT_TIMESTAMP,
          reversal_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, String(reason).trim(), id);

      // 2. Insert balancing Cashbook entry (IN) to restore cash drawer
      db.prepare(`
        INSERT INTO cashbook_entries (
          entry_type, category, amount, reference_type, reference_id, description, created_by
        ) VALUES ('IN', ?, ?, 'REVERSAL', ?, ?, ?)
      `).run(
        existing.category,
        existing.amount,
        `REV-${existing.transaction_id}`,
        `Reversal of ${existing.transaction_id}: ${reason}`,
        userId
      );

      // 3. Reverse Supplier Ledger if supplier payment
      if (existing.supplier_id && Number(existing.supplier_id) > 0) {
        const supp = db.prepare('SELECT id, current_balance FROM suppliers WHERE id = ?').get(existing.supplier_id) as any;
        if (supp) {
          const newBal = Number(supp.current_balance || 0) + existing.amount;
          db.prepare(`
            INSERT INTO supplier_ledgers (
              supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes
            ) VALUES (?, 'PAYMENT_REVERSAL', ?, 0, ?, ?, ?)
          `).run(
            supp.id,
            `REV-${existing.transaction_id}`,
            existing.amount,
            newBal,
            `Reversal of ${existing.transaction_id}: ${reason}`
          );

          db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newBal, supp.id);
        }
      }

      logAudit({
        userId,
        action: 'REVERSE_CASHOUT',
        entity: 'CASH_OUTS',
        entityId: id,
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'REVERSED', reason },
        ipAddress: req.ip
      });
    });

    res.json({ message: `Transaction ${existing.transaction_id} reversed successfully` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reverse transaction' });
  }
});

// 5. Cash Out Summary & Reconciliation Metrics
cashOutRouter.get('/summary', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate = new Date().toISOString().split('T')[0], endDate = new Date().toISOString().split('T')[0] } = req.query;

    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_cash_out,
        COALESCE(SUM(CASE WHEN transaction_nature = 'BUSINESS_EXPENSE' THEN amount ELSE 0 END), 0) as business_expenses,
        COALESCE(SUM(CASE WHEN transaction_nature = 'SUPPLIER_PAYMENT' THEN amount ELSE 0 END), 0) as supplier_payments,
        COALESCE(SUM(CASE WHEN transaction_nature = 'BANK_DEPOSIT' THEN amount ELSE 0 END), 0) as bank_deposits,
        COALESCE(SUM(CASE WHEN transaction_nature = 'WALLET_TRANSFER' THEN amount ELSE 0 END), 0) as wallet_transfers,
        COALESCE(SUM(CASE WHEN transaction_nature = 'OWNER_WITHDRAWAL' THEN amount ELSE 0 END), 0) as owner_withdrawals,
        COALESCE(SUM(CASE WHEN status = 'REVERSED' THEN amount ELSE 0 END), 0) as reversed_amount,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_count
      FROM cash_outs
      WHERE status = 'ACTIVE' AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
    `).get(startDate, endDate) as any;

    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve summary', details: err.message });
  }
});
