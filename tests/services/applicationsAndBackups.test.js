'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const fs = require('fs');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  createApplication,
  getApplicationById,
  listApplications,
  updateApplication,
  triggerApplicationDeploy,
  rollbackApplication,
  controlApplication,
  deleteApplication
} = require('../../src/services/applicationService');
const {
  createDatabaseBackup,
  listBackups,
  verifySqliteIntegrity,
  restoreDatabaseBackup
} = require('../../src/services/backupService');
const {
  getHostSystemMetrics,
  getSystemOverview
} = require('../../src/services/monitoringService');

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
});

afterAll(() => closeDatabase());

describe('Developer Applications & Git Deployment Platform', () => {
  test('creates application with encrypted environment secrets and masked output', () => {
    const app = createApplication({
      name: 'api-service',
      description: 'Core microservice',
      gitRepo: 'https://github.com/myorg/api-service.git',
      gitBranch: 'main',
      port: 5000,
      envVars: {
        DATABASE_URL: 'postgres://user:supersecretpass@db.local:5432/app',
        API_SECRET: 'very-secret-token-xyz'
      },
      userTgId: 1001
    });

    expect(app).toBeDefined();
    expect(app.name).toBe('api-service');
    expect(app.port).toBe(5000);
    expect(app.status).toBe('stopped');
    expect(app.env_vars.DATABASE_URL).toContain('••••••••');
    expect(app.env_vars.API_SECRET).toContain('••••••••');
  });

  test('triggerApplicationDeploy executes controlled deployment job and records commit history', async () => {
    const app = listApplications()[0];
    const deploy = await triggerApplicationDeploy(app.id, 1001);

    expect(deploy.status).toBe('success');
    expect(deploy.commitHash).toBeDefined();
    expect(deploy.logs).toContain('Initiating deployment');

    const updatedApp = getApplicationById(app.id);
    expect(updatedApp.status).toBe('running');
    expect(updatedApp.latestDeployment).toBeDefined();
    expect(updatedApp.latestDeployment.commit_hash).toBe(deploy.commitHash);
  });

  test('rollbackApplication restores a previous deployment release', async () => {
    const app = listApplications()[0];
    const firstDeploymentId = app.latestDeployment.id;

    // Trigger a second deployment
    const secondDeploy = await triggerApplicationDeploy(app.id, 1001);
    expect(secondDeploy.status).toBe('success');

    // Rollback to first deployment
    const rollback = await rollbackApplication(app.id, firstDeploymentId, 1001);
    expect(rollback.success).toBe(true);

    const afterRollback = getApplicationById(app.id);
    expect(afterRollback.latestDeployment.commit_hash).toBe(app.latestDeployment.commit_hash);
  });

  test('controlApplication manages lifecycle states (stop, start, restart)', () => {
    const app = listApplications()[0];
    const stopped = controlApplication(app.id, 'stop', 1001);
    expect(stopped.status).toBe('stopped');

    const started = controlApplication(app.id, 'start', 1001);
    expect(started.status).toBe('running');
  });

  test('enforces strict multi-tenant isolation: User B cannot access, deploy, or delete User A application', async () => {
    const USER_A = 1001;
    const USER_B = 2002;

    // Create app owned by User A
    const appA = createApplication({
      name: 'tenant-isolated-app',
      gitRepo: 'https://github.com/tenant-a/service.git',
      userTgId: USER_A
    });

    // 1. User B should not see User A's app in listApplications
    const appsForUserB = listApplications({ userTgId: USER_B });
    expect(appsForUserB.some(a => a.id === appA.id)).toBe(false);

    // 2. User B cannot fetch User A's app by ID
    expect(getApplicationById(appA.id, USER_B, false)).toBeNull();

    // 3. User B cannot modify User A's app
    expect(() => updateApplication(appA.id, { description: 'Hacked' }, USER_B, false))
      .toThrow(/Unauthorized/);

    // 4. User B cannot deploy User A's app
    await expect(triggerApplicationDeploy(appA.id, USER_B, false))
      .rejects.toThrow(/Unauthorized/);

    // 5. User B cannot rollback User A's app
    await expect(rollbackApplication(appA.id, 999, USER_B, false))
      .rejects.toThrow(/Unauthorized/);

    // 6. User B cannot control User A's app
    expect(() => controlApplication(appA.id, 'start', USER_B, false))
      .toThrow(/Unauthorized/);

    // 7. User B cannot delete User A's app
    expect(() => deleteApplication(appA.id, USER_B, false))
      .toThrow(/Unauthorized/);

    // 8. Admin CAN access User A's app
    const appForAdmin = getApplicationById(appA.id, USER_B, true);
    expect(appForAdmin).toBeDefined();
    expect(appForAdmin.id).toBe(appA.id);

    // Clean up
    deleteApplication(appA.id, USER_A, false);
  });
});

describe('Verified Backups & SQLite Integrity', () => {
  test('creates verified database backup with valid SQLite header', async () => {
    const backup = await createDatabaseBackup('Automated test backup', 1001);
    expect(backup).toBeDefined();
    expect(backup.status).toBe('verified');
    expect(backup.file_size_bytes).toBeGreaterThan(0);
    expect(backup.checksum).toBeDefined();

    // Verify file integrity
    const integrity = verifySqliteIntegrity(backup.file_path);
    expect(integrity.valid).toBe(true);
    expect(integrity.sizeBytes).toBe(backup.file_size_bytes);

    // Clean up test file
    try { fs.unlinkSync(backup.file_path); } catch {}
  });

  test('restoreDatabaseBackup requires explicit confirmation', async () => {
    await expect(restoreDatabaseBackup(9999, false, 1001)).rejects.toThrow(/explicitly confirm/i);
  });
});

describe('Real Monitoring Overview & Host Metrics', () => {
  test('getHostSystemMetrics returns real CPU, RAM, and disk specs', () => {
    const host = getHostSystemMetrics();
    expect(host.cpuCount).toBeGreaterThan(0);
    expect(host.memory.totalMb).toBeGreaterThan(0);
    expect(host.memory.usagePercent).toBeGreaterThanOrEqual(0);
    expect(host.uptimeSeconds).toBeGreaterThan(0);
    expect(host.uptimeFormatted).toBeDefined();
  });

  test('getSystemOverview aggregates real node, application, and domain statistics', () => {
    const overview = getSystemOverview();
    expect(overview.timestamp).toBeDefined();
    expect(overview.host).toBeDefined();
    expect(overview.applications.total).toBeGreaterThanOrEqual(1);
    expect(overview.applications.running).toBeGreaterThanOrEqual(1);
    expect(overview.nodes).toBeDefined();
    expect(overview.domains).toBeDefined();
    expect(overview.subdomains).toBeDefined();
  });
});
