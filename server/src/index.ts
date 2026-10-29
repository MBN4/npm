import express, { Request, Response, NextFunction } from 'express';
// NMP Server Entry Point - Precision TSPL Engine Loaded
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/index.js';
import { authenticateToken, AuthenticatedRequest } from './middleware/auth.js';
import { authRouter } from './routes/authRoutes.js';
import { userRouter } from './routes/userRoutes.js';
import { auditRouter } from './routes/auditRoutes.js';
import { settingsRouter } from './routes/settingsRoutes.js';
import { catalogRouter } from './routes/catalogRoutes.js';
import { medicineRouter } from './routes/medicineRoutes.js';
import { inventoryRouter } from './routes/inventoryRoutes.js';
import { supplierRouter } from './routes/supplierRoutes.js';
import { purchaseRouter } from './routes/purchaseRoutes.js';
import { purchaseInvoiceScanRouter } from './routes/purchaseInvoiceScanRoutes.js';
import { posRouter } from './routes/posRoutes.js';
import { patientRouter } from './routes/patientRoutes.js';
import { prescriptionRouter } from './routes/prescriptionRoutes.js';
import { returnsRouter } from './routes/returnsRoutes.js';
import { expiryRouter } from './routes/expiryRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { accountRouter } from './routes/accountRoutes.js';
import { reportRouter } from './routes/reportRoutes.js';
import { forecastRouter } from './routes/forecastRoutes.js';
import { clinicalRouter } from './routes/clinicalRoutes.js';
import { integrationRouter } from './routes/integrationRoutes.js';
import { backupRouter } from './routes/backupRoutes.js';
import { cashOutRouter } from './routes/cashOutRoutes.js';
import { syncRouter } from './routes/syncRoutes.js';
import { medpracRouter } from './routes/medpracRoutes.js';
import { udhaarRouter } from './routes/udhaarRoutes.js';
import { billingPersonRouter } from './routes/billingPersonRoutes.js';
import { activityRouter } from './routes/activityRoutes.js';
import { classificationRouter } from './routes/classificationRoutes.js';
import { scheduleBDRouter } from './routes/scheduleBDRoutes.js';
import { securityHeaders } from './middleware/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Initialize database schema
initDatabase();

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(securityHeaders);
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    system: 'Naveed Medical Pharmacy (NMP)',
    version: '1.0.0',
    phase: 'Phase 1 - Foundation & Auth',
    timestamp: new Date().toISOString()
  });
});

// Local-fallback mode only: lets staff (and the client's status indicator) see whether this
// offline-backup instance is currently paused from auto-syncing because it has outage-time
// activity waiting on reconciliation.
if (process.env.ENABLE_LOCAL_FALLBACK_SYNC === 'true') {
  app.get('/api/local-fallback/sync-status', authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
    const { getLocalFallbackSyncStatus } = await import('./services/localFallbackSyncService.js');
    res.json(getLocalFallbackSyncStatus());
  });

  app.post('/api/local-fallback/sync-now', authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
    const { pullAndImportCatalogIfClean } = await import('./services/localFallbackSyncService.js');
    const repoRoot = path.resolve(__dirname, '../..');
    const result = await pullAndImportCatalogIfClean(repoRoot);
    res.json(result);
  });
}

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/medicines', medicineRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/suppliers', supplierRouter);
app.use('/api/purchases/scans', purchaseInvoiceScanRouter);
app.use('/api/purchases', purchaseRouter);
app.use('/api/pos', posRouter);
app.use('/api/patients', patientRouter);
app.use('/api/prescriptions', prescriptionRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/expiry', expiryRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/reports', reportRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/clinical', clinicalRouter);
app.use('/api/integrations', integrationRouter);
app.use('/api/integration', integrationRouter);
app.use('/api/backup', backupRouter);
app.use('/api/cashout', cashOutRouter);
app.use('/api/sync', syncRouter);
app.use('/api/medprac', medpracRouter);
app.use('/api/udhaar', udhaarRouter);
app.use('/api/billing-persons', billingPersonRouter);
app.use('/api/activity', activityRouter);
app.use('/api/classifications', classificationRouter);
app.use('/api/schedule-bd', scheduleBDRouter);

// Local-fallback mode only: on the cloud deployment, Vercel serves the client and proxies /api/*
// to this server (see client/vercel.json), so this server never serves HTML there. On the
// pharmacy PC's offline-backup instance there's no Vercel, so this same server serves the built
// client directly - the client already calls relative '/api/...' paths, so no client code or
// build needs to differ between the two deployments, only this flag.
if (process.env.SERVE_LOCAL_CLIENT === 'true') {
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    app.use(express.static(clientDistPath));
    app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
    console.log(`[local-fallback] Serving client build from ${clientDistPath}`);
  } else {
    console.warn(`[local-fallback] SERVE_LOCAL_CLIENT=true but no build found at ${clientDistPath} - run "npm run build" in client/ first`);
  }
}

// Global 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`  NAVEED MEDICAL PHARMACY (NMP) BACKEND SERVER       `);
    console.log(`  Running on: http://${HOST}:${PORT}               `);
    console.log(`  Database: SQLite WAL Mode with Foreign Keys       `);
    console.log(`====================================================`);
  });

  if (process.env.ENABLE_LOCAL_FALLBACK_SYNC === 'true') {
    import('./services/localFallbackSyncService.js').then(({ startLocalFallbackSync }) => {
      const repoRoot = path.resolve(__dirname, '../..');
      startLocalFallbackSync(repoRoot, 15);
      console.log(`[local-fallback-sync] Background catalog sync enabled (repo root: ${repoRoot})`);
    });
  }
}
