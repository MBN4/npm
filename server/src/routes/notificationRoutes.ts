import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

export const notificationRouter = Router();

// Get recent notifications and unread count
notificationRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50
  `).all();

  const unreadCountRow = db.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE is_read = 0
  `).get() as { count: number };

  res.json({
    notifications,
    unreadCount: unreadCountRow ? unreadCountRow.count : 0
  });
});

// Mark single notification as read
notificationRouter.put('/:id/read', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
  res.json({ message: 'Marked as read' });
});

// Mark all notifications as read
notificationRouter.post('/read-all', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
  res.json({ message: 'All notifications marked as read' });
});

// Refresh / generate system notifications based on database state
notificationRouter.post('/generate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const insertStmt = db.prepare(`
    INSERT INTO notifications (title, message, type, link) VALUES (?, ?, ?, ?)
  `);

  // Check expired batches (do not re-insert within 24 hours if already alerted)
  const expiredCountRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM batches WHERE expiry_date <= date('now') AND quantity > 0
  `).get() as { cnt: number };

  if (expiredCountRow && expiredCountRow.cnt > 0) {
    const existing = db.prepare(`
      SELECT id FROM notifications 
      WHERE title = 'Expired Stock Alert' 
      AND created_at >= datetime('now', '-24 hours')
    `).get();

    if (!existing) {
      insertStmt.run(
        'Expired Stock Alert',
        `${expiredCountRow.cnt} batch(es) have expired and are strictly blocked from sale. Pull them from shelves immediately.`,
        'DANGER',
        '/expiry'
      );
    }
  }

  // Check near-expiry batches (do not re-insert within 24 hours if already alerted)
  const nearCountRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM batches WHERE expiry_date > date('now') AND expiry_date <= date('now', '+90 days') AND quantity > 0
  `).get() as { cnt: number };

  if (nearCountRow && nearCountRow.cnt > 0) {
    const existing = db.prepare(`
      SELECT id FROM notifications 
      WHERE title = 'Near-Expiry Stock Warning' 
      AND created_at >= datetime('now', '-24 hours')
    `).get();

    if (!existing) {
      insertStmt.run(
        'Near-Expiry Stock Warning',
        `${nearCountRow.cnt} batch(es) are expiring within the next 90 days. Prepare supplier return claims.`,
        'WARNING',
        '/expiry'
      );
    }
  }

  res.json({ message: 'Notifications checked and synchronized' });
});
