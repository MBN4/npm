import { db } from '../db/index.js';

db.prepare(`
  INSERT OR REPLACE INTO settings (key, value, description)
  VALUES ('pharmacy_address', '31 32 Chowk Chohan Road Outfall, Near Tariq Pan Shop, Islampura, Lahore, 54000', 'Store physical address')
`).run();

db.prepare(`
  INSERT OR REPLACE INTO settings (key, value, description)
  VALUES ('pharmacy_name', 'NAVEED MEDICAL PHARMACY (NMP)', 'Store legal brand name')
`).run();

db.prepare(`
  INSERT OR REPLACE INTO settings (key, value, description)
  VALUES ('pharmacy_phone', '03454142863', 'Contact phone numbers')
`).run();

console.log('Pharmacy settings updated successfully in SQLite database');
