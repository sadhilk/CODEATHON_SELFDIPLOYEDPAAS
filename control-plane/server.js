require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('169.254.')) {
          return net.address;
        }
        candidates.push(net.address);
      }
    }
  }
  return candidates[0] || 'localhost';
}

const projectsRouter = require('./src/routes/projects');
const gatewayRouter = require('./src/routes/gateway');
const deploymentEngine = require('./src/services/deploymentEngine');
const healthMonitor = require('./src/services/healthMonitor');
const autoScaler = require('./src/services/autoScaler');
const loadBalancer = require('./src/services/loadBalancer');
const rateLimiter = require('./src/services/rateLimiter');
const Instance = require('./src/models/Instance');
const Project = require('./src/models/Project');
const { collectMetrics } = require('./src/services/deploymentEngine');
const processRegistry = require('./src/utils/processRegistry');

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/resilify';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Gateway: /apps/:projectName/* ────────────────────────────────────────────
app.use('/apps/:projectName', async (req, res, next) => {
  const { projectName } = req.params;
  try {
    const project = await Project.findOne({ name: projectName, status: 'RUNNING' });
    if (!project) {
      return res.status(404).json({ error: `Project "${projectName}" not found or not running` });
    }
    await loadBalancer.proxyRequest(req, res, projectName);
  } catch (e) {
    console.error('[Gateway] Error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gateway error', message: e.message });
    }
  }
});

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/docs/swaggerSpec');

// ── API Documentation (Swagger / OpenAPI 3.0) ──────────────────────────────
app.get('/api/docs/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

// Swagger UI with custom dark/slate styling to match Resilify aesthetic
const swaggerUiOptions = {
  customSiteTitle: 'Resilify API Documentation',
  customCss: `
    .swagger-ui .topbar { background-color: #0f172a; border-bottom: 1px solid #1e293b; }
    .swagger-ui .topbar .topbar-wrapper a span { font-weight: 700; color: #38bdf8; }
    .swagger-ui .info .title { color: #0f172a; }
  `,
};

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/projects', projectsRouter);
app.use('/api/gateway', gatewayRouter);

app.get('/api/health', async (req, res) => {
  res.json({
    status: 'OK',
    controlPlane: 'HEALTHY',
    database: mongoose.connection.readyState === 1 ? 'HEALTHY' : 'UNHEALTHY',
    mongoState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/system/network', (req, res) => {
  const lanIp = getLanIp();
  res.json({
    lanIp,
    port: PORT,
    dashboardPort: 3001,
    gatewayUrl: `http://${lanIp}:${PORT}/apps/student-portal/`,
    dashboardUrl: `http://${lanIp}:3001`,
  });
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.on('subscribe', (projectName) => socket.join(projectName));
  socket.on('disconnect', () => console.log(`[Socket.IO] Disconnected: ${socket.id}`));
});

// Wire Socket.IO into deployment engine
deploymentEngine.setIO(io);

// Override emit so instanceCrashed → recovery (exactly once, via autoScaler)
const originalEmit = deploymentEngine.emit;
deploymentEngine.emit = function (event, data) {
  io.emit(event, data);
  if (event === 'instanceCrashed') {
    const { projectName } = data;
    autoScaler.recoverInstance(projectName).catch((e) =>
      console.error('[Recovery] Error:', e.message)
    );
  }
};

// ── Metrics Collector (every 3 seconds) ─────────────────────────────────────
async function collectAllMetrics() {
  try {
    const projects = await Project.find({ status: 'RUNNING' });

    for (const project of projects) {
      const instances = await Instance.find({
        projectName: project.name,
        status: { $in: ['STARTING', 'HEALTHY', 'UNHEALTHY'] },
      });

      for (const inst of instances) {
        const sysMet = await collectMetrics(inst.instanceId);
        const instRps = loadBalancer.getInstanceRps(inst.instanceId);
        const updateData = { 'metrics.rps': instRps };
        if (sysMet) {
          updateData['metrics.cpu'] = sysMet.cpu;
          updateData['metrics.memory'] = sysMet.memory;
        }
        await Instance.findOneAndUpdate({ instanceId: inst.instanceId }, { $set: updateData });
      }

      // Emit live snapshot to dashboard
      const stats = loadBalancer.getStats(project.name);
      const rlStats = rateLimiter.getStats();
      const totalRps = loadBalancer.getProjectRps(project.name);

      io.emit('metricsUpdate', {
        projectName: project.name,
        instances: await Instance.find({ projectName: project.name }).lean(),
        totalRps,
        stats: {
          ...stats,
          availability: loadBalancer.getAvailability(project.name),
          avgLatency: loadBalancer.getAvgLatency(project.name),
        },
        rateLimit: {
          config: rateLimiter.getConfig(),
          stats: rlStats,
        },
        timestamp: Date.now(),
      });
    }
  } catch (e) {
    // swallow metric errors — non-critical
  }
}

// ── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('[MongoDB] Connected to', MONGO_URI);

    // ── Startup cleanup ───────────────────────────────────────────────────
    // Mark all in-flight instances as STOPPED (server restarted, no live processes)
    const stale = await Instance.updateMany(
      { status: { $in: ['HEALTHY', 'STARTING', 'UNHEALTHY', 'DRAINING'] } },
      { $set: { status: 'STOPPED', stoppedAt: new Date() } }
    );
    if (stale.modifiedCount > 0) {
      console.log(`[Startup] Cleaned up ${stale.modifiedCount} stale instance(s)`);
    }

    // Delete all STOPPED/FAILED records — they have no live processes
    const deleted = await Instance.deleteMany({
      status: { $in: ['STOPPED', 'FAILED'] },
    });
    if (deleted.deletedCount > 0) {
      console.log(`[Startup] Deleted ${deleted.deletedCount} historical instance record(s)`);
    }

    // Reset projects to STOPPED (no live processes after restart)
    await Project.updateMany(
      { status: { $in: ['RUNNING', 'DEPLOYING'] } },
      { $set: { status: 'STOPPED' } }
    );

    // ── Sync port pool ────────────────────────────────────────────────────
    // Pre-reserve ports that are still in DB (edge case guard)
    const livePorts = await Instance.distinct('port', {
      status: { $in: ['HEALTHY', 'STARTING'] },
    });
    for (const p of livePorts) {
      processRegistry.portPool.add(p);
    }

    // ── Start background services ─────────────────────────────────────────
    autoScaler.start();
    setInterval(collectAllMetrics, 3000);

    server.listen(PORT, '0.0.0.0', () => {
      const lanIp = getLanIp();
      console.log(`\n🚀 Resilify Control Plane running on:`);
      console.log(`   Local:         http://localhost:${PORT}`);
      console.log(`   LAN (Phone):   http://${lanIp}:${PORT}`);
      console.log(`   Gateway:       http://${lanIp}:${PORT}/apps/:projectName/`);
      console.log(`   Dashboard:     http://${lanIp}:3001\n`);
    });
  })
  .catch((e) => {
    console.error('[MongoDB] Connection failed:', e.message);
    process.exit(1);
  });

// ── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Graceful shutdown initiated...');
  autoScaler.stop();
  const instances = await Instance.find({ status: { $in: ['HEALTHY', 'STARTING', 'UNHEALTHY'] } });
  for (const inst of instances) {
    await deploymentEngine.killInstance(inst.instanceId, inst.projectName);
  }
  process.exit(0);
});

module.exports = { app, server, io };
