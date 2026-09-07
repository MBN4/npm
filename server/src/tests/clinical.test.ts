import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Drug AI & Clinical Safety Assistant API', () => {
  let pharmacistToken: string;

  beforeAll(async () => {
    seedDatabase();

    const pharmaRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'pharmacist', password: 'pharma123' });
    pharmacistToken = pharmaRes.body.token;
  });

  it('should detect drug-drug interaction between Omeprazole and Amlodipine', async () => {
    // Medicine 3 (Risek - Omeprazole) and Medicine 4 (Norvasc - Amlodipine)
    const res = await request(app)
      .post('/api/clinical/check-interactions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        medicineIds: [3, 4]
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('interactions');
    expect(res.body.interactions.length).toBeGreaterThan(0);
    expect(res.body.interactions[0].severity).toBe('MODERATE');
    expect(res.body.interactions[0].effect).toContain('Amlodipine');
    expect(res.body.interactions[0].management).toBeDefined();
  });

  it('should detect critical patient allergy conflict', async () => {
    // Customer 1 has penicillin allergy, Medicine 2 is Augmentin (Amoxicillin)
    const res = await request(app)
      .post('/api/clinical/check-interactions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        medicineIds: [2],
        customerId: 1
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('allergyAlerts');
    expect(res.body.allergyAlerts.length).toBe(1);
    expect(res.body.allergyAlerts[0].severity).toBe('CRITICAL_ALLERGY_MATCH');
    expect(res.body.allergyAlerts[0].warning).toContain('Penicillin allergy');
    expect(res.body.summary.safetyStatus).toBe('DANGER');
  });

  it('should return clinical monograph, verified dosing, and in-stock substitutes', async () => {
    const res = await request(app)
      .get('/api/clinical/medicine/1/monograph')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('monograph');
    expect(res.body.monograph.brand_name).toBe('Panadol 500mg');
    expect(res.body.monograph.adult_dosage).toBeDefined();
    expect(res.body.monograph.pregnancy_category).toBe('B');
    expect(res.body).toHaveProperty('substitutes');
  });

  it('should provide clinical AI consultation with safety badge disclaimer', async () => {
    const res = await request(app)
      .post('/api/clinical/ai-consult')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        medicineId: 1,
        query: 'What is the maximum daily dosage of paracetamol for an adult?'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('response');
    expect(res.body.response).toContain('dosing');
    expect(res.body.badge).toContain('AI CLINICAL ADVICE');
  });
});
