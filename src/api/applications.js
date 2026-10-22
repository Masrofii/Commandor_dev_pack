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
  deleteApplication
} = require('../services/applicationService');
const { body, validationResult } = require('express-validator');

router.use(requireAuthOrApiKey(['apps:manage']));

// List applications
router.get('/', (req, res) => {
  try {
    const { search, status, nodeId } = req.query;
    const apps = listApplications({ search, status, nodeId: nodeId ? parseInt(nodeId, 10) : null });
    res.json({ applications: apps, count: apps.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get application by ID
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const app = getApplicationById(id);
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
        port: port ? parseInt(port, 10) : 3000,
        healthCheckPath: health_check_path || '/',
        userTgId: req.tgId
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
    const updated = updateApplication(id, req.body, req.tgId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Trigger application deployment job
router.post('/:id/deploy', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await triggerApplicationDeploy(id, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rollback application to previous deployment
router.post('/:id/rollback', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { deployment_id } = req.body;
    if (!deployment_id) return res.status(400).json({ error: 'deployment_id is required' });

    const result = await rollbackApplication(id, parseInt(deployment_id, 10), req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Control application process (start, stop, restart)
router.post('/:id/control', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required (start, stop, restart)' });

    const result = controlApplication(id, action, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Check application health
router.get('/:id/health', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const health = await checkApplicationHealth(id);
    res.json(health);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete application
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = deleteApplication(id, req.tgId);
    if (!deleted) return res.status(404).json({ error: 'Application not found' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
