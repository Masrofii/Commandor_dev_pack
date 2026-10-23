'use strict';

const { t, getLanguageMeta, SUPPORTED_LANGUAGES } = require('./i18n');

function mainMenuKeyboard(isAdmin = false, lang = 'en') {
  const keyboard = [
    [t('bot.btn.email_suite', lang), t('bot.btn.inbox', lang)],
    [t('bot.btn.subdomains', lang), t('bot.btn.hosting', lang)],
    [t('bot.btn.api_keys', lang), t('bot.btn.changelog', lang)],
    [t('bot.btn.settings', lang), t('bot.btn.web_dashboard', lang)]
  ];
  if (isAdmin) {
    keyboard.push([t('bot.btn.admin_panel', lang)]);
  }
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      persistent: true
    }
  };
}

function startInlineKeyboard(webUrl = null, isAdmin = false, unreadCount = 0, lang = 'en') {
  const unreadBadge = unreadCount > 0 ? ` (${unreadCount})` : '';
  const rows = [
    [
      { text: `${t('bot.btn.email_suite', lang)}${unreadBadge}`, callback_data: 'menu:email_suite' },
      { text: t('bot.btn.subdomains', lang), callback_data: 'subdomain:hub' }
    ],
    [
      { text: t('bot.btn.hosting', lang), callback_data: 'hosting:menu' },
      { text: t('bot.btn.api_keys', lang), callback_data: 'api:hub' }
    ],
    [
      { text: `${t('bot.btn.inbox', lang)}${unreadBadge}`, callback_data: 'inbox:1' },
      { text: t('bot.btn.stats', lang), callback_data: 'stats:1' }
    ],
    [
      { text: t('bot.btn.changelog', lang), callback_data: 'menu:changelog' },
      { text: t('bot.btn.language', lang), callback_data: 'menu:language' }
    ]
  ];
  if (isAdmin) {
    rows.push([{ text: t('bot.btn.admin_panel', lang), callback_data: 'admin:dashboard' }]);
  }
  if (webUrl) {
    rows.push([{ text: t('bot.btn.web_dashboard', lang), url: webUrl }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function tosPromptKeyboard(lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t('bot.btn.accept_tos', lang), callback_data: 'tos:accept' }],
        [
          { text: t('bot.btn.read_tos', lang), callback_data: 'tos:full' },
          { text: t('bot.btn.decline_tos', lang), callback_data: 'tos:decline' }
        ]
      ]
    }
  };
}

function tosFullKeyboard(lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t('bot.btn.accept_tos', lang), callback_data: 'tos:accept' }],
        [{ text: t('bot.btn.back_summary', lang), callback_data: 'tos:prompt' }]
      ]
    }
  };
}

function tosDeclinedKeyboard(lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t('bot.btn.accept_tos', lang), callback_data: 'tos:accept' }]
      ]
    }
  };
}

