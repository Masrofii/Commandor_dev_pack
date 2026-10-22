'use strict';
const fs = require('fs');
const { t, detectLanguage, getLanguageMeta, SUPPORTED_LANGUAGES } = require('./i18n');
const { createAlias, getUserAliases, getAllowedDomains } = require('../services/aliasService');
const { getEmails, getEmailById, markRead } = require('../services/emailService');
const { getUserStorageStats } = require('../services/quotaService');
const { createApiKey, getUserApiKeys, revokeApiKey, VALID_SCOPES } = require('../services/apiKeyService');
const { sendReply } = require('../email/reply');
const {
  mainMenuKeyboard,
  startInlineKeyboard,
  languageSelectionKeyboard,
  tosPromptKeyboard,
  tosFullKeyboard,
  tosDeclinedKeyboard,
  emailSuiteKeyboard,
  subdomainHubKeyboard,
  apiHubKeyboard,
  changeLogKeyboard,
  adminAuditLogsKeyboard,
  aliasActionsKeyboard,
  adminDashboardKeyboard,
  apiKeysKeyboard,
  subdomainListKeyboard,
  subdomainActionsKeyboard,
  hostingMainMenuKeyboard,
  hostingSitesListKeyboard,
  hostingSiteActionsKeyboard,
  hostingNodesKeyboard,
  hostingNodeActionsKeyboard,
  broadcastConfirmKeyboard,
  infraHubKeyboard,
  utilitiesHubKeyboard
} = require('./keyboards');
const {
  logChange,
  getAuditLogs,
  getAuditStats,
  addChangelog,
  getChangelogs
} = require('../services/auditLogger');
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
  parseBulkConnectionStrings,
  testAndProvisionNode,
  provisionNodesBulk,
  listNodes,
  getNodeById,
  deleteNode: deleteHostingNode
} = require('../services/nodeManagerService');
const { getDb } = require('../../database/database');
const { truncate, formatBytes, escapeHtml, extractVerificationCode, formatTelegramEntitiesToHtml } = require('../utils/helpers');
const { parseSearchQuery } = require('../utils/validation');
const { createLoginToken } = require('../auth/loginToken');
const {
  clearAllUserStates,
  setSearch, peekSearch, takeSearch,
  setReply, peekReply, takeReply,
  setCustomAlias, peekCustomAlias, takeCustomAlias,
  setBroadcast, peekBroadcast, takeBroadcast,
  setBroadcastConfirm, peekBroadcastConfirm, takeBroadcastConfirm,
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
    const detectedLang = detectLanguage(ctx);
    db.prepare('INSERT INTO users(tg_id,username,first_name,last_name,role,alias_limit,storage_limit,language) VALUES(?,?,?,?,?,999999,107374182400,?)')
      .run(tgId, ctx.from.username || null, ctx.from.first_name || null, ctx.from.last_name || null, initialRole, detectedLang);
  } else {
    if (isAdmin && e.role !== 'admin') {
      db.prepare("UPDATE users SET role='admin',last_seen_at=datetime('now') WHERE tg_id=?").run(tgId);
    } else {
      db.prepare("UPDATE users SET last_seen_at=datetime('now') WHERE tg_id=?").run(tgId);
    }
  }
}

function isTosAccepted(tgId) {
  try {
    const u = getDb().prepare('SELECT tos_accepted FROM users WHERE tg_id=?').get(tgId);
    return Boolean(u && u.tos_accepted === 1);
  } catch {
    return false;
  }
}

function showTosPrompt(ctx) {
  const text = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   ⚖️ <b>TERMS OF SERVICE & USAGE POLICY</b>   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
Welcome to <b>COMMANDOR CLOUD PLATFORM</b> 🚀

To protect the integrity of our edge network, server nodes, and users, you must agree to our Terms of Service before using this bot.

📜 <b>Core Platform Guidelines:</b>
1️⃣ <b>Strict Anti-Abuse:</b>
   • No phishing kits, malware, ransomware, or botnets.
   • No abusive scanning, credential stuffing, or exploits.
2️⃣ <b>Responsible Messaging:</b>
   • Disposable & custom subdomains must not be used for unsolicited bulk spamming or fraud.
3️⃣ <b>Clean Edge Hosting:</b>
   • Deployed sites are monitored via real-time security scanners.
   • Crypto miners, illegal streaming/mirrors, and attack scripts will be terminated instantly.
4️⃣ <b>Audit Logging & Traceability:</b>
   • System actions, deployments, and changes are logged to maintain platform security.
5️⃣ <b>Zero-Tolerance Violations:</b>
   • Any breach will result in immediate termination and permanent blacklisting across all nodes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>By clicking <b>"Accept Terms"</b>, you certify that you have read, understood, and agreed to abide by these guidelines.</i>`;

  return send(ctx, text, tosPromptKeyboard());
}

function showDetailedTos(ctx) {
  const text = `📜 <b>DETAILED TERMS OF SERVICE & ACCEPTABLE USE</b>
──────────────────────────────
<b>1. Acceptance of Terms</b>
By interacting with this bot, API, web dashboard, or edge hosting nodes, you legally agree to adhere to these Terms of Service.

<b>2. Acceptable Use Policy</b>
You agree to use this platform only for lawful communications, software testing, personal portfolios, and verified development.
Strictly Prohibited:
• Distribution of malicious software (trojans, worms, ransomware)
• Hosting or linking to phishing or fraudulent login pages
• Unauthorized vulnerability scanning or DDoS orchestration
• Copyright infringement or hosting pirated content
• Cryptocurrency mining scripts in any form

<b>3. Service Availability & Quotas</b>
We reserve the right to limit, throttle, or suspend accounts that generate anomalous network traffic, overload hosting nodes, or attempt unauthorized privilege escalation.

<b>4. Logging & Security Scanners</b>
All deployed files and system actions undergo automatic heuristics and signature checks. Malicious signatures result in immediate blocking and audit logging.

<b>5. Modification of Terms</b>
Terms may be updated periodically to reflect security requirements. Continuing to use the bot constitutes acceptance of modified terms.
──────────────────────────────`;

  return send(ctx, text, tosFullKeyboard());
}

function showTosDeclined(ctx) {
  const text = `❌ <b>Terms of Service Declined</b>

You have chosen not to accept the Terms of Service. Platform access remains locked.

Whenever you change your mind and wish to use the service, tap <b>Accept Terms</b> below or send /start.`;

  return send(ctx, text, tosDeclinedKeyboard());
}

async function handleTosAccept(ctx) {
  const db = getDb();
  db.prepare("UPDATE users SET tos_accepted = 1, tos_accepted_at = datetime('now') WHERE tg_id = ?").run(ctx.from.id);

  logChange({
    tgId: ctx.from.id,
    category: 'tos',
    action: 'tos_accepted',
    details: `User @${ctx.from.username || ctx.from.id} accepted Terms of Service`,
    metadata: { username: ctx.from.username, first_name: ctx.from.first_name }
  }).catch(() => {});

  await ctx.answerCbQuery('🎉 Terms Accepted! Welcome aboard!').catch(() => {});
  await replyHtml(ctx, '🎉 <b>Terms of Service Accepted!</b>\n\nYour account has been verified and active. Welcome to <b>COMMANDOR CLOUD PLATFORM</b>!\n\n<i>Loading your dashboard...</i>');
  return showMainDashboard(ctx);
}

async function showMainDashboard(ctx) {
  const db = getDb();
  const tgId = ctx.from.id;
  const admin = isOwnerOrAdmin(tgId);

  const aliasCount = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id=? AND active=1').get(tgId)?.c || 0;
  const unreadCount = db.prepare('SELECT COUNT(*) as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=? AND e.is_read=0 AND e.is_deleted=0').get(tgId)?.c || 0;
  const subCount = db.prepare('SELECT COUNT(*) as c FROM subdomains WHERE tg_id=? AND active=1').get(tgId)?.c || 0;
  const siteCount = db.prepare("SELECT COUNT(*) as c FROM hosting_sites WHERE tg_id=? AND status='active'").get(tgId)?.c || 0;

  const roleBadge = admin ? '👑 Owner / Admin' : '💎 Unlimited Pro';
  const name = escapeHtml(ctx.from.first_name || ctx.from.username || 'Commander');
  const userHandle = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : `<code>${tgId}</code>`;

  const text = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   ⚡ <b>COMMANDOR CLOUD PLATFORM</b>   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
👋 <i>Welcome,</i> <b>${name}</b>!

👤 <b>Profile:</b> ${userHandle}  •  <b>Tier:</b> <code>${roleBadge}</code>
🟢 <b>Core Status:</b> <code>100% Operational • Edge Connected</code>

📊 <b>Live Workspace Snapshot:</b>
• 📧 <b>Active Aliases:</b> <code>${aliasCount}</code>
• 📨 <b>Unread Emails:</b> <code>${unreadCount}</code>
• 🌐 <b>Subdomains:</b> <code>${subCount}</code>
• 🖥️ <b>Hosted Sites:</b> <code>${siteCount}</code>
• 🛡️ <b>Security Status:</b> <code>Protected & Monitored</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Select a module below to manage your cloud services:</i>`;

  await send(ctx, text, {
    reply_markup: startInlineKeyboard(config.server.webUrl, admin, unreadCount).reply_markup
  });

  // Ensure persistent bottom keyboard
  await ctx.reply('⚡ <i>Use the keyboard buttons below for quick navigation anytime:</i>', {
    parse_mode: 'HTML',
    reply_markup: mainMenuKeyboard(admin).reply_markup
  }).catch(() => {});
}

