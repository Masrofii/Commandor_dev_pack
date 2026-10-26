'use strict';
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { exec } = require('child_process');
const { getDb } = require('../../database/database');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

const ROUTES_DIR = path.resolve(__dirname, '../../nginx/routes');
const BACKUPS_DIR = path.resolve(__dirname, '../../nginx/backups');

for (const d of [ROUTES_DIR, BACKUPS_DIR]) {
  try {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  } catch (err) {
    logger.warn({ error: err.message, dir: d }, 'Could not ensure directory exists');
  }
}

function sanitizeServerName(name) {
  if (!name || typeof name !== 'string') throw new Error('Invalid server name');
  const clean = name.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(clean) || clean.includes('..') || clean.startsWith('.') || clean.endsWith('.')) {
    throw new Error(`Unsafe or invalid hostname: ${name}`);
  }
  return clean;
}

function sanitizeUpstreamTarget(target) {
  if (!target || typeof target !== 'string') throw new Error('Invalid upstream target');
  const clean = target.trim();
  // Valid formats: http://127.0.0.1:3000, 127.0.0.1:8080, https://backend.internal:443
  if (/[\r\n;{}]/.test(clean)) {
    throw new Error('Upstream target contains illegal characters');
  }
  return clean;
}

/**
 * Generate Nginx Virtual Host Configuration Block
 */
function generateNginxVhost({
  serverName,
  destinationType = 'internal_service',
  targetHost = '127.0.0.1',
  targetPort = 8080,
  upstreamUrl = null,
  enableSsl = false,
  sslCertPath = null,
  sslKeyPath = null,
  enableWebsocket = true,
  securityHeaders = false,
  forceHttpsRedirect = false
}) {
  const host = sanitizeServerName(serverName);
  let proxyPassTarget = upstreamUrl;

  if (!proxyPassTarget) {
    const cleanHost = String(targetHost).trim().replace(/^https?:\/\//, '');
    const cleanPort = parseInt(targetPort, 10) || 80;
    proxyPassTarget = `http://${cleanHost}:${cleanPort}`;
  }
  sanitizeUpstreamTarget(proxyPassTarget);

  const normalizedUpstream = /^[a-z][a-z0-9+.-]*:\/\//i.test(proxyPassTarget)
    ? proxyPassTarget
    : `http://${proxyPassTarget}`;
  let parsedUpstream;
  try {
    parsedUpstream = new URL(normalizedUpstream);
  } catch {
    throw new Error('Upstream target is not a valid URL');
  }
  if (parsedUpstream.username || parsedUpstream.password ||
      parsedUpstream.pathname !== '/' || parsedUpstream.search || parsedUpstream.hash) {
    throw new Error('Upstream target must contain only the scheme, host, and optional port');
  }
  if (!['http:', 'https:'].includes(parsedUpstream.protocol)) {
    throw new Error(`Unsupported upstream protocol: ${parsedUpstream.protocol}`);
  }

  const upstreamName = `upstream_${host.replace(/[^a-z0-9]/g, '_')}`;
  const useSsl = Boolean(enableSsl && sslCertPath && sslKeyPath);
  const proxyScheme = parsedUpstream.protocol === 'https:' ? 'https' : 'http';
  const upstreamHost = parsedUpstream.hostname.replace(/^\[|\]$/g, '');
  const upstreamPort = parsedUpstream.port || (proxyScheme === 'https' ? '443' : '80');
  const upstreamAddress = `${upstreamHost.includes(':') ? `[${upstreamHost}]` : upstreamHost}:${upstreamPort}`;

  // Nginx sends the upstream block name (not the backend hostname) as SNI by
  // default, which breaks virtual-hosted HTTPS backends. Set the name
  // explicitly whenever the upstream itself uses TLS.
  const upstreamSniHost = proxyScheme === 'https' ? upstreamHost : null;
  if (upstreamSniHost && !/^[A-Za-z0-9.:-]+$/.test(upstreamSniHost)) {
    throw new Error('HTTPS upstream hostname contains unsupported characters');
  }
  const proxySslBlock = proxyScheme === 'https'
    ? `        proxy_ssl_server_name on;
        proxy_ssl_name ${upstreamSniHost};
`
    : '';

  const sslDirectives = `
    ssl_certificate ${sslCertPath};
    ssl_certificate_key ${sslKeyPath};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;`;

  const securityBlock = securityHeaders
    ? `
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
`
    : '';

  // Use a literal "upgrade" value instead of a $connection_upgrade map. The
  // generated file is included as a server-level snippet, and a map declared
  // here would collide when multiple vhosts are generated.
  const websocketBlock = enableWebsocket
    ? `        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";`
    : `        proxy_set_header Connection "";`;

  const proxyLocation = `
    location / {
        proxy_pass ${proxyScheme}://${upstreamName};
        proxy_http_version 1.1;
${proxySslBlock}${websocketBlock}
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
    }
`;

  let serverBlocks;
  if (useSsl && forceHttpsRedirect) {
    serverBlocks = `server {
    listen 80;
    listen [::]:80;
    server_name ${host};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${host};${sslDirectives}
${securityBlock}
    client_max_body_size 50m;
${proxyLocation}
}
`;
  } else {
    const sslListen = useSsl
      ? `
    listen 443 ssl http2;
    listen [::]:443 ssl http2;${sslDirectives}
`
      : '';
    serverBlocks = `server {
    listen 80;
    listen [::]:80;
    server_name ${host};${sslListen}
${securityBlock}
    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
${proxyLocation}
}
`;
  }

  const config = `# Auto-generated by Commandor Dev Pack for ${host}
# Created: ${new Date().toISOString()}

upstream ${upstreamName} {
    server ${upstreamAddress};
    keepalive 32;
}

${serverBlocks}`;

  return {
    serverName: host,
    upstreamName,
    proxyPassTarget,
    config
  };
}

/**
 * Validate Nginx configuration syntax
 */
function validateNginxConfigSyntax(content) {
  // 1. Bracket balancing check
  let openBrackets = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') openBrackets++;
    if (content[i] === '}') openBrackets--;
    if (openBrackets < 0) return { valid: false, error: 'Unbalanced curly brackets (unexpected closing bracket)' };
  }
  if (openBrackets !== 0) return { valid: false, error: 'Unbalanced curly brackets (missing closing bracket)' };

  // 2. Directive semicolon check (basic sanity check)
  const lines = content.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line || line.startsWith('#') || line.endsWith('{') || line.endsWith('}')) continue;
    if (!line.endsWith(';')) {
      return { valid: false, error: `Syntax error on line ${idx + 1}: Directive missing semicolon: "${line}"` };
    }
  }

  return { valid: true };
}

