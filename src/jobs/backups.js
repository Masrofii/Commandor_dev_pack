'use strict';
const { createDatabaseBackup } = require('../services/backupService');
const logger = require('../monitoring/logger');

async function runBackup() {
  try {
    const backup = await createDatabaseBackup('Automated scheduled backup');
    logger.info({ backupId: backup.id, file: backup.backup_name, size: backup.file_size_bytes }, 'Scheduled backup completed successfully');
    return backup.file_path;
  } catch (err) {
    logger.error({ err: err.message }, 'Scheduled backup failed');
    throw err;
  }
}

module.exports = { runBackup };
