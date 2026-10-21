'use strict';
const { getDb } = require('../../database/database');
const { getEmailById, markRead, markStarred, softDeleteEmail } = require('../services/emailService');
const { deleteAlias, deactivateAlias, activateAlias } = require('../services/aliasService');
const { createApiKey, revokeApiKey, VALID_SCOPES } = require('../services/apiKeyService');
const {
  showInbox,
  showAliases,
  showStats,
  showSettings,
  createThrowaway,
  createBurnerAlias,
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
  showSubdomainRequests,
  showHostingMenu,
  showDeploySitePrompt,
  showAddNodePrompt,
  showHostingTOS,
  showHostingSites,
  showHostingSiteDetails,
  showHostingNodes,
  showHostingPlans,
  send,
  replyHtml
} = require('./commands');
const {
  mainMenuKeyboard,
  startInlineKeyboard,
  emailActionsKeyboard,
  aliasActionsKeyboard
} = require('./keyboards');
const { setReply, setBroadcast, setSubdomainTarget, setSubdomainBody, setSiteHtml } = require('./state');
const { getSubdomainById, updateSubdomain, deleteSubdomain } = require('../services/subdomainService');
const { deleteSite, getSiteById } = require('../services/hostingService');
const { generateQRBuffer } = require('../utils/qr');
const { truncate, escapeHtml, extractVerificationCode } = require('../utils/helpers');
const { createLoginToken } = require('../auth/loginToken');
const { t } = require('./i18n');
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

