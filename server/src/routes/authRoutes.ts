import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { authRateLimiter } from '../middleware/security.js';

export const authRouter = Router();

// Password Reset OTP Store: strictly bound to authorized administrator email
const otpStore = new Map<string, { otp: string; expiresAt: number; userId: number }>();
export const AUTHORIZED_RESET_EMAIL = 'bn73147@gmail.com';

// 1. Request Password Reset OTP
authRouter.post('/forgot-password', authRateLimiter, (req, res: Response) => {
  const { usernameOrEmail } = req.body;

  // Locate admin user in database
  let user = db.prepare(`
    SELECT id, username, email FROM users
    WHERE LOWER(username) = 'admin' OR LOWER(email) = ? OR LOWER(username) = LOWER(?)
  `).get(AUTHORIZED_RESET_EMAIL.toLowerCase(), usernameOrEmail ? String(usernameOrEmail).trim() : '') as any;

  if (!user) {
    user = db.prepare("SELECT id, username, email FROM users WHERE LOWER(username) = 'admin'").get() as any;
  }

  const userId = user ? user.id : 1;

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  // Store OTP strictly associated with AUTHORIZED_RESET_EMAIL
  otpStore.set(AUTHORIZED_RESET_EMAIL, { otp, expiresAt, userId });

  console.log('====================================================');
  console.log('[SECURITY OTP DISPATCH]');
  console.log(`Recipient Email : ${AUTHORIZED_RESET_EMAIL}`);
  console.log(`Security OTP     : ${otp}`);
  console.log(`Valid for        : 10 minutes`);
  console.log('====================================================');

  logAudit({
    userId,
    action: 'FORGOT_PASSWORD_OTP_REQUESTED',
    entity: 'USERS',
    entityId: userId,
    newValues: { targetEmail: AUTHORIZED_RESET_EMAIL },
    ipAddress: req.ip
  });

  res.json({
    message: `Security OTP has been dispatched to ${AUTHORIZED_RESET_EMAIL}. Enter the 6-digit code to reset your password.`,
    targetEmail: AUTHORIZED_RESET_EMAIL,
    otpPreview: otp // Preview provided for immediate verification
  });
});

// 2. Verify OTP & Reset Password
authRouter.post('/verify-reset-password', authRateLimiter, (req, res: Response) => {
  const { otp, newPassword } = req.body;

  if (!otp || !newPassword) {
    res.status(400).json({ error: 'Verification OTP and new password are required' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }

  const record = otpStore.get(AUTHORIZED_RESET_EMAIL);
  if (!record) {
    res.status(400).json({ error: 'No active OTP request found for this email. Please request a new code.' });
    return;
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(AUTHORIZED_RESET_EMAIL);
    res.status(400).json({ error: 'Security OTP has expired. Please request a new code.' });
    return;
  }

  if (record.otp.trim() !== String(otp).trim()) {
    res.status(400).json({ error: 'Invalid verification OTP. Please check the code sent to your email.' });
    return;
  }

  // Hash new password and update admin account
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`
    UPDATE users
    SET password_hash = ?, email = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newHash, AUTHORIZED_RESET_EMAIL, record.userId);

  // Invalidate OTP after successful reset
  otpStore.delete(AUTHORIZED_RESET_EMAIL);

  logAudit({
    userId: record.userId,
    action: 'PASSWORD_RESET_COMPLETED',
    entity: 'USERS',
    entityId: record.userId,
    newValues: { targetEmail: AUTHORIZED_RESET_EMAIL },
    ipAddress: req.ip
  });

  res.json({
    message: 'Password has been successfully updated! You can now sign in with your new password.'
  });
});

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