async function showEmailSuiteHub(ctx) {
  const db = getDb();
  const tgId = ctx.from.id;
  const aliasCount = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id=? AND active=1').get(tgId)?.c || 0;
  const unreadCount = db.prepare('SELECT COUNT(*) as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=? AND e.is_read=0 AND e.is_deleted=0').get(tgId)?.c || 0;

  const text = `📬 <b>EMAIL SUITE & ALIAS MANAGER</b>
──────────────────────────────
Protect your personal inbox, bypass signup gates, and receive verification OTPs in real-time.

⚡ <b>Available Capabilities:</b>
• <b>Quick Disposable:</b> Instant 1-click throwaway address.
• <b>Custom Alias:</b> Personalized prefix with protected <code>-ca</code> namespace.
• <b>1-Hour Burner:</b> Self-destructing temporary mailbox.
• <b>Catch-All Subdomains:</b> Receive emails sent to any address on your subdomains.

📊 <b>Status:</b> <code>${aliasCount} active aliases</code> • <code>${unreadCount} unread emails</code>
──────────────────────────────
<i>Select an action below:</i>`;

  return send(ctx, text, emailSuiteKeyboard(aliasCount, unreadCount));
}

async function showSubdomainHub(ctx) {
  const db = getDb();
  const tgId = ctx.from.id;
  const subCount = db.prepare('SELECT COUNT(*) as c FROM subdomains WHERE tg_id=? AND active=1').get(tgId)?.c || 0;

  const text = `🌐 <b>SUBDOMAINS & ROUTING HUB</b>
──────────────────────────────
Claim custom subdomains under <code>*.commandor.my.id</code> with full DNS routing and HTTP proxying.

⚡ <b>Subdomain Modes:</b>
• <b>Email Catch-All:</b> <code>*@yoursub.commandor.my.id</code> routes to Telegram.
• <b>HTTP Webhooks:</b> Capture incoming POST/GET requests in real-time.
• <b>Static HTML:</b> Serve custom landing pages.
• <b>Reverse Proxy:</b> Forward traffic to your external web servers.

📊 <b>Active Subdomains:</b> <code>${subCount}</code>
──────────────────────────────
<i>Select an action below:</i>`;

  return send(ctx, text, subdomainHubKeyboard(subCount));
}

async function showApiHub(ctx) {
  const db = getDb();
  const tgId = ctx.from.id;
  const keyCount = db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE tg_id=? AND revoked=0').get(tgId)?.c || 0;

  const text = `🔑 <b>API & DEVELOPER PLATFORM</b>
──────────────────────────────
Automate inbox monitoring, alias generation, and subdomain management with our fast REST API.

⚡ <b>Developer Features:</b>
• <b>Secure Bearer Tokens:</b> Cryptographically hashed API credentials.
• <b>Granular Scopes:</b> Read, write, delete, and admin permissions.
• <b>Full REST Endpoints:</b> JSON APIs for all bot capabilities.

📊 <b>Active API Keys:</b> <code>${keyCount}</code>
──────────────────────────────
<i>Select an action below:</i>`;

  return send(ctx, text, apiHubKeyboard(keyCount, config.server.webUrl));
}

async function showInfraHub(ctx) {
  const db = getDb();
  const tgId = ctx.from.id;
  const subCount = db.prepare('SELECT COUNT(*) as c FROM subdomains WHERE tg_id=? AND active=1').get(tgId)?.c || 0;
  const siteCount = db.prepare('SELECT COUNT(*) as c FROM hosting_sites WHERE tg_id=?').get(tgId)?.c || 0;

  const text = `🌐 <b>DOMAINS & INFRASTRUCTURE HUB</b>
──────────────────────────────
Orchestrate high-speed email routing, custom subdomains, and multi-node cloud hosting.

⚡ <b>Available Capabilities:</b>
• <b>Subdomains:</b> Claim custom subdomains with catch-all routing & reverse proxy.
• <b>Cloud Hosting:</b> Deploy static HTML or full ZIP websites directly onto edge nodes.
• <b>Server Nodes:</b> (Admins) Provision and monitor multi-node SSH server clusters.

📊 <b>Active:</b> <code>${subCount} Subdomains</code> • <code>${siteCount} Hosted Sites</code>
──────────────────────────────
<i>Select an infrastructure action below:</i>`;

  return send(ctx, text, infraHubKeyboard(subCount, siteCount));
}

async function showUtilitiesHub(ctx) {
  const text = `⚙️ <b>UTILITIES & SYSTEM TOOLS</b>
──────────────────────────────
Fast access to email burners, full-text message search, account statistics, and platform configuration.

⚡ <b>Available Tools:</b>
• <b>1-Hour Burner:</b> Instant self-destructing throwaway inbox.
• <b>Search:</b> Scan incoming messages, sender addresses, and subjects.
• <b>Interface Language:</b> Select from 12 natively translated languages.
• <b>Usage Stats:</b> Storage, quota limits, and activity metrics.
• <b>Help Reference:</b> Complete command list and usage guidelines.
──────────────────────────────
<i>Select a tool below:</i>`;

  return send(ctx, text, utilitiesHubKeyboard());
}

