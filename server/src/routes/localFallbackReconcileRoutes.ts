import { Router, Response } from 'express';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { getLocalFallbackSyncStatus } from '../services/localFallbackSyncService.js';
import { getPendingRecords, reconcileRecords, markSkipped, ReconcileAction } from '../services/localFallbackReconcileService.js';

export const localFallbackReconcileRouter = Router();

localFallbackReconcileRouter.get('/pending', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
  const { lastCleanSyncAt } = getLocalFallbackSyncStatus();
  if (!lastCleanSyncAt) {
    res.json({ customers: [], purchases: [], sales: [] });
    return;
  }
  res.json(getPendingRecords(lastCleanSyncAt));
});

// Sends approved records to the cloud through its real API, in dependency order (patients,
// purchases, then sales), and records skipped ones so they don't keep showing up as pending.
localFallbackReconcileRouter.post('/reconcile', authenticateToken, requirePermission('create_purchases'), async (req: AuthenticatedRequest, res: Response) => {
  const { cloudBaseUrl, cloudToken, send, skip } = req.body as {
    cloudBaseUrl?: string;
    cloudToken?: string;
    send?: ReconcileAction[];
    skip?: ReconcileAction[];
  };

  if (!cloudBaseUrl || !cloudToken) {
    res.status(400).json({ error: 'cloudBaseUrl and cloudToken are required - log into the cloud system first' });
    return;
  }

  try {
    const sendResults = send && send.length ? await reconcileRecords(cloudBaseUrl.replace(/\/$/, ''), cloudToken, send) : [];
    const skipResults = skip && skip.length ? markSkipped(skip) : [];
    res.json({ results: [...sendResults, ...skipResults] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Reconciliation failed unexpectedly' });
  }
});
