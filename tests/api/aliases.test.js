'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.DOMAINS = 'test.example.com';
process.env.DEFAULT_DOMAIN = 'test.example.com';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.ADMIN_ID = '9999';

const express = require('express');
const request = require('supertest');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { createWebSession } = require('../../src/auth/sessions');
const { createAlias } = require('../../src/services/aliasService');

let app;
let userToken;
let otherUserToken;
let adminToken;
let userAlias;
let otherAlias;

beforeAll(() => {
  initDatabase();
  runMigrations();

  const db = getDb();
  db.prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'user1', 'user')").run();
  db.prepare("INSERT INTO users(tg_id, username, role) VALUES(2002, 'user2', 'user')").run();
  db.prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'adminuser', 'admin')").run();

  userToken = createWebSession(1001).rawToken;
  otherUserToken = createWebSession(2002).rawToken;
  adminToken = createWebSession(9999).rawToken;

  userAlias = createAlias({ tgId: 1001, domain: 'test.example.com', type: 'throwaway', customName: 'testqr' });
  otherAlias = createAlias({ tgId: 2002, domain: 'test.example.com', type: 'throwaway', customName: 'otherqr' });

  app = express();
  app.use(express.json());
  app.use('/api/aliases', require('../../src/api/aliases'));
});

afterAll(() => closeDatabase());

describe('Alias QR Endpoint (GET /api/aliases/:address/qr)', () => {
  test('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(userAlias.address)}/qr`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized/i);
  });

  test('rejects requests with invalid query token with 401', async () => {
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(userAlias.address)}/qr?token=bad-token-123`);

    expect(res.status).toBe(401);
  });

  test('successfully generates QR code using ?token query parameter (browser <img> tag behavior)', async () => {
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(userAlias.address)}/qr?token=${encodeURIComponent(userToken)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cache-control']).toMatch(/public/);

    // Verify PNG magic bytes (\x89PNG\r\n\x1a\n)
    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text, 'binary');
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  test('successfully generates QR code using Authorization: Bearer header', async () => {
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(userAlias.address)}/qr`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text, 'binary');
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  test('handles case-insensitive alias lookups in URL', async () => {
    const upperCased = userAlias.address.toUpperCase();
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(upperCased)}/qr?token=${encodeURIComponent(userToken)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  test('supports ?format=plain and ?format=mailto', async () => {
    const plainRes = await request(app)
      .get(`/api/aliases/${encodeURIComponent(userAlias.address)}/qr?token=${encodeURIComponent(userToken)}&format=plain`);
    expect(plainRes.status).toBe(200);

    const mailtoRes = await request(app)
      .get(`/api/aliases/${encodeURIComponent(userAlias.address)}/qr?token=${encodeURIComponent(userToken)}&format=mailto`);
    expect(mailtoRes.status).toBe(200);
  });

  test('returns 404 for non-existent alias', async () => {
    const res = await request(app)
      .get(`/api/aliases/nonexistent@test.example.com/qr?token=${encodeURIComponent(userToken)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('regular user cannot access another users alias QR code', async () => {
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(otherAlias.address)}/qr?token=${encodeURIComponent(userToken)}`);

    expect(res.status).toBe(404);
  });

  test('admin can access any users alias QR code', async () => {
    const res = await request(app)
      .get(`/api/aliases/${encodeURIComponent(otherAlias.address)}/qr?token=${encodeURIComponent(adminToken)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });
});
