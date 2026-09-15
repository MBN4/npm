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
}

// Transaction runner utility for ACID compliance
export function runTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
