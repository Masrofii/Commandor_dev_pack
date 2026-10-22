'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  addDomain,
  getAllDomains,
  getDomainById,
  updateDomain,
  deleteDomain
} = require('../../src/services/domainService');
const { getProvider, detectConflicts } = require('../../src/services/dns/DnsManager');
const ManualDnsProvider = require('../../src/services/dns/ManualDnsProvider');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
});

afterAll(() => closeDatabase());

describe('Domain Inventory & DNS Provider Abstraction', () => {
  test('adds root domain to inventory with masked DNS token and metadata', () => {
    const domain = addDomain(1001, 'example.org', {
      registrar: 'Namecheap',
      dns_provider: 'cloudflare',
      dns_provider_token: 'cf-secret-token-1234567890abcdef',
      notes: 'Primary cluster root domain'
    });

    expect(domain).toBeDefined();
    expect(domain.domain).toBe('example.org');
    expect(domain.registrar).toBe('Namecheap');
    expect(domain.dns_provider).toBe('cloudflare');
    expect(domain.has_dns_token).toBe(true);
    expect(domain.dns_provider_token_masked).toContain('••••••••');
    expect(domain.dns_provider_token).toBeUndefined(); // Never leak raw token!
  });

  test('getAllDomains returns inventory with proper statuses', () => {
    const list = getAllDomains();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const item = list.find(d => d.domain === 'example.org');
    expect(item).toBeDefined();
    expect(item.dns_status).toBe('pending');
    expect(item.routing_status).toBe('active');
  });

  test('updateDomain safely updates registrar and notes', () => {
    const item = getAllDomains()[0];
    const updated = updateDomain(item.id, 1001, {
      registrar: 'Cloudflare Registrar',
      notes: 'Updated notes description'
    });
    expect(updated.registrar).toBe('Cloudflare Registrar');
    expect(updated.notes).toBe('Updated notes description');
  });

  test('detectConflicts flags CNAME colliding with existing A records', () => {
    const existing = [
      { name: 'app.example.org', type: 'A', content: '1.2.3.4' }
    ];

    const check = detectConflicts('app.example.org', 'CNAME', existing);
    expect(check.hasConflict).toBe(true);
    expect(check.conflicts[0]).toContain('CNAME conflict');
  });

  test('ManualDnsProvider generates instructions for manual record setup', async () => {
    const manual = new ManualDnsProvider();
    const zone = await manual.getZone('manual.org');
    expect(zone.id).toBeDefined();

    const created = await manual.createRecord(zone.id, {
      type: 'A',
      name: 'api.manual.org',
      content: '74.248.38.38'
    });
    expect(created.manualInstructions).toContain('74.248.38.38');
  });

  test('deleteDomain safely removes domain from inventory', () => {
    const item = getAllDomains()[0];
    const ok = deleteDomain(item.id, 1001);
    expect(ok).toBe(true);
    expect(getDomainById(item.id)).toBeNull();
  });
});
