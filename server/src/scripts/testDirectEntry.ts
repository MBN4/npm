import { db, initDatabase } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';

try {
  initDatabase();
  seedDatabase();

  // Test the exact SQL logic from inventoryRoutes.ts /direct-entry endpoint:
  const brandName = 'Toot Siah';
  const genericName = 'Herbal Syrup';
  const manufacturerName = 'Qarshi';
  const categoryName = 'Cough (Herbal)';
  const strength = '120 mL';
  const dosageForm = 'Syrup / Suspension';
  const rackLocation = 'Rack A-01';
  const barcode = null;
  const batchNumber = 'BN-2026-1234';
  const expiryDate = '2027-12-31';

  let finalCatId: number | null = null;
  if (categoryName && categoryName.trim()) {
    const existingCat = db.prepare('SELECT id FROM categories WHERE name LIKE ?').get(categoryName.trim()) as any;
    if (existingCat) {
      finalCatId = existingCat.id;
    } else {
      const newCat = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(categoryName.trim(), 'Auto-created category');
      finalCatId = Number(newCat.lastInsertRowid);
    }
  }

  let finalManId: number | null = null;
  if (manufacturerName && manufacturerName.trim()) {
    const existingMan = db.prepare('SELECT id FROM manufacturers WHERE name LIKE ?').get(manufacturerName.trim()) as any;
    if (existingMan) {
      finalManId = existingMan.id;
    } else {
      const newMan = db.prepare('INSERT INTO manufacturers (name) VALUES (?)').run(manufacturerName.trim());
      finalManId = Number(newMan.lastInsertRowid);
    }
  }

  let finalGenId: number | null = null;
  if (genericName && genericName.trim()) {
    const existingGen = db.prepare('SELECT id FROM generics WHERE name LIKE ?').get(genericName.trim()) as any;
    if (existingGen) {
      finalGenId = existingGen.id;
    } else {
      const newGen = db.prepare('INSERT INTO generics (name) VALUES (?)').run(genericName.trim());
      finalGenId = Number(newGen.lastInsertRowid);
    }
  }

  console.log('CatId:', finalCatId, 'ManId:', finalManId, 'GenId:', finalGenId);
} catch (err: any) {
  console.error('ERROR OCCURRED:', err);
}
