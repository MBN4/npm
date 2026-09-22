import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { db } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';

describe('Editing an existing patient', () => {
  let token: string;

  beforeAll(async () => {
    seedDatabase();
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.token;
  });

  it('updates details, clears optional fields, preserves the balance, and rejects a duplicate mobile', async () => {
    const auth = `Bearer ${token}`;
    const first = await request(app).post('/api/patients').set('Authorization', auth).send({
      name: 'Original Patient', mobile: '03009991110', age: 42, gender: 'MALE', allergyNotes: 'Penicillin', creditLimit: 5000
    });
    const second = await request(app).post('/api/patients').set('Authorization', auth).send({
      name: 'Other Patient', mobile: '03009991111'
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const id = Number(first.body.patientId);
    db.prepare('UPDATE customers SET current_balance = 125 WHERE id = ?').run(id);

    const duplicate = await request(app).put(`/api/patients/${id}`).set('Authorization', auth).send({ mobile: '03009991111' });
    expect(duplicate.status).toBe(400);

    const updated = await request(app).put(`/api/patients/${id}`).set('Authorization', auth).send({
      name: 'Corrected Patient', mobile: '', age: null, gender: 'FEMALE', allergyNotes: '', creditLimit: 7500
    });
    expect(updated.status).toBe(200);
    const patient = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
    expect(patient).toMatchObject({
      name: 'Corrected Patient', mobile: null, age: null, gender: 'FEMALE',
      allergy_notes: null, credit_limit: 7500, current_balance: 125
    });
  });
});
