import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { safeJsonParse } from '../utils/json.js';
import { upsertSyncRows } from './syncRowHelpers.js';
import type { SyncDataExport } from './dataSyncService.js';

// Local-fallback instance only (never runs on the cloud deployment - see index.ts's
// ENABLE_LOCAL_FALLBACK_SYNC gate). Keeps this PC's offline-backup copy fresh by periodically
// pulling the cloud's latest catalog/reference data, but ONLY while this instance hasn't recorded
// any of its own activity since the last pull. The existing sync import (dataSyncService's
// importSyncData / upsertSyncRows) writes rows keyed by raw id via INSERT OR REPLACE, which
// assumes one shared id space - safe when this instance and the cloud are never both independently
// creating new rows at once, unsafe the moment they are (an outage-time local sale and a later
// cloud sale could collide on the same autoincrement id and silently overwrite each other). So
// rather than filtering which *tables* sync, we pause ALL syncing the moment this instance goes
// "dirty", and only resume once Stage 3's reconciliation flow (or a manual reset) clears it.
const DIRTY_CHECK_TABLES = [
  'customers', 'doctors', 'purchases', 'sales', 'prescriptions',
  'purchase_invoice_scans', 'medicines', 'suppliers', 'batches', 'stock_movements'
];

const CATALOG_SYNC_TABLES = [
  'categories', 'manufacturers', 'generics', 'suppliers', 'medicines',
  'drug_clinical_info', 'batches', 'packing_references',
  'drug_classifications', 'medicine_classification_links', 'medicine_ingredients'
];

const LAST_CLEAN_SYNC_KEY = 'local_fallback_last_clean_sync_at';

// A fresh install's very first boot already auto-imports a full snapshot of the cloud's data
// (existing initDatabase() behavior, unrelated to this service) - that bootstrap data can have
// real created_at timestamps from long before this PC ever ran the app, so "dirty since the dawn
// of time" would misfire on day one. The first time this service runs with no marker yet, it
// defines "clean" as "whatever is already here right now" and only flags activity from this
// moment on - which is exactly the local-only activity this check exists to catch.
// Every created_at column in this schema is SQLite's own CURRENT_TIMESTAMP ('YYYY-MM-DD
// HH:MM:SS', space-separated, no milliseconds/zone). The dirty check does a plain string
// comparison against those columns, so the baseline must be stamped in that exact format -
// JS's Date.toISOString() ('...T...Z') sorts incorrectly against it and would silently break
// the comparison.
function sqliteNow(): string {
  return (db.prepare("SELECT datetime('now') as now").get() as { now: string }).now;
}

function getLastCleanSyncAt(): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(LAST_CLEAN_SYNC_KEY) as { value: string } | undefined;
  if (row?.value) return row.value;
  const now = sqliteNow();
  setLastCleanSyncAt(now);
  return now;
}

function setLastCleanSyncAt(timestamp: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, description) VALUES (?, ?, 'Last time this offline-backup instance safely pulled catalog data from the cloud')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(LAST_CLEAN_SYNC_KEY, timestamp);
}

/** True the moment this instance has recorded anything of its own since the last clean sync. */
export function isLocalInstanceDirty(sinceIso: string = getLastCleanSyncAt()): { dirty: boolean; reason: string | null } {
  for (const table of DIRTY_CHECK_TABLES) {
    // >= rather than > : SQLite's CURRENT_TIMESTAMP has only 1-second resolution, so a local
    // write landing in the exact same second the baseline was stamped must still count as dirty
    // rather than slip through a strict ">" comparison. Catalog-synced rows keep their original
    // (old) created_at from the export, so this can't misfire on the sync's own writes.
    const row = db.prepare(`SELECT id FROM ${table} WHERE created_at >= ? LIMIT 1`).get(sinceIso) as { id: number } | undefined;
    if (row) return { dirty: true, reason: `${table} has a row created locally since the last sync (id ${row.id})` };
  }
  return { dirty: false, reason: null };
}

export function getLocalFallbackSyncStatus() {
  const lastCleanSyncAt = getLastCleanSyncAt();
  const { dirty, reason } = isLocalInstanceDirty(lastCleanSyncAt);
  return {
    lastCleanSyncAt,
    isDirty: dirty,
    dirtyReason: reason
  };
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || stdout?.trim() || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

export type CatalogSyncResult =
  | { status: 'synced'; counts: Record<string, number> }
  | { status: 'skipped_dirty'; reason: string }
  | { status: 'pull_failed'; error: string };

/** One pull-and-import attempt. Never throws - callers (the interval loop, or a manual trigger) get a typed result instead. */
export async function pullAndImportCatalogIfClean(repoRoot: string): Promise<CatalogSyncResult> {
  const lastCleanSyncAt = getLastCleanSyncAt();
  const { dirty, reason } = isLocalInstanceDirty(lastCleanSyncAt);
  if (dirty) {
    return { status: 'skipped_dirty', reason: reason! };
  }

  try {
    await runGit(['pull', '--ff-only', 'origin', 'main'], repoRoot);
  } catch (err: any) {
    return { status: 'pull_failed', error: err.message || String(err) };
  }

  const syncPath = path.join(repoRoot, 'server', 'data', 'sync_data.json');
  if (!fs.existsSync(syncPath)) {
    return { status: 'pull_failed', error: `No sync_data.json found at ${syncPath} after pull` };
  }

  const payload = safeJsonParse<Partial<SyncDataExport>>(fs.readFileSync(syncPath, 'utf8'), {});
  const counts: Record<string, number> = {};

  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      for (const table of CATALOG_SYNC_TABLES) {
        counts[table] = upsertSyncRows(db, table, (payload as any)[table] || []);
      }
    });
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  setLastCleanSyncAt(sqliteNow());
  return { status: 'synced', counts };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Starts the background catalog-sync loop. Idempotent - calling it twice doesn't double the interval. */
export function startLocalFallbackSync(repoRoot: string, intervalMinutes: number = 15): void {
  if (intervalHandle) return;

  const tick = () => {
    pullAndImportCatalogIfClean(repoRoot)
      .then(result => {
        if (result.status === 'synced') {
          console.log(`[local-fallback-sync] Catalog refreshed from cloud (${new Date().toISOString()})`);
        } else if (result.status === 'skipped_dirty') {
          console.log(`[local-fallback-sync] Paused - this instance has outage-time activity pending reconciliation: ${result.reason}`);
        } else {
          console.warn(`[local-fallback-sync] Pull failed (likely no internet right now): ${result.error}`);
        }
      })
      .catch(err => console.error('[local-fallback-sync] Unexpected error:', err.message || err));
  };

  setTimeout(tick, 10_000); // first attempt shortly after boot, not instantly (let the server finish starting)
  intervalHandle = setInterval(tick, intervalMinutes * 60 * 1000);
}
