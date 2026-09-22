import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Udhaar customer ledger', () => {
  beforeAll(() => seedDatabase());

  it('adds a second purchase, records a payment, and rejects overpayment', async () => {
    const mobile = `03${String(Date.now()).slice(-9)}`;
    const created = await request(app).post('/api/udhaar/customers').send({ name: 'Repeat Credit Test', mobile, category: 'Medicine', amount: 100 });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const purchase = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'DEBIT', amount: 75, category: 'Surgical', reference_no: 'INV-2' });
    expect(purchase.status).toBe(201);
    expect(purchase.body.customer.total_udhaar).toBe(175);
    expect(purchase.body.customer.balance).toBe(175);
    expect(purchase.body.transaction.category).toBe('Surgical');

    const payment = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'CREDIT', amount: 50, payment_method: 'JAZZCASH' });
    expect(payment.status).toBe(201);
    expect(payment.body.customer.paid_amount).toBe(50);
    expect(payment.body.customer.balance).toBe(125);

    const tooMuch = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'CREDIT', amount: 126 });
    expect(tooMuch.status).toBe(400);
    const detail = await request(app).get(`/api/udhaar/customers/${id}`);
    expect(detail.body.customer.balance).toBe(125);
    expect(detail.body.transactions).toHaveLength(3);

    const missingReason = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'ADJUSTMENT', amount: 25 });
    expect(missingReason.status).toBe(400);
    const excessiveReduction = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'ADJUSTMENT', amount: 126, adjustment_reason: 'RETURN' });
    expect(excessiveReduction.status).toBe(400);

    const reduction = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'ADJUSTMENT', amount: 25, adjustment_reason: 'RETURN', description: 'Invoice 123' });
    expect(reduction.status).toBe(201);
    expect(reduction.body.customer.balance).toBe(100);
    expect(reduction.body.customer.paid_amount).toBe(50);
    expect(reduction.body.customer.total_udhaar).toBe(175);
    expect(reduction.body.transaction.adjustment_reason).toBe('RETURN');
    expect(reduction.body.transaction.description).toContain('Invoice 123');

    const clear = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'ADJUSTMENT', amount: 100, adjustment_reason: 'WRITE_OFF' });
    expect(clear.status).toBe(201);
    expect(clear.body.customer.balance).toBe(0);
    expect(clear.body.customer.status).toBe('CLEARED');
    expect(clear.body.customer.paid_amount).toBe(50);

    const nextPurchase = await request(app).post('/api/udhaar/transactions').send({ customer_id: id, type: 'DEBIT', amount: 10 });
    expect(nextPurchase.status).toBe(201);
    expect(nextPurchase.body.customer.balance).toBe(10);
    expect(nextPurchase.body.customer.status).toBe('DUE');
  });
});
