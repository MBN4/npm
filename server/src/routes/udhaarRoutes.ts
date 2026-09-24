import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

export const udhaarRouter = Router();
udhaarRouter.use(authenticateToken);

// Helper: Extract last 4 digits from CNIC or Phone for serial_no
function deriveSerialNo(cnic?: string, mobile?: string): string {
  if (cnic) {
    const cleanCnic = cnic.replace(/\D/g, '');
    if (cleanCnic.length >= 4) {
      return cleanCnic.slice(-4);
    }
  }
  if (mobile) {
    const cleanMobile = mobile.replace(/\D/g, '');
    if (cleanMobile.length >= 4) {
      return cleanMobile.slice(-4);
    }
  }
  const count = (db.prepare('SELECT COUNT(*) as count FROM udhaar_customers').get() as { count: number }).count + 1;
  return String(count).padStart(4, '0');
}

// 1. GET Udhaar Dashboard Summary KPIs
udhaarRouter.get('/dashboard', (req: AuthenticatedRequest, res: Response) => {
  try {
    const totalsRow = db.prepare(`
      SELECT 
        COUNT(CASE WHEN balance > 0 THEN 1 END) as total_customers,
        COALESCE(SUM(balance), 0) as total_udhaar,
        COALESCE(SUM(CASE WHEN status = 'OVERDUE' THEN balance ELSE 0 END), 0) as overdue_amount,
        COUNT(CASE WHEN status = 'OVERDUE' THEN 1 END) as overdue_customers
      FROM udhaar_customers
    `).get() as any;

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const paidMonthRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as paid_this_month
      FROM udhaar_transactions
      WHERE type = 'CREDIT' AND STRFTIME('%Y-%m', date_time) = ?
    `).get(currentMonth) as any;

    const transactionsCountRow = db.prepare(`
      SELECT COUNT(*) as total_transactions FROM udhaar_transactions
    `).get() as any;

    res.json({
      total_customers: totalsRow.total_customers || 0,
      total_udhaar: totalsRow.total_udhaar || 0,
      overdue_amount: totalsRow.overdue_amount || 0,
      overdue_customers: totalsRow.overdue_customers || 0,
      paid_this_month: paidMonthRow.paid_this_month || 0,
      total_transactions: transactionsCountRow.total_transactions || 0
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch Udhaar dashboard KPIs', details: error.message });
  }
});

// 2. GET Customers List (with Search & Status Filter)
udhaarRouter.get('/customers', (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const status = (req.query.status as string || '').trim().toUpperCase();
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM udhaar_customers WHERE 1=1`;
    const params: any[] = [];

    if (search) {
      const term = `%${search}%`;
      query += ` AND (name LIKE ? OR mobile LIKE ? OR serial_no LIKE ? OR cnic LIKE ?)`;
      params.push(term, term, term, term);
    }

    if (status && ['DUE', 'CLEARED', 'OVERDUE'].includes(status)) {
      query += ` AND status = ?`;
      params.push(status);
    }

    const countSql = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalRow = db.prepare(countSql).get(...params) as { total: number };

    query += ` ORDER BY last_transaction_date DESC, id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const customers = db.prepare(query).all(...params);

    res.json({
      customers,
      pagination: {
        page,
        limit,
        total: totalRow.total,
        totalPages: Math.ceil(totalRow.total / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch Udhaar customers', details: error.message });
  }
});

// 3. GET Customer Detail & Transactions
udhaarRouter.get('/customers/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id;
    const customer = db.prepare(`
      SELECT * FROM udhaar_customers 
      WHERE id = ? OR serial_no = ? OR mobile = ?
    `).get(id, id, id) as any;

    if (!customer) {
      return res.status(404).json({ error: 'Udhaar customer record not found' });
    }

    const transactions = db.prepare(`
      SELECT * FROM udhaar_transactions 
      WHERE customer_id = ?
      ORDER BY date_time DESC, id DESC
    `).all(customer.id);

    res.json({ customer, transactions });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch customer detail', details: error.message });
  }
});

udhaarRouter.patch('/customers/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM udhaar_customers WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const name = String(req.body.name || '').trim();
    const mobile = String(req.body.mobile || '').trim();
    if (!name || !mobile) return res.status(400).json({ error: 'Customer name and mobile are required' });
    const duplicate = db.prepare('SELECT id FROM udhaar_customers WHERE mobile = ? AND id != ?').get(mobile, existing.id);
    if (duplicate) return res.status(409).json({ error: 'This mobile number belongs to another customer' });

    const cnic = String(req.body.cnic || '').trim();
    db.prepare(`UPDATE udhaar_customers SET name = ?, mobile = ?, cnic = ?, serial_no = ?, reference = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(name, mobile, cnic || null, deriveSerialNo(cnic, mobile), String(req.body.reference || '').trim() || null, String(req.body.address || '').trim() || null, existing.id);
    res.json(db.prepare('SELECT * FROM udhaar_customers WHERE id = ?').get(existing.id));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update customer', details: error.message });
  }
});