function emailSuiteKeyboard(aliasCount = 0, unreadCount = 0, lang = 'en') {
  const unreadBadge = unreadCount > 0 ? ` (${unreadCount})` : '';
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `${t('bot.btn.inbox', lang)}${unreadBadge}`, callback_data: 'inbox:1' },
          { text: t('bot.btn.my_aliases', lang, { count: aliasCount }), callback_data: 'aliases:1' }
        ],
        [
          { text: t('bot.btn.new_alias', lang), callback_data: 'menu:new' },
          { text: t('bot.btn.custom_alias', lang), callback_data: 'menu:custom_alias' }
        ],
        [
          { text: t('bot.btn.burner', lang), callback_data: 'menu:burner' },
          { text: t('bot.btn.search', lang), callback_data: 'menu:search' }
        ],
        [
          { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function infraHubKeyboard(subCount = 0, siteCount = 0, lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `${t('bot.btn.subdomains', lang)} (${subCount})`, callback_data: 'subdomain:hub' },
          { text: `${t('bot.btn.hosting', lang)} (${siteCount})`, callback_data: 'hosting:menu' }
        ],
        [
          { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function utilitiesHubKeyboard(lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t('bot.btn.burner', lang), callback_data: 'menu:burner' },
          { text: t('bot.btn.search', lang), callback_data: 'menu:search' }
        ],
        [
          { text: t('bot.btn.settings', lang), callback_data: 'menu:settings' },
          { text: t('bot.btn.language', lang), callback_data: 'menu:language' }
        ],
        [
          { text: t('bot.btn.stats', lang), callback_data: 'stats:1' },
          { text: t('menu.help', lang), callback_data: 'menu:help' }
        ],
        [
          { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function subdomainHubKeyboard(subCount = 0, lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `${t('subdomains.tab_subdomains', lang)} (${subCount})`, callback_data: 'subdomain:list:1' },
          { text: t('bot.btn.claim_subdomain', lang), callback_data: 'subdomain:claim_prompt' }
        ],
        [
          { text: '📡 Webhook / Web Requests', callback_data: 'subdomain:requests:1' },
          { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function apiHubKeyboard(keyCount = 0, webUrl = null, lang = 'en') {
  const rows = [
    [
      { text: `${t('api_keys.title', lang)} (${keyCount})`, callback_data: 'api_key:list' },
      { text: t('api_keys.generate_btn', lang), callback_data: 'api_key:new' }
    ],
    [
      { text: t('api_keys.docs_title', lang), callback_data: 'api_key:docs' },
      { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
    ]
  ];
  if (webUrl) {
    rows.push([{ text: t('bot.btn.web_dashboard', lang), url: `${webUrl}/api-keys` }]);
  }
  return {
    reply_markup: {
      inline_keyboard: rows
    }
  };
}

function changeLogKeyboard(isAdmin = false, lang = 'en') {
  const rows = [
    [
      { text: `🔄 ${t('common.refresh', lang)}`, callback_data: 'menu:changelog' },
      { text: t('bot.btn.read_tos', lang), callback_data: 'tos:full' }
    ]
  ];
  if (isAdmin) {
    rows.push([{ text: `📋 ${t('settings.tab_logs', lang)}`, callback_data: 'admin:logs:1:all' }]);
  }
  rows.push([{ text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adminAuditLogsKeyboard(page = 1, totalPages = 1, currentCategory = 'all', lang = 'en') {
  const rows = [];
  
  // Category filters
  rows.push([
    { text: currentCategory === 'all' ? '• All •' : t('common.all', lang), callback_data: 'admin:logs:1:all' },
    { text: currentCategory === 'email' ? '• Email •' : 'Email', callback_data: 'admin:logs:1:email' },
    { text: currentCategory === 'hosting' ? '• Hosting •' : 'Hosting', callback_data: 'admin:logs:1:hosting' },
    { text: currentCategory === 'subdomain' ? '• Subdomains •' : 'Subdomains', callback_data: 'admin:logs:1:subdomain' }
  ]);

  // Pagination
  const nav = [];
  if (page > 1) {
    nav.push({ text: '⬅️ Prev', callback_data: `admin:logs:${page - 1}:${currentCategory}` });
  }
  nav.push({ text: `${t('common.page', lang)} ${page}/${totalPages}`, callback_data: `admin:logs:${page}:${currentCategory}` });
  if (page < totalPages) {
    nav.push({ text: 'Next ➡️', callback_data: `admin:logs:${page + 1}:${currentCategory}` });
  }
  rows.push(nav);

  rows.push([
    { text: `🔄 ${t('common.refresh', lang)}`, callback_data: `admin:logs:${page}:${currentCategory}` },
    { text: t('bot.btn.admin_panel', lang), callback_data: 'admin:dashboard' }
  ]);

  return { reply_markup: { inline_keyboard: rows } };
}

function adminDashboardKeyboard(webUrl = null, lang = 'en') {
  const rows = [
    [
      { text: `🔄 ${t('common.refresh', lang)}`, callback_data: 'admin:dashboard' },
      { text: '📬 Live Email Feed', callback_data: 'admin:emails:1' }
    ],
    [
      { text: `👥 ${t('admin.tab_users', lang)}`, callback_data: 'admin:users:1' },
      { text: `🌐 ${t('admin.tab_subdomains', lang)}`, callback_data: 'admin:subdomains:1' }
    ],
    [
      { text: `🚀 ${t('admin.tab_sites', lang)}`, callback_data: 'admin:sites:1' },
      { text: `🖥️ ${t('nav.nodes', lang)}`, callback_data: 'hosting:nodes' }
    ],
    [
      { text: `📜 ${t('settings.tab_logs', lang)}`, callback_data: 'admin:logs:1:all' },
      { text: `🛡️ ${t('admin.stat_threats', lang)}`, callback_data: 'admin:threats:1' }
    ],
    [
      { text: `📢 ${t('admin.tab_broadcast', lang)}`, callback_data: 'admin:broadcast' },
      { text: '🧹 Optimize Database', callback_data: 'admin:vacuum' }
    ],
    [
      { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
    ]
  ];
  if (webUrl) {
    rows.push([{ text: '👑 Open Web Admin Control Panel', url: `${webUrl}/admin` }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function apiKeysKeyboard(keys = [], lang = 'en') {
  const rows = [
    [
      { text: t('api_keys.generate_btn', lang), callback_data: 'api_key:new' },
      { text: t('api_keys.docs_title', lang), callback_data: 'api_key:docs' }
    ]
  ];
  const activeKeys = keys.filter(k => !k.revoked);
  for (const k of activeKeys.slice(0, 6)) {
    rows.push([
      { text: `🗑 Revoke ${k.name || k.key_prefix}`, callback_data: `revoke_key:${k.id}` }
    ]);
  }
  rows.push([
    { text: `🔄 ${t('common.refresh', lang)}`, callback_data: 'api_key:list' },
    { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

function emailActionsKeyboard(emailId, isStarred = false, hasAttachments = false, webUrl = null, lang = 'en') {
  const rows = [
    [
      { text: t('bot.btn.reply', lang), callback_data: `reply:${emailId}` },
      ...(hasAttachments ? [{ text: t('bot.btn.attachments', lang), callback_data: `attachments:${emailId}` }] : [])
    ],
    [
      { text: isStarred ? t('bot.btn.starred', lang) : t('bot.btn.star', lang), callback_data: `star:${emailId}` },
      { text: t('bot.btn.mark_read', lang), callback_data: `read:${emailId}` },
      { text: t('bot.btn.delete', lang), callback_data: `delete_email:${emailId}` }
    ]
  ];
  const nav = [
    { text: `⬅️ ${t('nav.inbox', lang)}`, callback_data: 'inbox:1' }
  ];
  if (webUrl) {
    nav.push({ text: t('bot.btn.open_web', lang), url: `${webUrl}/inbox/${emailId}` });
  }
  rows.push(nav);
  return { reply_markup: { inline_keyboard: rows } };
}

function aliasActionsKeyboard(address, isActive = true, isBurner = false, aliasId = null, lang = 'en') {
  let addrStr = typeof address === 'object' && address !== null ? address.address : address;
  let qrTarget = aliasId || (typeof address === 'object' && address !== null ? address.id : null);
  if (!qrTarget) {
    if (addrStr && addrStr.length > 40) {
      try {
        const { getDb } = require('../../database/database');
        const r = getDb().prepare('SELECT id FROM aliases WHERE address=? COLLATE NOCASE').get(addrStr);
        if (r?.id) qrTarget = r.id;
      } catch {}
    }
  }
  if (!qrTarget) qrTarget = addrStr;

  const rows = [
    [
      { text: t('bot.btn.inbox', lang), callback_data: `alias_inbox:${addrStr}:1` },
      { text: t('bot.btn.qr_code', lang), callback_data: `qr_alias:${qrTarget}` }
    ]
  ];
  if (isBurner) {
    rows.push([{ text: t('bot.btn.renew_alias', lang), callback_data: `renew_alias:${addrStr}` }]);
  }
  rows.push([
    { text: isActive ? t('bot.btn.deactivate', lang) : t('bot.btn.activate', lang), callback_data: `toggle_alias:${addrStr}` },
    { text: t('bot.btn.delete', lang), callback_data: `delete_alias:${addrStr}` }
  ]);
  rows.push([
    { text: `⬅️ ${t('nav.aliases', lang)}`, callback_data: 'aliases:1' }
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

function subdomainListKeyboard(subdomains = [], page = 1, total = 0, lang = 'en') {
  const rows = [
    [
      { text: t('bot.btn.claim_subdomain', lang), callback_data: 'subdomain:claim_prompt' },
      { text: `🔄 ${t('common.refresh', lang)}`, callback_data: `subdomain:list:${page}` }
    ]
  ];

  for (const s of subdomains) {
    const statusIcon = s.active ? '🟢' : '🔴';
    const modeBadge = (s.web_mode || 'landing').toUpperCase();
    rows.push([
      {
        text: `${statusIcon} ${s.subdomain} [${modeBadge}]`,
        callback_data: `subdomain:view:${s.id}`
      }
    ]);
  }

  rows.push([{ text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function subdomainActionsKeyboard(sub, lang = 'en') {
  const catchAllBadge = sub.email_catch_all ? '✅ ON' : '❌ OFF';
  const webBadge = sub.web_enabled ? '✅ ON' : '⏸ OFF';
  const modeBadge = (sub.web_mode || 'landing').toUpperCase();

  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `📧 Catch-All: ${catchAllBadge}`, callback_data: `subdomain:toggle_catchall:${sub.id}` },
          { text: `🌐 Web: ${webBadge}`, callback_data: `subdomain:toggle_web:${sub.id}` }
        ],
        [
          { text: `⚙️ Mode: ${modeBadge}`, callback_data: `subdomain:change_mode:${sub.id}` },
          { text: '🎯 Set Target URL', callback_data: `subdomain:set_target:${sub.id}` }
        ],
        [
          { text: '📝 Static HTML/Body', callback_data: `subdomain:set_body:${sub.id}` },
          { text: '📊 Captured Requests', callback_data: `subdomain:requests:${sub.id}` }
        ],
        [
          { text: `➕ ${t('nav.new_alias', lang)}`, callback_data: `subdomain:new_alias:${sub.id}` },
          { text: `🗑 ${t('common.delete', lang)}`, callback_data: `subdomain:delete:${sub.id}` }
        ],
        [
          { text: `⬅️ ${t('subdomains.tab_subdomains', lang)}`, callback_data: 'subdomain:list:1' }
        ]
      ]
    }
  };
}

function hostingMainMenuKeyboard(isAdmin = false, lang = 'en') {
  const rows = [
    [
      { text: t('bot.btn.deploy_site', lang), callback_data: 'hosting:deploy_prompt' },
      { text: t('bot.btn.my_sites', lang), callback_data: 'hosting:sites' }
    ],
    [
      { text: t('bot.btn.plans_limits', lang), callback_data: 'hosting:plans' },
      { text: t('bot.btn.anti_abuse', lang), callback_data: 'hosting:tos' }
    ]
  ];
  if (isAdmin) {
    rows.push([
      { text: t('bot.btn.manage_nodes', lang), callback_data: 'hosting:nodes' },
      { text: t('bot.btn.add_node', lang), callback_data: 'hosting:add_node_prompt' }
    ]);
  }
  rows.push([{ text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function hostingSitesListKeyboard(sites = [], lang = 'en') {
  const rows = [
    [{ text: t('bot.btn.deploy_site', lang), callback_data: 'hosting:deploy_prompt' }]
  ];
  for (const s of sites) {
    const statusIcon = s.status === 'active' ? '🟢' : '🔴';
    rows.push([
      { text: `${statusIcon} ${s.name} (${s.visits_count} hits)`, callback_data: `hosting:site:${s.id}` }
    ]);
  }
  rows.push([{ text: `⬅️ ${t('bot.btn.hosting', lang)}`, callback_data: 'hosting:menu' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function hostingSiteActionsKeyboard(site, lang = 'en') {
  const siteUrl = `http://${site.full_domain}`;
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 Visit Live Site', url: siteUrl }],
        [
          { text: '🔄 Update HTML', callback_data: `hosting:update_html:${site.id}` },
          { text: `🗑 ${t('common.delete', lang)}`, callback_data: `hosting:delete_site:${site.id}` }
        ],
        [{ text: `⬅️ ${t('bot.btn.my_sites', lang)}`, callback_data: 'hosting:sites' }]
      ]
    }
  };
}

function hostingNodesKeyboard(nodes = [], lang = 'en') {
  const rows = [
    [
      { text: t('bot.btn.add_node', lang), callback_data: 'hosting:add_node_prompt' },
      { text: `🔄 ${t('common.refresh', lang)}`, callback_data: 'hosting:nodes' }
    ]
  ];
  for (const n of nodes) {
    const icon = n.status === 'online' ? '🟢' : '🔴';
    rows.push([
      { text: `${icon} ${n.name} [${n.current_sites}/${n.max_sites} sites]`, callback_data: `hosting:node_info:${n.id}` }
    ]);
  }
  rows.push([
    { text: `⬅️ ${t('bot.btn.hosting', lang)}`, callback_data: 'hosting:menu' },
    { text: t('bot.btn.main_menu', lang), callback_data: 'menu:home' }
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

function hostingNodeActionsKeyboard(node, lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚡ Ping & Connection Test', callback_data: `hosting:node_ping:${node.id}` },
          { text: `🗑 ${t('common.delete', lang)}`, callback_data: `hosting:node_delete:${node.id}` }
        ],
        [
          { text: `⬅️ ${t('nav.nodes', lang)}`, callback_data: 'hosting:nodes' }
        ]
      ]
    }
  };
}

function languageSelectionKeyboard(currentLang = 'en') {
  const langs = [
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'ar', flag: '🇸🇦', name: 'العربية' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский' },
    { code: 'fr', flag: '🇫🇷', name: 'Français' },
    { code: 'es', flag: '🇪🇸', name: 'Español' },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
    { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
    { code: 'pt', flag: '🇵🇹', name: 'Português' },
    { code: 'zh', flag: '🇨🇳', name: '简体中文' },
    { code: 'hi', flag: '🇮🇳', name: 'हिन्दी' },
    { code: 'id', flag: '🇮🇩', name: 'Indonesia' },
    { code: 'ur', flag: '🇵🇰', name: 'اردو' }
  ];
  const rows = [];
  for (let i = 0; i < langs.length; i += 2) {
    const pair = langs.slice(i, i + 2);
    rows.push(pair.map(l => ({
      text: `${l.code === currentLang ? '✅ ' : ''}${l.flag} ${l.name}`,
      callback_data: `set_lang:${l.code}`
    })));
  }
  rows.push([{ text: t('bot.btn.main_menu', currentLang), callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function broadcastConfirmKeyboard(lang = 'en') {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t('broadcast.confirm', lang), callback_data: 'admin:broadcast_confirm' }],
        [
          { text: t('broadcast.edit', lang), callback_data: 'admin:broadcast_edit' },
          { text: t('broadcast.cancel', lang), callback_data: 'admin:broadcast_cancel' }
        ]
      ]
    }
  };
}

module.exports = {
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
  adminDashboardKeyboard,
  apiKeysKeyboard,
  emailActionsKeyboard,
  aliasActionsKeyboard,
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
};
