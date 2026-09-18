import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

let adminToken: string;
let cashierToken: string;

beforeAll(async () => {
  seedDatabase();

  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.token;

  const cashRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cashier', password: 'cash123' });
  cashierToken = cashRes.body.token;
});

describe('Phase 2 - Medicine Master & Batch Inventory Test Suite', () => {
  it('GET /api/medicines lists products with joined generics and available stock', async () => {
    const res = await request(app)
      .get('/api/medicines')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.medicines).toBeDefined();
    expect(res.body.medicines.length).toBeGreaterThanOrEqual(4);

    const panadol = res.body.medicines.find((m: any) => m.brand_name.includes('Panadol'));
    expect(panadol).toBeDefined();
    expect(panadol.generic_name).toBe('Paracetamol');
    expect(panadol.available_stock).toBeGreaterThan(0);
  });

  it('GET /api/medicines?search=Augmentin filters accurately', async () => {
    const res = await request(app)
      .get('/api/medicines?search=Augmentin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.medicines.length).toBe(1);
    expect(res.body.medicines[0].brand_name).toContain('Augmentin');
  });

  it('POST /api/medicines creates a new medicine record', async () => {
    const uniqueBarcode = '896' + Math.floor(100000000 + Math.random() * 900000000);
    const newMed = {
      brandName: 'Brufen 400mg',
      dosageForm: 'Tablet',
      strength: '400mg',
      barcode: uniqueBarcode,
      rackLocation: 'Rack A-3',
      minStockLevel: 20,
      reorderLevel: 40
    };

    const res = await request(app)
      .post('/api/medicines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMed);

    expect(res.status).toBe(201);
    expect(res.body.medicineId).toBeDefined();

    // Verify duplicate barcode is rejected
    const dupRes = await request(app)
      .post('/api/medicines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        brandName: 'Brufen Duplicate',
        barcode: uniqueBarcode
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.error).toContain('already assigned');
  });

  it('GET /api/inventory/batches computes valid, near expiry, and expired states', async () => {
    const res = await request(app)
      .get('/api/inventory/batches')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.batches.length).toBeGreaterThan(0);

    const expiredBatch = res.body.batches.find((b: any) => b.batch_number === 'RSK-EXP-99');
    expect(expiredBatch).toBeDefined();
    expect(expiredBatch.computed_expiry_status).toBe('EXPIRED');

    const nearExpiryBatch = res.body.batches.find((b: any) => b.batch_number === 'AUG-26-01');
    expect(nearExpiryBatch).toBeDefined();
    expect(nearExpiryBatch.computed_expiry_status).toBe('NEAR_EXPIRY');
  });

  it('GET /api/inventory/valuation computes stock valuation and projected margin', async () => {
    const res = await request(app)
      .get('/api/inventory/valuation')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.valuation.total_units).toBeGreaterThan(0);
    expect(res.body.valuation.total_purchase_value).toBeGreaterThan(0);
    expect(res.body.valuation.active_retail_value).toBeGreaterThan(0);
    expect(res.body.valuation.projected_gross_profit).toBeGreaterThan(0);
  });

  it('POST /api/inventory/adjust updates batch count and logs stock movement', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        batchId: 1,
        newQuantity: 500,
        reason: 'Monthly physical stock audit'
      });

    expect(res.status).toBe(200);
    expect(res.body.newQty).toBe(500);

    // Verify stock movement was recorded
    const movRes = await request(app)
      .get('/api/inventory/movements?batchId=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(movRes.status).toBe(200);
    expect(movRes.body.movements.length).toBeGreaterThan(0);
    expect(movRes.body.movements.some((m: any) => m.notes === 'Monthly physical stock audit')).toBe(true);
  });

  it('POST /api/inventory/adjust strictly rejects negative stock', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        batchId: 1,
        newQuantity: -10,
        reason: 'Invalid count'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Negative stock is strictly prohibited');
  });

  it('GET /api/inventory/lookup-barcode handles SpeedX 1D and 2D GS1 barcode lookups accurately', async () => {
    // 1. Registered product barcode lookup (Panadol 500mg)
    const res = await request(app)
      .get('/api/inventory/lookup-barcode?code=896400012345')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.brandName).toContain('Panadol');

    // 2. 2D GS1 DataMatrix barcode lookup with parsed GTIN, Expiry, and Batch
    const gs1Code = '(01)0896400012345(17)281231(10)BN-998877';
    const gs1Res = await request(app)
      .get(`/api/inventory/lookup-barcode?code=${encodeURIComponent(gs1Code)}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(gs1Res.status).toBe(200);
    expect(gs1Res.body.found).toBe(true);
    expect(gs1Res.body.batchNumber).toContain('BN-998877');
    expect(gs1Res.body.expiryDate).toBe('2028-12-31');

    // 3. Online Master Dictionary lookup (855434001358 -> Qarshi Sharbat Faulad 240ml)
    const onlineRes = await request(app)
      .get('/api/inventory/lookup-barcode?code=855434001358')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(onlineRes.status).toBe(200);
    expect(onlineRes.body.found).toBe(true);
    expect(onlineRes.body.brandName).toContain('Qarshi Sharbat Faulad');



    // 4. Completely unregistered barcode lookup returns found: false cleanly
    const unregRes = await request(app)
      .get('/api/inventory/lookup-barcode?code=9998887776665')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(unregRes.status).toBe(200);
    expect(unregRes.body.found).toBe(false);
    expect(unregRes.body.barcode).toBe('9998887776665');
  });



});

