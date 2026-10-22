'use strict';
const express = require('express');
const router = express.Router();
const { requireAuthOrApiKey } = require('../middleware/auth');
const { getSystemOverview, getHostSystemMetrics } = require('../services/monitoringService');

router.use(requireAuthOrApiKey());

// Platform overview metrics (Real data across nodes, apps, domains, hosts)
router.get('/overview', (req, res) => {
  try {
    const overview = getSystemOverview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Host hardware & OS metrics
router.get('/host', (req, res) => {
  try {
    const host = getHostSystemMetrics();
    res.json(host);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit logs (User-scoped or admin global)
router.get('/logs', (req, res) => {
  try {
    const { page = 1, limit = 50, action, category, search } = req.query;
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;
    const db = require('../../database/database').getDb();
    let q = 'SELECT * FROM audit_logs WHERE 1=1';
    const p = [];

    if (req.user?.role !== 'admin') {
      q += ' AND tg_id = ?';
      p.push(req.user?.tg_id || 0);
    }
    if (action) {
      q += ' AND action = ?';
      p.push(action);
    }
    if (category) {
      q += ' AND category = ?';
      p.push(category);
    }
    if (search) {
      q += ' AND (details LIKE ? OR action LIKE ?)';
      p.push(`%${search}%`, `%${search}%`);
    }

    q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    p.push(take, offset);

    const logs = db.prepare(q).all(...p);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