/**
 * Test configuration with system Nginx if available
 */
function testSystemNginx() {
  return new Promise((resolve) => {
    exec('nginx -t', (err, stdout, stderr) => {
      if (err) {
        const message = (stderr || stdout || err.message).trim();
        const missing = err.code === 127 ||
          /not found|not recognized|no such file|ENOENT/i.test(message);
        resolve({ valid: false, available: !missing, error: message });
      } else {
        resolve({ valid: true, available: true, output: stdout.trim() });
      }
    });
  });
}

/**
 * Gracefully reload system Nginx
 */
function reloadSystemNginx() {
  return new Promise((resolve) => {
    exec('nginx -s reload', (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: (stderr || stdout || err.message).trim() });
      } else {
        resolve({ success: true });
      }
    });
  });
}

/**
 * Apply route configuration with validation, backup, and automatic rollback
 */
async function applyRouteConfig({
  subdomainId,
  serverName,
  configContent,
  userTgId = null
}) {
  const host = sanitizeServerName(serverName);
  const routeFilePath = path.join(ROUTES_DIR, `${host}.conf`);
  const backupFilePath = path.join(BACKUPS_DIR, `${host}_${Date.now()}.conf.bak`);
  const proxyMode = String(config.proxy?.mode || 'auto').toLowerCase();

  // 1. Syntax check
  const syntaxCheck = validateNginxConfigSyntax(configContent);
  if (!syntaxCheck.valid) {
    throw new Error(`Reverse proxy configuration syntax check failed: ${syntaxCheck.error}`);
  }

  // 2. Backup current configuration if exists
  let previousContent = null;
  if (fs.existsSync(routeFilePath)) {
    previousContent = fs.readFileSync(routeFilePath, 'utf8');
    fs.writeFileSync(backupFilePath, previousContent, 'utf8');
  }

  try {
    // 3. Write candidate configuration
    fs.writeFileSync(routeFilePath, configContent, 'utf8');

    let pending = false;
    let pendingReason = null;

    if (proxyMode === 'pending') {
      // Explicit "render only" mode. Useful for containers where a sidecar or
      // host process applies the generated routes.
      pending = true;
      pendingReason = 'PROXY_MODE=pending: route file written without reloading Nginx';
    } else {
      // 4. Validate with system nginx if installed
      const sysTest = await testSystemNginx();
      if (!sysTest.valid) {
        if (proxyMode === 'auto' && sysTest.available === false) {
          pending = true;
          pendingReason = 'Nginx is not installed on this host; route stored with pending status';
        } else {
          // Automatic Rollback!
          if (previousContent !== null) {
            fs.writeFileSync(routeFilePath, previousContent, 'utf8');
          } else {
            try { fs.unlinkSync(routeFilePath); } catch {}
          }
          throw new Error(`Nginx validation failed: ${sysTest.error}. Rolled back automatically.`);
        }
      } else {
        // 5. Gracefully reload Nginx
        const reload = await reloadSystemNginx();
        if (!reload.success) {
          if (proxyMode === 'auto') {
            pending = true;
            pendingReason = `Nginx configuration validated but reload failed: ${reload.error}`;
          } else {
            if (previousContent !== null) {
              fs.writeFileSync(routeFilePath, previousContent, 'utf8');
            } else {
              try { fs.unlinkSync(routeFilePath); } catch {}
            }
            throw new Error(`Nginx reload failed: ${reload.error}. Rolled back automatically.`);
          }
        }
      }
    }

    // 6. Record in database
    const db = getDb();
    const existing = db.prepare('SELECT id FROM proxy_routes WHERE server_name=?').get(host);
    if (existing) {
      db.prepare(`
        UPDATE proxy_routes
        SET config_content = ?, is_active = ?, last_reloaded_at = ${pending ? 'NULL' : "datetime('now')"}
        WHERE id = ?
      `).run(configContent, pending ? 0 : 1, existing.id);
    } else {
      db.prepare(`
        INSERT INTO proxy_routes (subdomain_id, server_name, upstream_target, config_content, is_active, last_reloaded_at)
        VALUES (?, ?, ?, ?, ?, ${pending ? 'NULL' : "datetime('now')"})
      `).run(subdomainId || null, host, 'dynamic', configContent, pending ? 0 : 1);
    }

    logChange({
      tgId: userTgId,
      category: 'proxy',
      action: pending ? 'route_stored_pending' : 'route_applied',
      details: `Generated reverse proxy route for "${host}"${pending ? ` (pending: ${pendingReason})` : ' and reloaded Nginx'}`,
      metadata: { serverName: host, filePath: routeFilePath, pending, pendingReason }
    }).catch(() => {});

    return {
      success: true,
      pending,
      pendingReason,
      serverName: host,
      filePath: routeFilePath,
      backupPath: previousContent ? backupFilePath : null,
      message: pending ? pendingReason : 'Nginx route applied and reloaded successfully'
    };
  } catch (err) {
    logger.error({ err: err.message, host }, 'Failed to apply reverse proxy configuration');
    throw err;
  }
}

