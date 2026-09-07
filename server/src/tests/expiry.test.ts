import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

let adminToken: string;

beforeAll(async () => {
  seedDatabase();

  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.token;
});

describe('Phase 6 - Expiry Control & Notifications Test Suite', () => {
  it('GET /api/expiry/dashboard aggregates accurate expiry windows', async () => {
    const res = await request(app)
      .get('/api/expiry/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.expired_batch_count).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.days_90_count).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.expired_cost_loss).toBeGreaterThan(0);
  });

  it('GET /api/expiry/batches filters batches by window', async () => {
    const res = await request(app)
      .get('/api/expiry/batches?window=EXPIRED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.batches.length).toBeGreaterThan(0);
    expect(res.body.batches[0].expiry_bucket).toBe('EXPIRED');
  });

  it('POST /api/expiry/dispose writes off expired units and records movement', async () => {
    // Find an expired batch
    const batchesRes = await request(app)
      .get('/api/expiry/batches?window=EXPIRED')
      .set('Authorization', `Bearer ${adminToken}`);

    const targetBatch = batchesRes.body.batches[0];
    const initialQty = targetBatch.quantity;

    const res = await request(app)
      .post('/api/expiry/dispose')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        batchId: targetBatch.id,
        quantity: 5,
        reason: 'Authorized expired stock incineration'
      });

    expect(res.status).toBe(200);
    expect(res.body.remainingQuantity).toBe(initialQty - 5);

    // Verify stock movement was recorded
    const movRes = await request(app)
      .get(`/api/inventory/movements?batchId=${targetBatch.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(movRes.status).toBe(200);
    expect(movRes.body.movements.some((m: any) => m.movement_type === 'EXPIRED')).toBe(true);
  });

  it('POST /api/expiry/claims creates a supplier return claim', async () => {
    // Get near-expiry batches
    const nearRes = await request(app)
      .get('/api/expiry/batches?window=90')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(nearRes.body.batches.length).toBeGreaterThan(0);
    const batch = nearRes.body.batches[0];

    const claimRes = await request(app)
      .post('/api/expiry/claims')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId: batch.supplier_id || 1,
        batchIds: [batch.id],
        notes: 'Pre-expiry replacement request'
      });

    expect(claimRes.status).toBe(201);
    expect(claimRes.body.claimNumber).toBeDefined();
    expect(claimRes.body.totalClaimValue).toBeGreaterThan(0);
  });

  it('Notification center generates and retrieves system alerts', async () => {
    // Generate alerts based on DB
    const genRes = await request(app)
      .post('/api/notifications/generate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(genRes.status).toBe(200);

    // Retrieve notifications
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.notifications.length).toBeGreaterThan(0);

    // Mark as read
    const firstNotif = listRes.body.notifications[0];
    const readRes = await request(app)
      .put(`/api/notifications/${firstNotif.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(readRes.status).toBe(200);
  });
});
