'use strict';
const fs = require('fs');
const { t } = require('./i18n');
const { createAlias, getUserAliases, getAllowedDomains } = require('../services/aliasService');
const { getEmails, getEmailById, markRead } = require('../services/emailService');
const { getUserStorageStats } = require('../services/quotaService');
const { createApiKey, getUserApiKeys, revokeApiKey, VALID_SCOPES } = require('../services/apiKeyService');
const { sendReply } = require('../email/reply');
const {
  mainMenuKeyboard,
  startInlineKeyboard,
  aliasActionsKeyboard,
  adminDashboardKeyboard,
  apiKeysKeyboard,
  subdomainListKeyboard,
  subdomainActionsKeyboard,
  hostingMainMenuKeyboard,
  hostingSitesListKeyboard,
  hostingSiteActionsKeyboard,
  hostingNodesKeyboard
} = require('./keyboards');
const {
  claimSubdomain,
  getUserSubdomains,
  getSubdomainById,
  updateSubdomain,
  deleteSubdomain,
  getSubdomainWebRequests,
  getAllSubdomainsAdmin
} = require('../services/subdomainService');
const {
  getTOS,
  getPlan,
  getUserSites,
  getSiteById,
  checkUserLimits,
  deploySite,
  deleteSite,
  getAllSitesAdmin,
  getSecurityLogs
} = require('../services/hostingService');
const {
  parseNodeConnectionString,
  testAndProvisionNode,
  listNodes,
  getNodeById,
  deleteNode: deleteHostingNode
} = require('../services/nodeManagerService');
const { getDb } = require('../../database/database');
const { truncate, formatBytes, escapeHtml, extractVerificationCode } = require('../utils/helpers');
const { parseSearchQuery } = require('../utils/validation');
const { createLoginToken } = require('../auth/loginToken');
const {
  setSearch, peekSearch, takeSearch,
  setReply, peekReply, takeReply,
  setCustomAlias, peekCustomAlias, takeCustomAlias,
  setBroadcast, peekBroadcast, takeBroadcast,
  setSubdomain, peekSubdomain, takeSubdomain,
  setSubdomainTarget, peekSubdomainTarget, takeSubdomainTarget,
  setSubdomainBody, peekSubdomainBody, takeSubdomainBody,
  setAddNode, peekAddNode, takeAddNode,
  setDeploySite, peekDeploySite, takeDeploySite,
  setSiteHtml, peekSiteHtml, takeSiteHtml
} = require('./state');
const { getDatabaseStats, getProcessStats, getCounters } = require('../monitoring/metrics');
const config = require('../../config/config');
const logger = require('../monitoring/logger');

function getLang(ctx) {
  try {
    const u = getDb().prepare('SELECT language FROM users WHERE tg_id=?').get(ctx.from.id);
    return u?.language || 'en';
  } catch {
    return 'en';
  }
}

function isOwnerOrAdmin(tgId) {
  if (config.telegram.adminId && (String(tgId) === String(config.telegram.adminId))) return true;
  try {
    const u = getDb().prepare('SELECT role FROM users WHERE tg_id=?').get(tgId);
    return u?.role === 'admin';
  } catch {
    return false;
  }
}

async function registerUser(ctx) {
  const db = getDb();
  const tgId = ctx.from.id;
  const isAdmin = isOwnerOrAdmin(tgId);
  const initialRole = isAdmin ? 'admin' : 'user';
  const e = db.prepare('SELECT tg_id,role FROM users WHERE tg_id=?').get(tgId);
  if (!e) {
    db.prepare('INSERT INTO users(tg_id,username,first_name,last_name,role,alias_limit,storage_limit) VALUES(?,?,?,?,?,999999,107374182400)')
      .run(tgId, ctx.from.username || null, ctx.from.first_name || null, ctx.from.last_name || null, initialRole);
  } else {
    if (isAdmin && e.role !== 'admin') {
      db.prepare("UPDATE users SET role='admin',last_seen_at=datetime('now') WHERE tg_id=?").run(tgId);
    } else {
      db.prepare("UPDATE users SET last_seen_at=datetime('now') WHERE tg_id=?").run(tgId);
    }
  }
}

function wrap(handler) {
  return async ctx => {
    try {
      await registerUser(ctx);
      await handler(ctx);
    } catch (err) {
      logger.error({ err: err.message, tgId: ctx.from?.id }, 'Bot handler failed');
      const txt = t('error.generic', getLang(ctx));
      if (ctx.callbackQuery) return ctx.answerCbQuery(txt).catch(() => {});
      return ctx.reply(txt).catch(() => {});
    }
  };
}

function replyHtml(ctx, text, extra = {}) {
  return ctx.reply(text, { parse_mode: 'HTML', ...extra });
}

async function send(ctx, text, extra = {}) {
  const opts = { parse_mode: 'HTML', ...extra };
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, opts);
      return;
    } catch {
      // message unchanged or too old
    }
  }
  return ctx.reply(text, opts);
}

function formatExpiryTime(dateStr) {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h left`;
  return new Date(dateStr).toLocaleDateString();
}

function aliasLines(aliases) {
  return aliases.map(a => {
    const status = a.active ? '🟢' : '🔴';
    const flame = a.burner ? '🔥 ' : '';
    const isCustom = a.alias_type === 'custom' || a.address.includes('-ca@');
    const badge = isCustom ? '🛡 ' : '';
    const expiry = formatExpiryTime(a.expires_at || a.burner_expires_at);
    const expText = expiry ? ` <i>(${expiry})</i>` : ' <i>(Unlimited)</i>';
    const labelText = a.label ? `\n   ↳ <i>${escapeHtml(truncate(a.label, 30))}</i>` : '';
    return `${status} ${flame}${badge}<code>${a.address}</code>${expText}${labelText}`;
  });
}

function aliasKeyboard(aliases) {
  const rows = [];
  for (let i = 0; i < aliases.length; i += 2) {
    const pair = [];
    pair.push({
      text: `⚙️ ${truncate(aliases[i].address.split('@')[0], 14)}`,
      callback_data: `alias_menu:${aliases[i].address}`
    });
    if (aliases[i + 1]) {
      pair.push({
        text: `⚙️ ${truncate(aliases[i + 1].address.split('@')[0], 14)}`,
        callback_data: `alias_menu:${aliases[i + 1].address}`
      });
    }
    rows.push(pair);
  }
  return rows;
}

async function showAliases(ctx, page = 1) {
  const lang = getLang(ctx);
  const { aliases, total } = getUserAliases(ctx.from.id, { page, limit: 8 });
  const totalPages = Math.ceil(total / 8);

  if (!aliases.length) {
    return send(ctx, t('alias.none', lang), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Create Alias', callback_data: 'menu:new' }, { text: '✏️ Custom Alias', callback_data: 'menu:custom_alias' }],
          [{ text: '🔥 1-Hour Burner', callback_data: 'menu:burner' }],
          [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
        ]
      }
    });
  }

  const kb = aliasKeyboard(aliases);
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `aliases:${page - 1}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `aliases:${page + 1}` });
  if (nav.length) kb.push(nav);

  kb.push([
    { text: '➕ New Alias', callback_data: 'menu:new' },
    { text: '✏️ Custom Alias', callback_data: 'menu:custom_alias' },
    { text: '🔥 1-Hour Burner', callback_data: 'menu:burner' }
  ]);
  kb.push([{ text: '🏠 Main Menu', callback_data: 'menu:home' }]);

  const content = `${t('alias.header', lang, { count: total })}\n\n${aliasLines(aliases).join('\n\n')}\n\n💡 <i>Tap any address above to copy, or tap an alias button below to manage, view QR, or delete.</i>`;
  return send(ctx, content, { reply_markup: { inline_keyboard: kb } });
}

