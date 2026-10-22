'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  listUsers,
  getUserDetails,
  banUser,
  unbanUser,
  setSubscription,
  listSubscriptionPlans
} = require('../../src/services/userService');
const {
  createRedeemCode,
  listRedeemCodes,
  revokeRedeemCode,
  deleteRedeemCode,
  redeemCodeForUser,
  listRedeemLogs
} = require('../../src/services/redeemService');
const { createApiKey } = require('../../src/services/apiKeyService');
const { requireAuth, requireApiKey } = require('../../src/middleware/auth');

beforeAll(() => {
  initDatabase();
  runMigrations();

  const db = getDb();
  db.prepare("INSERT INTO users(tg_id, username, first_name, role) VALUES(1001, 'admin_master', 'Admin', 'admin')").run();
  db.prepare("INSERT INTO users(tg_id, username, first_name, role) VALUES(1002, 'dev_alice', 'Alice', 'user')").run();
  db.prepare("INSERT INTO users(tg_id, username, first_name, role) VALUES(1003, 'dev_bob', 'Bob', 'user')").run();
  db.prepare("INSERT INTO users(tg_id, username, first_name, role) VALUES(1004, 'charlie', 'Charlie', 'user')").run();
});

afterAll(() => closeDatabase());

describe('User Management, Ban Enforcement & Sessions Termination', () => {
  test('listUsers supports pagination, search, status and role filtering', () => {
    const all = listUsers();
    expect(all.total).toBe(4);
    expect(all.users.length).toBe(4);

    const searchRes = listUsers({ search: 'alice' });
    expect(searchRes.total).toBe(1);
    expect(searchRes.users[0].tg_id).toBe(1002);

    const adminsOnly = listUsers({ role: 'admin' });
    expect(adminsOnly.total).toBe(1);
    expect(adminsOnly.users[0].username).toBe('admin_master');
  });

  test('getUserDetails returns user profile, plan info, and resource usage', () => {
    const details = getUserDetails(1002);
    expect(details).toBeDefined();
    expect(details.tg_id).toBe(1002);
    expect(details.subscription_plan).toBe('free');
    expect(details.usage).toBeDefined();
    expect(typeof details.usage.aliases).toBe('number');
    expect(typeof details.usage.domains).toBe('number');
  });

  test('banUser updates user record, ban reason, and purges active web sessions', () => {
    const db = getDb();
    // Insert a dummy web session for Alice
    db.prepare(`
      INSERT INTO web_sessions (id, tg_id, token_hash, expires_at)
      VALUES ('sess-1002', 1002, 'dummy-hash-1002', datetime('now', '+1 day'))
    `).run();

    const banRes = banUser(1002, {
      reason: 'Repeated spam violation',
      adminTgId: 1001,
      ipAddress: '127.0.0.1'
    });

    expect(banRes.success).toBe(true);
    expect(banRes.is_banned).toBe(1);
    expect(banRes.ban_reason).toBe('Repeated spam violation');
    expect(banRes.terminatedSessions).toBeGreaterThanOrEqual(1);

    // Verify session was destroyed
    const sessionAfter = db.prepare('SELECT id FROM web_sessions WHERE id = ?').get('sess-1002');
    expect(sessionAfter).toBeUndefined();

    // Verify user is banned in database
    const userAfter = getUserDetails(1002);
    expect(userAfter.is_banned).toBe(1);
    expect(userAfter.ban_reason).toBe('Repeated spam violation');
    expect(userAfter.banned_by).toBe(1001);
  });

  test('banUser refuses to ban platform administrators', () => {
    expect(() => banUser(1001, { reason: 'Test admin ban', adminTgId: 1001 }))
      .toThrow(/Platform administrators cannot be banned/);
  });

  test('unbanUser reinstates access and clears ban metadata', () => {
    const unbanRes = unbanUser(1002, { adminTgId: 1001 });
    expect(unbanRes.success).toBe(true);
    expect(unbanRes.is_banned).toBe(0);

    const userAfter = getUserDetails(1002);
    expect(userAfter.is_banned).toBe(0);
    expect(userAfter.ban_reason).toBeNull();
    expect(userAfter.banned_at).toBeNull();
  });
});

