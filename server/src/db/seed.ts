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
    insertSetting.run('pharmacy_address', '31 32 chowk chohan road outfall, near tariq pan shop, Islampura, Lahore, 54000', 'Store physical address');
    insertSetting.run('pharmacy_phone', '03454142863', 'Contact phone numbers');
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
    insertGeneric.run('Ondansetron', 'Antiemetic / 5-HT3 Receptor Antagonist', 'Selective 5-HT3 receptor antagonist for chemotherapy, radiation, and post-operative nausea and vomiting.');
    insertGeneric.run('Azithromycin', 'Macrolide Antibiotic', 'Broad-spectrum macrolide for respiratory, skin, and STIs.');
    insertGeneric.run('Ibuprofen', 'NSAID / Anti-Inflammatory', 'Nonsteroidal anti-inflammatory drug for pain, fever, and arthritis.');
    insertGeneric.run('Losartan Potassium', 'Angiotensin II Receptor Blocker', 'Antihypertensive and renal protection in type 2 diabetes.');

    const getGenId = (genName: string) => {
      const row = db.prepare('SELECT id FROM generics WHERE name = ?').get(genName) as any;
      return row ? row.id : 1;
    };

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

    insertMedicine.run(1, 'Panadol 500mg', getGenId('Paracetamol'), 2, 1, '500mg', 'Tablet', 200, '896400012345', 'MED-001', 'Rack A-1', 50, 100, 0, 'Fast mover fever tablet');
    insertMedicine.run(2, 'Augmentin 625mg', getGenId('Amoxicillin + Clavulanic Acid'), 1, 1, '625mg', 'Tablet', 14, '896400054321', 'MED-002', 'Rack B-3', 20, 30, 1, 'Requires valid doctor prescription');
    insertMedicine.run(3, 'Risek 20mg', getGenId('Omeprazole'), 4, 2, '20mg', 'Capsule', 14, '896400098765', 'MED-003', 'Rack C-2', 25, 40, 0, 'Omeprazole enteric coated');
    insertMedicine.run(4, 'Norvasc 5mg', getGenId('Amlodipine'), 3, 3, '5mg', 'Tablet', 30, '896400011223', 'MED-004', 'Rack D-1', 15, 25, 1, 'Blood pressure maintenance');
    insertMedicine.run(5, 'Glucophage 500mg', getGenId('Metformin HCl'), 3, 4, '500mg', 'Tablet', 50, '896400044556', 'MED-005', 'Rack D-2', 30, 50, 1, 'Metformin sugar control');
    insertMedicine.run(6, 'Gravinate 8mg (Ondansetron)', getGenId('Ondansetron'), 4, 4, '8mg', 'Tablet', 10, '896400077889', 'MED-006', 'Rack C-1', 20, 30, 1, 'Ondansetron antiemetic tablet');
    insertMedicine.run(7, 'Azomax 500mg', getGenId('Azithromycin'), 1, 2, '500mg', 'Tablet', 6, '896400088990', 'MED-007', 'Rack B-1', 15, 25, 1, 'Azithromycin 3-day course');
    insertMedicine.run(8, 'Brufen 400mg', getGenId('Ibuprofen'), 2, 1, '400mg', 'Tablet', 100, '896400033445', 'MED-008', 'Rack A-2', 40, 80, 0, 'Ibuprofen analgesic');
    insertMedicine.run(9, 'Eziday 50mg', getGenId('Losartan Potassium'), 3, 2, '50mg', 'Tablet', 30, '896400055667', 'MED-009', 'Rack D-3', 20, 35, 1, 'Losartan blood pressure tablet');

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

    // Gravinate (Ondansetron) Batch
    insertBatch.run(7, 6, 'GRV-2026-01', '2025-01-10', '2027-11-30', 12.00, 18.00, 200, 0, 1, 'Rack C-1', 'ACTIVE');
    insertBatch.run(8, 7, 'AZO-2026-01', '2025-02-01', '2027-10-31', 35.00, 48.00, 150, 0, 2, 'Rack B-1', 'ACTIVE');
    insertBatch.run(9, 8, 'BRU-2026-01', '2025-01-01', '2028-01-01', 3.00, 4.50, 500, 0, 1, 'Rack A-2', 'ACTIVE');
    insertBatch.run(10, 9, 'EZI-2026-01', '2025-03-15', '2027-09-30', 14.00, 22.00, 180, 0, 2, 'Rack D-3', 'ACTIVE');

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

    // 8. Drug Clinical Info & Monograph Knowledge Base
    const insertClinical = db.prepare(`
      INSERT OR REPLACE INTO drug_clinical_info (
        generic_id, atc_code, rx_status, pharmacological_class, countries_available,
        pregnancy_category, trimester_considerations, lactation_safety,
        adult_dosage, pediatric_dosage, neonatal_dosage, geriatric_dosage, weight_bsa_dosing,
        hepatic_renal_precautions, dialysis_considerations,
        indications_approved, indications_common, indications_offlabel,
        pharmacology_moa, pharmacokinetics_summary, absorption_bioavailability, distribution_protein_binding,
        metabolism_cyp, half_life_elimination, onset_peak_duration,
        contraindications_absolute, contraindications_relative,
        boxed_warnings, serious_warnings, cautions, monitoring_required,
        side_effects_common, side_effects_serious, side_effects_rare_life_threatening,
        food_interactions, disease_interactions, special_populations,
        pill_imprint, pill_shape, pill_color,
        monitoring_parameters, administration_instructions, storage_stability,
        patient_counseling_en, patient_counseling_professional,
        clinical_source, source_version, last_reviewed
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?
      )
    `);

    // Paracetamol (generic_id: 1)
    insertClinical.run(
      1, 'N02BE01', 'OTC', 'Analgesic / Antipyretic', 'Global (PK, US, UK, EU, JP)',
      'B', 'Safe across all trimesters at recommended doses; avoid excessive duration.', 'Compatible with breastfeeding (small amounts in milk).',
      '500mg-1000mg PO/IV every 4-6 hours as needed (Max: 4000mg/24h).',
      '10-15mg/kg/dose PO/IV every 4-6 hours (Max: 75mg/kg/day or 4000mg/day).',
      '10-15mg/kg/dose q6-8h under pediatric supervision.',
      'Use lowest effective dose; start with 500mg in frail elderly.',
      'Dosed strictly by mg/kg in children.',
      'Contraindicated in severe active liver failure. Reduce max dose to 2000mg/day in chronic alcohol abuse or hepatic insufficiency. In CrCl < 10 mL/min, extend interval to q8h.',
      'Slightly dialyzable (HD/PD); no supplemental post-dialysis dose required unless prolonged.',
      'Fever reduction, mild-to-moderate pain (headache, toothache, dysmenorrhea, musculoskeletal pain).',
      'Post-operative analgesia (multimodal pain management), osteoarthritis.',
      'Patent ductus arteriosus closure in preterm infants (IV formulation off-label).',
      'Reversibly inhibits central cyclooxygenase (COX-1 & COX-2) pathways in CNS, inhibiting prostaglandin synthesis and elevating pain threshold.',
      'Rapid oral absorption; hepatic glucuronidation and sulfation; minor NAPQI toxic metabolite pathway via CYP2E1 detoxified by glutathione.',
      'Oral Bioavailability: 88-90%. Peak plasma concentration reached in 30-60 minutes.',
      'Vd: ~1 L/kg. Low protein binding (10-25%). Crosses placenta and blood-brain barrier.',
      'Metabolized in liver via glucuronidation (55%), sulfation (30%), and CYP2E1 (5-10% NAPQI).',
      'Elimination Half-life: 2-3 hours. Renal excretion of metabolites (90% in 24h).',
      'Onset: 15-30 min PO, 5-10 min IV. Peak: 1 hour PO. Duration: 4-6 hours.',
      'Hypersensitivity to paracetamol; severe acute liver disease or active hepatic failure.',
      'Chronic alcohol abuse, malnourishment, severe renal impairment (eGFR < 15 mL/min).',
      '🔴 Overdose Warning: Doses > 4g/day cause fatal acute liver necrosis. N-acetylcysteine antidote required within 8 hours.',
      '🟠 Hepatotoxicity risk in malnourished or chronic alcoholic patients.',
      '🟡 Avoid concurrent paracetamol-containing combination products to prevent accidental overdose.',
      '🔵 Monitor liver function tests (LFTs) if therapy exceeds 10 consecutive days.',
      'Nausea, rash, headache, constipation (with IV route).',
      'Hepatotoxicity, severe cutaneous adverse reactions (Stevens-Johnson syndrome, TEN).',
      'Anaphylaxis, agranulocytosis, acute liver failure.',
      'Food slightly delays peak absorption rate but does not reduce overall bioavailability. Avoid heavy alcohol consumption.',
      'Severe hepatic dysfunction, chronic hepatitis, alcohol dependency, G6PD deficiency.',
      'Hepatic insufficiency, chronic alcohol use, pediatric weight-based dosing.',
      '500 / PARA', 'Oval', 'White',
      'LFTs (AST/ALT, Bilirubin) in prolonged use or overdose, Serum Paracetamol level (Rumack-Matthew nomogram).',
      'Take with a full glass of water. Can be taken with or without food. Do not crush sustained-release tablets.',
      'Store below 30°C in a cool, dry place. Protect from excessive light and humidity.',
      'Do not take more than 8 tablets (500mg each) in 24 hours. Check labels of cold/flu products so you do not double dose.',
      'Verify patient total daily dose from all combined OTC and Rx products. Administer IV infusion over 15 minutes.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    // Ondansetron
    insertClinical.run(
      getGenId('Ondansetron'), 'A04AA01', 'Rx', '5-HT3 Receptor Antagonist Antiemetic', 'Global (PK, US, UK, EU)',
      'B', 'Safe when clinically needed; extensive human data indicates no increased risk of major malformations.', 'Excreted in animal milk; use caution in nursing mothers.',
      '4mg - 8mg PO/IV every 8-12 hours as needed (Max: 24mg/day).',
      '0.15mg/kg IV every 8 hours or 2mg-4mg PO TID in pediatric oncology.',
      '0.1mg/kg IV for post-operative nausea under pediatric anesthesia.',
      'No dose adjustment necessary; start at lower end of dosing range.',
      '0.15 mg/kg IV per dose in pediatric chemotherapy protocols.',
      'No dose adjustment required in renal impairment. In severe hepatic impairment (Child-Pugh Class C), maximum daily dose is 8mg.',
      'Not significantly removed by hemodialysis.',
      'Prevention of chemotherapy-induced nausea and vomiting (CINV), radiation-induced nausea (RINV), post-operative nausea and vomiting (PONV).',
      'Acute gastroenteritis nausea in pediatric emergency settings, hyperemesis gravidarum.',
      'Refractory pruritus associated with cholestasis, uremic pruritus.',
      'Selective antagonist of 5-HT3 serotonin receptors located peripherally on vagal nerve terminals and centrally in the chemoreceptor trigger zone (CTZ) of the area postrema.',
      'Rapidly absorbed from GI tract; undergoes first-pass hepatic metabolism.',
      'Oral Bioavailability: ~60%. Peak plasma level: 1.5 hours.',
      'Protein Binding: 70-76%. Vd: 1.9 L/kg.',
      'Extensively metabolized by hepatic CYP3A4, CYP1A2, and CYP2D6.',
      'Elimination Half-life: 3.5 - 5.5 hours (extended to 15-20 hours in severe hepatic impairment).',
      'Onset: 30 minutes PO, 10 minutes IV. Peak: 1.5 hours PO. Duration: 8-12 hours.',
      'Hypersensitivity to ondansetron; concomitant use with apomorphine (profound hypotension and loss of consciousness).',
      'Congenital long QT syndrome, hypokalemia, hypomagnesemia, severe hepatic failure.',
      '🔴 QTc Prolongation Warning: Dose-dependent QTc interval prolongation. Avoid single IV doses > 16mg.',
      '🟠 Serotonin Syndrome risk when combined with SSRIs, SNRIs, or MAO inhibitors.',
      '🟡 May mask progressive ileus or gastric distension following abdominal surgery.',
      '🔵 Monitor ECG in patients with electrolyte abnormalities or CHF.',
      'Headache, constipation, fatigue, sensation of warmth or flushing, transient elevation of liver enzymes.',
      'QTc prolongation, Torsades de Pointes, severe bronchospasm, anaphylaxis.',
      'Toxic epidermal necrolysis, oculogyric crisis, serotonin syndrome.',
      'Take with or without food. Food slightly increases oral absorption.',
      'Severe hepatic impairment, cardiac arrhythmias, electrolyte disturbances.',
      'Pediatric gastroenteritis, hepatic failure, cardiology patients with long QT.',
      'OND 8', 'Round', 'White',
      'ECG (QTc interval), Serum Potassium, Serum Magnesium, LFTs in severe liver disease.',
      'Take 30 minutes prior to chemotherapy or surgery. Dissolve orally disintegrating tablets on tongue.',
      'Store below 30°C. Protect from light.',
      'Take this medicine before meals or procedures to prevent nausea. Report any irregular heartbeat immediately.',
      'Administer slow IV push over 2-5 minutes or IV infusion over 15 minutes. Check baseline QTc.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    // Amoxicillin + Clavulanate
    insertClinical.run(
      getGenId('Amoxicillin + Clavulanic Acid'), 'J01CR02', 'Rx', 'Penicillin + Beta-Lactamase Inhibitor', 'Global (PK, US, UK, EU)',
      'B', 'Generally considered safe during pregnancy when clinically indicated.', 'Excreted in human milk; monitor infant for diarrhea, candidiasis, or sensitization.',
      '625mg PO q8h or 1000mg PO q12h; 1.2g IV q8h for severe infections.',
      '30-45mg/kg/day in divided doses q12h (for 7:1 formulation) based on amoxicillin component.',
      'Not recommended in neonates < 12 weeks with 1000mg or ES formulations.',
      'Dose according to renal function; higher risk of GI upset.',
      'Dosed strictly by mg/kg/day of Amoxicillin component.',
      'In CrCl 10-30 mL/min: max 625mg PO BID. In CrCl < 10 mL/min: max 625mg PO q24h. Contraindicated in history of amoxicillin/clavulanate-associated hepatic dysfunction.',
      'Hemodialysis removes amoxicillin/clavulanate; administer supplemental dose post-dialysis.',
      'Community-acquired pneumonia, acute bacterial sinusitis, otitis media, skin & soft tissue infections, UTI, bite wounds.',
      'Exacerbation of COPD, dental infections, diabetic foot infections.',
      'Surgical prophylaxis in pelvic or abdominal procedures.',
      'Amoxicillin inhibits bacterial cell wall peptidoglycan synthesis; Clavulanate irreversibly inactivates beta-lactamase enzymes produced by resistant bacteria.',
      'Well absorbed after oral administration. Widely distributed into tissues and body fluids.',
      'Oral Bioavailability: ~70%. Peak serum concentration in 1-2 hours.',
      'Protein Binding: Amoxicillin 18%, Clavulanate 25%. Crosses placenta and breast milk.',
      'Amoxicillin minimally metabolized; Clavulanate extensively metabolized in liver.',
      'Elimination Half-life: ~1-1.3 hours. Excreted mainly by renal tubular secretion.',
      'Onset: Rapid. Peak: 1-2 hours PO. Duration: 8-12 hours.',
      'History of severe hypersensitivity (anaphylaxis) to penicillins/cephalosporins; history of clavulanate-induced cholestatic jaundice/hepatic dysfunction.',
      'Mononucleosis (high incidence of erythematous skin rash); renal impairment.',
      '🔴 Severe Anaphylaxis Warning: Cross-reactivity in patients with penicillin allergy.',
      '🟠 Cholestatic jaundice and hepatitis may occur during or up to 6 weeks after therapy.',
      '🟡 High incidence of antibiotic-associated diarrhea and Clostridioides difficile colitis.',
      '🔵 Monitor hepatic function, renal function, and hematopoietic status during prolonged therapy (> 14 days).',
      'Diarrhea, nausea, vomiting, abdominal discomfort, oral/vaginal candidiasis.',
      'Cholestatic jaundice, hepatitis, erythema multiforme, urticaria.',
      'Stevens-Johnson syndrome, TEN, C. difficile-associated colitis, anaphylactic shock.',
      'Take at the start of a meal to enhance clavulanate absorption and minimize GI adverse effects.',
      'Renal failure, infectious mononucleosis, hepatic dysfunction, gout (if taking allopurinol).',
      'Geriatric patients, patients with renal impairment, infants < 12 weeks.',
      'AUG 625', 'Oblong', 'White',
      'CBC with differential, LFTs (AST/ALT/Bilirubin), Renal function (BUN/Serum Creatinine).',
      'Swallow tablets whole at the start of a meal. Reconstituted oral suspension must be stored in a refrigerator (2-8°C) and discarded after 7-10 days.',
      'Store dry tablets below 25°C. Reconstituted liquid MUST be kept refrigerated and discarded after 7 days.',
      'Take this medicine with food or a snack. Finish the entire prescribed course even if you feel better.',
      'Reconstitute powder with prescribed water volume. Shake well before each dose. Do not freeze.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    // Omeprazole
    insertClinical.run(
      getGenId('Omeprazole'), 'A02BC01', 'OTC/Rx', 'Proton Pump Inhibitor (PPI)', 'Global (PK, US, UK, EU)',
      'C', 'Animal studies show potential risk; use only if potential benefit outweighs risk.', 'Excreted in human milk; decision should be made to discontinue nursing or drug.',
      '20mg-40mg PO once daily in the morning before breakfast for 4-8 weeks. (Zollinger-Ellison: up to 120mg TID).',
      '10mg-20mg once daily for children > 1 year or > 10 kg.',
      'Safety and efficacy not established in neonates.',
      'No initial dose adjustment necessary; higher risk of bone fractures with long-term use.',
      '0.7 - 1.4 mg/kg/day PO.',
      'No dose adjustment needed in renal failure. In severe hepatic impairment, maximum daily dose is 20mg.',
      'Not significantly removed by hemodialysis.',
      'Gastroesophageal Reflux Disease (GERD), duodenal ulcer, gastric ulcer, H. pylori eradication (triple therapy), Zollinger-Ellison syndrome.',
      'NSAID-induced ulcer prophylaxis, non-ulcer dyspepsia, stress ulcer prophylaxis in ICU.',
      'Eosinophilic esophagitis, prevention of rebleeding from peptic ulcer.',
      'Irreversibly inhibits the H+/K+-ATPase enzyme system (proton pump) at the secretory surface of gastric parietal cells, blocking the final step of gastric acid production.',
      'Acid-labile; formulated as enteric-coated granules. Rapidly absorbed after passing stomach.',
      'Bioavailability: 30-40% (increases to 60% with repeated doses). Peak plasma level: 0.5-3.5 hours.',
      'Protein Binding: 95%. Distributed into liver, kidneys, and gastric mucosa.',
      'Extensively metabolized by hepatic CYP2C19 (major) and CYP3A4 (minor).',
      'Elimination Half-life: 0.5-1 hour (antisecretory effect lasts > 24-72 hours due to covalent binding).',
      'Onset: 1 hour. Peak antisecretory effect: 2 hours. Duration: 24-72 hours.',
      'Known hypersensitivity to omeprazole or substituted benzimidazoles; concomitant use with rilpivirine.',
      'Osteoporosis, hypomagnesemia, gastric malignancy (masking symptoms), Clostridioides difficile risk.',
      '🔴 Long-Term Warning: Increased risk of bone fractures (hip, wrist, spine) with high-dose/long-term PPI therapy.',
      '🟠 Severe hypomagnesemia reported in patients treated for > 1 year; B12 deficiency with long-term use.',
      '🟡 Interacts with clopidogrel (decreases active metabolite via CYP2C19 inhibition).',
      '🔵 Monitor serum magnesium prior to initiating PPI and periodically during prolonged treatment.',
      'Headache, abdominal pain, diarrhea, nausea, vomiting, flatulence.',
      'Hypomagnesemia, bone fracture, C. difficile diarrhea, acute interstitial nephritis.',
      'Anaphylaxis, severe cutaneous adverse reactions, subacute cutaneous lupus erythematosus.',
      'Take 30-60 minutes before breakfast on an empty stomach with a glass of water.',
      'Severe liver failure, osteoporosis/osteopenia, hypomagnesemia, active C. difficile infection.',
      'Geriatric patients, chronic users (> 1 year), patients with hepatic impairment.',
      'OME 20', 'Capsule', 'Pink / Brown',
      'Serum Magnesium, Vitamin B12 levels (long-term therapy), Bone Mineral Density (BMD) in high-risk patients.',
      'Swallow capsules whole. Do not chew or crush enteric-coated granules.',
      'Store below 25°C. Protect from moisture and excessive light.',
      'Take 30 minutes before your morning meal. Do not crush or chew the capsule.',
      'CYP2C19 poor metabolizers may experience 3-4 fold higher AUC. Consider pantoprazole if patient takes clopidogrel.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    // Amlodipine
    insertClinical.run(
      getGenId('Amlodipine'), 'C08CA01', 'Rx', 'Dihydropyridine Calcium Channel Blocker', 'Global (PK, US, UK, EU)',
      'C', 'Teratogenic in animal studies at high doses; use only if benefit outweighs fetal risk.', 'Present in human breast milk; monitor infant for hypotension or bradycardia.',
      '5mg-10mg PO once daily (Initial dose: 5mg once daily; max 10mg once daily).',
      '2.5mg-5mg PO once daily in children 6-17 years.',
      'Safety not established in neonates and infants < 6 years.',
      'Start at lower initial dose (2.5mg once daily) in frail elderly due to reduced clearance.',
      '0.05 - 0.2 mg/kg/day PO.',
      'No dose adjustment necessary in renal impairment. Start at 2.5mg once daily in hepatic impairment.',
      'Not dialyzable by hemodialysis.',
      'Essential hypertension, chronic stable angina, vasospastic angina (Prinzmetal angina), coronary artery disease.',
      'Raynaud phenomenon, hypertensive urgency, diabetic nephropathy adjunct.',
      'Pulmonary arterial hypertension (high-dose CCB responders).',
      'Inhibits influx of extracellular calcium ions across vascular smooth muscle and cardiac muscle membranes, relaxing coronary vascular smooth muscle and peripheral arterioles.',
      'Slowly and almost completely absorbed from GI tract. Unaffected by food.',
      'Bioavailability: 64-90%. Peak plasma concentration: 6-12 hours.',
      'Protein Binding: 97.5%. Vd: ~21 L/kg. High tissue distribution.',
      'Extensively metabolized by hepatic CYP3A4 to inactive metabolites.',
      'Elimination Half-life: 30-50 hours (extended in hepatic impairment and elderly).',
      'Onset: Gradual (6-12 hours). Peak: 6-12 hours. Duration: > 24 hours.',
      'Severe hypotension, cardiogenic shock, severe aortic stenosis, hypersensitivity to dihydropyridines.',
      'Congestive heart failure (use with caution), hepatic impairment, elderly.',
      '🔴 Severe Hypotension & Reflex Tachycardia Warning in patients with severe aortic stenosis.',
      '🟠 Peripheral edema occurs in up to 10-15% of patients (dose-dependent).',
      '🟡 Strong CYP3A4 inhibitors (ketoconazole, ritonavir) increase amlodipine exposure.',
      '🔵 Monitor Blood Pressure and Heart Rate before initiation and during titration.',
      'Peripheral edema, flushing, dizziness, headache, fatigue, palpitations.',
      'Severe hypotension, gingival hyperplasia, syncope, chest pain exacerbation upon initiation.',
      'Anaphylaxis, Stevens-Johnson syndrome, acute myocardial infarction (rare initial reflex).',
      'Take with or without food. Avoid large quantities of grapefruit juice (may increase bioavailability).',
      'Severe aortic stenosis, severe hepatic impairment, heart failure with reduced ejection fraction.',
      'Geriatric patients, severe hepatic failure, pediatric hypertension.',
      'AML 5', 'Round', 'White',
      'Blood Pressure, Heart Rate, Liver Function Tests, Peripheral Edema assessment.',
      'Take once daily at the same time each day with a glass of water.',
      'Store below 30°C. Protect from moisture and direct light.',
      'Do not stop taking this medication suddenly. Rise slowly from sitting or lying positions to prevent dizziness.',
      'Long elimination half-life allows once-daily dosing. Max dose in hepatic impairment is 5mg daily.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    // Metformin
    insertClinical.run(
      getGenId('Metformin HCl'), 'A10BA02', 'Rx', 'Biguanide Antidiabetic', 'Global (PK, US, UK, EU)',
      'B', 'First-line oral agent in pregnant diabetic patients when insulin is not feasible.', 'Excreted into human milk in low amounts; acceptable with infant monitoring.',
      '500mg-850mg PO BID/TID with meals; max 2550mg/day (IR) or 2000mg/day (XR).',
      '500mg PO once or BID in children >= 10 years (max 2000mg/day).',
      'Contraindicated in neonates and children < 10 years.',
      'Lower dose recommendation; assess renal function prior to starting.',
      '10-15 mg/kg/day PO in children >= 10 years.',
      'Contraindicated if eGFR < 30 mL/min. If eGFR 30-45 mL/min: max 1000mg/day. Withhold prior to iodinated contrast procedures in eGFR 30-60 mL/min.',
      'Hemodialysis clears metformin efficiently; do not use in end-stage renal disease unless on maintenance dialysis.',
      'Type 2 Diabetes Mellitus (first-line monotherapy or combination).',
      'Polycystic Ovary Syndrome (PCOS), Gestational Diabetes, Prediabetes prevention.',
      'Nonalcoholic Fatty Liver Disease (NAFLD), weight-gain prevention with antipsychotics.',
      'Decreases hepatic glucose production (gluconeogenesis), decreases intestinal absorption of glucose, and improves insulin sensitivity by increasing peripheral glucose uptake and utilization.',
      'Slowly absorbed from small intestine. Unbound in plasma. Excreted unchanged in urine.',
      'Bioavailability: 50-60%. Peak concentration: 2.5 hours (IR) or 7 hours (XR).',
      'Protein Binding: Negligible. Vd: 654 L. Accumulates in salivary glands, liver, and kidney.',
      'Not metabolized by liver (excreted 100% unchanged by renal tubular secretion).',
      'Elimination Half-life: 6.2 hours (plasma) / 17.6 hours (blood). Excreted in urine.',
      'Onset: 2-3 days for glycemic control. Peak: 2-4 weeks for full efficacy.',
      'Severe renal dysfunction (eGFR < 30 mL/min), acute or chronic metabolic acidosis (including diabetic ketoacidosis), severe dehydration, sepsis.',
      'Renal impairment (eGFR 30-45 mL/min), hepatic impairment, chronic alcoholism, iodinated contrast imaging.',
      '🔴 Boxed Warning: Lactic Acidosis — Rare but fatal accumulation in severe renal impairment, hypoxemia, or shock.',
      '🟠 Withhold metformin at the time of or prior to iodinated contrast imaging procedures in patients with eGFR 30-60 mL/min.',
      '🟡 Long-term use associated with Vitamin B12 deficiency (monitor hematologic parameters).',
      '🔵 Monitor eGFR at least annually (q3-6 months in renal insufficiency) and serum Vitamin B12 every 2-3 years.',
      'Diarrhea, nausea, vomiting, flatulence, abdominal discomfort, metallic taste, anorexia.',
      'Lactic acidosis, severe Vitamin B12 deficiency anemia, hypoglycemia (when combined with insulin/sulfonylurea).',
      'Lactic acidosis with severe cardiovascular collapse.',
      'Take with or immediately after meals to minimize gastrointestinal upset.',
      'Renal failure (eGFR < 30), severe liver failure, heart failure requiring pharmacologic intervention, acute alcoholism.',
      'Renal impairment, elderly patients, patients undergoing radiology with contrast.',
      'MET 500', 'Round', 'White',
      'eGFR / Serum Creatinine, HbA1c, Fasting Blood Glucose, Vitamin B12 level, Complete Blood Count.',
      'Take with meals. Swallow extended-release tablets whole; do not chew, crush, or break.',
      'Store below 25°C in a tight container.',
      'Take this medicine with food to avoid stomach upset. Limit alcohol consumption.',
      'Renal tubular secretion substrate (OCT2). Co-administration with dolutegravir increases metformin levels.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    // 5-Fluorouracil (0-9 / Oncology)
    const gen5FU = db.prepare(`
      INSERT INTO generics (name, therapeutic_class, description)
      VALUES ('5-Fluorouracil', 'Oncology & Antineoplastics', 'Antimetabolite fluoropyrimidine antineoplastic agent.')
      ON CONFLICT(name) DO UPDATE SET therapeutic_class = excluded.therapeutic_class
      RETURNING id
    `).get() as any;

    if (gen5FU) {
      insertClinical.run(
        gen5FU.id, 'L01BC02', 'Rx', 'Antimetabolite / Pyrimidine Analog', 'USA, UK, EU, PK',
        'D', 'Teratogenic and embryotoxic. Absolute contraindication in pregnancy.', 'Contraindicated during breastfeeding.',
        '12 mg/kg/day IV for 4 consecutive days (Max: 800 mg/day).',
        'Pediatric dosing strictly protocol-dependent under oncology supervision.',
        'Not indicated in neonates.',
        'Dose reduction required in frail elderly patients with cardiac insufficiency.',
        'Calculated based on Body Surface Area (mg/m²).',
        'Use with caution in renal or hepatic impairment; monitor DPD enzyme activity.',
        'Dialyzable.',
        'Colorectal carcinoma, breast carcinoma, gastric and pancreatic adenocarcinoma.',
        'Topical treatment of actinic keratosis and superficial basal cell carcinoma.',
        'Ophthalmic trabeculectomy scarring prevention.',
        'Irreversibly inhibits thymidylate synthase, blocking DNA synthesis.',
        'Rapid IV clearance; metabolized hepatically by dihydropyrimidine dehydrogenase (DPD).',
        'IV Bioavailability: 100%. Oral absorption is erratic.',
        'Vd: 0.12 L/kg. Crosses blood-brain barrier.',
        'Hepatic degradation via DPD enzyme pathway.',
        'Terminal half-life: 8-20 minutes.',
        'Peak plasma concentrations immediately after IV bolus.',
        'Severe DPD enzyme deficiency, bone marrow suppression, severe infection.',
        'Cardiac disease, history of myocardial ischemia.',
        '🔴 Boxed Warning: Severe toxicity and fatalities in patients with dihydropyrimidine dehydrogenase (DPD) deficiency.',
        '🟠 Stomatitis, severe diarrhea, neutropenia, and hand-foot syndrome.',
        '🟡 Monitor CBC with differential daily during induction.',
        '🔵 Weekly CBC, LFTs, and renal function.',
        'Nausea, vomiting, diarrhea, alopecia, stomatitis.',
        'Myelosuppression, cardiotoxicity, severe enteritis, hand-foot syndrome.',
        'Anaphylaxis, fatal DPD-deficiency toxicity.',
        'Avoid alcohol and concurrent warfarin (increases INR).',
        'DPD deficiency, cardiac ischemia.',
        'Geriatric patients and patients with dihydropyrimidine dehydrogenase gene variants.',
        '5FU 500', 'Ampoule', 'Clear Liquid',
        'CBC, Platelets, LFTs, Bilirubin, Cardiac telemetry if symptomatic.',
        'Administer via central or peripheral IV infusion per oncology protocol.',
        'Store at 15-25°C. Protect from light.',
        'Report signs of fever, severe diarrhea, or chest pain immediately.',
        'Pharmacist double-check required for all chemotherapy dosing and calculations.',
        'USP-NF / NCI Cancer Institute Reference', 'v2026.1', '2026-09-01'
      );
    }

    // Diazepam (Controlled Drug / CNS)
    const genDiazepam = db.prepare(`
      INSERT INTO generics (name, therapeutic_class, description)
      VALUES ('Diazepam', 'CNS & Psychiatry', 'Long-acting benzodiazepine anticonvulsant and anxiolytic.')
      ON CONFLICT(name) DO UPDATE SET therapeutic_class = excluded.therapeutic_class
      RETURNING id
    `).get() as any;

    if (genDiazepam) {
      insertClinical.run(
        genDiazepam.id, 'N05BA01', 'Controlled', 'Benzodiazepine Anxiolytic / Anticonvulsant', 'Global (PK, US, UK, EU)',
        'D', 'Risk of congenital malformations in 1st trimester. Neonatal withdrawal.', 'Excreted in human milk; avoid during breastfeeding.',
        '2mg-10mg PO 2 to 4 times daily, or 10mg IV/IM for status epilepticus.',
        '0.1-0.3 mg/kg/dose PO or IV.',
        'Not recommended in neonates due to benzyl alcohol preservative risks.',
        'Start at 2mg PO once or twice daily (risk of ataxia and confusion).',
        'Dosed by weight in pediatric status epilepticus.',
        'Avoid in severe hepatic impairment; dose reduction required in renal impairment.',
        'Not significantly removed by hemodialysis.',
        'Anxiety disorders, acute alcohol withdrawal, muscle spasm, status epilepticus.',
        'Preoperative sedation, panic attacks.',
        'Akathisia, night terrors, severe refractory insomnia.',
        'Binds to stereospecific benzodiazepine receptors on postsynaptic GABA-A neuron site, enhancing GABA inhibitory effects.',
        'Rapid oral absorption; extensively metabolized by CYP2C19 and CYP3A4 to active metabolites (desmethyldiazepam).',
        'Oral Bioavailability: 98%. Peak: 30-90 minutes.',
        '98-99% protein bound. High lipophilicity.',
        'Hepatic via CYP2C19 & CYP3A4 to active metabolite desmethyldiazepam.',
        'Elimination half-life: 20-50 hours (active metabolite up to 100 hours).',
        'IV onset: 1-5 min; Oral onset: 15-30 min.',
        'Myasthenia gravis, severe respiratory insufficiency, severe hepatic failure, sleep apnea.',
        'History of substance abuse, depression.',
        '🔴 Boxed Warning: Concomitant use of benzodiazepines and opioids may result in profound sedation, respiratory depression, coma, and death.',
        '🟠 Abuse, misuse, addiction, physical dependence, and severe withdrawal reactions.',
        '🟡 Elderly patients have increased risk of fall and cognitive impairment.',
        '🔵 Respiratory rate, blood pressure, sedation score, hepatic function.',
        'Drowsiness, fatigue, muscle weakness, ataxia.',
        'Respiratory depression, hypotension, dependence, paradoxical excitation.',
        'Laryngospasm, coma, fatal overdose with CNS depressants.',
        'Avoid alcohol and grapefruit juice.',
        'Respiratory disease, hepatic impairment, substance use disorder.',
        'Elderly, pediatric, renal/hepatic impaired patients.',
        'VAL 10', 'Round', 'Blue',
        'Respiratory rate, oxygen saturation, sedation depth.',
        'Administer IV slowly (5mg/min). Avoid rapid bolus to prevent apnea.',
        'Store at 20-25°C. Protect from light.',
        'Do not drive or operate machinery while taking this medicine. Avoid alcohol.',
        'Controlled Schedule IV drug. Verify security storage and logbook entry.',
        'USP-NF / DailyMed Reference', 'v2026.1', '2026-09-01'
      );
    }

    // 9. Drug-Drug Interactions Matrix (Expanded)
    const insertDDI = db.prepare(`
      INSERT OR IGNORE INTO drug_interactions (
        generic_a_id, generic_b_id, severity, effect, management, evidence_level
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertDDI.run(3, 4, 'MODERATE', 'Omeprazole may reduce hepatic clearance of Amlodipine via CYP3A4 pathway resulting in enhanced hypotensive effect.', 'Monitor blood pressure regularly upon initiation or dose adjustment.', 'ESTABLISHED');
    insertDDI.run(4, 5, 'MINOR', 'Calcium channel blockers may occasionally impair glucose tolerance.', 'Monitor blood glucose levels in diabetic patients initiating therapy.', 'THEORETICAL');
    insertDDI.run(1, 5, 'MINOR', 'Paracetamol in high doses may alter glycemic response slightly.', 'Standard glucose monitoring is adequate.', 'THEORETICAL');
    insertDDI.run(2, 5, 'MINOR', 'Amoxicillin + Clavulanate may cause transient GI distress altering metformin absorption.', 'Take both with meals.', 'INFORMATIONAL');
    if (genDiazepam) {
      insertDDI.run(getGenId('Ondansetron'), genDiazepam.id, 'MAJOR', 'Concurrent use of Ondansetron and Diazepam may increase CNS depressant and sedative effects.', 'Monitor patient closely for excessive drowsiness or respiratory depression.', 'ESTABLISHED');
    }
  });

  seed();
  console.log('Database seeded successfully with roles, users, categories, medicines, batches, and system settings.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase();
}
