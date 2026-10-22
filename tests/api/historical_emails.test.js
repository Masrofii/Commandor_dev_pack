'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret-32bytes-min!!';
process.env.JWT_SECRET = 'test-jwt-secret-32bytes-minimum!!';

const request = require('supertest');
const express = require('express');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { createWebSession } = require('../../src/auth/sessions');

let app, db, aliceToken, bobToken;

beforeAll(() => {
  initDatabase();
  runMigrations();
  db = getDb();
  app = express();
  app.use(express.json());
  app.use('/api/emails', require('../../src/api/emails'));
});

afterAll(() => closeDatabase());

beforeEach(() => {
  // Clean state
  db.prepare('DELETE FROM emails').run();
  db.prepare('DELETE FROM aliases').run();
  db.prepare('DELETE FROM web_sessions').run();
  db.prepare('DELETE FROM users').run();

  // Create two users
  db.prepare("INSERT INTO users(tg_id, username) VALUES(12345, 'alice')").run();
  db.prepare("INSERT INTO users(tg_id, username) VALUES(99999, 'bob')").run();

  // Create web sessions
  aliceToken = createWebSession(12345).rawToken;
  bobToken = createWebSession(99999).rawToken;

  // Create aliases
  db.prepare("INSERT INTO aliases(address, tg_id, domain, alias_type, active) VALUES('alias1@example.com', 12345, 'example.com', 'throwaway', 1)").run();
  db.prepare("INSERT INTO aliases(address, tg_id, domain, alias_type, active) VALUES('alias2@example.com', 12345, 'example.com', 'throwaway', 1)").run();
  db.prepare("INSERT INTO aliases(address, tg_id, domain, alias_type, active) VALUES('bob@example.com', 99999, 'example.com', 'throwaway', 1)").run();

  // Insert historical emails
  const insertStmt = db.prepare(`
    INSERT INTO emails(alias_address, sender, subject, text_body, received_at, is_read, is_starred, is_deleted)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run('alias1@example.com', 'sender1@test.com', 'Historical Email 1', 'Content 1', '2025-01-01T10:00:00.000Z', 1, 0, 0);
  insertStmt.run('alias1@example.com', 'sender2@test.com', 'Historical Email 2', 'Content 2', '2025-01-02T10:00:00.000Z', 0, 1, 0);
  insertStmt.run('alias2@example.com', 'sender3@test.com', 'Historical Email 3 (Alias 2)', 'Content 3', '2025-01-03T10:00:00.000Z', 0, 0, 0);
  insertStmt.run('alias1@example.com', 'spammer@test.com', 'Deleted Email', 'Trash', '2025-01-04T10:00:00.000Z', 0, 0, 1);
  insertStmt.run('bob@example.com', 'bobsender@test.com', 'Bob Email', 'Private to Bob', '2025-01-05T10:00:00.000Z', 0, 0, 0);
});

describe('Historical Emails Retrieval & Bug Regression', () => {
  test('retrieves all historical non-deleted emails for authenticated user in newest-first order', async () => {
    const res = await request(app)
      .get('/api/emails')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.emails).toBeDefined();
    expect(res.body.total).toBe(3);
    expect(res.body.emails.length).toBe(3);

    // Newest first
    expect(res.body.emails[0].subject).toBe('Historical Email 3 (Alias 2)');
    expect(res.body.emails[1].subject).toBe('Historical Email 2');
    expect(res.body.emails[2].subject).toBe('Historical Email 1');
  });

  test('REGRESSION TEST: returns historical emails even when URLSearchParams serializes alias=undefined and q=undefined', async () => {
    // This was the exact critical bug where Next.js web client sent undefined as string
    const res = await request(app)
      .get('/api/emails?page=1&limit=20&alias=undefined&q=undefined&unread=undefined&starred=undefined')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.emails.length).toBe(3);
    expect(res.body.emails[0].subject).toBe('Historical Email 3 (Alias 2)');
  });

  test('filters correctly by alias when a real alias is specified', async () => {
    const res = await request(app)
      .get('/api/emails?alias=alias1@example.com')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.emails.length).toBe(2);
    expect(res.body.emails.every(e => e.alias_address === 'alias1@example.com')).toBe(true);
  });

  test('handles case-insensitive alias lookups via COLLATE NOCASE', async () => {
    const res = await request(app)
      .get('/api/emails?alias=ALIAS1@EXAMPLE.COM')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.emails.length).toBe(2);
  });

  test('supports unread filter', async () => {
    const res = await request(app)
      .get('/api/emails?unread=true')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.emails.every(e => e.is_read === 0)).toBe(true);
  });

  test('supports starred filter', async () => {
    const res = await request(app)
      .get('/api/emails?starred=true')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.emails[0].subject).toBe('Historical Email 2');
  });

  test('supports pagination parameters (limit and page offset)', async () => {
    const page1 = await request(app)
      .get('/api/emails?page=1&limit=2')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(page1.status).toBe(200);
    expect(page1.body.emails.length).toBe(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.emails[0].subject).toBe('Historical Email 3 (Alias 2)');

    const page2 = await request(app)
      .get('/api/emails?page=2&limit=2')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(page2.status).toBe(200);
    expect(page2.body.emails.length).toBe(1);
    expect(page2.body.emails[0].subject).toBe('Historical Email 1');
  });

  test('preserves user ownership isolation (User B cannot see User A emails)', async () => {
    const res = await request(app)
      .get('/api/emails')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.emails[0].subject).toBe('Bob Email');
  });

  test('single email detail endpoint checks ownership', async () => {
    // Email 1 belongs to Alice (12345)
    const email1 = db.prepare("SELECT id FROM emails WHERE subject='Historical Email 1'").get();

    // Alice access
    const aliceRes = await request(app)
      .get(`/api/emails/${email1.id}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(aliceRes.status).toBe(200);
    expect(aliceRes.body.subject).toBe('Historical Email 1');

    // Bob unauthorized access
    const bobRes = await request(app)
      .get(`/api/emails/${email1.id}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(bobRes.status).toBe(404);
  });
});
