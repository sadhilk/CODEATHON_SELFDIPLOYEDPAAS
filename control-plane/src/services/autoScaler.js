const Instance = require('../models/Instance');
const Project = require('../models/Project');
const { spawnInstance, waitForHealthy, drainAndStop, logEvent, emit, sleep } = require('./deploymentEngine');
const processRegistry = require('../utils/processRegistry');
const loadBalancer = require('./loadBalancer');

// Per-project scaling state
const scalingState = new Map(); // projectName -> { lastScaleUp, lastScaleDown, sustainedSince, scalingInProgress }

// ─────────────────────────────────────────────────────────────────────────────
// Core logic: given current RPS, how many instances should we run?
//
//   0  –  50  RPS  →  1 instance  (min / baseline)
//  51  – 150  RPS  →  2 instances  (~100 RPS)
// 151  – 280  RPS  →  3 instances  (~200 RPS)
// 281  – 420  RPS  →  4 instances  (~300-400 RPS)
// 421+         RPS  →  5 instances  (max, ~500+ RPS)
//
// minInstances / maxInstances from project config are respected as hard bounds.
// ─────────────────────────────────────────────────────────────────────────────
function getTargetInstanceCount(totalRps, minInstances, maxInstances) {
  // Base capacity formula: 1 instance per 10 RPS (lowered to prevent local crashing)
  const capacityNeeded = Math.ceil(totalRps / 10);
  // Default to minInstances if no load, but scale smoothly up to maxInstances
  const target = Math.max(1, capacityNeeded);
  
  return Math.min(maxInstances, Math.max(minInstances, target));
}

