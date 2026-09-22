import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { upsertSyncRows } from '../services/syncRowHelpers.js';

describe('catalog sync across devices', () => {
  it('matches generics by name when devices use different IDs and preserves newer local edits', () => {
    const db = new Database(':memory:');
    try {
      db.exec(`
        CREATE TABLE generics (id INTEGER PRIMARY KEY, name TEXT UNIQUE, therapeutic_class TEXT);
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
        CREATE TABLE manufacturers (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
        CREATE TABLE medicines (id INTEGER PRIMARY KEY, brand_name TEXT, strength TEXT,
          generic_id INTEGER, category_id INTEGER, manufacturer_id INTEGER,
          therapeutic_class TEXT, updated_at TEXT);
        INSERT INTO generics VALUES (17, 'Ibuprofen', 'NSAID');
        INSERT INTO categories VALUES (9, 'Tablets');
        INSERT INTO manufacturers VALUES (8, 'Abbott Laboratories');
      `);

      expect(upsertSyncRows(db, 'generics', [{ id: 210001, name: 'Ibuprofen' }])).toBe(0);
      const medicine = { id: 200003, brand_name: 'Brufen 200mg', strength: '200 mg',
        generic_id: 210001, category_id: 1822, manufacturer_id: 3,
        sync_generic_name: 'Ibuprofen', sync_category_name: 'Tablets',
        sync_manufacturer_name: 'Abbott Laboratories', therapeutic_class: 'NSAID / Analgesic',
        updated_at: '2026-09-22 12:00:00' };

      expect(upsertSyncRows(db, 'medicines', [medicine])).toBe(1);
      const saved = db.prepare('SELECT * FROM medicines WHERE id = 200003').get() as any;
      expect(saved.generic_id).toBe(17);
      expect(saved.category_id).toBe(9);
      expect(saved.manufacturer_id).toBe(8);

      db.prepare('UPDATE medicines SET therapeutic_class = ?, updated_at = ? WHERE id = ?')
        .run('Local verified class', '2026-09-23 12:00:00', 200003);
      expect(upsertSyncRows(db, 'medicines', [medicine])).toBe(0);
      expect((db.prepare('SELECT therapeutic_class FROM medicines WHERE id = 200003').get() as any).therapeutic_class)
        .toBe('Local verified class');
    } finally {
      db.close();
    }
  });
});
