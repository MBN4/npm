import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'nmp_dev_secret_key_2026_pharmacy';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  roleId: number;
  roleName: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired authentication token' });
      return;
    }

    const payload = decodedUser as { id: number; username: string };
    
    // Fetch fresh user and permission details from DB to guarantee instant revocation
    const userRow = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.is_active, u.role_id, r.name as role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(payload.id) as { id: number; username: string; full_name: string; is_active: number; role_id: number; role_name: string } | undefined;

    if (!userRow || !userRow.is_active) {
      res.status(403).json({ error: 'Account is deactivated or does not exist' });
      return;
    }

    const permRows = db.prepare(`
      SELECT p.code
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(userRow.role_id) as { code: string }[];

    req.user = {
      id: userRow.id,
      username: userRow.username,
      fullName: userRow.full_name,
      roleId: userRow.role_id,
      roleName: userRow.role_name,
      permissions: permRows.map(p => p.code)
    };

    next();
  });
}

export function requirePermission(permissionCode: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.roleName === 'Admin' || req.user.permissions.includes(permissionCode)) {
      next();
      return;
    }

    res.status(403).json({ error: `Access denied. Requires permission: ${permissionCode}` });
  };
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (allowedRoles.includes(req.user.roleName) || req.user.roleName === 'Admin') {
      next();
      return;
    }

    res.status(403).json({ error: `Access denied. Role ${req.user.roleName} not authorized` });
  };
}
