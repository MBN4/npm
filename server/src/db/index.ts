import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
}

// Transaction runner utility for ACID compliance
export function runTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
