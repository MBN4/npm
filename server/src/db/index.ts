import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertSyncRows } from '../services/syncRowHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'nmp.sqlite');
export const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  // Auto-migrate drug_clinical_info table columns if existing SQLite DB file is from an older schema version
  const tableInfo = db.pragma('table_info(drug_clinical_info)') as Array<{ name: string }>;
  if (tableInfo && tableInfo.length > 0) {
    const existingCols = new Set(tableInfo.map(c => c.name));
    
    const requiredCols: Array<[string, string]> = [
      ['atc_code', 'TEXT'],
      ['rx_status', "TEXT DEFAULT 'Rx'"],
      ['pharmacological_class', 'TEXT'],
      ['countries_available', "TEXT DEFAULT 'Pakistan, USA, UK, EU, Global'"],
      ['pregnancy_category', 'TEXT'],
      ['trimester_considerations', 'TEXT'],
      ['lactation_safety', 'TEXT'],
      ['adult_dosage', 'TEXT'],
      ['pediatric_dosage', 'TEXT'],
      ['neonatal_dosage', 'TEXT'],
      ['geriatric_dosage', 'TEXT'],
      ['weight_bsa_dosing', 'TEXT'],
      ['hepatic_renal_precautions', 'TEXT'],
      ['dialysis_considerations', 'TEXT'],
      ['indications_approved', 'TEXT'],
      ['indications_common', 'TEXT'],
      ['indications_offlabel', 'TEXT'],
      ['pharmacology_moa', 'TEXT'],
      ['pharmacokinetics_summary', 'TEXT'],
      ['absorption_bioavailability', 'TEXT'],
      ['distribution_protein_binding', 'TEXT'],
      ['metabolism_cyp', 'TEXT'],
      ['half_life_elimination', 'TEXT'],
      ['onset_peak_duration', 'TEXT'],
      ['contraindications_absolute', 'TEXT'],
      ['contraindications_relative', 'TEXT'],
      ['boxed_warnings', 'TEXT'],
      ['serious_warnings', 'TEXT'],
      ['cautions', 'TEXT'],
      ['monitoring_required', 'TEXT'],
      ['side_effects_common', 'TEXT'],
      ['side_effects_serious', 'TEXT'],
      ['side_effects_rare_life_threatening', 'TEXT'],
      ['food_interactions', 'TEXT'],
      ['disease_interactions', 'TEXT'],
      ['special_populations', 'TEXT'],
      ['pill_imprint', 'TEXT'],
      ['pill_shape', 'TEXT'],
      ['pill_color', 'TEXT'],
      ['monitoring_parameters', 'TEXT'],
      ['administration_instructions', 'TEXT'],
      ['storage_stability', 'TEXT'],
      ['patient_counseling_en', 'TEXT'],
      ['patient_counseling_professional', 'TEXT'],
      ['clinical_source', "TEXT DEFAULT 'USP-NF / DailyMed / BNF 86 Reference'"],
      ['source_version', "TEXT DEFAULT 'v2026.1'"],
      ['last_reviewed', "TEXT DEFAULT '2026-09-01'"]
    ];

    for (const [colName, colType] of requiredCols) {
      if (!existingCols.has(colName)) {
        try {
          db.exec(`ALTER TABLE drug_clinical_info ADD COLUMN ${colName} ${colType};`);
        } catch (e) {
          // ignore
        }
      }
    }
  }

  // Auto-migrate medicines table columns (Main Category / Subcategory / Therapeutic Class / packaging-type rework)
  const medicinesInfo = db.pragma('table_info(medicines)') as Array<{ name: string }>;
  if (medicinesInfo && medicinesInfo.length > 0) {
    const existingCols = new Set(medicinesInfo.map(c => c.name));
    const requiredCols: Array<[string, string]> = [
      ['tablets_per_pack', 'INTEGER DEFAULT 10'],
      ['therapeutic_class', 'TEXT'],
      ['stock_unit', 'TEXT'],
      ['packaging_type', "TEXT NOT NULL DEFAULT 'MULTI_TIER'"]
    ];
    for (const [colName, colType] of requiredCols) {
      if (!existingCols.has(colName)) {
        try {
          db.exec(`ALTER TABLE medicines ADD COLUMN ${colName} ${colType};`);
        } catch (e) {
          // ignore
        }
      }
    }
  }

  // Auto-migrate categories table columns
  const categoriesInfo = db.pragma('table_info(categories)') as Array<{ name: string }>;
  if (categoriesInfo && categoriesInfo.length > 0) {
    const existingCols = new Set(categoriesInfo.map(c => c.name));
    if (!existingCols.has('sort_order')) {
      try {
        db.exec(`ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0;`);
      } catch (e) {
        // ignore
      }
    }
  }

  // Backfill sort_order on the 40-item Main Category master list (covers DBs where these
  // category rows were already created, by hand or by an earlier seed run, before sort_order existed)
  try {
    const MAIN_CATEGORY_ORDER = [
      'Tablets', 'Capsules', 'Syrups & Oral Liquids', 'Sachets & Powders', 'Injections',
      'IV Fluids', 'Eye Products', 'Ear Products', 'Nasal Products', 'Oral / Throat Products',
      'Topical Medicines', 'Sprays', 'Inhalation & Respiratory', 'Suppositories & Rectal', 'Vaginal / Gynaecology',
      'Milk & Infant Formula', 'Nutrition & Supplements', 'Baby Care', 'Diapers / Pampers', 'Cosmetics & Beauty',
      'Skin Care / Dermocosmetics', 'Hair Care', 'Personal Hygiene', 'Feminine Hygiene', 'Dental / Oral Care',
      'Contraceptive / Family Planning', 'Syringes & Needles', 'IV Administration', 'IV Cannulas', 'Catheters & Tubes',
      'Wound Care / Dressing', 'Surgical & Disposable', 'Antiseptics & Disinfectants', 'Medical Devices', 'Diabetes Care',
      'Orthopedic / Support', 'First Aid', 'Sexual Wellness', 'Herbal / Unani', 'General / FMCG'
    ];
    const ensureCategory = db.prepare('INSERT OR IGNORE INTO categories (name, description, sort_order) VALUES (?, ?, ?)');
    const updateOrder = db.prepare('UPDATE categories SET sort_order = ? WHERE name = ? AND sort_order = 0');
    MAIN_CATEGORY_ORDER.forEach((name, idx) => {
      ensureCategory.run(name, 'Master pharmacy product category', idx + 1);
      updateOrder.run(idx + 1, name);
    });
  } catch (e) {
    // ignore
  }

  // Auto-migrate daily_closings table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_closings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        closing_date TEXT UNIQUE NOT NULL,
        opening_balance REAL DEFAULT 0.0,
        cash_sales REAL DEFAULT 0.0,
        customer_recoveries REAL DEFAULT 0.0,
        other_inflows REAL DEFAULT 0.0,
        supplier_payments REAL DEFAULT 0.0,
        operating_expenses REAL DEFAULT 0.0,
        other_outflows REAL DEFAULT 0.0,
        expected_cash REAL DEFAULT 0.0,
        actual_cash REAL DEFAULT 0.0,
        variance REAL DEFAULT 0.0,
        status TEXT DEFAULT 'CLOSED',
        notes TEXT,
        closed_by INTEGER NOT NULL,
        closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (closed_by) REFERENCES users(id)
      );
    `);
  } catch (e) {
    // ignore
  }

  // One-time cleanup: remove legacy therapeutic-style categories from the original 8-item seed,
  // now superseded by the 40-item Main Category master list - only if unused, never touches real data.
  try {
    const legacyNames = ['Antibiotics', 'Analgesics & Pain', 'Cardiovascular', 'Gastrointestinal', 'Respiratory', 'Endocrine & Diabetes', 'CNS & Psychiatry', 'Oncology & Antineoplastics'];
    const placeholders = legacyNames.map(() => '?').join(',');
    const unused = db.prepare(`
      SELECT c.id, c.name FROM categories c
      WHERE c.name IN (${placeholders})
      AND NOT EXISTS (SELECT 1 FROM medicines m WHERE m.category_id = c.id)
    `).all(...legacyNames) as Array<{ id: number; name: string }>;
    if (unused.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM categories WHERE id = ?');
      for (const cat of unused) deleteStmt.run(cat.id);
    }
  } catch (e) {
    // ignore
  }

  // Seed Medprac Categories & Services if missing
  try {
    const defaultCategories = [
      { name: 'General / Other', description: 'General health consultation or dispensing', icon: 'stethoscope', sort_order: 1 },
      { name: 'Fever', description: 'Pyrexia, elevated temperature', icon: 'thermometer', sort_order: 2 },
      { name: 'Cough & Cold', description: 'Upper respiratory congestion, cough', icon: 'wind', sort_order: 3 },
      { name: 'Fever + Cough + Cold', description: 'Combined febrile flu symptoms', icon: 'activity', sort_order: 4 },
      { name: 'Body Aches / Pain', description: 'Myalgia, generalized body pain', icon: 'user-x', sort_order: 5 },
      { name: 'Headache', description: 'Cephalea, migraine, tension headache', icon: 'brain', sort_order: 6 },
      { name: 'Gastrointestinal / Stomach', description: 'Abdominal discomfort, upset stomach', icon: 'activity', sort_order: 7 },
      { name: 'Acidity / Gastric', description: 'Hyperacidity, GERD, heartburn', icon: 'flame', sort_order: 8 },
      { name: 'Nausea / Vomiting', description: 'Emesis, motion sickness', icon: 'refresh-cw', sort_order: 9 },
      { name: 'Diarrhea', description: 'Loose stools, gastroenteritis', icon: 'droplet', sort_order: 10 },
      { name: 'Constipation', description: 'Bowel sluggishness', icon: 'pause', sort_order: 11 },
      { name: 'Allergy', description: 'Allergic rhinitis, urticaria', icon: 'sparkles', sort_order: 12 },
      { name: 'Respiratory', description: 'Asthma, bronchitis, breathlessness', icon: 'wind', sort_order: 13 },
      { name: 'Acne', description: 'Acne vulgaris, facial spots', icon: 'smile', sort_order: 14 },
      { name: 'Skin / Dermatology', description: 'Eczema, rashes, fungal infection', icon: 'sun', sort_order: 15 },
      { name: 'Wound', description: 'Cut, laceration, ulcer', icon: 'band-aid', sort_order: 16 },
      { name: 'Injury', description: 'Trauma, sprain, strain', icon: 'shield-alert', sort_order: 17 },
      { name: 'Burn', description: 'Thermal or chemical burn', icon: 'zap', sort_order: 18 },
      { name: 'Eye', description: 'Conjunctivitis, eye irritation', icon: 'eye', sort_order: 19 },
      { name: 'Ear', description: 'Otalgia, ear discharge', icon: 'volume-2', sort_order: 20 },
      { name: 'Oral / Dental', description: 'Toothache, oral ulcer', icon: 'smile', sort_order: 21 },
      { name: 'Vitamins / Supplements', description: 'Nutritional support, multivitamins', icon: 'heart-pulse', sort_order: 22 },
      { name: 'Women’s Health', description: 'Gynecological, dysmenorrhea', icon: 'heart', sort_order: 23 },
      { name: 'Other', description: 'Unclassified practice encounter', icon: 'more-horizontal', sort_order: 24 }
    ];

    const insertCat = db.prepare('INSERT OR IGNORE INTO medprac_categories (name, description, icon, sort_order) VALUES (?, ?, ?, ?)');
    defaultCategories.forEach(cat => insertCat.run(cat.name, cat.description, cat.icon, cat.sort_order));

    const defaultServices = [
      { code: 'injection', name: 'Injection', default_cost: 100.0, sort_order: 1 },
      { code: 'iv', name: 'I.V', default_cost: 150.0, sort_order: 2 },
      { code: 'drip', name: 'Drip', default_cost: 200.0, sort_order: 3 },
      { code: 'dressing', name: 'Dressing', default_cost: 150.0, sort_order: 4 },
      { code: 'nebulization', name: 'Nebulization', default_cost: 100.0, sort_order: 5 },
      { code: 'bp_check', name: 'BP Check', default_cost: 50.0, sort_order: 6 },
      { code: 'glucose_check', name: 'Glucose Check', default_cost: 100.0, sort_order: 7 }
    ];

    const insertSvc = db.prepare('INSERT OR IGNORE INTO medprac_services (code, name, default_cost, sort_order) VALUES (?, ?, ?, ?)');
    defaultServices.forEach(s => insertSvc.run(s.code, s.name, s.default_cost, s.sort_order));

  } catch (e) {
    // ignore
  }

  // Existing installations need the adjustment reason column before new ledger entries are written.
  const udhaarTransactionColumns = new Set((db.pragma('table_info(udhaar_transactions)') as Array<{ name: string }>).map(column => column.name));
  if (udhaarTransactionColumns.size && !udhaarTransactionColumns.has('adjustment_reason')) {
    db.exec('ALTER TABLE udhaar_transactions ADD COLUMN adjustment_reason TEXT');
  }

  // Auto-migrate billing_persons table + sales attribution columns (Billing Person dropdown + slip name fix)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    // ignore
  }

  // Auto-migrate: table tracking exactly which batch(es) a MedPrac dispensed line drew stock from
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS medprac_medicine_batch_deductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_medicine_id INTEGER NOT NULL,
        batch_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (visit_medicine_id) REFERENCES medprac_visit_medicines(id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES batches(id)
      );
    `);
  } catch (e) {
    // ignore
  }

  const salesColumns = new Set((db.pragma('table_info(sales)') as Array<{ name: string }>).map(column => column.name));
  if (salesColumns.size && !salesColumns.has('billing_person_id')) {
    db.exec('ALTER TABLE sales ADD COLUMN billing_person_id INTEGER REFERENCES billing_persons(id)');
  }
  if (salesColumns.size && !salesColumns.has('custom_slip_name')) {
    db.exec('ALTER TABLE sales ADD COLUMN custom_slip_name TEXT');
  }

  // Seed default Udhaar customers if missing
  try {
    const custCount = (db.prepare('SELECT COUNT(*) as count FROM udhaar_customers').get() as { count: number }).count;
    if (custCount === 0) {
      const sampleCustomers = [
        { name: 'Ahmad Ali', mobile: '0301-1234567', cnic: '35202-1234567-8', serial_no: '5678', category: 'Medicine', total_udhaar: 12500, paid_amount: 5000, balance: 7500, status: 'DUE', reference: 'Dr. Usman (OPD)', address: 'Lahore, Pakistan' },
        { name: 'Sara Khan', mobile: '0322-9876543', cnic: '35201-9876543-2', serial_no: '6543', category: 'Cosmetics', total_udhaar: 8760, paid_amount: 8760, balance: 0, status: 'CLEARED', reference: 'Direct Walk-in', address: 'Gulberg, Lahore' },
        { name: 'Imran Qureshi', mobile: '0300-4455667', cnic: '35202-4455667-1', serial_no: '5667', category: 'Medicine', total_udhaar: 15200, paid_amount: 5200, balance: 10000, status: 'DUE', reference: 'Dr. Asad', address: 'Model Town, Lahore' },
        { name: 'Ayesha Malik', mobile: '0311-7788990', cnic: '35200-7788990-4', serial_no: '8990', category: 'General Products', total_udhaar: 3450, paid_amount: 3450, balance: 0, status: 'CLEARED', reference: 'Regular', address: 'Faisal Town, Lahore' },
        { name: 'Usman Tariq', mobile: '0345-2322332', cnic: '35201-2322332-9', serial_no: '2332', category: 'Surgical', total_udhaar: 28600, paid_amount: 8600, balance: 20000, status: 'OVERDUE', reference: 'Hospital Ref', address: 'Johar Town, Lahore' },
        { name: 'Nadia Aslam', mobile: '0333-1112233', cnic: '35202-1112233-5', serial_no: '2233', category: 'Medicine', total_udhaar: 6780, paid_amount: 2000, balance: 4780, status: 'DUE', reference: 'Dr. Tariq', address: 'DHA Phase 5, Lahore' },
        { name: 'Bilal Ahmad', mobile: '0307-9090909', cnic: '35200-9090909-3', serial_no: '0909', category: 'Cosmetics', total_udhaar: 9900, paid_amount: 9900, balance: 0, status: 'CLEARED', reference: 'Walk-in', address: 'Iqbal Town, Lahore' },
        { name: 'Zainab Rafiq', mobile: '0321-6677889', cnic: '35201-6677889-7', serial_no: '7889', category: 'Medicine', total_udhaar: 18400, paid_amount: 4400, balance: 14000, status: 'OVERDUE', reference: 'Dr. Shahzad', address: 'Cantt, Lahore' },
        { name: 'Hassan Mehmood', mobile: '0308-1239876', cnic: '35202-1239876-6', serial_no: '9876', category: 'General Products', total_udhaar: 2950, paid_amount: 1000, balance: 1950, status: 'DUE', reference: 'Neighbour', address: 'Samanabad, Lahore' },
        { name: 'Fatima Noor', mobile: '0310-5566778', cnic: '35200-5566778-0', serial_no: '6778', category: 'Surgical', total_udhaar: 11200, paid_amount: 11200, balance: 0, status: 'CLEARED', reference: 'Clinic', address: 'Garden Town, Lahore' }
      ];

      const insertCust = db.prepare(`
        INSERT INTO udhaar_customers (name, mobile, cnic, serial_no, category, total_udhaar, paid_amount, balance, status, reference, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertTrx = db.prepare(`
        INSERT INTO udhaar_transactions (transaction_id, customer_id, type, category, description, amount, payment_method, balance_after, created_by_user_id, created_by_user_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      sampleCustomers.forEach((c, idx) => {
        const res = insertCust.run(c.name, c.mobile, c.cnic, c.serial_no, c.category, c.total_udhaar, c.paid_amount, c.balance, c.status, c.reference, c.address);
        const customerId = res.lastInsertRowid;

        // Initial Udhaar debit transaction
        insertTrx.run(
          `UD-${Date.now()}-${idx + 1}-A`,
          customerId,
          'DEBIT',
          c.category,
          `Initial Udhaar credit purchase (${c.category})`,
          c.total_udhaar,
          'CREDIT_LINE',
          c.total_udhaar,
          1,
          'Dr. Abdul'
        );

        // Payment credit transaction if paid > 0
        if (c.paid_amount > 0) {
          insertTrx.run(
            `UD-${Date.now()}-${idx + 1}-B`,
            customerId,
            'CREDIT',
            c.category,
            `Payment Received`,
            c.paid_amount,
            'CASH',
            c.balance,
            1,
            'Dr. Abdul'
          );
        }
      });
    }
  } catch (e) {
    // ignore
  }

  // Auto-import Git sync_data.json if present on disk
  try {
    const syncDataPath = path.resolve(__dirname, '../../data/sync_data.json');
    if (fs.existsSync(syncDataPath)) {
      const fileContent = fs.readFileSync(syncDataPath, 'utf8');
      const payload = JSON.parse(fileContent);

      db.pragma('foreign_keys = OFF');
      try {
        db.transaction(() => {
          upsertSyncRows(db, 'categories', payload.categories || []);
          upsertSyncRows(db, 'manufacturers', payload.manufacturers || []);
          upsertSyncRows(db, 'generics', payload.generics || []);
          upsertSyncRows(db, 'suppliers', payload.suppliers || []);
          upsertSyncRows(db, 'medicines', payload.medicines || []);
          upsertSyncRows(db, 'drug_clinical_info', payload.drug_clinical_info || []);
          upsertSyncRows(db, 'batches', payload.batches || []);
        })();
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (e) {
    // Ignore auto-sync error during initial boot
  }
}


// Transaction runner utility for ACID compliance
export function runTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