async function showInbox(ctx, page = 1, filter, aliasFilter = null) {
  const lang = getLang(ctx);
  const { emails, total } = getEmails(ctx.from.id, {
    page,
    limit: 5,
    alias: aliasFilter || undefined,
    unread: filter === 'unread' ? true : undefined,
    starred: filter === 'starred' ? true : undefined
  });
  const totalPages = Math.ceil(total / 5);
  const header = t('inbox.header', lang, { count: total });
  const prefix = filter ? t(`inbox.filter.${filter}`, lang) : '';
  const aliasPrefix = aliasFilter ? `📬 <i>Filtering for: <code>${aliasFilter}</code></i>\n` : '';

  if (!emails.length) {
    const emptyTxt = `${prefix}${aliasPrefix}${t('inbox.empty', lang)}`;
    const emptyKb = [
      [{ text: '🔄 Refresh', callback_data: `inbox:${page}${filter ? ':' + filter : ''}` }],
      [
        { text: '➕ New Alias', callback_data: 'menu:new' },
        { text: '✏️ Custom Alias', callback_data: 'menu:custom_alias' }
      ],
      [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
    ];
    if (ctx.callbackQuery) return send(ctx, emptyTxt, { reply_markup: { inline_keyboard: emptyKb } });
    return ctx.reply(emptyTxt, { reply_markup: { inline_keyboard: emptyKb } });
  }

  const lines = emails.map(e => {
    const unreadDot = e.is_read ? '' : '🔵 ';
    const star = e.is_starred ? '⭐ ' : '';
    const spam = e.spam_classification !== 'ham' ? '⚠️ ' : '';
    const timeAgo = formatExpiryTime(e.received_at) ? `<i>(${new Date(e.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</i>` : '';
    const otp = extractVerificationCode(e.subject, e.text_body);
    const otpBadge = otp ? `\n   🔑 Code: <code>${escapeHtml(otp)}</code> <i>(Tap to copy)</i>` : '';
    const subj = escapeHtml(truncate(e.subject || '(no subject)', 35));
    const sender = escapeHtml(truncate(e.sender_name || e.sender, 30));
    return `${unreadDot}${star}${spam}<b>${subj}</b> ${timeAgo}\n   👤 From: ${sender}\n   📬 To: <code>${e.alias_address}</code>${otpBadge}`;
  });

  const kb = emails.map(e => {
    const icon = e.is_read ? '📖' : '📩';
    const st = e.is_starred ? '⭐ ' : '';
    return [{
      text: `${icon} ${st}${truncate(e.subject || '(no subject)', 30)}`,
      callback_data: `read_email:${e.id}`
    }];
  });

  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `inbox:${page - 1}${filter ? ':' + filter : ''}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `inbox:${page + 1}${filter ? ':' + filter : ''}` });
  if (nav.length) kb.push(nav);

  kb.push([
    { text: '📥 All', callback_data: 'inbox:1' },
    { text: '🔵 Unread', callback_data: 'inbox:1:unread' },
    { text: '⭐ Starred', callback_data: 'inbox:1:starred' }
  ]);
  kb.push([
    { text: '🔄 Refresh', callback_data: `inbox:${page}${filter ? ':' + filter : ''}` },
    { text: '🏠 Main Menu', callback_data: 'menu:home' }
  ]);

  return send(ctx, `${prefix}${aliasPrefix}${header}\n\n${lines.join('\n\n')}`, { reply_markup: { inline_keyboard: kb } });
}

function renderProgressBar(percentage, length = 10) {
  const filledCount = Math.min(length, Math.max(0, Math.round((percentage / 100) * length)));
  const emptyCount = length - filledCount;
  return `[${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}] ${percentage}%`;
}

function statsFor(tgId) {
  const db = getDb();
  const aliases = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id=? AND active=1').get(tgId).c;
  const emails = db.prepare('SELECT COUNT(*) as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=? AND e.is_deleted=0').get(tgId).c;
  const s = getUserStorageStats(tgId);
  const storageText = s.unlimited ? `${formatBytes(s.used)} (Unlimited)` : `${formatBytes(s.used)} / ${formatBytes(s.limit)}`;
  const progressBar = s.unlimited ? '💾 <b>Usage:</b> [██████████] Unlimited Storage' : `💾 <b>Usage:</b> ${renderProgressBar(s.percent, 10)}`;
  return {
    aliases: `${aliases} (Unlimited)`,
    emails: `${emails} (Unlimited)`,
    storage: storageText,
    progressBar
  };
}

async function showStats(ctx) {
  const lang = getLang(ctx);
  const st = statsFor(ctx.from.id);
  const content = `${t('stats.header', lang)}\n\n${t('stats.body', lang, st)}`;
  return send(ctx, content, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Refresh', callback_data: 'stats:1' }, { text: '🌐 Web Dashboard', callback_data: 'menu:web' }],
        [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
      ]
    }
  });
}

async function showSettings(ctx) {
  const lang = getLang(ctx);
  const u = getDb().prepare('SELECT language FROM users WHERE tg_id=?').get(ctx.from.id);
  const currentLang = (u?.language || 'en').toUpperCase();
  return send(ctx, t('settings.header', lang, { language: currentLang }), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: currentLang === 'EN' ? '✅ 🇬🇧 English' : '🇬🇧 English', callback_data: 'set_lang:en' },
          { text: currentLang === 'AR' ? '✅ 🇸🇦 العربية' : '🇸🇦 العربية', callback_data: 'set_lang:ar' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
      ]
    }
  });
}

async function createThrowaway(ctx, lang) {
  const d = getAllowedDomains(ctx.from.id);
  if (!d.length) return send(ctx, t('domain.none', lang));
  const a = createAlias({ tgId: ctx.from.id, domain: d[0], type: 'throwaway' });
  const exp = a.expires_at ? new Date(a.expires_at).toLocaleDateString() : 'Permanent (Unlimited)';
  const msg = t('alias.created', lang, { address: a.address, type: a.alias_type, expires: exp });
  return replyHtml(ctx, msg, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📨 View Inbox', callback_data: `alias_inbox:${a.address}:1` },
          { text: '📱 QR Code', callback_data: `qr_alias:${a.address}` }
        ],
        [
          { text: '🗑 Delete', callback_data: `delete_alias:${a.address}` },
          { text: '📧 All Aliases', callback_data: 'aliases:1' }
        ],
        [
          { text: '🏠 Main Menu', callback_data: 'menu:home' }
        ]
      ]
    }
  });
}

async function createBurnerAlias(ctx, lang) {
  const d = getAllowedDomains(ctx.from.id);
  if (!d.length) return send(ctx, t('domain.none', lang));
  const a = createAlias({ tgId: ctx.from.id, domain: d[0], type: 'burner', burner: true });
  const exp = new Date(a.burner_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg = t('burner.created', lang, { address: a.address, expires: `${exp} (~1 hour)` });
  return replyHtml(ctx, msg, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📨 View Inbox', callback_data: `alias_inbox:${a.address}:1` },
          { text: '📱 QR Code', callback_data: `qr_alias:${a.address}` }
        ],
        [
          { text: '🗑 Delete Burner', callback_data: `delete_alias:${a.address}` },
          { text: '📧 All Aliases', callback_data: 'aliases:1' }
        ],
        [
          { text: '🏠 Main Menu', callback_data: 'menu:home' }
        ]
      ]
    }
  });
}

async function createCustom(ctx, customName, lang) {
  const d = getAllowedDomains(ctx.from.id);
  if (!d.length) return send(ctx, t('domain.none', lang));
  try {
    const a = createAlias({ tgId: ctx.from.id, domain: d[0], customName });
    const exp = a.expires_at ? new Date(a.expires_at).toLocaleDateString() : 'Permanent (Unlimited)';
    const msg = t('alias.custom_created', lang, { address: a.address, type: a.alias_type, expires: exp });
    return replyHtml(ctx, msg, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📨 View Inbox', callback_data: `alias_inbox:${a.address}:1` },
            { text: '📱 QR Code', callback_data: `qr_alias:${a.address}` }
          ],
          [
            { text: '🗑 Delete', callback_data: `delete_alias:${a.address}` },
            { text: '📧 All Aliases', callback_data: 'aliases:1' }
          ],
          [
            { text: '🏠 Main Menu', callback_data: 'menu:home' }
          ]
        ]
      }
    });
  } catch (err) {
    logger.warn({ err: err.message, customName, tgId: ctx.from.id }, 'Custom alias creation rejected');
    return replyHtml(ctx, `❌ <b>Custom Alias Error:</b>\n${escapeHtml(err.message)}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Try Another Name', callback_data: 'menu:custom_alias' }],
          [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
        ]
      }
    });
  }
}

async function showCustomAliasPrompt(ctx) {
  const lang = getLang(ctx);
  setCustomAlias(ctx.from.id, {});
  return send(ctx, t('alias.custom_prompt', lang), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'menu:home' }]
      ]
    }
  });
}

async function showApiKeys(ctx) {
  const lang = getLang(ctx);
  const keys = getUserApiKeys(ctx.from.id);
  const activeKeys = keys.filter(k => !k.revoked);

  let keyLines = '';
  if (!activeKeys.length) {
    keyLines = t('api.none', lang);
  } else {
    keyLines = activeKeys.map((k, i) => {
      const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never';
      const created = new Date(k.created_at).toLocaleDateString();
      return `• <b>${escapeHtml(k.name || 'Key #' + (i + 1))}</b> (<code>${escapeHtml(k.key_prefix)}…</code>)\n  ↳ Created: <i>${created}</i> | Last used: <i>${lastUsed}</i>`;
    }).join('\n\n');
  }

  const content = t('api.header', lang, { count: activeKeys.length, keysList: keyLines });
  return send(ctx, content, apiKeysKeyboard(activeKeys));
}