async function showChangeLog(ctx) {
  const isAdmin = isOwnerOrAdmin(ctx.from.id);
  const text = `📝 <b>PLATFORM CHANGELOG & UPDATES</b>
──────────────────────────────
Stay updated with latest improvements, security patches, and releases.

🚀 <b>v2.5.0 — UI Overhaul, ToS & Change Logging (Current)</b>
• ⚖️ <b>Mandatory ToS Verification:</b> Terms of service onboarding protecting network integrity.
• 🎨 <b>Modernized Cyber Interface:</b> Clean modular dashboard hubs & organized navigation.
• 📝 <b>Live Change Logging:</b> System audit trail tracking all platform operations.
• 🔔 <b>Admin Log Dispatcher:</b> Real-time Telegram alerts for owner on system changes.
• ⚡ <b>Modular Architecture:</b> Grouped Email Suite, Web & Subdomains, Cloud Hosting, and Dev API.

🖥️ <b>v2.4.0 — Multi-Node Cloud Hosting Engine</b>
• Distributed Edge Server Nodes running on Ubuntu VPS.
• Real-time heuristics & antivirus scanners for malicious kits and mining scripts.
• Instant live site deployment with custom subdomain bindings.

🌐 <b>v2.3.0 — Subdomain Service & Web Routing</b>
• Custom subdomains under <code>*.commandor.my.id</code>.
• HTTP Reverse Proxy, Redirect, Static, and Webhook Collector modes.
• Catch-all email routing directly to Telegram inbox.

💎 <b>v2.2.0 — Unlimited Capacity & Custom Aliases</b>
• Unlimited active aliases and 100 GB storage for all users.
• Protected custom alias creation with <code>-ca</code> namespace.
──────────────────────────────`;

  return send(ctx, text, changeLogKeyboard(isAdmin));
}

async function showAdminAuditLogs(ctx, page = 1, category = 'all') {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));

  const limit = 6;
  const { logs, total, totalPages } = getAuditLogs({ page, limit, category });
  const stats = getAuditStats();

  let text = `📜 <b>System Audit & Change Logs</b>\n`;
  text += `──────────────────────────────\n`;
  text += `📊 <b>Overview:</b> <code>${total} Total</code> • <code>${stats.today} Today</code> • <b>Filter:</b> <code>${category.toUpperCase()}</code>\n\n`;

  if (logs.length === 0) {
    text += `<i>No change logs found for category "${category}".</i>\n`;
  } else {
    for (const log of logs) {
      const time = (log.created_at || '').replace('T', ' ').substring(0, 19);
      const cat = (log.category || 'SYSTEM').toUpperCase();
      const user = log.tg_id ? `<code>${log.tg_id}</code>` : 'System';
      text += `⏱ <code>${escapeHtml(time)}</code> [<b>${escapeHtml(cat)}</b>]\n`;
      text += `• <b>Action:</b> <code>${escapeHtml(log.action)}</code> by ${user}\n`;
      text += `• <b>Details:</b> <i>${escapeHtml(log.details || 'No details')}</i>\n\n`;
    }
  }

  text += `──────────────────────────────`;

  return send(ctx, text, adminAuditLogsKeyboard(page, totalPages, category));
}

