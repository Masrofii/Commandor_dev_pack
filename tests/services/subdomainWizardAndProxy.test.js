'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  validateSubdomainSyntax,
  validateSubdomainStep,
  previewSubdomainWizard,
  deploySubdomainWizard,
  verifySubdomainRoute,
  repairSubdomainRoute,
  safeDeleteSubdomain
} = require('../../src/services/subdomainWizardService');
const {
  generateNginxVhost,
  validateNginxConfigSyntax,
  applyRouteConfig,
  removeRouteConfig
} = require('../../src/services/reverseProxyService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
  getDb().prepare("INSERT INTO custom_domains(tg_id, domain, verification_token, verified, active) VALUES(1001, 'commandor.my.id', 'token1', 1, 1)").run();
});

afterAll(() => closeDatabase());

describe('Subdomain Wizard Validation & RFC 1123 Syntax', () => {
  test('validates valid subdomain label', () => {
    const valid = validateSubdomainSyntax('my-app-v2');
    expect(valid).toBe('my-app-v2');
  });

  test('rejects reserved platform words like admin, root, auth', () => {
    expect(() => validateSubdomainSyntax('admin')).toThrow(/reserved/i);
    expect(() => validateSubdomainSyntax('root')).toThrow(/reserved/i);
    expect(() => validateSubdomainSyntax('auth')).toThrow(/reserved/i);
  });

  test('rejects invalid characters, hyphens at edges, and length violations', () => {
    expect(() => validateSubdomainSyntax('-badprefix')).toThrow();
    expect(() => validateSubdomainSyntax('badsuffix-')).toThrow();
    expect(() => validateSubdomainSyntax('bad_underscore')).toThrow();
    expect(() => validateSubdomainSyntax('a')).toThrow(/between 3 and 63/i);
  });

  test('validateSubdomainStep detects duplicate fullDomain', () => {
    getDb().prepare(`
      INSERT INTO subdomains (tg_id, subdomain, full_domain, base_domain)
      VALUES (1001, 'existing', 'existing.commandor.my.id', 'commandor.my.id')
    `).run();

    expect(() => validateSubdomainStep({
      subdomain: 'existing',
      baseDomain: 'commandor.my.id'
    })).toThrow(/already in use/i);

    return expect(previewSubdomainWizard({
      subdomain: 'existing',
      baseDomain: 'commandor.my.id'
    })).rejects.toThrow(/already in use/i);
  });
});

describe('Reverse Proxy VHost Generator & Syntax Validator', () => {
  test('generates valid Nginx upstream and server block without injection', () => {
    const vhost = generateNginxVhost({
      serverName: 'api.example.org',
      destinationType: 'internal_service',
      targetHost: '127.0.0.1',
      targetPort: 4000
    });

    expect(vhost.serverName).toBe('api.example.org');
    expect(vhost.config).toContain('upstream upstream_api_example_org');
    expect(vhost.config).toContain('server 127.0.0.1:4000;');
    expect(vhost.config).toContain('server_name api.example.org;');
    expect(vhost.config).toContain('proxy_set_header Connection "upgrade";');
    expect(vhost.config).not.toContain('$connection_upgrade');

    const noWebsocket = generateNginxVhost({
      serverName: 'api.example.org',
      destinationType: 'internal_service',
      targetHost: '127.0.0.1',
      targetPort: 4000,
      enableWebsocket: false
    });
    expect(noWebsocket.config).toContain('proxy_set_header Connection "";');

    // Verify syntax check
    const syntax = validateNginxConfigSyntax(vhost.config);
    expect(syntax.valid).toBe(true);
  });

  test('sets SNI and the default port for HTTPS upstreams', () => {
    const vhost = generateNginxVhost({
      serverName: 'secure.example.org',
      upstreamUrl: 'https://backend.internal'
    });

    expect(vhost.config).toContain('server backend.internal:443;');
    expect(vhost.config).toContain('proxy_pass https://upstream_secure_example_org;');
    expect(vhost.config).toContain('proxy_ssl_server_name on;');
    expect(vhost.config).toContain('proxy_ssl_name backend.internal;');
    expect(validateNginxConfigSyntax(vhost.config).valid).toBe(true);

    expect(() => generateNginxVhost({
      serverName: 'secure.example.org',
      upstreamUrl: 'https://backend.internal/path'
    })).toThrow(/scheme, host, and optional port/i);
  });

  test('rejects malicious injection attempts in serverName and upstreamTarget', () => {
    expect(() => generateNginxVhost({
      serverName: 'api.example.org\n; evil_directive on;'
    })).toThrow(/Unsafe or invalid hostname/);

    expect(() => generateNginxVhost({
      serverName: 'api.example.org',
      upstreamUrl: 'http://127.0.0.1:80; proxy_pass http://attacker.com;'
    })).toThrow(/illegal characters/);
  });

  test('validateNginxConfigSyntax catches unbalanced curly braces', () => {
    const badConfig = 'server { listen 80;';
    const syntax = validateNginxConfigSyntax(badConfig);
    expect(syntax.valid).toBe(false);
    expect(syntax.error).toContain('Unbalanced');
  });
});

