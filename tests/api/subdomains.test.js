'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.DOMAINS = 'test.example.com';
process.env.DEFAULT_DOMAIN = 'test.example.com';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.INCOMING_SECRET = 'test-incoming';

const express = require('express');
const request = require('supertest');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { createWebSession } = require('../../src/auth/sessions');
const { claimSubdomain } = require('../../src/services/subdomainService');
const { subdomainWebMiddleware } = require('../../src/api/subdomainWebRouter');

let app;
let userToken;

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
  userToken = createWebSession(1001).rawToken;

  app = express();
  app.use(express.json());
  app.use(subdomainWebMiddleware);
  app.use('/api/subdomains', require('../../src/api/subdomains'));
});

afterAll(() => closeDatabase());

describe('Subdomain API & Web Router', () => {
  let createdSubdomainId;

  test('POST /api/subdomains claims a subdomain', async () => {
    const res = await request(app)
      .post('/api/subdomains')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        subdomain: 'mysite',
        web_mode: 'static',
        web_custom_body: '<h1>Hello Subdomain</h1>'
      });

    expect(res.status).toBe(201);
    expect(res.body.subdomain).toBe('mysite');
    expect(res.body.full_domain).toBe('mysite.test.example.com');
    expect(res.body.web_mode).toBe('static');
    createdSubdomainId = res.body.id;
  });

  test('GET /api/subdomains lists claimed subdomains', async () => {
    const res = await request(app)
      .get('/api/subdomains')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.subdomains.length).toBeGreaterThanOrEqual(1);
    expect(res.body.subdomains[0].subdomain).toBe('mysite');
  });

  test('GET /api/subdomains/check/:name checks availability', async () => {
    const res = await request(app)
      .get('/api/subdomains/check/mysite')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.check[0].available).toBe(false);

    const res2 = await request(app)
      .get('/api/subdomains/check/freename')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res2.status).toBe(200);
    expect(res2.body.check[0].available).toBe(true);
  });

  test('Subdomain Web Router serves static mode for claimed subdomain host', async () => {
    const res = await request(app)
      .get('/')
      .set('Host', 'mysite.test.example.com');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Hello Subdomain');
  });

  test('PATCH /api/subdomains/:id updates web_mode to webhook inspector', async () => {
    const res = await request(app)
      .patch(`/api/subdomains/${createdSubdomainId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        web_mode: 'webhook',
        web_notify_telegram: false
      });

    expect(res.status).toBe(200);
    expect(res.body.web_mode).toBe('webhook');
  });

  test('Subdomain Web Router captures webhook request in webhook mode', async () => {
    const res = await request(app)
      .post('/api/hook-endpoint')
      .set('Host', 'mysite.test.example.com')
      .send({ ping: 'pong' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Request logged');

    // Verify it was logged in DB
    const listRes = await request(app)
      .get(`/api/subdomains/${createdSubdomainId}/requests`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.requests.length).toBe(1);
    expect(listRes.body.requests[0].path).toBe('/api/hook-endpoint');
  });

  test('Subdomain Web Router returns 404 for unclaimed subdomain host', async () => {
    const res = await request(app)
      .get('/')
      .set('Host', 'unclaimed.test.example.com');

    expect(res.status).toBe(404);
    expect(res.text).toContain('not claimed');
  });

  test('DELETE /api/subdomains/:id deletes subdomain', async () => {
    const res = await request(app)
      .delete(`/api/subdomains/${createdSubdomainId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('deleted');
  });
});
