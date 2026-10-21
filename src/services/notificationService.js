'use strict';
const logger = require('../monitoring/logger');
const { truncate, escapeHtml, extractVerificationCode } = require('../utils/helpers');
const { t } = require('../bot/i18n');
const { getDb } = require('../../database/database');
const config = require('../../config/config');

let botInstance = null, wsServer = null;
function setBotInstance(b) { botInstance = b; }
function setWsServer(w) { wsServer = w; }

async function notifyNewEmail(tgId, email, alias) {
  await Promise.allSettled([
    notifyTelegram(tgId, email, alias),
    notifyWebSocket(tgId, 'email.received', { email: sanitizeForWs(email) })
  ]);
}

async function notifyTelegram(tgId, email, alias) {
  if (!botInstance) return;
  try {
    let lang = 'en';
    try {
      const u = getDb().prepare('SELECT language FROM users WHERE tg_id=?').get(tgId);
      if (u?.language) lang = u.language;
    } catch {}

    const subject = email.subject || '(no subject)';
    const from = email.sender_name ? `${email.sender_name} <${email.sender}>` : email.sender;
    const preview = truncate(email.text_body || 'No preview available', 220);
    const spam = email.spam_classification !== 'ham' ? `\n⚠️ <i>Spam score: ${email.spam_score}</i>` : '';

    const otp = extractVerificationCode(email.subject, email.text_body);
    let otpBlock = '';
    if (otp) {
      otpBlock = `\n🔑 <b>Verification Code:</b> <code>${escapeHtml(otp)}</code> <i>(Tap to copy)</i>\n`;
    }

    const text = t('notifications.new_email', lang, {
      alias: escapeHtml(alias.address),
      from: escapeHtml(from),
      subject: escapeHtml(subject),
      otpBlock,
      preview: escapeHtml(preview),
      spamWarning: spam
    });

    const webUrl = config.server.webUrl ? `${config.server.webUrl}/inbox/${email.id}` : null;
    const actionRow = [
      { text: '📖 Read', callback_data: `read_email:${email.id}` },
      { text: '⭐ Star', callback_data: `star:${email.id}` },
      { text: '🗑 Delete', callback_data: `delete_email:${email.id}` }
    ];

    const navRow = [
      { text: '📨 Go to Inbox', callback_data: 'inbox:1' }
    ];
    if (webUrl) {
      navRow.push({ text: '🌐 Open Web', url: webUrl });
    }

    await botInstance.telegram.sendMessage(tgId, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [actionRow, navRow]
      }
    });
  } catch (err) {
    logger.error({ err: err.message, tgId }, 'TG notification failed');
  }
}

function notifyWebSocket(tgId, event, data) {
  if (!wsServer) return;
  wsServer.sendToUser(tgId, { type: event, data, timestamp: Date.now() });
}

function sanitizeForWs(email) {
  const code = extractVerificationCode(email.subject, email.text_body);
  return {
    id: email.id,
    alias_address: email.alias_address,
    sender: email.sender,
    sender_name: email.sender_name,
    subject: email.subject,
    preview: truncate(email.text_body || '', 150),
    verification_code: code,
    is_read: email.is_read,
    is_starred: email.is_starred,
    has_attachments: email.has_attachments,
    spam_classification: email.spam_classification,
    received_at: email.received_at
  };
}

module.exports = { setBotInstance, setWsServer, notifyNewEmail, notifyTelegram, notifyWebSocket };