describe('Subdomain Wizard Preview & Atomic Deployment', () => {
  test('previewSubdomainWizard calculates proposed DNS and proxy configurations', async () => {
    const preview = await previewSubdomainWizard({
      subdomain: 'metrics',
      baseDomain: 'commandor.my.id',
      destinationType: 'internal_service',
      destinationTarget: '8080',
      recordType: 'A'
    });

    expect(preview.fullDomain).toBe('metrics.commandor.my.id');
    expect(preview.dns.action).toBe('create');
    expect(preview.dns.recordType).toBe('A');
    expect(preview.proxy.enabled).toBe(true);
    expect(preview.proxy.configPreview).toContain('upstream_metrics_commandor_my_id');
  });

  test('normalizes legacy destination aliases and honors explicit DNS content', async () => {
    const preview = await previewSubdomainWizard({
      subdomain: 'legacy-alias',
      baseDomain: 'commandor.my.id',
      destinationType: 'internal_port',
      destinationTarget: '9090',
      dnsContent: '203.0.113.42',
      recordType: 'A'
    });

    expect(preview.destination.type).toBe('internal_service');
    expect(preview.destination.target).toBe('127.0.0.1:9090');
    expect(preview.dns.content).toBe('203.0.113.42');
    expect(preview.proxy.proxyPassTarget).toBe('http://127.0.0.1:9090');
  });

  test('validates CNAME content instead of silently using an address', async () => {
    await expect(previewSubdomainWizard({
      subdomain: 'cname-invalid',
      baseDomain: 'commandor.my.id',
      destinationType: 'dns_only',
      recordType: 'CNAME',
      dnsContent: '203.0.113.42'
    })).rejects.toThrow(/hostname/i);

    const preview = await previewSubdomainWizard({
      subdomain: 'cname-valid',
      baseDomain: 'commandor.my.id',
      destinationType: 'dns_only',
      recordType: 'CNAME',
      dnsContent: 'origin.example.com'
    });

    expect(preview.destination.target).toBe('origin.example.com');
    expect(preview.dns.content).toBe('origin.example.com');
    expect(preview.proxy.enabled).toBe(false);
  });

  test('static destinations route to the edge app and persist the payload', async () => {
    const body = '<h1>Edge Response</h1>';
    const preview = await previewSubdomainWizard({
      subdomain: 'edge',
      baseDomain: 'commandor.my.id',
      destinationType: 'static',
      webCustomBody: body,
      enableDns: false
    });

    expect(preview.destination.type).toBe('static');
    expect(preview.web.mode).toBe('static');
    expect(preview.web.customBody).toBe(body);
    expect(preview.proxy.enabled).toBe(true);
    expect(preview.proxy.proxyPassTarget).toBe(`http://127.0.0.1:${require('../../config/config').server.port}`);

    const deployed = await deploySubdomainWizard({
      tgId: 1001,
      subdomain: 'edge',
      baseDomain: 'commandor.my.id',
      destinationType: 'static',
      webCustomBody: body,
      enableDns: false,
      enableProxy: false,
      confirmationAccepted: true
    });

    expect(deployed.subdomain.destination_type).toBe('static');
    expect(deployed.subdomain.web_enabled).toBe(1);
    expect(deployed.subdomain.web_mode).toBe('static');
    expect(deployed.subdomain.web_custom_body).toBe(body);
    expect(deployed.verification.routing.status).toBe('skipped');
  });

  test('rejects node-backed destinations for non-admin users and accepts them for admins', async () => {
    getDb().prepare(`
      INSERT INTO hosting_nodes (name, host, port, username, http_port)
      VALUES ('edge-node', '10.0.0.5', 22, 'root', 8080)
    `).run();
    const node = getDb().prepare("SELECT id FROM hosting_nodes WHERE name='edge-node'").get();

    await expect(previewSubdomainWizard({
      subdomain: 'node-route',
      baseDomain: 'commandor.my.id',
      destinationType: 'node_app',
      nodeId: node.id,
      isAdmin: false
    })).rejects.toThrow(/administrators/i);

    const preview = await previewSubdomainWizard({
      subdomain: 'node-route',
      baseDomain: 'commandor.my.id',
      destinationType: 'node_app',
      nodeId: node.id,
      isAdmin: true
    });

    expect(preview.destination.type).toBe('node_app');
    expect(preview.destination.target).toBe('10.0.0.5:8080');
  });

  test('rejects linking a wizard subdomain to an application owned by another user', async () => {
    getDb().prepare(`
      INSERT INTO applications (name, git_repo, user_tg_id, status)
      VALUES ('other-users-app', 'https://github.com/other/app.git', 2002, 'stopped')
    `).run();
    const app = getDb().prepare("SELECT id FROM applications WHERE name='other-users-app'").get();

    await expect(previewSubdomainWizard({
      subdomain: 'app-owner-test',
      baseDomain: 'commandor.my.id',
      destinationType: 'internal_service',
      destinationTarget: '3000',
      applicationId: app.id,
      tgId: 1001,
      isAdmin: false
    })).rejects.toThrow(/Unauthorized/);
  });

  test('verification treats skipped DNS and static routing as healthy, and pending TLS as pending', async () => {
    const db = getDb();
    const healthySub = db.prepare(`
      INSERT INTO subdomains
        (tg_id, subdomain, full_domain, base_domain, destination_type, dns_status, https_status)
      VALUES (?, ?, ?, ?, 'static', 'none', 'disabled')
    `).run(1001, 'verify-healthy', 'verify-healthy.commandor.my.id', 'commandor.my.id');

    const healthy = await verifySubdomainRoute(Number(healthySub.lastInsertRowid));
    expect(healthy.dns.status).toBe('skipped');
    expect(healthy.routing.status).toBe('skipped');
    expect(healthy.https.status).toBe('disabled');
    expect(healthy.overallHealth).toBe('healthy');

    const pendingSub = db.prepare(`
      INSERT INTO subdomains
        (tg_id, subdomain, full_domain, base_domain, destination_type, dns_status, https_status)
      VALUES (?, ?, ?, ?, 'static', 'none', 'pending')
    `).run(1001, 'verify-pending-tls', 'verify-pending-tls.commandor.my.id', 'commandor.my.id');

    const pending = await verifySubdomainRoute(Number(pendingSub.lastInsertRowid));
    expect(pending.https.status).toBe('pending');
    expect(pending.https.active).toBe(false);
    expect(pending.overallHealth).toBe('pending');
    expect(pending.remediation).toMatch(/certificate/i);

    db.prepare('DELETE FROM subdomains WHERE id IN (?, ?)')
      .run(Number(healthySub.lastInsertRowid), Number(pendingSub.lastInsertRowid));
  });

  test('deploySubdomainWizard requires explicit confirmation', async () => {
    await expect(deploySubdomainWizard({
      tgId: 1001,
      subdomain: 'portal',
      baseDomain: 'commandor.my.id',
      confirmationAccepted: false
    })).rejects.toThrow(/explicitly confirm/i);
  });

  test('deploySubdomainWizard deploys and creates verified database record', async () => {
    const deployed = await deploySubdomainWizard({
      tgId: 1001,
      subdomain: 'portal',
      baseDomain: 'commandor.my.id',
      destinationType: 'internal_service',
      destinationTarget: '3000',
      enableDns: false,
      enableProxy: false, // In test environment without root nginx write permissions
      confirmationAccepted: true
    });

    expect(deployed.subdomain).toBeDefined();
    expect(deployed.subdomain.full_domain).toBe('portal.commandor.my.id');
    expect(deployed.subdomain.destination_type).toBe('internal_service');
    expect(deployed.verification).toBeDefined();
    expect(deployed.verification.fullDomain).toBe('portal.commandor.my.id');
  });

  test('safeDeleteSubdomain deletes route and database entry cleanly', async () => {
    const db = getDb();
    const sub = db.prepare("SELECT id FROM subdomains WHERE full_domain='portal.commandor.my.id'").get();
    expect(sub).toBeDefined();

    const res = await safeDeleteSubdomain(sub.id, 1001, { deleteDns: false });
    expect(res.success).toBe(true);
    expect(db.prepare('SELECT id FROM subdomains WHERE id=?').get(sub.id)).toBeUndefined();
  });
});
