import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';

export const activityRouter = Router();

const SALE_SELECT = `
  SELECT
    'SALE' as record_type,
    s.id as record_id,
    s.created_at as occurred_at,
    ('Invoice ' || s.invoice_number) as primary_label,
    COALESCE(s.custom_slip_name, c.name, 'Walk-in Customer') as secondary_label,
    s.total_amount as amount,
    'IN' as direction,
    COALESCE(bp.name, u.full_name, u.username) as user_name,
    s.status as status,
    (s.payment_method || ' payment • ' || (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) || ' item(s)') as extra_note,
    s.invoice_number as ref_code
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN users u ON s.cashier_id = u.id
  LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
`;

const UDHAAR_SELECT = `
  SELECT
    'UDHAAR' as record_type,
    t.id as record_id,
    t.date_time as occurred_at,
    (CASE t.type WHEN 'DEBIT' THEN 'Udhaar Given' WHEN 'CREDIT' THEN 'Udhaar Payment' ELSE 'Udhaar Adjustment' END || ' - ' || uc.name) as primary_label,
    COALESCE(t.description, t.category) as secondary_label,
    t.amount as amount,
    CASE WHEN t.type = 'CREDIT' THEN 'IN' WHEN t.type = 'ADJUSTMENT' THEN 'NEUTRAL' ELSE 'OUT' END as direction,
    t.created_by_user_name as user_name,
    t.type as status,
    ('Balance after: Rs. ' || printf('%.2f', t.balance_after)) as extra_note,
    t.transaction_id as ref_code
  FROM udhaar_transactions t
  JOIN udhaar_customers uc ON t.customer_id = uc.id
`;

const CASHOUT_SELECT = `
  SELECT
    'CASHOUT' as record_type,
    co.id as record_id,
    co.created_at as occurred_at,
    ('Cash Out - ' || co.category) as primary_label,
    COALESCE(co.recipient_name, co.purpose) as secondary_label,
    co.amount as amount,
    'OUT' as direction,
    u.full_name as user_name,
    co.status as status,
    co.purpose as extra_note,
    co.transaction_id as ref_code
  FROM cash_outs co
  LEFT JOIN users u ON co.created_by = u.id
`;

const STOCK_SELECT = `
  SELECT
    'STOCK' as record_type,
    sm.id as record_id,
    sm.created_at as occurred_at,
    (sm.movement_type || ' - ' || m.brand_name) as primary_label,
    ('Batch ' || b.batch_number) as secondary_label,
    sm.quantity_change as amount,
    CASE WHEN sm.quantity_change >= 0 THEN 'IN' ELSE 'OUT' END as direction,
    u.full_name as user_name,
    sm.reference_type as status,
    sm.notes as extra_note,
    sm.reference_id as ref_code
  FROM stock_movements sm
  JOIN batches b ON sm.batch_id = b.id
  JOIN medicines m ON b.medicine_id = m.id
  LEFT JOIN users u ON sm.user_id = u.id
`;

const SUBQUERIES: Record<string, string> = {
  SALE: SALE_SELECT,
  UDHAAR: UDHAAR_SELECT,
  CASHOUT: CASHOUT_SELECT,
  STOCK: STOCK_SELECT
};
const ALL_TYPES = ['SALE', 'UDHAAR', 'CASHOUT', 'STOCK'];

activityRouter.get('/feed', authenticateToken, requirePermission('view_accounts'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, types, search, limit = 30, offset = 0 } = req.query;

    const requestedTypes = types
      ? String(types).split(',').map(t => t.trim().toUpperCase()).filter(t => ALL_TYPES.includes(t))
      : ALL_TYPES;
    const activeTypes = requestedTypes.length > 0 ? requestedTypes : ALL_TYPES;

    const unionSql = activeTypes.map(t => SUBQUERIES[t]).join('\nUNION ALL\n');

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (startDate) {
      whereClauses.push('DATE(occurred_at) >= DATE(?)');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('DATE(occurred_at) <= DATE(?)');
      params.push(endDate);
    }
    if (search && String(search).trim()) {
      const s = `%${String(search).trim()}%`;
      whereClauses.push('(primary_label LIKE ? OR secondary_label LIKE ? OR ref_code LIKE ? OR user_name LIKE ?)');
      params.push(s, s, s, s);
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM (${unionSql}) t ${whereSql}`).get(...params) as { total: number };

    const clampedLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const rows = db.prepare(`
      SELECT * FROM (${unionSql}) t
      ${whereSql}
      ORDER BY occurred_at DESC, record_id DESC
      LIMIT ? OFFSET ?
    `).all(...params, clampedLimit, Number(offset) || 0);

    res.json({ records: rows, total: countRow.total, limit: clampedLimit, offset: Number(offset) || 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load activity feed', details: err.message });
  }
});

activityRouter.get('/summary', authenticateToken, requirePermission('view_accounts'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const todaySales = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
      FROM sales WHERE DATE(created_at) = DATE('now')
    `).get() as { total: number; count: number };

    const todayUdhaar = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END), 0) as given,
        COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0) as received
      FROM udhaar_transactions WHERE DATE(date_time) = DATE('now')
    `).get() as { given: number; received: number };

    const todayCashout = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM cash_outs WHERE DATE(created_at) = DATE('now') AND status = 'ACTIVE'
    `).get() as { total: number; count: number };

    const todayStock = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_movements WHERE DATE(created_at) = DATE('now')
    `).get() as { count: number };

    res.json({ todaySales, todayUdhaar, todayCashout, todayStock });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load activity summary', details: err.message });
  }
});
