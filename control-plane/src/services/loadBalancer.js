const http = require('http');
const Instance = require('../models/Instance');
const rateLimiter = require('./rateLimiter');

// Round-robin pointer per project
const rrPointers = new Map(); // projectName -> index

// Traffic counters (cumulative)
const trafficStats = new Map();

// Rolling timestamp windows for RPS calculation
const projectTimestamps = new Map(); // projectName -> number[]
const instanceTimestamps = new Map(); // instanceId -> number[]

// ── RPS tracking ──────────────────────────────────────────────────────────────

function recordRequest(projectName, instanceId) {
  const now = Date.now();

  if (!projectTimestamps.has(projectName)) projectTimestamps.set(projectName, []);
  projectTimestamps.get(projectName).push(now);

  if (instanceId) {
    if (!instanceTimestamps.has(instanceId)) instanceTimestamps.set(instanceId, []);
    instanceTimestamps.get(instanceId).push(now);
  }
}

function _windowRps(list, windowSec = 2) {
  if (!list || list.length === 0) return 0;
  const cutoff = Date.now() - windowSec * 1000;
  // Remove expired entries
  let start = 0;
  while (start < list.length && list[start] < cutoff) start++;
  if (start > 0) list.splice(0, start);
  return Math.round(list.length / windowSec);
}

function getProjectRps(projectName) {
  return _windowRps(projectTimestamps.get(projectName));
}

