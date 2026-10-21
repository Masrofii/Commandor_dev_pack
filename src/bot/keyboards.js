'use strict';

function mainMenuKeyboard(isAdmin = false) {
  const keyboard = [
    ['📧 My Aliases', '📨 Inbox'],
    ['➕ New Alias', '✏️ Custom Alias'],
    ['🌐 Subdomains', '🖥️ Cloud Hosting'],
    ['🔥 1-Hour Burner', '🔑 API Keys'],
    ['🔎 Search', '🌐 Web Dashboard']
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

function startInlineKeyboard(webUrl = null, isAdmin = false) {
  const rows = [
    [
      { text: '➕ New Alias', callback_data: 'menu:new' },
      { text: '✏️ Custom Alias', callback_data: 'menu:custom_alias' }
    ],
    [
      { text: '🌐 Subdomains', callback_data: 'subdomain:list:1' },
      { text: '🖥️ Cloud Hosting', callback_data: 'hosting:menu' }
    ],
    [
      { text: '🔥 1-Hour Burner', callback_data: 'menu:burner' },
      { text: '🔑 API Keys', callback_data: 'api_key:list' }
    ],
    [
      { text: '📨 View Inbox', callback_data: 'inbox:1' },
      { text: '📧 My Aliases', callback_data: 'aliases:1' }
    ],
    [
      { text: '📊 Statistics', callback_data: 'stats:1' },
      { text: '⚙️ Settings', callback_data: 'menu:settings' }
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

function adminDashboardKeyboard(webUrl = null) {
  const rows = [
    [
      { text: '🔄 Refresh Stats', callback_data: 'admin:dashboard' },
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
      { text: '🛡️ Threat Interceptions', callback_data: 'admin:threats:1' },
      { text: '📢 Global Broadcast', callback_data: 'admin:broadcast' }
    ],
    [
      { text: '🧹 Optimize Database', callback_data: 'admin:vacuum' },
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
  rows.push([{ text: '⬅️ Back to Hosting', callback_data: 'hosting:menu' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = {
  mainMenuKeyboard,
  startInlineKeyboard,
  adminDashboardKeyboard,
  apiKeysKeyboard,
  emailActionsKeyboard,
  aliasActionsKeyboard,
  subdomainListKeyboard,
  subdomainActionsKeyboard,
  hostingMainMenuKeyboard,
  hostingSitesListKeyboard,
  hostingSiteActionsKeyboard,
  hostingNodesKeyboard
};
