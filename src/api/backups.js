'use strict';
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  createDatabaseBackup,
  createFullSystemBackup,
  listBackups,
  getBackupById,
  restoreDatabaseBackup,
  verifyBackupIntegrity,
  testRestoreBackup
} = require('../services/backupService');

router.use(requireAuth);
router.use(requireAdmin);

// List backups
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    const backups = listBackups({ type });
    res.json({ backups, count: backups.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual backup
router.post('/', async (req, res) => {
  try {
    const { type = 'database', notes } = req.body;
    let backup;
    if (type === 'full') {
      backup = await createFullSystemBackup(notes || 'Manual full backup', req.tgId);
    } else {
      backup = await createDatabaseBackup(notes || 'Manual database backup', req.tgId);
    }
    res.status(201).json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify backup integrity
router.post('/:id/verify', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await verifyBackupIntegrity(id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Dry-run restore test (isolated test in temporary sandbox)
router.post('/:id/test-restore', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await testRestoreBackup(id, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Restore database from backup
router.post('/:id/restore', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { confirmation_accepted } = req.body;
    const result = await restoreDatabaseBackup(id, Boolean(confirmation_accepted), req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download backup file
router.get('/:id/download', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const backup = getBackupById(id);
    if (!backup || !fs.existsSync(backup.file_path)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    res.download(backup.file_path, backup.backup_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
