import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';
import { recordAmendment, linkReturn, createManualEntry } from '../services/scheduleBDRegisterService.js';
import { safeJsonParse } from '../utils/json.js';

export const scheduleBDRouter = Router();

interface ListFilters {
  tab?: string; // ALL, B, D, PENDING_REVIEW, CORRECTIONS, CLASSIFICATION_REVIEW
  dateFrom?: string;
  dateTo?: string;
  branch?: string;
  pharmacistId?: string;
  cashierId?: string;
  status?: string;
  q?: string;
  prescriptionId?: string;
}

function buildListQuery(filters: ListFilters) {
  let query = `
    SELECT e.*, dc.substance_name, dc.group_description, dc.verification_status as classification_status,
      u1.full_name as cashier_name, u2.full_name as approved_by_name
    FROM schedule_bd_register_entries e
    LEFT JOIN drug_classifications dc ON dc.id = e.classification_id
    LEFT JOIN users u1 ON u1.id = e.cashier_id
    LEFT JOIN users u2 ON u2.id = e.approved_by_user_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.tab === 'B') { query += ` AND (e.schedule = 'B' OR e.schedule = 'BOTH')`; }
  if (filters.tab === 'D') { query += ` AND (e.schedule = 'D' OR e.schedule = 'BOTH')`; }
  if (filters.tab === 'PENDING_REVIEW') { query += ` AND dc.verification_status != 'VERIFIED'`; }
  if (filters.tab === 'CORRECTIONS') { query += ` AND e.status IN ('CORRECTED', 'CANCELLED', 'REVERSED')`; }

  if (filters.dateFrom) { query += ` AND date(e.created_at) >= date(?)`; params.push(filters.dateFrom); }
  if (filters.dateTo) { query += ` AND date(e.created_at) <= date(?)`; params.push(filters.dateTo); }
  if (filters.branch) { query += ` AND e.branch = ?`; params.push(filters.branch); }
  if (filters.pharmacistId) { query += ` AND e.approved_by_user_id = ?`; params.push(Number(filters.pharmacistId)); }
  if (filters.cashierId) { query += ` AND e.cashier_id = ?`; params.push(Number(filters.cashierId)); }
  if (filters.status) { query += ` AND e.status = ?`; params.push(filters.status); }
  if (filters.prescriptionId) { query += ` AND e.prescription_id = ?`; params.push(Number(filters.prescriptionId)); }

  if (filters.q && filters.q.trim()) {
    const like = `%${filters.q.trim()}%`;
    query += ` AND (
      e.serial_number LIKE ? OR e.invoice_number LIKE ? OR e.batch_number_snapshot LIKE ? OR
      e.patient_snapshot LIKE ? OR e.purchaser_snapshot LIKE ? OR e.prescriber_snapshot LIKE ? OR
      e.medicine_snapshot LIKE ? OR dc.substance_name LIKE ?
    )`;
    params.push(like, like, like, like, like, like, like, like);
  }

  query += ` ORDER BY e.created_at DESC, e.id DESC`;
  return { query, params };
}

scheduleBDRouter.get('/', authenticateToken, requirePermission('view_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const filters = req.query as ListFilters;
  const { query, params } = buildListQuery(filters);
  const rows = db.prepare(query).all(...params) as any[];

  const entries = rows.map(r => ({
    ...r,
    patient_snapshot: safeJsonParse(r.patient_snapshot, null),
    purchaser_snapshot: safeJsonParse(r.purchaser_snapshot, null),
    prescriber_snapshot: safeJsonParse(r.prescriber_snapshot, null),
    medicine_snapshot: safeJsonParse(r.medicine_snapshot, null),
    cashier_snapshot: safeJsonParse(r.cashier_snapshot, null)
  }));

  res.json({ entries });
});

scheduleBDRouter.get('/export/csv', authenticateToken, requirePermission('view_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const filters = req.query as ListFilters;
  const { query, params } = buildListQuery(filters);
  const rows = db.prepare(query).all(...params) as any[];

  const headers = [
    'Serial Number', 'Schedule', 'Status', 'Invoice Number', 'Branch', 'Counter', 'Dispensed At',
    'Medicine (Brand)', 'Generic', 'Strength', 'Dosage Form', 'Batch Number', 'Expiry', 'Quantity', 'Unit',
    'Patient Name', 'Purchaser Name', 'Prescriber Name', 'Cashier', 'Approved By', 'Approved At', 'Prescription ID'
  ];

  const escapeCsv = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    const med = safeJsonParse<{ brandName?: string; genericName?: string; strength?: string; dosageForm?: string }>(r.medicine_snapshot, {});
    const patient = safeJsonParse<{ name?: string }>(r.patient_snapshot, {});
    const purchaser = safeJsonParse<{ name?: string }>(r.purchaser_snapshot, {});
    const prescriber = safeJsonParse<{ name?: string }>(r.prescriber_snapshot, {});

    lines.push([
      r.serial_number, r.schedule, r.status, r.invoice_number, r.branch, r.pos_counter, r.created_at,
      med.brandName, med.genericName, med.strength, med.dosageForm, r.batch_number_snapshot, r.expiry_date_snapshot,
      r.dispensed_quantity, r.unit, patient.name, purchaser.name, prescriber.name, r.cashier_name, r.approved_by_name,
      r.approved_at, r.prescription_id
    ].map(escapeCsv).join(','));
  }

  logAudit({ userId: req.user?.id, action: 'EXPORT_SCHEDULE_BD_REGISTER', entity: 'SCHEDULE_BD_REGISTER', newValues: { filters, rowCount: rows.length }, ipAddress: req.ip });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="schedule-bd-register.csv"');
  res.setHeader('X-Software-Record-Notice', 'Software-generated export - not a certified regulatory register format');
  res.send(lines.join('\n'));
});

scheduleBDRouter.get('/:id', authenticateToken, requirePermission('view_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const entry = db.prepare(`
    SELECT e.*, dc.substance_name, dc.group_description, dc.verification_status as classification_status,
      dc.jurisdiction, dc.source_reference,
      u1.full_name as cashier_name, u2.full_name as approved_by_name
    FROM schedule_bd_register_entries e
    LEFT JOIN drug_classifications dc ON dc.id = e.classification_id
    LEFT JOIN users u1 ON u1.id = e.cashier_id
    LEFT JOIN users u2 ON u2.id = e.approved_by_user_id
    WHERE e.id = ?
  `).get(id) as any;

  if (!entry) {
    res.status(404).json({ error: 'Register entry not found' });
    return;
  }

  const amendments = db.prepare(`
    SELECT a.*, u.full_name as author_name FROM schedule_bd_register_amendments a
    LEFT JOIN users u ON u.id = a.author_user_id
    WHERE a.register_entry_id = ? ORDER BY a.created_at ASC
  `).all(id);

  const returnLinks = db.prepare(`
    SELECT rl.*, sr.return_number, sr.status as return_status FROM schedule_bd_register_return_links rl
    JOIN sales_returns sr ON sr.id = rl.sales_return_id
    WHERE rl.register_entry_id = ?
  `).all(id);

  const prescription = entry.prescription_id
    ? db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(entry.prescription_id)
    : null;

  res.json({
    entry: {
      ...entry,
      patient_snapshot: safeJsonParse(entry.patient_snapshot, null),
      purchaser_snapshot: safeJsonParse(entry.purchaser_snapshot, null),
      prescriber_snapshot: safeJsonParse(entry.prescriber_snapshot, null),
      medicine_snapshot: safeJsonParse(entry.medicine_snapshot, null),
      cashier_snapshot: safeJsonParse(entry.cashier_snapshot, null)
    },
    amendments: amendments.map((a: any) => ({
      ...a,
      before_values: safeJsonParse(a.before_values, null),
      after_values: safeJsonParse(a.after_values, null)
    })),
    returnLinks,
    prescription,
    hasAttachment: !!(prescription && (prescription as any).attachment_path)
  });
});

scheduleBDRouter.post('/:id/amend', authenticateToken, requirePermission('amend_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { reason, afterValues } = req.body;
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ error: 'A reason is required for any correction' });
    return;
  }

  try {
    const amendmentId = recordAmendment({
      registerEntryId: id,
      amendmentType: 'CORRECTION',
      reason: String(reason).trim(),
      authorUserId: req.user!.id,
      afterValues,
      newStatus: 'CORRECTED'
    });
    logAudit({ userId: req.user?.id, action: 'CORRECT_SCHEDULE_BD_ENTRY', entity: 'SCHEDULE_BD_REGISTER', entityId: id, newValues: { reason, afterValues }, ipAddress: req.ip });
    triggerAutoSync(`schedule-bd correction #${id}`);
    res.status(201).json({ message: 'Correction recorded. Original entry preserved.', amendmentId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

scheduleBDRouter.post('/:id/cancel', authenticateToken, requirePermission('amend_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ error: 'A reason is required to cancel a register entry' });
    return;
  }
  try {
    const amendmentId = recordAmendment({ registerEntryId: id, amendmentType: 'CANCELLATION', reason: String(reason).trim(), authorUserId: req.user!.id, newStatus: 'CANCELLED' });
    logAudit({ userId: req.user?.id, action: 'CANCEL_SCHEDULE_BD_ENTRY', entity: 'SCHEDULE_BD_REGISTER', entityId: id, newValues: { reason }, ipAddress: req.ip });
    triggerAutoSync(`schedule-bd cancellation #${id}`);
    res.status(201).json({ message: 'Entry cancelled. Original entry preserved.', amendmentId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

scheduleBDRouter.post('/:id/reverse', authenticateToken, requirePermission('amend_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ error: 'A reason is required to reverse a register entry' });
    return;
  }
  try {
    const amendmentId = recordAmendment({ registerEntryId: id, amendmentType: 'REVERSAL', reason: String(reason).trim(), authorUserId: req.user!.id, newStatus: 'REVERSED' });
    logAudit({ userId: req.user?.id, action: 'REVERSE_SCHEDULE_BD_ENTRY', entity: 'SCHEDULE_BD_REGISTER', entityId: id, newValues: { reason }, ipAddress: req.ip });
    triggerAutoSync(`schedule-bd reversal #${id}`);
    res.status(201).json({ message: 'Entry reversed. Original entry preserved.', amendmentId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

scheduleBDRouter.post('/:id/link-return', authenticateToken, requirePermission('return_sales'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { salesReturnId, saleReturnItemId, quantityReturned } = req.body;
  try {
    const linkId = linkReturn(id, Number(salesReturnId), Number(saleReturnItemId), Number(quantityReturned));
    logAudit({ userId: req.user?.id, action: 'LINK_SCHEDULE_BD_RETURN', entity: 'SCHEDULE_BD_REGISTER', entityId: id, newValues: { salesReturnId, saleReturnItemId, quantityReturned }, ipAddress: req.ip });
    res.status(201).json({ message: 'Return linked to register entry', linkId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Audited manual entry for paper/legacy records - never deducts stock on its own.
scheduleBDRouter.post('/manual', authenticateToken, requirePermission('amend_scheduled_register'), (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  if (!body.medicineSnapshot || !body.dispensedQuantity || !body.schedule) {
    res.status(400).json({ error: 'medicineSnapshot, dispensedQuantity and schedule are required for a manual entry' });
    return;
  }
  if (!body.originalDispensingDate) {
    res.status(400).json({ error: 'originalDispensingDate is required for a manual/legacy entry' });
    return;
  }

  try {
    const entryId = createManualEntry({
      classificationId: body.classificationId || null,
      classificationVersion: body.classificationVersion || null,
      ruleVersion: body.ruleVersion || 'manual-entry',
      invoiceNumber: body.invoiceNumber || null,
      branch: body.branch,
      posCounter: body.posCounter,
      prescriptionId: body.prescriptionId || null,
      prescriptionItemId: body.prescriptionItemId || null,
      originalDocumentReference: body.originalDocumentReference || null,
      patientSnapshot: body.patientSnapshot || null,
      purchaserSnapshot: body.purchaserSnapshot || null,
      prescriberSnapshot: body.prescriberSnapshot || null,
      medicineSnapshot: body.medicineSnapshot,
      batchId: body.batchId || null,
      batchNumberSnapshot: body.batchNumberSnapshot || null,
      expiryDateSnapshot: body.expiryDateSnapshot || null,
      dispensedQuantity: Number(body.dispensedQuantity),
      unit: body.unit || null,
      cashierId: null,
      cashierSnapshot: { enteredBy: req.user?.fullName, note: 'Manual/legacy register entry' },
      approvedByUserId: req.user!.id,
      approvedAt: new Date().toISOString(),
      approvalCredentialsRef: `manual-entry:${req.user!.id}`,
      schedule: body.schedule,
      originalDispensingDate: body.originalDispensingDate,
      createdByUserId: req.user!.id
    });

    logAudit({ userId: req.user?.id, action: 'CREATE_MANUAL_SCHEDULE_BD_ENTRY', entity: 'SCHEDULE_BD_REGISTER', entityId: entryId, newValues: body, ipAddress: req.ip });
    triggerAutoSync(`schedule-bd manual entry #${entryId}`);
    res.status(201).json({ message: 'Manual register entry recorded. No stock was deducted.', entryId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
