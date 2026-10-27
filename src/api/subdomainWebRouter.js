'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('../../config/config');
const logger = require('../monitoring/logger');
const { getSubdomainByFullDomain, recordWebRequest } = require('../services/subdomainService');
const { getBot } = require('../bot/bot');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSystemOrMainHost(host) {
  if (!host) return true;
  const clean = host.toLowerCase().split(':')[0].trim();
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(clean)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return true; // Direct IP access

  const baseList = config.domains?.list || [];
  const defaultDomain = (config.domains?.defaultDomain || '').toLowerCase();
  const allBases = new Set([defaultDomain, ...baseList].map(d => d.toLowerCase()).filter(Boolean));

  // If host is the exact base domain (e.g. example.com) or system prefix (mail., api.)
  for (const base of allBases) {
    if (clean === base || clean === `mail.${base}` || clean === `api.${base}` || clean === `api.mail.${base}`) {
      return true;
    }
  }

  return false;
}

function renderErrorPage(status, title, message, host) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(host)}</title>
  <style>
    body { margin:0; padding:0; background:#0f172a; color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:32px; max-width:480px; width:90%; box-shadow:0 10px 25px -5px rgba(0,0,0,0.5); text-align:center; }
    .badge { display:inline-block; padding:4px 12px; background:#ef444422; color:#ef4444; border:1px solid #ef444444; border-radius:999px; font-weight:600; font-size:13px; margin-bottom:16px; }
    h1 { font-size:24px; margin:0 0 12px; font-weight:700; }
    p { color:#94a3b8; font-size:15px; line-height:1.5; margin:0 0 20px; }
    .domain { font-family:monospace; color:#38bdf8; background:#0f172a; padding:2px 8px; border-radius:4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">HTTP ${status}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function renderLandingPage(sub) {
  const catchAllStatus = sub.email_catch_all ? 'Active (Receiving all *@' + sub.full_domain + ')' : 'Explicit Aliases Only';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(sub.full_domain)} - Subdomain Service</title>
  <style>
    body { margin:0; padding:0; background:linear-gradient(135deg, #0b0f19 0%, #1e1b4b 100%); color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .container { max-width:540px; width:90%; background:rgba(30, 41, 59, 0.85); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:36px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); text-align:center; }
    .icon { font-size:42px; margin-bottom:16px; display:inline-block; }
    h1 { font-size:26px; margin:0 0 8px; font-weight:700; color:#ffffff; }
    .domain-tag { display:inline-block; font-family:monospace; font-size:15px; color:#38bdf8; background:rgba(56, 189, 248, 0.1); border:1px solid rgba(56, 189, 248, 0.3); padding:4px 12px; border-radius:8px; margin-bottom:20px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:24px 0; text-align:left; }
    .box { background:rgba(15, 23, 42, 0.6); padding:14px; border-radius:10px; border:1px solid rgba(255,255,255,0.05); }
    .box-title { font-size:12px; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; margin-bottom:4px; }
    .box-val { font-size:14px; font-weight:600; color:#f1f5f9; }
    .status-dot { display:inline-block; width:8px; height:8px; background:#10b981; border-radius:50%; margin-right:6px; }
    p.footer { font-size:13px; color:#64748b; margin:24px 0 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🚀</div>
    <h1>Subdomain Ready</h1>
    <div class="domain-tag">${escapeHtml(sub.full_domain)}</div>
    <div class="grid">
      <div class="box">
        <div class="box-title">Email Service</div>
        <div class="box-val"><span class="status-dot"></span>${escapeHtml(catchAllStatus)}</div>
      </div>
      <div class="box">
        <div class="box-title">Web Mode</div>
        <div class="box-val">${escapeHtml(sub.web_mode.toUpperCase())}</div>
      </div>
      <div class="box">
        <div class="box-title">Emails Received</div>
        <div class="box-val">${sub.emails_received}</div>
      </div>
      <div class="box">
        <div class="box-title">Web Requests</div>
        <div class="box-val">${sub.web_requests_count}</div>
      </div>
    </div>
    <p class="footer">Managed via Telegram Bot &amp; REST API</p>
  </div>
</body>
</html>`;
}

function handleProxyRequest(req, res, sub) {
  let targetUrl;
  try {
    targetUrl = new URL(sub.web_target);
  } catch {
    return res.status(502).type('text/html').send(renderErrorPage(502, 'Bad Gateway', 'Configured proxy target is not a valid URL.', sub.full_domain));
  }

  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const targetPath = (targetUrl.pathname === '/' ? '' : targetUrl.pathname) + req.url;
  const clientHeaders = { ...req.headers };

  delete clientHeaders.host;
  delete clientHeaders.connection;
  delete clientHeaders['keep-alive'];
  delete clientHeaders['transfer-encoding'];

  clientHeaders['x-forwarded-for'] = req.headers['x-forwarded-for']
    ? `${req.headers['x-forwarded-for']}, ${req.ip}`
    : req.ip;
  clientHeaders['x-forwarded-host'] = sub.full_domain;
  clientHeaders['x-forwarded-proto'] = req.protocol || 'http';

  const proxyOpts = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    method: req.method,
    path: targetPath,
    headers: {
      ...clientHeaders,
      host: targetUrl.host
    },
    timeout: 300000
  };

  const proxyReq = transport.request(proxyOpts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).type('text/html').send(renderErrorPage(504, 'Gateway Timeout', 'The upstream server timed out.', sub.full_domain));
    }
  });

  proxyReq.on('error', (err) => {
    logger.warn({ err: err.message, target: sub.web_target, domain: sub.full_domain }, 'Subdomain proxy error');
    if (!res.headersSent) {
      res.status(502).type('text/html').send(renderErrorPage(502, 'Bad Gateway', `Failed to reach upstream target (${escapeHtml(err.message)}).`, sub.full_domain));
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    proxyReq.end();
  } else if (req.body && Object.keys(req.body).length > 0) {
    if (Buffer.isBuffer(req.body)) {
      proxyReq.write(req.body);
    } else if (typeof req.body === 'object') {
      const jsonStr = JSON.stringify(req.body);
      proxyReq.setHeader('content-length', Buffer.byteLength(jsonStr));
      proxyReq.setHeader('content-type', 'application/json');
      proxyReq.write(jsonStr);
    } else if (typeof req.body === 'string') {
      proxyReq.write(req.body);
    }
    proxyReq.end();
  } else if (req.readableEnded) {
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
}

function subdomainWebMiddleware(req, res, next) {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();

  // If request is for main service or is incoming email webhook route, skip to standard router
  if (isSystemOrMainHost(host) || req.path === '/api/incoming') {
    return next();
  }

  const sub = getSubdomainByFullDomain(host);
  if (!sub) {
    return res.status(404).type('text/html').send(renderErrorPage(404, 'Not Found', `The subdomain <span class="domain">${escapeHtml(host)}</span> is not claimed or inactive.`, host));
  }

  if (!sub.active) {
    return res.status(403).type('text/html').send(renderErrorPage(403, 'Subdomain Suspended', 'This subdomain has been disabled by the system administrator.', host));
  }

  if (!sub.web_enabled) {
    return res.status(503).type('text/html').send(renderErrorPage(503, 'Service Offline', 'The owner has currently paused web routing for this subdomain.', host));
  }

  // Handle modes:
  const mode = (sub.web_mode || 'landing').toLowerCase();

  if (mode === 'proxy') {
    if (!sub.web_target) {
      return res.status(502).type('text/html').send(renderErrorPage(502, 'Bad Gateway', 'No proxy target configured for this subdomain.', host));
    }
    return handleProxyRequest(req, res, sub);
  }

  if (mode === 'redirect') {
    if (!sub.web_target) {
      return res.status(500).type('text/html').send(renderErrorPage(500, 'Config Error', 'No redirect target URL configured.', host));
    }
    return res.redirect(302, sub.web_target);
  }

  if (mode === 'static') {
    res.status(sub.web_custom_status || 200);
    res.setHeader('Content-Type', sub.web_custom_content_type || 'text/html; charset=utf-8');
    return res.send(sub.web_custom_body || '<h1>Subdomain Active</h1>');
  }

  if (mode === 'webhook') {
    // Collect request
    const bodyStr = typeof req.body === 'object' ? JSON.stringify(req.body) : (req.body ? String(req.body) : null);
    const reqId = recordWebRequest(sub.id, {
      method: req.method,
      path: req.originalUrl || req.url,
      queryParams: req.query,
      headers: req.headers,
      body: bodyStr,
      ip: req.ip
    });

    if (sub.web_notify_telegram) {
      const bot = getBot();
      if (bot) {
        const querySnippet = Object.keys(req.query || {}).length ? `\n🔍 Query: <code>${escapeHtml(JSON.stringify(req.query))}</code>` : '';
        const bodySnippet = bodyStr ? `\n📦 Body: <code>${escapeHtml(bodyStr.slice(0, 150))}</code>` : '';
        const msg = `🌐 <b>Webhook Captured</b>\n` +
          `Subdomain: <code>${escapeHtml(host)}</code>\n` +
          `Request: <b>${escapeHtml(req.method)} ${escapeHtml(req.path)}</b>\n` +
          `From IP: <code>${escapeHtml(req.ip)}</code>` +
          querySnippet + bodySnippet;
        bot.telegram.sendMessage(sub.tg_id, msg, { parse_mode: 'HTML' }).catch(() => {});
      }
    }

    return res.json({
      success: true,
      requestId: reqId,
      subdomain: host,
      method: req.method,
      path: req.path,
      message: 'Request logged successfully',
      timestamp: new Date().toISOString()
    });
  }

  // Default: landing
  return res.status(200).type('text/html').send(renderLandingPage(sub));
}

module.exports = {
  isSystemOrMainHost,
  subdomainWebMiddleware,
  renderLandingPage,
  renderErrorPage
};