// 4. POST Create New Udhaar Entry / New Customer
udhaarRouter.post('/customers', (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      mobile,
      reference,
      cnic,
      category,
      amount,
      description,
      address,
      credit_limit,
      created_by_user_id,
      created_by_user_name
    } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Customer Name is required' });
    }
    if (!mobile || mobile.trim() === '') {
      return res.status(400).json({ error: 'Mobile Number is required' });
    }

    const categoryVal = category || 'Medicine';
    const amountVal = Number(amount || 0);
    if (!Number.isFinite(amountVal) || amountVal < 0) {
      return res.status(400).json({ error: 'Udhaar amount must be zero or greater' });
    }
    const serial_no = deriveSerialNo(cnic, mobile);
    const userId = req.user?.id || created_by_user_id || 1;
    const userName = req.user?.fullName || created_by_user_name || 'Dr. Abdul';

    const resultCustomer = runTransaction(() => {
      // Check if customer with same mobile or CNIC exists
      let cust = db.prepare(`SELECT * FROM udhaar_customers WHERE mobile = ?`).get(mobile.trim()) as any;

      if (!cust) {
        const resCust = db.prepare(`
          INSERT INTO udhaar_customers (
            name, mobile, reference, cnic, serial_no, category, address, credit_limit,
            total_udhaar, paid_amount, balance, status, last_transaction_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          name.trim(),
          mobile.trim(),
          reference || null,
          cnic ? cnic.trim() : null,
          serial_no,
          categoryVal,
          address || 'Lahore, Pakistan',
          Number(credit_limit || 50000),
          amountVal,
          amountVal,
          amountVal > 0 ? 'DUE' : 'CLEARED'
        );
        cust = db.prepare(`SELECT * FROM udhaar_customers WHERE id = ?`).get(resCust.lastInsertRowid) as any;
      } else if (amountVal > 0) {
        // Update existing customer totals
        const newTotalUdhaar = cust.total_udhaar + amountVal;
        const newBalance = cust.balance + amountVal;
        const newStatus = newBalance > 0 ? (cust.status === 'OVERDUE' ? 'OVERDUE' : 'DUE') : 'CLEARED';

        db.prepare(`
          UPDATE udhaar_customers 
          SET total_udhaar = ?, balance = ?, status = ?, last_transaction_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newTotalUdhaar, newBalance, newStatus, cust.id);

        cust = db.prepare(`SELECT * FROM udhaar_customers WHERE id = ?`).get(cust.id) as any;
      }

      // Record DEBIT transaction if amount > 0
      if (amountVal > 0) {
        const trxId = `UD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
          INSERT INTO udhaar_transactions (
            transaction_id, customer_id, date_time, type, category, reference_no, description, amount, payment_method, balance_after, created_by_user_id, created_by_user_name
          ) VALUES (?, ?, CURRENT_TIMESTAMP, 'DEBIT', ?, ?, ?, ?, 'CREDIT_LINE', ?, ?, ?)
        `).run(
          trxId,
          cust.id,
          categoryVal,
          reference || null,
          description || `New Udhaar purchase (${categoryVal})`,
          amountVal,
          cust.balance,
          userId,
          userName
        );
      }

      return cust;
    });

    res.status(201).json(resultCustomer);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create Udhaar entry', details: error.message });
  }
});

