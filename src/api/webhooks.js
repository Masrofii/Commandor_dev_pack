'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getUserWebhooks,
  getWebhookById,
  createWebhook,
  deleteWebhook,
  retryWebhookDelivery
} = require('../services/webhookService');
const { getDb } = require('../../database/database');
const { body, validationResult } = require('express-validator');

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getUserWebhooks(req.tgId).map(w => ({ ...w, secret: w.secret ? '***' : null })));
});

router.post(
  '/',
  [
    body('name').isString().isLength({ min: 1, max: 100 }),
    body('url').isURL({ protocols: ['https'] }),
    body('eventTypes').isArray()
  ],
  async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
    try {
      const wh = createWebhook({
        tgId: req.tgId,
        name: req.body.name,
        url: req.body.url,
        secret: req.body.secret,
        eventTypes: req.body.eventTypes
      });
      res.status(201).json({ ...wh, secret: wh.secret ? '***' : null });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

router.get('/:id/deliveries', (req, res) => {
  const wh = getWebhookById(req.params.id, req.tgId);
  if (!wh) return res.status(404).json({ error: 'Webhook not found' });
  const deliveries = getDb().prepare(`
    SELECT id, webhook_id, email_id, event_type, attempt_number, status, http_status, response_time_ms, error, next_retry_at, created_at, completed_at
    FROM webhook_deliveries
    WHERE webhook_id=?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.params.id);
  res.json(deliveries);
});

router.post('/:id/deliveries/:deliveryId/retry', async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId, 10);
    const result = await retryWebhookDelivery(deliveryId, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  if (!deleteWebhook(parseInt(req.params.id, 10), req.tgId)) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  res.json({ status: 'deleted' });
});

module.exports = router;