async function showApiDocs(ctx) {
  const baseUrl = config.server.webUrl || 'https://commandor.my.id';
  const text = `📖 <b>TempMail REST API Documentation</b>\n─────────────────────────────\nAutomate TempMail from scripts, bots, or applications.\n\n🌐 <b>Base URL:</b> <code>${baseUrl}</code>\n🔐 <b>Header:</b> <code>Authorization: Bearer &lt;YOUR_API_KEY&gt;</code>\n\n📬 <b>Common Endpoints:</b>\n\n<b>1. List All Emails</b>\n<code>curl -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/emails</code>\n\n<b>2. Read Specific Email</b>\n<code>curl -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/emails/123</code>\n\n<b>3. List Your Aliases</b>\n<code>curl -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/aliases</code>\n\n<b>4. Create Custom Alias</b>\n<code>curl -X POST -H "Authorization: Bearer &lt;KEY&gt;" -H "Content-Type: application/json" -d '{"domain":"commandor.my.id","customName":"mytest"}' ${baseUrl}/api/aliases</code>\n\n<b>5. Delete an Email</b>\n<code>curl -X DELETE -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/emails/123</code>\n─────────────────────────────`;

  return send(ctx, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Generate API Key', callback_data: 'api_key:new' }],
        [{ text: '⬅️ Back to API Keys', callback_data: 'api_key:list' }],
        [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
      ]
    }
  });
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

async function showAdminDashboard(ctx) {
  if (!isOwnerOrAdmin(ctx.from.id)) {
    return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  }

  const db = getDb();
  const dbStats = await getDatabaseStats();
  const procStats = getProcessStats();

  const customCount = db.prepare("SELECT COUNT(*) as c FROM aliases WHERE alias_type='custom' OR address LIKE '%-ca@%'").get()?.c || 0;
  const usersToday = db.prepare("SELECT COUNT(*) as c FROM users WHERE created_at > datetime('now', '-1 day')").get()?.c || 0;
  const activeKeysCount = db.prepare("SELECT COUNT(*) as c FROM api_keys WHERE revoked=0").get()?.c || 0;

  let dbSizeBytes = 0;
  try {
    const st = fs.statSync(config.database.path);
    dbSizeBytes = st.size;
  } catch {}

  const recentEmails = db.prepare('SELECT id, alias_address, sender, sender_name, subject, received_at, spam_classification FROM emails ORDER BY id DESC LIMIT 5').all();
  let emailSnippets = '<i>No incoming emails yet.</i>';
  if (recentEmails.length) {
    emailSnippets = recentEmails.map(e => {
      const subj = escapeHtml(truncate(e.subject || '(no subject)', 28));
      const sender = escapeHtml(truncate(e.sender_name || e.sender, 20));
      const timeStr = new Date(e.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const spamBadge = e.spam_classification === 'spam' ? ' ⚠️[Spam]' : '';
      return `• <b>${subj}</b>${spamBadge}\n  ↳ To: <code>${e.alias_address}</code>\n  ↳ From: ${sender} <i>(${timeStr})</i>`;
    }).join('\n');
  }

  const recentUsers = db.prepare('SELECT tg_id, username, first_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
  let userSnippets = '<i>No users registered yet.</i>';
  if (recentUsers.length) {
    userSnippets = recentUsers.map(u => {
      const name = escapeHtml(u.username ? `@${u.username}` : (u.first_name || `User#${u.tg_id}`));
      const dateStr = new Date(u.created_at).toLocaleDateString();
      const roleTag = u.role === 'admin' ? ' 👑' : '';
      return `• ${name}${roleTag} (ID: <code>${u.tg_id}</code>) — <i>${dateStr}</i>`;
    }).join('\n');
  }

  const heapMb = (procStats.memoryHeapUsed / 1024 / 1024).toFixed(1);
  const rssMb = (procStats.memoryRss / 1024 / 1024).toFixed(1);
  const uptimeStr = formatUptime(procStats.uptime);

  const text = `👑 <b>Platform Owner & Admin Control Center</b>\n─────────────────────────────\n📊 <b>System Overview:</b>\n• 👥 <b>Total Users:</b> <b>${dbStats.users}</b> (Joined today: <b>+${usersToday}</b>)\n• 📧 <b>Active Aliases:</b> <b>${dbStats.aliases}</b> (Custom: <b>${customCount}</b>)\n• 📬 <b>Emails Received:</b> <b>${dbStats.emails}</b> (Today: <b>${dbStats.emailsToday}</b>)\n• 🔵 <b>Unread Emails:</b> <b>${dbStats.unreadEmails}</b>\n• 🛡 <b>Spam Blocked:</b> <b>${dbStats.spamToday}</b> today\n• 🔑 <b>Active API Keys:</b> <b>${activeKeysCount}</b>\n\n🖥 <b>Server & Node Health:</b>\n• ⏱ <b>Uptime:</b> ${uptimeStr}\n• 🧠 <b>RAM (Heap / RSS):</b> ${heapMb} MB / ${rssMb} MB\n• 💾 <b>DB Size:</b> ${formatBytes(dbSizeBytes)}\n• ⚙️ <b>Node.js:</b> ${procStats.nodeVersion} (PID: ${procStats.pid})\n\n🔍 <b>Recent Live Incoming Emails (Last 5):</b>\n${emailSnippets}\n\n👥 <b>Recent Users Registered (Last 5):</b>\n${userSnippets}\n─────────────────────────────\n💡 <i>Live statistics refreshed instantly.</i>`;

  return send(ctx, text, adminDashboardKeyboard(config.server.webUrl || 'https://commandor.my.id'));
}

async function showAdminEmailFeed(ctx, page = 1) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const db = getDb();
  const limit = 8;
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as c FROM emails').get().c;
  const totalPages = Math.ceil(total / limit);
  const emails = db.prepare('SELECT id, alias_address, sender, sender_name, subject, text_body, received_at, spam_classification FROM emails ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);

  if (!emails.length) {
    return send(ctx, '📬 <b>Live Email Feed:</b>\nNo emails in database.', {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]]
      }
    });
  }

  const items = emails.map(e => {
    const otp = extractVerificationCode(e.subject, e.text_body);
    const otpText = otp ? `\n   🔑 Code: <code>${escapeHtml(otp)}</code>` : '';
    const dateStr = new Date(e.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(e.received_at).toLocaleDateString();
    const spamTag = e.spam_classification === 'spam' ? ' ⚠️<b>[SPAM]</b>' : '';
    return `📬 <b>#${e.id} ${escapeHtml(truncate(e.subject || '(no subject)', 30))}</b>${spamTag}\n   ↳ To: <code>${e.alias_address}</code>\n   ↳ From: ${escapeHtml(truncate(e.sender_name || e.sender, 28))}\n   ↳ Date: <i>${dateStr}</i>${otpText}`;
  });

  const kb = [];
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `admin:emails:${page - 1}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `admin:emails:${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push([{ text: '🔄 Refresh', callback_data: `admin:emails:${page}` }, { text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]);

  return send(ctx, `📬 <b>System-Wide Live Email Feed (${total} total):</b>\n─────────────────────────────\n\n${items.join('\n\n')}`, {
    reply_markup: { inline_keyboard: kb }
  });
}

async function showAdminUserDirectory(ctx, page = 1) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const db = getDb();
  const limit = 8;
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalPages = Math.ceil(total / limit);
  const users = db.prepare('SELECT tg_id, username, first_name, role, is_banned, created_at, last_seen_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  const items = users.map(u => {
    const aliasCount = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id=? AND active=1').get(u.tg_id)?.c || 0;
    const emailCount = db.prepare('SELECT COUNT(*) as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=?').get(u.tg_id)?.c || 0;
    const name = escapeHtml(u.username ? `@${u.username}` : (u.first_name || 'Anonymous'));
    const status = u.is_banned ? '🚫 Banned' : '🟢 Active';
    const roleTag = u.role === 'admin' ? '👑 Admin' : '👤 User';
    const createdStr = new Date(u.created_at).toLocaleDateString();
    return `• <b>${name}</b> (<code>${u.tg_id}</code>)\n   ↳ ${roleTag} | ${status} | 📧 Aliases: <b>${aliasCount}</b> | 📨 Emails: <b>${emailCount}</b>\n   ↳ Joined: <i>${createdStr}</i>`;
  });

  const kb = [];
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `admin:users:${page - 1}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `admin:users:${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push([{ text: '🔄 Refresh', callback_data: `admin:users:${page}` }, { text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]);

  return send(ctx, `👥 <b>User Directory (${total} registered):</b>\n─────────────────────────────\n\n${items.join('\n\n')}`, {
    reply_markup: { inline_keyboard: kb }
  });
}

async function handleBroadcast(ctx, messageText) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const db = getDb();
  const users = db.prepare('SELECT tg_id FROM users WHERE is_banned=0').all();
  let sent = 0;
  let failed = 0;
  await ctx.reply(`📢 <b>Broadcasting to ${users.length} users...</b>`, { parse_mode: 'HTML' });

  for (const u of users) {
    try {
      await ctx.telegram.sendMessage(u.tg_id, `📢 <b>Platform Announcement:</b>\n\n${messageText}`, { parse_mode: 'HTML' });
      sent++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 40));
  }

  return ctx.reply(`✅ <b>Broadcast Completed!</b>\n\n• Successfully delivered: <b>${sent}</b>\n• Failed / Blocked: <b>${failed}</b>\n• Total users: <b>${users.length}</b>`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]]
    }
  });
}

