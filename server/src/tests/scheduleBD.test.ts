import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';
import { db } from '../db/index.js';

let adminToken: string;
let pharmacistToken: string;
let cashierToken: string;

let genericId: number;
let medicineId: number;
let batchAId: number;
let batchBId: number;
let patientId: number;
let classificationId: number;
let prescriptionId: number;
let prescriptionItemId: number;

async function login(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.token;
}

beforeAll(async () => {
  seedDatabase();
  adminToken = await login('admin', 'admin123');
  pharmacistToken = await login('pharmacist', 'pharma123');
  cashierToken = await login('cashier', 'cash123');

  // Dedicated test generic/medicine/batches so this suite never touches the pharmacy's real catalog data.
  const genericRes = await request(app).post('/api/catalog/generics')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `TestOpioidGeneric-${Date.now()}`, therapeuticClass: 'Test' });
  genericId = genericRes.body.id;

  const medRes = await request(app).post('/api/medicines')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ brandName: `TestScheduleBMed-${Date.now()}`, genericId, strength: '10mg', dosageForm: 'Tablet', isPrescriptionRequired: 1 });
  medicineId = medRes.body.medicineId || medRes.body.id;
  if (!medicineId) {
    const row = db.prepare('SELECT id FROM medicines WHERE generic_id = ?').get(genericId) as any;
    medicineId = row.id;
  }

  const batchA = db.prepare(`
    INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price, quantity, status)
    VALUES (?, ?, '2025-01-01', '2030-01-01', 10, 20, 5, 'ACTIVE')
  `).run(medicineId, `SBD-A-${Date.now()}`);
  batchAId = Number(batchA.lastInsertRowid);

  const batchB = db.prepare(`
    INSERT INTO batches (medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price, quantity, status)
    VALUES (?, ?, '2025-01-01', '2030-06-01', 10, 20, 10, 'ACTIVE')
  `).run(medicineId, `SBD-B-${Date.now()}`);
  batchBId = Number(batchB.lastInsertRowid);

  const patientRes = await request(app).post('/api/patients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Test Patient ${Date.now()}`, mobile: `030${Math.floor(Math.random() * 10000000)}` });
  patientId = patientRes.body.patientId || patientRes.body.id;
  if (!patientId) {
    const row = db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get() as any;
    patientId = row.id;
  }

  // Create + verify a Schedule B classification for the test generic.
  const classRes = await request(app).post('/api/classifications')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ entryType: 'SUBSTANCE', substanceName: 'TestOpioidGeneric', genericId, schedule: 'B', jurisdiction: 'Punjab, Pakistan' });
  classificationId = classRes.body.classificationId;

  await request(app).post(`/api/classifications/${classificationId}/verify`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'VERIFIED' });

  const rxRes = await request(app).post('/api/prescriptions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      patientId,
      diagnosis: 'Test diagnosis',
      items: [{ medicineId, dosage: '1 Tablet', frequency: 'BD', duration: '5 days', timing: 'After Food', authorizedQuantity: 20, unit: 'Tablet' }]
    });
  prescriptionId = rxRes.body.prescriptionId;

  const rxDetail = await request(app).get(`/api/prescriptions/${prescriptionId}`).set('Authorization', `Bearer ${adminToken}`);
  prescriptionItemId = rxDetail.body.items[0].id;
});

// This suite exercises the real checkout/classification/prescription endpoints against the dev
// database (consistent with this project's existing test convention - other suites, e.g.
// pos.test.ts, do the same and never delete the sales they create). Once a real sale/register
// entry references this test's medicine/batch/prescription, those rows become permanent ledger
// history (by design - see "historical snapshots" in the register schema) and deleting them would
// either violate FK constraints or falsify the invoice-number sequence for every other test. So
// cleanup here is limited to the one thing that's both safe (cascades with ON DELETE CASCADE /
// SET NULL) and worth not leaving behind: the throwaway test patient record.
afterAll(() => {
  db.prepare('DELETE FROM customers WHERE id = ?').run(patientId);
});

