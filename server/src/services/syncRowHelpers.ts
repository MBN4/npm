import type Database from 'better-sqlite3';

const SYNC_TABLES = new Set([
  'categories', 'manufacturers', 'generics', 'suppliers',
  'medicines', 'drug_clinical_info', 'batches'
]);

/** Import a catalog row while resolving medicine relationships by name across devices. */
export function upsertSyncRows(db: Database.Database, tableName: string, rows: any[]): number {
  if (!SYNC_TABLES.has(tableName)) throw new Error(`Unsupported sync table: ${tableName}`);
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const validCols = new Set((db.pragma(`table_info(${tableName})`) as Array<{ name: string }>).map(column => column.name));
  if (!validCols.size) return 0;

  let count = 0;
  for (const row of rows) {
    if (['categories', 'manufacturers', 'generics'].includes(tableName) && row.name) {
      const byName = db.prepare(`SELECT id FROM ${tableName} WHERE name = ? COLLATE NOCASE`).get(row.name) as { id: number } | undefined;
      if (byName && byName.id !== row.id) continue;
    }

    if (validCols.has('updated_at') && row.id != null && row.updated_at) {
      const local = db.prepare(`SELECT updated_at FROM ${tableName} WHERE id = ?`).get(row.id) as { updated_at?: string } | undefined;
      if (local?.updated_at && local.updated_at >= row.updated_at) continue;
    }

    const writable = { ...row };
    if (tableName === 'medicines') {
      const links = [
        ['sync_generic_name', 'generics', 'generic_id'],
        ['sync_category_name', 'categories', 'category_id'],
        ['sync_manufacturer_name', 'manufacturers', 'manufacturer_id']
      ] as const;
      for (const [sourceField, lookupTable, targetField] of links) {
        if (!writable[sourceField]) continue;
        const linked = db.prepare(`SELECT id FROM ${lookupTable} WHERE name = ? COLLATE NOCASE`).get(writable[sourceField]) as { id: number } | undefined;
        if (!linked) throw new Error(`Missing ${lookupTable} entry for ${writable.brand_name}: ${writable[sourceField]}`);
        writable[targetField] = linked.id;
      }
      // A device may already have entered the same product before it received this snapshot.
      const sameProduct = db.prepare(`SELECT id FROM medicines WHERE brand_name = ? COLLATE NOCASE AND COALESCE(strength, '') = COALESCE(?, '') LIMIT 1`)
        .get(writable.brand_name, writable.strength) as { id: number } | undefined;
      if (sameProduct && sameProduct.id !== writable.id) continue;
    }

    const keys = Object.keys(writable).filter(key => validCols.has(key));
    if (!keys.length) continue;
    const placeholders = keys.map(() => '?').join(', ');
    db.prepare(`INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`)
      .run(...keys.map(key => writable[key] === undefined ? null : writable[key]));
    count++;
  }
  return count;
}
