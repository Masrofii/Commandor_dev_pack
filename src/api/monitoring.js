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

module.exports = router;