describe('Subscription Management & Plan Upgrades', () => {
  test('listSubscriptionPlans returns official seeded tiers', () => {
    const plans = listSubscriptionPlans();
    expect(plans.length).toBeGreaterThanOrEqual(4);

    const planIds = plans.map(p => p.id);
    expect(planIds).toContain('free');
    expect(planIds).toContain('starter');
    expect(planIds).toContain('pro');
    expect(planIds).toContain('enterprise');
  });

  test('setSubscription upgrades user, sets expiration date, and applies plan quotas', () => {
    const upgraded = setSubscription(1003, {
      planId: 'pro',
      durationDays: 45,
      adminTgId: 1001
    });

    expect(upgraded.subscription_plan).toBe('pro');
    expect(upgraded.subscription_status).toBe('active');
    expect(upgraded.subscription_expires_at).toBeDefined();
    expect(upgraded.daysRemaining).toBeGreaterThanOrEqual(44);
    expect(upgraded.alias_limit).toBe(250);
    expect(upgraded.custom_domain_limit).toBe(15);
    expect(upgraded.application_limit).toBe(25);
  });

  test('setSubscription extends expiration when user already has active plan', () => {
    const firstDetails = getUserDetails(1003);
    const initialDays = firstDetails.daysRemaining;

    // Extend subscription by another 30 days
    const extended = setSubscription(1003, {
      planId: 'pro',
      durationDays: 30,
      adminTgId: 1001
    });

    expect(extended.daysRemaining).toBeGreaterThanOrEqual(initialDays + 29);
  });
});

describe('Redeem Codes (Vouchers / Promos) Lifecycle', () => {
  let createdCodeId;
  const testCode = 'DEV-PROMO-2026';

  test('createRedeemCode generates promo code with target reward and usage limits', () => {
    const code = createRedeemCode({
      code: testCode,
      title: 'Developer Sprint Voucher',
      rewardType: 'subscription',
      rewardPlan: 'starter',
      rewardDurationDays: 60,
      maxUses: 2,
      adminTgId: 1001
    });

    expect(code).toBeDefined();
    expect(code.code).toBe(testCode);
    expect(code.reward_plan).toBe('starter');
    expect(code.reward_duration_days).toBe(60);
    expect(code.max_uses).toBe(2);
    expect(code.used_count).toBe(0);
    expect(code.is_active).toBe(1);
    createdCodeId = code.id;
  });

  test('redeemCodeForUser grants reward and records audit log', async () => {
    // User 1002 redeems the code
    const result = await redeemCodeForUser(testCode, 1002, { ipAddress: '127.0.0.1' });
    expect(result.success).toBe(true);
    expect(result.code).toBe(testCode);
    expect(result.rewardSummary).toContain('STARTER Tier granted for 60 days');

    // Verify user was upgraded
    const user = getUserDetails(1002);
    expect(user.subscription_plan).toBe('starter');
    expect(user.daysRemaining).toBeGreaterThanOrEqual(59);

    // Verify usage count incremented
    const codes = listRedeemCodes();
    const updatedCode = codes.find(c => c.id === createdCodeId);
    expect(updatedCode.used_count).toBe(1);

    // Verify log created
    const logs = listRedeemLogs({ limit: 10 });
    expect(logs.some(l => l.code === testCode && l.tg_id === 1002)).toBe(true);
  });

  test('redeemCodeForUser rejects duplicate redemption by same user', async () => {
    await expect(redeemCodeForUser(testCode, 1002))
      .rejects.toThrow(/already redeemed this voucher/i);
  });

  test('redeemCodeForUser honors maxUses limit', async () => {
    // User 1003 uses the 2nd redemption (reaching max_uses: 2)
    const res2 = await redeemCodeForUser(testCode, 1003);
    expect(res2.success).toBe(true);

    await expect(redeemCodeForUser(testCode, 1004))
      .rejects.toThrow(/maximum redemption limit/i);
  });

  test('redeemCodeForUser rejects deactivated or revoked codes', async () => {
    const singleCode = createRedeemCode({
      code: 'ONE-TIME-REVOKED',
      title: 'To be revoked',
      rewardType: 'subscription',
      rewardPlan: 'pro',
      adminTgId: 1001
    });

    // Revoke code
    revokeRedeemCode(singleCode.id, 1001);

    await expect(redeemCodeForUser('ONE-TIME-REVOKED', 1004))
      .rejects.toThrow(/deactivated/i);
  });

  test('redeemCodeForUser rejects suspended/banned users', async () => {
    const validCode = createRedeemCode({
      code: 'BAN-TEST-CODE',
      title: 'Valid voucher',
      rewardType: 'subscription',
      rewardPlan: 'pro',
      adminTgId: 1001
    });

    // Ban user 1004
    banUser(1004, { reason: 'Suspended for testing', adminTgId: 1001 });

    await expect(redeemCodeForUser('BAN-TEST-CODE', 1004))
      .rejects.toThrow(/Suspended accounts cannot redeem/i);
  });
});

describe('Middleware Ban Enforcement', () => {
  test('requireApiKey rejects requests from banned users', () => {
    const apiKey = createApiKey({ tgId: 1004, name: 'Test API Key', scopes: ['emails:read'] });

    const req = {
      headers: { authorization: `Bearer ${apiKey.rawKey}` },
      ip: '127.0.0.1'
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };
    const next = jest.fn();

    const mw = requireApiKey(['emails:read']);
    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.data.error).toBe('Account suspended');
    expect(res.data.reason).toBe('Suspended for testing');
  });
});
