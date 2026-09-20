import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const catalogRouter = Router();

// --- Categories ---
catalogRouter.get('/categories', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
  res.json({ categories });
});

catalogRouter.post('/categories', authenticateToken, requirePermission('manage_medicines'), (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  try {
    const result = db.prepare('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, 999)').run(name.trim(), description || null);
    logAudit({
      userId: req.user?.id,
      action: 'CREATE_CATEGORY',
      entity: 'CATEGORIES',
      entityId: Number(result.lastInsertRowid),
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
      entityId: Number(result.lastInsertRowid),
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
      entityId: Number(result.lastInsertRowid),
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

// --- Global Search Across Modules ---
catalogRouter.get('/global-search', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const q = ((req.query.q as string) || '').trim();
  if (!q || q.length < 2) {
    res.json({ results: [] });
    return;
  }

  const searchTerm = `%${q}%`;

  // Medicines & Barcodes
  const medicines = db.prepare(`
    SELECT m.id, m.brand_name as title, m.strength, m.dosage_form, m.barcode, m.rack_location,
           g.name as generic_name,
           'medicine' as type,
           (SELECT COALESCE(SUM(b.quantity), 0) FROM batches b WHERE b.medicine_id = m.id AND b.status = 'ACTIVE' AND b.expiry_date > CURRENT_DATE) as total_stock
    FROM medicines m
    LEFT JOIN generics g ON m.generic_id = g.id
    WHERE m.brand_name LIKE ? OR m.barcode LIKE ? OR m.custom_barcode LIKE ? OR g.name LIKE ?
    LIMIT 6
  `).all(searchTerm, searchTerm, searchTerm, searchTerm);

  // Customers
  const customers = db.prepare(`
    SELECT id, name as title, mobile as subtitle, current_balance, 'customer' as type
    FROM customers
    WHERE name LIKE ? OR mobile LIKE ?
    LIMIT 4
  `).all(searchTerm, searchTerm);

  // Suppliers
  const suppliers = db.prepare(`
    SELECT id, name as title, company as subtitle, phone, current_balance, 'supplier' as type
    FROM suppliers
    WHERE name LIKE ? OR company LIKE ? OR phone LIKE ?
    LIMIT 4
  `).all(searchTerm, searchTerm, searchTerm);

  // Invoices / Sales
  const sales = db.prepare(`
    SELECT s.id, s.invoice_number as title, s.total_amount, s.payment_method, s.created_at,
           c.name as customer_name, 'sale' as type
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.invoice_number LIKE ?
    LIMIT 4
  `).all(searchTerm);

  // Batches
  const batches = db.prepare(`
    SELECT b.id, b.batch_number as title, b.expiry_date, b.quantity, b.sale_price,
           m.brand_name, 'batch' as type
    FROM batches b
    JOIN medicines m ON b.medicine_id = m.id
    WHERE b.batch_number LIKE ?
    LIMIT 4
  `).all(searchTerm);

  res.json({
    query: q,
    results: {
      medicines,
      customers,
      suppliers,
      sales,
      batches
    }
  });
});

