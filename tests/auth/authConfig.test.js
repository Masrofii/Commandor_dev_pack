'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.TELEGRAM_BOT_USERNAME = 'commandor_mail_bot';

const express = require('express');
const request = require('supertest');
const authRouter = require('../../src/api/auth');

describe('Auth Configuration Endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  test('GET /api/auth/config returns the configured bot username', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.botUsername).toBe('commandor_mail_bot');
    expect(res.body.appName).toBe('Commandor Dev Pack');
  });
});
