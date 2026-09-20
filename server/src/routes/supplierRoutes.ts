import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const supplierRouter = Router();

// List all suppliers
supplierRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const suppliers = db.prepare(`
    SELECT s.*,
      COUNT(p.id) as total_invoices,
      COALESCE(SUM(p.total_amount), 0) as total_purchase_volume
    FROM suppliers s
    LEFT JOIN purchases p ON s.id = p.supplier_id
    GROUP BY s.id
    ORDER BY s.name ASC
  `).all();

  res.json({ suppliers });
});

// Single supplier with ledger history
supplierRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) {
    res.status(404).json({ error: 'Supplier not found' });
    return;
  }

  const ledger = db.prepare(`
    SELECT * FROM supplier_ledgers
    WHERE supplier_id = ?
    ORDER BY id DESC
  `).all(id);

  const purchases = db.prepare(`
    SELECT * FROM purchases
    WHERE supplier_id = ?
    ORDER BY purchase_date DESC
  `).all(id);

  res.json({ supplier, ledger, purchases });
});

// Create supplier
supplierRouter.post('/', authenticateToken, requirePermission('manage_suppliers'), (req: AuthenticatedRequest, res: Response) => {
  const { name, contactPerson, phone, email, address, taxNumber, openingBalance } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Supplier company name is required' });
    return;
  }

  const initialBalance = Number(openingBalance) || 0.0;

  try {
    const result = runTransaction(() => {
      const stmt = db.prepare(`
        INSERT INTO suppliers (name, contact_person, phone, email, address, tax_number, opening_balance, current_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const resInsert = stmt.run(
        name.trim(),
        contactPerson || null,
        phone || null,
        email || null,
        address || null,
        taxNumber || null,
        initialBalance,
        initialBalance
      );

      const supplierId = resInsert.lastInsertRowid;

      // If opening balance > 0, log it in ledger
      if (initialBalance !== 0) {
        db.prepare(`
          INSERT INTO supplier_ledgers (supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          supplierId,
          'OPENING_BALANCE',
          'OP-BAL',
          initialBalance < 0 ? Math.abs(initialBalance) : 0,
          initialBalance > 0 ? initialBalance : 0,
          initialBalance,
          'Initial opening balance upon registration'
        );
      }

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_SUPPLIER',
        entity: 'SUPPLIERS',
        entityId: Number(supplierId),
        newValues: { name: name.trim(), openingBalance: initialBalance },
        ipAddress: req.ip
      });

      return { supplierId };
    });

    res.status(201).json({ message: 'Supplier created successfully', supplierId: result.supplierId });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'A supplier with this name already exists' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Record supplier payment (decrements payable balance and records cash outflow)
supplierRouter.post('/:id/payments', authenticateToken, requirePermission('manage_suppliers'), (req: AuthenticatedRequest, res: Response) => {
  const supplierId = Number(req.params.id);
  const { amount, paymentMethod, reference, notes } = req.body;

  const payAmount = Number(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than zero' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as any;
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      const newBalance = supplier.current_balance - payAmount;

      // Update supplier balance
      db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newBalance, supplierId);

      // Record in supplier ledger (Debit reduces payable)
      db.prepare(`
        INSERT INTO supplier_ledgers (supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        supplierId,
        'PAYMENT_OUT',
        reference || `PAY-${Date.now()}`,
        payAmount,
        0.0,
        newBalance,
        notes || `Payment made via ${paymentMethod || 'CASH'}`
      );

      // Record in cashbook as outflow
      db.prepare(`
        INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'OUT',
        'SUPPLIER_PAYMENT',
        payAmount,
        'SUPPLIER',
        String(supplierId),
        `Payment to ${supplier.name} (${paymentMethod || 'CASH'})`,
        req.user?.id
      );

      logAudit({
        userId: req.user?.id,
        action: 'SUPPLIER_PAYMENT',
        entity: 'SUPPLIERS',
        entityId: supplierId,
        newValues: { amount: payAmount, previousBalance: supplier.current_balance, newBalance, paymentMethod },
        ipAddress: req.ip
      });

      return { previousBalance: supplier.current_balance, newBalance, paidAmount: payAmount };
    });

    res.json({ message: 'Payment recorded successfully', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
