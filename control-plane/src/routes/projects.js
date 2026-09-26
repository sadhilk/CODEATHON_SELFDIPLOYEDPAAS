const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Project = require('../models/Project');
const Instance = require('../models/Instance');
const Event = require('../models/Event');
const processRegistry = require('../utils/processRegistry');
const deploymentEngine = require('../services/deploymentEngine');
const healthMonitor = require('../services/healthMonitor');
const autoScaler = require('../services/autoScaler');
const loadBalancer = require('../services/loadBalancer');

// GET all projects
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find();
    const result = [];

    for (const p of projects) {
      const instances = await Instance.find({
        projectName: p.name,
        status: { $in: ['STARTING', 'HEALTHY', 'UNHEALTHY', 'DRAINING'] },
      });
      const stats = loadBalancer.getStats(p.name);
      result.push({
        ...p.toObject(),
        instances: instances.map((i) => i.toObject()),
        stats: {
          ...stats,
          availability: loadBalancer.getAvailability(p.name),
          avgLatency: loadBalancer.getAvgLatency(p.name),
        },
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET single project
router.get('/:name', async (req, res) => {
  try {
    const project = await Project.findOne({ name: req.params.name });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const instances = await Instance.find({
      projectName: req.params.name,
      status: { $in: ['STARTING', 'HEALTHY', 'UNHEALTHY', 'DRAINING', 'FAILED'] },
    });
    const stats = loadBalancer.getStats(req.params.name);
    const events = await Event.find({ projectName: req.params.name })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({
      ...project.toObject(),
      instances: instances.map((i) => i.toObject()),
      stats: {
        ...stats,
        availability: loadBalancer.getAvailability(req.params.name),
        avgLatency: loadBalancer.getAvgLatency(req.params.name),
      },
      events,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create project
router.post('/', async (req, res) => {
  try {
    const {
      name, entryFile, port, workingDir, env,
      scaling, health, rateLimit,
    } = req.body;

    if (!name || !entryFile || !workingDir) {
      return res.status(400).json({ error: 'name, entryFile, and workingDir are required' });
    }

    const entryPath = path.isAbsolute(entryFile)
      ? entryFile
      : path.join(workingDir, entryFile);

    if (!fs.existsSync(entryPath)) {
      return res.status(400).json({ error: `Entry file not found: ${entryPath}` });
    }

    const project = await Project.create({
      name,
      entryFile,
      port: port || 3000,
      workingDir,
      env: env || {},
      scaling: scaling || {},
      health: health || {},
      rateLimit: rateLimit || {},
    });

    await deploymentEngine.logEvent(name, 'DEPLOYMENT_STARTED', `Project ${name} created`);
    res.status(201).json(project);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Project name already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PUT update project config
router.put('/:name', async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate(
      { name: req.params.name },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Update health monitor with new config
    healthMonitor.updateProject(project);
    await deploymentEngine.logEvent(req.params.name, 'CONFIG_UPDATED', 'Project configuration updated');
    deploymentEngine.emit('projectUpdated', project.toObject());

    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST deploy project
router.post('/:name/deploy', async (req, res) => {
  try {
    const project = await Project.findOne({ name: req.params.name });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check if already deploying
    const startingInstances = await Instance.find({
      projectName: project.name,
      status: 'STARTING',
    });
    if (startingInstances.length > 0) {
      return res.status(409).json({ error: 'Deployment already in progress' });
    }

    // Auto-cleanup dead instance records before fresh deploy
    await Instance.deleteMany({
      projectName: project.name,
      status: { $in: ['STOPPED', 'FAILED'] },
    });

    await Project.findOneAndUpdate({ name: project.name }, { status: 'DEPLOYING' });
    await deploymentEngine.logEvent(project.name, 'DEPLOYMENT_STARTED', `Deploying ${project.name} v${(project.currentVersion || 0) + 1}`);

    // Respond immediately, deployment is async
    res.json({ message: 'Deployment started', project: project.name });

    // Async deploy minInstances
    (async () => {
      try {
        const version = (project.currentVersion || 0) + 1;
        await Project.findOneAndUpdate({ name: project.name }, { currentVersion: version });

        const minInst = project.scaling.minInstances || 1;
        const deploys = [];

        for (let i = 0; i < minInst; i++) {
          const port = processRegistry.allocatePort();
          deploys.push(deploymentEngine.spawnInstance(project, port, version));
        }

        const results = await Promise.all(deploys);

        // Wait for all to become healthy
        for (const { instanceId } of results) {
          const dbInst = await Instance.findOne({ instanceId });
          await deploymentEngine.waitForHealthy(dbInst, project);
        }

        await Project.findOneAndUpdate({ name: project.name }, { status: 'RUNNING' });
        await deploymentEngine.logEvent(project.name, 'DEPLOYMENT_COMPLETED', `Deployment of v${version} completed`);
        deploymentEngine.emit('deploymentComplete', { projectName: project.name, version });

        // Start health monitoring and autoscaling
        healthMonitor.start(project);
      } catch (e) {
        await Project.findOneAndUpdate({ name: project.name }, { status: 'FAILED' });
        await deploymentEngine.logEvent(project.name, 'DEPLOYMENT_FAILED', `Deployment failed: ${e.message}`);
        console.error('[Deploy] Error:', e.message);
      }
    })();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST stop project
router.post('/:name/stop', async (req, res) => {
  try {
    const project = await Project.findOne({ name: req.params.name });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    healthMonitor.stop(project.name);
    const instances = await Instance.find({
      projectName: project.name,
      status: { $in: ['STARTING', 'HEALTHY', 'UNHEALTHY'] },
    });

    for (const inst of instances) {
      await deploymentEngine.killInstance(inst.instanceId, project.name);
    }

    await Project.findOneAndUpdate({ name: project.name }, { status: 'STOPPED' });
    res.json({ message: 'Project stopped' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE remove project completely
router.delete('/:name', async (req, res) => {
  try {
    const project = await Project.findOne({ name: req.params.name });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Stop health monitor
    healthMonitor.stop(project.name);

    // Stop and kill all active child processes
    const instances = await Instance.find({
      projectName: project.name,
      status: { $in: ['STARTING', 'HEALTHY', 'UNHEALTHY', 'DRAINING'] },
    });

    for (const inst of instances) {
      await deploymentEngine.killInstance(inst.instanceId, project.name);
    }

    // Delete all instance records and event logs
    await Instance.deleteMany({ projectName: project.name });
    await Event.deleteMany({ projectName: project.name });

    // Delete the project document
    await Project.deleteOne({ name: project.name });

    // Reset stats from load balancer
    loadBalancer.resetStats(project.name);

    // Emit socket event to update dashboards in real time
    deploymentEngine.emit('projectDeleted', { projectName: project.name });

    res.json({ message: `Project "${project.name}" and all associated instances deleted successfully` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET project instances
router.get('/:name/instances', async (req, res) => {
  try {
    const instances = await Instance.find({ projectName: req.params.name })
      .sort({ createdAt: -1 });
    res.json(instances);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST kill specific instance
router.post('/:name/instances/:instanceId/kill', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const instance = await Instance.findOne({ instanceId });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const child = processRegistry.get(instanceId);
    if (child) {
      child.kill('SIGKILL'); // real kill
    }

    await Instance.findOneAndUpdate({ instanceId }, { status: 'FAILED', stoppedAt: new Date() });
    processRegistry.remove(instanceId);
    processRegistry.releasePort(instance.port);

    await deploymentEngine.logEvent(req.params.name, 'INSTANCE_FAILED', `Instance ${instanceId} killed by user`, instanceId);
    deploymentEngine.emit('instanceUpdate', { instanceId, status: 'FAILED', port: instance.port, projectName: req.params.name });

    res.json({ message: `Instance ${instanceId} killed` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST revive/respawn instance
router.post('/:name/instances/:instanceId/revive', async (req, res) => {
  try {
    const project = await Project.findOne({ name: req.params.name });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Remove old failed instance record so it doesn't linger as a ghost card
    await Instance.deleteOne({ instanceId: req.params.instanceId });

    const port = processRegistry.allocatePort();
    const { instanceId } = await deploymentEngine.spawnInstance(project, port, project.currentVersion || 1);
    const dbInst = await Instance.findOne({ instanceId });

    res.json({ message: 'Revival started', instanceId });

    // Async health check
    deploymentEngine.waitForHealthy(dbInst, project).then(() => {
      deploymentEngine.logEvent(project.name, 'INSTANCE_REVIVED', `Instance ${instanceId} revived`, instanceId);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST drain instance
router.post('/:name/instances/:instanceId/drain', async (req, res) => {
  try {
    const { instanceId, name } = req.params;
    res.json({ message: 'Drain started' });
    await deploymentEngine.drainAndStop(instanceId, name);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST cleanup dead instances
router.post('/:name/cleanup', async (req, res) => {
  try {
    const result = await Instance.deleteMany({
      projectName: req.params.name,
      status: { $in: ['STOPPED', 'FAILED'] },
    });
    res.json({ message: 'Cleaned up inactive instances', deletedCount: result.deletedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET events
router.get('/:name/events', async (req, res) => {
  try {
    const events = await Event.find({ projectName: req.params.name })
      .sort({ timestamp: -1 })
      .limit(Number(req.query.limit) || 100);
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET traffic stats
router.get('/:name/stats', async (req, res) => {
  try {
    const stats = loadBalancer.getStats(req.params.name);
    const rlStats = require('../services/rateLimiter').getStats();
    const rlConfig = require('../services/rateLimiter').getConfig();
    res.json({
      traffic: {
        ...stats,
        availability: loadBalancer.getAvailability(req.params.name),
        avgLatency: loadBalancer.getAvgLatency(req.params.name),
      },
      rateLimit: {
        ...rlStats,
        config: rlConfig,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
