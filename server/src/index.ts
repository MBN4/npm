import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db/index.js';
import { authRouter } from './routes/authRoutes.js';
import { userRouter } from './routes/userRoutes.js';
import { auditRouter } from './routes/auditRoutes.js';
import { settingsRouter } from './routes/settingsRoutes.js';
import { catalogRouter } from './routes/catalogRoutes.js';
import { medicineRouter } from './routes/medicineRoutes.js';
import { inventoryRouter } from './routes/inventoryRoutes.js';
import { supplierRouter } from './routes/supplierRoutes.js';
import { purchaseRouter } from './routes/purchaseRoutes.js';
import { posRouter } from './routes/posRoutes.js';
import { patientRouter } from './routes/patientRoutes.js';
import { prescriptionRouter } from './routes/prescriptionRoutes.js';
import { expiryRouter } from './routes/expiryRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { accountRouter } from './routes/accountRoutes.js';
import { reportRouter } from './routes/reportRoutes.js';
import { forecastRouter } from './routes/forecastRoutes.js';
import { clinicalRouter } from './routes/clinicalRoutes.js';
import { integrationRouter } from './routes/integrationRoutes.js';
import { backupRouter } from './routes/backupRoutes.js';
import { cashOutRouter } from './routes/cashOutRoutes.js';
import { securityHeaders } from './middleware/security.js';

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

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/medicines', medicineRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/suppliers', supplierRouter);
app.use('/api/purchases', purchaseRouter);
app.use('/api/pos', posRouter);
app.use('/api/patients', patientRouter);
app.use('/api/prescriptions', prescriptionRouter);
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
}
