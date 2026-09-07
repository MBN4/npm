import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Demand Forecasting & Auto-Reordering Engine API', () => {
  let adminToken: string;

  beforeAll(async () => {
    seedDatabase();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  it('should calculate ADC, days of stock remaining, and suggested reorders', async () => {
    const res = await request(app)
      .get('/api/forecast/reorder-suggestions?lookbackDays=30&leadTimeDays=3&safetyDays=7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('totalMedicines');
    expect(res.body.summary).toHaveProperty('totalItemsNeedingReorder');
    expect(res.body).toHaveProperty('suggestions');
    expect(Array.isArray(res.body.suggestions)).toBe(true);

    if (res.body.suggestions.length > 0) {
      const item = res.body.suggestions[0];
      expect(item).toHaveProperty('medicineId');
      expect(item).toHaveProperty('brandName');
      expect(item).toHaveProperty('currentStock');
      expect(item).toHaveProperty('adc');
      expect(item).toHaveProperty('daysOfStock');
      expect(item).toHaveProperty('stockStatus');
      expect(item).toHaveProperty('suggestedQty');
    }
  });

  it('should fetch sales velocity history for a single medicine', async () => {
    const res = await request(app)
      .get('/api/forecast/medicine/1/velocity')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('medicineId', '1');
    expect(res.body).toHaveProperty('adc');
    expect(res.body).toHaveProperty('currentStock');
    expect(res.body).toHaveProperty('daysOfStock');
    expect(res.body).toHaveProperty('dailyHistory');
    expect(Array.isArray(res.body.dailyHistory)).toBe(true);
  });

  it('should generate draft purchase order with automated line estimates', async () => {
    const res = await request(app)
      .post('/api/forecast/generate-po')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId: 1,
        items: [
          { medicineId: 1, quantity: 200 },
          { medicineId: 2, quantity: 50 }
        ],
        notes: 'Urgent restocking order generated from forecast'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('poNumber');
    expect(res.body).toHaveProperty('supplier');
    expect(res.body).toHaveProperty('items');
    expect(res.body.items.length).toBe(2);
    expect(res.body).toHaveProperty('totalEstimatedCost');
    expect(res.body.totalEstimatedCost).toBeGreaterThan(0);
  });
});
