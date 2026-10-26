'use strict';
const { getDb } = require('../../database/database');
const { generateNginxVhost, validateNginxConfigSyntax, sanitizeServerName } = require('./reverseProxyService');
const { detectConflicts } = require('./dns/DnsManager');
const { getPlatformBaseDomains } = require('./subdomainService');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

const FORBIDDEN_SHELL_PATTERNS = [
  /sudo\s+/i,
  /rm\s+-rf/i,
  /mkfs/i,
  /dd\s+if=/i,
  /chmod\s+777/i,
  /curl\s+.*\|\s*(bash|sh)/i,
  /wget\s+.*\|\s*(bash|sh)/i,
  />\s*\/dev\/(sda|null|zero)/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /;\s*rm/i
];

/**
 * Validate that a template configuration does not contain arbitrary shell exploitation
 */
function validateTemplateSafety(templateData) {
  const fieldsToCheck = [
    templateData.recommended_build,
    templateData.recommended_start,
    templateData.nginx_config_template
  ];

  for (const field of fieldsToCheck) {
    if (!field || typeof field !== 'string') continue;
    for (const pattern of FORBIDDEN_SHELL_PATTERNS) {
      if (pattern.test(field)) {
        throw new Error(`Security validation failed: Template contains disallowed command or pattern (${pattern})`);
      }
    }
  }

  // Validate Nginx template syntax
  if (templateData.nginx_config_template) {
    // Replace placeholder with dummy upstream for syntax check
    const testConfig = `server {
      listen 80;
      server_name test.local;
      ${templateData.nginx_config_template.replace(/\{\{UPSTREAM_TARGET\}\}/g, '127.0.0.1:8080')}
    }`;
    const syntax = validateNginxConfigSyntax(testConfig);
    if (!syntax.valid) {
      throw new Error(`Nginx template block has invalid syntax: ${syntax.error}`);
    }
  }

  return true;
}

function listTemplates(category = null) {
  const db = getDb();
  let q = 'SELECT * FROM service_templates WHERE 1=1';
  const params = [];
  if (category) {
    q += ' AND category = ?';
    params.push(category);
  }
  q += ' ORDER BY is_builtin DESC, name ASC';
  const rows = db.prepare(q).all(...params);
  return rows.map(r => ({
    ...r,
    default_env: r.default_env ? JSON.parse(r.default_env) : {}
  }));
}

function getTemplateByKey(key) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM service_templates WHERE template_key = ? COLLATE NOCASE').get(key);
  if (!row) return null;
  return {
    ...row,
    default_env: row.default_env ? JSON.parse(row.default_env) : {}
  };
}

