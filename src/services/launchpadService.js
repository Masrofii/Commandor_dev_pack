'use strict';
const { getDb } = require('../../database/database');
const { getTemplateByKey } = require('./templateService');
const { createApplication, getApplicationById, triggerApplicationDeploy, checkApplicationHealth } = require('./applicationService');
const { deploySubdomainWizard, getSubdomainById, previewSubdomainWizard } = require('./subdomainWizardService');
const { getAvailableBaseDomains, assertBaseDomainAllowed, validateSubdomainName } = require('./subdomainService');
const appRunner = require('./appRunnerService');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

function formatWorkflow(row) {
  if (!row) return null;
  return {
    ...row,
    workflow_data: row.workflow_data ? JSON.parse(row.workflow_data) : {},
    step_progress: row.step_progress ? JSON.parse(row.step_progress) : {}
  };
}

function createWorkflow({ tgId, name, serviceType = 'application', templateKey = null }) {
  if (!name || typeof name !== 'string') throw new Error('Service name is required');
  const cleanName = name.trim();
  const defaultBaseDomain = getAvailableBaseDomains(tgId, false)[0] || '';

  let initialData = {
    name: cleanName,
    service_type: serviceType,
    template_key: templateKey,
    step1_source: { type: 'git', git_repo: '', git_branch: 'main' },
    step2_node: { node_id: null, node_name: 'Local Node' },
    step3_runtime: { runtime: 'nodejs', build_command: 'npm ci && npm run build', start_command: 'npm start', port: appRunner.DEFAULT_APP_PORT, health_check_path: '/health' },
    step4_env: { env_vars: {} },
    step5_domain: { mode: 'create_subdomain', subdomain: '', base_domain: defaultBaseDomain, enable_https: true },
    step6_preview: null,
    step7_confirmation: { confirmed: false },
    step8_deployment: null,
    step9_health: null,
    step10_recovery: null
  };

  if (templateKey) {
    const tpl = getTemplateByKey(templateKey);
    if (tpl) {
      initialData.step3_runtime = {
        runtime: tpl.runtime,
        build_command: tpl.recommended_build || '',
        start_command: tpl.recommended_start || '',
        port: tpl.default_port,
        health_check_path: tpl.health_check_endpoint || '/health'
      };
      initialData.step4_env.env_vars = tpl.default_env || {};
    }
  }

  const initialProgress = {
    1: 'in_progress', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending',
    6: 'pending', 7: 'pending', 8: 'pending', 9: 'pending', 10: 'pending'
  };

  const db = getDb();
  const info = db.prepare(`
    INSERT INTO service_workflows (
      tg_id, name, service_type, template_key,
      current_step, total_steps, status,
      workflow_data, step_progress, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, 10, 'draft', ?, ?, datetime('now'), datetime('now'))
  `).run(
    tgId,
    cleanName,
    serviceType,
    templateKey,
    JSON.stringify(initialData),
    JSON.stringify(initialProgress)
  );

  return getWorkflowById(info.lastInsertRowid, tgId);
}

function getWorkflowById(id, tgId = null) {
  const db = getDb();
  let q = 'SELECT * FROM service_workflows WHERE id = ?';
  const params = [id];
  if (tgId) {
    q += ' AND tg_id = ?';
    params.push(tgId);
  }
  const row = db.prepare(q).get(...params);
  return formatWorkflow(row);
}

function listWorkflows(tgId) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM service_workflows WHERE tg_id = ? ORDER BY updated_at DESC').all(tgId);
  return rows.map(formatWorkflow);
}

/**
 * Save and validate data for a specific Launchpad step (1 - 7)
 */
