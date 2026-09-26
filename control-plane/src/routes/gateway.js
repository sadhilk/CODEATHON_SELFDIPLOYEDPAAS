const express = require('express');
const router = express.Router();
const rateLimiter = require('../services/rateLimiter');
const loadGenerator = require('../services/loadGenerator');
const loadBalancer = require('../services/loadBalancer');
const deploymentEngine = require('../services/deploymentEngine');

// GET rate limit config + stats
router.get('/config', (req, res) => {
  res.json({
    config: rateLimiter.getConfig(),
    stats: rateLimiter.getStats(),
  });
});

// PUT update rate limit config
router.put('/config', async (req, res) => {
  try {
    const { enabled, requestsPerSecond, burst, key } = req.body;
    const config = {};
    if (enabled !== undefined) config.enabled = enabled;
    if (requestsPerSecond !== undefined) config.requestsPerSecond = Number(requestsPerSecond);
    if (burst !== undefined) config.burst = Number(burst);
    if (key !== undefined) config.key = key;

    rateLimiter.configure(config);

    // Log event fire-and-forget (don't block response)
    deploymentEngine.logEvent('_system', 'RATE_LIMIT_CHANGED',
      `Rate limit updated: ${JSON.stringify(config)}`
    ).catch(() => {});
    deploymentEngine.emit('rateLimitUpdated', rateLimiter.getConfig());

    res.json({ config: rateLimiter.getConfig(), stats: rateLimiter.getStats() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST start load generation
router.post('/load-generator/start', (req, res) => {
  try {
    const { projectName, rps } = req.body;
    if (!projectName || !rps) {
      return res.status(400).json({ error: 'projectName and rps required' });
    }
    const cappedRps = Math.min(Number(rps), 1000);
    loadGenerator.start(projectName, cappedRps);
    res.json({ message: `Load generator started at ${cappedRps} RPS`, rps: cappedRps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST stop load generation
router.post('/load-generator/stop', (req, res) => {
  try {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: 'projectName required' });
    loadGenerator.stop(projectName);
    res.json({ message: 'Load generator stopped' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET load generator status
router.get('/load-generator/status/:projectName', (req, res) => {
  const status = loadGenerator.getStatus(req.params.projectName);
  res.json({ active: !!status, ...(status || {}) });
});

// POST reset traffic stats
router.post('/reset-stats/:projectName', (req, res) => {
  loadBalancer.resetStats(req.params.projectName);
  rateLimiter.resetStats();
  res.json({ message: 'Stats reset' });
});

module.exports = router;
