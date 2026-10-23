'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { encrypt, decrypt, maskSecret } = require('../../src/utils/encryption');
const {
  enrollNode,
  getNodeById,
  listNodes,
  updateNode,
  validateBulkNodes,
  deleteNode
} = require('../../src/services/nodeManagerService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
});

afterAll(() => closeDatabase());

describe('Encryption & Secret Redaction', () => {
  test('encrypts and decrypts secrets with AES-256-GCM', () => {
    const secret = 'super-secret-ssh-key-or-password';
    const encrypted = encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secret);
  });

  test('maskSecret correctly masks sensitive tokens and keys', () => {
    const token = 'cf_token_abcdef1234567890xyz';
    const masked = maskSecret(token);
    expect(masked).toBe('cf_t••••••••0xyz');
  });

  test('enrolled node encrypts password/private key and redacts raw secrets in API outputs', async () => {
    const rawPass = 'V3ryS3cur3P@ssw0rd!';
    const node = await enrollNode({
      name: 'Secure-Node-1',
      host: '10.50.0.1',
      port: 22,
      username: 'azureuser',
      password: rawPass,
      labels: ['prod', 'vps'],
      notes: 'Production node in EU',
      testBeforeSave: false // Skip live SSH connection in unit test
    });

    expect(node).toBeDefined();
    expect(node.name).toBe('Secure-Node-1');
    expect(node.has_password).toBe(true);
    expect(node.has_private_key).toBe(false);
    expect(node.password).toBeUndefined(); // Crucial: must never expose raw or encrypted password!
    expect(node.private_key).toBeUndefined();

    // Verify stored password in database is encrypted (not plain text)
    const dbRecord = getDb().prepare('SELECT password FROM hosting_nodes WHERE id=?').get(node.id);
    expect(dbRecord.password).not.toBe(rawPass);
    expect(decrypt(dbRecord.password)).toBe(rawPass);

    // Verify listNodes also redacts secrets
    const list = listNodes({ onlyActive: false });
    const found = list.find(n => n.id === node.id);
    expect(found.password).toBeUndefined();
    expect(found.has_password).toBe(true);
  });

  test('updateNode safely updates metadata and credentials without leaking', async () => {
    const rawNode = getDb().prepare("SELECT id FROM hosting_nodes WHERE host='10.50.0.1'").get();
    const updated = updateNode(rawNode.id, {
      name: 'Renamed-Node-1',
      notes: 'Updated notes'
    });

    expect(updated.name).toBe('Renamed-Node-1');
    expect(updated.notes).toBe('Updated notes');
    expect(updated.password).toBeUndefined();
  });

  test('validateBulkNodes detects duplicate host:port in batch and against existing DB nodes', () => {
    const bulkInput = `
      10.50.0.1:22:root:pass1#ExistingNode
      10.50.0.2:22:root:pass2#NewNode1
      10.50.0.2:22:root:pass2#DuplicateInBatch
      invalid-entry
    `;

    const validation = validateBulkNodes(bulkInput);
    expect(validation.total).toBe(4);
    expect(validation.updateCount).toBe(1); // 10.50.0.1 exists in DB
    expect(validation.newCount).toBe(1); // 10.50.0.2 is new
    expect(validation.invalidCount).toBe(2); // 1 duplicate in batch + 1 invalid syntax
  });

  test('safeDeleteNode prevents accidental deletion of node hosting active sites', () => {
    const rawNode = getDb().prepare("SELECT id FROM hosting_nodes WHERE host='10.50.0.1'").get();
    // Add a dummy site
    getDb().prepare(`
      INSERT INTO hosting_sites (tg_id, node_id, name, subdomain, full_domain, status, created_at)
      VALUES (1001, ?, 'active-app', 'active-app', 'active-app.commandor.my.id', 'active', datetime('now'))
    `).run(rawNode.id);

    expect(() => deleteNode(rawNode.id)).toThrow(/Cannot delete node: it currently hosts 1 site/);

    // Remove dummy site, then delete succeeds
    getDb().prepare('DELETE FROM hosting_sites WHERE node_id=?').run(rawNode.id);
    const deleted = deleteNode(rawNode.id);
    expect(deleted).toBe(true);
  });

  test('executeNodeCommand strictly rejects dangerous destructive command patterns', async () => {
    const { executeNodeCommand } = require('../../src/services/nodeManagerService');

    await expect(executeNodeCommand(999, 'rm -rf /', 1001))
      .rejects.toThrow(/Unsafe or destructive pattern detected/);

    await expect(executeNodeCommand(999, 'mkfs.ext4 /dev/sda1', 1001))
      .rejects.toThrow(/Unsafe or destructive pattern detected/);

    await expect(executeNodeCommand(999, ':(){ :|:& };:', 1001))
      .rejects.toThrow(/Unsafe or destructive pattern detected/);
  });
});