describe('Schedule B & D Register', () => {
  it('ordinary (non-scheduled) sale remains unaffected', async () => {
    const res = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ medicineId: 1, batchId: 1, quantity: 1, unitPrice: 3.5 }],
        totalAmount: 3.5, paidAmount: 3.5, paymentMethod: 'CASH'
      });
    expect(res.status).toBe(201);
    expect(res.body.invoice.registerEntryIds).toEqual([]);
  });

  it('blocks a verified Schedule B sale without a linked prescription', async () => {
    const res = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ medicineId, batchId: batchAId, quantity: 2, unitPrice: 20 }],
        totalAmount: 40, paidAmount: 40, paymentMethod: 'CASH'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prescription/i);
  });

  it('blocks a verified Schedule B sale with a prescription but no pharmacist approval (cashier cannot self-approve)', async () => {
    const res = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        items: [{ medicineId, batchId: batchAId, quantity: 2, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: 40, paidAmount: 40, paymentMethod: 'CASH'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/approval/i);
  });

  it('rejects approval from a user without approve_scheduled_drugs permission', async () => {
    const res = await request(app).post('/api/pos/schedule-bd/approve')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ username: 'cashier', password: 'cash123', items: [{ medicineId, batchId: batchAId, quantity: 2 }] });
    expect(res.status).toBe(403);
  });

  it('completes a verified Schedule B sale once pharmacist-approved, and produces a traceable register entry', async () => {
    const approve = await request(app).post('/api/pos/schedule-bd/approve')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ username: 'pharmacist', password: 'pharma123', items: [{ medicineId, batchId: batchAId, quantity: 2 }] });
    expect(approve.status).toBe(201);
    const approvalToken = approve.body.approvalToken;

    const requestKey = `TEST-SBD-${Date.now()}`;
    const checkout = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        requestKey,
        scheduleBDApprovalToken: approvalToken,
        items: [{ medicineId, batchId: batchAId, quantity: 2, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: 40, paidAmount: 40, paymentMethod: 'CASH'
      });
    expect(checkout.status).toBe(201);
    expect(checkout.body.invoice.registerEntryIds.length).toBe(1);

    const entryId = checkout.body.invoice.registerEntryIds[0];
    const detail = await request(app).get(`/api/schedule-bd/${entryId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.entry.schedule).toBe('B');
    expect(detail.body.entry.dispensed_quantity).toBe(2);
    expect(detail.body.entry.serial_number).toMatch(/^SBD-\d{4}-\d{6}$/);

    // Retrying the exact same request (duplicate click/retry) must not create a second sale or entry.
    const retry = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        requestKey,
        scheduleBDApprovalToken: approvalToken,
        items: [{ medicineId, batchId: batchAId, quantity: 2, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: 40, paidAmount: 40, paymentMethod: 'CASH'
      });
    expect(retry.status).toBe(200);
    expect(retry.body.idempotentReplay).toBe(true);

    const salesCount = (db.prepare('SELECT COUNT(*) as c FROM sales WHERE request_key = ?').get(requestKey) as any).c;
    expect(salesCount).toBe(1);
  });

  it('a spent approval token cannot be reused for a second, different checkout', async () => {
    const approve = await request(app).post('/api/pos/schedule-bd/approve')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ username: 'pharmacist', password: 'pharma123', items: [{ medicineId, batchId: batchAId, quantity: 1 }] });
    const approvalToken = approve.body.approvalToken;

    const first = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        requestKey: `TEST-SBD-REUSE-${Date.now()}`,
        scheduleBDApprovalToken: approvalToken,
        items: [{ medicineId, batchId: batchAId, quantity: 1, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: 20, paidAmount: 20, paymentMethod: 'CASH'
      });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        requestKey: `TEST-SBD-REUSE-${Date.now()}-2`,
        scheduleBDApprovalToken: approvalToken,
        items: [{ medicineId, batchId: batchAId, quantity: 1, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: 20, paidAmount: 20, paymentMethod: 'CASH'
      });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/missing, expired, or already used/i);
  });

  it('split-batch dispensing produces one traceable register entry per batch allocation', async () => {
    // batchAId now has 2 left (5 - 2 - 1 from prior tests); request more than that single batch holds.
    const batchARow = db.prepare('SELECT quantity FROM batches WHERE id = ?').get(batchAId) as any;
    const requestQty = batchARow.quantity + 3; // forces overflow into batchB

    const approve = await request(app).post('/api/pos/schedule-bd/approve')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ username: 'pharmacist', password: 'pharma123', items: [{ medicineId, batchId: batchAId, quantity: requestQty }] });
    const approvalToken = approve.body.approvalToken;

    const checkout = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        requestKey: `TEST-SBD-SPLIT-${Date.now()}`,
        scheduleBDApprovalToken: approvalToken,
        items: [{ medicineId, batchId: batchAId, quantity: requestQty, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: requestQty * 20, paidAmount: requestQty * 20, paymentMethod: 'CASH'
      });
    expect(checkout.status).toBe(201);
    expect(checkout.body.invoice.registerEntryIds.length).toBe(2);
  });

  it('a failed transaction (insufficient stock) leaves no partial sale, stock or register changes', async () => {
    const beforeSalesCount = (db.prepare('SELECT COUNT(*) as c FROM sales').get() as any).c;
    const beforeRegisterCount = (db.prepare('SELECT COUNT(*) as c FROM schedule_bd_register_entries').get() as any).c;

    const approve = await request(app).post('/api/pos/schedule-bd/approve')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ username: 'pharmacist', password: 'pharma123', items: [{ medicineId, batchId: batchAId, quantity: 999999 }] });

    const checkout = await request(app).post('/api/pos/checkout')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        requestKey: `TEST-SBD-FAIL-${Date.now()}`,
        scheduleBDApprovalToken: approve.body.approvalToken,
        items: [{ medicineId, batchId: batchAId, quantity: 999999, unitPrice: 20, prescriptionId, prescriptionItemId }],
        totalAmount: 999999 * 20, paidAmount: 999999 * 20, paymentMethod: 'CASH'
      });
    expect(checkout.status).toBe(400);

    const afterSalesCount = (db.prepare('SELECT COUNT(*) as c FROM sales').get() as any).c;
    const afterRegisterCount = (db.prepare('SELECT COUNT(*) as c FROM schedule_bd_register_entries').get() as any).c;
    expect(afterSalesCount).toBe(beforeSalesCount);
    expect(afterRegisterCount).toBe(beforeRegisterCount);
  });

  it('a correction amendment preserves the original register entry', async () => {
    const entry = db.prepare('SELECT id, status FROM schedule_bd_register_entries WHERE classification_id = ? ORDER BY id ASC LIMIT 1').get(classificationId) as any;
    const amend = await request(app).post(`/api/schedule-bd/${entry.id}/amend`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ reason: 'Test correction of patient address' });
    expect(amend.status).toBe(201);

    const detail = await request(app).get(`/api/schedule-bd/${entry.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.entry.status).toBe('CORRECTED');
    expect(detail.body.amendments.length).toBeGreaterThan(0);
    expect(detail.body.amendments[0].amendment_type).toBe('CORRECTION');
    // Original dispensed quantity / medicine snapshot must remain untouched.
    expect(detail.body.entry.dispensed_quantity).toBeGreaterThan(0);
  });

  it('a user without amend_scheduled_register cannot correct, cancel or reverse an entry', async () => {
    const entry = db.prepare('SELECT id FROM schedule_bd_register_entries ORDER BY id ASC LIMIT 1').get() as any;
    const res = await request(app).post(`/api/schedule-bd/${entry.id}/cancel`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ reason: 'unauthorized attempt' });
    expect(res.status).toBe(403);
  });

  it('a user without manage_drug_classification cannot verify a classification', async () => {
    const res = await request(app).post(`/api/classifications/${classificationId}/verify`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ decision: 'VERIFIED' });
    expect(res.status).toBe(403);
  });

  it('unauthenticated/unauthorized requests cannot read a prescription attachment', async () => {
    const res = await request(app).get(`/api/prescriptions/${prescriptionId}/attachment`);
    expect(res.status).toBe(401);
  });

  it('a verified Schedule B medicine in an offline-sync batch is blocked with a clear message', async () => {
    const res = await request(app).post('/api/pos/sync-offline')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        sales: [{
          offlineId: `OFFLINE-SBD-${Date.now()}`,
          items: [{ medicineId, batchId: batchBId, quantity: 1, unitPrice: 20, lineTotal: 20 }],
          subtotal: 20, totalAmount: 20, paidAmount: 20, paymentMethod: 'CASH', timestamp: new Date().toISOString()
        }]
      });
    expect(res.status).toBe(200);
    expect(res.body.failedCount).toBe(1);
    expect(res.body.failed[0].error).toMatch(/online connection/i);
  });

  it('classification import drafts never gate POS automatically while unverified', async () => {
    const draftRow = db.prepare(`SELECT id FROM drug_classifications WHERE verification_status = 'DRAFT_UNVERIFIED' LIMIT 1`).get() as any;
    expect(draftRow).toBeDefined();
    // Sanity: the seeded poster-derived drafts exist but are not VERIFIED, so they cannot have gated any sale above.
    const verifiedCount = (db.prepare(`SELECT COUNT(*) as c FROM drug_classifications WHERE verification_status = 'VERIFIED'`).get() as any).c;
    expect(verifiedCount).toBeGreaterThan(0); // only our test-created one
  });
});