function getInstanceRps(instanceId) {
  return _windowRps(instanceTimestamps.get(instanceId));
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function _initStats(projectName) {
  if (!trafficStats.has(projectName)) {
    trafficStats.set(projectName, {
      totalRequests: 0,
      allowedRequests: 0,
      rateLimitedRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      recoveredRequests: 0,
      latencies: [],
    });
  }
  return trafficStats.get(projectName);
}

function getStats(projectName) {
  return _initStats(projectName);
}

function resetStats(projectName) {
  trafficStats.delete(projectName);
  projectTimestamps.delete(projectName);
  // Note: intentionally keep instanceTimestamps — instances may still be active
}

// ── Instance selection (round-robin, skip circuit-breaker OPEN) ───────────────

async function selectInstance(projectName) {
  const instances = await Instance.find({
    projectName,
    status: 'HEALTHY',
    'circuitBreaker.state': { $ne: 'OPEN' },
  });

  if (instances.length === 0) return null;

  const ptr = rrPointers.get(projectName) || 0;
  const selected = instances[ptr % instances.length];
  rrPointers.set(projectName, (ptr + 1) % instances.length);
  return selected;
}

// ── Core proxy handler ────────────────────────────────────────────────────────

async function proxyRequest(req, res, projectName) {
  const stats = _initStats(projectName);
  stats.totalRequests++;

  // Track for project-level RPS (before rate limit, to capture true demand)
  recordRequest(projectName, null);

  // Rate limit check
  const rlResult = rateLimiter.check(req);
  if (!rlResult.allowed) {
    stats.rateLimitedRequests++;
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'X-RateLimit-Remaining': '0',
      'Retry-After': String(rlResult.retryAfter || 1),
    });
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
      retryAfter: rlResult.retryAfter,
    }));
    return;
  }

  stats.allowedRequests++;
  const start = Date.now();

  // Pick a healthy instance
  const instance = await selectInstance(projectName);
  if (!instance) {
    stats.failedRequests++;
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No healthy instances available' }));
    }
    return;
  }

  // Track for instance-level RPS
  recordRequest(null, instance.instanceId);

  // Increment active request counter in DB (fire-and-forget)
  Instance.findOneAndUpdate(
    { instanceId: instance.instanceId },
    { $inc: { 'metrics.activeRequests': 1, 'metrics.requestsServed': 1 } }
  ).catch(() => {});

  const targetPort = instance.port;
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  // Build the proxied path (strip /apps/:projectName prefix)
  let proxyPath = req.url.replace(new RegExp(`^/apps/${projectName}`, 'i'), '') || '/';
  if (!proxyPath.startsWith('/')) proxyPath = '/' + proxyPath;

  const doProxy = (port, cb) => {
    const proxyOptions = {
      hostname: '127.0.0.1',
      port,
      path: proxyPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${port}`,
        'x-forwarded-for': req.ip || '127.0.0.1',
        'x-forwarded-host': req.headers.host || `localhost:4000`,
        'x-resilify-instance': instance.instanceId,
      },
    };

    let settled = false;
    const settle = (err, status) => {
      if (settled) return;
      settled = true;
      cb(err, status);
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      if (!res.headersSent) {
        const responseHeaders = {
          ...proxyRes.headers,
          'x-resilify-instance': instance.instanceId,
          'x-resilify-port': String(instance.port),
          'x-resilify-pid': String(instance.pid),
          'access-control-expose-headers': 'x-resilify-instance, x-resilify-port, x-resilify-pid, x-ratelimit-remaining',
        };
        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res, { end: true });
        proxyRes.on('end', () => settle(null, proxyRes.statusCode));
        proxyRes.on('error', (err) => settle(err));
      } else {
        settle(null, proxyRes.statusCode);
      }
    });

    proxyReq.on('error', (err) => settle(err));
    proxyReq.setTimeout(10000, () => {
      proxyReq.destroy();
      settle(new Error('Proxy request timeout'));
    });

    // Forward request body (handle parsed JSON from Express or stream)
    if (req.body && (typeof req.body === 'object' ? Object.keys(req.body).length > 0 : true)) {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!proxyReq.getHeader('content-length')) {
        proxyReq.setHeader('content-length', Buffer.byteLength(bodyData));
      }
      proxyReq.write(bodyData);
      proxyReq.end();
    } else if (req.readable && !req.readableEnded) {
      req.pipe(proxyReq, { end: true });
    } else {
      proxyReq.end();
    }
  };

  return new Promise((resolve) => {
    doProxy(targetPort, async (err, statusCode) => {
      const latency = Date.now() - start;

      // Decrement active requests
      Instance.findOneAndUpdate(
        { instanceId: instance.instanceId },
        { $inc: { 'metrics.activeRequests': -1 } }
      ).catch(() => {});

      if (err) {
        stats.failedRequests++;

        // Retry on another instance for idempotent requests
        if (isIdempotent) {
          const fallback = await selectInstance(projectName);
          if (fallback && fallback.instanceId !== instance.instanceId) {
            stats.recoveredRequests++;
            recordRequest(null, fallback.instanceId);
            doProxy(fallback.port, async (err2, statusCode2) => {
              const latency2 = Date.now() - start;
              if (!err2 && statusCode2 < 500) {
                stats.successfulRequests++;
                stats.failedRequests = Math.max(0, stats.failedRequests - 1);
              }
              stats.latencies.push(latency2);
              if (stats.latencies.length > 1000) stats.latencies.shift();
              resolve();
            });
            return;
          }
        }

        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
        }
      } else {
        if (statusCode < 500) {
          stats.successfulRequests++;
        } else {
          stats.failedRequests++;
          Instance.findOneAndUpdate(
            { instanceId: instance.instanceId },
            { $inc: { 'metrics.failedRequests': 1 } }
          ).catch(() => {});
        }
      }

      stats.latencies.push(latency);
      if (stats.latencies.length > 1000) stats.latencies.shift();
      resolve();
    });
  });
}

// ── Aggregate metrics ─────────────────────────────────────────────────────────

function getAvgLatency(projectName) {
  const stats = _initStats(projectName);
  if (stats.latencies.length === 0) return 0;
  const sum = stats.latencies.reduce((a, b) => a + b, 0);
  return Math.round(sum / stats.latencies.length);
}

function getAvailability(projectName) {
  const stats = _initStats(projectName);
  if (stats.allowedRequests === 0) return 100;
  return Math.round((stats.successfulRequests / stats.allowedRequests) * 10000) / 100;
}

module.exports = {
  proxyRequest,
  getStats,
  resetStats,
  getAvgLatency,
  getAvailability,
  selectInstance,
  getProjectRps,
  getInstanceRps,
  recordRequest,
};