class AutoScaler {
  constructor() {
    this.timer = null;
    this.TICK_INTERVAL_MS = 3000; // evaluate every 3 seconds
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), this.TICK_INTERVAL_MS);
    console.log('[AutoScaler] Started (proportional RPS-based scaling)');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async _tick() {
    try {
      const projects = await Project.find({ status: 'RUNNING' });
      for (const project of projects) {
        await this._evaluateProject(project);
      }
    } catch (e) {
      console.error('[AutoScaler] tick error:', e.message);
    }
  }

  async _evaluateProject(project) {
    const projectName = project.name;

    if (!scalingState.has(projectName)) {
      scalingState.set(projectName, {
        lastScaleUp: 0,
        lastScaleDown: 0,
        sustainedSince: null,
        scalingInProgress: false,
      });
    }
    const state = scalingState.get(projectName);

    // Don't stack scaling operations
    if (state.scalingInProgress) return;

    const healthyInstances = await Instance.find({
      projectName,
      status: 'HEALTHY',
    });

    // Use real measured RPS from the load balancer (rolling 2-second window)
    const measuredRps = loadBalancer.getProjectRps(projectName);
    const currentCount = healthyInstances.length;

    const {
      minInstances = 1,
      maxInstances = 5,
      scaleUpSustainSeconds = 5,
      scaleDownCooldownSeconds = 30,
    } = project.scaling;

    const targetCount = getTargetInstanceCount(measuredRps, minInstances, maxInstances);
    const now = Date.now();

    console.log(`[AutoScaler] ${projectName}: RPS=${measuredRps} current=${currentCount} target=${targetCount}`);

    // ── SCALE UP ──────────────────────────────────────────────────────────────
    if (currentCount < targetCount) {
      if (!state.sustainedSince) {
        state.sustainedSince = now;
        await logEvent(projectName, 'TRAFFIC_THRESHOLD_EXCEEDED',
          `RPS ${measuredRps} → target ${targetCount} instances (current: ${currentCount})`,
          null, { measuredRps, targetCount });
      } else {
        const sustainedMs = now - state.sustainedSince;
        const sustainedRequired = Math.min((scaleUpSustainSeconds || 5) * 1000, 5000);
        const scaleCooldown = 5000; // min 5 s between scale-up events

        if (sustainedMs >= sustainedRequired && (now - state.lastScaleUp) > scaleCooldown) {
          state.lastScaleUp = now;
          state.sustainedSince = null;
          // Scale up ONE instance at a time (safer, avoids stampede)
          await this._scaleUp(project, currentCount, measuredRps, targetCount);
        }
      }
    } else {
      // Not needing scale-up; reset sustain timer
      state.sustainedSince = null;
    }

    // ── SCALE DOWN ────────────────────────────────────────────────────────────
    if (currentCount > targetCount) {
      // Fast scale-down for responsive demo (3 seconds instead of 30)
      const cooldownMs = 3000;
      const sinceLastUp   = now - state.lastScaleUp;
      const sinceLastDown = now - state.lastScaleDown;

      if (sinceLastDown > cooldownMs && sinceLastUp > cooldownMs) {
        state.lastScaleDown = now;
        // Remove one instance at a time (LIFO)
        await this._scaleDown(project, healthyInstances, targetCount);
      }
    }
  }

  async _scaleUp(project, currentCount, totalRps, targetCount) {
    const state = scalingState.get(project.name);
    state.scalingInProgress = true;
    try {
      const port = processRegistry.allocatePort();
      await logEvent(project.name, 'SCALE_UP_TRIGGERED',
        `Scale-up: ${currentCount} → ${currentCount + 1} (target: ${targetCount}, RPS: ${totalRps})`,
        null, { port, totalRps, targetCount });
      emit('scalingEvent', {
        projectName: project.name,
        action: 'SCALE_UP',
        from: currentCount,
        to: currentCount + 1,
        totalRps,
        targetCount,
      });

      const { instanceId } = await spawnInstance(project, port, project.currentVersion || 1);
      const dbInst = await Instance.findOne({ instanceId });
      const healthy = await waitForHealthy(dbInst, project, 20000);

      if (!healthy) {
        emit('scalingEvent', { projectName: project.name, action: 'SCALE_UP_FAILED', reason: 'health check timeout' });
      }
    } catch (e) {
      console.error('[AutoScaler] scale-up failed:', e.message);
    } finally {
      state.scalingInProgress = false;
    }
  }

  async _scaleDown(project, healthyInstances, targetCount) {
    const state = scalingState.get(project.name);
    state.scalingInProgress = true;
    try {
      // Remove the most recently added instance (LIFO)
      const toRemove = healthyInstances[healthyInstances.length - 1];
      if (!toRemove) return;

      const newCount = healthyInstances.length - 1;
      await logEvent(project.name, 'SCALE_DOWN_TRIGGERED',
        `Scale-down: ${healthyInstances.length} → ${newCount} (target: ${targetCount})`,
        toRemove.instanceId);
      emit('scalingEvent', {
        projectName: project.name,
        action: 'SCALE_DOWN',
        from: healthyInstances.length,
        to: newCount,
        targetCount,
      });

      await drainAndStop(toRemove.instanceId, project.name);
    } catch (e) {
      console.error('[AutoScaler] scale-down failed:', e.message);
    } finally {
      state.scalingInProgress = false;
    }
  }

  // ── Recovery: replace a crashed instance ONLY if below minInstances ─────────
  // Does NOT blindly spawn — checks current healthy count vs target.
  async recoverInstance(projectName) {
    try {
      const project = await Project.findOne({ name: projectName });
      if (!project || project.status !== 'RUNNING') return;

      // Wait a moment for the instance to fully mark FAILED in DB
      await sleep(500);

      const healthyInstances = await Instance.find({
        projectName,
        status: { $in: ['HEALTHY', 'STARTING'] },
      });
      const currentHealthy = healthyInstances.length;

      const measuredRps = loadBalancer.getProjectRps(projectName);
      const { minInstances = 1, maxInstances = 5 } = project.scaling;
      const targetCount = getTargetInstanceCount(measuredRps, minInstances, maxInstances);

      // Only recover if below what we need
      if (currentHealthy >= targetCount) {
        console.log(`[AutoScaler] Recovery skipped for ${projectName}: ${currentHealthy} healthy >= target ${targetCount}`);
        return;
      }

      // Don't exceed maxInstances
      if (currentHealthy >= maxInstances) return;

      const port = processRegistry.allocatePort();
      await logEvent(projectName, 'INSTANCE_CREATED',
        `Recovery: spawning replacement on port ${port} (healthy=${currentHealthy}, target=${targetCount})`,
        null, { port });
      emit('scalingEvent', { projectName, action: 'RECOVERY', port });

      const { instanceId } = await spawnInstance(project, port, project.currentVersion || 1);
      const dbInst = await Instance.findOne({ instanceId });
      await waitForHealthy(dbInst, project, 20000);
    } catch (e) {
      console.error('[AutoScaler] recovery failed:', e.message);
    }
  }
}

module.exports = new AutoScaler();
