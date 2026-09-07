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

describe('Phase 5 - Patient CRM & Prescriptions (Rx) Test Suite', () => {
  it('GET /api/patients lists patient records with balance and allergy notes', async () => {
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.patients).toBeDefined();
    expect(res.body.patients.length).toBeGreaterThanOrEqual(2);

    const usman = res.body.patients.find((p: any) => p.name.includes('Usman'));
    expect(usman).toBeDefined();
    expect(usman.allergy_notes).toContain('Penicillin');
    expect(usman.current_balance).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/patients registers a new customer', async () => {
    const uniqueMobile = '0321' + Math.floor(1000000 + Math.random() * 9000000);
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Rashid Mahmood',
        mobile: uniqueMobile,
        age: 55,
        gender: 'MALE',
        allergy_notes: 'Sulfa allergy',
        creditLimit: 15000.0
      });

    expect(res.status).toBe(201);
    expect(res.body.patientId).toBeDefined();
  });

  it('POST /api/patients/:id/payments records customer recovery payment and logs ledger', async () => {
    // Check initial balance of patient 1
    const pRes = await request(app)
      .get('/api/patients/1')
      .set('Authorization', `Bearer ${adminToken}`);
    const initialBalance = pRes.body.patient.current_balance;

    const payRes = await request(app)
      .post('/api/patients/1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 200.0,
        paymentMethod: 'CASH',
        notes: 'Counter debt recovery installment'
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.newBalance).toBe(initialBalance - 200.0);

    // Verify customer ledger entry
    const afterRes = await request(app)
      .get('/api/patients/1')
      .set('Authorization', `Bearer ${adminToken}`);

    const lastLedger = afterRes.body.ledger[0];
    expect(lastLedger.transaction_type).toBe('PAYMENT_RECEIVED');
    expect(lastLedger.credit).toBe(200.0);
  });

  it('Doctors directory and prescription workflow works end-to-end', async () => {
    // 1. Register Doctor
    const docRes = await request(app)
      .post('/api/prescriptions/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Prof. Dr. Tariq Asim',
        specialization: 'Consultant Physician & Cardiologist',
        clinicName: 'Civil Hospital Complex',
        phone: '0300-5556677'
      });

    expect(docRes.status).toBe(201);
    const doctorId = docRes.body.doctorId;

    // 2. Create Prescription
    const rxPayload = {
      patientId: 1,
      doctorId,
      diagnosis: 'Essential Hypertension Grade 1',
      notes: 'Advised low sodium diet and regular BP monitoring',
      items: [
        {
          medicineId: 4, // Norvasc 5mg
          dosage: '1 Tablet',
          frequency: 'OD (Once Daily)',
          duration: '30 days',
          timing: 'Morning after breakfast',
          instructions: 'Do not miss morning dose'
        },
        {
          medicineId: 1, // Panadol 500mg
          dosage: '1-2 Tablets',
          frequency: 'SOS (As Needed)',
          duration: '5 days',
          timing: 'After food',
          instructions: 'For occasional headache'
        }
      ]
    };

    const rxRes = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(rxPayload);

    expect(rxRes.status).toBe(201);
    expect(rxRes.body.prescriptionId).toBeDefined();

    // 3. Query Prescription
    const getRxRes = await request(app)
      .get(`/api/prescriptions/${rxRes.body.prescriptionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRxRes.status).toBe(200);
    expect(getRxRes.body.prescription.doctor_name).toContain('Tariq Asim');
    expect(getRxRes.body.items.length).toBe(2);
    expect(getRxRes.body.items[0].frequency).toContain('OD');
  });
});
