import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { authenticateToken, requireRole, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const userRouter = Router();

// List all users (Requires view/manage staff permission)
userRouter.get('/', authenticateToken, requirePermission('manage_staff'), (req: AuthenticatedRequest, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.full_name, u.role_id, r.name as role_name, u.phone, u.is_active, u.created_at
    FROM users u
    JOIN roles r ON u.role_id = r.id
    ORDER BY u.id ASC
  `).all();

  res.json({ users });
});

// List roles and available permissions
userRouter.get('/roles', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const roles = db.prepare('SELECT id, name, description FROM roles').all();
  const permissions = db.prepare('SELECT id, code, description, module FROM permissions').all();
  const rolePermissions = db.prepare('SELECT role_id, permission_id FROM role_permissions').all();

  res.json({ roles, permissions, rolePermissions });
});

// Create new user (Admin only)
userRouter.post('/', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const { username, password, fullName, email, roleId, phone } = req.body;

  if (!username || !password || !fullName || !roleId) {
    res.status(400).json({ error: 'Username, password, full name, and role ID are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (existing) {
    res.status(400).json({ error: 'A user with this username already exists' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role_id, phone, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(username, email || null, hash, fullName, roleId, phone || null);

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_USER',
    entity: 'USERS',
    entityId: result.lastInsertRowid,
    newValues: { username, fullName, roleId },
    ipAddress: req.ip
  });

  res.status(201).json({ message: 'User created successfully', userId: result.lastInsertRowid });
});

// Update user or toggle active status
userRouter.put('/:id', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const userId = Number(req.params.id);
  const { fullName, email, roleId, phone, isActive, newPassword } = req.body;

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let passwordHash = existing.password_hash;
  if (newPassword && newPassword.trim().length >= 6) {
    passwordHash = bcrypt.hashSync(newPassword.trim(), 10);
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, email = ?, role_id = ?, phone = ?, is_active = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    fullName ?? existing.full_name,
    email ?? existing.email,
    roleId ?? existing.role_id,
    phone ?? existing.phone,
    isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
    passwordHash,
    userId
  );

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_USER',
    entity: 'USERS',
    entityId: userId,
    oldValues: { fullName: existing.full_name, roleId: existing.role_id, isActive: existing.is_active },
    newValues: { fullName, roleId, isActive },
    ipAddress: req.ip
  });

  res.json({ message: 'User updated successfully' });
});
