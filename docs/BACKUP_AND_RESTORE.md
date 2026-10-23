# Commandor Dev Pack — Backup & Disaster Recovery Guide

---

## 1. Backup Architecture

Commandor Dev Pack features automated and on-demand disaster recovery mechanisms designed to ensure zero data loss.

### Backup Types

1. **Database Snapshot (`type='database'`)**:
   - Executes an atomic SQLite backup with WAL checkpointing.
   - Computes SHA-256 integrity checksum.
   - Validates the 16-byte SQLite magic header `SQLite format 3\000`.
2. **Full System Configuration (`type='full'`)**:
   - Packages the database, Nginx virtual host configs (`/nginx/routes/*.conf`), and active platform settings into an authenticated gzip archive.

---

## 2. Automated Backups Schedule

Backups run nightly via node-cron (`src/jobs/backups.js`):
- Schedule: Every day at 03:00 AM UTC (`0 3 * * *`)
- Storage Location: `/opt/temp-mail-manager/backups/`
- Retention Policy: 7 days rolling retention; archives older than 7 days are automatically pruned.

Manual trigger:
```bash
npm run backup
```

---

## 3. Backup Verification & Sandbox Testing

### 3.1 Integrity Check
The platform inspects backups via `POST /api/backups/:id/verify`:
- Verifies SHA-256 matches stored metadata.
- Validates magic header byte signature.

### 3.2 Ephemeral Sandbox Restore
To guarantee recoverability without endangering live production data, `POST /api/backups/:id/test-restore`:
1. Copies the backup snapshot to a temporary in-memory or ephemeral test database.
2. Runs SQLite `PRAGMA quick_check`.
3. Verifies table schema count and row counts across all critical tables.
4. Reports validation results and destroys the sandbox database.

---

## 4. Disaster Recovery Procedure

### Restoring Database from Backup

To restore a database backup:

```bash
# 1. Stop active PM2 processes
pm2 stop all

# 2. Backup current database state
cp /opt/temp-mail-manager/data/app.db /opt/temp-mail-manager/data/app.db.before-restore

# 3. Restore target backup archive
# (if gzipped)
gunzip -c /opt/temp-mail-manager/backups/backup_2026-10-23_03-00-00.db.gz > /opt/temp-mail-manager/data/app.db

# 4. Validate restored database integrity
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/app.db');
const res = db.pragma('quick_check');
console.log('Integrity check result:', res);
db.close();
"

# 5. Restart application services
pm2 start all
```
