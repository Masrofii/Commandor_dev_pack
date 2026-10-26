'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.DOMAINS = 'test.example.com';
process.env.DEFAULT_DOMAIN = 'test.example.com';
process.env.DOMAIN = 'test.example.com';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';

jest.mock('../../src/services/nodeManagerService', () => {
  const actual = jest.requireActual('../../src/services/nodeManagerService');
  return {
    ...actual,
    deployFilesToNode: jest.fn(async (node, siteName, files) => ({
      success: true,
      filesCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + Buffer.byteLength(String(file.content || '')), 0),
      siteDir: `/var/www/nodesites/${siteName}`
    })),
    removeSiteFromNode: jest.fn(async () => true)
  };
});

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const nodeManager = require('../../src/services/nodeManagerService');
const {
  getTOS,
  getPlan,
  getUserSites,
  getSiteById,
  checkUserLimits,
  deploySite,
  deleteSite,
  recordSiteVisit
} = require('../../src/services/hostingService');

let nodeId;

beforeAll(() => {
  initDatabase();
  runMigrations();
  const db = getDb();
  db.prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'hostuser', 'user')").run();
  db.prepare("INSERT INTO users(tg_id, username, role) VALUES(1002, 'otheruser', 'user')").run();
  db.prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'admin', 'admin')").run();
  const info = db.prepare(`
    INSERT INTO hosting_nodes (name, host, port, username, public_url, status, max_sites, current_sites, is_active)
    VALUES ('test-node', '127.0.0.1', 22, 'root', 'http://127.0.0.1:8080', 'online', 10, 0, 1)
  `).run();
  nodeId = info.lastInsertRowid;
});

afterAll(() => closeDatabase());

afterEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM hosting_sites').run();
  db.prepare('DELETE FROM hosting_security_logs').run();
  db.prepare('DELETE FROM subdomains').run();
  db.prepare('UPDATE hosting_nodes SET current_sites=0 WHERE id=?').run(nodeId);
  nodeManager.deployFilesToNode.mockClear();
  nodeManager.removeSiteFromNode.mockClear();
});

