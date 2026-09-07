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

describe('Phase 3 - Suppliers & Purchases Inward Test Suite', () => {
  it('GET /api/suppliers returns registered pharma distributors', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.suppliers).toBeDefined();
    expect(res.body.suppliers.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/suppliers registers a new supplier with opening balance', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Prime Healthcare Distributors ' + Date.now(),
        contactPerson: 'Khurram Shehzad',
        phone: '0300-9876543',
        openingBalance: 5000.0
      });

    expect(res.status).toBe(201);
    expect(res.body.supplierId).toBeDefined();

    // Verify ledger has opening balance
    const detailRes = await request(app)
      .get(`/api/suppliers/${res.body.supplierId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.supplier.current_balance).toBe(5000.0);
    expect(detailRes.body.ledger.length).toBe(1);
    expect(detailRes.body.ledger[0].transaction_type).toBe('OPENING_BALANCE');
  });

  it('POST /api/purchases atomically receives inward invoice, updates batches, movements, and ledger', async () => {
    const invNumber = 'PINV-' + Math.floor(100000 + Math.random() * 900000);
    const batchNum = 'PAN-PUR-' + Math.floor(1000 + Math.random() * 9000);

    const purchasePayload = {
      supplierId: 1,
      invoiceNumber: invNumber,
      purchaseDate: '2026-09-07',
      subtotal: 1500.0,
      totalAmount: 1500.0,
      paidAmount: 500.0, // Partial payment: 1000 remaining
      paymentMethod: 'CASH',
      items: [
        {
          medicineId: 1, // Panadol 500mg
          batchNumber: batchNum,
          expiryDate: '2028-06-30',
          mfgDate: '2026-01-01',
          purchasePrice: 2.50,
          salePrice: 3.50,
          quantity: 500,
          bonusQuantity: 50,
          lineTotal: 1250.0
        }
      ]
    };

    const res = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(purchasePayload);

    expect(res.status).toBe(201);
    expect(res.body.purchaseId).toBeDefined();
    expect(res.body.remaining).toBe(1000.0);

    // Verify batch was created with quantity = 550 (500 + 50 bonus)
    const batchRes = await request(app)
      .get(`/api/inventory/batches?medicineId=1`)
      .set('Authorization', `Bearer ${adminToken}`);

    const newBatch = batchRes.body.batches.find((b: any) => b.batch_number === batchNum);
    expect(newBatch).toBeDefined();
    expect(newBatch.quantity).toBe(550);

    // Verify stock movement was recorded
    const movRes = await request(app)
      .get(`/api/inventory/movements?batchId=${newBatch.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(movRes.status).toBe(200);
    expect(movRes.body.movements.length).toBeGreaterThan(0);
    expect(movRes.body.movements[0].movement_type).toBe('PURCHASE');
    expect(movRes.body.movements[0].quantity_change).toBe(550);
  });

  it('POST /api/suppliers/:id/payments records payment and updates balance', async () => {
    // Supplier 1 has balance
    const supRes = await request(app)
      .get('/api/suppliers/1')
      .set('Authorization', `Bearer ${adminToken}`);
    const currentBalance = supRes.body.supplier.current_balance;

    const payRes = await request(app)
      .post('/api/suppliers/1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 500.0,
        paymentMethod: 'CASH',
        notes: 'Interim clearing payment'
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.newBalance).toBe(currentBalance - 500.0);

    // Verify ledger record exists
    const updatedSup = await request(app)
      .get('/api/suppliers/1')
      .set('Authorization', `Bearer ${adminToken}`);

    const lastLedger = updatedSup.body.ledger[0];
    expect(lastLedger.transaction_type).toBe('PAYMENT_OUT');
    expect(lastLedger.debit).toBe(500.0);
  });
});
