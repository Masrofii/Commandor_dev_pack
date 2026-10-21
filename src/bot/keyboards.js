'use strict';

function mainMenuKeyboard(isAdmin = false) {
  const keyboard = [
    ['📬 Email Suite', '📨 Inbox'],
    ['🌐 Subdomains', '🖥️ Cloud Hosting'],
    ['🔑 API Keys', '📝 Change Log'],
    ['⚙️ Settings', '🌐 Web Dashboard']
  ];
  if (isAdmin) {
    keyboard.push(['👑 Owner Admin Panel']);
  }
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      persistent: true
    }
  };
}

function startInlineKeyboard(webUrl = null, isAdmin = false, unreadCount = 0) {
  const unreadBadge = unreadCount > 0 ? ` (${unreadCount})` : '';
  const rows = [
    [
      { text: '📬 Email Suite', callback_data: 'menu:email_suite' },
      { text: '🌐 Subdomains', callback_data: 'subdomain:hub' }
    ],
    [
      { text: '🖥️ Cloud Hosting', callback_data: 'hosting:menu' },
      { text: '🔑 API & Devs', callback_data: 'api:hub' }
    ],
    [
      { text: `📨 View Inbox${unreadBadge}`, callback_data: 'inbox:1' },
      { text: '📊 Statistics', callback_data: 'stats:1' }
    ],
    [
      { text: '📝 Change Log', callback_data: 'menu:changelog' },
      { text: '🌐 Language', callback_data: 'menu:language' }
    ]
  ];
  if (isAdmin) {
    rows.push([{ text: '👑 Owner Admin Panel', callback_data: 'admin:dashboard' }]);
  }
  if (webUrl) {
    rows.push([{ text: '🌐 Open Web Dashboard', url: webUrl }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function tosPromptKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ I Accept Terms of Service', callback_data: 'tos:accept' }],
        [
          { text: '📜 Read Detailed Terms', callback_data: 'tos:full' },
          { text: '❌ Decline', callback_data: 'tos:decline' }
        ]
      ]
    }
  };
}

function tosFullKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ I Accept Terms of Service', callback_data: 'tos:accept' }],
        [{ text: '⬅️ Back to Summary', callback_data: 'tos:prompt' }]
      ]
    }
  };
}

function tosDeclinedKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Accept Terms of Service', callback_data: 'tos:accept' }]
      ]
    }
  };
}

function emailSuiteKeyboard(aliasCount = 0, unreadCount = 0) {
  const unreadBadge = unreadCount > 0 ? ` (${unreadCount})` : '';
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ Quick Disposable', callback_data: 'menu:new' },
          { text: '✏️ Custom Alias (-ca)', callback_data: 'menu:custom_alias' }
        ],
        [
          { text: '🔥 1-Hour Burner', callback_data: 'menu:burner' },
          { text: `📧 My Aliases (${aliasCount})`, callback_data: 'aliases:1' }
        ],
        [
          { text: `📨 Open Inbox${unreadBadge}`, callback_data: 'inbox:1' },
          { text: '🔎 Search Messages', callback_data: 'menu:search' }
        ],
        [
          { text: '🏠 Back to Main Menu', callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function subdomainHubKeyboard(subCount = 0) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🌐 My Subdomains (${subCount})`, callback_data: 'subdomain:list:1' },
          { text: '➕ Claim Subdomain', callback_data: 'subdomain:claim_prompt' }
        ],
        [
          { text: '📡 Webhook / Web Requests', callback_data: 'subdomain:requests:1' },
          { text: '🏠 Back to Main Menu', callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function apiHubKeyboard(keyCount = 0) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔑 My API Keys (${keyCount})`, callback_data: 'api_key:list' },
          { text: '➕ Generate New Token', callback_data: 'api_key:new' }
        ],
        [
          { text: '📖 API Documentation', callback_data: 'api_key:docs' },
          { text: '🏠 Back to Main Menu', callback_data: 'menu:home' }
        ]
      ]
    }
  };
}