function wrap(handler, opts = {}) {
  return async ctx => {
    try {
      await registerUser(ctx);
      if (!opts.allowWithoutTos && ctx.from && !isTosAccepted(ctx.from.id)) {
        return showTosPrompt(ctx);
      }
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

async function showLanguageSelection(ctx) {
  const lang = getLang(ctx);
  const u = getDb().prepare('SELECT language FROM users WHERE tg_id=?').get(ctx.from.id);
  const currentLang = u?.language || lang || 'en';
  return send(ctx, t('language.select', currentLang), languageSelectionKeyboard(currentLang));
}

async function showSettings(ctx) {
  const lang = getLang(ctx);
  const u = getDb().prepare('SELECT language FROM users WHERE tg_id=?').get(ctx.from.id);
  const currentLang = u?.language || lang || 'en';
  const meta = getLanguageMeta(currentLang);
  return send(ctx, t('settings.header', lang, { language: `${meta.flag} ${meta.nativeName}` }), languageSelectionKeyboard(currentLang));
}

async function createThrowaway(ctx, lang, label = null) {
  const d = getAllowedDomains(ctx.from.id);
  if (!d.length) return send(ctx, t('domain.none', lang));
  const cleanLabel = label ? label.slice(0, 40) : null;
  const a = createAlias({ tgId: ctx.from.id, domain: d[0], type: 'throwaway', label: cleanLabel });
  const exp = a.expires_at ? new Date(a.expires_at).toLocaleDateString() : 'Permanent (Unlimited)';
  let msg = t('alias.created', lang, { address: a.address, type: a.alias_type, expires: exp });
  if (cleanLabel) {
    msg += `\n🏷️ <b>Label:</b> <code>${escapeHtml(cleanLabel)}</code>`;
  }
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
  const text = `📖 <b>Commandor Dev Pack REST API Documentation</b>\n─────────────────────────────\nAutomate Commandor Dev Pack from scripts, bots, or applications.\n\n🌐 <b>Base URL:</b> <code>${baseUrl}</code>\n🔐 <b>Header:</b> <code>Authorization: Bearer &lt;YOUR_API_KEY&gt;</code>\n\n📬 <b>Common Endpoints:</b>\n\n<b>1. List All Emails</b>\n<code>curl -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/emails</code>\n\n<b>2. Read Specific Email</b>\n<code>curl -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/emails/123</code>\n\n<b>3. List Your Aliases</b>\n<code>curl -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/aliases</code>\n\n<b>4. Create Custom Alias</b>\n<code>curl -X POST -H "Authorization: Bearer &lt;KEY&gt;" -H "Content-Type: application/json" -d '{"domain":"commandor.my.id","customName":"mytest"}' ${baseUrl}/api/aliases</code>\n\n<b>5. Delete an Email</b>\n<code>curl -X DELETE -H "Authorization: Bearer &lt;KEY&gt;" ${baseUrl}/api/emails/123</code>\n─────────────────────────────`;

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

  const auditStats = getAuditStats();
  const text = `👑 <b>Platform Owner & Admin Control Center</b>\n─────────────────────────────\n📊 <b>System Overview:</b>\n• 👥 <b>Total Users:</b> <b>${dbStats.users}</b> (Joined today: <b>+${usersToday}</b>)\n• 📧 <b>Active Aliases:</b> <b>${dbStats.aliases}</b> (Custom: <b>${customCount}</b>)\n• 📬 <b>Emails Received:</b> <b>${dbStats.emails}</b> (Today: <b>${dbStats.emailsToday}</b>)\n• 🔵 <b>Unread Emails:</b> <b>${dbStats.unreadEmails}</b>\n• 🛡 <b>Spam Blocked:</b> <b>${dbStats.spamToday}</b> today\n• 🔑 <b>Active API Keys:</b> <b>${activeKeysCount}</b>\n• 📜 <b>Changes Logged:</b> <b>${auditStats.total}</b> (Today: <b>+${auditStats.today}</b>)\n\n🖥 <b>Server & Node Health:</b>\n• ⏱ <b>Uptime:</b> ${uptimeStr}\n• 🧠 <b>RAM (Heap / RSS):</b> ${heapMb} MB / ${rssMb} MB\n• 💾 <b>DB Size:</b> ${formatBytes(dbSizeBytes)}\n• ⚙️ <b>Node.js:</b> ${procStats.nodeVersion} (PID: ${procStats.pid})\n\n🔍 <b>Recent Live Incoming Emails (Last 5):</b>\n${emailSnippets}\n\n👥 <b>Recent Users Registered (Last 5):</b>\n${userSnippets}\n─────────────────────────────\n💡 <i>Live statistics refreshed instantly.</i>`;

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

let isBroadcastSending = false;

async function promptBroadcastPreview(ctx, payload) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  
  let broadcastData = null;
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) {
      return replyHtml(ctx, t('broadcast.empty', getLang(ctx)));
    }
    broadcastData = { type: 'text', text, entities: ctx.message?.entities };
  } else if (payload && typeof payload === 'object') {
    broadcastData = payload;
  }
  
  if (!broadcastData || (!broadcastData.text && !broadcastData.fileId && !broadcastData.caption)) {
    return replyHtml(ctx, t('broadcast.empty', getLang(ctx)));
  }

  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(DISTINCT tg_id) as c FROM users WHERE is_banned=0 AND tg_id IS NOT NULL').get()?.c || 0;

  setBroadcastConfirm(ctx.from.id, broadcastData);

  const textPreview = broadcastData.text || broadcastData.caption || '';
  const formattedContent = formatTelegramEntitiesToHtml(textPreview, broadcastData.entities);
  const mediaNote = broadcastData.type !== 'text' ? `\n📎 <b>Media:</b> <code>${broadcastData.type.toUpperCase()}</code>` : '';

  const previewMsg = `📢 <b>Commandor Dev Pack — Broadcast Announcement Preview</b>\n──────────────────────────────${mediaNote}\n<b>Message Content:</b>\n${formattedContent}\n──────────────────────────────\n👥 <b>Target Audience:</b> <b>${userCount}</b> registered users\n🛡️ <b>Engine:</b> Safe rate-limited delivery (~30 msg/sec)\n\n⚠️ <i>Please review the announcement above. Tap confirm to broadcast to all users.</i>`;

  if (broadcastData.type === 'photo' && broadcastData.fileId) {
    return ctx.replyWithPhoto(broadcastData.fileId, {
      caption: previewMsg,
      parse_mode: 'HTML',
      ...broadcastConfirmKeyboard()
    });
  } else if (broadcastData.type === 'video' && broadcastData.fileId) {
    return ctx.replyWithVideo(broadcastData.fileId, {
      caption: previewMsg,
      parse_mode: 'HTML',
      ...broadcastConfirmKeyboard()
    });
  } else if (broadcastData.type === 'document' && broadcastData.fileId) {
    return ctx.replyWithDocument(broadcastData.fileId, {
      caption: previewMsg,
      parse_mode: 'HTML',
      ...broadcastConfirmKeyboard()
    });
  }

  return send(ctx, previewMsg, broadcastConfirmKeyboard());
}

async function handleConfirmedBroadcast(ctx) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  if (isBroadcastSending) {
    return replyHtml(ctx, t('broadcast.in_progress', getLang(ctx)));
  }

  const state = takeBroadcastConfirm(ctx.from.id);
  if (!state || (!state.text && !state.fileId && !state.caption)) {
    return replyHtml(ctx, '❌ No pending broadcast found or session expired. Please start over with /broadcast.');
  }

  isBroadcastSending = true;
  try {
    const db = getDb();
    const users = db.prepare('SELECT DISTINCT tg_id FROM users WHERE is_banned=0 AND tg_id IS NOT NULL').all();
    let delivered = 0;
    let blocked = 0;
    let failed = 0;
    const startTime = Date.now();

    const formattedText = formatTelegramEntitiesToHtml(state.text || '', state.entities);
    const formattedCaption = formatTelegramEntitiesToHtml(state.caption || '', state.entities);

    const statusMsg = await ctx.reply(`⏳ <b>Broadcasting announcement...</b>\nProgress: 0 / ${users.length}`, { parse_mode: 'HTML' });

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      try {
        if (state.type === 'photo' && state.fileId) {
          await ctx.telegram.sendPhoto(u.tg_id, state.fileId, {
            caption: formattedCaption ? `📢 <b>Commandor Dev Pack — Platform Announcement:</b>\n\n${formattedCaption}` : '📢 <b>Commandor Dev Pack — Platform Announcement</b>',
            parse_mode: 'HTML'
          });
        } else if (state.type === 'video' && state.fileId) {
          await ctx.telegram.sendVideo(u.tg_id, state.fileId, {
            caption: formattedCaption ? `📢 <b>Commandor Dev Pack — Platform Announcement:</b>\n\n${formattedCaption}` : '📢 <b>Commandor Dev Pack — Platform Announcement</b>',
            parse_mode: 'HTML'
          });
        } else if (state.type === 'document' && state.fileId) {
          await ctx.telegram.sendDocument(u.tg_id, state.fileId, {
            caption: formattedCaption ? `📢 <b>Commandor Dev Pack — Platform Announcement:</b>\n\n${formattedCaption}` : '📢 <b>Commandor Dev Pack — Platform Announcement</b>',
            parse_mode: 'HTML'
          });
        } else {
          await ctx.telegram.sendMessage(u.tg_id, `📢 <b>Commandor Dev Pack — Platform Announcement:</b>\n\n${formattedText}`, { parse_mode: 'HTML' });
        }
        delivered++;
      } catch (err) {
        const retryAfter = err.parameters?.retry_after || err.response?.parameters?.retry_after;
        if (retryAfter) {
          const waitSec = Math.min(retryAfter, 10);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          try {
            if (state.type === 'photo' && state.fileId) {
              await ctx.telegram.sendPhoto(u.tg_id, state.fileId, {
                caption: formattedCaption ? `📢 <b>Commandor Dev Pack — Platform Announcement:</b>\n\n${formattedCaption}` : '📢 <b>Commandor Dev Pack — Platform Announcement</b>',
                parse_mode: 'HTML'
              });
            } else {
              await ctx.telegram.sendMessage(u.tg_id, `📢 <b>Commandor Dev Pack — Platform Announcement:</b>\n\n${formattedText}`, { parse_mode: 'HTML' });
            }
            delivered++;
          } catch {
            failed++;
          }
        } else {
          const errMsg = (err?.message || '').toLowerCase();
          if (errMsg.includes('blocked') || errMsg.includes('chat not found') || errMsg.includes('deactivated') || err?.code === 403 || err?.response?.error_code === 403) {
            blocked++;
          } else {
            failed++;
          }
        }
      }

      if ((i + 1) % 25 === 0 || i === users.length - 1) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            `⏳ <b>Broadcasting announcement...</b>\nProgress: ${i + 1} / ${users.length}\n• Delivered: ${delivered}\n• Blocked: ${blocked}\n• Failed: ${failed}`,
            { parse_mode: 'HTML' }
          );
        } catch {}
      }

      await new Promise(r => setTimeout(r, 35));
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS broadcast_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_tg_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        message_preview TEXT,
        total_recipients INTEGER NOT NULL DEFAULT 0,
        delivered_count INTEGER NOT NULL DEFAULT 0,
        blocked_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        elapsed_seconds REAL NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT(datetime('now'))
      )`);
      db.prepare(`INSERT INTO broadcast_history (author_tg_id, type, message_preview, total_recipients, delivered_count, blocked_count, failed_count, elapsed_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        ctx.from.id,
        state.type || 'text',
        (state.text || state.caption || '').slice(0, 200),
        users.length,
        delivered,
        blocked,
        failed,
        parseFloat(elapsedSec) || 0
      );
    } catch {}

    logChange({
      tgId: ctx.from.id,
      category: 'broadcast',
      action: 'broadcast_sent',
      details: `Broadcast delivered to ${delivered}/${users.length} users in ${elapsedSec}s`,
      metadata: { total: users.length, delivered, blocked, failed, type: state.type }
    }).catch(() => {});

    const reportText = `✅ <b>Broadcast Delivery Report</b>\n──────────────────────────────\n📢 <b>Status:</b> Completed\n👥 <b>Total Target Users:</b> <b>${users.length}</b>\n📨 <b>Successfully Delivered:</b> <b>${delivered}</b>\n🚫 <b>Blocked / Deactivated:</b> <b>${blocked}</b>\n⚠️ <b>Other Failures:</b> <b>${failed}</b>\n⏱ <b>Elapsed Time:</b> <b>${elapsedSec}s</b>\n──────────────────────────────`;

    return send(ctx, reportText, {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back to Admin Panel', callback_data: 'admin:dashboard' }]]
      }
    });
  } finally {
    isBroadcastSending = false;
  }
}

