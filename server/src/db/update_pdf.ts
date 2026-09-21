import { db } from './index.js';
import { exportSyncData } from '../services/dataSyncService.js';

console.log('Connected to database via server index...');

db.pragma('foreign_keys = OFF');

db.transaction(() => {
  console.log('Clearing old medicine & batch data...');
  const safeDelete = (sql: string) => {
    try { db.exec(sql); } catch (e) {}
  };

  safeDelete('DELETE FROM sale_items;');
  safeDelete('DELETE FROM purchase_items;');
  safeDelete('DELETE FROM stock_adjustments;');
  safeDelete('DELETE FROM stock_movements;');
  safeDelete('DELETE FROM prescription_items;');
  safeDelete('DELETE FROM medprac_visit_medicines;');
  safeDelete('DELETE FROM expiry_claim_items;');
  safeDelete('DELETE FROM user_pharma_favorites;');
  safeDelete('DELETE FROM user_pharma_notes;');
  safeDelete('DELETE FROM batches;');
  safeDelete('DELETE FROM medicines;');
  safeDelete('DELETE FROM generics;');
  safeDelete('DELETE FROM drug_clinical_info;');

  // Ensure Manufacturers
  const insertMfg = db.prepare('INSERT OR IGNORE INTO manufacturers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)');
  insertMfg.run('Merck', 'Sales Team', '021-11163725', 'orders@merck.pk', 'Karachi, Pakistan');
  insertMfg.run('Martin Dow', 'Distribution Incharge', '021-35060551', 'info@martindow.com', 'Karachi, Pakistan');
  insertMfg.run('Roche', 'Pharma Sales', '021-32560311', 'contact@roche.pk', 'Karachi, Pakistan');
  insertMfg.run('Biocodex / Martin Dow', 'Pharma Ops', '021-35060552', 'biocodex@martindow.com', 'Karachi, Pakistan');

  const getMfgId = (name: string) => {
    const row = db.prepare('SELECT id FROM manufacturers WHERE name LIKE ?').get(`%${name}%`) as any;
    return row ? row.id : 1;
  };

  const getCatId = (name: string) => {
    const row = db.prepare('SELECT id FROM categories WHERE name LIKE ?').get(`%${name}%`) as any;
    return row ? row.id : 1;
  };

  // Generics catalog from PDF
  const genericsList = [
    { name: 'Metformin HCl', class: 'Antidiabetic / Biguanide', desc: 'First-line oral antidiabetic medication for Type 2 Diabetes Mellitus.' },
    { name: 'Metformin HCl ER', class: 'Antidiabetic / Biguanide', desc: 'Extended-release formulation of Metformin for once-daily glycemic control.' },
    { name: 'Metformin + Glibenclamide', class: 'Antidiabetic / Biguanide + Sulfonylurea', desc: 'Dual-action combination for synergistic blood glucose lowering.' },
    { name: 'Sitagliptin + Metformin XR', class: 'Antidiabetic / DPP-4 inhibitor + Biguanide', desc: 'DPP-4 inhibitor combined with extended-release metformin.' },
    { name: 'Bisoprolol fumarate', class: 'Cardiovascular / Selective beta-1 blocker', desc: 'Cardioselective beta-blocker for hypertension, angina, and heart failure.' },
    { name: 'Amlodipine', class: 'Antihypertensive / DHP calcium-channel blocker', desc: 'Dihydropyridine CCB for essential hypertension and chronic stable angina.' },
    { name: 'Amlodipine + Valsartan', class: 'Antihypertensive / CCB + ARB', desc: 'Dual antihypertensive combining calcium channel blocker and angiotensin receptor blocker.' },
    { name: 'Amlodipine + Valsartan + HCTZ', class: 'Antihypertensive / CCB + ARB + Thiazide', desc: 'Triple-combination therapy for resistant essential hypertension.' },
    { name: 'Carbamazepine', class: 'Antiepileptic / Anticonvulsant', desc: 'Anticonvulsant for focal seizures, generalized tonic-clonic seizures, and trigeminal neuralgia.' },
    { name: 'Alprazolam', class: 'Anxiolytic / Benzodiazepine', desc: 'Short-acting benzodiazepine for acute anxiety and panic disorder.' },
    { name: 'Chlordiazepoxide + Clidinium bromide', class: 'GI antispasmodic / Benzodiazepine + Anticholinergic', desc: 'Combination for irritable bowel syndrome (IBS) and acute peptic ulcer anxiety.' },
    { name: 'Bromazepam', class: 'Anxiolytic / Benzodiazepine', desc: 'Intermediate-acting benzodiazepine for short-term anxiety management.' },
    { name: 'Mecobalamin / Methylcobalamin', class: 'Vitamin / Neuropathy therapy', desc: 'Active form of Vitamin B12 for peripheral neuropathy and megaloblastic anemia.' },
    { name: 'Naproxen sodium', class: 'Analgesic / Anti-inflammatory / NSAID', desc: 'Fast-acting NSAID for acute pain, musculoskeletal sprains, and inflammatory conditions.' },
    { name: 'Sumatriptan + Naproxen sodium', class: 'Antimigraine / Triptan + NSAID', desc: 'Combination triptan and NSAID for acute treatment of migraine with or without aura.' },
    { name: 'Naproxen', class: 'Analgesic / Anti-inflammatory / NSAID', desc: 'Non-steroidal anti-inflammatory drug for arthritis, dysmenorrhea, and acute gout.' },
    { name: 'Saccharomyces boulardii CNCM I-745', class: 'Antidiarrheal / Probiotic', desc: 'Probiotic yeast for prevention and treatment of acute diarrhea and antibiotic-associated diarrhea.' },
    { name: 'Methyl salicylate', class: 'Topical analgesic / Counterirritant', desc: 'Counterirritant topical application for relief of minor muscle aches and joint pain.' },
    { name: 'Unconfirmed Formula (Depex)', class: 'Unconfirmed', desc: 'Capsule formulation from photography catalog.' }
  ];

  const insertGen = db.prepare('INSERT OR REPLACE INTO generics (name, therapeutic_class, description) VALUES (?, ?, ?)');
  genericsList.forEach(g => insertGen.run(g.name, g.class, g.desc));

  const getGenId = (genName: string) => {
    const row = db.prepare('SELECT id FROM generics WHERE name = ?').get(genName) as any;
    return row ? row.id : 1;
  };

  // Medicines List from PDF (Items 1 to 21 with strength variants)
  const medicinesData = [
    // 1. Glucophage
    { brand: 'Glucophage 250mg', generic: 'Metformin HCl', mfg: 'Merck', strength: '250mg', form: 'Tablet', cat: 'Tablets', pack: 50, price: 4.50, cost: 3.50, barcode: '896400000001', rack: 'Rack D-1' },
    { brand: 'Glucophage 500mg', generic: 'Metformin HCl', mfg: 'Merck', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 50, price: 7.00, cost: 5.50, barcode: '896400000002', rack: 'Rack D-1' },
    
    // 2. Glucophage XR
    { brand: 'Glucophage XR 500mg', generic: 'Metformin HCl ER', mfg: 'Merck', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 9.50, cost: 7.50, barcode: '896400000003', rack: 'Rack D-1' },
    { brand: 'Glucophage XR 750mg', generic: 'Metformin HCl ER', mfg: 'Merck', strength: '750mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 12.00, cost: 9.50, barcode: '896400000004', rack: 'Rack D-1' },
    { brand: 'Glucophage XR 1000mg', generic: 'Metformin HCl ER', mfg: 'Merck', strength: '1000mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 15.00, cost: 12.00, barcode: '896400000005', rack: 'Rack D-1' },

    // 3. Glucovance
    { brand: 'Glucovance 500/2.5mg', generic: 'Metformin + Glibenclamide', mfg: 'Merck', strength: '500mg/2.5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 8.50, cost: 6.80, barcode: '896400000006', rack: 'Rack D-2' },
    { brand: 'Glucovance 500/5mg', generic: 'Metformin + Glibenclamide', mfg: 'Merck', strength: '500mg/5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 10.00, cost: 8.00, barcode: '896400000007', rack: 'Rack D-2' },

    // 4. Sitaphage XR
    { brand: 'Sitaphage XR 50/500mg', generic: 'Sitagliptin + Metformin XR', mfg: 'Merck', strength: '50mg + 500mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 22.00, cost: 17.50, barcode: '896400000008', rack: 'Rack D-2' },

    // 5. Concor
    { brand: 'Concor 2.5mg', generic: 'Bisoprolol fumarate', mfg: 'Merck', strength: '2.5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 11.00, cost: 8.80, barcode: '896400000009', rack: 'Rack C-1' },
    { brand: 'Concor 5mg', generic: 'Bisoprolol fumarate', mfg: 'Merck', strength: '5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 16.00, cost: 12.80, barcode: '896400000010', rack: 'Rack C-1' },
    { brand: 'Concor 10mg', generic: 'Bisoprolol fumarate', mfg: 'Merck', strength: '10mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 24.00, cost: 19.00, barcode: '896400000011', rack: 'Rack C-1' },

    // 6. Lodopin
    { brand: 'Lodopin 2.5mg', generic: 'Amlodipine', mfg: 'Martin Dow', strength: '2.5mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 6.00, cost: 4.80, barcode: '896400000012', rack: 'Rack C-2' },
    { brand: 'Lodopin 5mg', generic: 'Amlodipine', mfg: 'Martin Dow', strength: '5mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 9.50, cost: 7.50, barcode: '896400000013', rack: 'Rack C-2' },
    { brand: 'Lodopin 10mg', generic: 'Amlodipine', mfg: 'Martin Dow', strength: '10mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 15.00, cost: 12.00, barcode: '896400000014', rack: 'Rack C-2' },

    // 7. Lodopin-V
    { brand: 'Lodopin-V 5/80mg', generic: 'Amlodipine + Valsartan', mfg: 'Martin Dow', strength: '5mg/80mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 18.00, cost: 14.50, barcode: '896400000015', rack: 'Rack C-3' },

    // 8. Lodopin-V HCT
    { brand: 'Lodopin-V HCT 5/160/12.5mg', generic: 'Amlodipine + Valsartan + HCTZ', mfg: 'Martin Dow', strength: '5/160/12.5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 25.00, cost: 20.00, barcode: '896400000016', rack: 'Rack C-3' },
    { brand: 'Lodopin-V HCT 10/160/12.5mg', generic: 'Amlodipine + Valsartan + HCTZ', mfg: 'Martin Dow', strength: '10/160/12.5mg', form: 'Tablet', cat: 'Tablets', pack: 14, price: 29.00, cost: 23.20, barcode: '896400000017', rack: 'Rack C-3' },

    // 9. Teril
    { brand: 'Teril 200mg', generic: 'Carbamazepine', mfg: 'Martin Dow', strength: '200mg', form: 'Tablet', cat: 'Tablets', pack: 50, price: 5.50, cost: 4.20, barcode: '896400000018', rack: 'Rack B-1' },

    // 10. Azolam
    { brand: 'Azolam 0.5mg', generic: 'Alprazolam', mfg: 'Martin Dow', strength: '0.5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 4.00, cost: 3.10, barcode: '896400000019', rack: 'Rack B-2' },

    // 11. Librax
    { brand: 'Librax 5/2.5mg', generic: 'Chlordiazepoxide + Clidinium bromide', mfg: 'Martin Dow', strength: '5mg + 2.5mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 6.50, cost: 5.20, barcode: '896400000020', rack: 'Rack B-3' },

    // 12. Lexotanil 3
    { brand: 'Lexotanil 3mg', generic: 'Bromazepam', mfg: 'Roche', strength: '3mg', form: 'Tablet', cat: 'Tablets', pack: 30, price: 8.00, cost: 6.40, barcode: '896400000021', rack: 'Rack B-4' },

    // 13. Neuromet
    { brand: 'Neuromet 1000mcg', generic: 'Mecobalamin / Methylcobalamin', mfg: 'Martin Dow', strength: '1000mcg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 14.00, cost: 11.20, barcode: '896400000022', rack: 'Rack E-1' },

    // 14. Synflex
    { brand: 'Synflex 550mg', generic: 'Naproxen sodium', mfg: 'Martin Dow', strength: '550mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 21.00, cost: 16.80, barcode: '896400000023', rack: 'Rack A-1' },

    // 15. Synflex-M
    { brand: 'Synflex-M 85/500mg', generic: 'Sumatriptan + Naproxen sodium', mfg: 'Martin Dow', strength: '85mg + 500mg', form: 'Tablet', cat: 'Tablets', pack: 10, price: 45.00, cost: 36.00, barcode: '896400000024', rack: 'Rack A-1' },

    // 16. Proxen
    { brand: 'Proxen 250mg', generic: 'Naproxen', mfg: 'Martin Dow', strength: '250mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 9.00, cost: 7.20, barcode: '896400000025', rack: 'Rack A-2' },
    { brand: 'Proxen 500mg', generic: 'Naproxen', mfg: 'Martin Dow', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 16.00, cost: 12.80, barcode: '896400000026', rack: 'Rack A-2' },

    // 17. Neoprox
    { brand: 'Neoprox 250mg', generic: 'Naproxen', mfg: 'Martin Dow', strength: '250mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 8.50, cost: 6.80, barcode: '896400000027', rack: 'Rack A-3' },
    { brand: 'Neoprox 500mg', generic: 'Naproxen', mfg: 'Martin Dow', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 15.00, cost: 12.00, barcode: '896400000028', rack: 'Rack A-3' },

    // 18. Naprosyn
    { brand: 'Naprosyn 500mg', generic: 'Naproxen', mfg: 'Martin Dow', strength: '500mg', form: 'Tablet', cat: 'Tablets', pack: 20, price: 18.00, cost: 14.40, barcode: '896400000029', rack: 'Rack A-4' },

    // 19. Enflor
    { brand: 'Enflor 250mg Sachet', generic: 'Saccharomyces boulardii CNCM I-745', mfg: 'Biocodex / Martin Dow', strength: '250mg', form: 'Sachet', cat: 'Sachets & Powders', pack: 10, price: 35.00, cost: 28.00, barcode: '896400000030', rack: 'Rack F-1' },

    // 20. Wintogeno Balm
    { brand: 'Wintogeno Balm 12.17%', generic: 'Methyl salicylate', mfg: 'Martin Dow', strength: '12.17% w/w', form: 'Cream', cat: 'Topical Medicines', pack: 1, price: 120.00, cost: 95.00, barcode: '896400000031', rack: 'Rack G-1' },

    // 21. Depex
    { brand: 'Depex Capsule', generic: 'Unconfirmed Formula (Depex)', mfg: 'Martin Dow', strength: 'Capsule', form: 'Capsule', cat: 'Capsules', pack: 20, price: 12.00, cost: 9.60, barcode: '896400000032', rack: 'Rack G-2' }
  ];

  const insertMed = db.prepare(`
    INSERT INTO medicines (
      id, brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form, pack_size,
      barcode, custom_barcode, rack_location, min_stock_level, reorder_level, is_prescription_required, notes, therapeutic_class
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBatch = db.prepare(`
    INSERT INTO batches (
      id, medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price,
      quantity, bonus_quantity, supplier_id, rack_location, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  medicinesData.forEach((m, idx) => {
    const medId = idx + 1;
    const genId = getGenId(m.generic);
    const catId = getCatId(m.cat);
    const mfgId = getMfgId(m.mfg);
    const customBarcode = `MED-PDF-${String(medId).padStart(3, '0')}`;

    insertMed.run(
      medId,
      m.brand,
      genId,
      catId,
      mfgId,
      m.strength,
      m.form,
      m.pack,
      m.barcode,
      customBarcode,
      m.rack,
      20,
      40,
      1,
      `Pharmacy Medicines List PDF Item`,
      genericsList.find(g => g.name === m.generic)?.class || 'General'
    );

    // Active stock batch
    const batchNum = `BTH-PDF-${String(medId).padStart(3, '0')}`;
    insertBatch.run(
      medId,
      medId,
      batchNum,
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

  console.log(`Successfully inserted ${medicinesData.length} medicines and active batches from PDF list!`);
})();

db.pragma('foreign_keys = ON');

const exportRes = exportSyncData();
console.log('Exported fresh sync data to:', exportRes.path, exportRes.counts);