function changeLogKeyboard(isAdmin = false) {
  const rows = [
    [
      { text: '🔄 Refresh Updates', callback_data: 'menu:changelog' },
      { text: '📜 Terms of Service', callback_data: 'tos:full' }
    ]
  ];
  if (isAdmin) {
    rows.push([{ text: '📋 View System Audit Logs', callback_data: 'admin:logs:1:all' }]);
  }
  rows.push([{ text: '🏠 Back to Main Menu', callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adminAuditLogsKeyboard(page = 1, totalPages = 1, currentCategory = 'all') {
  const rows = [];
  
  // Category filters
  rows.push([
    { text: currentCategory === 'all' ? '• All •' : 'All', callback_data: 'admin:logs:1:all' },
    { text: currentCategory === 'email' ? '• Email •' : 'Email', callback_data: 'admin:logs:1:email' },
    { text: currentCategory === 'hosting' ? '• Hosting •' : 'Hosting', callback_data: 'admin:logs:1:hosting' },
    { text: currentCategory === 'subdomain' ? '• Subdomains •' : 'Subdomains', callback_data: 'admin:logs:1:subdomain' }
  ]);

  // Pagination
  const nav = [];
  if (page > 1) {
    nav.push({ text: '⬅️ Prev', callback_data: `admin:logs:${page - 1}:${currentCategory}` });
  }
  nav.push({ text: `Page ${page}/${totalPages}`, callback_data: `admin:logs:${page}:${currentCategory}` });
  if (page < totalPages) {
    nav.push({ text: 'Next ➡️', callback_data: `admin:logs:${page + 1}:${currentCategory}` });
  }
  rows.push(nav);

  rows.push([
    { text: '🔄 Refresh', callback_data: `admin:logs:${page}:${currentCategory}` },
    { text: '👑 Admin Dashboard', callback_data: 'admin:dashboard' }
  ]);

  return { reply_markup: { inline_keyboard: rows } };
}

function adminDashboardKeyboard(webUrl = null) {
  const rows = [
    [
      { text: '🔄 Refresh Status', callback_data: 'admin:dashboard' },
      { text: '📬 Live Email Feed', callback_data: 'admin:emails:1' }
    ],
    [
      { text: '👥 User Directory', callback_data: 'admin:users:1' },
      { text: '🌐 All Subdomains', callback_data: 'admin:subdomains:1' }
    ],
    [
      { text: '🚀 Hosted Sites', callback_data: 'admin:sites:1' },
      { text: '🖥️ Server Nodes', callback_data: 'hosting:nodes' }
    ],
    [
      { text: '📜 Audit & Change Logs', callback_data: 'admin:logs:1:all' },
      { text: '🛡️ Threat Interceptions', callback_data: 'admin:threats:1' }
    ],
    [
      { text: '📢 Global Broadcast', callback_data: 'admin:broadcast' },
      { text: '🧹 Optimize Database', callback_data: 'admin:vacuum' }
    ],
    [
      { text: '🏠 Main Menu', callback_data: 'menu:home' }
    ]
  ];
  if (webUrl) {
    rows.push([{ text: '👑 Open Web Admin Control Panel', url: `${webUrl}/admin` }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function apiKeysKeyboard(keys = []) {
  const rows = [
    [
      { text: '➕ Generate API Key', callback_data: 'api_key:new' },
      { text: 'ℹ️ API Guide & Docs', callback_data: 'api_key:docs' }
    ]
  ];
  const activeKeys = keys.filter(k => !k.revoked);
  for (const k of activeKeys.slice(0, 6)) {
    rows.push([
      { text: `🗑 Revoke ${k.name || k.key_prefix}`, callback_data: `revoke_key:${k.id}` }
    ]);
  }
  rows.push([
    { text: '🔄 Refresh', callback_data: 'api_key:list' },
    { text: '🏠 Main Menu', callback_data: 'menu:home' }
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

function emailActionsKeyboard(emailId, isStarred = false, hasAttachments = false, webUrl = null) {
  const rows = [
    [
      { text: '↩️ Reply', callback_data: `reply:${emailId}` },
      ...(hasAttachments ? [{ text: '📎 Attachments', callback_data: `attachments:${emailId}` }] : [])
    ],
    [
      { text: isStarred ? '⭐ Starred' : '☆ Star', callback_data: `star:${emailId}` },
      { text: '✅ Mark Read', callback_data: `read:${emailId}` },
      { text: '🗑 Delete', callback_data: `delete_email:${emailId}` }
    ]
  ];
  const nav = [
    { text: '⬅️ Back to Inbox', callback_data: 'inbox:1' }
  ];
  if (webUrl) {
    nav.push({ text: '🌐 View on Web', url: `${webUrl}/inbox/${emailId}` });
  }
  rows.push(nav);
  return { reply_markup: { inline_keyboard: rows } };
}

function aliasActionsKeyboard(address, isActive = true) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📨 View Inbox', callback_data: `alias_inbox:${address}:1` },
          { text: '📱 QR Code', callback_data: `qr_alias:${address}` }
        ],
        [
          { text: isActive ? '⏸ Deactivate' : '▶️ Activate', callback_data: `toggle_alias:${address}` },
          { text: '🗑 Delete', callback_data: `delete_alias:${address}` }
        ],
        [
          { text: '⬅️ Back to Aliases', callback_data: 'aliases:1' }
        ]
      ]
    }
  };
}

function subdomainListKeyboard(subdomains = [], page = 1, total = 0) {
  const rows = [
    [
      { text: '➕ Claim Subdomain', callback_data: 'subdomain:claim_prompt' },
      { text: '🔄 Refresh', callback_data: `subdomain:list:${page}` }
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

  rows.push([{ text: '🏠 Main Menu', callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function subdomainActionsKeyboard(sub) {
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
          { text: '➕ Create Alias Here', callback_data: `subdomain:new_alias:${sub.id}` },
          { text: '🗑 Delete Subdomain', callback_data: `subdomain:delete:${sub.id}` }
        ],
        [
          { text: '⬅️ Back to Subdomains', callback_data: 'subdomain:list:1' }
        ]
      ]
    }
  };
}

function hostingMainMenuKeyboard(isAdmin = false) {
  const rows = [
    [
      { text: '➕ Deploy Simple Site', callback_data: 'hosting:deploy_prompt' },
      { text: '📋 My Sites', callback_data: 'hosting:sites' }
    ],
    [
      { text: '📦 Plans & Limits', callback_data: 'hosting:plans' },
      { text: '📜 Anti-Abuse TOS', callback_data: 'hosting:tos' }
    ]
  ];
  if (isAdmin) {
    rows.push([
      { text: '🖥️ Manage Server Nodes', callback_data: 'hosting:nodes' },
      { text: '➕ Add Node (host:user:pass)', callback_data: 'hosting:add_node_prompt' }
    ]);
  }
  rows.push([{ text: '🏠 Main Menu', callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function hostingSitesListKeyboard(sites = []) {
  const rows = [
    [{ text: '➕ Deploy New Site', callback_data: 'hosting:deploy_prompt' }]
  ];
  for (const s of sites) {
    const statusIcon = s.status === 'active' ? '🟢' : '🔴';
    rows.push([
      { text: `${statusIcon} ${s.name} (${s.visits_count} hits)`, callback_data: `hosting:site:${s.id}` }
    ]);
  }
  rows.push([{ text: '⬅️ Back to Hosting', callback_data: 'hosting:menu' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function hostingSiteActionsKeyboard(site) {
  const siteUrl = `http://${site.full_domain}`;
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 Visit Live Site', url: siteUrl }],
        [
          { text: '🔄 Update HTML', callback_data: `hosting:update_html:${site.id}` },
          { text: '🗑 Delete Site', callback_data: `hosting:delete_site:${site.id}` }
        ],
        [{ text: '⬅️ Back to Sites', callback_data: 'hosting:sites' }]
      ]
    }
  };
}

function hostingNodesKeyboard(nodes = []) {
  const rows = [
    [
      { text: '➕ Add Server Node', callback_data: 'hosting:add_node_prompt' },
      { text: '🔄 Refresh Nodes', callback_data: 'hosting:nodes' }
    ]
  ];
  for (const n of nodes) {
    const icon = n.status === 'online' ? '🟢' : '🔴';
    rows.push([
      { text: `${icon} ${n.name} [${n.current_sites}/${n.max_sites} sites]`, callback_data: `hosting:node_info:${n.id}` }
    ]);
  }
  rows.push([
    { text: '⬅️ Back to Hosting', callback_data: 'hosting:menu' },
    { text: '🏠 Main Menu', callback_data: 'menu:home' }
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

function hostingNodeActionsKeyboard(node) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚡ Ping & Connection Test', callback_data: `hosting:node_ping:${node.id}` },
          { text: '🗑 Remove Node', callback_data: `hosting:node_delete:${node.id}` }
        ],
        [
          { text: '⬅️ Back to Server Nodes', callback_data: 'hosting:nodes' }
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
  rows.push([{ text: '🏠 Back to Menu', callback_data: 'menu:home' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function broadcastConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Confirm & Send Announcement', callback_data: 'admin:broadcast_confirm' }],
        [{ text: '❌ Cancel Announcement', callback_data: 'admin:broadcast_cancel' }]
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
  broadcastConfirmKeyboard
};