/**
 * Remove route configuration and reload proxy
 */
async function removeRouteConfig(serverName, userTgId = null) {
  const host = sanitizeServerName(serverName);
  const routeFilePath = path.join(ROUTES_DIR, `${host}.conf`);
  if (fs.existsSync(routeFilePath)) {
    try { fs.unlinkSync(routeFilePath); } catch {}
  }

  const proxyMode = String(config.proxy?.mode || 'auto').toLowerCase();
  if (proxyMode !== 'pending') {
    const sysTest = await testSystemNginx();
    if (sysTest.valid) await reloadSystemNginx();
  }

  const db = getDb();
  db.prepare('DELETE FROM proxy_routes WHERE server_name=?').run(host);

  logChange({
    tgId: userTgId,
    category: 'proxy',
    action: 'route_removed',
    details: `Removed Nginx reverse proxy route for "${host}"`,
    metadata: { serverName: host }
  }).catch(() => {});

  return { success: true, serverName: host };
}

/**
 * Check TLS certificate validity and expiry using TLS handshake
 */
function checkTlsCertificate(hostname, port = 443) {
  return new Promise((resolve) => {
    const cleanHost = String(hostname).trim().toLowerCase();
    const socket = tls.connect({
      host: cleanHost,
      port,
      servername: cleanHost,
      timeout: 8000
    }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          return resolve({
            active: false,
            error: 'No valid certificate returned during TLS handshake.'
          });
        }

        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.round((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const isExpired = daysRemaining < 0;

        resolve({
          active: !isExpired,
          issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
          subject: cert.subject?.CN || cleanHost,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          isExpired
        });
      } catch (err) {
        resolve({ active: false, error: err.message });
      }
    });

    socket.on('error', (err) => {
      resolve({ active: false, error: err.message });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ active: false, error: 'TLS connection timeout after 8000ms' });
    });
  });
}

module.exports = {
  ROUTES_DIR,
  BACKUPS_DIR,
  sanitizeServerName,
  sanitizeUpstreamTarget,
  generateNginxVhost,
  validateNginxConfigSyntax,
  applyRouteConfig,
  removeRouteConfig,
  checkTlsCertificate
};
