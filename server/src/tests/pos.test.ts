import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

let cashierToken: string;
let adminToken: string;

beforeAll(async () => {
  seedDatabase();

  const cashRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cashier', password: 'cash123' });
  cashierToken = cashRes.body.token;

  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.token;
});

describe('Phase 4 - POS Counter, FEFO & Expiry Hard Block Test Suite', () => {
  it('GET /api/pos/search selects earliest valid batch under FEFO', async () => {
    const res = await request(app)
      .get('/api/pos/search?q=Panadol')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);

    const panadol = res.body.results[0];
    expect(panadol.brand_name).toContain('Panadol');
    expect(panadol.fefo_batch).toBeDefined();
    // Batch PAN-2026-A expires earlier than PAN-2026-B
    expect(panadol.fefo_batch.batch_number).toBe('PAN-2026-A');
  });

  it('POST /api/pos/checkout completes atomic cash sale and decrements stock', async () => {
    // Check initial stock of batch 1
    const beforeBatch = await request(app)
      .get('/api/inventory/batches?medicineId=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const initialQty = beforeBatch.body.batches.find((b: any) => b.id === 1).quantity;

    const salePayload = {
      items: [
        {
          medicineId: 1,
          batchId: 1,
          quantity: 10,
          unitPrice: 3.50,
          discount: 0
        }
      ],
      subtotal: 35.0,
      discount: 0,
      tax: 0,
      totalAmount: 35.0,
      paidAmount: 50.0, // Customer pays 50, gets 15 change
      paymentMethod: 'CASH'
    };

    const res = await request(app)
      .post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(salePayload);

    expect(res.status).toBe(201);
    expect(res.body.invoice.invoiceNumber).toBeDefined();
    expect(res.body.invoice.changeAmount).toBe(15.0);

    // Verify batch stock decreased by exactly 10
    const afterBatch = await request(app)
      .get('/api/inventory/batches?medicineId=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const finalQty = afterBatch.body.batches.find((b: any) => b.id === 1).quantity;

    expect(finalQty).toBe(initialQty - 10);
  });

  it('STRICT INVARIANT: Server explicitly blocks sale of expired batch', async () => {
    // Batch 5 is Risek RSK-EXP-99 which is expired
    const expiredPayload = {
      items: [
        {
          medicineId: 3,
          batchId: 5,
          quantity: 2,
          unitPrice: 28.0
        }
      ],
      totalAmount: 56.0,
      paidAmount: 56.0,
      paymentMethod: 'CASH'
    };

    const res = await request(app)
      .post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(expiredPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('EXPIRED STOCK CANNOT BE SOLD');
  });

  it('STRICT INVARIANT: Blocks sale if quantity exceeds stock', async () => {
    const overPayload = {
      items: [
        {
          medicineId: 1,
          batchId: 1,
          quantity: 999999, // Exceeds available stock
          unitPrice: 3.50
        }
      ],
      totalAmount: 3499996.5,
      paidAmount: 3500000.0,
      paymentMethod: 'CASH'
    };

    const res = await request(app)
      .post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(overPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Insufficient stock');
  });

  it('Credit sale updates customer receivable ledger', async () => {
    const custRes = await request(app)
      .get('/api/pos/search?q=Panadol')
      .set('Authorization', `Bearer ${cashierToken}`);
    const validBatch = custRes.body.results[0].fefo_batch;

    const creditPayload = {
      customerId: 1, // Muhammad Usman
      items: [
        {
          medicineId: 1,
          batchId: validBatch.batch_id,
          quantity: 5,
          unitPrice: 3.50
        }
      ],
      totalAmount: 17.50,
      paidAmount: 0.0, // Full credit / udhar
      paymentMethod: 'CREDIT'
    };

    const res = await request(app)
      .post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(creditPayload);

    expect(res.status).toBe(201);
    expect(res.body.invoice.remainingAmount).toBe(17.50);
  });

  it('Supports bill hold and resume workflow', async () => {
    const holdPayload = {
      customerName: 'Ahmad Bilal',
      cart: [
        { medicineId: 1, batchId: 1, brandName: 'Panadol 500mg', quantity: 2, unitPrice: 3.50 }
      ]
    };

    // Hold bill
    const holdRes = await request(app)
      .post('/api/pos/hold')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(holdPayload);

    expect(holdRes.status).toBe(201);
    expect(holdRes.body.billIdentifier).toBeDefined();

    // List held bills
    const listRes = await request(app)
      .get('/api/pos/held')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.heldBills.length).toBeGreaterThan(0);
    const target = listRes.body.heldBills.find((h: any) => h.bill_identifier === holdRes.body.billIdentifier);
    expect(target).toBeDefined();
    expect(target.customer_name).toBe('Ahmad Bilal');

    // Remove / Resume held bill
    const delRes = await request(app)
      .delete(`/api/pos/held/${target.id}`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(delRes.status).toBe(200);
  });

  it('POST /api/pos/sync-offline synchronizes batch offline sales correctly', async () => {
    const offlinePayload = {
      sales: [
        {
          offlineId: 'OFFLINE-TEST-001',
          customerId: null,
          items: [
            {
              medicineId: 1,
              batchId: 1,
              quantity: 2,
              unitPrice: 3.50,
              discount: 0,
              lineTotal: 7.0
            }
          ],
          subtotal: 7.0,
          discount: 0,
          tax: 0,
          totalAmount: 7.0,
          paidAmount: 10.0,
          paymentMethod: 'CASH',
          notes: 'Test offline sync',
          timestamp: new Date().toISOString()
        }
      ]
    };

    const res = await request(app)
      .post('/api/pos/sync-offline')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(offlinePayload);

    expect(res.status).toBe(200);
    expect(res.body.syncedCount).toBe(1);
    expect(res.body.failedCount).toBe(0);
    expect(res.body.synced[0].offlineId).toBe('OFFLINE-TEST-001');
    expect(res.body.synced[0].invoiceNumber).toBeDefined();
  });
});
