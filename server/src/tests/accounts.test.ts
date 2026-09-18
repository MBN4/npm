import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Financial Accounts, Cashbook & P&L API', () => {
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    seedDatabase();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const cashierRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'cash123' });
    cashierToken = cashierRes.body.token;
  });

  it('should fetch cashbook entries and calculate current balance', async () => {
    const res = await request(app)
      .get('/api/accounts/cashbook')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('currentBalance');
    expect(res.body.summary).toHaveProperty('totalIn');
    expect(res.body.summary).toHaveProperty('totalOut');
  });

  it('should allow recording manual cashbook inflow or adjustment', async () => {
    const res = await request(app)
      .post('/api/accounts/cashbook/manual')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        entry_type: 'IN',
        category: 'INITIAL_FLOAT',
        amount: 5000,
        description: 'Morning counter opening float'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('should record an operating expense and create cashbook outflow', async () => {
    const expenseRes = await request(app)
      .post('/api/accounts/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        expense_category: 'Utilities',
        amount: 1200,
        payment_method: 'CASH',
        payee: 'Electricity Company',
        description: 'Monthly Pharmacy Electric Bill'
      });

    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body).toHaveProperty('expenseId');

    // Verify expense is listed
    const listRes = await request(app)
      .get('/api/accounts/expenses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const createdExp = listRes.body.expenses.find((e: any) => e.payee === 'Electricity Company');
    expect(createdExp).toBeDefined();
    expect(createdExp.amount).toBe(1200);

    // Verify cashbook entry was created
    const cbRes = await request(app)
      .get('/api/accounts/cashbook?category=EXPENSE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cbRes.status).toBe(200);
    const cbEntry = cbRes.body.entries.find((e: any) => e.amount === 1200 && e.entry_type === 'OUT');
    expect(cbEntry).toBeDefined();
  });

  it('should compute P&L financial summary accurately', async () => {
    const res = await request(app)
      .get('/api/accounts/pl-summary?period=month')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('revenue');
    expect(res.body).toHaveProperty('cogs');
    expect(res.body).toHaveProperty('grossProfit');
    expect(res.body).toHaveProperty('expenses');
    expect(res.body).toHaveProperty('netProfit');
    expect(res.body).toHaveProperty('balances');
    expect(res.body.balances).toHaveProperty('cashInHand');
    expect(res.body.balances).toHaveProperty('receivablesOutstanding');
    expect(res.body.balances).toHaveProperty('payablesOutstanding');
  });

  it('should generate daily cash register report', async () => {
    const res = await request(app)
      .get('/api/accounts/daily-register')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('date');
    expect(res.body).toHaveProperty('openingBalance');
    expect(res.body).toHaveProperty('breakdown');
    expect(res.body).toHaveProperty('totalIn');
    expect(res.body).toHaveProperty('totalOut');
    expect(res.body).toHaveProperty('expectedCash');
  });

  it('should delete expense and reverse cashbook entry', async () => {
    // Create an expense to delete
    const createRes = await request(app)
      .post('/api/accounts/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        expense_category: 'Refreshment',
        amount: 150,
        payment_method: 'CASH',
        payee: 'Tea Stall',
        description: 'Staff tea'
      });

    const expId = createRes.body.expenseId;

    // Delete it
    const delRes = await request(app)
      .delete(`/api/accounts/expenses/${expId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);

    // Verify it is gone from expenses
    const listRes = await request(app)
      .get('/api/accounts/expenses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.body.expenses.some((e: any) => e.id === expId)).toBe(false);

    // Verify cashbook entry was deleted
    const cbRes = await request(app)
      .get('/api/accounts/cashbook')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cbRes.body.entries.some((e: any) => e.reference_type === 'EXPENSE' && e.reference_id === expId.toString())).toBe(false);
  });

  it('should perform Day-End shift closing settlement with notes and actual cash count', async () => {
    const todayStr = new Date().toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/accounts/daily-closings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        closingDate: todayStr,
        actualCash: 4500,
        notes: 'Shift completed cleanly by admin with 0 shortage.'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary.actual).toBe(4500);
  });

  it('should retrieve historic Day-End shift closings list', async () => {
    const res = await request(app)
      .get('/api/accounts/daily-closings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('closings');
    expect(Array.isArray(res.body.closings)).toBe(true);
    expect(res.body.closings.length).toBeGreaterThan(0);
  });
});
