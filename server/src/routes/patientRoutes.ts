import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const patientRouter = Router();

// List patients with search and balance summary
patientRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const search = (req.query.search as string || '').trim();

  let query = `
    SELECT c.*,
      COUNT(s.id) as total_visits,
      COALESCE(SUM(s.total_amount), 0) as total_spent,
      MAX(s.created_at) as last_visit_date
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search) {
    const s = `%${search}%`;
    query += ' AND (c.name LIKE ? OR c.mobile LIKE ?)';
    params.push(s, s);
  }

  query += ' GROUP BY c.id ORDER BY c.name ASC';

  const patients = db.prepare(query).all(...params);
  res.json({ patients });
});

// Single patient profile with complete history
patientRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const patient = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }

  const ledger = db.prepare(`
    SELECT * FROM customer_ledgers
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(id);

  const sales = db.prepare(`
    SELECT s.*, u.full_name as cashier_name
    FROM sales s
    LEFT JOIN users u ON s.cashier_id = u.id
    WHERE s.customer_id = ?
    ORDER BY s.created_at DESC
  `).all(id);

  const prescriptions = db.prepare(`
    SELECT p.*, d.name as doctor_name, d.specialization as doctor_specialization
    FROM prescriptions p
    LEFT JOIN doctors d ON p.doctor_id = d.id
    WHERE p.patient_id = ?
    ORDER BY p.created_at DESC
  `).all(id);

  res.json({ patient, ledger, sales, prescriptions });
});

// Register patient / customer
patientRouter.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { name, mobile, age, gender, allergyNotes, creditLimit } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Patient name is required' });
    return;
  }

  // Check unique mobile if supplied
  if (mobile && mobile.trim()) {
    const existing = db.prepare('SELECT id FROM customers WHERE mobile = ?').get(mobile.trim());
    if (existing) {
      res.status(400).json({ error: 'A patient with this mobile number is already registered' });
      return;
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO customers (name, mobile, age, gender, allergy_notes, credit_limit, current_balance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 0.0, 1)
    `).run(
      name.trim(),
      mobile ? mobile.trim() : null,
      age ? Number(age) : null,
      gender || 'MALE',
      allergyNotes ? allergyNotes.trim() : null,
      creditLimit ? Number(creditLimit) : 0.0
    );

    logAudit({
      userId: req.user?.id,
      action: 'CREATE_PATIENT',
      entity: 'CUSTOMERS',
      entityId: Number(result.lastInsertRowid),
      newValues: { name: name.trim(), mobile, allergyNotes },
      ipAddress: req.ip
    });

    res.status(201).json({ message: 'Patient registered successfully', patientId: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update patient
patientRouter.put('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { name, mobile, age, gender, allergyNotes, creditLimit, isActive } = req.body;

  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }

  const nextName = name !== undefined ? String(name ?? '').trim() : existing.name;
  const nextMobile = mobile !== undefined ? String(mobile ?? '').trim() || null : existing.mobile;
  const nextAge = age !== undefined ? (age === null || age === '' ? null : Number(age)) : existing.age;
  const nextGender = gender !== undefined ? String(gender).toUpperCase() : (existing.gender || 'MALE');
  const nextAllergyNotes = allergyNotes !== undefined ? String(allergyNotes ?? '').trim() || null : existing.allergy_notes;
  const nextCreditLimit = creditLimit !== undefined ? Number(creditLimit) : Number(existing.credit_limit ?? 0);

  if (!nextName) return res.status(400).json({ error: 'Patient name is required' });
  if (nextAge !== null && (!Number.isInteger(nextAge) || nextAge < 0 || nextAge > 130)) return res.status(400).json({ error: 'Age must be between 0 and 130' });
  if (!['MALE', 'FEMALE', 'OTHER'].includes(nextGender)) return res.status(400).json({ error: 'Invalid gender' });
  if (!Number.isFinite(nextCreditLimit) || nextCreditLimit < 0) return res.status(400).json({ error: 'Credit limit cannot be negative' });
  if (nextMobile && db.prepare('SELECT id FROM customers WHERE mobile = ? AND id != ?').get(nextMobile, id)) {
    return res.status(400).json({ error: 'A patient with this mobile number is already registered' });
  }

  try {
    db.prepare(`
      UPDATE customers SET
        name = ?, mobile = ?, age = ?, gender = ?,
        allergy_notes = ?, credit_limit = ?, is_active = ?
      WHERE id = ?
    `).run(
      nextName,
      nextMobile,
      nextAge,
      nextGender,
      nextAllergyNotes,
      nextCreditLimit,
      isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      id
    );

    logAudit({
      userId: req.user?.id,
      action: 'UPDATE_PATIENT',
      entity: 'CUSTOMERS',
      entityId: id,
      oldValues: { name: existing.name, mobile: existing.mobile, age: existing.age, gender: existing.gender, allergyNotes: existing.allergy_notes, creditLimit: existing.credit_limit },
      newValues: { name: nextName, mobile: nextMobile, age: nextAge, gender: nextGender, allergyNotes: nextAllergyNotes, creditLimit: nextCreditLimit },
      ipAddress: req.ip
    });

    res.json({ message: 'Patient profile updated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete / Deactivate customer
patientRouter.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const usageCount = (db.prepare('SELECT COUNT(*) as count FROM sales WHERE customer_id = ?').get(id) as { count: number }).count;
  if (usageCount > 0 || Number(existing.current_balance) > 0) {
    db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(id);
    res.json({ message: 'Customer has sales history or balance due, so account was deactivated.' });
    return;
  }

  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  res.json({ message: 'Customer deleted successfully' });
});

// Record customer payment recovery (reduces receivable balance and records cash inflow)
patientRouter.post('/:id/payments', authenticateToken, requirePermission('manage_patients'), (req: AuthenticatedRequest, res: Response) => {
  const patientId = Number(req.params.id);
  const { amount, paymentMethod, notes } = req.body;

  const recAmount = Number(amount);
  if (isNaN(recAmount) || recAmount <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than zero' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const patient = db.prepare('SELECT * FROM customers WHERE id = ?').get(patientId) as any;
      if (!patient) {
        throw new Error('Patient not found');
      }

      const newBalance = patient.current_balance - recAmount;

      // Update patient balance
      db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newBalance, patientId);

      // Record in customer ledger (Credit reduces debt)
      db.prepare(`
        INSERT INTO customer_ledgers (customer_id, transaction_type, reference_id, debit, credit, balance_after, notes)
        VALUES (?, 'PAYMENT_RECEIVED', ?, 0.0, ?, ?, ?)
      `).run(
        patientId,
        `REC-${Date.now().toString().slice(-6)}`,
        recAmount,
        newBalance,
        notes || `Payment received via ${paymentMethod || 'CASH'}`
      );

      // Record in cashbook as inflow
      db.prepare(`
        INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
        VALUES (?, 'CUSTOMER_RECOVERY', ?, 'CUSTOMER', ?, ?, ?)
      `).run(
        'IN',
        recAmount,
        String(patientId),
        `Credit recovery received from patient ${patient.name}`,
        req.user?.id
      );

      logAudit({
        userId: req.user?.id,
        action: 'CUSTOMER_PAYMENT_RECOVERY',
        entity: 'CUSTOMERS',
        entityId: patientId,
        newValues: { amount: recAmount, previousBalance: patient.current_balance, newBalance },
        ipAddress: req.ip
      });

      return { previousBalance: patient.current_balance, newBalance, recoveredAmount: recAmount };
    });

    res.json({ message: 'Customer payment recorded successfully', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
