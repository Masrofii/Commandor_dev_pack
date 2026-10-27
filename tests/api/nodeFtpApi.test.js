'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const express = require('express');
const request = require('supertest');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { createWebSession } = require('../../src/auth/sessions');
const { enrollNode } = require('../../src/services/nodeManagerService');

let app;
let adminToken;
let userToken;
let testNodeId;

beforeAll(async () => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'normaluser', 'user')").run();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'adminuser', 'admin')").run();

  userToken = createWebSession(1001).rawToken;
  adminToken = createWebSession(9999).rawToken;

  const node = await enrollNode({
    name: 'API-Test-Node',
    host: '127.0.0.1',
    port: 22,
    username: 'root',
    password: 'testpassword',
    ftpPort: 2121,
    testBeforeSave: false
  });
  testNodeId = node.id;

  app = express();
  app.use(express.json());
  app.use('/api/hosting', require('../../src/api/hosting'));
  app.use('/api/admin', require('../../src/api/admin'));
});

afterAll(() => closeDatabase());

describe('Hosting & Admin Node FTP API Endpoints', () => {
  let createdFtpUserId;

  test('GET /api/hosting/nodes/:id/ftp requires admin access', async () => {
    const res = await request(app)
      .get(`/api/hosting/nodes/${testNodeId}/ftp`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/hosting/nodes/:id/ftp retrieves FTP info for admin', async () => {
    const res = await request(app)
      .get(`/api/hosting/nodes/${testNodeId}/ftp`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.nodeId).toBe(testNodeId);
    expect(res.body.ftp_port).toBeDefined();
    expect(res.body.quick_connect).toBeDefined();
    expect(res.body.quick_connect.host).toBe('127.0.0.1');
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  test('POST /api/hosting/nodes/:id/ftp/detect runs auto-detection probe', async () => {
    const res = await request(app)
      .post(`/api/hosting/nodes/${testNodeId}/ftp/detect`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.port).toBeDefined();
    expect(res.body.status).toBeDefined();
  });

  test('POST /api/hosting/nodes/:id/ftp/users creates an FTP user account', async () => {
    const res = await request(app)
      .post(`/api/hosting/nodes/${testNodeId}/ftp/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'app_ftp_user',
        password: 'SuperPass123!',
        root_path: '/var/www/nodesites/app',
        permissions: 'rw'
      });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe('app_ftp_user');
    expect(res.body.root_path).toBe('/var/www/nodesites/app');
    expect(res.body.permissions).toBe('rw');
    createdFtpUserId = res.body.id;
  });

  test('GET /api/hosting/nodes/:id/ftp/users lists accounts', async () => {
    const res = await request(app)
      .get(`/api/hosting/nodes/${testNodeId}/ftp/users`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.some(u => u.username === 'app_ftp_user')).toBe(true);
  });

  test('POST /api/hosting/nodes/bulk/ftp/detect scans multiple nodes in bulk', async () => {
    const res = await request(app)
      .post('/api/hosting/nodes/bulk/ftp/detect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ node_ids: [testNodeId] });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].nodeId).toBe(testNodeId);
  });

  test('DELETE /api/hosting/nodes/:id/ftp/users/:userId removes user account', async () => {
    const res = await request(app)
      .delete(`/api/hosting/nodes/${testNodeId}/ftp/users/${createdFtpUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const listRes = await request(app)
      .get(`/api/hosting/nodes/${testNodeId}/ftp/users`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.body.users.some(u => u.id === createdFtpUserId)).toBe(false);
  });

  test('GET /api/admin/nodes/:id/ftp works identically via admin router', async () => {
    const res = await request(app)
      .get(`/api/admin/nodes/${testNodeId}/ftp`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.nodeId).toBe(testNodeId);
  });
});
