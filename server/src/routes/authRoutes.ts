import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { authRateLimiter } from '../middleware/security.js';

export const authRouter = Router();

// Login endpoint with rate limiting
authRouter.post('/login', authRateLimiter, (req, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.email, u.password_hash, u.full_name, u.role_id, u.is_active, r.name as role_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE LOWER(u.username) = LOWER(?)
  `).get(username) as any;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Your account has been deactivated. Contact the administrator.' });
    return;
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Fetch user permissions
  const permissions = db.prepare(`
    SELECT p.code
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(user.role_id) as { code: string }[];

  const token = jwt.sign(
    { id: user.id, username: user.username, roleId: user.role_id },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  // Record audit log for login
  logAudit({
    userId: user.id,
    action: 'LOGIN',
    entity: 'USERS',
    entityId: user.id,
    newValues: { username: user.username, role: user.role_name },
    ipAddress: req.ip
  });

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      roleId: user.role_id,
      roleName: user.role_name,
      permissions: permissions.map(p => p.code)
    }
  });
});

// Current user profile
authRouter.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// Change password
authRouter.post('/change-password', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user?.id;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string };
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(400).json({ error: 'Incorrect current password' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, userId);

  logAudit({
    userId,
    action: 'CHANGE_PASSWORD',
    entity: 'USERS',
    entityId: userId,
    ipAddress: req.ip
  });

  res.json({ message: 'Password updated successfully' });
});