function showUserInfo(ctx, targetTgId) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE tg_id=?').get(targetTgId);
  if (!u) return ctx.reply(`❌ User with ID ${targetTgId} not found.`);

  const aliases = db.prepare('SELECT address, active, alias_type, created_at FROM aliases WHERE tg_id=?').all(targetTgId);
  const emailCount = db.prepare('SELECT COUNT(*) as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=?').get(targetTgId)?.c || 0;

  const aliasList = aliases.length
    ? aliases.map(a => `• <code>${a.address}</code> (${a.active ? '🟢' : '🔴'}, ${a.alias_type})`).join('\n')
    : '<i>No aliases created yet.</i>';

  const text = `👤 <b>User Information:</b>\n─────────────────────────────\n• <b>ID:</b> <code>${u.tg_id}</code>\n• <b>Username:</b> ${u.username ? '@' + escapeHtml(u.username) : 'None'}\n• <b>Name:</b> ${escapeHtml(u.first_name || '')} ${escapeHtml(u.last_name || '')}\n• <b>Role:</b> <b>${u.role}</b>\n• <b>Status:</b> ${u.is_banned ? '🚫 Banned' : '🟢 Active'}\n• <b>Joined:</b> <i>${new Date(u.created_at).toLocaleString()}</i>\n• <b>Last seen:</b> <i>${u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : 'Never'}</i>\n• <b>Total Emails:</b> <b>${emailCount}</b>\n\n📧 <b>Aliases (${aliases.length}):</b>\n${aliasList}\n─────────────────────────────`;

  return replyHtml(ctx, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: u.is_banned ? '🟢 Unban User' : '🚫 Ban User', callback_data: `admin_toggle_ban:${u.tg_id}` }],
        [{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]
      ]
    }
  });
}

