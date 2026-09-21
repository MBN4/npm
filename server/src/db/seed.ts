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
    insertRole.run(1, 'Admin', 'Full administrative access to all modules and configurations');
    insertRole.run(2, 'Pharmacist', 'Dispensing, patient counseling, drug safety, and stock control');
    insertRole.run(3, 'Cashier', 'POS sales counter, customer billing, and shift cash handling');
    insertRole.run(4, 'Inventory Staff', 'Inward purchases, batch tracking, stock adjustments, and expiry control');

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

    const allPerms = db.prepare('SELECT id, code FROM permissions').all() as { id: number; code: string }[];
    const permMap = new Map(allPerms.map(p => [p.code, p.id]));

    for (const p of allPerms) {
      insertRolePermission.run(1, p.id);
    }

    const pharmaCodes = ['view_sales', 'create_sales', 'return_sales', 'view_purchases', 'manage_inventory', 'manage_medicines', 'manage_patients', 'use_drug_ai'];
    for (const code of pharmaCodes) {
      const pId = permMap.get(code);
      if (pId) insertRolePermission.run(2, pId);
    }

    const cashierCodes = ['view_sales', 'create_sales', 'manage_patients'];
    for (const code of cashierCodes) {
      const pId = permMap.get(code);
      if (pId) insertRolePermission.run(3, pId);
    }

    const invCodes = ['view_purchases', 'create_purchases', 'manage_inventory', 'adjust_stock', 'manage_medicines', 'manage_suppliers'];
    for (const code of invCodes) {
      const pId = permMap.get(code);
      if (pId) insertRolePermission.run(4, pId);
    }

    const saltRounds = 10;
    const adminPass = bcrypt.hashSync('admin123', saltRounds);
    const pharmaPass = bcrypt.hashSync('pharma123', saltRounds);
    const cashPass = bcrypt.hashSync('cash123', saltRounds);
    const invPass = bcrypt.hashSync('inv123', saltRounds);

    insertUser.run(1, 'admin', 'bn73147@gmail.com', adminPass, 'Dr. Naveed (Chief Pharmacist/Admin)', 1, '0300-1112233');
    insertUser.run(2, 'pharmacist', 'pharma@nmp.local', pharmaPass, 'Farhan Ali (Pharmacist)', 2, '0301-2223344');
    insertUser.run(3, 'cashier', 'cashier@nmp.local', cashPass, 'Zainab Bibi (Billing Cashier)', 3, '0302-3334455');
    insertUser.run(4, 'inventory', 'inventory@nmp.local', invPass, 'Tariq Mehmood (Store Incharge)', 4, '0303-4445566');

    const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)');
    insertSetting.run('pharmacy_name', 'Naveed Medical Pharmacy (NMP)', 'Store legal brand name');
    insertSetting.run('pharmacy_address', '31 32 chowk chohan road outfall, near tariq pan shop, Islampura, Lahore, 54000', 'Store physical address');
    insertSetting.run('pharmacy_phone', '03454142863', 'Contact phone numbers');
    insertSetting.run('currency_symbol', 'Rs.', 'Default currency notation');
    insertSetting.run('tax_rate_percent', '0', 'Default sales tax percentage (if applicable)');
    insertSetting.run('receipt_footer', 'Thank you for choosing NMP. Get well soon! Keep medicines below 30°C.', 'Thermal receipt footer');
    insertSetting.run('near_expiry_threshold_days', '90', 'Default near expiry alert window in days');
    insertSetting.run('low_stock_threshold_default', '15', 'Default minimum stock count before alert');

    // Main Category master list (product type, NOT therapeutic class - see medicines.therapeutic_class)
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, description, sort_order) VALUES (?, ?, ?)');
    const MAIN_CATEGORIES: Array<[string, string]> = [
      ['Tablets', 'Regular, Chewable, Dispersible, Effervescent, Sublingual, Buccal, Enteric-Coated, Sustained/Extended Release'],
      ['Capsules', 'Hard Gelatin, Softgel, Enteric-Coated, Modified/Extended Release'],
      ['Syrups & Oral Liquids', 'Syrup, Suspension, Oral Solution, Dry Syrup, Drops, Elixir, Linctus'],
      ['Sachets & Powders', 'Sachet, Granules, ORS, Electrolyte Powder, Medicinal Powder'],
      ['Injections', 'Ampoule, Vial, Prefilled Syringe, Powder for Injection, IM, IV, SC'],
      ['IV Fluids', 'Normal Saline, Dextrose, Ringer Lactate, DNS, Dextrose-Saline, Mannitol, other IV solutions'],
      ['Eye Products', 'Eye Drops, Eye Ointment, Eye Gel, Artificial Tears'],
      ['Ear Products', 'Ear Drops, Ear Solutions'],
      ['Nasal Products', 'Nasal Drops, Nasal Spray, Saline Spray'],
      ['Oral / Throat Products', 'Mouthwash, Gargle, Throat Spray, Lozenges, Oral Gel'],
      ['Topical Medicines', 'Cream, Ointment, Gel, Lotion, Paste, Powder, Solution, Liniment'],
      ['Sprays', 'Throat Spray, Nasal Spray, Skin Spray, Antiseptic Spray, Pain Spray'],
      ['Inhalation & Respiratory', 'Inhaler, Rotacap, Nebule/Respule, Nebulizer Solution, Spacer'],
      ['Suppositories & Rectal', 'Suppository, Enema, Rectal Cream/Ointment'],
      ['Vaginal / Gynaecology', 'Vaginal Tablet, Pessary, Vaginal Cream/Gel, Vaginal Wash'],
      ['Milk & Infant Formula', 'Stage 1, Stage 2, Stage 3/Growing-Up Milk, Premature/Special Formula, Lactose-Free'],
      ['Nutrition & Supplements', 'Multivitamins, Minerals, Calcium, Iron, Vitamin D, Protein, Nutritional Drinks, Pregnancy Supplements'],
      ['Baby Care', 'Feeding Bottles, Nipples/Teats, Pacifiers, Baby Lotion, Baby Oil, Baby Shampoo, Baby Soap, Baby Powder'],
      ['Diapers / Pampers', 'Newborn, Small, Medium, Large, XL, XXL, Pants, Adult Diapers'],
      ['Cosmetics & Beauty', 'Face Cream, Moisturizer, Cleanser, Face Wash, Bleach, Facial Kit, Face Mask, Serum, Scrub, Makeup'],
      ['Skin Care / Dermocosmetics', 'Sunscreen, Acne Care, Whitening/Brightening, Anti-Aging, Dry-Skin Care, Lip Care'],
      ['Hair Care', 'Shampoo, Conditioner, Hair Oil, Hair Serum, Hair Color/Dye, Hair Treatment'],
      ['Personal Hygiene', 'Soap, Handwash, Sanitizer, Body Wash, Deodorant, Talcum Powder'],
      ['Feminine Hygiene', 'Sanitary Pads, Panty Liners, Intimate Wash, Maternity Pads'],
      ['Dental / Oral Care', 'Toothpaste, Toothbrush, Mouthwash, Dental Floss, Denture Products, Oral Gel'],
      ['Contraceptive / Family Planning', 'Condoms, Pregnancy Tests, Ovulation Tests'],
      ['Syringes & Needles', '1 mL, 2/3 mL, 5 mL, 10 mL, 20 mL, 50/60 mL, Insulin Syringe, Needle'],
      ['IV Administration', 'IV Set, Blood Set, Burette Set, Extension Line, Three-Way Stopcock'],
      ['IV Cannulas', '14G, 16G, 18G, 20G, 22G, 24G, 26G'],
      ['Catheters & Tubes', "Foley Catheter, Nelaton Catheter, NG/Ryle's Tube, Feeding Tube, Suction Catheter"],
      ['Wound Care / Dressing', 'Cotton, Gauze, Bandage, Crepe Bandage, Surgical Tape, Dressing Pad, Plaster, Sterile Dressing'],
      ['Surgical & Disposable', 'Gloves, Masks, Surgical Caps, Shoe Covers, Disposable Gowns, Examination Sheets'],
      ['Antiseptics & Disinfectants', 'Spirit, Povidone-Iodine, Chlorhexidine, Hydrogen Peroxide, Surface Disinfectant'],
      ['Medical Devices', 'BP Monitor, Glucometer, Thermometer, Pulse Oximeter, Nebulizer'],
      ['Diabetes Care', 'Glucometer Strips, Lancets, Insulin Pen, Pen Needles, Insulin Syringes'],
      ['Orthopedic / Support', 'Knee Support, Ankle Support, Wrist Support, Cervical Collar, Lumbar Belt'],
      ['First Aid', 'First-Aid Kit, Hot/Cold Pack, Burn Dressing, Emergency Supplies'],
      ['Sexual Wellness', 'Lubricants, Pregnancy/Fertility Testing Products'],
      ['Herbal / Unani', 'Herbal Tablets/Capsules, Syrups, Oils, Powders, Herbal Supplements'],
      ['General / FMCG', 'Water, Beverages, Snacks, Tissues and other non-pharmacy retail products']
    ];
    MAIN_CATEGORIES.forEach(([name, description], idx) => {
      insertCategory.run(name, description, idx + 1);
    });

    const insertMfg = db.prepare('INSERT OR IGNORE INTO manufacturers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)');
    insertMfg.run('GSK Pakistan', 'Tariq Javed', '021-3456789', 'orders@gsk.pk', 'Karachi, Pakistan');
    insertMfg.run('Getz Pharma', 'Imran Khan', '021-3245678', 'sales@getz.pk', 'Korangi, Karachi');
    insertMfg.run('Abbott Laboratories', 'Shahid Raza', '021-3987654', 'supply@abbott.pk', 'Landhi, Karachi');
    insertMfg.run('Searle Company', 'Adnan Malik', '021-3554433', 'info@searle.pk', 'SITE, Karachi');
    insertMfg.run('Pfizer Pakistan', 'Salman Qureshi', '021-3889900', 'orders@pfizer.pk', 'Karachi, Pakistan');
    insertMfg.run('Sami Pharmaceuticals', 'Kamran Sheikh', '021-3667788', 'sales@samipharm.pk', 'Karachi, Pakistan');
    insertMfg.run('Hilton Pharma', 'Naveed Akhtar', '021-3778899', 'info@hiltonpharma.pk', 'Karachi, Pakistan');
    insertMfg.run('Ferozsons Laboratories', 'Zulfiqar Ali', '042-3556677', 'orders@ferozsons-labs.pk', 'Nowshera / Lahore');

    const getCatId = (name: string) => {
      const row = db.prepare('SELECT id FROM categories WHERE name LIKE ?').get(`%${name}%`) as any;
      return row ? row.id : 1;
    };

    const getMfgId = (name: string) => {
      const row = db.prepare('SELECT id FROM manufacturers WHERE name LIKE ?').get(`%${name}%`) as any;
      return row ? row.id : 1;
    };

    const insertSupplier = db.prepare(`
      INSERT OR IGNORE INTO suppliers (name, contact_person, phone, email, address, opening_balance, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertSupplier.run('Ali Brothers Pharma Distributors', 'Haji Munir', '0321-7788990', 'alibrothers@distrib.pk', 'Circular Road, Lahore', 0, 15400.0);
    insertSupplier.run('Shaheen Medical Agency', 'Bilal Ahmed', '0333-6655443', 'shaheen@medagency.pk', 'Katchery Road, Gujranwala', 0, 0.0);
    insertSupplier.run('Prime Health Logistics', 'Kashif Mehmood', '0300-8899112', 'prime@healthlog.pk', 'Multan Road, Lahore', 0, 8500.0);

    const insertGeneric = db.prepare(`
      INSERT INTO generics (name, therapeutic_class, description)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        therapeutic_class = excluded.therapeutic_class,
        description = excluded.description
    `);

    const drugCatalog = [
      { name: 'Naproxen Sodium', class: 'NSAID / Anti-Inflammatory', desc: 'Non-steroidal anti-inflammatory drug with lowest cardiovascular risk profile. High-potency analgesic for acute musculoskeletal pain, arthritis, dysmenorrhea, and gout.' },
      { name: 'Aceclofenac', class: 'NSAID / Anti-Inflammatory', desc: 'Selective COX-2 preferential inhibitor for symptomatic treatment of osteoarthritis, rheumatoid arthritis, and ankylosing spondylitis.' },
      { name: 'Paracetamol', class: 'Analgesic / Antipyretic', desc: 'Standard first-line antipyretic and analgesic for mild-to-moderate pain and fever.' },
      { name: 'Amoxicillin + Clavulanic Acid', class: 'Broad-spectrum Penicillin', desc: 'Beta-lactam antibacterial combined with beta-lactamase inhibitor.' },
      { name: 'Omeprazole', class: 'Proton Pump Inhibitor (PPI)', desc: 'Gastric acid suppression for peptic ulcer, GERD, and NSAID prophylaxis.' },
      { name: 'Amlodipine', class: 'Calcium Channel Blocker', desc: 'Dihydropyridine CCB for essential hypertension and chronic angina.' },
      { name: 'Metformin HCl', class: 'Biguanide Antidiabetic', desc: 'First-line oral antidiabetic improving insulin sensitivity and reducing gluconeogenesis.' },
      { name: 'Ondansetron', class: '5-HT3 Receptor Antagonist', desc: 'Selective serotonin antagonist for post-operative, chemotherapy, and radiation nausea.' },
      { name: 'Azithromycin', class: 'Macrolide Antibiotic', desc: 'Extended half-life macrolide for respiratory, soft tissue, and genital infections.' },
      { name: 'Ibuprofen', class: 'NSAID / Anti-Inflammatory', desc: 'Non-steroidal anti-inflammatory agent for musculoskeletal pain and inflammation.' },
      { name: 'Losartan Potassium', class: 'Angiotensin II Receptor Blocker', desc: 'ARB for hypertension, heart failure, and renal protection in diabetes.' },
      { name: 'Ciprofloxacin', class: 'Fluoroquinolone Antibiotic', desc: 'Broad-spectrum fluoroquinolone active against Gram-negative bacteria and Pseudomonas.' },
      { name: 'Ceftriaxone', class: 'Cephalosporin (3rd Gen)', desc: 'Broad-spectrum parenteral third-generation cephalosporin for severe infections.' },
      { name: 'Atorvastatin', class: 'HMG-CoA Reductase Inhibitor', desc: 'Potent statin for hypercholesterolemia and cardiovascular risk reduction.' },
      { name: 'Montelukast', class: 'Leukotriene Receptor Antagonist', desc: 'Oral controller medication for chronic bronchial asthma and allergic rhinitis.' },
      { name: 'Cetirizine', class: 'Second-Generation Antihistamine', desc: 'Non-sedating selective peripheral H1 receptor blocker for allergies and urticaria.' },
      { name: 'Diazepam', class: 'CNS & Psychiatry', desc: 'Long-acting benzodiazepine for anxiety, muscle spasm, seizures, and acute alcohol withdrawal.' },
      { name: '5-Fluorouracil', class: 'Oncology & Antineoplastics', desc: 'Pyrimidine analog antimetabolite chemotherapy for gastrointestinal and breast cancers.' }
    ];

    for (const d of drugCatalog) {
      insertGeneric.run(d.name, d.class, d.desc);
    }

    const getGenId = (genName: string) => {
      const row = db.prepare('SELECT id FROM generics WHERE name = ?').get(genName) as any;
      return row ? row.id : 1;
    };

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

    insertClinical.run(
      getGenId('Naproxen Sodium'), 'M01AE02', 'Rx/OTC', 'NSAID / Propionic Acid Derivative', 'Pakistan (DRAP), USA (FDA), UK (BNF), Global',
      'C', 'Category C prior to 20 weeks; Category D starting at 20 weeks gestational age (oligohydramnios and premature ductus arteriosus closure).', 'Excreted in small amounts in breast milk; compatible with breastfeeding.',
      '275mg to 550mg PO every 12 hours as needed (or 550mg initially followed by 275mg every 6-8 hours; Max: 1375mg/day).',
      '10mg/kg/day PO divided into 2 doses for juvenile idiopathic arthritis in children >= 2 years.',
      'Safety and efficacy not established in neonates.',
      'Initiate with lowest effective dose (275mg BID); increased risk of GI hemorrhage and renal impairment.',
      '10mg/kg/day in 2 divided doses for pediatric arthritis.',
      'Avoid in severe renal impairment (eGFR < 30 mL/min). Monitor renal and hepatic parameters during prolonged therapy.',
      'Not dialyzable due to high protein binding (> 99%).',
      'Acute musculoskeletal pain, rheumatoid arthritis, osteoarthritis, ankylosing spondylitis, tendonitis, bursitis, acute gout, primary dysmenorrhea.',
      'Migraine headache treatment and prophylaxis, fever, post-operative dental pain.',
      'Paget disease of bone, heterotopic ossification prophylaxis.',
      'Reversibly inhibits cyclooxygenase-1 and 2 (COX-1 and COX-2) enzymes, blocking conversion of arachidonic acid to inflammatory prostaglandins.',
      'Rapid and completely absorbed from GI tract; extensive hepatic metabolism via CYP2C9 and CYP1A2.',
      'Oral Bioavailability: 95%. Peak plasma concentration: 1-2 hours.',
      'Protein Binding: > 99%. Volume of distribution: 0.16 L/kg.',
      'Extensively metabolized in liver by CYP2C9 and CYP1A2 to 6-O-desmethylnaproxen.',
      'Elimination Half-life: 12-17 hours (permits twice-daily dosing). Renal excretion: 95%.',
      'Onset: 30-60 minutes for analgesia. Peak: 1-2 hours. Duration: 12 hours.',
      'Hypersensitivity to naproxen, aspirin, or other NSAIDs; CABG surgery setting; active gastrointestinal bleeding or peptic ulcer disease.',
      'Hypertension, congestive heart failure, chronic kidney disease, cirrhosis, history of GI bleed.',
      'Boxed Warning: Cardiovascular Risk (MI, Stroke) and Gastrointestinal Risk (Bleeding, Ulceration, Perforation). Naproxen has lowest cardiovascular risk among non-selective NSAIDs.',
      'Renal toxicity including papillary necrosis and acute interstitial nephritis with long-term use.',
      'Fluid retention and edema; can worsen pre-existing heart failure.',
      'Baseline and periodic CBC, renal function (BUN/Creatinine), blood pressure, and occult fecal blood.',
      'Dyspepsia, heartburn, nausea, abdominal pain, headache, dizziness, edema.',
      'GI bleeding, peptic ulcer, acute renal failure, severe cutaneous adverse reactions (SJS/TEN).',
      'Anaphylaxis, fatal GI perforation, Stevens-Johnson syndrome.',
      'Take with food or milk to minimize gastrointestinal discomfort. Avoid concurrent alcohol.',
      'Peptic ulcer disease, hypertension, heart failure, renal insufficiency, aspirin-sensitive asthma.',
      'Elderly, patients with cardiovascular risk factors, third trimester of pregnancy.',
      'SYN 550', 'Oval', 'Blue',
      'Blood pressure, Serum Creatinine, BUN, Complete Blood Count, LFTs.',
      'Take with a full glass of water, with or after food. Do not lie down for 15 minutes after taking.',
      'Store at 20-25°C. Protect from light and excessive moisture.',
      'Take with food or milk to avoid upset stomach. Stop taking and call your doctor immediately if you experience dark/black stools, persistent stomach pain, or chest pain.',
      'Lowest CV risk profile among traditional NSAIDs (ADAPT trial). Take low-dose cardioprotective aspirin 30-60 minutes prior to naproxen.',
      'USP-NF / DailyMed / BNF 86 Reference', 'v2026.1', '2026-09-01'
    );

    insertClinical.run(
      getGenId('Aceclofenac'), 'M01AE16', 'Rx', 'NSAID / Phenylacetic Acid Derivative', 'Pakistan (DRAP), UK, EU, Asia',
      'C', 'Avoid in pregnancy, particularly in third trimester (risk of premature closure of fetal ductus arteriosus).', 'Avoid during breastfeeding unless essential.',
      '100mg PO every 12 hours (morning and evening with food; Max: 200mg/day).',
      'Not recommended for children < 18 years.',
      'Contraindicated in neonates.',
      'No initial dose adjustment; start with lowest effective dose.',
      'Standard adult dosing only.',
      'Start at 100mg once daily in mild-to-moderate hepatic impairment. Avoid in severe renal or hepatic failure.',
      'Not dialyzable.',
      'Osteoarthritis, rheumatoid arthritis, ankylosing spondylitis, acute lumbago, dental pain, post-traumatic pain.',
      'Dysmenorrhea, acute musculoskeletal sprain and strain.',
      'Gouty arthritis adjunct.',
      'Potently inhibits cyclooxygenase (COX) enzyme with preferential selectivity for COX-2, reducing prostaglandin synthesis while demonstrating superior gastric tolerability compared to conventional diclofenac.',
      'Rapidly and completely absorbed from gastrointestinal tract; metabolized in liver.',
      'Oral Bioavailability: Close to 100%. Peak plasma level: 1.5 - 3 hours.',
      'Protein Binding: > 99%. Volume of distribution: ~25 L.',
      'Metabolized in liver via CYP2C9 to 4-hydroxyaceclofenac.',
      'Elimination Half-life: 4-4.5 hours. Excreted mainly through kidneys (70-80%).',
      'Onset: 30 minutes. Peak: 1.5-3 hours. Duration: 12 hours.',
      'Active peptic ulcer or GI bleeding; hypersensitivity to aceclofenac, diclofenac, or aspirin; severe heart failure; severe renal/hepatic impairment.',
      'Hypertension, mild-to-moderate heart failure, ulcerative colitis, Crohn disease.',
      'Cardiovascular & GI Risk Warning: Potential for increased thrombotic events and gastrointestinal ulceration.',
      'Hepatic transaminase elevation reported in rare cases; monitor LFTs in prolonged treatment.',
      'May trigger bronchospasm in patients with bronchial asthma or allergic disease.',
      'LFTs (AST/ALT), renal function, CBC with differential.',
      'Dyspepsia, abdominal pain, nausea, diarrhea, dizziness, pruritus.',
      'GI hemorrhage, peptic ulcer, severe nephrotoxicity, hepatic necrosis.',
      'Stevens-Johnson syndrome, anaphylactoid reaction.',
      'Take preferably with or after food to minimize gastrointestinal discomfort.',
      'Peptic ulcer disease, ischemic heart disease, peripheral arterial disease, cerebrovascular disease.',
      'Elderly patients, patients with cardiovascular risk factors.',
      'ACE 100', 'Round', 'White',
      'Blood pressure, Serum Creatinine, Liver Function Tests.',
      'Swallow tablets whole with water. Do not crush or chew. Take with or after meals.',
      'Store below 30°C in a dry place.',
      'Take this medicine after meals. Report any stomach pain, nausea, or dark-colored stools to your pharmacist.',
      'Superior gastrointestinal safety profile compared to diclofenac due to preferential COX-2 inhibition and minimal suppression of gastric mucosal PGE2.',
      'DRAP / BNF 86 / MHRA Reference', 'v2026.1', '2026-09-01'
    );

    insertClinical.run(
      getGenId('Paracetamol'), 'N02BE01', 'OTC', 'Analgesic / Antipyretic', 'Global (PK, US, UK, EU, JP)',
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
      'Overdose Warning: Doses > 4g/day cause fatal acute liver necrosis. N-acetylcysteine antidote required within 8 hours.',
      'Hepatotoxicity risk in malnourished or chronic alcoholic patients.',
      'Avoid concurrent paracetamol-containing combination products to prevent accidental overdose.',
      'Monitor liver function tests (LFTs) if therapy exceeds 10 consecutive days.',
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

    const insertMedicine = db.prepare(`
      INSERT INTO medicines (
        id, brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form, pack_size,
        barcode, custom_barcode, rack_location, min_stock_level, reorder_level, is_prescription_required, notes, therapeutic_class
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        brand_name = excluded.brand_name,
        generic_id = excluded.generic_id,
        category_id = excluded.category_id,
        manufacturer_id = excluded.manufacturer_id,
        strength = excluded.strength,
        dosage_form = excluded.dosage_form,
        pack_size = excluded.pack_size,
        barcode = excluded.barcode,
        custom_barcode = excluded.custom_barcode,
        rack_location = excluded.rack_location
    `);

    const pdfMeds = [
      { id: 1, brand: 'Glucophage 250mg', generic: 'Metformin HCl', mfg: 'Merck', strength: '250mg', form: 'Tablet', cat: 'Tablets', pack: 50, price: 4.50, cost: 3.50, barcode: '896400000001', rack: 'Rack D-1' },
      { id: 2, brand: 'Glucophage 500mg', generic: 'Metformin HCl', mfg: 'Merck', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 50, price: 7.00, cost: 5.50, barcode: '896400000002', rack: 'Rack D-1' },
      { id: 3, brand: 'Glucophage XR 500mg', generic: 'Metformin HCl ER', mfg: 'Merck', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 9.50, cost: 7.50, barcode: '896400000003', rack: 'Rack D-1' },
      { id: 4, brand: 'Glucophage XR 750mg', generic: 'Metformin HCl ER', mfg: 'Merck', strength: '750mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 12.00, cost: 9.50, barcode: '896400000004', rack: 'Rack D-1' },
      { id: 5, brand: 'Glucophage XR 1000mg', generic: 'Metformin HCl ER', mfg: 'Merck', strength: '1000mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 15.00, cost: 12.00, barcode: '896400000005', rack: 'Rack D-1' },
      { id: 6, brand: 'Glucovance 500/2.5mg', generic: 'Metformin + Glibenclamide', mfg: 'Merck', strength: '500mg/2.5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 8.50, cost: 6.80, barcode: '896400000006', rack: 'Rack D-2' },
      { id: 7, brand: 'Glucovance 500/5mg', generic: 'Metformin + Glibenclamide', mfg: 'Merck', strength: '500mg/5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 10.00, cost: 8.00, barcode: '896400000007', rack: 'Rack D-2' },
      { id: 8, brand: 'Sitaphage XR 50/500mg', generic: 'Sitagliptin + Metformin XR', mfg: 'Merck', strength: '50mg + 500mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 22.00, cost: 17.50, barcode: '896400000008', rack: 'Rack D-2' },
      { id: 9, brand: 'Concor 2.5mg', generic: 'Bisoprolol fumarate', mfg: 'Merck', strength: '2.5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 11.00, cost: 8.80, barcode: '896400000009', rack: 'Rack C-1' },
      { id: 10, brand: 'Concor 5mg', generic: 'Bisoprolol fumarate', mfg: 'Merck', strength: '5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 16.00, cost: 12.80, barcode: '896400000010', rack: 'Rack C-1' },
      { id: 11, brand: 'Concor 10mg', generic: 'Bisoprolol fumarate', mfg: 'Merck', strength: '10mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 24.00, cost: 19.00, barcode: '896400000011', rack: 'Rack C-1' },
      { id: 12, brand: 'Lodopin 2.5mg', generic: 'Amlodipine', mfg: 'Searle', strength: '2.5mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 6.00, cost: 4.80, barcode: '896400000012', rack: 'Rack C-2' },
      { id: 13, brand: 'Lodopin 5mg', generic: 'Amlodipine', mfg: 'Searle', strength: '5mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 9.50, cost: 7.50, barcode: '896400000013', rack: 'Rack C-2' },
      { id: 14, brand: 'Lodopin 10mg', generic: 'Amlodipine', mfg: 'Searle', strength: '10mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 15.00, cost: 12.00, barcode: '896400000014', rack: 'Rack C-2' },
      { id: 15, brand: 'Lodopin-V 5/80mg', generic: 'Amlodipine + Valsartan', mfg: 'Searle', strength: '5mg/80mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 18.00, cost: 14.50, barcode: '896400000015', rack: 'Rack C-3' },
      { id: 16, brand: 'Lodopin-V HCT 5/160/12.5mg', generic: 'Amlodipine + Valsartan + HCTZ', mfg: 'Searle', strength: '5/160/12.5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 25.00, cost: 20.00, barcode: '896400000016', rack: 'Rack C-3' },
      { id: 17, brand: 'Lodopin-V HCT 10/160/12.5mg', generic: 'Amlodipine + Valsartan + HCTZ', mfg: 'Searle', strength: '10/160/12.5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 29.00, cost: 23.20, barcode: '896400000017', rack: 'Rack C-3' },
      { id: 18, brand: 'Teril 200mg', generic: 'Carbamazepine', mfg: 'Searle', strength: '200mg', form: 'Tablet', cat: 'Tablets', pack: 50, price: 5.50, cost: 4.20, barcode: '896400000018', rack: 'Rack B-1' },
      { id: 19, brand: 'Azolam 0.5mg', generic: 'Alprazolam', mfg: 'Getz', strength: '0.5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 4.00, cost: 3.10, barcode: '896400000019', rack: 'Rack B-2' },
      { id: 20, brand: 'Librax 5/2.5mg', generic: 'Chlordiazepoxide + Clidinium bromide', mfg: 'Getz', strength: '5mg + 2.5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 6.50, cost: 5.20, barcode: '896400000020', rack: 'Rack B-3' },
      { id: 21, brand: 'Lexotanil 3mg', generic: 'Bromazepam', mfg: 'Abbott', strength: '3mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 8.00, cost: 6.40, barcode: '896400000021', rack: 'Rack B-4' },
      { id: 22, brand: 'Neuromet 1000mcg', generic: 'Mecobalamin / Methylcobalamin', mfg: 'Hilton', strength: '1000mcg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 14.00, cost: 11.20, barcode: '896400000022', rack: 'Rack E-1' },
      { id: 23, brand: 'Synflex 550mg', generic: 'Naproxen sodium', mfg: 'Searle', strength: '550mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 21.00, cost: 16.80, barcode: '896400000023', rack: 'Rack A-1' },
      { id: 24, brand: 'Synflex-M 85/500mg', generic: 'Sumatriptan + Naproxen sodium', mfg: 'Searle', strength: '85mg + 500mg', form: 'Tablet', cat: 'Tablets', pack: 10, price: 45.00, cost: 36.00, barcode: '896400000024', rack: 'Rack A-1' },
      { id: 25, brand: 'Proxen 250mg', generic: 'Naproxen', mfg: 'Searle', strength: '250mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 9.00, cost: 7.20, barcode: '896400000025', rack: 'Rack A-2' },
      { id: 26, brand: 'Proxen 500mg', generic: 'Naproxen', mfg: 'Searle', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 16.00, cost: 12.80, barcode: '896400000026', rack: 'Rack A-2' },
      { id: 27, brand: 'Neoprox 250mg', generic: 'Naproxen', mfg: 'Searle', strength: '250mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 8.50, cost: 6.80, barcode: '896400000027', rack: 'Rack A-3' },
      { id: 28, brand: 'Neoprox 500mg', generic: 'Naproxen', mfg: 'Searle', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 15.00, cost: 12.00, barcode: '896400000028', rack: 'Rack A-3' },
      { id: 29, brand: 'Naprosyn 500mg', generic: 'Naproxen', mfg: 'Searle', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 18.00, cost: 14.40, barcode: '896400000029', rack: 'Rack A-4' },
      { id: 30, brand: 'Enflor 250mg Sachet', generic: 'Saccharomyces boulardii CNCM I-745', mfg: 'GSK', strength: '250mg', form: 'Sachet', cat: 'Sachets & Powders', pack: 10, price: 35.00, cost: 28.00, barcode: '896400000030', rack: 'Rack F-1' },
      { id: 31, brand: 'Wintogeno Balm 12.17%', generic: 'Methyl salicylate', mfg: 'GSK', strength: '12.17% w/w', form: 'Cream', cat: 'Topical Medicines', pack: 1, price: 120.00, cost: 95.00, barcode: '896400000031', rack: 'Rack G-1' },
      { id: 32, brand: 'Depex Capsule', generic: 'Unconfirmed Formula (Depex)', mfg: 'GSK', strength: 'Capsule', form: 'Capsule', cat: 'Capsules', pack: 20, price: 12.00, cost: 9.60, barcode: '896400000032', rack: 'Rack G-2' }
    ];

    pdfMeds.forEach(m => {
      insertMedicine.run(
        m.id,
        m.brand,
        getGenId(m.generic),
        getCatId(m.cat),
        getMfgId(m.mfg),
        m.strength,
        m.form,
        m.pack,
        m.barcode,
        `MED-PDF-${String(m.id).padStart(3, '0')}`,
        m.rack,
        20,
        40,
        1,
        'Pharmacy Medicines List PDF Item',
        drugCatalog.find(g => g.name === m.generic)?.class || 'General'
      );
    });

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

    pdfMeds.forEach(m => {
      insertBatch.run(
        m.id,
        m.id,
        `BTH-PDF-${String(m.id).padStart(3, '0')}`,
        '2025-01-01',
        '2028-06-30',
        m.cost,
        m.price,
        300,
        0,
        1,
        m.rack,
        'ACTIVE'
      );
    });

    const insertCust = db.prepare(`
      INSERT INTO customers (id, name, mobile, age, gender, allergy_notes, credit_limit, current_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        current_balance = excluded.current_balance,
        credit_limit = excluded.credit_limit
    `);
    insertCust.run(1, 'Muhammad Usman', '0312-9988776', 42, 'MALE', 'Penicillin allergy (caution with Augmentin)', 5000.0, 1200.0);
    insertCust.run(2, 'Amina Bibi', '0345-1122334', 68, 'FEMALE', 'None documented', 10000.0, 0.0);

    const insertDDI = db.prepare(`
      INSERT OR IGNORE INTO drug_interactions (
        generic_a_id, generic_b_id, severity, effect, management, evidence_level
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertDDI.run(getGenId('Omeprazole'), getGenId('Amlodipine'), 'MODERATE', 'Omeprazole may reduce hepatic clearance of Amlodipine via CYP3A4 pathway resulting in enhanced hypotensive effect.', 'Monitor blood pressure regularly upon initiation or dose adjustment.', 'ESTABLISHED');
    insertDDI.run(getGenId('Amlodipine'), getGenId('Metformin HCl'), 'MINOR', 'Calcium channel blockers may occasionally impair glucose tolerance.', 'Monitor blood glucose levels in diabetic patients initiating therapy.', 'THEORETICAL');
    insertDDI.run(getGenId('Paracetamol'), getGenId('Metformin HCl'), 'MINOR', 'Paracetamol in high doses may alter glycemic response slightly.', 'Standard glucose monitoring is adequate.', 'THEORETICAL');
    insertDDI.run(getGenId('Amoxicillin + Clavulanic Acid'), getGenId('Metformin HCl'), 'MINOR', 'Amoxicillin + Clavulanate may cause transient GI distress altering metformin absorption.', 'Take both with meals.', 'INFORMATIONAL');
    insertDDI.run(getGenId('Ciprofloxacin'), getGenId('Ondansetron'), 'MAJOR', 'Both ciprofloxacin and ondansetron prolong the QTc interval. Concurrent use may increase the risk of serious ventricular arrhythmias including Torsades de Pointes.', 'Avoid combination if possible. If concurrent use is necessary, obtain baseline ECG and monitor serum potassium and magnesium.', 'ESTABLISHED');
    insertDDI.run(getGenId('Atorvastatin'), getGenId('Azithromycin'), 'MODERATE', 'Macrolides can inhibit CYP3A4 metabolism of statins, elevating serum statin levels and increasing the risk of myopathy or rhabdomyolysis.', 'Use lowest effective statin dose or temporarily withhold atorvastatin during short-course azithromycin therapy.', 'ESTABLISHED');
    insertDDI.run(getGenId('Ibuprofen'), getGenId('Losartan Potassium'), 'MAJOR', 'Concurrent NSAID use attenuates antihypertensive effect of ARBs and significantly increases the risk of severe acute renal impairment, especially in dehydrated or elderly patients.', 'Monitor blood pressure and serum creatinine closely. Ensure adequate hydration. Consider paracetamol for analgesia.', 'ESTABLISHED');
    insertDDI.run(getGenId('Naproxen Sodium'), getGenId('Losartan Potassium'), 'MAJOR', 'Concurrent use of naproxen with losartan attenuates antihypertensive response and significantly increases risk of acute renal dysfunction.', 'Monitor blood pressure and serum creatinine. Maintain adequate hydration.', 'ESTABLISHED');
    insertDDI.run(getGenId('Ciprofloxacin'), getGenId('Ibuprofen'), 'MAJOR', 'Co-administration of fluoroquinolones with NSAIDs increases the risk of CNS stimulation and convulsive seizures.', 'Avoid combination in patients with history of seizures or epilepsy. Instruct patient to report any CNS tremors or dizziness immediately.', 'ESTABLISHED');
    insertDDI.run(getGenId('Ciprofloxacin'), getGenId('Naproxen Sodium'), 'MAJOR', 'Concurrent use of fluoroquinolones with naproxen increases risk of severe CNS excitation and seizures.', 'Avoid combination if alternatives exist. Instruct patient to report any central nervous symptoms.', 'ESTABLISHED');
  });

  seed();
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase();
}