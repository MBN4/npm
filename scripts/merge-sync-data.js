#!/usr/bin/env node
// Custom git merge driver for server/data/sync_data.json.
// Git invokes this as: node scripts/merge-sync-data.js %O %A %B
//   %O = common ancestor version, %A = current branch's version (git writes the result back here),
//   %B = incoming version being merged in.
// Instead of a line-based text merge (which always conflicts on a large JSON array file edited
// independently on multiple PCs), this merges each table's rows by `id`, keeping both sides'
// unique rows and preferring whichever side's row looks more recently updated when both have it.
const fs = require('fs');

const [, , basePath, oursPath, theirsPath] = process.argv;

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function mergeArraysById(a, b) {
  const map = new Map();
  for (const row of a || []) {
    if (row && typeof row === 'object' && 'id' in row) map.set(row.id, row);
  }
  for (const row of b || []) {
    if (!row || typeof row !== 'object' || !('id' in row)) continue;
    const existing = map.get(row.id);
    if (!existing) {
      map.set(row.id, row);
      continue;
    }
    const existingStamp = existing.updated_at || existing.created_at || '';
    const incomingStamp = row.updated_at || row.created_at || '';
    if (incomingStamp >= existingStamp) map.set(row.id, row);
  }
  return Array.from(map.values());
}

const ours = readJsonSafe(oursPath);
const theirs = readJsonSafe(theirsPath);

if (!ours || !theirs) {
  // Can't safely merge unparseable JSON - leave it to a manual resolution.
  process.exit(1);
}

const tableKeys = new Set([...Object.keys(ours), ...Object.keys(theirs)].filter(
  key => Array.isArray(ours[key]) || Array.isArray(theirs[key])
));

const merged = { ...ours };
const counts = {};
for (const key of tableKeys) {
  merged[key] = mergeArraysById(ours[key], theirs[key]);
  counts[key] = merged[key].length;
}

merged.version = theirs.version || ours.version;
merged.exportedAt = new Date().toISOString();
merged.counts = counts;

fs.writeFileSync(oursPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
process.exit(0);
