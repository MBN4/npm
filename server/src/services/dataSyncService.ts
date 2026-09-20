import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';

export interface SyncDataExport {
  version: string;
  exportedAt: string;
  counts: Record<string, number>;
  categories: any[];
  manufacturers: any[];
  generics: any[];
  suppliers: any[];
  medicines: any[];
  drug_clinical_info: any[];
  batches: any[];
}

const DEFAULT_SYNC_PATH = path.resolve(process.cwd(), 'data', 'sync_data.json');

/**
 * Exports all catalog, medicine, clinical info, and batch data from local SQLite DB to sync_data.json
 */
export function exportSyncData(outputPath: string = DEFAULT_SYNC_PATH): { success: boolean; path: string; counts: Record<string, number> } {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const categories = db.prepare('SELECT * FROM categories').all();
  const manufacturers = db.prepare('SELECT * FROM manufacturers').all();
  const generics = db.prepare('SELECT * FROM generics').all();
  const suppliers = db.prepare('SELECT * FROM suppliers').all();
  const medicines = db.prepare('SELECT * FROM medicines').all();
  const drug_clinical_info = db.prepare('SELECT * FROM drug_clinical_info').all();
  const batches = db.prepare('SELECT * FROM batches').all();

  const counts = {
    categories: categories.length,
    manufacturers: manufacturers.length,
    generics: generics.length,
    suppliers: suppliers.length,
    medicines: medicines.length,
    drug_clinical_info: drug_clinical_info.length,
    batches: batches.length,
  };

  const payload: SyncDataExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    counts,
    categories,
    manufacturers,
    generics,
    suppliers,
    medicines,
    drug_clinical_info,
    batches,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  return {
    success: true,
    path: outputPath,
    counts,
  };
}

/**
 * Safely upserts incoming JSON sync data into the local SQLite database
 */
export function importSyncData(inputPath: string = DEFAULT_SYNC_PATH): { success: boolean; path: string; counts: Record<string, number>; importedAt: string } {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Sync data file not found at: ${inputPath}`);
  }

  const fileContent = fs.readFileSync(inputPath, 'utf8');
  const payload: SyncDataExport = JSON.parse(fileContent);

  const importedCounts: Record<string, number> = {
    categories: 0,
    manufacturers: 0,
    generics: 0,
    suppliers: 0,
    medicines: 0,
    drug_clinical_info: 0,
    batches: 0,
  };

  function upsertRows(tableName: string, rows: any[]) {
    if (!rows || !Array.isArray(rows) || rows.length === 0) return 0;
    
    // Get columns from existing table schema to avoid inserting invalid columns
    const tableInfo = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
    if (!tableInfo || tableInfo.length === 0) return 0;

    const validCols = new Set(tableInfo.map(c => c.name));

    let count = 0;
    for (const row of rows) {
      const keys = Object.keys(row).filter(k => validCols.has(k));
      if (keys.length === 0) continue;

      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);

      const values = keys.map(k => (row[k] !== undefined ? row[k] : null));
      stmt.run(...values);
      count++;
    }
    return count;
  }

  // Disable foreign keys outside transaction (SQLite requirement)
  db.pragma('foreign_keys = OFF');

  try {
    const syncTx = db.transaction(() => {
      importedCounts.categories = upsertRows('categories', payload.categories || []);
      importedCounts.manufacturers = upsertRows('manufacturers', payload.manufacturers || []);
      importedCounts.generics = upsertRows('generics', payload.generics || []);
      importedCounts.suppliers = upsertRows('suppliers', payload.suppliers || []);
      importedCounts.medicines = upsertRows('medicines', payload.medicines || []);
      importedCounts.drug_clinical_info = upsertRows('drug_clinical_info', payload.drug_clinical_info || []);
      importedCounts.batches = upsertRows('batches', payload.batches || []);
    });

    syncTx();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  return {
    success: true,
    path: inputPath,
    counts: importedCounts,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Retrieves information about the current sync_data.json on disk
 */
export function getSyncStatus(syncPath: string = DEFAULT_SYNC_PATH) {
  const exists = fs.existsSync(syncPath);
  if (!exists) {
    return {
      exists: false,
      syncPath,
      fileInfo: null,
    };
  }

  try {
    const stats = fs.statSync(syncPath);
    const fileContent = fs.readFileSync(syncPath, 'utf8');
    const data: SyncDataExport = JSON.parse(fileContent);

    return {
      exists: true,
      syncPath,
      sizeBytes: stats.size,
      mtime: stats.mtime.toISOString(),
      exportedAt: data.exportedAt,
      version: data.version,
      counts: data.counts || {},
    };
  } catch (err: any) {
    return {
      exists: true,
      syncPath,
      error: err.message || 'Failed to parse sync data file',
    };
  }
}
