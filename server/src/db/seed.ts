import bcrypt from 'bcryptjs';
import { db, initDatabase } from './index.js';

export function seedDatabase() {
  initDatabase();

  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)');
  const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (code, description, module) VALUES (?, ?, ?)');
  const insertRolePermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role_id, phone, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const seed = db.transaction(() => {
    // 1. Roles
    insertRole.run(1, 'Admin', 'Full administrative access to all modules and configurations');
    insertRole.run(2, 'Pharmacist', 'Dispensing, patient counseling, drug safety, and stock control');
    insertRole.run(3, 'Cashier', 'POS sales counter, customer billing, and shift cash handling');
    insertRole.run(4, 'Inventory Staff', 'Inward purchases, batch tracking, stock adjustments, and expiry control');

    // 2. Permissions
    const permissions = [
      ['view_sales', 'View sales records and invoices', 'POS'],
      ['create_sales', 'Process sales transactions at counter', 'POS'],
      ['return_sales', 'Authorize and process customer returns', 'POS'],
      ['view_purchases', 'View purchase invoices and inward stock', 'PURCHASES'],
      ['create_purchases', 'Record purchases and receive batches', 'PURCHASES'],
      ['manage_inventory', 'View and manage stock and batches', 'INVENTORY'],
      ['adjust_stock', 'Perform physical count stock adjustments', 'INVENTORY'],
      ['view_accounts', 'View financial P&L, cashbook, ledgers', 'ACCOUNTS'],
      ['manage_medicines', 'Create and edit medicine catalog master', 'CATALOG'],
      ['manage_suppliers', 'Create and manage suppliers and payables', 'SUPPLIERS'],
      ['manage_patients', 'Manage patient CRM and credit balances', 'PATIENTS'],
      ['use_drug_ai', 'Consult drug safety, interactions, and AI', 'CLINICAL'],
      ['manage_staff', 'Manage user accounts and role assignments', 'ADMIN'],
      ['manage_settings', 'Modify pharmacy system configuration', 'ADMIN'],
      ['export_data', 'Export financial and stock reports', 'REPORTS'],
      ['backup_restore', 'Perform database backups and restore', 'SYSTEM']
    ];

    for (const [code, desc, mod] of permissions) {
      insertPermission.run(code, desc, mod);
    }

    // Role-Permission mapping
    const allPerms = db.prepare('SELECT id, code FROM permissions').all() as { id: number; code: string }[];
    const permMap = new Map(allPerms.map(p => [p.code, p.id]));

    // Admin has ALL permissions
    for (const p of allPerms) {
      insertRolePermission.run(1, p.id);
    }

    // Pharmacist permissions
    const pharmaCodes = ['view_sales', 'create_sales', 'return_sales', 'view_purchases', 'manage_inventory', 'manage_medicines', 'manage_patients', 'use_drug_ai'];
    for (const code of pharmaCodes) {
      const pId = permMap.get(code);
      if (pId) insertRolePermission.run(2, pId);
    }

    // Cashier permissions
    const cashierCodes = ['view_sales', 'create_sales', 'manage_patients'];
    for (const code of cashierCodes) {
      const pId = permMap.get(code);
      if (pId) insertRolePermission.run(3, pId);
    }

    // Inventory permissions
    const invCodes = ['view_purchases', 'create_purchases', 'manage_inventory', 'adjust_stock', 'manage_medicines', 'manage_suppliers'];
    for (const code of invCodes) {
      const pId = permMap.get(code);
      if (pId) insertRolePermission.run(4, pId);
    }

    // 3. Default Users
    const saltRounds = 10;
    const adminPass = bcrypt.hashSync('admin123', saltRounds);
    const pharmaPass = bcrypt.hashSync('pharma123', saltRounds);
    const cashPass = bcrypt.hashSync('cash123', saltRounds);
    const invPass = bcrypt.hashSync('inv123', saltRounds);

    insertUser.run(1, 'admin', 'bn73147@gmail.com', adminPass, 'Dr. Naveed (Chief Pharmacist/Admin)', 1, '0300-1112233');
    insertUser.run(2, 'pharmacist', 'pharma@nmp.local', pharmaPass, 'Farhan Ali (Pharmacist)', 2, '0301-2223344');
    insertUser.run(3, 'cashier', 'cashier@nmp.local', cashPass, 'Zainab Bibi (Billing Cashier)', 3, '0302-3334455');
    insertUser.run(4, 'inventory', 'inventory@nmp.local', invPass, 'Tariq Mehmood (Store Incharge)', 4, '0303-4445566');

    // 4. Default Settings
    const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)');
    insertSetting.run('pharmacy_name', 'Naveed Medical Pharmacy (NMP)', 'Store legal brand name');
    insertSetting.run('pharmacy_address', 'Main Bazar, Hospital Road, Gujranwala', 'Store physical address');
    insertSetting.run('pharmacy_phone', '+92 55 1234567 / 0300-1112233', 'Contact phone numbers');
    insertSetting.run('currency_symbol', 'Rs.', 'Default currency notation');
    insertSetting.run('tax_rate_percent', '0', 'Default sales tax percentage (if applicable)');
    insertSetting.run('receipt_footer', 'Thank you for choosing NMP. Get well soon! Keep medicines below 30°C.', 'Thermal receipt footer');
    insertSetting.run('near_expiry_threshold_days', '90', 'Default near expiry alert window in days');
    insertSetting.run('low_stock_threshold_default', '15', 'Default minimum stock count before alert');

    // 5. Sample Categories, Manufacturers, Generics & Suppliers
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
    insertCategory.run('Antibiotics', 'Broad & narrow spectrum antibacterial agents');
    insertCategory.run('Analgesics & Pain', 'NSAIDs, antipyretics and pain relievers');
    insertCategory.run('Cardiovascular', 'Antihypertensives, statins and cardiac drugs');
    insertCategory.run('Gastrointestinal', 'Antacids, PPIs, antiemetics');
    insertCategory.run('Respiratory', 'Bronchodilators, antihistamines, cough syrups');

    const insertMfg = db.prepare('INSERT OR IGNORE INTO manufacturers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)');
    insertMfg.run('GSK Pakistan', 'Tariq Javed', '021-3456789', 'orders@gsk.pk', 'Karachi, Pakistan');
    insertMfg.run('Getz Pharma', 'Imran Khan', '021-3245678', 'sales@getz.pk', 'Korangi, Karachi');
    insertMfg.run('Abbott Laboratories', 'Shahid Raza', '021-3987654', 'supply@abbott.pk', 'Landhi, Karachi');
    insertMfg.run('Searle Company', 'Adnan Malik', '021-3554433', 'info@searle.pk', 'SITE, Karachi');

    const insertGeneric = db.prepare('INSERT OR IGNORE INTO generics (name, therapeutic_class, description) VALUES (?, ?, ?)');
    insertGeneric.run('Paracetamol', 'Analgesic / Antipyretic', 'Standard first-line fever and mild to moderate pain relief');
    insertGeneric.run('Amoxicillin + Clavulanic Acid', 'Broad-spectrum Penicillin', 'Antibacterial for respiratory and soft tissue infections');
    insertGeneric.run('Omeprazole', 'Proton Pump Inhibitor', 'Acid suppression, gastric ulcers, GERD');
    insertGeneric.run('Amlodipine', 'Calcium Channel Blocker', 'Hypertension and chronic stable angina');
    insertGeneric.run('Metformin HCl', 'Biguanide Antidiabetic', 'Type 2 Diabetes Mellitus management');

    const insertSupplier = db.prepare(`
      INSERT OR IGNORE INTO suppliers (name, contact_person, phone, email, address, opening_balance, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertSupplier.run('Ali Brothers Pharma Distributors', 'Haji Munir', '0321-7788990', 'alibrothers@distrib.pk', 'Circular Road, Lahore', 0, 15400.0);
    insertSupplier.run('Shaheen Medical Agency', 'Bilal Ahmed', '0333-6655443', 'shaheen@medagency.pk', 'Katchery Road, Gujranwala', 0, 0.0);

    // 6. Sample Medicines & Batches (with realistic non-expired and near-expiry dates)
    const insertMedicine = db.prepare(`
      INSERT OR IGNORE INTO medicines (
        id, brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form, pack_size,
        barcode, custom_barcode, rack_location, min_stock_level, reorder_level, is_prescription_required, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMedicine.run(1, 'Panadol 500mg', 1, 2, 1, '500mg', 'Tablet', 200, '896400012345', 'MED-001', 'Rack A-1', 50, 100, 0, 'Fast mover fever tablet');
    insertMedicine.run(2, 'Augmentin 625mg', 2, 1, 1, '625mg', 'Tablet', 14, '896400054321', 'MED-002', 'Rack B-3', 20, 30, 1, 'Requires valid doctor prescription');
    insertMedicine.run(3, 'Risek 20mg', 3, 4, 2, '20mg', 'Capsule', 14, '896400098765', 'MED-003', 'Rack C-2', 25, 40, 0, 'Omeprazole enteric coated');
    insertMedicine.run(4, 'Norvasc 5mg', 4, 3, 3, '5mg', 'Tablet', 30, '896400011223', 'MED-004', 'Rack D-1', 15, 25, 1, 'Blood pressure maintenance');
    insertMedicine.run(5, 'Glucophage 500mg', 5, 3, 4, '500mg', 'Tablet', 50, '896400044556', 'MED-005', 'Rack D-2', 30, 50, 1, 'Metformin sugar control');

    // Batches demonstrating FEFO and Expiry handling
    const insertBatch = db.prepare(`
      INSERT INTO batches (
        id, medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price,
        quantity, bonus_quantity, supplier_id, rack_location, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        quantity = excluded.quantity,
        status = excluded.status,
        purchase_price = excluded.purchase_price,
        sale_price = excluded.sale_price,
        expiry_date = excluded.expiry_date
    `);

    // Panadol: Batch 1 expires in 6 months (valid, FEFO first), Batch 2 expires in 18 months
    insertBatch.run(1, 1, 'PAN-2026-A', '2025-01-01', '2027-03-31', 2.80, 3.50, 450, 50, 1, 'Rack A-1', 'ACTIVE');
    insertBatch.run(2, 1, 'PAN-2026-B', '2025-06-01', '2027-12-31', 2.90, 3.50, 600, 0, 1, 'Rack A-1', 'ACTIVE');

    // Augmentin: Batch 3 expires in 45 days (near expiry warning), Batch 4 expires in 2 years
    insertBatch.run(3, 2, 'AUG-26-01', '2024-10-15', '2026-10-25', 42.00, 52.00, 40, 2, 1, 'Rack B-3', 'ACTIVE');
    insertBatch.run(4, 2, 'AUG-26-02', '2025-02-01', '2028-01-31', 44.00, 55.00, 80, 0, 2, 'Rack B-3', 'ACTIVE');

    // Risek: Batch 5 expired last month (MUST BE BLOCKED BY FEFO / EXPIRY FILTER)
    insertBatch.run(5, 3, 'RSK-EXP-99', '2023-01-01', '2026-08-01', 22.00, 28.00, 15, 0, 2, 'Rack C-2', 'EXPIRED');
    insertBatch.run(6, 3, 'RSK-VALID-01', '2025-03-01', '2027-08-31', 23.50, 30.00, 120, 10, 2, 'Rack C-2', 'ACTIVE');

    // 7. Sample Customers
    const insertCust = db.prepare(`
      INSERT INTO customers (id, name, mobile, age, gender, allergy_notes, credit_limit, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        current_balance = excluded.current_balance,
        credit_limit = excluded.credit_limit
    `);
    insertCust.run(1, 'Muhammad Usman', '0312-9988776', 42, 'MALE', 'Penicillin allergy (caution with Augmentin)', 5000.0, 1200.0);
    insertCust.run(2, 'Amina Bibi', '0345-1122334', 68, 'FEMALE', 'None documented', 10000.0, 0.0);

    // 8. Drug Clinical Info & Monographs
    const insertClinical = db.prepare(`
      INSERT OR REPLACE INTO drug_clinical_info (
        generic_id, pregnancy_category, lactation_safety, adult_dosage, pediatric_dosage,
        food_instructions, hepatic_renal_precautions, common_side_effects
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertClinical.run(1, 'B', 'Safe', '500mg-1000mg q4-6h (max 4000mg/day)', '10-15mg/kg q4-6h', 'Take with or without food', 'Contraindicated in severe hepatic impairment', 'Nausea, rare rash, hepatotoxicity with overdose');
    insertClinical.run(2, 'B', 'Safe', '625mg q8h or 1000mg q12h', '30-40mg/kg/day in divided doses', 'Take at the start of a meal to minimize GI distress', 'Adjust dose if CrCl < 30 mL/min; contraindicated in penicillin allergy', 'Diarrhea, nausea, candidiasis, skin rash');
    insertClinical.run(3, 'C', 'Caution', '20mg-40mg once daily', '0.7-1.4mg/kg/day', 'Take 30-60 minutes before breakfast on empty stomach', 'Dose adjustment in severe hepatic impairment', 'Headache, abdominal pain, constipation, hypomagnesemia with prolonged use');
    insertClinical.run(4, 'C', 'Caution', '5mg-10mg once daily', 'Safety not established < 6 years', 'Take with or without food; avoid large amounts of grapefruit juice', 'Use lower initial dose (2.5mg) in severe hepatic disease', 'Peripheral edema, flushing, palpitations, dizziness');
    insertClinical.run(5, 'B', 'Caution', '500mg-1000mg BID with meals (max 2550mg/day)', 'Not indicated in children < 10 years', 'Take with or after meals to reduce GI side effects', 'Contraindicated if eGFR < 30 mL/min; risk of lactic acidosis', 'Gastrointestinal upset, diarrhea, metallic taste, vitamin B12 deficiency');

    // 9. Drug-Drug Interactions
    const insertDDI = db.prepare(`
      INSERT OR IGNORE INTO drug_interactions (
        generic_a_id, generic_b_id, severity, effect, management, evidence_level
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Omeprazole (3) + Clopidogrel (hypothetical generic 6 or direct pair)
    insertDDI.run(3, 4, 'MODERATE', 'Omeprazole may reduce metabolism of Amlodipine via CYP3A4 pathway resulting in enhanced hypotensive effect.', 'Monitor blood pressure regularly upon initiation or dose adjustment.', 'ESTABLISHED');
    insertDDI.run(4, 5, 'MINOR', 'Calcium channel blockers may occasionally impair glucose tolerance.', 'Monitor blood glucose levels in diabetic patients initiating therapy.', 'THEORETICAL');
  });

  seed();
  console.log('Database seeded successfully with roles, users, categories, medicines, batches, and system settings.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase();
}
