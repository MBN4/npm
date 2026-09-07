import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';

describe('Hardware Integrations, ESC/POS, Barcodes & Bulk Import API', () => {
  let adminToken: string;

  beforeAll(async () => {
    seedDatabase();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  it('should fetch and update thermal printer configuration', async () => {
    // 1. Fetch config
    const getRes = await request(app)
      .get('/api/integrations/thermal-config')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('paperWidth');
    expect(getRes.body).toHaveProperty('receiptHeader');

    // 2. Update config
    const updateRes = await request(app)
      .put('/api/integrations/thermal-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paperWidth: '80mm',
        autoCut: true,
        cashDrawerKick: true,
        receiptHeader: 'NAVEED MEDICAL PHARMACY (MAIN)'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.message).toContain('updated successfully');
  });

  it('should generate barcode labels payload for shelf stickers', async () => {
    const res = await request(app)
      .get('/api/integrations/barcode-labels')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('labels');
    expect(Array.isArray(res.body.labels)).toBe(true);
    if (res.body.labels.length > 0) {
      const label = res.body.labels[0];
      expect(label).toHaveProperty('brandName');
      expect(label).toHaveProperty('barcode');
      expect(label).toHaveProperty('salePrice');
      expect(label).toHaveProperty('expiryDate');
    }
  });

  it('should process bulk CSV import of medicines', async () => {
    const sampleCsv =
      'brand_name,generic_name,strength,dosage_form,barcode,rack_location,pack_size\n' +
      'Disprin Extra,Aspirin,300mg,Tablet,896400088881,Rack A-4,100\n' +
      'Panadol CF,Paracetamol + Pseudoephedrine,500mg,Tablet,896400088882,Rack A-4,200\n';

    const res = await request(app)
      .post('/api/integrations/bulk-import/medicines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ csvContent: sampleCsv });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('insertedCount', 2);
    expect(res.body).toHaveProperty('errorCount', 0);
  });
});
