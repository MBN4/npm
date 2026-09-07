# Naveed Medical Pharmacy (NMP) — Disaster Recovery & Backup Runbook

This runbook documents the data protection architecture, backup procedures, integrity verification, and recovery workflows for **Naveed Medical Pharmacy (NMP)**.

---

## 1. Database Architecture & Storage Engine

- **Database Engine**: SQLite 3.44+ via `better-sqlite3`.
- **Journal Mode**: Write-Ahead Logging (`PRAGMA journal_mode = WAL`).
- **File Locations**:
  - Primary Database File: `server/data/nmp.sqlite`
  - WAL Journal File: `server/data/nmp.sqlite-wal`
  - Shared Memory File: `server/data/nmp.sqlite-shm`
  - Automated Hot Backups: `server/backups/nmp_backup_<timestamp>.sqlite`
- **Concurrency & Locking**:
  - WAL mode permits unlimited concurrent readers while a writer commits.
  - `PRAGMA busy_timeout = 5000` prevents `SQLITE_BUSY` errors during peak counter traffic.
  - `PRAGMA foreign_keys = ON` guarantees relational referential integrity.

---

## 2. Taking an Online Hot Backup

Because NMP operates in SQLite WAL mode, taking a raw filesystem copy of `nmp.sqlite` while writers are active can produce a corrupt snapshot if the WAL buffer is uncommitted. 

NMP uses SQLite's native online backup API (`better-sqlite3` `db.backup()`), which safely snapshots pages into a clean, standalone SQLite file without interrupting cashier sales or taking the server offline.

### Method A: Via Admin Portal UI
1. Log in as an Administrator.
2. Navigate to **Settings > Resilience & Hot Backups**.
3. Review current database metrics (DB size in MB, WAL cache, total records).
4. Click **Create Hot Backup Now**.
5. The snapshot is created in `server/backups/` and immediately appears in the backups table.
6. Click **Download** to save an encrypted or offline copy to an external USB flash drive or secure cloud bucket.

### Method B: Via CLI Command / Scheduled Task
You can trigger an automated backup using the CLI or a cron / Windows Task Scheduler job:
```bash
# In Windows PowerShell:
Invoke-RestMethod -Uri "http://localhost:5000/api/backup/create" -Method POST -Headers @{ "Authorization" = "Bearer <ADMIN_TOKEN>" }
```

---

## 3. Verifying Backup Snapshot Integrity

Before trusting a backup for recovery, verify that the database pages and B-trees are uncorrupted.

### Verification in Portal
- In **Settings > Resilience & Hot Backups**, find the snapshot in the table.
- Click **Verify PRAGMA**.
- The server opens the snapshot in read-only mode and executes `PRAGMA integrity_check`.
- A green **Integrity Verified (OK)** badge confirms the file is 100% healthy.

### Verification in CLI
```bash
sqlite3 server/backups/nmp_backup_2026-09-07.sqlite "PRAGMA integrity_check;"
# Output must be: ok
```

---

## 4. Disaster Recovery & Restoration Procedure

If the primary database drive experiences hardware corruption or system failure:

### Step 1: Stop Active Server Processes
```powershell
# Stop backend Express service
Get-Process -Name "node" | Stop-Process -Force
```

### Step 2: Archive Damaged Database Files (Safety Copy)
```powershell
mkdir server\data\corrupt_archive
Move-Item server\data\nmp.sqlite* server\data\corrupt_archive\
```

### Step 3: Select and Verify Candidate Backup File
Ensure the selected backup snapshot is intact:
```powershell
sqlite3 server\backups\nmp_backup_2026-09-07T12-00-00.sqlite "PRAGMA integrity_check;"
```

### Step 4: Restore Backup to Primary Database Path
```powershell
Copy-Item server\backups\nmp_backup_2026-09-07T12-00-00.sqlite server\data\nmp.sqlite
```

### Step 5: Restart Server & Confirm Verification
```powershell
cd server
npm run dev
```
Check health check endpoint:
```powershell
curl http://localhost:5000/api/health
```

---

## 5. Routine Maintenance Schedule

| Interval | Task | Action |
|---|---|---|
| **Daily (Closing)** | Daily Snapshot | Click *Create Hot Backup* in Settings; verify PRAGMA status. |
| **Weekly** | Offsite Copy | Copy newest `.sqlite` backup to an external encrypted USB drive. |
| **Monthly** | Cleanup Stale Backups | Delete snapshots older than 60 days via the Portal table. |
| **Quarterly** | Recovery Drill | Practice restoration on a secondary test machine to verify continuity. |
