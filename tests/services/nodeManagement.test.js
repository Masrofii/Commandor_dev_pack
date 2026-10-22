'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.DOMAINS = 'commandor.my.id,test.example.com';
process.env.DEFAULT_DOMAIN = 'commandor.my.id';
process.env.SESSION_SECRET = 'test';
process.env.JWT_SECRET = 'test';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  parseNodeConnectionString,
  parseBulkConnectionStrings,
  getNodeById,
  getNodeWithSites,
  pingNode,
  executeNodeCommand
} = require('../../src/services/nodeManagerService');
const {
  getAvailableBaseDomains,
  claimSubdomain
} = require('../../src/services/subdomainService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'admin1', 'admin')").run();
});

afterAll(() => closeDatabase());

describe('Node Connection Parsing & Bulk Specs', () => {
  test('parses host:port:user:pass#label format correctly', () => {
    const res = parseNodeConnectionString('192.168.1.50:2222:root:MySecretPassword#Node-Alpha');
    expect(res.host).toBe('192.168.1.50');
    expect(res.port).toBe(2222);
    expect(res.username).toBe('root');
    expect(res.password).toBe('MySecretPassword');
    expect(res.name).toBe('Node-Alpha');
  });

  test('parses user:pass@host:port#label format correctly', () => {
    const res = parseNodeConnectionString('admin:pass123@vps.cloud.io:22#ProductionNode');
    expect(res.host).toBe('vps.cloud.io');
    expect(res.port).toBe(22);
    expect(res.username).toBe('admin');
    expect(res.password).toBe('pass123');
    expect(res.name).toBe('ProductionNode');
  });

  test('parses bulk connection strings skipping comments and blank lines', () => {
    const input = `
      # Primary Nodes
      10.0.0.1:22:root:pass1#Node1
      // Secondary Node
      root:pass2@10.0.0.2:22#Node2

      invalid-line-here
    `;

    const parsed = parseBulkConnectionStrings(input);
    expect(parsed.length).toBe(3);
    expect(parsed[0].host).toBe('10.0.0.1');
    expect(parsed[0].name).toBe('Node1');
    expect(parsed[1].host).toBe('10.0.0.2');
    expect(parsed[1].name).toBe('Node2');
    expect(parsed[2].status).toBe('error');
  });
});

describe('Node Management Services & Diagnostics', () => {
  test('inserts node into database and retrieves with sites', () => {
    const db = getDb();
    const info = db.prepare(`
      INSERT INTO hosting_nodes (name, host, port, username, status, current_sites, max_sites, is_active, created_at)
      VALUES ('TestNode1', '127.0.0.1', 22, 'root', 'online', 1, 50, 1, datetime('now'))
    `).run();
    const nodeId = info.lastInsertRowid;

    db.prepare(`
      INSERT INTO hosting_sites (tg_id, node_id, name, subdomain, full_domain, status, created_at)
      VALUES (1001, ?, 'mysite', 'mysite', 'mysite.commandor.my.id', 'active', datetime('now'))
    `).run(nodeId);

    const withSites = getNodeWithSites(nodeId);
    expect(withSites).toBeDefined();
    expect(withSites.name).toBe('TestNode1');
    expect(Array.isArray(withSites.sites)).toBe(true);
    expect(withSites.sites.length).toBe(1);
    expect(withSites.sites[0].full_domain).toBe('mysite.commandor.my.id');
  });

  test('pingNode rejects non-existent node gracefully', async () => {
    await expect(pingNode(999999)).rejects.toThrow('Node #999999 not found');
  });

  test('executeNodeCommand validates command is not empty and rejects non-existent node', async () => {
    await expect(executeNodeCommand(1, '')).rejects.toThrow('Command string is required');
    await expect(executeNodeCommand(999999, 'uptime')).rejects.toThrow('Node #999999 not found');
  });
});

describe('Subdomain Wizard Base Domains & Routing', () => {
  test('returns available base domains including default and custom verified domains', () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO custom_domains (tg_id, domain, verified, active, verification_token, created_at)
      VALUES (1001, 'mycompany.org', 1, 1, 'tok_test_123', datetime('now'))
    `).run();

    const bases = getAvailableBaseDomains(1001);
    expect(bases).toContain('commandor.my.id');
    expect(bases).toContain('mycompany.org');
  });

  test('claims subdomain on verified base domain with proxy routing', () => {
    const sub = claimSubdomain({
      tgId: 1001,
      subdomain: 'cool-app',
      baseDomain: 'mycompany.org',
      webMode: 'proxy',
      webTarget: 'http://127.0.0.1:3000'
    });

    expect(sub).toBeDefined();
    expect(sub.full_domain).toBe('cool-app.mycompany.org');
    expect(sub.web_mode).toBe('proxy');
    expect(sub.web_target).toBe('http://127.0.0.1:3000');
  });
});
