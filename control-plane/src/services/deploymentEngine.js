const { fork } = require('child_process');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const pidusage = require('pidusage');

const processRegistry = require('../utils/processRegistry');
const Instance = require('../models/Instance');
const Event = require('../models/Event');

let io = null;

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

async function logEvent(projectName, type, message, instanceId = null, metadata = {}) {
  try {
    const ev = await Event.create({ projectName, type, message, instanceId, metadata });
    emit('event', { ...ev.toObject(), _id: ev._id.toString() });
    return ev;
  } catch (e) {
    console.error('Event log error:', e.message);
  }
}

// ── Spawn a real Node.js process ──────────────────────────────────────────────
async function spawnInstance(project, port, version = 1) {
  const instanceId = `${project.name}-${uuidv4().slice(0, 8)}`;

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
  };
  if (project.env) {
    const envObj = project.env instanceof Map
      ? Object.fromEntries(project.env)
      : project.env;
    for (const [k, v] of Object.entries(envObj)) {
      env[k] = String(v);
    }
  }

  const entryPath = path.isAbsolute(project.entryFile)
    ? project.entryFile
    : path.join(project.workingDir, project.entryFile);

  const child = fork(entryPath, [], {
    env,
    cwd: project.workingDir,
    silent: true,
    execArgv: ['--max-old-space-size=256'],
  });

  // Create DB record immediately
  const instance = await Instance.create({
    instanceId,
    projectName: project.name,
    pid: child.pid,
    port,
    status: 'STARTING',
    version,
  });

  processRegistry.register(instanceId, child);

  child.stdout?.on('data', (d) =>
    console.log(`[${instanceId}] ${d.toString().trim()}`)
  );
  child.stderr?.on('data', (d) =>
    console.error(`[${instanceId}] ERR: ${d.toString().trim()}`)
  );

  child.on('exit', (code, signal) => {
    console.log(`[${instanceId}] exited code=${code} signal=${signal}`);
    processRegistry.remove(instanceId);
    processRegistry.releasePort(port);
    handleUnexpectedExit(instanceId, project.name);
  });

  await logEvent(project.name, 'INSTANCE_CREATED',
    `Instance ${instanceId} spawned on port ${port}`, instanceId, { port });
  emit('instanceUpdate', { instanceId, status: 'STARTING', port, projectName: project.name });

  return { instanceId, child, instance };
}

// ── Wait for health check to pass ─────────────────────────────────────────────
async function waitForHealthy(instance, project, timeoutMs = 30000) {
  if (!instance) return false;

  // Prefer 127.0.0.1 to avoid IPv6 resolution delays
  const healthUrl = `http://127.0.0.1:${instance.port}${project.health.endpoint || '/health'}`;
  const deadline = Date.now() + timeoutMs;

  console.log(`[Deploy] Waiting for health: ${healthUrl}`);

  while (Date.now() < deadline) {
    try {
      const res = await axios.get(healthUrl, {
        timeout: Math.min(project.health.timeoutMs || 2000, 3000),
      });
      if (res.status === 200) {
        await Instance.findOneAndUpdate(
          { instanceId: instance.instanceId },
          {
            $set: {
              status: 'HEALTHY',
              'healthCheck.lastSuccessAt': new Date(),
              'healthCheck.consecutiveFailures': 0,
            },
          }
        );
        await logEvent(project.name, 'INSTANCE_HEALTHY',
          `Instance ${instance.instanceId} passed health check on port ${instance.port}`,
          instance.instanceId);
        emit('instanceUpdate', {
          instanceId: instance.instanceId, status: 'HEALTHY',
          port: instance.port, projectName: project.name,
        });
        return true;
      }
    } catch (_) {
      // Not ready yet — keep polling
    }
    await sleep(500);
  }

  // Timed out
  await Instance.findOneAndUpdate(
    { instanceId: instance.instanceId },
    { $set: { status: 'FAILED' } }
  );
  await logEvent(project.name, 'INSTANCE_FAILED',
    `Instance ${instance.instanceId} failed health check (timeout ${timeoutMs}ms)`,
    instance.instanceId);
  emit('instanceUpdate', {
    instanceId: instance.instanceId, status: 'FAILED',
    port: instance.port, projectName: project.name,
  });
  return false;
}

// ── Graceful drain + stop ─────────────────────────────────────────────────────
async function drainAndStop(instanceId, projectName) {
  const dbInst = await Instance.findOne({ instanceId });
  if (!dbInst) return;

  await Instance.findOneAndUpdate({ instanceId }, { $set: { status: 'DRAINING' } });
  emit('instanceUpdate', { instanceId, status: 'DRAINING', port: dbInst.port, projectName });
  await logEvent(projectName, 'INSTANCE_STOPPED', `Instance ${instanceId} draining`, instanceId);

  // Allow up to 5s for active requests to finish
  let waited = 0;
  while (waited < 5000) {
    const fresh = await Instance.findOne({ instanceId });
    if (!fresh || (fresh.metrics?.activeRequests ?? 0) === 0) break;
    await sleep(200);
    waited += 200;
  }

  await killInstance(instanceId, projectName);
}

// ── Force kill ────────────────────────────────────────────────────────────────
async function killInstance(instanceId, projectName) {
  const dbInst = await Instance.findOne({ instanceId });
  const port = dbInst?.port;

  const child = processRegistry.get(instanceId);
  if (child) {
    try { child.kill('SIGTERM'); } catch (_) {}
    await sleep(300);
    try { child.kill('SIGKILL'); } catch (_) {}
  }
  processRegistry.remove(instanceId);
  if (port) processRegistry.releasePort(port);

  await Instance.findOneAndUpdate(
    { instanceId },
    { $set: { status: 'STOPPED', stoppedAt: new Date() } }
  );

  emit('instanceUpdate', { instanceId, status: 'STOPPED', port, projectName });
  await logEvent(projectName, 'INSTANCE_STOPPED', `Instance ${instanceId} stopped`, instanceId);
}

// ── Unexpected exit (crash) ───────────────────────────────────────────────────
async function handleUnexpectedExit(instanceId, projectName) {
  // If the process died, check if it's already been marked as STOPPING/STOPPED/FAILED
  const dbInst = await Instance.findOne({ instanceId });
  if (!dbInst) return;
  if (['STOPPING', 'STOPPED', 'DRAINING', 'FAILED'].includes(dbInst.status)) return;

  await Instance.findOneAndUpdate({ instanceId }, { $set: { status: 'FAILED' } });
  emit('instanceUpdate', { instanceId, status: 'FAILED', port: dbInst.port, projectName });
  await logEvent(projectName, 'INSTANCE_FAILED',
    `Instance ${instanceId} crashed unexpectedly`, instanceId);

  // Signal crash — autoScaler.recoverInstance() handles the response
  emit('instanceCrashed', { instanceId, projectName });
}

// ── Collect real CPU/memory via pidusage ──────────────────────────────────────
async function collectMetrics(instanceId) {
  const child = processRegistry.get(instanceId);
  if (!child || !child.pid) return null;

  try {
    const stats = await pidusage(child.pid);
    return {
      cpu: Math.round(stats.cpu * 10) / 10,
      memory: Math.round((stats.memory / 1024 / 1024) * 10) / 10, // MB
    };
  } catch (_) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  setIO,
  logEvent,
  spawnInstance,
  waitForHealthy,
  drainAndStop,
  killInstance,
  collectMetrics,
  emit,
  sleep,
};