async function updateWorkflowStep(id, stepNumber, stepData = {}, tgId) {
  const workflow = getWorkflowById(id, tgId);
  if (!workflow) throw new Error(`Workflow #${id} not found`);

  const step = parseInt(stepNumber, 10);
  if (step < 1 || step > 10) throw new Error('Invalid step number (1-10)');

  const data = { ...workflow.workflow_data };
  const progress = { ...workflow.step_progress };

  switch (step) {
    case 1: // Git Repository / Source
      if (!stepData.git_repo || !stepData.git_repo.trim()) {
        throw new Error('Valid Git repository URL is required.');
      }
      data.step1_source = {
        type: stepData.type || 'git',
        git_repo: stepData.git_repo.trim(),
        git_branch: stepData.git_branch ? stepData.git_branch.trim() : 'main'
      };
      progress[1] = 'completed';
      if (progress[2] === 'pending') progress[2] = 'in_progress';
      break;

    case 2: // Node Selection
      data.step2_node = {
        node_id: stepData.node_id ? parseInt(stepData.node_id, 10) : null,
        node_name: stepData.node_name || 'Local Host Node'
      };
      progress[2] = 'completed';
      if (progress[3] === 'pending') progress[3] = 'in_progress';
      break;

    case 3: // Runtime & Build Settings
      data.step3_runtime = {
        runtime: stepData.runtime || 'nodejs',
        build_command: stepData.build_command || null,
        start_command: stepData.start_command || null,
        port: parseInt(stepData.port, 10) || appRunner.DEFAULT_APP_PORT,
        health_check_path: stepData.health_check_path || '/health'
      };
      progress[3] = 'completed';
      if (progress[4] === 'pending') progress[4] = 'in_progress';
      break;

    case 4: // Environment Variables & Secrets
      data.step4_env = {
        env_vars: typeof stepData.env_vars === 'object' ? stepData.env_vars : {}
      };
      progress[4] = 'completed';
      if (progress[5] === 'pending') progress[5] = 'in_progress';
      break;

    case 5: // Domain / Subdomain Selection
      if (!stepData.subdomain) {
        throw new Error('Subdomain prefix is required.');
      }
      const cleanSubdomain = validateSubdomainName(stepData.subdomain, false);
      const baseDomain = assertBaseDomainAllowed(tgId, stepData.base_domain || '', false);
      data.step5_domain = {
        mode: stepData.mode || 'create_subdomain',
        subdomain: cleanSubdomain,
        base_domain: baseDomain,
        enable_https: stepData.enable_https !== undefined ? !!stepData.enable_https : true,
        full_domain: `${cleanSubdomain}.${baseDomain}`
      };
      progress[5] = 'completed';
      if (progress[6] === 'pending') progress[6] = 'in_progress';
      break;

    case 6: // Preview DNS, Reverse Proxy, HTTPS
      // Calculate preview based on steps 1-5
      const preview = await previewSubdomainWizard({
        subdomain: data.step5_domain.subdomain,
        baseDomain: data.step5_domain.base_domain,
        destinationType: 'internal_service',
        destinationTarget: String(data.step3_runtime.port || appRunner.DEFAULT_APP_PORT),
        nodeId: data.step2_node.node_id,
        enableDns: true,
        enableProxy: true,
        enableHttps: data.step5_domain.enable_https
      });

      data.step6_preview = preview;
      progress[6] = 'completed';
      if (progress[7] === 'pending') progress[7] = 'in_progress';
      break;

    case 7: // Review & Confirmation
      if (!stepData.confirmed) {
        throw new Error('Plan review and explicit confirmation is required before deployment.');
      }
      data.step7_confirmation = {
        confirmed: true,
        confirmed_at: new Date().toISOString()
      };
      progress[7] = 'completed';
      break;

    default:
      break;
  }

  const nextStep = Math.min(10, Math.max(step + 1, workflow.current_step));

  const db = getDb();
  db.prepare(`
    UPDATE service_workflows
    SET current_step = ?, workflow_data = ?, step_progress = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStep, JSON.stringify(data), JSON.stringify(progress), id);

  return getWorkflowById(id, tgId);
}

/**
 * Step 8-10: Execute deployment through controlled jobs with live health check and safe recovery
 */
async function executeLaunchpadWorkflow(id, tgId) {
  const workflow = getWorkflowById(id, tgId);
  if (!workflow) throw new Error(`Workflow #${id} not found`);

  const data = workflow.workflow_data;
  const progress = workflow.step_progress;

  if (!data.step7_confirmation?.confirmed) {
    throw new Error('Workflow has not been confirmed. Please complete Step 7 review first.');
  }

  const db = getDb();
  db.prepare("UPDATE service_workflows SET status='deploying', updated_at=datetime('now') WHERE id=?").run(id);

  const logs = [];
  logs.push(`[${new Date().toISOString()}] === COMMANDOR LAUNCHPAD EXECUTION INITIALIZED ===`);
  logs.push(`[${new Date().toISOString()}] Target Service: "${workflow.name}"`);
  logs.push(`[${new Date().toISOString()}] Target Hostname: ${data.step5_domain.full_domain}`);
  logs.push(`[${new Date().toISOString()}] Target Git Repository: ${data.step1_source.git_repo}#${data.step1_source.git_branch}`);

  progress[8] = 'in_progress';

  let subdomainId = workflow.subdomain_id;
  let applicationId = workflow.application_id;

  try {
    // 1. Ensure Subdomain & Proxy Configuration Deployed (Reuse if resuming)
    if (!subdomainId) {
      logs.push(`[${new Date().toISOString()}] [Phase 1/3] Deploying DNS record and reverse proxy virtual host...`);
      const isTest = process.env.NODE_ENV === 'test';
      const subResult = await deploySubdomainWizard({
        tgId,
        subdomain: data.step5_domain.subdomain,
        baseDomain: data.step5_domain.base_domain,
        destinationType: 'internal_service',
        destinationTarget: String(data.step3_runtime.port || appRunner.DEFAULT_APP_PORT),
        nodeId: data.step2_node.node_id,
        enableDns: isTest ? false : true,
        enableProxy: isTest ? false : true,
        enableHttps: isTest ? false : data.step5_domain.enable_https,
        confirmationAccepted: true
      });
      subdomainId = subResult.subdomain.id;
      db.prepare('UPDATE service_workflows SET subdomain_id=? WHERE id=?').run(subdomainId, id);
      logs.push(`[${new Date().toISOString()}] ✓ Subdomain registered and reverse proxy route activated (Subdomain ID: ${subdomainId})`);
    } else {
      logs.push(`[${new Date().toISOString()}] [Phase 1/3] Reusing existing verified Subdomain #${subdomainId} (Skipping re-creation).`);
    }

    // 2. Ensure Application Created & Trigger Deployment (Reuse if resuming)
    if (!applicationId) {
      logs.push(`[${new Date().toISOString()}] [Phase 2/3] Registering application profile in runtime cluster...`);
      const appSlug = (workflow.name || 'service')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || `service-${id}`;
      const newApp = createApplication({
        name: appSlug,
        description: `Deployed via Commandor Launchpad (${data.step5_domain.full_domain})`,
        nodeId: data.step2_node.node_id,
        subdomainId: subdomainId,
        gitRepo: data.step1_source.git_repo,
        gitBranch: data.step1_source.git_branch,
        buildCommand: data.step3_runtime.build_command,
        startCommand: data.step3_runtime.start_command,
        envVars: data.step4_env.env_vars,
        port: data.step3_runtime.port,
        healthCheckPath: data.step3_runtime.health_check_path,
        userTgId: tgId
      });
      applicationId = newApp.id;
      db.prepare('UPDATE service_workflows SET application_id=? WHERE id=?').run(applicationId, id);
      logs.push(`[${new Date().toISOString()}] ✓ Application created (App ID: ${applicationId})`);
    } else {
      logs.push(`[${new Date().toISOString()}] [Phase 2/3] Reusing existing Application #${applicationId}`);
    }

    // Trigger controlled deploy job
    logs.push(`[${new Date().toISOString()}] Triggering controlled deployment worker for commit synchronization...`);
    const deployJob = await triggerApplicationDeploy(applicationId, tgId);
    logs.push(deployJob.logs);

    data.step8_deployment = {
      deployment_id: deployJob.deploymentId,
      status: deployJob.status,
      commit_hash: deployJob.commitHash,
      duration_ms: deployJob.durationMs
    };
    progress[8] = 'completed';

    // 3. Step 9: Run Health Check
    logs.push(`[${new Date().toISOString()}] [Phase 3/3] Executing runtime health check against ${data.step3_runtime.health_check_path} (port ${data.step3_runtime.port})...`);
    progress[9] = 'in_progress';

    const healthCheck = await checkApplicationHealth(applicationId);
    data.step9_health = {
      healthy: healthCheck.healthy,
      statusCode: healthCheck.statusCode || null,
      error: healthCheck.error || null,
      endpoint: healthCheck.endpoint,
      checked_at: new Date().toISOString()
    };

    if (healthCheck.healthy) {
      logs.push(`[${new Date().toISOString()}] ✓ Health check PASSED (HTTP ${healthCheck.statusCode}). Service is healthy and routing traffic.`);
      progress[9] = 'completed';
      progress[10] = 'completed';

      db.prepare(`
        UPDATE service_workflows
        SET status='completed', current_step=10, logs=?, workflow_data=?, step_progress=?, updated_at=datetime('now')
        WHERE id=?
      `).run(logs.join('\n'), JSON.stringify(data), JSON.stringify(progress), id);

      logChange({
        tgId,
        category: 'launchpad',
        action: 'workflow_completed',
        details: `Launchpad service "${workflow.name}" deployed successfully to ${data.step5_domain.full_domain}`,
        metadata: { workflowId: id, applicationId, subdomainId, healthy: true }
      }).catch(() => {});

      return getWorkflowById(id, tgId);
    } else {
      // Step 9 Failed - Offer safe recovery path
      logs.push(`[${new Date().toISOString()}] ⚠️ Health check FAILED: ${healthCheck.error || 'HTTP ' + healthCheck.statusCode}`);
      progress[9] = 'failed';
      progress[10] = 'in_progress';

      const remediation = `The application build finished, but endpoint "${healthCheck.endpoint}" did not return a 2xx/3xx response. Remediation steps: 1) Verify that your start command ("${data.step3_runtime.start_command}") starts a server listening on port ${data.step3_runtime.port}. 2) Confirm health check path "${data.step3_runtime.health_check_path}" exists. 3) You can adjust runtime settings and click "Resume Workflow" to re-verify without re-creating your subdomain.`;

      data.step10_recovery = {
        can_resume: true,
        failed_step: 9,
        remediation
      };

      db.prepare(`
        UPDATE service_workflows
        SET status='failed', error_message=?, remediation=?, logs=?, workflow_data=?, step_progress=?, updated_at=datetime('now')
        WHERE id=?
      `).run(
        healthCheck.error || `HTTP ${healthCheck.statusCode}`,
        remediation,
        logs.join('\n'),
        JSON.stringify(data),
        JSON.stringify(progress),
        id
      );

      logChange({
        tgId,
        category: 'launchpad',
        action: 'workflow_health_failed',
        details: `Launchpad service "${workflow.name}" deployed but failed health check`,
        metadata: { workflowId: id, applicationId, error: healthCheck.error }
      }).catch(() => {});

      return getWorkflowById(id, tgId);
    }
  } catch (err) {
    logs.push(`[${new Date().toISOString()}] ❌ FATAL DEPLOYMENT ERROR: ${err.message}`);
    progress[8] = 'failed';

    const remediation = `Execution halted: ${err.message}. Review repository permissions and network availability, then resume the workflow.`;

    data.step10_recovery = {
      can_resume: true,
      failed_step: 8,
      remediation
    };

    db.prepare(`
      UPDATE service_workflows
      SET status='failed', error_message=?, remediation=?, logs=?, workflow_data=?, step_progress=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      err.message,
      remediation,
      logs.join('\n'),
      JSON.stringify(data),
      JSON.stringify(progress),
      id
    );

    return getWorkflowById(id, tgId);
  }
}

/**
 * Resume a failed or interrupted workflow without redoing already completed operations
 */
async function resumeWorkflow(id, tgId) {
  const workflow = getWorkflowById(id, tgId);
  if (!workflow) throw new Error(`Workflow #${id} not found`);

  if (workflow.status !== 'failed' && workflow.status !== 'in_progress') {
    throw new Error(`Cannot resume workflow in status "${workflow.status}". Only failed or in-progress workflows can be resumed.`);
  }

  // Clear failure flag and restart execution
  return executeLaunchpadWorkflow(id, tgId);
}

function deleteWorkflow(id, tgId) {
  const db = getDb();
  return db.prepare('DELETE FROM service_workflows WHERE id=? AND tg_id=?').run(id, tgId).changes > 0;
}

module.exports = {
  createWorkflow,
  getWorkflowById,
  listWorkflows,
  updateWorkflowStep,
  executeLaunchpadWorkflow,
  resumeWorkflow,
  deleteWorkflow
};
