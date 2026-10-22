'use strict';
const express = require('express');
const router = express.Router();
const { requireAuthOrApiKey } = require('../middleware/auth');
const {
  createWorkflow,
  getWorkflowById,
  listWorkflows,
  updateWorkflowStep,
  executeLaunchpadWorkflow,
  resumeWorkflow,
  deleteWorkflow
} = require('../services/launchpadService');
const { body, validationResult } = require('express-validator');

router.use(requireAuthOrApiKey());

// List user workflows
router.get('/', (req, res) => {
  try {
    const workflows = listWorkflows(req.tgId);
    res.json({ workflows, count: workflows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new Launchpad workflow
router.post(
  '/',
  [
    body('name').isString().isLength({ min: 2, max: 63 }),
    body('service_type').optional().isString(),
    body('template_key').optional().isString()
  ],
  (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });

    try {
      const workflow = createWorkflow({
        tgId: req.tgId,
        name: req.body.name,
        serviceType: req.body.service_type || 'application',
        templateKey: req.body.template_key || null
      });
      res.status(201).json(workflow);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Get single workflow
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const workflow = getWorkflowById(id, req.tgId);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update specific step data
router.put('/:id/step/:step', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const step = parseInt(req.params.step, 10);
    const updated = await updateWorkflowStep(id, step, req.body, req.tgId);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Execute deployment (Step 8-10)
router.post('/:id/execute', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await executeLaunchpadWorkflow(id, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Resume or retry failed workflow
router.post('/:id/resume', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await resumeWorkflow(id, req.tgId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete workflow
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = deleteWorkflow(id, req.tgId);
    if (!deleted) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ status: 'deleted', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
