import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Phase 12: Backup, Sync & Resilience Integration Tests', () => {
  let adminToken: string;
  let cashierToken: string;
  let createdBackupFilename: string;

  beforeAll(async () => {
    seedDatabase();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const cashierRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'cashier123' });
    cashierToken = cashierRes.body.token;
  });

  it('blocks non-admin users from accessing backup endpoints', async () => {
    const res = await request(app)
      .get('/api/backup/stats')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/backup/stats returns database size and table counts for admin', async () => {
    const res = await request(app)
      .get('/api/backup/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dbSizeBytes');
    expect(res.body).toHaveProperty('tableCounts');
    expect(res.body.tableCounts).toHaveProperty('medicines');
    expect(res.body.tableCounts).toHaveProperty('batches');
  });

  it('POST /api/backup/create generates a valid hot SQLite backup snapshot', async () => {
    const res = await request(app)
      .post('/api/backup/create')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('backup');
    expect(res.body.backup).toHaveProperty('filename');
    expect(res.body.backup.filename).toMatch(/^nmp_backup_.*\.sqlite$/);
    expect(res.body.backup.sizeBytes).toBeGreaterThan(0);
    createdBackupFilename = res.body.backup.filename;
  });

  it('POST /api/backup/verify/:filename validates integrity check of the created backup', async () => {
    expect(createdBackupFilename).toBeDefined();
    const res = await request(app)
      .post(`/api/backup/verify/${createdBackupFilename}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body).toHaveProperty('recordSummary');
    expect(res.body.recordSummary).toHaveProperty('medicines');
  });

  it('GET /api/backup/list includes the created backup snapshot', async () => {
    const res = await request(app)
      .get('/api/backup/list')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.backups)).toBe(true);
    const found = res.body.backups.find((b: any) => b.filename === createdBackupFilename);
    expect(found).toBeDefined();
  });

  it('DELETE /api/backup/:filename cleans up the test backup snapshot', async () => {
    const res = await request(app)
      .delete(`/api/backup/${createdBackupFilename}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted successfully');
  });
});