function addSite({ tgId = 1001, name = 'existing', fullDomain = 'existing.test.example.com' } = {}) {
  return getDb().prepare(`
    INSERT INTO hosting_sites (tg_id, node_id, name, subdomain, full_domain, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(tgId, nodeId, name, name, fullDomain).lastInsertRowid;
}

describe('Hosting service', () => {
  test('exposes terms of service and default plans', () => {
    const tos = getTOS();
    expect(tos.version).toBe('1.0');
    expect(tos.content).toMatch(/Zero-Tolerance Anti-Abuse/i);

    const free = getPlan('free');
    expect(free).toMatchObject({ id: 'free', is_default: 1, max_sites: 1 });
    expect(getPlan('does-not-exist').id).toBe('free');
  });

  test('enforces per-plan site limits for users while admins are unlimited', () => {
    expect(checkUserLimits(1001).canCreate).toBe(true);
    addSite();
    expect(checkUserLimits(1001).canCreate).toBe(false);
    expect(checkUserLimits(9999).canCreate).toBe(true);
    expect(checkUserLimits(9999).plan.id).toBe('unlimited');
  });

  test('hides node assignment details from non-admin site listings', () => {
    const siteId = addSite();
    const userSites = getUserSites(1001, false);
    expect(userSites).toHaveLength(1);
    expect(userSites[0].node_id).toBeUndefined();
    expect(userSites[0].node_name).toBeUndefined();
    expect(userSites[0].node_status).toBeUndefined();

    const adminSites = getUserSites(1001, true);
    expect(adminSites[0].node_id).toBe(nodeId);
    expect(adminSites[0].node_name).toBe('test-node');

    expect(getSiteById(siteId, 1002, false)).toBeUndefined();
    expect(getSiteById(siteId, 9999, true).node_id).toBe(nodeId);
  });

  test('requires terms acceptance and validates site names, files and archives', async () => {
    await expect(deploySite({ tgId: 1001, name: 'valid-name', rawHtml: '<h1>Hi</h1>', tosAccepted: false }))
      .rejects.toThrow(/accept the Hosting Terms/i);
    await expect(deploySite({ tgId: 1001, name: 'ab', rawHtml: '<h1>Hi</h1>' }))
      .rejects.toThrow(/between 3 and 30/i);
    await expect(deploySite({ tgId: 1001, name: 'valid-name' }))
      .rejects.toThrow(/No valid files/i);
    await expect(deploySite({ tgId: 1001, name: 'valid-name', files: [{ name: 'app.js', content: 'console.log(1)' }] }))
      .rejects.toThrow(/Missing 'index.html'/i);
    await expect(deploySite({ tgId: 1001, name: 'valid-name', zipBuffer: Buffer.from('not a zip') }))
      .rejects.toThrow(/Could not read ZIP archive/i);
  });

  test('blocks dangerous file extensions and records a security violation', async () => {
    await expect(deploySite({
      tgId: 1001,
      name: 'blocked-site',
      files: [
        { name: 'index.html', content: '<h1>Hello</h1>' },
        { name: 'payload.sh', content: 'echo hello' }
      ]
    })).rejects.toThrow(/Security Violation Blocked/i);

    expect(nodeManager.deployFilesToNode).not.toHaveBeenCalled();
    const log = getDb().prepare('SELECT * FROM hosting_security_logs WHERE tg_id=?').get(1001);
    expect(log.threat_type).toBe('blocked_extension');
    expect(log.file_name).toBe('payload.sh');
  });

  test('prevents another user from taking an existing site name', async () => {
    addSite({ name: 'taken', fullDomain: 'taken.test.example.com' });
    await expect(deploySite({
      tgId: 1002,
      name: 'taken',
      rawHtml: '<h1>Hello</h1>'
    })).rejects.toThrow(/already taken/i);
  });

  test('applies plan limits before touching a node', async () => {
    addSite();
    await expect(deploySite({
      tgId: 1001,
      name: 'second-site',
      rawHtml: '<h1>Hello</h1>'
    })).rejects.toThrow(/Plan limit reached/i);
    expect(nodeManager.deployFilesToNode).not.toHaveBeenCalled();
  });

  test('reports a clear error when no hosting node is available', async () => {
    getDb().prepare("UPDATE hosting_nodes SET status='offline' WHERE id=?").run(nodeId);
    try {
      await expect(deploySite({
        tgId: 1001,
        name: 'no-node-site',
        rawHtml: '<h1>Hello</h1>'
      })).rejects.toThrow(/No hosting servers currently available/i);
      expect(nodeManager.deployFilesToNode).not.toHaveBeenCalled();
    } finally {
      getDb().prepare("UPDATE hosting_nodes SET status='online' WHERE id=?").run(nodeId);
    }
  });

  test('deploys a static site, configures its subdomain and records storage usage', async () => {
    const site = await deploySite({
      tgId: 1001,
      name: 'demo-site',
      files: [{ name: 'index.html', content: '<h1>Hello world</h1>' }],
      ipAddress: '203.0.113.10'
    });

    expect(site).toBeDefined();
    expect(site.name).toBe('demo-site');
    expect(site.full_domain).toBe('demo-site.test.example.com');
    expect(site.status).toBe('active');
    expect(site.node_id).toBeUndefined();
    expect(nodeManager.deployFilesToNode).toHaveBeenCalledTimes(1);

    const subdomain = getDb().prepare('SELECT * FROM subdomains WHERE full_domain=?').get('demo-site.test.example.com');
    expect(subdomain).toBeDefined();
    expect(subdomain.tg_id).toBe(1001);
    expect(subdomain.web_mode).toBe('proxy');
    expect(subdomain.web_target).toBe('http://127.0.0.1:8080/sites/demo-site/');

    const node = getDb().prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
    expect(node.current_sites).toBe(1);

    const user = getDb().prepare('SELECT * FROM users WHERE tg_id=?').get(1001);
    expect(user.hosting_storage_used).toBeGreaterThan(0);

    recordSiteVisit('demo-site.test.example.com');
    expect(getSiteById(site.id, 1001, false).visits_count).toBe(1);

    const deleted = await deleteSite(site.id, 1001, false);
    expect(deleted).toBe(true);
    expect(nodeManager.removeSiteFromNode).toHaveBeenCalled();
    expect(getDb().prepare('SELECT * FROM hosting_sites WHERE id=?').get(site.id)).toBeUndefined();
    expect(getDb().prepare('SELECT * FROM subdomains WHERE full_domain=?').get('demo-site.test.example.com')).toBeUndefined();
  });

  test('does not delete another user\'s site', async () => {
    const siteId = addSite({ tgId: 1001, name: 'owned', fullDomain: 'owned.test.example.com' });
    await expect(deleteSite(siteId, 1002, false)).resolves.toBe(false);
    expect(getDb().prepare('SELECT * FROM hosting_sites WHERE id=?').get(siteId)).toBeDefined();
    expect(nodeManager.removeSiteFromNode).not.toHaveBeenCalled();
  });
});
