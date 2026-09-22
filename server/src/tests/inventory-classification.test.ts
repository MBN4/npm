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
});
