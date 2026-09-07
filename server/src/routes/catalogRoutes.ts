import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const catalogRouter = Router();

// --- Categories ---
catalogRouter.get('/categories', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json({ categories });
});

catalogRouter.post('/categories', authenticateToken, requirePermission('manage_medicines'), (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  try {
    const result = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(name.trim(), description || null);
    logAudit({
      userId: req.user?.id,
      action: 'CREATE_CATEGORY',
      entity: 'CATEGORIES',
      entityId: result.lastInsertRowid,
      newValues: { name: name.trim(), description },
      ipAddress: req.ip
    });
    res.status(201).json({ message: 'Category created', id: result.lastInsertRowid });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'A category with this name already exists' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// --- Manufacturers ---
catalogRouter.get('/manufacturers', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const manufacturers = db.prepare('SELECT * FROM manufacturers ORDER BY name ASC').all();
  res.json({ manufacturers });
});

catalogRouter.post('/manufacturers', authenticateToken, requirePermission('manage_medicines'), (req: AuthenticatedRequest, res: Response) => {
  const { name, contactPerson, phone, email, address } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Manufacturer name is required' });
    return;
  }

  try {
    const result = db.prepare(`
      INSERT INTO manufacturers (name, contact_person, phone, email, address)
      VALUES (?, ?, ?, ?, ?)
    `).run(name.trim(), contactPerson || null, phone || null, email || null, address || null);

    logAudit({
      userId: req.user?.id,
      action: 'CREATE_MANUFACTURER',
      entity: 'MANUFACTURERS',
      entityId: result.lastInsertRowid,
      newValues: { name: name.trim() },
      ipAddress: req.ip
    });
    res.status(201).json({ message: 'Manufacturer created', id: result.lastInsertRowid });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'A manufacturer with this name already exists' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// --- Generics / Salts ---
catalogRouter.get('/generics', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const generics = db.prepare('SELECT * FROM generics ORDER BY name ASC').all();
  res.json({ generics });
});

catalogRouter.post('/generics', authenticateToken, requirePermission('manage_medicines'), (req: AuthenticatedRequest, res: Response) => {
  const { name, therapeuticClass, description } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Generic salt name is required' });
    return;
  }

  try {
    const result = db.prepare(`
      INSERT INTO generics (name, therapeutic_class, description)
      VALUES (?, ?, ?)
    `).run(name.trim(), therapeuticClass || null, description || null);

    logAudit({
      userId: req.user?.id,
      action: 'CREATE_GENERIC',
      entity: 'GENERICS',
      entityId: result.lastInsertRowid,
      newValues: { name: name.trim(), therapeuticClass },
      ipAddress: req.ip
    });
    res.status(201).json({ message: 'Generic created', id: result.lastInsertRowid });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'A generic with this name already exists' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});