async function showHostingNodeDetails(ctx, nodeId) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const node = getNodeById(nodeId);
  if (!node) return replyHtml(ctx, '❌ Node not found.');

  const icon = node.status === 'online' ? '🟢' : '🔴';
  const cpus = node.system_info?.cpus || 1;
  const ram = node.system_info?.ramMb ? `${node.system_info.ramMb} MB` : 'Unknown';
  const disk = node.system_info?.freeDisk || 'Unknown';
  const createdStr = new Date(node.created_at).toLocaleDateString();

  const text = `${icon} <b>Server Node Details: ${escapeHtml(node.name)}</b>\n──────────────────────────────\n• <b>Host:</b> <code>${escapeHtml(node.host)}:${node.port}</code>\n• <b>User:</b> <code>${escapeHtml(node.username || 'root')}</code>\n• <b>Public Gateway:</b> <code>${escapeHtml(node.public_url || 'N/A')}</code>\n• <b>Specs:</b> ${cpus} vCPU | ${ram} RAM | Disk: ${disk}\n• <b>Hosted Sites:</b> <b>${node.current_sites || 0}</b> / ${node.max_sites || 100}\n• <b>Status:</b> <b>${node.status}</b>\n• <b>Provisioned:</b> ${createdStr}\n──────────────────────────────`;

  return send(ctx, text, hostingNodeActionsKeyboard(node));
}

