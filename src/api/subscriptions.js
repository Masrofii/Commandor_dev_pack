'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUserDetails, listSubscriptionPlans } = require('../services/userService');
const { redeemCodeForUser } = require('../services/redeemService');

router.use(requireAuth);

/**
 * Get current user's active subscription, perks, days remaining, and resource quotas
 */
router.get('/current', (req, res) => {
  try {
    const details = getUserDetails(req.user.tg_id);
    if (!details) return res.status(404).json({ error: 'User profile not found' });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * List available public subscription tiers and features
 */
router.get('/plans', (req, res) => {
  try {
    const plans = listSubscriptionPlans();
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Redeem a promotional voucher or subscription gift code
 */
router.post('/redeem', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Redeem code is required.' });
    }

    const result = await redeemCodeForUser(code, req.user.tg_id, { ipAddress: req.ip });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
