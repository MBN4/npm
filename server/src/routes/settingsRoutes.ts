import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const settingsRouter = Router();

// Get settings
settingsRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const settingsRows = db.prepare('SELECT key, value, description, updated_at FROM settings').all() as any[];
  const settingsObj: Record<string, string> = {};
  for (const s of settingsRows) {
    settingsObj[s.key] = s.value;
  }
  res.json({ settings: settingsObj, detailed: settingsRows });
});

// Update settings (Admin only)
settingsRouter.put('/', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const updates = req.body as Record<string, string>;

  const updateStmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  const saveSettings = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      updateStmt.run(key, String(value));
    }
  });

  saveSettings();

  logAudit({
    userId: req.user?.id,
    action: 'UPDATE_SETTINGS',
    entity: 'SETTINGS',
    newValues: updates,
    ipAddress: req.ip
  });

  res.json({ message: 'Settings updated successfully' });
});
