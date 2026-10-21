'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.DOMAINS = 'test.example.com';
process.env.DEFAULT_DOMAIN = 'test.example.com';
process.env.MAX_ALIASES = '5';
process.env.MAX_STORAGE_BYTES = '104857600';
process.env.BURNER_TTL_MINUTES = '60';
process.env.EMAIL_TTL_DAYS = '7';
process.env.ALIAS_TTL_DAYS = '0';
process.env.SESSION_SECRET = 'test';
process.env.JWT_SECRET = 'test';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  claimSubdomain,
  getUserSubdomains,
  getSubdomainById,
  getSubdomainByFullDomain,
  updateSubdomain,
  deleteSubdomain,
  recordSubdomainEmail,
  recordWebRequest,
  getSubdomainWebRequests
} = require('../../src/services/subdomainService');
const { createAlias, getAllowedDomains } = require('../../src/services/aliasService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'user1', 'user')").run();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'admin1', 'admin')").run();
});

afterAll(() => closeDatabase());

afterEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM subdomains').run();
  db.prepare('DELETE FROM subdomain_web_requests').run();
  db.prepare('DELETE FROM aliases').run();
});

describe('Subdomain Service', () => {
  test('successfully claims a valid subdomain', () => {
    const sub = claimSubdomain({
      tgId: 1001,
      subdomain: 'myproject',
      emailCatchAll: 1,
      webMode: 'landing'
    });

    expect(sub).toBeDefined();
    expect(sub.subdomain).toBe('myproject');
    expect(sub.full_domain).toBe('myproject.test.example.com');
    expect(sub.base_domain).toBe('test.example.com');
    expect(sub.email_catch_all).toBe(1);
    expect(sub.web_mode).toBe('landing');
  });

  test('blocks reserved names for regular users', () => {
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'admin' })).toThrow(/reserved/i);
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'mail' })).toThrow(/reserved/i);
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'api' })).toThrow(/reserved/i);
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'root' })).toThrow(/reserved/i);
  });

  test('allows admin to claim reserved names', () => {
    const sub = claimSubdomain({ tgId: 9999, subdomain: 'api' });
    expect(sub.subdomain).toBe('api');
    expect(sub.full_domain).toBe('api.test.example.com');
  });

  test('rejects invalid names', () => {
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'ab' })).toThrow(/between 3 and 63/i);
    expect(() => claimSubdomain({ tgId: 1001, subdomain: '-start' })).toThrow(/cannot start or end/i);
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'end-' })).toThrow(/cannot start or end/i);
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'inv@lid!' })).toThrow(/lowercase letters/i);
  });

  test('rejects duplicate subdomain claims', () => {
    claimSubdomain({ tgId: 1001, subdomain: 'alpha' });
    expect(() => claimSubdomain({ tgId: 1001, subdomain: 'alpha' })).toThrow(/already claimed/i);
  });

  test('updates subdomain web routing settings', () => {
    const sub = claimSubdomain({ tgId: 1001, subdomain: 'webtest' });
    const updated = updateSubdomain(sub.id, 1001, {
      web_mode: 'proxy',
      web_target: 'http://127.0.0.1:8080',
      email_catch_all: 0
    });

    expect(updated.web_mode).toBe('proxy');
    expect(updated.web_target).toBe('http://127.0.0.1:8080');
    expect(updated.email_catch_all).toBe(0);
  });

  test('rejects invalid web target URL', () => {
    const sub = claimSubdomain({ tgId: 1001, subdomain: 'targettest' });
    expect(() => updateSubdomain(sub.id, 1001, { web_target: 'ftp://not-allowed' })).toThrow(/http:\/\/ or https:\/\//i);
  });

  test('includes claimed subdomain in getAllowedDomains for alias creation', () => {
    const sub = claimSubdomain({ tgId: 1001, subdomain: 'company' });
    const domains = getAllowedDomains(1001);
    expect(domains).toContain(sub.full_domain);

    const alias = createAlias({
      tgId: 1001,
      domain: sub.full_domain,
      type: 'custom',
      customName: 'mymailbox'
    });
    expect(alias.address).toBe('mymailbox-ca@company.test.example.com');
  });

  test('records web request in webhook inspector mode', () => {
    const sub = claimSubdomain({ tgId: 1001, subdomain: 'hooksub', webMode: 'webhook' });
    const reqId = recordWebRequest(sub.id, {
      method: 'POST',
      path: '/events',
      queryParams: { ref: 'test' },
      headers: { 'user-agent': 'Jest' },
      body: '{"ping":"pong"}',
      ip: '127.0.0.1'
    });

    expect(reqId).toBeGreaterThan(0);
    const requests = getSubdomainWebRequests(sub.id, 1001);
    expect(requests.length).toBe(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].path).toBe('/events');
    expect(requests[0].body).toBe('{"ping":"pong"}');

    const fresh = getSubdomainById(sub.id);
    expect(fresh.web_requests_count).toBe(1);
  });

  test('records subdomain email counter', () => {
    const sub = claimSubdomain({ tgId: 1001, subdomain: 'mailsub' });
    recordSubdomainEmail(sub.full_domain);

    const fresh = getSubdomainById(sub.id);
    expect(fresh.emails_received).toBe(1);
  });

  test('deleting subdomain cleans up associated aliases', () => {
    const sub = claimSubdomain({ tgId: 1001, subdomain: 'deletesub' });
    createAlias({ tgId: 1001, domain: sub.full_domain, type: 'throwaway' });

    expect(deleteSubdomain(sub.id, 1001)).toBe(true);
    expect(getSubdomainById(sub.id)).toBeUndefined();

    const remainingAliases = getDb().prepare('SELECT * FROM aliases WHERE domain=?').all(sub.full_domain);
    expect(remainingAliases.length).toBe(0);
  });
});
