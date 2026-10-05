import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';
import { editClassification, verifyClassification, linkMedicineManually, unlinkMedicine, getAllApplicableForReview } from '../services/classificationService.js';

export const classificationRouter = Router();

// List classifications, filterable by schedule / verification status / search text
classificationRouter.get('/', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const { schedule, status, q } = req.query as Record<string, string>;
  let query = `SELECT dc.*, u.full_name as verified_by_name FROM drug_classifications dc LEFT JOIN users u ON dc.verified_by = u.id WHERE dc.is_current = 1`;
  const params: any[] = [];

  if (schedule && schedule !== 'ALL') {
    if (schedule === 'BOTH') {
      query += ` AND dc.schedule = 'BOTH'`;
    } else {
      query += ` AND (dc.schedule = ? OR dc.schedule = 'BOTH')`;
      params.push(schedule);
    }
  }
  if (status && status !== 'ALL') {
    query += ` AND dc.verification_status = ?`;
    params.push(status);
  }
  if (q && q.trim()) {
    query += ` AND (dc.substance_name LIKE ? OR dc.group_description LIKE ?)`;
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }

  query += ` ORDER BY dc.suspected_error_flag DESC, dc.schedule ASC, dc.substance_name ASC`;
  const rows = db.prepare(query).all(...params);

  const importLog = db.prepare('SELECT * FROM drug_classification_import_log ORDER BY created_at DESC').all();

  res.json({ classifications: rows, importLog });
});

classificationRouter.get('/:id/history', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const chain: any[] = [];
  let current = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(id) as any;
  // Walk backward via superseded_by_id references pointing at this chain
  const all = db.prepare('SELECT * FROM drug_classifications ORDER BY version ASC').all() as any[];
  if (current) {
    // find the root by following superseded_by_id backward isn't direct; instead collect any row whose
    // superseded_by_id eventually leads to/from `id` by matching substance_name+schedule as a practical grouping key.
    const key = (r: any) => `${r.substance_name || r.group_description}::${r.schedule}`;
    const groupKey = key(current);
    for (const r of all) {
      if (key(r) === groupKey) chain.push(r);
    }
  }
  res.json({ history: chain });
});

classificationRouter.post('/:id/verify', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { decision, note } = req.body;
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    res.status(400).json({ error: 'decision must be VERIFIED or REJECTED' });
    return;
  }

  try {
    const before = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(id);
    verifyClassification({ classificationId: id, userId: req.user!.id, decision, note });
    const after = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(id);

    logAudit({
      userId: req.user?.id,
      action: decision === 'VERIFIED' ? 'VERIFY_CLASSIFICATION' : 'REJECT_CLASSIFICATION',
      entity: 'DRUG_CLASSIFICATION',
      entityId: id,
      oldValues: before,
      newValues: after,
      ipAddress: req.ip
    });

    triggerAutoSync(`classification ${decision.toLowerCase()} #${id}`);
    res.json({ message: `Classification ${decision.toLowerCase()}`, classification: after });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

classificationRouter.put('/:id', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  try {
    const before = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(id);
    const newId = editClassification({ classificationId: id, userId: req.user!.id, changes: req.body || {} });
    const after = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(newId);

    logAudit({
      userId: req.user?.id,
      action: 'EDIT_CLASSIFICATION',
      entity: 'DRUG_CLASSIFICATION',
      entityId: newId,
      oldValues: before,
      newValues: after,
      ipAddress: req.ip
    });

    triggerAutoSync(`classification edit #${id}`);
    res.json({ message: newId === id ? 'Classification updated' : 'New classification version created (previous version preserved)', classification: after });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

classificationRouter.post('/', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const {
    entryType, substanceName, groupDescription, genericId, strength, dosageForm, route,
    schedule, saltsDerivativesNote, restrictionsExemptions, jurisdiction, sourceReference, effectiveDate
  } = req.body;

  if (!entryType || (entryType !== 'SUBSTANCE' && entryType !== 'GROUP')) {
    res.status(400).json({ error: 'entryType must be SUBSTANCE or GROUP' });
    return;
  }
  if (!schedule || !['B', 'D', 'BOTH', 'OTHER', 'UNCLASSIFIED'].includes(schedule)) {
    res.status(400).json({ error: 'schedule must be B, D, BOTH, OTHER or UNCLASSIFIED' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO drug_classifications (
      version, is_current, entry_type, substance_name, group_description, generic_id, strength, dosage_form, route,
      schedule, salts_derivatives_note, restrictions_exemptions, jurisdiction, source_reference, effective_date,
      verification_status, created_by
    ) VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?)
  `).run(
    entryType, substanceName || null, groupDescription || null, genericId || null, strength || null, dosageForm || null,
    route || null, schedule, saltsDerivativesNote || null, restrictionsExemptions || null,
    jurisdiction || 'Punjab, Pakistan', sourceReference || null, effectiveDate || null, req.user?.id
  );

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_CLASSIFICATION',
    entity: 'DRUG_CLASSIFICATION',
    entityId: Number(result.lastInsertRowid),
    newValues: req.body,
    ipAddress: req.ip
  });

  triggerAutoSync(`classification created #${result.lastInsertRowid}`);
  res.status(201).json({ message: 'Classification created (pending review)', classificationId: result.lastInsertRowid });
});

classificationRouter.get('/medicine/:medicineId', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const medicineId = Number(req.params.medicineId);
  const rows = getAllApplicableForReview(medicineId);
  res.json({ classifications: rows });
});

classificationRouter.post('/medicine/:medicineId/link', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const medicineId = Number(req.params.medicineId);
  const { classificationId } = req.body;
  if (!classificationId) {
    res.status(400).json({ error: 'classificationId is required' });
    return;
  }
  linkMedicineManually(medicineId, Number(classificationId), req.user!.id);
  logAudit({ userId: req.user?.id, action: 'LINK_MEDICINE_CLASSIFICATION', entity: 'MEDICINE_CLASSIFICATION_LINK', entityId: medicineId, newValues: { classificationId }, ipAddress: req.ip });
  res.json({ message: 'Medicine linked to classification' });
});

classificationRouter.delete('/medicine/:medicineId/link/:classificationId', authenticateToken, requirePermission('manage_drug_classification'), (req: AuthenticatedRequest, res: Response) => {
  const medicineId = Number(req.params.medicineId);
  const classificationId = Number(req.params.classificationId);
  unlinkMedicine(medicineId, classificationId);
  logAudit({ userId: req.user?.id, action: 'UNLINK_MEDICINE_CLASSIFICATION', entity: 'MEDICINE_CLASSIFICATION_LINK', entityId: medicineId, newValues: { classificationId }, ipAddress: req.ip });
  res.json({ message: 'Medicine unlinked from classification' });
});
