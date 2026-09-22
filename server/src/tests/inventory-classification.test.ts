import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { seedDatabase } from '../db/seed.js';
import { initDatabase } from '../db/index.js';

describe('Inventory classification editing', () => {
  let token: string;

  beforeAll(async () => {
    seedDatabase();
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.token;
  });

  it('updates a medicine category and therapeutic class through its batch edit', async () => {
    const list = await request(app).get('/api/inventory/batches').set('Authorization', `Bearer ${token}`);
    const original = list.body.batches.find((batch: any) => batch.category_name);
    expect(original).toBeDefined();
    const newCategory = original.category_name === 'Capsules' ? 'Tablets' : 'Capsules';
    const newDosageForm = newCategory === 'Capsules' ? 'Softgel' : 'Regular';

    try {
      const invalid = await request(app).put(`/api/inventory/batches/${original.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryName: 'Nonexistent Category' });
      expect(invalid.status).toBe(400);

      const update = await request(app).put(`/api/inventory/batches/${original.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryName: newCategory, dosageForm: newDosageForm, therapeuticClass: 'Analgesic / Test' });
      expect(update.status).toBe(200);

      const changed = await request(app).get('/api/inventory/batches').set('Authorization', `Bearer ${token}`);
      const productBatches = changed.body.batches.filter((batch: any) => batch.medicine_id === original.medicine_id);
      expect(productBatches.length).toBeGreaterThan(0);
      for (const batch of productBatches) {
        expect(batch.category_name).toBe(newCategory);
        expect(batch.dosage_form).toBe(newDosageForm);
        expect(batch.therapeutic_class).toBe('Analgesic / Test');
      }

      initDatabase();
      const afterRestartImport = await request(app).get('/api/inventory/batches').set('Authorization', `Bearer ${token}`);
      const persisted = afterRestartImport.body.batches.find((batch: any) => batch.id === original.id);
      expect(persisted.category_name).toBe(newCategory);
      expect(persisted.therapeutic_class).toBe('Analgesic / Test');
    } finally {
      await request(app).put(`/api/inventory/batches/${original.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryName: original.category_name, dosageForm: original.dosage_form, therapeuticClass: original.therapeutic_class || '' });
    }
  });

  it('corrects product details for every batch and rejects a duplicate barcode', async () => {
    const authorization = `Bearer ${token}`;
    const list = await request(app).get('/api/inventory/batches').set('Authorization', authorization);
    const original = list.body.batches.find((batch: any) => batch.brand_name && batch.barcode);
    expect(original).toBeDefined();
    const other = list.body.batches.find((batch: any) => batch.medicine_id !== original.medicine_id && batch.barcode);
    expect(other).toBeDefined();

    try {
      const invalid = await request(app).put(`/api/inventory/batches/${original.id}`)
        .set('Authorization', authorization).send({ brandName: 'Wrong Name', barcode: other.barcode });
      expect(invalid.status).toBe(400);

      const update = await request(app).put(`/api/inventory/batches/${original.id}`)
        .set('Authorization', authorization).send({ brandName: 'Corrected Medicine Name', strength: '500mg',
          genericName: 'Editable Test Generic', manufacturerName: 'Editable Test Manufacturer',
          categoryName: 'Custom Test Category', customCategory: true, dosageForm: 'Custom Test Form',
          stockUnit: 'Tablet', packSize: 4, tabletsPerPack: 12, minStockLevel: 8, reorderLevel: 15,
          notes: 'Checked product', mfgDate: '2026-01-01' });
      expect(update.status).toBe(200);
      const changed = await request(app).get('/api/inventory/batches').set('Authorization', authorization);
      const productBatches = changed.body.batches.filter((batch: any) => batch.medicine_id === original.medicine_id);
      for (const batch of productBatches) {
        expect(batch.brand_name).toBe('Corrected Medicine Name');
        expect(batch.generic_name).toBe('Editable Test Generic');
        expect(batch.manufacturer_name).toBe('Editable Test Manufacturer');
        expect(batch.category_name).toBe('Custom Test Category');
        expect(batch.dosage_form).toBe('Custom Test Form');
        expect(batch.pack_size).toBe(4);
        expect(batch.tablets_per_pack).toBe(12);
      }
      expect(productBatches.find((batch: any) => batch.id === original.id)?.mfg_date).toBe('2026-01-01');
    } finally {
      await request(app).put(`/api/inventory/batches/${original.id}`)
        .set('Authorization', authorization).send({ brandName: original.brand_name, strength: original.strength || '',
          genericName: original.generic_name || '', manufacturerName: original.manufacturer_name || '',
          stockUnit: original.stock_unit || '', packSize: original.pack_size, tabletsPerPack: original.tablets_per_pack,
          categoryName: original.category_name, dosageForm: original.dosage_form,
          minStockLevel: original.min_stock_level, reorderLevel: original.reorder_level, notes: original.notes || '',
          mfgDate: original.mfg_date || null });
    }
  });
});
