import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

beforeAll(() => {
  seedDatabase();
});

describe('Phase 1 - Foundation & Auth Test Suite', () => {
  it('GET /api/health returns 200 healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.system).toContain('Naveed Medical Pharmacy');
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('POST /api/auth/login authenticates admin successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.roleName).toBe('Admin');
    expect(res.body.user.permissions.length).toBeGreaterThan(5);
  });

  it('GET /api/auth/me blocks unauthorized requests', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me succeeds with bearer token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'pharmacist', password: 'pharma123' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('pharmacist');
    expect(res.body.user.roleName).toBe('Pharmacist');
  });

  it('Enforces RBAC: Cashier cannot view audit logs (Admin only)', async () => {
    const cashLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'cash123' });
    const cashToken = cashLogin.body.token;

    const res = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${cashToken}`);
    expect(res.status).toBe(403);
  });

  it('Admin can view audit logs and login is logged', async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const adminToken = adminLogin.body.token;

    const res = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toBeDefined();
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs.some((l: any) => l.action === 'LOGIN')).toBe(true);
  });
});
