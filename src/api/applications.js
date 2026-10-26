'use strict';
const express = require('express');
const router = express.Router();
const { requireAuthOrApiKey } = require('../middleware/auth');
const {
  createApplication,
  updateApplication,
  getApplicationById,
  listApplications,
  triggerApplicationDeploy,
  rollbackApplication,
  controlApplication,
  checkApplicationHealth,
  getApplicationDeployments,
  getDeploymentById,
  getApplicationRuntimeLogs,
  deleteApplication
} = require('../services/applicationService');
const appRunner = require('../services/appRunnerService');
const { body, validationResult } = require('express-validator');

function checkAdmin(req) {
  const config = require('../../config/config');
  return (req.user?.role === 'admin') || (config.telegram?.adminId && (String(req.tgId) === String(config.telegram.adminId)));
}

router.use(requireAuthOrApiKey(['apps:manage']));

// List applications
router.get('/', (req, res) => {
  try {
    const { search, status, nodeId } = req.query;
    const isAdmin = checkAdmin(req);
    const apps = listApplications({
      search,
      status,
      nodeId: nodeId ? parseInt(nodeId, 10) : null,
      userTgId: isAdmin ? null : req.tgId
    });
    res.json({ applications: apps, count: apps.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get application by ID
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const app = getApplicationById(id, req.tgId, isAdmin);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create application
router.post(
  '/',
  [
    body('name').isString().isLength({ min: 2, max: 63 }),
    body('git_repo').isString().notEmpty()
  ],
  (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    try {
      const {
        name,
        description,
        node_id,
        subdomain_id,
        git_repo,
        git_branch,
        build_command,
        start_command,
        env_vars,
        port,
        health_check_path
      } = req.body;

      const app = createApplication({
        name,
        description,
        nodeId: node_id ? parseInt(node_id, 10) : null,
        subdomainId: subdomain_id ? parseInt(subdomain_id, 10) : null,
        gitRepo: git_repo,
        gitBranch: git_branch || 'main',
        buildCommand: build_command,
        startCommand: start_command,
        envVars: env_vars,
        port: port ? parseInt(port, 10) : appRunner.DEFAULT_APP_PORT,
        healthCheckPath: health_check_path || '/',
        userTgId: req.tgId,
        isAdmin: checkAdmin(req)
      });

      res.status(201).json(app);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Update application
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const updated = updateApplication(id, req.body, req.tgId, isAdmin);
    res.json(updated);
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Get deployment history for application
router.get('/:id/deployments', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const deployments = getApplicationDeployments(id, req.tgId, isAdmin);
    res.json({ deployments, count: deployments.length });
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : (err.message.includes('not found') ? 404 : 500);
    res.status(status).json({ error: err.message });
  }
});

// Get specific deployment record
router.get('/:id/deployments/:depId', (req, res) => {
  try {
    const depId = parseInt(req.params.depId, 10);
    const isAdmin = checkAdmin(req);
    const dep = getDeploymentById(depId, req.tgId, isAdmin);
    if (!dep) return res.status(404).json({ error: 'Deployment record not found' });
    res.json(dep);
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Trigger application deployment job
router.post('/:id/deploy', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const result = await triggerApplicationDeploy(id, req.tgId, isAdmin);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Rollback application to previous deployment
router.post('/:id/rollback', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { deployment_id } = req.body;
    if (!deployment_id) return res.status(400).json({ error: 'deployment_id is required' });

    const isAdmin = checkAdmin(req);
    const result = await rollbackApplication(id, parseInt(deployment_id, 10), req.tgId, isAdmin);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Control application process (start, stop, restart)
router.post('/:id/control', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required (start, stop, restart)' });

    const isAdmin = checkAdmin(req);
    const result = await controlApplication(id, action, req.tgId, isAdmin);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Check application health
router.get('/:id/health', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const app = getApplicationById(id, req.tgId, isAdmin);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    const health = await checkApplicationHealth(id);
    res.json(health);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Read recent runtime logs for an application
router.get('/:id/logs', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const maxBytes = Math.min(Math.max(parseInt(req.query.bytes ?? req.query.maxBytes, 10) || 51200, 1024), 512000);
    const result = getApplicationRuntimeLogs(id, req.tgId, isAdmin, maxBytes);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : (err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ error: err.message });
  }
});

// Delete application
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const isAdmin = checkAdmin(req);
    const deleted = deleteApplication(id, req.tgId, isAdmin);
    if (!deleted) return res.status(404).json({ error: 'Application not found' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    const status = err.message.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
