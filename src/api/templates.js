'use strict';
const express = require('express');
const router = express.Router();
const { requireAuthOrApiKey } = require('../middleware/auth');
const {
  listTemplates,
  getTemplateByKey,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplateApplication
} = require('../services/templateService');
const { body, validationResult } = require('express-validator');
const { assertBaseDomainAllowed } = require('../services/subdomainService');

router.use(requireAuthOrApiKey());

// List templates
router.get('/', (req, res) => {
  try {
    const { category } = req.query;
    const templates = listTemplates(category);
    res.json({ templates, count: templates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview template application
router.post('/preview', (req, res) => {
  try {
    const {
      template_key,
      subdomain,
      base_domain,
      target_host,
      target_port,
      enable_https
    } = req.body;

    if (!template_key || !subdomain) {
      return res.status(400).json({ error: 'template_key and subdomain are required' });
    }

    const isAdmin = req.user?.role === 'admin';
    const baseDomain = assertBaseDomainAllowed(req.tgId, base_domain || '', isAdmin);

    const preview = previewTemplateApplication({
      templateKey: template_key,
      subdomain,
      baseDomain,
      targetHost: target_host || '127.0.0.1',
      targetPort: target_port,
      enableHttps: !!enable_https
    });

    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get template by key
router.get('/:key', (req, res) => {
  try {
    const tpl = getTemplateByKey(req.params.key);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create custom template
router.post(
  '/',
  [
    body('template_key').isString().matches(/^[a-z0-9-]+$/),
    body('name').isString().notEmpty(),
    body('nginx_config_template').isString().notEmpty()
  ],
  (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    try {
      const created = createTemplate({
        templateKey: req.body.template_key,
        name: req.body.name,
        category: req.body.category || 'application',
        description: req.body.description || '',
        defaultPort: req.body.default_port,
        defaultPath: req.body.default_path,
        runtime: req.body.runtime,
        recommendedBuild: req.body.recommended_build,
        recommendedStart: req.body.recommended_start,
        defaultEnv: req.body.default_env,
        nginxConfigTemplate: req.body.nginx_config_template,
        websocketSupport: req.body.websocket_support,
        healthCheckEndpoint: req.body.health_check_endpoint,
        userTgId: req.tgId
      });
      res.status(201).json(created);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Update custom template
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = updateTemplate(id, req.body, req.tgId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete custom template
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = deleteTemplate(id, req.tgId);
    if (!deleted) return res.status(404).json({ error: 'Template not found' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
