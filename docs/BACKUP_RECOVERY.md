# NMP Backup & Disaster Recovery

## Backup Strategy
- **SQLite Hot Backup API**: Uses `better-sqlite3`'s `.backup()` API which guarantees a safe, crash-consistent copy even while concurrent transactions are being written to the database.
- **Automated Rolling Backups**: Daily snapshots stored in `./backups/daily/` and weekly in `./backups/weekly/`.
- **Restoration**: Admin-only feature requiring password confirmation to prevent accidental overwrites.
