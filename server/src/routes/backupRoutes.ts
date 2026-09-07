import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { db } from '../db/index.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const backupRouter = Router();

// Ensure backups directory exists
const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const DB_PATH = path.resolve(process.cwd(), 'data', 'nmp.sqlite');
const WAL_PATH = path.resolve(process.cwd(), 'data', 'nmp.sqlite-wal');

/**
 * GET /api/backup/stats
 * Provides database metrics, file sizes, table counts, and last backup info
 */
backupRouter.get('/stats', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    let dbSize = 0;
    let walSize = 0;

    if (fs.existsSync(DB_PATH)) {
      dbSize = fs.statSync(DB_PATH).size;
    }
    if (fs.existsSync(WAL_PATH)) {
      walSize = fs.statSync(WAL_PATH).size;
    }

    const counts = {
      medicines: (db.prepare('SELECT COUNT(*) as c FROM medicines').get() as any)?.c || 0,
      batches: (db.prepare('SELECT COUNT(*) as c FROM batches').get() as any)?.c || 0,
      sales: (db.prepare('SELECT COUNT(*) as c FROM sales').get() as any)?.c || 0,
      purchases: (db.prepare('SELECT COUNT(*) as c FROM purchases').get() as any)?.c || 0,
      customers: (db.prepare('SELECT COUNT(*) as c FROM customers').get() as any)?.c || 0,
      auditLogs: (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any)?.c || 0
    };

    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      dbPath: DB_PATH,
      dbSizeBytes: dbSize,
      dbSizeMb: +(dbSize / (1024 * 1024)).toFixed(2),
      walSizeBytes: walSize,
      walSizeMb: +(walSize / (1024 * 1024)).toFixed(2),
      tableCounts: counts,
      backupCount: files.length,
      lastBackup: files.length > 0 ? files[0] : null
    });
  } catch (err: any) {
    console.error('Backup stats error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve backup stats' });
  }
});

/**
 * GET /api/backup/list
 * Returns list of all existing backup snapshots with size and timestamps
 */
backupRouter.get('/list', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeMb: +(stats.size / (1024 * 1024)).toFixed(2),
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ backups: files });
  } catch (err: any) {
    console.error('Backup list error:', err);
    res.status(500).json({ error: err.message || 'Failed to list backups' });
  }
});

/**
 * POST /api/backup/create
 * Creates an online hot SQLite backup using better-sqlite3 native backup() API
 */
backupRouter.post('/create', authenticateToken, requireRole(['Admin']), async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `nmp_backup_${timestamp}.sqlite`;
    const destPath = path.join(BACKUPS_DIR, filename);

    // Native hot backup of WAL mode database
    await (db as any).backup(destPath);

    const stats = fs.statSync(destPath);

    logAudit({
      userId: (req as AuthenticatedRequest).user?.id,
      action: 'DATABASE_BACKUP_CREATED',
      entity: 'backup',
      entityId: filename,
      newValues: { filename, sizeBytes: stats.size }
    });

    res.status(201).json({
      message: 'Hot backup snapshot created successfully',
      backup: {
        filename,
        sizeBytes: stats.size,
        sizeMb: +(stats.size / (1024 * 1024)).toFixed(2),
        createdAt: stats.mtime.toISOString()
      }
    });
  } catch (err: any) {
    console.error('Backup creation error:', err);
    res.status(500).json({ error: err.message || 'Failed to create hot backup' });
  }
});

/**
 * GET /api/backup/download/:filename
 * Securely downloads a backup snapshot file
 */
backupRouter.get('/download/:filename', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    const rawFilename = req.params.filename;
    // Prevent directory traversal
    const safeFilename = path.basename(rawFilename);
    const filePath = path.join(BACKUPS_DIR, safeFilename);

    if (!fs.existsSync(filePath) || !safeFilename.endsWith('.sqlite')) {
      return res.status(404).json({ error: 'Backup file not found or invalid' });
    }

    res.download(filePath, safeFilename, (err) => {
      if (err) {
        console.error('File download error:', err);
      }
    });
  } catch (err: any) {
    console.error('Backup download error:', err);
    res.status(500).json({ error: err.message || 'Failed to download backup' });
  }
});

/**
 * POST /api/backup/verify/:filename
 * Opens a backup file in read-only mode and executes PRAGMA integrity_check
 */
backupRouter.post('/verify/:filename', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(BACKUPS_DIR, safeFilename);

    if (!fs.existsSync(filePath) || !safeFilename.endsWith('.sqlite')) {
      return res.status(404).json({ error: 'Backup snapshot not found' });
    }

    const testDb = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrityRows = testDb.pragma('integrity_check') as any[];
    const isOk = integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok';

    const testCounts = {
      medicines: (testDb.prepare('SELECT COUNT(*) as c FROM medicines').get() as any)?.c || 0,
      batches: (testDb.prepare('SELECT COUNT(*) as c FROM batches').get() as any)?.c || 0,
      sales: (testDb.prepare('SELECT COUNT(*) as c FROM sales').get() as any)?.c || 0,
      customers: (testDb.prepare('SELECT COUNT(*) as c FROM customers').get() as any)?.c || 0
    };

    testDb.close();

    res.json({
      filename: safeFilename,
      verified: isOk,
      integrityResult: integrityRows,
      recordSummary: testCounts
    });
  } catch (err: any) {
    console.error('Backup verification error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify backup snapshot' });
  }
});

/**
 * DELETE /api/backup/:filename
 * Deletes an old backup snapshot
 */
backupRouter.delete('/:filename', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(BACKUPS_DIR, safeFilename);

    if (!fs.existsSync(filePath) || !safeFilename.endsWith('.sqlite')) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    fs.unlinkSync(filePath);

    logAudit({
      userId: (req as AuthenticatedRequest).user?.id,
      action: 'DATABASE_BACKUP_DELETED',
      entity: 'backup',
      entityId: safeFilename,
      oldValues: { filename: safeFilename }
    });

    res.json({ message: `Backup ${safeFilename} deleted successfully` });
  } catch (err: any) {
    console.error('Backup delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete backup' });
  }
});