async function showAdminSubdomains(ctx, page = 1) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const limit = 6;
  const res = getAllSubdomainsAdmin({ page, limit });
  const subs = res.subdomains || [];
  const total = res.total || 0;
  const totalPages = res.totalPages || 1;

  if (!subs.length) {
    return send(ctx, '🌐 <b>All Subdomains:</b>\nNo subdomains registered in database.', {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]]
      }
    });
  }

  const items = subs.map(s => {
    const owner = s.username ? `@${escapeHtml(s.username)}` : `TG:${s.tg_id}`;
    return `• 🌐 <b><code>${escapeHtml(s.full_domain)}</code></b>\n   Mode: <b>${s.web_mode.toUpperCase()}</b> | Hits: <b>${s.total_requests || 0}</b> | Catch-all: ${s.email_catchall ? '✅' : '❌'}\n   Owner: ${owner}`;
  });

  const kb = [];
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `admin:subdomains:${page - 1}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `admin:subdomains:${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push([{ text: '🔄 Refresh', callback_data: `admin:subdomains:${page}` }, { text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]);

  return send(ctx, `🌐 <b>System-Wide Subdomains (${total} total):</b>\n─────────────────────────────\n\n${items.join('\n\n')}`, {
    reply_markup: { inline_keyboard: kb }
  });
}

async function showAdminSites(ctx, page = 1) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const limit = 6;
  const res = getAllSitesAdmin({ page, limit });
  const sites = res.sites || [];
  const total = res.total || 0;
  const totalPages = res.totalPages || 1;

  if (!sites.length) {
    return send(ctx, '🚀 <b>Hosted Sites Inventory:</b>\nNo sites deployed across nodes yet.', {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]]
      }
    });
  }

  const items = sites.map(s => {
    const owner = s.username ? `@${escapeHtml(s.username)}` : `TG:${s.tg_id}`;
    const statusIcon = s.status === 'active' ? '🟢' : '🔴';
    return `${statusIcon} <b><code>${escapeHtml(s.full_domain)}</code></b>\n   Owner: ${owner} | Node: ${escapeHtml(s.node_name || 'Node ' + s.node_id)}\n   Visits: <b>${s.visits_count}</b> | Storage: ${formatBytes(s.storage_used_bytes)} | Files: ${s.files_count}`;
  });

  const kb = [];
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `admin:sites:${page - 1}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `admin:sites:${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push([{ text: '🔄 Refresh', callback_data: `admin:sites:${page}` }, { text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]);

  return send(ctx, `🚀 <b>All User Hosted Sites (${total} total):</b>\n─────────────────────────────\n\n${items.join('\n\n')}`, {
    reply_markup: { inline_keyboard: kb }
  });
}

async function showAdminThreats(ctx, page = 1) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const limit = 6;
  const res = getSecurityLogs({ page, limit });
  const logs = res.logs || [];
  const total = res.total || 0;
  const totalPages = res.totalPages || 1;

  if (!logs.length) {
    return send(ctx, '🛡️ <b>Anti-Abuse Threats:</b>\nZero threats detected. All deployments are clean.', {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]]
      }
    });
  }

  const items = logs.map(l => {
    return `🚨 <b>[${escapeHtml(l.threat_type.toUpperCase())}]</b>\n   File: <code>${escapeHtml(l.file_name)}</code>\n   Pattern: <code>${escapeHtml(l.matched_pattern)}</code>\n   User: <code>TG:${l.tg_id}</code> | Time: <i>${escapeHtml(l.created_at)}</i>`;
  });

  const kb = [];
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `admin:threats:${page - 1}` });
  nav.push({ text: `📄 ${page}/${Math.max(totalPages, 1)}`, callback_data: 'noop' });
  if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `admin:threats:${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push([{ text: '🔄 Refresh', callback_data: `admin:threats:${page}` }, { text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]);

  return send(ctx, `🛡️ <b>Security & Anti-Abuse Threat Logs (${total}):</b>\n─────────────────────────────\n\n${items.join('\n\n')}`, {
    reply_markup: { inline_keyboard: kb }
  });
}

async function handleAdminVacuum(ctx) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  try {
    const db = getDb();
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
    db.prepare('PRAGMA optimize').run();
    return replyHtml(ctx, '🧹 <b>Database Optimized!</b>\n\n• SQLite WAL checkpoints flushed to disk\n• PRAGMA query planner optimizations executed\n• DB size minimized successfully.', {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back to Admin', callback_data: 'admin:dashboard' }]]
      }
    });
  } catch (err) {
    return replyHtml(ctx, `❌ Optimization failed: ${escapeHtml(err.message)}`);
  }
}

function setupCommands(bot) {
  bot.start(wrap(async ctx => {
    if (ctx.startPayload === 'login') {
      const lang = getLang(ctx);
      const token = createLoginToken(ctx.from.id);
      const url = `${config.server.webUrl}/login?token=${token}`;
      return replyHtml(ctx, t('login.link', lang, { url }), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open Web Dashboard', url }]] }
      });
    }
    const admin = isOwnerOrAdmin(ctx.from.id);
    const welcome = t('start.welcome', getLang(ctx));
    await send(ctx, welcome, {
      reply_markup: startInlineKeyboard(config.server.webUrl, admin).reply_markup
    });
    // Send persistent bottom keyboard
    await ctx.reply('⚡ <i>Use the keyboard buttons below for quick navigation anytime.</i>', {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(admin).reply_markup
    }).catch(() => {});
  }));

  bot.help(wrap(async ctx => {
    const admin = isOwnerOrAdmin(ctx.from.id);
    const kb = [
      [{ text: '➕ Create Alias', callback_data: 'menu:new' }, { text: '✏️ Custom Alias', callback_data: 'menu:custom_alias' }],
      [{ text: '📨 View Inbox', callback_data: 'inbox:1' }, { text: '🔑 API Keys', callback_data: 'api_key:list' }]
    ];
    if (admin) {
      kb.push([{ text: '👑 Owner Admin Panel', callback_data: 'admin:dashboard' }]);
    }
    kb.push([{ text: '🏠 Main Menu', callback_data: 'menu:home' }]);

    return replyHtml(ctx, t('help.text', getLang(ctx)), {
      reply_markup: { inline_keyboard: kb }
    });
  }));

  bot.command('new', wrap(async ctx => {
    const lang = getLang(ctx);
    try {
      return await createThrowaway(ctx, lang);
    } catch (err) {
      if (err.message.includes('Alias limit')) {
        return replyHtml(ctx, t('alias.limit_reached', lang, { limit: config.quotas.maxAliases }));
      }
      throw err;
    }
  }));

  bot.command('custom', wrap(async ctx => {
    const lang = getLang(ctx);
    const parts = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!parts) {
      return showCustomAliasPrompt(ctx);
    }
    return createCustom(ctx, parts, lang);
  }));

  bot.command('burner', wrap(async ctx => {
    const lang = getLang(ctx);
    try {
      return await createBurnerAlias(ctx, lang);
    } catch (err) {
      if (err.message.includes('Alias limit')) {
        return replyHtml(ctx, t('alias.limit_reached', lang, { limit: config.quotas.maxAliases }));
      }
      throw err;
    }
  }));

  bot.command('aliases', wrap(async ctx => showAliases(ctx, 1)));
  bot.command('inbox', wrap(async ctx => showInbox(ctx, 1)));
  bot.command('stats', wrap(async ctx => showStats(ctx)));
  bot.command('settings', wrap(async ctx => showSettings(ctx)));

  bot.command(['subdomains', 'subdomain'], wrap(async ctx => showSubdomains(ctx, 1)));
  bot.command(['hosting', 'sites'], wrap(async ctx => showHostingMenu(ctx)));
  bot.command(['deploy', 'newsite'], wrap(async ctx => showDeploySitePrompt(ctx)));
  bot.command('nodes', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    return showHostingNodes(ctx);
  }));
  bot.command('addnode', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    return showAddNodePrompt(ctx);
  }));
  bot.command('tos', wrap(async ctx => showHostingTOS(ctx)));
  bot.command(['api', 'keys', 'apikeys'], wrap(async ctx => showApiKeys(ctx)));

  bot.command(['admin', 'owner'], wrap(async ctx => showAdminDashboard(ctx)));

  bot.command('broadcast', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const msg = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!msg) {
      setBroadcast(ctx.from.id, true);
      return replyHtml(ctx, '📢 <b>Broadcast Announcement:</b>\nPlease reply with the text message you wish to send to all users (or /cancel).');
    }
    return handleBroadcast(ctx, msg);
  }));

  bot.command(['user', 'userinfo'], wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const target = ctx.message.text.split(' ')[1];
    if (!target) return replyHtml(ctx, 'Usage: <code>/user &lt;tg_id&gt;</code>');
    return showUserInfo(ctx, parseInt(target, 10));
  }));

  bot.command('web', wrap(async ctx => {
    const lang = getLang(ctx);
    const token = createLoginToken(ctx.from.id);
    const directUrl = `${config.server.webUrl}/login?token=${token}`;
    return replyHtml(ctx, t('web.open', lang, { url: config.server.webUrl }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Open Web Dashboard (Instant Login)', url: directUrl }],
          [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
        ]
      }
    });
  }));

  bot.command('login', wrap(async ctx => {
    const lang = getLang(ctx);
    const token = createLoginToken(ctx.from.id);
    const url = `${config.server.webUrl}/login?token=${token}`;
    return replyHtml(ctx, t('login.link', lang, { url }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔑 One-Click Sign In', url }],
          [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
        ]
      }
    });
  }));

  bot.command('search', wrap(async ctx => {
    const lang = getLang(ctx);
    const q = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!q) {
      setSearch(ctx.from.id, {});
      return replyHtml(ctx, t('search.prompt', lang));
    }
    return runSearch(ctx, q, lang);
  }));

  // Persistent keyboard buttons
  bot.hears('📧 My Aliases', wrap(ctx => showAliases(ctx, 1)));
  bot.hears('📨 Inbox', wrap(ctx => showInbox(ctx, 1)));
  bot.hears(['➕ New Alias', 'New Alias'], wrap(async ctx => {
    try {
      return await createThrowaway(ctx, getLang(ctx));
    } catch (err) {
      return replyHtml(ctx, err.message);
    }
  }));
  bot.hears(['✏️ Custom Alias', 'Custom Alias'], wrap(ctx => showCustomAliasPrompt(ctx)));
  bot.hears(['🔥 Burner', '🔥 1-Hour Burner', '1-Hour Burner'], wrap(async ctx => {
    try {
      return await createBurnerAlias(ctx, getLang(ctx));
    } catch (err) {
      return replyHtml(ctx, err.message);
    }
  }));
  bot.hears(['🔑 API Keys', 'API Keys'], wrap(ctx => showApiKeys(ctx)));
  bot.hears(['🌐 Subdomains', 'Subdomains'], wrap(ctx => showSubdomains(ctx, 1)));
  bot.hears(['🖥️ Cloud Hosting', 'Cloud Hosting', 'Hosting'], wrap(async ctx => showHostingMenu(ctx)));
  bot.hears('🔎 Search', wrap(async ctx => {
    setSearch(ctx.from.id, {});
    return replyHtml(ctx, t('search.prompt', getLang(ctx)));
  }));
  bot.hears('⚙️ Settings', wrap(ctx => showSettings(ctx)));
  bot.hears('📊 Statistics', wrap(ctx => showStats(ctx)));
  bot.hears(['👑 Owner Admin Panel', 'Admin Panel', '👑 Admin Panel'], wrap(ctx => showAdminDashboard(ctx)));
  bot.hears(['🌐 Web Dashboard', '🌐 Open Web Inbox', 'Web Dashboard'], wrap(async ctx => {
    const lang = getLang(ctx);
    const token = createLoginToken(ctx.from.id);
    const url = `${config.server.webUrl}/login?token=${token}`;
    return replyHtml(ctx, t('web.open', lang, { url: config.server.webUrl }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Launch Web App', url }]
        ]
      }
    });
  }));

  bot.on('text', wrap(async ctx => {
    if (ctx.message.text.startsWith('/')) return;

    // Check custom alias creation state
    const customState = peekCustomAlias(ctx.from.id);
    if (customState) {
      takeCustomAlias(ctx.from.id);
      return createCustom(ctx, ctx.message.text.trim(), getLang(ctx));
    }

    // Check subdomain creation state
    const subState = peekSubdomain(ctx.from.id);
    if (subState) {
      takeSubdomain(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Subdomain claim cancelled.');
      }
      return handleSubdomainClaim(ctx, ctx.message.text.trim());
    }

    // Check subdomain target update state
    const targetState = peekSubdomainTarget(ctx.from.id);
    if (targetState) {
      takeSubdomainTarget(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Target URL update cancelled.');
      }
      return handleSubdomainTargetUpdate(ctx, targetState.subdomainId, ctx.message.text.trim());
    }

    // Check subdomain body update state
    const bodyState = peekSubdomainBody(ctx.from.id);
    if (bodyState) {
      takeSubdomainBody(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Content update cancelled.');
      }
      return handleSubdomainBodyUpdate(ctx, bodyState.subdomainId, ctx.message.text.trim());
    }

    // Check node adding state
    const addNodeState = peekAddNode(ctx.from.id);
    if (addNodeState) {
      takeAddNode(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Node setup cancelled.');
      }
      return handleAddNodeConnection(ctx, ctx.message.text.trim());
    }

    // Direct match: if admin inputs connection string host:port:user:pass
    if (isOwnerOrAdmin(ctx.from.id) && ctx.message.text.includes(':') && ctx.message.text.split(':').length >= 3) {
      return handleAddNodeConnection(ctx, ctx.message.text.trim());
    }

    // Check deploy site name state
    const deployState = peekDeploySite(ctx.from.id);
    if (deployState) {
      takeDeploySite(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Deployment cancelled.');
      }
      return handleDeploySiteName(ctx, ctx.message.text.trim());
    }

    // Check deploy site HTML content state
    const htmlState = peekSiteHtml(ctx.from.id);
    if (htmlState) {
      takeSiteHtml(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Deployment cancelled.');
      }
      return handleDeploySiteContent(ctx, htmlState.siteName, ctx.message.text);
    }

    // Check broadcast state
    const broadcastState = peekBroadcast(ctx.from.id);
    if (broadcastState) {
      takeBroadcast(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Broadcast cancelled.');
      }
      return handleBroadcast(ctx, ctx.message.text.trim());
    }

    // Check email reply state
    const replyState = peekReply(ctx.from.id);
    if (replyState) {
      takeReply(ctx.from.id);
      await sendReply({
        originalEmailId: replyState.emailId,
        tgId: ctx.from.id,
        replyText: ctx.message.text
      });
      return replyHtml(ctx, t('reply.sent', getLang(ctx)), {
        reply_markup: {
          inline_keyboard: [[{ text: '📨 Back to Inbox', callback_data: 'inbox:1' }]]
        }
      });
    }

    // Check email search state
    const searchState = peekSearch(ctx.from.id);
    const query = (searchState ? ctx.message.text : '').trim();
    if (!searchState) return;
    takeSearch(ctx.from.id);
    return runSearch(ctx, query, getLang(ctx));
  }));

  bot.on('document', wrap(async ctx => {
    const doc = ctx.message.document;
    if (!doc || !doc.file_name?.toLowerCase().endsWith('.zip')) {
      return replyHtml(ctx, 'ℹ️ If you want to deploy a website from a file, please send a <b>.zip</b> archive containing your site (with <code>index.html</code>).');
    }

    const deployState = peekDeploySite(ctx.from.id);
    let siteName = deployState ? deployState.siteName : null;
    if (!siteName) {
      siteName = doc.file_name.toLowerCase().replace(/\.zip$/, '').replace(/[^a-z0-9-]/g, '').slice(0, 25);
      if (siteName.length < 3) siteName = `site-${Date.now().toString().slice(-5)}`;
    } else {
      takeDeploySite(ctx.from.id);
    }

    await replyHtml(ctx, `⏳ <b>Downloading & Scanning ZIP archive '${escapeHtml(doc.file_name)}'...</b>`);
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(fileLink.href);
      const arrayBuffer = await res.arrayBuffer();
      const zipBuffer = Buffer.from(arrayBuffer);

      return await handleDeploySiteZip(ctx, siteName, zipBuffer);
    } catch (err) {
      return replyHtml(ctx, `❌ <b>Deployment Error:</b>\n${escapeHtml(err.message)}`);
    }
  }));
}

async function runSearch(ctx, query, lang) {
  const { ftsQuery } = parseSearchQuery(query);
  if (!ftsQuery) return replyHtml(ctx, t('search.empty', lang));
  const { emails } = getEmails(ctx.from.id, { search: ftsQuery, limit: 5 });
  if (!emails.length) {
    return replyHtml(ctx, t('search.none', lang, { query: escapeHtml(query) }), {
      reply_markup: {
        inline_keyboard: [[{ text: '📨 Back to Inbox', callback_data: 'inbox:1' }]]
      }
    });
  }

  const lines = emails.map(e => {
    const star = e.is_starred ? '⭐ ' : '';
    const otp = extractVerificationCode(e.subject, e.text_body);
    const otpBadge = otp ? `\n   🔑 Code: <code>${escapeHtml(otp)}</code>` : '';
    return `${star}<b>${escapeHtml(truncate(e.subject || '(no subject)', 45))}</b>\n   👤 From: ${escapeHtml(truncate(e.sender, 35))}${otpBadge}`;
  });

  const buttons = emails.map(e => [{
    text: `📖 ${truncate(e.subject || '(no subject)', 30)}`,
    callback_data: `read_email:${e.id}`
  }]);
  buttons.push([{ text: '⬅️ Back to Inbox', callback_data: 'inbox:1' }]);

  return send(ctx, `${t('search.header', lang, { query: escapeHtml(query) })}\n\n${lines.join('\n\n')}`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showSubdomains(ctx, page = 1) {
  const { subdomains, total } = getUserSubdomains(ctx.from.id, { page, limit: 8 });

  let text = `🌐 <b>Subdomain Service</b>\n\n`;
  text += `Claim your own personal subdomains under <code>commandor.my.id</code>!\n`;
  text += `• <b>Email Routing:</b> Automatic catch-all (<code>*@yoursub.commandor.my.id</code>) delivers directly to your Telegram inbox.\n`;
  text += `• <b>Web Routing:</b> Reverse proxy to any server/port, redirect, static HTML, or webhook request inspector.\n\n`;

  if (subdomains.length === 0) {
    text += `<i>You haven't claimed any subdomains yet.</i>\n\nClick below to claim your first subdomain!`;
  } else {
    text += `<b>Your Active Subdomains (${subdomains.length}):</b>\n`;
    for (const s of subdomains) {
      const mode = (s.web_mode || 'landing').toUpperCase();
      const status = s.active ? '🟢' : '🔴';
      text += `\n${status} <b><code>${escapeHtml(s.full_domain)}</code></b>\n   Web: <b>${mode}</b> | 📧 ${s.emails_received} emails | 🌐 ${s.web_requests_count} hits`;
    }
  }

  return replyHtml(ctx, text, subdomainListKeyboard(subdomains, page, total));
}

