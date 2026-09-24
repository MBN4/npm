import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const billingPersonRouter = Router();

// List active billing persons (any authenticated user - needed to populate the POS dropdown)
billingPersonRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const billingPersons = includeInactive
    ? db.prepare('SELECT * FROM billing_persons ORDER BY is_active DESC, name ASC').all()
    : db.prepare('SELECT * FROM billing_persons WHERE is_active = 1 ORDER BY name ASC').all();
  res.json({ billingPersons });
});

// Add a new billing person (Admin only)
billingPersonRouter.post('/', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const result = db.prepare('INSERT INTO billing_persons (name, is_active) VALUES (?, 1)').run(name.trim());

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_BILLING_PERSON',
    entity: 'BILLING_PERSONS',
    entityId: Number(result.lastInsertRowid),
    newValues: { name: name.trim() },
    ipAddress: req.ip
  });

  res.status(201).json({ message: 'Billing person added', billingPersonId: result.lastInsertRowid });
});

// Edit a billing person's name / active status (Admin only)
billingPersonRouter.put('/:id', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { name, isActive } = req.body;

  const existing = db.prepare('SELECT * FROM billing_persons WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Billing person not found' });
    return;
  }

  const finalName = (name !== undefined && name.trim()) ? name.trim() : existing.name;
  const finalActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;

  db.prepare('UPDATE billing_persons SET name = ?, is_active = ? WHERE id = ?').run(finalName, finalActive, id);

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_BILLING_PERSON',
    entity: 'BILLING_PERSONS',
    entityId: id,
    oldValues: existing,
    newValues: { name: finalName, isActive: finalActive },
    ipAddress: req.ip
  });

  res.json({ message: 'Billing person updated' });
});

// Delete a billing person (Admin only). Sales that already reference it keep the historical row via ON DELETE SET NULL-like behavior.
billingPersonRouter.delete('/:id', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM billing_persons WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Billing person not found' });
    return;
  }

  const usageCount = (db.prepare('SELECT COUNT(*) as count FROM sales WHERE billing_person_id = ?').get(id) as { count: number }).count;

  if (usageCount > 0) {
    // Preserve historical sales attribution - soft-deactivate instead of a hard delete.
    db.prepare('UPDATE billing_persons SET is_active = 0 WHERE id = ?').run(id);
    logAudit({
      userId: req.user?.id,
      action: 'DEACTIVATE_BILLING_PERSON',
      entity: 'BILLING_PERSONS',
      entityId: id,
      oldValues: existing,
      ipAddress: req.ip
    });
    res.json({ message: 'Billing person is linked to past sales, so it was deactivated instead of deleted.' });
    return;
  }

  db.prepare('DELETE FROM billing_persons WHERE id = ?').run(id);

  logAudit({
    userId: req.user?.id,
    action: 'DELETE_BILLING_PERSON',
    entity: 'BILLING_PERSONS',
    entityId: id,
    oldValues: existing,
    ipAddress: req.ip
  });

  res.json({ message: 'Billing person deleted' });
});