function setupCallbacks(bot) {
  bot.on('callback_query', async ctx => {
    const data = ctx.callbackQuery.data;
    if (!data) return ctx.answerCbQuery().catch(() => {});
    const [action, ...rest] = data.split(':');
    const param = rest.join(':');
    const lang = getLang(ctx);
    const admin = isOwnerOrAdmin(ctx.from.id);

    try {
      switch (action) {
        case 'noop':
          await ctx.answerCbQuery().catch(() => {});
          break;

        case 'inbox': {
          await ctx.answerCbQuery().catch(() => {});
          const parts = param ? param.split(':') : ['1'];
          const page = parseInt(parts[0], 10) || 1;
          const filt = parts[1] || undefined;
          await showInbox(ctx, page, filt);
          break;
        }

        case 'alias_inbox': {
          await ctx.answerCbQuery().catch(() => {});
          const parts = param ? param.split(':') : [];
          const address = parts[0];
          const page = parseInt(parts[1], 10) || 1;
          await showInbox(ctx, page, undefined, address);
          break;
        }

        case 'aliases':
          await ctx.answerCbQuery().catch(() => {});
          await showAliases(ctx, parseInt(param, 10) || 1);
          break;

        case 'stats':
          await ctx.answerCbQuery().catch(() => {});
          await showStats(ctx);
          break;

        case 'menu': {
          await ctx.answerCbQuery().catch(() => {});
          if (param === 'home') {
            await send(ctx, t('start.welcome', lang), {
              reply_markup: startInlineKeyboard(config.server.webUrl, admin).reply_markup
            });
          } else if (param === 'new') {
            try {
              await createThrowaway(ctx, lang);
            } catch (e) {
              await replyHtml(ctx, e.message);
            }
          } else if (param === 'custom_alias') {
            await showCustomAliasPrompt(ctx);
          } else if (param === 'burner') {
            try {
              await createBurnerAlias(ctx, lang);
            } catch (e) {
              await replyHtml(ctx, e.message);
            }
          } else if (param === 'settings') {
            await showSettings(ctx);
          } else if (param === 'subdomains') {
            await showSubdomains(ctx, 1);
          } else if (param === 'web') {
            const token = createLoginToken(ctx.from.id);
            const url = `${config.server.webUrl}/login?token=${token}`;
            await replyHtml(ctx, t('login.link', lang, { url }), {
              reply_markup: {
                inline_keyboard: [[{ text: '🌐 Launch Web App', url }]]
              }
            });
          }
          break;
        }

        case 'subdomain':
        case 'subdomains': {
          await ctx.answerCbQuery().catch(() => {});
          const parts = param.split(':');
          const subAction = parts[0];
          const subParam = parts[1];

          if (subAction === 'list') {
            await showSubdomains(ctx, parseInt(subParam, 10) || 1);
          } else if (subAction === 'view') {
            await showSubdomainDetails(ctx, parseInt(subParam, 10));
          } else if (subAction === 'claim_prompt') {
            await showClaimSubdomainPrompt(ctx);
          } else if (subAction === 'toggle_catchall') {
            const id = parseInt(subParam, 10);
            const sub = getSubdomainById(id, ctx.from.id);
            if (sub) {
              updateSubdomain(id, ctx.from.id, { email_catch_all: !sub.email_catch_all });
              await showSubdomainDetails(ctx, id);
            }
          } else if (subAction === 'toggle_web') {
            const id = parseInt(subParam, 10);
            const sub = getSubdomainById(id, ctx.from.id);
            if (sub) {
              updateSubdomain(id, ctx.from.id, { web_enabled: !sub.web_enabled });
              await showSubdomainDetails(ctx, id);
            }
          } else if (subAction === 'change_mode') {
            const id = parseInt(subParam, 10);
            const sub = getSubdomainById(id, ctx.from.id);
            if (sub) {
              const modes = ['landing', 'proxy', 'redirect', 'static', 'webhook'];
              const currentIdx = modes.indexOf(sub.web_mode || 'landing');
              const nextMode = modes[(currentIdx + 1) % modes.length];
              updateSubdomain(id, ctx.from.id, { web_mode: nextMode });
              await showSubdomainDetails(ctx, id);
            }
          } else if (subAction === 'set_target') {
            const id = parseInt(subParam, 10);
            setSubdomainTarget(ctx.from.id, { subdomainId: id });
            await replyHtml(ctx, `🎯 <b>Set Target URL for Subdomain:</b>\n\nEnter the destination URL (e.g. <code>http://127.0.0.1:8080</code> or <code>https://my-app.vercel.app</code>).\n\n<i>Reply with the URL below (or /cancel):</i>`);
          } else if (subAction === 'set_body') {
            const id = parseInt(subParam, 10);
            setSubdomainBody(ctx.from.id, { subdomainId: id });
            await replyHtml(ctx, `📝 <b>Set Custom Static HTML/Body:</b>\n\nEnter the HTML or text you want this subdomain to serve.\n\n<i>Reply with the content below (or /cancel):</i>`);
          } else if (subAction === 'requests') {
            const id = parseInt(subParam, 10);
            await showSubdomainRequests(ctx, id);
          } else if (subAction === 'new_alias') {
            const id = parseInt(subParam, 10);
            const sub = getSubdomainById(id, ctx.from.id);
            if (sub) {
              const { createAlias } = require('../services/aliasService');
              const alias = createAlias({
                tgId: ctx.from.id,
                domain: sub.full_domain,
                type: 'custom'
              });
              await replyHtml(ctx, `🎉 <b>New Alias Created on Subdomain!</b>\n\nAddress: <code>${escapeHtml(alias.address)}</code>\n\nAll emails will be routed directly to your inbox.`);
              await showSubdomainDetails(ctx, id);
            }
          } else if (subAction === 'delete') {
            const id = parseInt(subParam, 10);
            const sub = getSubdomainById(id, ctx.from.id);
            if (!sub) return;
            await replyHtml(ctx, `⚠️ <b>Delete Subdomain ${escapeHtml(sub.full_domain)}?</b>\n\nThis will release the subdomain and delete any aliases associated with it.`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🗑 Yes, Delete Subdomain', callback_data: `subdomain:confirm_delete:${id}` }],
                  [{ text: '❌ Cancel', callback_data: `subdomain:view:${id}` }]
                ]
              }
            });
          } else if (subAction === 'confirm_delete') {
            const id = parseInt(subParam, 10);
            deleteSubdomain(id, ctx.from.id);
            await ctx.answerCbQuery('🗑 Subdomain deleted').catch(() => {});
            await showSubdomains(ctx, 1);
          }
          break;
        }

        case 'hosting': {
          await ctx.answerCbQuery().catch(() => {});
          const parts = param.split(':');
          const hostAction = parts[0];
          const hostParam = parts[1];

          if (hostAction === 'add_node_prompt' || hostAction === 'nodes' || hostAction === 'node_info') {
            if (!isOwnerOrAdmin(ctx.from.id)) {
              return ctx.answerCbQuery('Access denied: Owner only.').catch(() => {});
            }
          }

          if (hostAction === 'menu') {
            await showHostingMenu(ctx);
          } else if (hostAction === 'deploy_prompt') {
            await showDeploySitePrompt(ctx);
          } else if (hostAction === 'add_node_prompt') {
            await showAddNodePrompt(ctx);
          } else if (hostAction === 'tos') {
            await showHostingTOS(ctx);
          } else if (hostAction === 'sites') {
            await showHostingSites(ctx);
          } else if (hostAction === 'site') {
            await showHostingSiteDetails(ctx, parseInt(hostParam, 10));
          } else if (hostAction === 'nodes') {
            await showHostingNodes(ctx);
          } else if (hostAction === 'plans') {
            await showHostingPlans(ctx);
          } else if (hostAction === 'delete_site') {
            const id = parseInt(hostParam, 10);
            const site = getSiteById(id, ctx.from.id);
            if (!site) return;
            await replyHtml(ctx, `⚠️ <b>Delete website ${escapeHtml(site.name)}?</b>\n\nThis will remove all files from the node and release the subdomain <code>${escapeHtml(site.full_domain)}</code>.`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🗑 Yes, Delete Site', callback_data: `hosting:confirm_delete_site:${id}` }],
                  [{ text: '❌ Cancel', callback_data: `hosting:site:${id}` }]
                ]
              }
            });
          } else if (hostAction === 'confirm_delete_site') {
            const id = parseInt(hostParam, 10);
            await deleteSite(id, ctx.from.id);
            await ctx.answerCbQuery('🗑 Site deleted').catch(() => {});
            await showHostingSites(ctx);
          } else if (hostAction === 'update_html') {
            const id = parseInt(hostParam, 10);
            const site = getSiteById(id, ctx.from.id);
            if (!site) return;
            setSiteHtml(ctx.from.id, { siteName: site.name });
            await replyHtml(ctx, `📝 <b>Update Content for ${escapeHtml(site.name)}</b>\n\nReply with the new HTML markup or send a new .zip archive (or /cancel):`);
          }
          break;
        }

        case 'api_key': {
          await ctx.answerCbQuery().catch(() => {});
          if (param === 'list') {
            await showApiKeys(ctx);
          } else if (param === 'docs') {
            await showApiDocs(ctx);
          } else if (param === 'new') {
            const shortName = `TG-Key-${Date.now().toString().slice(-4)}`;
            const created = createApiKey({ tgId: ctx.from.id, name: shortName, scopes: VALID_SCOPES });
            const baseUrl = config.server.webUrl || 'https://commandor.my.id';
            const msg = `🎉 <b>New API Key Generated!</b>\n──────────────────\n🔑 <b>API Token:</b>\n<code>${created.rawKey}</code>\n<i>(Tap key above to copy)</i>\n\n⚠️ <b>Important:</b> Store this key safely. It will never be shown again!\n\n📌 <b>Example cURL Request:</b>\n<code>curl -H "Authorization: Bearer ${created.rawKey}" ${baseUrl}/api/emails</code>\n\n⚙️ <b>Scopes:</b> Full Access (${created.scopes.length} permissions)\n──────────────────`;
            await replyHtml(ctx, msg, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔑 View All Keys', callback_data: 'api_key:list' }],
                  [{ text: '📖 API Documentation', callback_data: 'api_key:docs' }],
                  [{ text: '🏠 Main Menu', callback_data: 'menu:home' }]
                ]
              }
            });
          }
          break;
        }

        case 'revoke_key': {
          await ctx.answerCbQuery().catch(() => {});
          const keyId = parseInt(param, 10);
          await ctx.editMessageText(`⚠️ <b>Are you sure you want to revoke API Key #${keyId}?</b>\n\n<i>Any application or script using this key will immediately be disconnected.</i>`, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🗑 Yes, Revoke Key', callback_data: `confirm_revoke_key:${keyId}` },
                  { text: '❌ Cancel', callback_data: 'api_key:list' }
                ]
              ]
            }
          });
          break;
        }

        case 'confirm_revoke_key': {
          const keyId = parseInt(param, 10);
          revokeApiKey(keyId, ctx.from.id);
          await ctx.answerCbQuery('🗑 Key revoked successfully!').catch(() => {});
          await showApiKeys(ctx);
          break;
        }

        case 'admin': {
          await ctx.answerCbQuery().catch(() => {});
          const parts = param.split(':');
          const sub = parts[0];
          const subParam = parts[1];
          if (sub === 'dashboard') {
            await showAdminDashboard(ctx);
          } else if (sub === 'emails') {
            await showAdminEmailFeed(ctx, parseInt(subParam, 10) || 1);
          } else if (sub === 'users') {
            await showAdminUserDirectory(ctx, parseInt(subParam, 10) || 1);
          } else if (sub === 'subdomains') {
            await showAdminSubdomains(ctx, parseInt(subParam, 10) || 1);
          } else if (sub === 'sites') {
            await showAdminSites(ctx, parseInt(subParam, 10) || 1);
          } else if (sub === 'threats') {
            await showAdminThreats(ctx, parseInt(subParam, 10) || 1);
          } else if (sub === 'vacuum') {
            await handleAdminVacuum(ctx);
          } else if (sub === 'broadcast') {
            setBroadcast(ctx.from.id, true);
            await ctx.reply('📢 <b>Broadcast Announcement:</b>\nPlease reply to this chat with your announcement message. All registered users will receive it in Telegram.\n\n<i>Send /cancel to abort.</i>', {
              parse_mode: 'HTML'
            });
          }
          break;
        }

        case 'admin_toggle_ban': {
          if (!isOwnerOrAdmin(ctx.from.id)) return ctx.answerCbQuery('Access denied').catch(() => {});
          const targetTgId = parseInt(param, 10);
          const u = getDb().prepare('SELECT is_banned FROM users WHERE tg_id=?').get(targetTgId);
          if (u) {
            const nextBanned = u.is_banned ? 0 : 1;
            getDb().prepare('UPDATE users SET is_banned=? WHERE tg_id=?').run(nextBanned, targetTgId);
            await ctx.answerCbQuery(nextBanned ? '🚫 User banned' : '🟢 User unbanned').catch(() => {});
            showUserInfo(ctx, targetTgId);
          }
          break;
        }

        case 'reply': {
          await ctx.answerCbQuery().catch(() => {});
          setReply(ctx.from.id, { emailId: parseInt(param, 10) });
          await ctx.reply(t('reply.prompt', lang));
          break;
        }

        case 'read_email': {
          await ctx.answerCbQuery().catch(() => {});
          const emailId = parseInt(param, 10);
          const e = getEmailById(emailId, ctx.from.id);
          if (!e) return ctx.reply(t('error.generic', lang));

          markRead(e.id, ctx.from.id);

          const otp = extractVerificationCode(e.subject, e.text_body);
          const otpSection = otp ? `\n🔑 <b>Verification Code:</b> <code>${escapeHtml(otp)}</code> <i>(Tap to copy)</i>\n` : '';
          const senderStr = e.sender_name
            ? `${escapeHtml(e.sender_name)} &lt;${escapeHtml(e.sender)}&gt;`
            : escapeHtml(e.sender);
          const dateStr = new Date(e.received_at).toLocaleString();
          const cleanBody = truncate(e.text_body || 'No text content available in preview.', 1200);

          const text = `📬 <b>${escapeHtml(e.subject || '(no subject)')}</b>\n──────────────────\n👤 <b>From:</b> ${senderStr}\n📬 <b>To:</b> <code>${escapeHtml(e.alias_address)}</code>\n🕒 <b>Date:</b> ${dateStr}${otpSection}\n──────────────────\n\n${escapeHtml(cleanBody)}`;

          const attCount = getDb().prepare('SELECT COUNT(*) as c FROM attachments WHERE email_id=?').get(e.id)?.c || 0;

          await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...emailActionsKeyboard(e.id, Boolean(e.is_starred), attCount > 0, config.server.webUrl)
          });
          break;
        }

        case 'delete_email': {
          const emailId = parseInt(param, 10);
          softDeleteEmail(emailId, ctx.from.id);
          await ctx.answerCbQuery('🗑 Email deleted!').catch(() => {});
          await ctx.editMessageText('✅ <b>Email moved to trash.</b>', {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '📨 Back to Inbox', callback_data: 'inbox:1' }]]
            }
          });
          break;
        }

        case 'star': {
          const emailId = parseInt(param, 10);
          const e = getEmailById(emailId, ctx.from.id);
          if (!e) {
            await ctx.answerCbQuery().catch(() => {});
            return;
          }
          const newStarred = !e.is_starred;
          markStarred(emailId, ctx.from.id, newStarred);
          await ctx.answerCbQuery(newStarred ? '⭐ Starred!' : '☆ Unstarred').catch(() => {});

          const attCount = getDb().prepare('SELECT COUNT(*) as c FROM attachments WHERE email_id=?').get(emailId)?.c || 0;
          await ctx.editMessageReplyMarkup(
            emailActionsKeyboard(emailId, newStarred, attCount > 0, config.server.webUrl).reply_markup
          ).catch(() => {});
          break;
        }

        case 'read': {
          const emailId = parseInt(param, 10);
          markRead(emailId, ctx.from.id);
          await ctx.answerCbQuery('✅ Marked as read').catch(() => {});
          break;
        }

        case 'alias_menu': {
          await ctx.answerCbQuery().catch(() => {});
          const a = getDb().prepare('SELECT * FROM aliases WHERE address=? AND tg_id=?').get(param, ctx.from.id);
          if (!a) return ctx.reply(t('alias.not_found', lang));

          const statusStr = a.active ? '🟢 Active' : '🔴 Inactive (Paused)';
          const typeStr = a.burner ? '🔥 1-Hour Burner' : (a.alias_type === 'custom' || a.address.includes('-ca@') ? '🛡 Custom Protected' : (a.alias_type || 'Throwaway'));
          const createdStr = new Date(a.created_at).toLocaleString();
          const expStr = a.burner_expires_at
            ? new Date(a.burner_expires_at).toLocaleString()
            : (a.expires_at ? new Date(a.expires_at).toLocaleDateString() : 'Permanent (Unlimited)');

          const emailCount = getDb().prepare('SELECT COUNT(*) as c FROM emails WHERE alias_address=? AND is_deleted=0').get(a.address)?.c || 0;

          const text = `📧 <b>Alias Management</b>\n──────────────────\n📬 <code>${escapeHtml(a.address)}</code>\n<i>(Tap above to copy)</i>\n\n📊 <b>Status:</b> ${statusStr}\n🏷 <b>Type:</b> ${typeStr}\n📨 <b>Emails Received:</b> ${emailCount}\n🕒 <b>Created:</b> ${createdStr}\n⏳ <b>Expires:</b> ${expStr}\n──────────────────`;

          await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...aliasActionsKeyboard(a.address, Boolean(a.active))
          });
          break;
        }

        case 'toggle_alias': {
          const a = getDb().prepare('SELECT active FROM aliases WHERE address=? AND tg_id=?').get(param, ctx.from.id);
          if (!a) {
            await ctx.answerCbQuery(t('alias.not_found', lang)).catch(() => {});
            return;
          }
          if (a.active) {
            deactivateAlias(param, ctx.from.id);
            await ctx.answerCbQuery('⏸ Alias paused').catch(() => {});
          } else {
            activateAlias(param, ctx.from.id);
            await ctx.answerCbQuery('▶️ Alias activated!').catch(() => {});
          }
          const updated = getDb().prepare('SELECT * FROM aliases WHERE address=? AND tg_id=?').get(param, ctx.from.id);
          const statusStr = updated.active ? '🟢 Active' : '🔴 Inactive (Paused)';
          const typeStr = updated.burner ? '🔥 1-Hour Burner' : (updated.alias_type === 'custom' || updated.address.includes('-ca@') ? '🛡 Custom Protected' : (updated.alias_type || 'Throwaway'));
          const emailCount = getDb().prepare('SELECT COUNT(*) as c FROM emails WHERE alias_address=? AND is_deleted=0').get(param)?.c || 0;
          const text = `📧 <b>Alias Management</b>\n──────────────────\n📬 <code>${escapeHtml(param)}</code>\n<i>(Tap above to copy)</i>\n\n📊 <b>Status:</b> ${statusStr}\n🏷 <b>Type:</b> ${typeStr}\n📨 <b>Emails Received:</b> ${emailCount}\n──────────────────`;

          await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...aliasActionsKeyboard(param, Boolean(updated.active))
          }).catch(() => {});
          break;
        }

        case 'delete_alias': {
          await ctx.answerCbQuery().catch(() => {});
          await ctx.editMessageText(`⚠️ <b>Are you sure you want to delete this alias?</b>\n\n<code>${escapeHtml(param)}</code>\n\n<i>All incoming messages sent to this address will stop working.</i>`, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🗑 Yes, Delete', callback_data: `confirm_delete_alias:${param}` },
                  { text: '❌ Cancel', callback_data: `alias_menu:${param}` }
                ]
              ]
            }
          });
          break;
        }

        case 'confirm_delete_alias': {
          deleteAlias(param, ctx.from.id);
          await ctx.answerCbQuery('🗑 Deleted!').catch(() => {});
          await ctx.editMessageText(t('alias.deleted', lang, { address: escapeHtml(param) }), {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '📧 View Aliases', callback_data: 'aliases:1' }]]
            }
          });
          break;
        }

        case 'qr_alias': {
          await ctx.answerCbQuery('📱 Generating QR code...').catch(() => {});
          try {
            const buf = await generateQRBuffer(param);
            await ctx.replyWithPhoto(
              { source: buf },
              {
                caption: `📱 <b>QR Code for Email:</b>\n<code>${escapeHtml(param)}</code>\n<i>Scan to copy or compose to this address</i>`,
                parse_mode: 'HTML'
              }
            );
          } catch {
            await ctx.reply('❌ Failed to generate QR code.');
          }
          break;
        }

        case 'set_lang': {
          getDb().prepare('UPDATE users SET language=? WHERE tg_id=?').run(param, ctx.from.id);
          await ctx.answerCbQuery('✅ Language updated!').catch(() => {});
          await showSettings(ctx);
          break;
        }

        case 'attachments': {
          await ctx.answerCbQuery().catch(() => {});
          const emailId = parseInt(param, 10);
          const atts = getDb().prepare('SELECT id, filename, safe_filename, scan_status, size FROM attachments WHERE email_id=?').all(emailId);
          if (!atts.length) {
            await ctx.reply('📎 No attachments found for this email.');
            break;
          }
          const list = atts.map(a => `• <b>${escapeHtml(a.safe_filename || a.filename)}</b> (${(a.size / 1024).toFixed(1)} KB) — Status: <i>${a.scan_status}</i>`).join('\n');
          await ctx.reply(`📎 <b>Attachments (${atts.length}):</b>\n\n${list}\n\n💡 <i>Download attachments directly from the Web Dashboard.</i>`, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '⬅️ Back to Email', callback_data: `read_email:${emailId}` }]]
            }
          });
          break;
        }

        default:
          await ctx.answerCbQuery().catch(() => {});
      }
    } catch (err) {
      logger.error({ err: err.message, data }, 'Callback error');
      await ctx.answerCbQuery('An error occurred').catch(() => {});
    }
  });
}

module.exports = { setupCallbacks };