async function showSubdomainDetails(ctx, id) {
  const sub = getSubdomainById(id, ctx.from.id);
  if (!sub) return replyHtml(ctx, '❌ Subdomain not found or unauthorized.');

  const modeUpper = (sub.web_mode || 'landing').toUpperCase();
  const catchAllText = sub.email_catch_all ? '✅ Active (Receiving all <code>*@' + escapeHtml(sub.full_domain) + '</code>)' : '❌ Disabled (Explicit aliases only)';
  const webStatus = sub.web_enabled ? '✅ Enabled' : '⏸ Paused';
  const targetText = sub.web_target ? `<code>${escapeHtml(sub.web_target)}</code>` : '<i>Not configured</i>';
  const customBodyPreview = sub.web_custom_body ? `<code>${escapeHtml(truncate(sub.web_custom_body, 60))}</code>` : '<i>None</i>';

  let text = `🌐 <b>Subdomain Management</b>\n\n`;
  text += `Domain: <b><code>${escapeHtml(sub.full_domain)}</code></b>\n`;
  text += `Status: ${sub.active ? '🟢 Active' : '🔴 Paused'}\n\n`;
  text += `<b>📧 Email Routing:</b>\n`;
  text += `• Catch-All: ${catchAllText}\n`;
  if (sub.email_webhook_url) {
    text += `• Forwarding Webhook: <code>${escapeHtml(sub.email_webhook_url)}</code>\n`;
  }
  text += `• Emails Received: <b>${sub.emails_received}</b>\n\n`;
  text += `<b>🌐 Web/HTTP Routing:</b>\n`;
  text += `• Web Traffic: ${webStatus}\n`;
  text += `• Routing Mode: <b>${modeUpper}</b>\n`;
  if (sub.web_mode === 'proxy' || sub.web_mode === 'redirect') {
    text += `• Target URL: ${targetText}\n`;
  } else if (sub.web_mode === 'static') {
    text += `• Static Body: ${customBodyPreview} (HTTP ${sub.web_custom_status || 200})\n`;
  }
  text += `• Requests Handled: <b>${sub.web_requests_count}</b>\n`;
  text += `• Last Active: ${sub.last_active_at ? escapeHtml(sub.last_active_at) : '<i>Never</i>'}\n`;

  return replyHtml(ctx, text, subdomainActionsKeyboard(sub));
}

async function showClaimSubdomainPrompt(ctx) {
  setSubdomain(ctx.from.id, { step: 'claim' });
  let text = `🌐 <b>Claim Your Subdomain:</b>\n\n`;
  text += `Choose a subdomain name (3 to 63 letters, numbers, or hyphens).\n`;
  text += `Your domain will be: <b><code>&lt;name&gt;.commandor.my.id</code></b>\n\n`;
  text += `Example: send <code>mybot</code> or <code>myproject</code>\n\n`;
  text += `<i>Reply with your chosen name below (or send /cancel to abort):</i>`;
  return replyHtml(ctx, text);
}

async function handleSubdomainClaim(ctx, name) {
  try {
    const sub = claimSubdomain({
      tgId: ctx.from.id,
      subdomain: name
    });
    let text = `🎉 <b>Subdomain Claimed Successfully!</b>\n\n`;
    text += `Your full domain: <b><code>${escapeHtml(sub.full_domain)}</code></b>\n\n`;
    text += `• <b>Catch-All Email is ACTIVE:</b> Send emails to <code>anything@${escapeHtml(sub.full_domain)}</code> and they will arrive directly in your bot!\n`;
    text += `• <b>Web Routing is READY:</b> You can configure proxy, redirect, or inspect webhooks below.`;
    return replyHtml(ctx, text, subdomainActionsKeyboard(sub));
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Could not claim subdomain:</b>\n${escapeHtml(err.message)}\n\nUse /subdomain to view your subdomains.`);
  }
}

async function handleSubdomainTargetUpdate(ctx, subdomainId, targetUrl) {
  try {
    const sub = updateSubdomain(subdomainId, ctx.from.id, { web_target: targetUrl });
    let text = `✅ <b>Target URL Updated!</b>\n\n`;
    text += `Subdomain: <b><code>${escapeHtml(sub.full_domain)}</code></b>\n`;
    text += `Target: <code>${escapeHtml(sub.web_target)}</code>`;
    return replyHtml(ctx, text, subdomainActionsKeyboard(sub));
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Failed to update target:</b>\n${escapeHtml(err.message)}`);
  }
}

