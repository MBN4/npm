import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Reports & Business Intelligence API', () => {
  let adminToken: string;

  beforeAll(async () => {
    seedDatabase();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  it('should fetch sales summary and profit metrics', async () => {
    const res = await request(app)
      .get('/api/reports/sales-summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('netSales');
    expect(res.body.summary).toHaveProperty('totalCogs');
    expect(res.body.summary).toHaveProperty('grossProfit');
    expect(res.body.summary).toHaveProperty('profitMarginPct');
    expect(res.body).toHaveProperty('paymentBreakdown');
    expect(res.body).toHaveProperty('dailyTrend');
  });

  it('should fetch top selling medicines', async () => {
    const res = await request(app)
      .get('/api/reports/top-selling?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('topItems');
    expect(Array.isArray(res.body.topItems)).toBe(true);
  });

  it('should fetch cashier performance report', async () => {
    const res = await request(app)
      .get('/api/reports/cashier-performance')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('performance');
    expect(Array.isArray(res.body.performance)).toBe(true);
  });

  it('should calculate comprehensive inventory valuation', async () => {
    const res = await request(app)
      .get('/api/reports/inventory-valuation')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('totalStockUnits');
    expect(res.body.summary).toHaveProperty('totalCostValuation');
    expect(res.body.summary).toHaveProperty('totalRetailValuation');
    expect(res.body.summary).toHaveProperty('unrealizedProfit');
    expect(res.body).toHaveProperty('categoryBreakdown');
  });

  it('should identify dead stock and tied up capital', async () => {
    const res = await request(app)
      .get('/api/reports/dead-stock?days=30')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deadStock');
    expect(res.body).toHaveProperty('totalTiedUpCapital');
    expect(res.body).toHaveProperty('itemCount');
  });

  it('should fetch customer credit aging report', async () => {
    const res = await request(app)
      .get('/api/reports/customer-credit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('customers');
    expect(res.body).toHaveProperty('totalOutstanding');
  });

  it('should fetch supplier payables aging report', async () => {
    const res = await request(app)
      .get('/api/reports/supplier-payables')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suppliers');
    expect(res.body).toHaveProperty('totalPayables');
  });

  it('should export inventory as CSV format', async () => {
    const res = await request(app)
      .get('/api/reports/export-csv?type=inventory')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Medicine Name');
    expect(res.text).toContain('Batch Number');
    expect(res.text).toContain('Stock Quantity');
  });
});