// 5. POST Receive Payment / Add Transaction
udhaarRouter.post('/transactions', (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      customer_id,
      type, // 'CREDIT' (Payment), 'DEBIT' (New credit purchase), or 'ADJUSTMENT' (Balance reduction)
      amount,
      adjustment_reason,
      category,
      reference_no,
      description,
      payment_method,
      date_time,
      created_by_user_id,
      created_by_user_name
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }
    const amtNum = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      return res.status(400).json({ error: 'Valid transaction amount is required' });
    }

    const typeVal = (type || 'CREDIT').toUpperCase();
    if (!['CREDIT', 'DEBIT', 'ADJUSTMENT'].includes(typeVal)) {
      return res.status(400).json({ error: 'Invalid Udhaar transaction type' });
    }
    const reasonVal = String(adjustment_reason || '').toUpperCase();
    const adjustmentLabels: Record<string, string> = { RETURN: 'Returned items', DISCOUNT: 'Discount', CORRECTION: 'Balance correction', WRITE_OFF: 'Write-off' };
    if (typeVal === 'ADJUSTMENT' && !adjustmentLabels[reasonVal]) {
      return res.status(400).json({ error: 'Select a reason for reducing Udhaar' });
    }
    const payMethod = typeVal === 'ADJUSTMENT' ? 'ADJUSTMENT' : (payment_method || 'CASH');
    const userId = req.user?.id || created_by_user_id || 1;
    const userName = req.user?.fullName || created_by_user_name || 'Dr. Abdul';
    const trxDate = date_time || new Date().toISOString();

    const result = runTransaction(() => {
      const cust = db.prepare(`SELECT * FROM udhaar_customers WHERE id = ?`).get(customer_id) as any;
      if (!cust) {
        throw new Error('Customer not found');
      }
      if ((typeVal === 'CREDIT' || typeVal === 'ADJUSTMENT') && amtNum > cust.balance) {
        throw new Error('Reduction cannot exceed the outstanding balance');
      }

      let newPaid = cust.paid_amount;
      let newTotalUdhaar = cust.total_udhaar;
      let newBalance = cust.balance;

      if (typeVal === 'CREDIT') {
        newPaid = Math.round((newPaid + amtNum) * 100) / 100;
        newBalance = Math.round((cust.balance - amtNum) * 100) / 100;
      } else if (typeVal === 'ADJUSTMENT') {
        newBalance = Math.round((cust.balance - amtNum) * 100) / 100;
      } else {
        newTotalUdhaar = Math.round((newTotalUdhaar + amtNum) * 100) / 100;
        newBalance = Math.round((newBalance + amtNum) * 100) / 100;
      }

      const newStatus = newBalance <= 0 ? 'CLEARED' : (cust.status === 'OVERDUE' ? 'OVERDUE' : 'DUE');

      db.prepare(`
        UPDATE udhaar_customers 
        SET paid_amount = ?, total_udhaar = ?, balance = ?, status = ?, last_transaction_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newPaid, newTotalUdhaar, newBalance, newStatus, trxDate, cust.id);

      const trxId = `UD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO udhaar_transactions (
          transaction_id, customer_id, date_time, type, adjustment_reason, category, reference_no, description, amount, payment_method, balance_after, created_by_user_id, created_by_user_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trxId,
        cust.id,
        trxDate,
        typeVal,
        typeVal === 'ADJUSTMENT' ? reasonVal : null,
        category || cust.category || 'Medicine',
        reference_no || null,
        typeVal === 'ADJUSTMENT'
          ? `${adjustmentLabels[reasonVal]}${String(description || '').trim() ? `: ${String(description).trim()}` : ''}`
          : (description || (typeVal === 'CREDIT' ? 'Payment Received' : 'Udhaar Purchase')),
        amtNum,
        payMethod,
        newBalance,
        userId,
        userName
      );

      const updatedCust = db.prepare(`SELECT * FROM udhaar_customers WHERE id = ?`).get(cust.id);
      const updatedTrx = db.prepare(`SELECT * FROM udhaar_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 1`).get(cust.id);

      return { customer: updatedCust, transaction: updatedTrx };
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(error.message === 'Reduction cannot exceed the outstanding balance' || error.message === 'Customer not found' ? 400 : 500).json({ error: error.message || 'Failed to record Udhaar transaction' });
  }
});

// 6. GET Aging Analysis Report
udhaarRouter.get('/aging-report', (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT *,
        JULIANDAY('now') - JULIANDAY(last_transaction_date) as days_since_last
      FROM udhaar_customers
      WHERE balance > 0
      ORDER BY balance DESC
    `).all() as any[];

    const bucket0_30: any[] = [];
    const bucket31_60: any[] = [];
    const bucket60_plus: any[] = [];

    rows.forEach(r => {
      const days = Math.floor(r.days_since_last || 0);
      if (days <= 30) bucket0_30.push(r);
      else if (days <= 60) bucket31_60.push(r);
      else bucket60_plus.push(r);
    });

    res.json({
      bucket0_30: { count: bucket0_30.length, total: bucket0_30.reduce((s, c) => s + c.balance, 0), customers: bucket0_30 },
      bucket31_60: { count: bucket31_60.length, total: bucket31_60.reduce((s, c) => s + c.balance, 0), customers: bucket31_60 },
      bucket60_plus: { count: bucket60_plus.length, total: bucket60_plus.reduce((s, c) => s + c.balance, 0), customers: bucket60_plus }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate aging report', details: error.message });
  }
});