async function handleSubdomainBodyUpdate(ctx, subdomainId, bodyContent) {
  try {
    const sub = updateSubdomain(subdomainId, ctx.from.id, { web_custom_body: bodyContent, web_mode: 'static' });
    let text = `✅ <b>Static Content Updated!</b>\n\n`;
    text += `Subdomain: <b><code>${escapeHtml(sub.full_domain)}</code></b>\n`;
    text += `Web mode has been set to <b>STATIC</b>.`;
    return replyHtml(ctx, text, subdomainActionsKeyboard(sub));
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Failed to update body:</b>\n${escapeHtml(err.message)}`);
  }
}

async function showSubdomainRequests(ctx, subdomainId) {
  const sub = getSubdomainById(subdomainId, ctx.from.id);
  if (!sub) return replyHtml(ctx, '❌ Subdomain not found.');

  const requests = getSubdomainWebRequests(subdomainId, ctx.from.id, 8);
  let text = `📊 <b>Captured Requests for <code>${escapeHtml(sub.full_domain)}</code></b>\n\n`;

  if (requests.length === 0) {
    text += `<i>No web requests captured yet.</i>\n\nSwitch mode to <b>WEBHOOK</b> to inspect incoming HTTP requests sent to this domain!`;
  } else {
    for (const r of requests) {
      text += `• <b>${escapeHtml(r.method)}</b> <code>${escapeHtml(r.path)}</code>\n`;
      text += `   IP: <code>${escapeHtml(r.ip || 'unknown')}</code> | Time: ${escapeHtml(r.created_at)}\n`;
      if (r.body) {
        text += `   Body: <code>${escapeHtml(truncate(r.body, 70))}</code>\n`;
      }
      text += `\n`;
    }
  }

  return replyHtml(ctx, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Refresh Requests', callback_data: `subdomain:requests:${sub.id}` }],
        [{ text: '⬅️ Back to Subdomain', callback_data: `subdomain:view:${sub.id}` }]
      ]
    }
  });
}

async function showHostingMenu(ctx) {
  const admin = isOwnerOrAdmin(ctx.from.id);
  const sites = getUserSites(ctx.from.id, admin);
  const limits = checkUserLimits(ctx.from.id);

  let text = `🖥️ <b>Cloud Hosting Service</b>\n\n`;
  text += `Deploy simple websites, HTML portfolios, and landing pages across high-speed edge clusters!\n\n`;
  text += `• <b>Active Sites:</b> ${sites.length} / ${limits.plan.max_sites}\n`;
  text += `• <b>Current Plan:</b> <b>${escapeHtml(limits.plan.name)}</b> (${formatBytes(limits.plan.max_storage_bytes)})\n`;
  text += `• <b>Auto Subdomain:</b> Every site gets an instant <code>&lt;name&gt;.commandor.my.id</code> URL!\n`;
  text += `• <b>Active Threat Shield:</b> Built-in real-time security scanner protecting against malware, phishing, and crypto exploits.\n\n`;

  if (sites.length === 0) {
    text += `<i>You have not deployed any sites yet. Click below to launch your first website!</i>`;
  } else {
    text += `<b>Your Sites (${sites.length}):</b>\n`;
    for (const s of sites) {
      const statusIcon = s.status === 'active' ? '🟢' : '🔴';
      text += `\n${statusIcon} <b><code>${escapeHtml(s.full_domain)}</code></b>\n   Hits: <b>${s.visits_count}</b> | Storage: ${formatBytes(s.storage_used_bytes)} | Files: <b>${s.files_count}</b>`;
    }
  }

  return replyHtml(ctx, text, hostingMainMenuKeyboard(admin));
}

async function showDeploySitePrompt(ctx) {
  const limits = checkUserLimits(ctx.from.id);
  if (!limits.canCreate) {
    return replyHtml(ctx, `⚠️ <b>Plan Limit Reached!</b>\n\nYour <b>${escapeHtml(limits.plan.name)}</b> allows up to ${limits.plan.max_sites} site(s). Please delete an existing site or contact admin to upgrade.`);
  }

  setDeploySite(ctx.from.id, { step: 'name' });
  let text = `🚀 <b>Deploy a New Site:</b>\n\n`;
  text += `Choose a name for your website (3 to 30 characters, letters, numbers, hyphens).\n`;
  text += `Your site will be available at: <b><code>&lt;name&gt;.commandor.my.id</code></b>\n\n`;
  text += `<i>Reply with your chosen name below (or send /cancel):</i>`;
  return replyHtml(ctx, text);
}

async function showAddNodePrompt(ctx) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  setAddNode(ctx.from.id, { step: 'connect' });
  let text = `🖥️ <b>Add a Cloud Server Node (Ubuntu VPS):</b>\n\n`;
  text += `Simply reply with your connection string in the format:\n`;
  text += `<code>host:port:user:pass</code>\n`;
  text += `or\n`;
  text += `<code>host:user:pass</code> (default port 22)\n\n`;
  text += `<i>Example:</i>\n<code>198.51.100.25:22:root:mypassword</code>\n\n`;
  text += `⚡ <b>The system will automatically:</b>\n`;
  text += `1. Connect via SSH into the container\n`;
  text += `2. Detect CPU, RAM, and Disk specifications\n`;
  text += `3. Set up directory <code>/var/www/nodesites</code>\n`;
  text += `4. Start the multi-site web runner daemon\n`;
  text += `5. Connect the node into the hosting pool!\n\n`;
  text += `<i>Send the connection string below (or /cancel):</i>`;
  return replyHtml(ctx, text);
}

async function showHostingTOS(ctx) {
  const tos = getTOS();
  let text = `📜 <b>${escapeHtml(tos.title)}</b>\n──────────────────\n`;
  text += `${escapeHtml(tos.content)}\n──────────────────\n`;
  text += `<i>By deploying any site on this service, you strictly agree to these terms.</i>`;
  return replyHtml(ctx, text, {
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Back to Hosting', callback_data: 'hosting:menu' }]]
    }
  });
}

async function showHostingSites(ctx) {
  const admin = isOwnerOrAdmin(ctx.from.id);
  const sites = getUserSites(ctx.from.id, admin);
  let text = `📋 <b>Your Hosted Sites (${sites.length})</b>\n\n`;
  if (sites.length === 0) {
    text += `<i>No sites currently deployed.</i>\n\nUse /deploy to create your first site!`;
  } else {
    for (const s of sites) {
      const statusIcon = s.status === 'active' ? '🟢' : '🔴';
      text += `\n${statusIcon} <b><code>${escapeHtml(s.full_domain)}</code></b>\n`;
      text += `   Visits: <b>${s.visits_count}</b> | Storage: ${formatBytes(s.storage_used_bytes)} | Files: ${s.files_count}\n`;
    }
  }
  return replyHtml(ctx, text, hostingSitesListKeyboard(sites));
}

async function showHostingSiteDetails(ctx, id) {
  const admin = isOwnerOrAdmin(ctx.from.id);
  const site = getSiteById(id, ctx.from.id, admin);
  if (!site) return replyHtml(ctx, '❌ Site not found or unauthorized.');

  let text = `🌐 <b>Site Details: ${escapeHtml(site.name)}</b>\n\n`;
  text += `• <b>Domain:</b> <code>${escapeHtml(site.full_domain)}</code>\n`;
  text += `• <b>Status:</b> ${site.status === 'active' ? '🟢 Active' : '🔴 Suspended'}\n`;
  if (admin && site.node_name) {
    text += `• <b>Server Node:</b> ${escapeHtml(site.node_name)} (${site.node_status || 'online'})\n`;
  }
  text += `• <b>Storage Used:</b> ${formatBytes(site.storage_used_bytes)}\n`;
  text += `• <b>Total Files:</b> ${site.files_count}\n`;
  text += `• <b>Visitor Hits:</b> ${site.visits_count}\n`;
  text += `• <b>Last Deployed:</b> ${escapeHtml(site.last_deployed_at || site.created_at)}\n`;

  return replyHtml(ctx, text, hostingSiteActionsKeyboard(site));
}

async function showHostingNodes(ctx) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const nodes = listNodes({ onlyActive: false });
  let text = `🖥️ <b>Server Hosting Nodes (${nodes.length})</b>\n\n`;
  if (nodes.length === 0) {
    text += `<i>No server nodes connected yet. Use /addnode to connect your first Ubuntu VPS container!</i>`;
  } else {
    for (const n of nodes) {
      const icon = n.status === 'online' ? '🟢' : '🔴';
      const cpus = n.system_info?.cpus || 1;
      const ram = n.system_info?.ramMb ? `${n.system_info.ramMb}MB` : 'Unknown';
      text += `\n${icon} <b>${escapeHtml(n.name)}</b>\n`;
      text += `   Host: <code>${escapeHtml(n.host)}:${n.port}</code>\n`;
      text += `   Specs: ${cpus} vCPU | ${ram} RAM | Disk: ${n.system_info?.freeDisk || 'N/A'}\n`;
      text += `   Hosted Sites: <b>${n.current_sites}</b> / ${n.max_sites}\n`;
    }
  }
  return replyHtml(ctx, text, hostingNodesKeyboard(nodes));
}

async function showHostingPlans(ctx) {
  const { getDb } = require('../../database/database');
  const plans = getDb().prepare('SELECT * FROM hosting_plans ORDER BY max_sites ASC').all();
  let text = `📦 <b>Hosting Packs & Limits</b>\n──────────────────\n`;
  for (const p of plans) {
    const isDef = p.is_default ? ' (Default)' : '';
    text += `\n• <b>${escapeHtml(p.name)}</b>${isDef}\n`;
    text += `   Max Sites: <b>${p.max_sites}</b>\n`;
    text += `   Storage Quota: <b>${formatBytes(p.max_storage_bytes)}</b>\n`;
    text += `   Max Files: <b>${p.max_files}</b>\n`;
    text += `   Monthly Requests: <b>${p.max_requests_monthly.toLocaleString()}</b>\n`;
    text += `   Node.js/Python: ${p.allow_nodejs ? '✅ Allowed' : '❌ Static Only'}\n`;
  }
  text += `\n──────────────────\n<i>Anti-Malware & Phishing scanner is enforced on all plans.</i>`;
  return replyHtml(ctx, text, {
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Back to Hosting', callback_data: 'hosting:menu' }]]
    }
  });
}

async function handleAddNodeConnection(ctx, connectionText) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  await replyHtml(ctx, '⏳ <b>Connecting to Server Node via SSH...</b>\n• Verifying credentials\n• Probing system specs\n• Installing site runner...');
  try {
    const parsed = parseNodeConnectionString(connectionText);
    const node = await testAndProvisionNode({
      host: parsed.host,
      port: parsed.port,
      username: parsed.username,
      password: parsed.password
    });

    const cpus = node.system_info?.cpus || 1;
    const ram = node.system_info?.ramMb ? `${node.system_info.ramMb}MB` : '512MB';

    let text = `🎉 <b>Server Node Connected!</b>\n\n`;
    text += `• <b>Node Name:</b> <code>${escapeHtml(node.name)}</code>\n`;
    text += `• <b>Host:</b> <code>${escapeHtml(node.host)}:${node.port}</code>\n`;
    text += `• <b>Status:</b> 🟢 Online\n`;
    text += `• <b>Hardware:</b> ${cpus} vCPU | ${ram} RAM | Free: ${node.system_info?.freeDisk || 'OK'}\n`;
    text += `• <b>Sites Capacity:</b> Up to ${node.max_sites} sites\n\n`;
    text += `<i>The server node is active and ready in the hosting cluster!</i>`;

    return replyHtml(ctx, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖥️ View All Nodes', callback_data: 'hosting:nodes' }],
          [{ text: '➕ Deploy Site Now', callback_data: 'hosting:deploy_prompt' }]
        ]
      }
    });
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Connection / Setup Failed:</b>\n${escapeHtml(err.message)}\n\nPlease double check your server's host, port, username, and password.`);
  }
}

