'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';
process.env.LOCAL_AUTH_ENABLED = 'true';
process.env.LOCAL_ADMIN_USERNAME = 'admin';
process.env.LOCAL_ADMIN_PASSWORD = 'correct-horse-battery-staple';
process.env.LOCAL_ADMIN_TG_ID = '900000001';
process.env.TELEGRAM_BOT_TOKEN = '';

const express = require('express');
const request = require('supertest');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const config = require('../../config/config');
const {
  ensureLocalAdmin,
  authenticateLocal,
  isLocalAuthAvailable,
  getLocalAuthHint,
  validateUsername
} = require('../../src/services/localAuthService');
const { createWebSession } = require('../../src/auth/sessions');

let app;

beforeAll(async () => {
  initDatabase();
  runMigrations();
  await ensureLocalAdmin();

  app = express();
  app.use(express.json());
  app.use('/api/auth', require('../../src/api/auth'));
});

afterAll(() => closeDatabase());

describe('Local password authentication', () => {
  test('validates local usernames', () => {
    expect(validateUsername('Admin.User_1')).toBe('admin.user_1');
    expect(() => validateUsername('ab')).toThrow(/3-64/i);
    expect(() => validateUsername('bad name')).toThrow(/letters, numbers/i);
    expect(() => validateUsername('-admin')).toThrow(/letters, numbers/i);
  });

  test('bootstraps an administrator account and advertises local login status', async () => {
    expect(isLocalAuthAvailable()).toBe(true);
    expect(getLocalAuthHint()).toEqual({ username: 'admin' });

    const user = getDb().prepare('SELECT * FROM users WHERE tg_id=?').get(900000001);
    expect(user.role).toBe('admin');
    expect(user.local_username).toBe('admin');
    expect(user.password_hash).toMatch(/^\$2[aby]\$/);
    expect(user.password_hash).not.toContain('correct-horse');

    const res = await request(app).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body.localAuthEnabled).toBe(true);
    expect(res.body.localAuthUsername).toBe('admin');
    expect(res.body.telegramEnabled).toBe(false);
  });

  test('does not rewrite the password hash when the configured password is unchanged', async () => {
    const before = getDb().prepare('SELECT password_hash FROM users WHERE tg_id=?').get(900000001).password_hash;
    await ensureLocalAdmin();
    const after = getDb().prepare('SELECT password_hash FROM users WHERE tg_id=?').get(900000001).password_hash;
    expect(after).toBe(before);
  });

  test('rejects invalid credentials without revealing whether the account exists', async () => {
    await expect(authenticateLocal('admin', 'wrong-password')).resolves.toBeNull();
    await expect(authenticateLocal('nobody', 'wrong-password')).resolves.toBeNull();

    const res = await request(app)
      .post('/api/auth/local/login')
      .send({ username: 'admin', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid username or password/i);

    const missing = await request(app)
      .post('/api/auth/local/login')
      .send({ username: 'admin' });
    expect(missing.status).toBe(400);

    const failureAudit = getDb().prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='auth.local_login_failed'").get();
    expect(failureAudit.count).toBeGreaterThanOrEqual(1);
  });

  test('accepts valid credentials case-insensitively and issues a web session', async () => {
    const res = await request(app)
      .post('/api/auth/local/login')
      .send({ username: 'ADMIN', password: 'correct-horse-battery-staple' });

    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.user).toMatchObject({ tgId: 900000001, username: 'admin', role: 'admin' });

    const session = getDb().prepare('SELECT * FROM web_sessions WHERE tg_id=? AND id=?').get(900000001, res.body.sessionId);
    expect(session).toBeDefined();

    const successAudit = getDb().prepare("SELECT * FROM audit_logs WHERE action='auth.login_local' ORDER BY id DESC LIMIT 1").get();
    expect(successAudit).toBeDefined();
  });

  test('blocks banned local accounts', async () => {
    getDb().prepare('UPDATE users SET is_banned=1 WHERE tg_id=?').run(900000001);
    await expect(authenticateLocal('admin', 'correct-horse-battery-staple')).resolves.toMatchObject({ banned: true });

    const res = await request(app)
      .post('/api/auth/local/login')
      .send({ username: 'admin', password: 'correct-horse-battery-staple' });
    expect(res.status).toBe(403);

    getDb().prepare('UPDATE users SET is_banned=0 WHERE tg_id=?').run(900000001);
  });

  test('password rotation invalidates existing sessions and the old password', async () => {
    const session = createWebSession(900000001);
    expect(session.rawToken).toBeDefined();

    config.localAuth.password = 'a-new-longer-password';
    await ensureLocalAdmin();

    const remaining = getDb().prepare('SELECT COUNT(*) AS count FROM web_sessions WHERE tg_id=?').get(900000001);
    expect(remaining.count).toBe(0);

    await expect(authenticateLocal('admin', 'correct-horse-battery-staple')).resolves.toBeNull();
    await expect(authenticateLocal('admin', 'a-new-longer-password')).resolves.toMatchObject({
      user: { tg_id: 900000001, role: 'admin' }
    });
  });

  test('reports local login as unavailable when disabled', async () => {
    const original = config.localAuth.enabled;
    config.localAuth.enabled = false;
    expect(isLocalAuthAvailable()).toBe(false);
    await expect(authenticateLocal('admin', 'a-new-longer-password')).rejects.toThrow(/not enabled/i);

    const res = await request(app)
      .post('/api/auth/local/login')
      .send({ username: 'admin', password: 'a-new-longer-password' });
    expect(res.status).toBe(404);

    config.localAuth.enabled = original;
  });
});
