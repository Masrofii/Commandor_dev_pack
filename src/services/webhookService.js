'use strict';
const { getDb } = require('../../database/database');
const { hmacSign } = require('../utils/crypto');
const axios = require('axios');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const crypto = require('crypto');
const { logChange } = require('./auditLogger');

function getUserWebhooks(tgId) {
  return getDb().prepare('SELECT * FROM webhooks WHERE tg_id=? ORDER BY created_at DESC').all(tgId);
}

function getWebhookById(id, tgId) {
  return getDb().prepare('SELECT * FROM webhooks WHERE id=? AND tg_id=?').get(id, tgId);
}

function createWebhook({ tgId, name, url, secret, eventTypes }) {
  const db = getDb();
  const c = db.prepare('SELECT COUNT(*) as c FROM webhooks WHERE tg_id=?').get(tgId).c;
  if (c >= config.quotas.maxWebhooks) throw new Error('Webhook limit reached');
  const r = db.prepare('INSERT INTO webhooks(tg_id,name,url,secret,event_types) VALUES(?,?,?,?,?)')
    .run(tgId, name, url, secret || null, JSON.stringify(eventTypes || ['email.received']));
  return db.prepare('SELECT * FROM webhooks WHERE id=?').get(r.lastInsertRowid);
}

function deleteWebhook(id, tgId) {
  return getDb().prepare('DELETE FROM webhooks WHERE id=? AND tg_id=?').run(id, tgId).changes > 0;
}

async function deliverWebhook(webhook, event, payload, existingDeliveryId = null) {
  const db = getDb();
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const payloadHash = crypto.createHash('md5').update(body).digest('hex');

  let did = existingDeliveryId;
  let attemptNumber = 1;

  if (did) {
    const prev = db.prepare('SELECT attempt_number FROM webhook_deliveries WHERE id=?').get(did);
    attemptNumber = (prev?.attempt_number || 1) + 1;
    db.prepare("UPDATE webhook_deliveries SET status='pending', attempt_number=? WHERE id=?").run(attemptNumber, did);
  } else {
    did = db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, email_id, event_type, payload_hash, attempt_number, status)
      VALUES (?, ?, ?, ?, 1, 'pending')
    `).run(webhook.id, payload.emailId || null, event, payloadHash).lastInsertRowid;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
    'X-Delivery-Id': did.toString(),
    'X-Timestamp': Date.now().toString()
  };
  if (webhook.secret) {
    headers['X-Webhook-Signature'] = `sha256=${hmacSign(webhook.secret, body)}`;
  }

  const start = Date.now();
  try {
    const resp = await axios.post(webhook.url, body, { headers, timeout: 15000, validateStatus: () => true });
    const dur = Date.now() - start;
    const ok = resp.status >= 200 && resp.status < 300;

    if (ok) {
      db.prepare(`
        UPDATE webhook_deliveries
        SET status='delivered', http_status=?, response_time_ms=?, next_retry_at=NULL, completed_at=datetime('now')
        WHERE id=?
      `).run(resp.status, dur, did);
    } else {
      const delayMs = (config.webhooks?.retryBaseDelayMs || 5000) * Math.pow(2, attemptNumber - 1);
      const nextRetryAt = attemptNumber < (config.webhooks?.retryLimit || 5)
        ? new Date(Date.now() + delayMs).toISOString()
        : null;
      const status = attemptNumber < (config.webhooks?.retryLimit || 5) ? 'failed' : 'dead';

      db.prepare(`
        UPDATE webhook_deliveries
        SET status=?, http_status=?, response_time_ms=?, next_retry_at=?, error=?, completed_at=datetime('now')
        WHERE id=?
      `).run(status, resp.status, dur, nextRetryAt, `HTTP error ${resp.status}`, did);
    }
    return ok;
  } catch (err) {
    const dur = Date.now() - start;
    const delayMs = (config.webhooks?.retryBaseDelayMs || 5000) * Math.pow(2, attemptNumber - 1);
    const nextRetryAt = attemptNumber < (config.webhooks?.retryLimit || 5)
      ? new Date(Date.now() + delayMs).toISOString()
      : null;
    const status = attemptNumber < (config.webhooks?.retryLimit || 5) ? 'failed' : 'dead';

    db.prepare(`
      UPDATE webhook_deliveries
      SET status=?, error=?, response_time_ms=?, next_retry_at=?, completed_at=datetime('now')
      WHERE id=?
    `).run(status, err.message, dur, nextRetryAt, did);
    return false;
  }
}

async function retryWebhookDelivery(deliveryId, userTgId = null) {
  const db = getDb();
  const delivery = db.prepare(`
    SELECT wd.*, w.url, w.secret, w.tg_id
    FROM webhook_deliveries wd
    JOIN webhooks w ON wd.webhook_id = w.id
    WHERE wd.id = ?
  `).get(deliveryId);

  if (!delivery) throw new Error(`Webhook delivery #${deliveryId} not found`);
  if (userTgId && delivery.tg_id !== userTgId) {
    throw new Error('Unauthorized to retry this webhook delivery');
  }

  const ok = await deliverWebhook(
    { id: delivery.webhook_id, url: delivery.url, secret: delivery.secret },
    delivery.event_type,
    { deliveryId, isManualRetry: true },
    deliveryId
  );

  logChange({
    tgId: userTgId,
    category: 'webhooks',
    action: 'webhook_delivery_retried',
    details: `Manual retry dispatched for webhook delivery #${deliveryId} (Outcome: ${ok ? 'Delivered' : 'Failed'})`,
    metadata: { deliveryId, success: ok }
  }).catch(() => {});

  return {
    success: ok,
    delivery: db.prepare('SELECT * FROM webhook_deliveries WHERE id=?').get(deliveryId)
  };
}

async function dispatchWebhooks(tgId, event, payload) {
  const whs = getDb().prepare('SELECT * FROM webhooks WHERE tg_id=? AND enabled=1 AND event_types LIKE ?').all(tgId, `%${event}%`);
  for (const wh of whs) {
    deliverWebhook(wh, event, payload).catch(() => {});
  }
}

module.exports = {
  getUserWebhooks,
  getWebhookById,
  createWebhook,
  deleteWebhook,
  deliverWebhook,
  retryWebhookDelivery,
  dispatchWebhooks
};
