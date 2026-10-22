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
    expect(() => validateSubdomainSyntax('a')).toThrow(/length/i);
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

    // Verify syntax check
    const syntax = validateNginxConfigSyntax(vhost.config);
    expect(syntax.valid).toBe(true);
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
      subdomain: 'status',
      baseDomain: 'commandor.my.id',
      destinationType: 'internal_service',
      destinationTarget: '8080',
      recordType: 'A'
    });

    expect(preview.fullDomain).toBe('status.commandor.my.id');
    expect(preview.dns.action).toBe('create');
    expect(preview.dns.recordType).toBe('A');
    expect(preview.proxy.enabled).toBe(true);
    expect(preview.proxy.configPreview).toContain('upstream_status_commandor_my_id');
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