function createTemplate({
  templateKey,
  name,
  category = 'application',
  description = '',
  defaultPort = 8080,
  defaultPath = '/',
  runtime = 'nodejs',
  recommendedBuild = '',
  recommendedStart = '',
  defaultEnv = {},
  nginxConfigTemplate,
  websocketSupport = 0,
  healthCheckEndpoint = '/health',
  userTgId = null
}) {
  if (!templateKey || !/^[a-z0-9-]+$/.test(templateKey)) {
    throw new Error('Template key must contain only lowercase alphanumeric characters and hyphens.');
  }
  if (!name || typeof name !== 'string') {
    throw new Error('Template name is required.');
  }
  if (!nginxConfigTemplate || typeof nginxConfigTemplate !== 'string') {
    throw new Error('Nginx configuration template is required.');
  }

  validateTemplateSafety({
    recommended_build: recommendedBuild,
    recommended_start: recommendedStart,
    nginx_config_template: nginxConfigTemplate
  });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM service_templates WHERE template_key = ? COLLATE NOCASE').get(templateKey);
  if (existing) {
    throw new Error(`Template with key "${templateKey}" already exists.`);
  }

  const envJson = typeof defaultEnv === 'object' ? JSON.stringify(defaultEnv) : '{}';

  const info = db.prepare(`
    INSERT INTO service_templates (
      template_key, name, category, description,
      default_port, default_path, runtime,
      recommended_build, recommended_start, default_env,
      nginx_config_template, websocket_support, health_check_endpoint, is_builtin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    templateKey.toLowerCase().trim(),
    name.trim(),
    category,
    description,
    parseInt(defaultPort, 10) || 8080,
    defaultPath || '/',
    runtime,
    recommendedBuild || null,
    recommendedStart || null,
    envJson,
    nginxConfigTemplate.trim(),
    websocketSupport ? 1 : 0,
    healthCheckEndpoint || '/health'
  );

  logChange({
    tgId: userTgId,
    category: 'templates',
    action: 'template_created',
    details: `Created custom service template "${name}" (${templateKey})`,
    metadata: { templateKey, category }
  }).catch(() => {});

  return getTemplateByKey(templateKey);
}

function updateTemplate(id, updates = {}, userTgId = null) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM service_templates WHERE id = ?').get(id);
  if (!current) throw new Error(`Template #${id} not found`);
  if (current.is_builtin) throw new Error('Built-in system templates cannot be modified.');

  validateTemplateSafety({
    recommended_build: updates.recommended_build !== undefined ? updates.recommended_build : current.recommended_build,
    recommended_start: updates.recommended_start !== undefined ? updates.recommended_start : current.recommended_start,
    nginx_config_template: updates.nginx_config_template !== undefined ? updates.nginx_config_template : current.nginx_config_template
  });

  const sets = [];
  const params = [];

  if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description); }
  if (updates.category !== undefined) { sets.push('category = ?'); params.push(updates.category); }
  if (updates.default_port !== undefined) { sets.push('default_port = ?'); params.push(parseInt(updates.default_port, 10) || 8080); }
  if (updates.default_path !== undefined) { sets.push('default_path = ?'); params.push(updates.default_path); }
  if (updates.runtime !== undefined) { sets.push('runtime = ?'); params.push(updates.runtime); }
  if (updates.recommended_build !== undefined) { sets.push('recommended_build = ?'); params.push(updates.recommended_build); }
  if (updates.recommended_start !== undefined) { sets.push('recommended_start = ?'); params.push(updates.recommended_start); }
  if (updates.default_env !== undefined) {
    sets.push('default_env = ?');
    params.push(typeof updates.default_env === 'object' ? JSON.stringify(updates.default_env) : '{}');
  }
  if (updates.nginx_config_template !== undefined) { sets.push('nginx_config_template = ?'); params.push(updates.nginx_config_template); }
  if (updates.websocket_support !== undefined) { sets.push('websocket_support = ?'); params.push(updates.websocket_support ? 1 : 0); }
  if (updates.health_check_endpoint !== undefined) { sets.push('health_check_endpoint = ?'); params.push(updates.health_check_endpoint); }

  if (sets.length > 0) {
    params.push(id);
    db.prepare(`UPDATE service_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  logChange({
    tgId: userTgId,
    category: 'templates',
    action: 'template_updated',
    details: `Updated custom service template "${current.name}"`,
    metadata: { templateId: id }
  }).catch(() => {});

  return getTemplateByKey(current.template_key);
}

function deleteTemplate(id, userTgId = null) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM service_templates WHERE id = ?').get(id);
  if (!current) return false;
  if (current.is_builtin) throw new Error('Built-in system templates cannot be deleted.');

  const deleted = db.prepare('DELETE FROM service_templates WHERE id = ?').run(id).changes > 0;
  if (deleted) {
    logChange({
      tgId: userTgId,
      category: 'templates',
      action: 'template_deleted',
      details: `Deleted custom service template "${current.name}"`,
      metadata: { templateId: id }
    }).catch(() => {});
  }
  return deleted;
}

/**
 * Preview template application: renders config, detects DNS & route conflicts, preserves unrelated records
 */
function previewTemplateApplication({
  templateKey,
  subdomain,
  baseDomain = null,
  targetHost = '127.0.0.1',
  targetPort = null,
  enableHttps = false
}) {
  const tpl = getTemplateByKey(templateKey);
  if (!tpl) throw new Error(`Template "${templateKey}" not found`);

  const resolvedBaseDomain = baseDomain || getPlatformBaseDomains()[0];
  if (!resolvedBaseDomain) {
    throw new Error('No base domain is configured. Set DOMAINS or verify a custom domain first.');
  }

  const cleanSub = sanitizeServerName(subdomain);
  const cleanBase = sanitizeServerName(resolvedBaseDomain);
  const fullDomain = `${cleanSub}.${cleanBase}`;

  const cleanHost = String(targetHost).trim().replace(/^https?:\/\//, '') || '127.0.0.1';
  const cleanPort = targetPort ? parseInt(targetPort, 10) : tpl.default_port;
  const upstreamTarget = `${cleanHost}:${cleanPort}`;
  const upstreamName = `upstream_${fullDomain.replace(/[^a-z0-9]/g, '_')}`;

  // Render location block from template
  const locationBlock = tpl.nginx_config_template.replace(/\{\{UPSTREAM_TARGET\}\}/g, upstreamName);

  let sslBlock = '';
  if (enableHttps) {
    sslBlock = `
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/${fullDomain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${fullDomain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    `;
  }

  const fullNginxConfig = `# Auto-generated from template [${tpl.name}] for ${fullDomain}
# Created: ${new Date().toISOString()}

upstream ${upstreamName} {
    server ${upstreamTarget};
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${fullDomain};
${sslBlock}
    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    ${locationBlock}
}
`;

  // Syntax check rendered output
  const syntaxCheck = validateNginxConfigSyntax(fullNginxConfig);

  // Check conflicts in database
  const db = getDb();
  const existingRoute = db.prepare('SELECT id, server_name FROM proxy_routes WHERE server_name = ? COLLATE NOCASE').get(fullDomain);
  const existingSub = db.prepare('SELECT id, full_domain FROM subdomains WHERE full_domain = ? COLLATE NOCASE').get(fullDomain);

  const conflicts = [];
  if (existingRoute) conflicts.push(`Proxy route for "${fullDomain}" is already registered (Route #${existingRoute.id}).`);
  if (existingSub) conflicts.push(`Subdomain "${fullDomain}" already exists in routing directory (Subdomain #${existingSub.id}).`);

  return {
    template: {
      key: tpl.template_key,
      name: tpl.name,
      category: tpl.category,
      runtime: tpl.runtime,
      recommendedBuild: tpl.recommended_build,
      recommendedStart: tpl.recommended_start,
      defaultEnv: tpl.default_env,
      healthCheckEndpoint: tpl.health_check_endpoint
    },
    target: {
      subdomain: cleanSub,
      baseDomain: cleanBase,
      fullDomain,
      upstreamTarget,
      upstreamName,
      port: cleanPort
    },
    renderedConfig: fullNginxConfig,
    syntaxValid: syntaxCheck.valid,
    syntaxError: syntaxCheck.error || null,
    hasConflict: conflicts.length > 0,
    conflicts,
    preservedRecordsNotice: 'Unrelated routes, existing DNS zones, and active virtual hosts will remain untouched.'
  };
}

module.exports = {
  validateTemplateSafety,
  listTemplates,
  getTemplateByKey,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplateApplication
};
