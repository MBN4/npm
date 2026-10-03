#!/usr/bin/env node
// Registers the custom "syncdata" merge driver in this machine's local git config, so that
// future `git pull`/merge conflicts in server/data/sync_data.json resolve automatically instead
// of stopping for manual conflict resolution. Safe to run repeatedly (idempotent), and silently
// does nothing if this isn't a git checkout or git isn't installed.
const { execSync } = require('child_process');

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

run('git config merge.syncdata.name "Row-level union merge driver for sync_data.json"');
run('git config merge.syncdata.driver "node scripts/merge-sync-data.js %O %A %B"');
