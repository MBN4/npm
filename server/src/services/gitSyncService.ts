import { execFile } from 'child_process';
import path from 'path';
import { exportSyncData } from './dataSyncService.js';
import { logAudit } from './auditService.js';

// server/src/services -> server/ is process.cwd() when the server runs (npm --prefix server run dev)
const REPO_ROOT = path.resolve(process.cwd(), '..');
const SYNC_DATA_RELATIVE_PATH = path.posix.join('server', 'data', 'sync_data.json');

function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO_ROOT, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || stdout?.trim() || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

// Best-effort, idempotent: registers the "syncdata" merge driver (scripts/merge-sync-data.js) in
// this machine's local git config so a `git pull` conflict in sync_data.json auto-resolves by
// merging rows instead of stopping for manual resolution. Normally set up by the root
// postinstall script, but re-checked here too in case this checkout's node_modules predates it.
function ensureMergeDriverConfigured(): void {
  execFile('git', ['config', 'merge.syncdata.driver', 'node scripts/merge-sync-data.js %O %A %B'], { cwd: REPO_ROOT, windowsHide: true }, () => {});
  execFile('git', ['config', 'merge.syncdata.name', 'Row-level union merge driver for sync_data.json'], { cwd: REPO_ROOT, windowsHide: true }, () => {});
}

ensureMergeDriverConfigured();

// Serializes all auto-sync attempts so concurrent saves never race on the git index.
let queue: Promise<void> = Promise.resolve();

/**
 * Fire-and-forget: export the DB to sync_data.json, then commit + push it to GitHub.
 * Never throws back to the caller — failures (e.g. no internet) are logged and the
 * local commit (if it succeeded) still protects the data until the next successful push.
 */
export function triggerAutoSync(reason: string): Promise<void> {
  queue = queue.then(() => doAutoSync(reason)).catch((err) => {
    console.error(`[auto-sync] failed (${reason}):`, err.message || err);
    logAudit({ action: 'AUTO_SYNC_FAILED', entity: 'sync_data', details: { reason, error: err.message || String(err) } });
  });
  return queue;
}

async function doAutoSync(reason: string): Promise<void> {
  const { counts } = exportSyncData();

  await runGit(['add', '--', SYNC_DATA_RELATIVE_PATH]);

  const status = await runGit(['status', '--porcelain', '--', SYNC_DATA_RELATIVE_PATH]);
  if (!status.trim()) {
    return; // nothing changed since the last sync, skip the commit/push
  }

  const message = `auto-sync: ${reason} (${new Date().toISOString()})`;
  await runGit(['commit', '-m', message, '--', SYNC_DATA_RELATIVE_PATH]);

  try {
    await runGit(['push', 'origin', 'HEAD:main']);
  } catch (pushErr: any) {
    // Remote may have moved on (e.g. edited from another machine/session) - rebase once and retry.
    try {
      await runGit(['pull', '--rebase', 'origin', 'main']);
      await runGit(['push', 'origin', 'HEAD:main']);
    } catch (retryErr: any) {
      logAudit({ action: 'AUTO_SYNC_PUSH_FAILED', entity: 'sync_data', details: { reason, counts, error: retryErr.message || String(retryErr) } });
      throw retryErr;
    }
  }

  logAudit({ action: 'AUTO_SYNC_PUSHED', entity: 'sync_data', details: { reason, counts } });
}
