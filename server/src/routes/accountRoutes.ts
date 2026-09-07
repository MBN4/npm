import { Router, Request, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const accountRouter = Router();

// ==========================================
// 1. CASHBOOK LEDGER & BALANCE
// ==========================================

accountRouter.get('/cashbook', authenticateToken, (req: Request, res: Response) => {
  try {
    const { startDate, endDate, category, entryType, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT cb.*, u.username as created_by_name
      FROM cashbook_entries cb
      LEFT JOIN users u ON cb.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      query += ` AND DATE(cb.created_at) >= DATE(?)`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(cb.created_at) <= DATE(?)`;
      params.push(endDate);
    }
    if (category) {
      query += ` AND cb.category = ?`;
      params.push(category);
    }
    if (entryType) {
      query += ` AND cb.entry_type = ?`;
      params.push(entryType);
    }

    query += ` ORDER BY cb.created_at DESC, cb.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const entries = db.prepare(query).all(...params);

    // Calculate all-time summary & filtered summary
    const allTimeStats = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount ELSE 0 END), 0) as total_out
      FROM cashbook_entries
    `).get() as { total_in: number; total_out: number };

    const currentBalance = allTimeStats.total_in - allTimeStats.total_out;

    // Today's summary
    const todayStats = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE 0 END), 0) as today_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount ELSE 0 END), 0) as today_out
      FROM cashbook_entries
      WHERE DATE(created_at) = DATE('now')
    `).get() as { today_in: number; today_out: number };

    res.json({
      entries,
      summary: {
        totalIn: allTimeStats.total_in,
        totalOut: allTimeStats.total_out,
        currentBalance,
        todayIn: todayStats.today_in,
        todayOut: todayStats.today_out,
        todayNet: todayStats.today_in - todayStats.today_out
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve cashbook entries', details: err.message });
  }
});

// Record Manual Cashbook Entry (e.g. OWNER_DRAW, PETTY_CASH, CASH_IN)
accountRouter.post('/cashbook/manual', authenticateToken, requireRole(['Admin', 'Pharmacist']), (req: Request, res: Response) => {
  try {
    const { entry_type, category, amount, description } = req.body;
    const userId = (req as any).user.id;

    if (!['IN', 'OUT'].includes(entry_type)) {
      return res.status(400).json({ error: 'Invalid entry_type. Must be IN or OUT.' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0.' });
    }
    if (!category) {
      return res.status(400).json({ error: 'Category is required.' });
    }

    const result = db.prepare(`
      INSERT INTO cashbook_entries (
        entry_type, category, amount, reference_type, reference_id, description, created_by
      ) VALUES (?, ?, ?, 'MANUAL', ?, ?, ?)
    `).run(
      entry_type,
      category,
      Number(amount),
      `MAN-${Date.now()}`,
      description || `Manual ${entry_type} adjustment`,
      userId
    );

    logAudit({
      userId,
      action: 'CASHBOOK_MANUAL_ENTRY',
      entity: 'cashbook_entries',
      entityId: result.lastInsertRowid.toString(),
      details: { entry_type, category, amount: Number(amount), description },
      req
    });

    res.status(201).json({
      message: 'Cashbook entry recorded successfully',
      id: result.lastInsertRowid
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record cashbook entry', details: err.message });
  }
});

// ==========================================
// 2. EXPENSES MANAGEMENT
// ==========================================

accountRouter.get('/expenses', authenticateToken, (req: Request, res: Response) => {
  try {
    const { startDate, endDate, category } = req.query;

    let query = `
      SELECT e.*, u.username as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      query += ` AND DATE(e.created_at) >= DATE(?)`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(e.created_at) <= DATE(?)`;
      params.push(endDate);
    }
    if (category) {
      query += ` AND e.expense_category = ?`;
      params.push(category);
    }

    query += ` ORDER BY e.created_at DESC, e.id DESC`;

    const expenses = db.prepare(query).all(...params);

    // Summary totals by category
    let catFilter = '';
    const catParams: any[] = [];
    if (startDate && endDate) {
      catFilter = ' WHERE DATE(created_at) >= DATE(?) AND DATE(created_at) <= DATE(?)';
      catParams.push(startDate, endDate);
    } else if (startDate) {
      catFilter = ' WHERE DATE(created_at) >= DATE(?)';
      catParams.push(startDate);
    } else if (endDate) {
      catFilter = ' WHERE DATE(created_at) <= DATE(?)';
      catParams.push(endDate);
    }

    const categoryTotals = db.prepare(`
      SELECT expense_category, SUM(amount) as total_amount, COUNT(*) as count
      FROM expenses
      ${catFilter}
      GROUP BY expense_category
      ORDER BY total_amount DESC
    `).all(...catParams);

    const grandTotal = expenses.reduce((acc: number, item: any) => acc + item.amount, 0);

    res.json({
      expenses,
      categoryTotals,
      grandTotal
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve expenses', details: err.message });
  }
});

accountRouter.post('/expenses', authenticateToken, requireRole(['Admin', 'Pharmacist']), (req: Request, res: Response) => {
  try {
    const { expense_category, amount, payment_method = 'CASH', payee, description } = req.body;
    const userId = (req as any).user.id;

    if (!expense_category) {
      return res.status(400).json({ error: 'Expense category is required.' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }

    const expenseId = runTransaction(() => {
      const result = db.prepare(`
        INSERT INTO expenses (expense_category, amount, payment_method, payee, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        expense_category,
        Number(amount),
        payment_method,
        payee || null,
        description || null,
        userId
      );

      const expId = result.lastInsertRowid;

      // If paid in cash, also record outflow in cashbook
      if (payment_method === 'CASH') {
        db.prepare(`
          INSERT INTO cashbook_entries (
            entry_type, category, amount, reference_type, reference_id, description, created_by
          ) VALUES ('OUT', 'EXPENSE', ?, 'EXPENSE', ?, ?, ?)
        `).run(
          Number(amount),
          expId.toString(),
          `Expense: [${expense_category}] ${payee ? 'To: ' + payee : ''} - ${description || ''}`.trim(),
          userId
        );
      }

      return expId;
    });

    logAudit({
      userId,
      action: 'EXPENSE_RECORDED',
      entity: 'expenses',
      entityId: expenseId.toString(),
      details: { expense_category, amount: Number(amount), payment_method, payee },
      req
    });

    res.status(201).json({
      message: 'Expense recorded successfully',
      expenseId
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record expense', details: err.message });
  }
});

accountRouter.delete('/expenses/:id', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    const expenseId = req.params.id;
    const userId = (req as any).user.id;

    runTransaction(() => {
      const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as any;
      if (!expense) {
        throw new Error('Expense not found');
      }

      // If cashbook entry was created, delete it
      if (expense.payment_method === 'CASH') {
        db.prepare(`
          DELETE FROM cashbook_entries 
          WHERE reference_type = 'EXPENSE' AND reference_id = ?
        `).run(expenseId);
      }

      db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);
    });

    logAudit({
      userId,
      action: 'EXPENSE_DELETED',
      entity: 'expenses',
      entityId: expenseId,
      details: { deletedBy: userId },
      req
    });

    res.json({ message: 'Expense deleted successfully and cashbook reversed if applicable' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete expense', details: err.message });
  }
});

// ==========================================
// 3. PROFIT & LOSS (P&L) & FINANCIAL SUMMARY
// ==========================================

accountRouter.get('/pl-summary', authenticateToken, (req: Request, res: Response) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (startDate && endDate) {
      dateFilter = ` AND DATE(s.created_at) >= DATE(?) AND DATE(s.created_at) <= DATE(?)`;
      params.push(startDate, endDate);
    } else {
      switch (period) {
        case 'today':
          dateFilter = ` AND DATE(s.created_at) = DATE('now')`;
          break;
        case 'week':
          dateFilter = ` AND DATE(s.created_at) >= DATE('now', '-7 days')`;
          break;
        case 'year':
          dateFilter = ` AND strftime('%Y', s.created_at) = strftime('%Y', 'now')`;
          break;
        case 'month':
        default:
          dateFilter = ` AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now')`;
          break;
      }
    }

    // 1. Sales & Revenue
    const salesStats = db.prepare(`
      SELECT 
        COUNT(*) as total_bills,
        COALESCE(SUM(subtotal), 0) as gross_sales,
        COALESCE(SUM(discount), 0) as total_discounts,
        COALESCE(SUM(total_amount), 0) as net_sales_revenue
      FROM sales s
      WHERE s.status = 'COMPLETED' ${dateFilter}
    `).get(...params) as any;

    // 2. Cost of Goods Sold (COGS) from sale_items snapshot
    let cogsFilter = '';
    const cogsParams: any[] = [];
    if (startDate && endDate) {
      cogsFilter = ` AND DATE(s.created_at) >= DATE(?) AND DATE(s.created_at) <= DATE(?)`;
      cogsParams.push(startDate, endDate);
    } else {
      switch (period) {
        case 'today':
          cogsFilter = ` AND DATE(s.created_at) = DATE('now')`;
          break;
        case 'week':
          cogsFilter = ` AND DATE(s.created_at) >= DATE('now', '-7 days')`;
          break;
        case 'year':
          cogsFilter = ` AND strftime('%Y', s.created_at) = strftime('%Y', 'now')`;
          break;
        case 'month':
        default:
          cogsFilter = ` AND strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now')`;
          break;
      }
    }

    const cogsStats = db.prepare(`
      SELECT 
        COALESCE(SUM(si.purchase_price_snapshot * si.quantity), 0) as cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.status = 'COMPLETED' ${cogsFilter}
    `).get(...cogsParams) as any;

    // 3. Operating Expenses
    let expFilter = '';
    const expParams: any[] = [];
    if (startDate && endDate) {
      expFilter = ` AND DATE(created_at) >= DATE(?) AND DATE(created_at) <= DATE(?)`;
      expParams.push(startDate, endDate);
    } else {
      switch (period) {
        case 'today':
          expFilter = ` AND DATE(created_at) = DATE('now')`;
          break;
        case 'week':
          expFilter = ` AND DATE(created_at) >= DATE('now', '-7 days')`;
          break;
        case 'year':
          expFilter = ` AND strftime('%Y', created_at) = strftime('%Y', 'now')`;
          break;
        case 'month':
        default:
          expFilter = ` AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`;
          break;
      }
    }

    const expStats = db.prepare(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE 1=1 ${expFilter}
    `).get(...expParams) as any;

    const netSales = Number(salesStats.net_sales_revenue || 0);
    const cogs = Number(cogsStats.cogs || 0);
    const grossProfit = netSales - cogs;
    const grossMarginPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    const totalExpenses = Number(expStats.total_expenses || 0);
    const netProfit = grossProfit - totalExpenses;
    const netMarginPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    // Outstanding Receivables & Payables
    const receivables = db.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total_receivable FROM customers WHERE current_balance > 0
    `).get() as any;

    const payables = db.prepare(`
      SELECT COALESCE(SUM(current_balance), 0) as total_payable FROM suppliers WHERE current_balance > 0
    `).get() as any;

    // Cash in Hand
    const cashStats = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount ELSE 0 END), 0) as cash_in_hand
      FROM cashbook_entries
    `).get() as any;

    res.json({
      period,
      revenue: {
        totalBills: salesStats.total_bills,
        grossSales: Number(salesStats.gross_sales.toFixed(2)),
        totalDiscounts: Number(salesStats.total_discounts.toFixed(2)),
        netSales: Number(netSales.toFixed(2))
      },
      cogs: Number(cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossMarginPct: Number(grossMarginPct.toFixed(2)),
      expenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      netMarginPct: Number(netMarginPct.toFixed(2)),
      balances: {
        receivablesOutstanding: Number(receivables.total_receivable.toFixed(2)),
        payablesOutstanding: Number(payables.total_payable.toFixed(2)),
        cashInHand: Number(cashStats.cash_in_hand.toFixed(2))
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to calculate P&L summary', details: err.message });
  }
});

// ==========================================
// 4. DAILY CASH REGISTER CLOSEOUT REPORT
// ==========================================

accountRouter.get('/daily-register', authenticateToken, (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    // Opening balance (everything before this date)
    const opening = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount ELSE 0 END), 0) as opening_balance
      FROM cashbook_entries
      WHERE DATE(created_at) < DATE(?)
    `).get(date) as { opening_balance: number };

    // Today's breakdowns
    const todaySales = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cashbook_entries 
      WHERE DATE(created_at) = DATE(?) AND category = 'SALE' AND entry_type = 'IN'
    `).get(date) as { total: number };

    const todayCustomerRecoveries = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cashbook_entries 
      WHERE DATE(created_at) = DATE(?) AND category = 'CUSTOMER_RECOVERY' AND entry_type = 'IN'
    `).get(date) as { total: number };

    const todaySupplierPayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cashbook_entries 
      WHERE DATE(created_at) = DATE(?) AND category = 'SUPPLIER_PAYMENT' AND entry_type = 'OUT'
    `).get(date) as { total: number };

    const todayExpenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cashbook_entries 
      WHERE DATE(created_at) = DATE(?) AND category = 'EXPENSE' AND entry_type = 'OUT'
    `).get(date) as { total: number };

    const todayOtherIn = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cashbook_entries 
      WHERE DATE(created_at) = DATE(?) AND entry_type = 'IN' AND category NOT IN ('SALE', 'CUSTOMER_RECOVERY')
    `).get(date) as { total: number };

    const todayOtherOut = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM cashbook_entries 
      WHERE DATE(created_at) = DATE(?) AND entry_type = 'OUT' AND category NOT IN ('SUPPLIER_PAYMENT', 'EXPENSE')
    `).get(date) as { total: number };

    const openingBalance = opening.opening_balance || 0;
    const totalIn = todaySales.total + todayCustomerRecoveries.total + todayOtherIn.total;
    const totalOut = todaySupplierPayments.total + todayExpenses.total + todayOtherOut.total;
    const closingBalance = openingBalance + totalIn - totalOut;

    res.json({
      date,
      openingBalance: Number(openingBalance.toFixed(2)),
      breakdown: {
        cashSales: Number(todaySales.total.toFixed(2)),
        customerRecoveries: Number(todayCustomerRecoveries.total.toFixed(2)),
        otherInflows: Number(todayOtherIn.total.toFixed(2)),
        supplierPayments: Number(todaySupplierPayments.total.toFixed(2)),
        operatingExpenses: Number(todayExpenses.total.toFixed(2)),
        otherOutflows: Number(todayOtherOut.total.toFixed(2))
      },
      totalIn: Number(totalIn.toFixed(2)),
      totalOut: Number(totalOut.toFixed(2)),
      closingBalance: Number(closingBalance.toFixed(2))
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate daily register report', details: err.message });
  }
});
