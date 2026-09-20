import { Router, Request, Response } from 'express';
import { exportSyncData, importSyncData, getSyncStatus } from '../services/dataSyncService.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const syncRouter = Router();

/**
 * GET /api/sync/status
 * Get status of sync_data.json file on disk
 */
syncRouter.get('/status', authenticateToken, (req: Request, res: Response) => {
  try {
    const status = getSyncStatus();
    res.json(status);
  } catch (err: any) {
    console.error('Sync status error:', err);
    res.status(500).json({ error: err.message || 'Failed to get sync status' });
  }
});

/**
 * POST /api/sync/export
 * Exports current database records to sync_data.json
 */
syncRouter.post('/export', authenticateToken, requireRole(['Admin', 'Pharmacist', 'Inventory Staff']), (req: Request, res: Response) => {
  try {
    const result = exportSyncData();
    logAudit({
      userId: (req as AuthenticatedRequest).user?.id,
      action: 'DATA_SYNC_EXPORTED',
      entity: 'sync_data',
      entityId: 'sync_data.json',
      newValues: result.counts,
    });
    res.json({
      message: 'Database catalog exported to sync_data.json successfully!',
      result,
    });
  } catch (err: any) {
    console.error('Sync export error:', err);
    res.status(500).json({ error: err.message || 'Failed to export sync data' });
  }
});

/**
 * POST /api/sync/import
 * Imports sync_data.json into local SQLite DB
 */
syncRouter.post('/import', authenticateToken, requireRole(['Admin', 'Pharmacist', 'Inventory Staff']), (req: Request, res: Response) => {
  try {
    const result = importSyncData();
    logAudit({
      userId: (req as AuthenticatedRequest).user?.id,
      action: 'DATA_SYNC_IMPORTED',
      entity: 'sync_data',
      entityId: 'sync_data.json',
      newValues: result.counts,
    });
    res.json({
      message: 'Git sync data imported into local database successfully!',
      result,
    });
  } catch (err: any) {
    console.error('Sync import error:', err);
    res.status(500).json({ error: err.message || 'Failed to import sync data' });
  }
});