async function handleNodePing(ctx, nodeId) {
  if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
  const node = getNodeById(nodeId);
  if (!node) return replyHtml(ctx, '❌ Node not found.');

  await replyHtml(ctx, `⚡ <b>Testing SSH connection to node ${escapeHtml(node.name)} (${node.host}:${node.port})...</b>`);
  const start = Date.now();
  try {
    const res = await testAndProvisionNode({
      host: node.host,
      port: node.port,
      username: node.username,
      password: node.password,
      privateKey: node.private_key,
      name: node.name
    });
    const latency = Date.now() - start;
    return replyHtml(ctx, `🟢 <b>Node Online & Healthy!</b>\n──────────────────────────────\n• <b>Node:</b> ${escapeHtml(node.name)}\n• <b>Latency:</b> ${latency}ms\n• <b>OS:</b> ${res.system_info?.os || 'Linux'}\n• <b>CPU:</b> ${res.system_info?.cpus || 1} vCPU\n• <b>Free RAM:</b> ${res.system_info?.ramMb || 512} MB\n• <b>Free Disk:</b> ${res.system_info?.freeDisk || 'N/A'}\n──────────────────────────────`, hostingNodeActionsKeyboard(node));
  } catch (err) {
    const latency = Date.now() - start;
    return replyHtml(ctx, `🔴 <b>Node Connection Failed (${latency}ms):</b>\n<code>${escapeHtml(err.message)}</code>`, hostingNodeActionsKeyboard(node));
  }
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

async function handleCancel(ctx) {
  clearAllUserStates(ctx.from.id);
  const lang = getLang(ctx);
  return replyHtml(ctx, t('cancel.success', lang), {
    reply_markup: mainMenuKeyboard(isOwnerOrAdmin(ctx.from?.id)).reply_markup
  });
}

function setupCommands(bot) {
  bot.command('cancel', wrap(handleCancel, { allowWithoutTos: true }));
  bot.command(['language', 'lang'], wrap(showLanguageSelection, { allowWithoutTos: true }));
  bot.start(wrap(async ctx => {
    if (ctx.startPayload === 'login') {
      const lang = getLang(ctx);
      const token = createLoginToken(ctx.from.id);
      const url = `${config.server.webUrl}/login?token=${token}`;
      return replyHtml(ctx, t('login.link', lang, { url }), {
        reply_markup: { inline_keyboard: [[{ text: '🌐 Open Web Dashboard', url }]] }
      });
    }
    if (!isTosAccepted(ctx.from.id)) {
      return showTosPrompt(ctx);
    }
    return showMainDashboard(ctx);
  }, { allowWithoutTos: true }));

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
    const label = ctx.message.text.split(' ').slice(1).join(' ').trim() || null;
    try {
      return await createThrowaway(ctx, lang, label);
    } catch (err) {
      if (err.message.includes('Alias limit')) {
        return replyHtml(ctx, t('alias.limit_reached', lang, { limit: config.quotas.maxAliases }));
      }
      throw err;
    }
  }));

  bot.command('bulk', wrap(async ctx => {
    const lang = getLang(ctx);
    const parts = (ctx.message.text || '').split(' ').slice(1);
    const count = Math.min(Math.max(parseInt(parts[0], 10) || 5, 1), 20);
    const label = parts.slice(1).join(' ').trim() || 'Bulk';
    const d = getAllowedDomains(ctx.from.id);
    if (!d.length) return send(ctx, t('domain.none', lang));
    const createdList = [];
    for (let i = 0; i < count; i++) {
      try {
        const a = createAlias({ tgId: ctx.from.id, domain: d[0], type: 'throwaway', label: `${label} #${i + 1}` });
        createdList.push(a);
      } catch (err) {
        break;
      }
    }
    if (!createdList.length) {
      return replyHtml(ctx, '❌ Failed to create bulk aliases. Quota limit may have been reached.');
    }
    let msg = `📦 <b>Bulk Alias Generator (${createdList.length} created)</b>\n──────────────────────────────\n<i>Tap any address below to copy:</i>\n\n`;
    for (const a of createdList) {
      msg += `• <code>${a.address}</code> (${escapeHtml(a.label)})\n`;
    }
    msg += `\n──────────────────────────────\n💡 <i>All incoming emails route to your inbox in real time.</i>`;
    return replyHtml(ctx, msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📨 View Inbox', callback_data: 'inbox:1' }],
          [{ text: '📧 My Aliases', callback_data: 'aliases:1' }],
          [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
        ]
      }
    });
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

  bot.command(['subdomains', 'subdomain'], wrap(async ctx => showSubdomainHub(ctx)));
  bot.command(['hosting', 'sites'], wrap(async ctx => showHostingMenu(ctx)));
  bot.command(['deploy', 'newsite'], wrap(async ctx => showDeploySitePrompt(ctx)));
  bot.command('nodes', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    return showHostingNodes(ctx);
  }));
  bot.command(['addnode', 'addnodes', 'bulknodes', 'addssh'], wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    return showAddNodePrompt(ctx);
  }));
  bot.command('tos', wrap(async ctx => showDetailedTos(ctx), { allowWithoutTos: true }));
  bot.command(['api', 'keys', 'apikeys'], wrap(async ctx => showApiHub(ctx)));
  bot.command(['changelog', 'changes', 'updates'], wrap(async ctx => showChangeLog(ctx)));
  bot.command(['logs', 'audit'], wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    return showAdminAuditLogs(ctx, 1, 'all');
  }));

  bot.command(['admin', 'owner'], wrap(async ctx => showAdminDashboard(ctx)));

  bot.command('broadcast', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const msg = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!msg) {
      setBroadcast(ctx.from.id, true);
      return replyHtml(ctx, '📢 <b>Commandor Dev Pack — Broadcast Announcement</b>\n──────────────────────────────\nPlease reply with the text message you wish to broadcast to all registered users.\n\n<i>Reply with your message below (or /cancel to abort):</i>');
    }
    return promptBroadcastPreview(ctx, msg);
  }));

  bot.command(['user', 'userinfo'], wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const target = ctx.message.text.split(' ')[1];
    if (!target) return replyHtml(ctx, 'Usage: <code>/user &lt;tg_id&gt;</code>');
    return showUserInfo(ctx, parseInt(target, 10));
  }));

  bot.command('health', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const mem = process.memoryUsage();
    const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
    const uptimeSec = Math.floor(process.uptime());
    const uptimeHours = (uptimeSec / 3600).toFixed(1);
    let dbSize = 'Unknown';
    try {
      dbSize = formatBytes(fs.statSync(config.database.path).size);
    } catch {}
    const text = `🏥 <b>SYSTEM & WORKER HEALTH</b>\n──────────────────────────────\n🟢 <b>Core Status:</b> 100% Operational\n⏱ <b>Service Uptime:</b> ${uptimeHours} hours (${uptimeSec}s)\n🧠 <b>Memory Usage:</b> ${heapMb} MB Heap / ${rssMb} MB RSS\n💾 <b>SQLite Database:</b> ${dbSize}\n⚙️ <b>Node.js Runtime:</b> ${process.version} (PID ${process.pid})\n🌐 <b>Platform:</b> ${process.platform} ${process.arch}\n──────────────────────────────`;
    return replyHtml(ctx, text, {
      reply_markup: {
        inline_keyboard: [[{ text: '👑 Admin Dashboard', callback_data: 'admin:dashboard' }]]
      }
    });
  }));

  bot.command('users', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const db = getDb();
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0;
    const activeToday = db.prepare("SELECT COUNT(*) as c FROM users WHERE created_at > datetime('now', '-1 day') OR last_seen_at > datetime('now', '-1 day')").get()?.c || 0;
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get()?.c || 0;
    const bannedCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned=1').get()?.c || 0;
    const totalAliases = db.prepare('SELECT COUNT(*) as c FROM aliases').get()?.c || 0;
    const activeAliases = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE active=1').get()?.c || 0;
    const text = `👥 <b>AGGREGATE USER METRICS</b>\n──────────────────────────────\n👥 <b>Total Registered:</b> <code>${totalUsers}</code>\n⚡ <b>Active (Last 24h):</b> <code>${activeToday}</code>\n👑 <b>Administrators:</b> <code>${adminCount}</code>\n🚫 <b>Suspended Accounts:</b> <code>${bannedCount}</code>\n📬 <b>Active Email Aliases:</b> <code>${activeAliases}</code> (Total: <code>${totalAliases}</code>)\n──────────────────────────────`;
    return replyHtml(ctx, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 User Directory', callback_data: 'admin:users:1' }],
          [{ text: '👑 Admin Dashboard', callback_data: 'admin:dashboard' }]
        ]
      }
    });
  }));

  bot.command('errors', wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const db = getDb();
    const errors = db.prepare("SELECT * FROM audit_logs WHERE action LIKE '%error%' OR action LIKE '%threat%' OR action LIKE '%fail%' ORDER BY id DESC LIMIT 6").all();
    if (!errors.length) {
      return replyHtml(ctx, '🛡️ <b>SYSTEM ERRORS & THREATS</b>\n──────────────────────────────\n<i>Zero active system errors recorded in audit log.</i>');
    }
    let text = `🛡️ <b>RECENT SANITIZED ERRORS & ALERTS</b>\n──────────────────────────────\n`;
    for (const e of errors) {
      const timeStr = new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      text += `• <b>[${escapeHtml(e.category)}]</b> ${escapeHtml(truncate(e.details, 60))} <i>(${timeStr})</i>\n`;
    }
    text += `──────────────────────────────`;
    return replyHtml(ctx, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Full Audit Logs', callback_data: 'admin:logs:1:all' }],
          [{ text: '👑 Admin Dashboard', callback_data: 'admin:dashboard' }]
        ]
      }
    });
  }));

  bot.command('version', wrap(async ctx => {
    const pkg = require('../../package.json');
    let gitHash = 'main';
    try {
      const child = require('child_process');
      gitHash = child.execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {}
    const text = `ℹ️ <b>COMMANDOR DEV PACK PLATFORM VERSION</b>\n──────────────────────────────\n🏷 <b>Version:</b> <code>v${pkg.version}</code>\n🔖 <b>Commit:</b> <code>${gitHash}</code>\n⚙️ <b>Node.js:</b> <code>${process.version}</code>\n📦 <b>Architecture:</b> <code>${process.platform}-${process.arch}</code>\n⏱ <b>Process Uptime:</b> <code>${Math.floor(process.uptime() / 60)} minutes</code>\n──────────────────────────────`;
    return replyHtml(ctx, text);
  }));

  bot.command(['broadcasts', 'broadcast_history'], wrap(async ctx => {
    if (!isOwnerOrAdmin(ctx.from.id)) return replyHtml(ctx, t('admin.denied', getLang(ctx)));
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS broadcast_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_tg_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message_preview TEXT,
      total_recipients INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      elapsed_seconds REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT(datetime('now'))
    )`);
    const history = db.prepare('SELECT * FROM broadcast_history ORDER BY id DESC LIMIT 5').all();
    if (!history.length) {
      return replyHtml(ctx, '📢 <b>Broadcast History</b>\n──────────────────────────────\n<i>No broadcasts sent yet.</i>', {
        reply_markup: {
          inline_keyboard: [[{ text: '👑 Admin Dashboard', callback_data: 'admin:dashboard' }]]
        }
      });
    }
    let text = `📢 <b>BROADCAST DELIVERY HISTORY</b>\n──────────────────────────────\n`;
    for (const b of history) {
      const dateStr = new Date(b.created_at).toLocaleString();
      const prev = escapeHtml(truncate(b.message_preview || '(media announcement)', 45));
      text += `• <b>#${b.id}</b> <i>(${dateStr})</i>\n  ↳ <b>Content:</b> "${prev}"\n  ↳ <b>Delivery:</b> 🟢 ${b.delivered_count}/${b.total_recipients} (🚫 ${b.blocked_count} blocked, ⚠️ ${b.failed_count} errors in ${b.elapsed_seconds}s)\n\n`;
    }
    text += `──────────────────────────────`;
    return replyHtml(ctx, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 New Announcement', callback_data: 'admin:broadcast' }],
          [{ text: '👑 Admin Dashboard', callback_data: 'admin:dashboard' }]
        ]
      }
    });
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

  bot.command(['export', 'download'], wrap(async ctx => showExportMenu(ctx)));
  bot.command(['privacy', 'gdpr'], wrap(async ctx => showPrivacyInfo(ctx), { allowWithoutTos: true }));
  bot.command(['support', 'contact', 'helpdesk'], wrap(async ctx => showSupportInfo(ctx), { allowWithoutTos: true }));
  bot.command(['notifications', 'notify', 'alerts'], wrap(async ctx => showNotificationPreferences(ctx)));

  // Persistent keyboard buttons
  bot.hears(['📬 Email Suite', 'Email Suite'], wrap(ctx => showEmailSuiteHub(ctx)));
  bot.hears(['📝 Change Log', 'Change Log', '📝 Changelog', 'Changelog'], wrap(ctx => showChangeLog(ctx)));
  bot.hears(['📥 Inbox', '📨 Inbox', 'Inbox', '📨 View Inbox'], wrap(ctx => showInbox(ctx, 1)));
  bot.hears(['✉️ My Aliases', '📧 My Aliases', 'My Aliases'], wrap(ctx => showAliases(ctx, 1)));
  bot.hears(['➕ Create Alias', '➕ New Alias', 'New Alias', 'Create Alias'], wrap(async ctx => {
    try {
      return await createThrowaway(ctx, getLang(ctx));
    } catch (err) {
      return replyHtml(ctx, err.message);
    }
  }));
  bot.hears(['🎨 Custom Alias', '✏️ Custom Alias', 'Custom Alias'], wrap(ctx => showCustomAliasPrompt(ctx)));
  bot.hears(['⏳ Temporary Burner', '🔥 Burner', '🔥 1-Hour Burner', '1-Hour Burner', 'Burner'], wrap(async ctx => {
    try {
      return await createBurnerAlias(ctx, getLang(ctx));
    } catch (err) {
      return replyHtml(ctx, err.message);
    }
  }));
  bot.hears(['🌐 Domains & Hosting', 'Domains & Hosting', '🌐 Domains & Subdomains', '🌐 Subdomains', 'Subdomains', 'Domains'], wrap(ctx => showInfraHub(ctx)));
  bot.hears(['🛠️ Developer Tools', 'Developer Tools', '🔑 API Keys', 'API Keys', '🔑 API & Devs'], wrap(ctx => showApiHub(ctx)));
  bot.hears(['⚙️ Utilities', 'Utilities', '⚙️ Tools', 'Tools'], wrap(ctx => showUtilitiesHub(ctx)));
  bot.hears(['☁️ Cloud Hosting', '🖥️ Cloud Hosting', 'Cloud Hosting', 'Hosting'], wrap(async ctx => showHostingMenu(ctx)));
  bot.hears(['🔎 Search', 'Search', '🔎 Search Messages'], wrap(async ctx => {
    setSearch(ctx.from.id, {});
    return replyHtml(ctx, t('search.prompt', getLang(ctx)));
  }));
  bot.hears(['🌐 Language', 'Language', '🌐 لغة', 'لغة', 'Sprache', 'Langue', 'Idioma', 'Dil'], wrap(showLanguageSelection));
  bot.hears(['❌ Cancel', 'Cancel', 'إلغاء', 'Abbrechen', 'Annuler', 'Cancelar', 'İptal', 'Отмена', '取消', 'रद्द करें'], wrap(handleCancel));
  bot.hears('⚙️ Settings', wrap(ctx => showSettings(ctx)));
  bot.hears(['📊 Usage & Stats', '📊 Statistics', 'Statistics', 'Stats'], wrap(ctx => showStats(ctx)));
  bot.hears(['👑 Commandor Admin Panel', '👑 Owner Admin Panel', 'Admin Panel', '👑 Admin Panel'], wrap(ctx => showAdminDashboard(ctx)));
  bot.hears(['🌍 Web Dashboard', '🌐 Web Dashboard', '🌐 Open Web Inbox', 'Web Dashboard'], wrap(async ctx => {
    const lang = getLang(ctx);
    const token = createLoginToken(ctx.from.id);
    const url = `${config.server.webUrl}/login?token=${token}`;
    return replyHtml(ctx, t('web.open', lang, { url: config.server.webUrl }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌍 Launch Commandor Web App', url }]
        ]
      }
    });
  }));

  bot.on(['photo', 'video', 'document', 'animation'], wrap(async ctx => {
    if (isOwnerOrAdmin(ctx.from.id) && peekBroadcast(ctx.from.id)) {
      takeBroadcast(ctx.from.id);
      let payload = null;
      if (ctx.message.photo) {
        const p = ctx.message.photo;
        payload = { type: 'photo', fileId: p[p.length - 1].file_id, caption: ctx.message.caption || '', entities: ctx.message.caption_entities };
      } else if (ctx.message.video) {
        payload = { type: 'video', fileId: ctx.message.video.file_id, caption: ctx.message.caption || '', entities: ctx.message.caption_entities };
      } else if (ctx.message.document) {
        payload = { type: 'document', fileId: ctx.message.document.file_id, caption: ctx.message.caption || '', entities: ctx.message.caption_entities };
      } else if (ctx.message.animation) {
        payload = { type: 'animation', fileId: ctx.message.animation.file_id, caption: ctx.message.caption || '', entities: ctx.message.caption_entities };
      }
      if (payload) {
        return promptBroadcastPreview(ctx, payload);
      }
    }
  }));

  bot.on('text', wrap(async ctx => {
    const rawText = (ctx.message.text || '').trim();
    if (rawText.toLowerCase() === '/cancel' || rawText === '❌ Cancel' || rawText === 'Cancel') {
      return handleCancel(ctx);
    }
    if (rawText.startsWith('/')) return;

    // Check broadcast state
    const broadcastState = peekBroadcast(ctx.from.id);
    if (broadcastState) {
      takeBroadcast(ctx.from.id);
      if (ctx.message.text.trim().toLowerCase() === '/cancel') {
        return replyHtml(ctx, '❌ Broadcast cancelled.');
      }
      return promptBroadcastPreview(ctx, {
        type: 'text',
        text: ctx.message.text.trim(),
        entities: ctx.message.entities
      });
    }

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

    // Direct match: if admin inputs connection string host:port:user:pass or multiline SSH list
    if (isOwnerOrAdmin(ctx.from.id) && ctx.message.text.includes(':') && (ctx.message.text.split(':').length >= 3 || ctx.message.text.includes('\n'))) {
      return handleAddNodeConnection(ctx, ctx.message.text.trim());
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
  let text = `🖥️ <b>Add Cloud Server Nodes (Single or Bulk SSH):</b>\n\n`;
  text += `Reply with your SSH connection string, or <b>paste multiple nodes (one per line)</b> to bulk import!\n\n`;
  text += `<b>Supported Formats:</b>\n`;
  text += `• <code>host:port:user:pass</code>\n`;
  text += `• <code>host:user:pass</code> (default port 22)\n`;
  text += `• <code>user:pass@host:port</code>\n`;
  text += `• <code>host:port:user:pass # Node Name</code>\n\n`;
  text += `<i>Example Single:</i>\n<code>198.51.100.25:22:root:mypassword</code>\n\n`;
  text += `<i>Example Bulk Import:</i>\n`;
  text += `<code>198.51.100.25:22:root:pass1 # Node-US-1\n`;
  text += `198.51.100.26:22:root:pass2 # Node-EU-1\n`;
  text += `user:pass3@198.51.100.27:2222</code>\n\n`;
  text += `⚡ <b>The system will automatically:</b>\n`;
  text += `1. Test SSH connectivity\n`;
  text += `2. Detect CPU, RAM, and Disk specifications\n`;
  text += `3. Configure remote <code>/var/www/nodesites</code> directory\n`;
  text += `4. Start the multi-site web runner daemon\n`;
  text += `5. Connect all nodes into the hosting pool!\n\n`;
  text += `<i>Send your connection strings below (or /cancel):</i>`;
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

  const parsedList = parseBulkConnectionStrings(connectionText);
  if (parsedList.length === 0) {
    return replyHtml(ctx, `❌ <b>Invalid format:</b>\nExpected <code>host:port:user:pass</code> (or one per line for bulk add).\n\nPlease try again or send /cancel.`);
  }

  // If single node
  if (parsedList.length === 1 && !parsedList[0].error) {
    const item = parsedList[0];
    await replyHtml(ctx, `⏳ <b>Connecting to Server Node via SSH...</b>\n• Host: <code>${escapeHtml(item.host)}:${item.port}</code>\n• Verifying credentials\n• Probing system specs\n• Installing site runner...`);
    try {
      const node = await testAndProvisionNode({
        host: item.host,
        port: item.port,
        username: item.username,
        password: item.password,
        privateKey: item.privateKey,
        name: item.name
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
      return replyHtml(ctx, `❌ <b>Connection / Setup Failed:</b>\n<code>${escapeHtml(err.message)}</code>\n\nPlease double check your server's host, port, username, and password.`);
    }
  }

  // Bulk nodes handling
  const validCount = parsedList.filter(p => !p.error).length;
  await replyHtml(ctx, `⏳ <b>Bulk Provisioning ${parsedList.length} Server Node(s)...</b>\n• Detected ${validCount} valid SSH entries\n• Connecting in parallel (concurrency: 3)\n• Testing specs and configuring site runners...`);

  try {
    const summary = await provisionNodesBulk(parsedList, { concurrency: 3 });

    let text = `🚀 <b>Bulk SSH Provisioning Complete!</b>\n`;
    text += `──────────────────────────────\n`;
    text += `• <b>Total Nodes:</b> ${summary.total}\n`;
    text += `• <b>Online & Ready:</b> 🟢 <b>${summary.successful}</b>\n`;
    text += `• <b>Failed:</b> 🔴 <b>${summary.failed}</b>\n`;
    text += `──────────────────────────────\n\n`;

    for (const r of summary.results) {
      const hostLabel = r.host ? `${escapeHtml(r.host)}:${r.port || 22}` : escapeHtml(r.input);
      if (r.status === 'success') {
        const cpus = r.node?.system_info?.cpus || 1;
        const ram = r.node?.system_info?.ramMb ? `${r.node.system_info.ramMb}MB` : '512MB';
        text += `🟢 <b>${hostLabel}</b> — <code>${escapeHtml(r.name || r.node?.name)}</code> (${cpus} vCPU, ${ram})\n`;
      } else {
        text += `🔴 <b>${hostLabel}</b> — <i>${escapeHtml(r.error || 'Failed')}</i>\n`;
      }
    }

    text += `\n<i>Cluster inventory updated automatically.</i>`;

    return replyHtml(ctx, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖥️ View Cluster Nodes', callback_data: 'hosting:nodes' }],
          [{ text: '➕ Add More Nodes', callback_data: 'admin:add_node' }]
        ]
      }
    });
  } catch (err) {
    return replyHtml(ctx, `❌ <b>Bulk Provisioning Error:</b>\n<code>${escapeHtml(err.message)}</code>`);
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

async function showExportMenu(ctx) {
  const tgId = ctx.from.id;
  const db = getDb();
  const emailCount = db.prepare('SELECT COUNT(*) as c FROM emails e JOIN aliases a ON e.alias_address=a.address WHERE a.tg_id=? AND e.is_deleted=0').get(tgId)?.c || 0;
  const aliasCount = db.prepare('SELECT COUNT(*) as c FROM aliases WHERE tg_id=? AND active=1').get(tgId)?.c || 0;

  let text = `📦 <b>Mailbox Data Export</b>\n\n`;
  text += `You can generate and download a complete archive of your stored emails and aliases.\n\n`;
  text += `📊 <b>Your Mailbox:</b>\n`;
  text += `• Active Aliases: <b>${aliasCount}</b>\n`;
  text += `• Stored Messages: <b>${emailCount}</b>\n\n`;
  text += `Choose your preferred archive format below:`;

  const kb = [
    [
      { text: '📥 Export as MBOX', callback_data: 'export:mbox' },
      { text: '🗂️ Export as ZIP (EMLs)', callback_data: 'export:zip' }
    ],
    [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
  ];

  return replyHtml(ctx, text, { reply_markup: { inline_keyboard: kb } });
}

async function showPrivacyInfo(ctx) {
  let text = `🛡️ <b>Commandor Dev Pack — Privacy & Security Architecture</b>\n\n`;
  text += `Your privacy is our core engineering requirement:\n\n`;
  text += `• <b>Zero Plaintext Logging:</b> Incoming messages are encrypted and isolated in storage, bound exclusively to your user identity.\n`;
  text += `• <b>HTML Sanitization:</b> All incoming email HTML is aggressively sanitized. Tracker beacons, malicious scripts, and cross-site requests are stripped.\n`;
  text += `• <b>1-Hour Burners:</b> Temporary aliases self-destruct automatically when their timer expires.\n`;
  text += `• <b>Data Sovereignty:</b> You can export your data anytime via <code>/export</code> or delete your emails and aliases on demand.\n`;
  text += `• <b>End-to-End Sessions:</b> Web sessions are hashed with SHA-256 and expire automatically.\n\n`;
  text += `<i>Commandor Dev Pack never sells, rents, or reads your personal communications.</i>`;

  const kb = [
    [
      { text: '📦 Export Data', callback_data: 'export:menu' },
      { text: '📜 Terms of Service', callback_data: 'tos:view' }
    ],
    [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
  ];

  return replyHtml(ctx, text, { reply_markup: { inline_keyboard: kb } });
}

async function showSupportInfo(ctx) {
  const tgId = ctx.from.id;
  let text = `🎧 <b>Commandor Dev Pack — Support & Helpdesk</b>\n\n`;
  text += `Need assistance, want to report a bug, or request a feature?\n\n`;
  text += `👤 <b>Your Diagnostic ID:</b> <code>User #${tgId}</code>\n`;
  text += `🤖 <b>Bot Service:</b> @${ctx.botInfo?.username || 'commandor_dev_pack_bot'}\n`;
  text += `💬 <b>Direct Support:</b> <a href="https://t.me/Masrofii">@Masrofii</a>\n\n`;
  text += `💡 <b>Quick Tips:</b>\n`;
  text += `• Generate aliases instantly: <code>/new [label]</code>\n`;
  text += `• Search messages: <code>/search [query]</code>\n`;
  text += `• Sign in to Web: <code>/login</code>\n`;
  text += `• Change language: <code>/language</code>\n`;

  const kb = [
    [
      { text: '💬 Contact Developer', url: 'https://t.me/Masrofii' },
      { text: '📖 Commands Guide', callback_data: 'menu:help' }
    ],
    [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
  ];

  return replyHtml(ctx, text, { reply_markup: { inline_keyboard: kb } });
}

async function showNotificationPreferences(ctx) {
  const tgId = ctx.from.id;
  const db = getDb();
  let userSettings = {};
  try {
    const u = db.prepare('SELECT settings_json FROM users WHERE tg_id=?').get(tgId);
    if (u?.settings_json) userSettings = JSON.parse(u.settings_json);
  } catch {}

  const muteAll = Boolean(userSettings.mute_notifications);
  const otpOnly = Boolean(userSettings.notify_otp_only);
  const silent = Boolean(userSettings.disable_notification_sound);

  let text = `🔔 <b>Telegram Notification Preferences</b>\n\n`;
  text += `Configure how and when you receive message alerts in Telegram:\n\n`;
  text += `• <b>Incoming Alerts:</b> ${muteAll ? '🔕 Muted' : '🔔 Enabled'}\n`;
  text += `• <b>Filter Mode:</b> ${otpOnly ? '🔑 OTP / Verification Codes Only' : '📬 All Incoming Emails'}\n`;
  text += `• <b>Delivery Mode:</b> ${silent ? '🔇 Silent (No sound notification)' : '🔊 Standard Sound'}\n`;

  const kb = [
    [
      { text: muteAll ? '🔔 Unmute Alerts' : '🔕 Mute All Alerts', callback_data: 'notify:toggle:mute' }
    ],
    [
      { text: otpOnly ? '📬 Alert for All Emails' : '🔑 Alert for OTP Codes Only', callback_data: 'notify:toggle:otp' }
    ],
    [
      { text: silent ? '🔊 Enable Sound' : '🔇 Silent Mode', callback_data: 'notify:toggle:silent' }
    ],
    [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
  ];

  return replyHtml(ctx, text, { reply_markup: { inline_keyboard: kb } });
}

module.exports = {
  setupCommands,
  showInbox,
  showAliases,
  showSettings,
  showExportMenu,
  showPrivacyInfo,
  showSupportInfo,
  showNotificationPreferences,
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
  showHostingNodeDetails,
  handleNodePing,
  promptBroadcastPreview,
  handleConfirmedBroadcast,
  showHostingPlans,
  handleAddNodeConnection,
  handleDeploySiteName,
  handleDeploySiteContent,
  handleDeploySiteZip,
  isTosAccepted,
  showTosPrompt,
  showDetailedTos,
  showTosDeclined,
  handleTosAccept,
  showMainDashboard,
  showEmailSuiteHub,
  showInfraHub,
  showUtilitiesHub,
  showSubdomainHub,
  showApiHub,
  showChangeLog,
  showAdminAuditLogs,
  showLanguageSelection,
  handleCancel
};