async function handleDeploySiteName(ctx, name) {
  const cleanName = name.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  if (cleanName.length < 3 || cleanName.length > 30) {
    return replyHtml(ctx, '❌ Site name must be between 3 and 30 alphanumeric characters. Please try again or /cancel.');
  }

  setSiteHtml(ctx.from.id, { siteName: cleanName });
  let text = `📝 <b>Website Content for <code>${escapeHtml(cleanName)}.commandor.my.id</code></b>\n\n`;
  text += `Choose how to provide your website:\n`;
  text += `1. <b>Reply with HTML code:</b> send your HTML markup directly in text!\n`;
  text += `2. <b>Send a .zip file:</b> attach a zip archive containing your HTML, CSS, images, and JS files!\n\n`;
  text += `🛡️ <i>All uploads are automatically scanned for phishing, miners, and malware to protect platform safety. Send your code or file below (or /cancel):</i>`;
  return replyHtml(ctx, text);
}

async function handleDeploySiteContent(ctx, siteName, htmlContent) {
  await replyHtml(ctx, `⏳ <b>Scanning and deploying <code>${escapeHtml(siteName)}</code>...</b>`);
  try {
    const admin = isOwnerOrAdmin(ctx.from.id);
    const site = await deploySite({
      tgId: ctx.from.id,
      name: siteName,
      rawHtml: htmlContent,
      tosAccepted: true
    });

    let text = `🎉 <b>Website Deployed Successfully!</b>\n\n`;
    text += `🌐 <b>Live Domain:</b> <a href="http://${escapeHtml(site.full_domain)}">http://${escapeHtml(site.full_domain)}</a>\n\n`;
    if (admin && site.node_name) {
      text += `• <b>Server:</b> ${escapeHtml(site.node_name)}\n`;
    }
    text += `• <b>Security Scan:</b> ✅ Passed (Zero threats detected)\n`;
    text += `• <b>Storage:</b> ${formatBytes(site.storage_used_bytes)}\n\n`;
    text += `<i>Your website is now accessible worldwide!</i>`;

    return replyHtml(ctx, text, hostingSiteActionsKeyboard(site));
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Deployment Error:</b>\n${escapeHtml(err.message)}`);
  }
}

async function handleDeploySiteZip(ctx, siteName, zipBuffer) {
  await replyHtml(ctx, `⏳ <b>Scanning ZIP archive and deploying <code>${escapeHtml(siteName)}</code>...</b>`);
  try {
    const admin = isOwnerOrAdmin(ctx.from.id);
    const site = await deploySite({
      tgId: ctx.from.id,
      name: siteName,
      zipBuffer,
      tosAccepted: true
    });

    let text = `🎉 <b>ZIP Archive Deployed Successfully!</b>\n\n`;
    text += `🌐 <b>Live Domain:</b> <a href="http://${escapeHtml(site.full_domain)}">http://${escapeHtml(site.full_domain)}</a>\n\n`;
    if (admin && site.node_name) {
      text += `• <b>Server:</b> ${escapeHtml(site.node_name)}\n`;
    }
    text += `• <b>Files Deployed:</b> ${site.files_count} files\n`;
    text += `• <b>Security Scan:</b> ✅ Passed (Zero threats detected)\n`;
    text += `• <b>Storage:</b> ${formatBytes(site.storage_used_bytes)}\n\n`;
    text += `<i>Your site is now live!</i>`;

    return replyHtml(ctx, text, hostingSiteActionsKeyboard(site));
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Deployment Error:</b>\n${escapeHtml(err.message)}`);
  }
}

module.exports = {
  setupCommands,
  showInbox,
  showAliases,
  showSettings,
  registerUser,
  getLang,
  send,
  replyHtml,
  wrap,
  statsFor,
  showStats,
  createThrowaway,
  createBurnerAlias,
  createCustom,
  showCustomAliasPrompt,
  showApiKeys,
  showApiDocs,
  showAdminDashboard,
  showAdminEmailFeed,
  showAdminUserDirectory,
  showAdminSubdomains,
  showAdminSites,
  showAdminThreats,
  handleAdminVacuum,
  showUserInfo,
  isOwnerOrAdmin,
  showSubdomains,
  showSubdomainDetails,
  showClaimSubdomainPrompt,
  handleSubdomainClaim,
  handleSubdomainTargetUpdate,
  handleSubdomainBodyUpdate,
  showSubdomainRequests,
  showHostingMenu,
  showDeploySitePrompt,
  showAddNodePrompt,
  showHostingTOS,
  showHostingSites,
  showHostingSiteDetails,
  showHostingNodes,
  showHostingPlans,
  handleAddNodeConnection,
  handleDeploySiteName,
  handleDeploySiteContent,
  handleDeploySiteZip
};
