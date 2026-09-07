import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

export const auditRouter = Router();

// Query audit logs with pagination and search (Admin only)
auditRouter.get('/', authenticateToken, requireRole(['Admin']), (req: AuthenticatedRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;

  const entity = req.query.entity as string | undefined;
  const action = req.query.action as string | undefined;

  let query = `
    SELECT a.id, a.user_id, u.username, u.full_name, a.action, a.entity, a.entity_id, a.old_values, a.new_values, a.ip_address, a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (entity) {
    query += ' AND a.entity = ?';
    params.push(entity);
  }

  if (action) {
    query += ' AND a.action = ?';
    params.push(action);
  }

  const countQuery = query.replace('SELECT a.id, a.user_id, u.username, u.full_name, a.action, a.entity, a.entity_id, a.old_values, a.new_values, a.ip_address, a.created_at', 'SELECT COUNT(*) as total');
  const countRow = db.prepare(countQuery).get(...params) as { total: number };

  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = db.prepare(query).all(...params);

  res.json({
    logs,
    pagination: {
      total: countRow.total,
      page,
      limit,
      totalPages: Math.ceil(countRow.total / limit)
    }
  });
});
