const axios = require('axios');
const Instance = require('../models/Instance');
const { logEvent, emit, sleep } = require('./deploymentEngine');

const CIRCUIT_BREAKER_THRESHOLD = 5;     // consecutive failures before OPEN
const CIRCUIT_BREAKER_COOLDOWN_MS = 30000; // time before HALF_OPEN

// Track which instances we've already triggered crash-recovery for
// (avoid double-firing crash event)
const recoveryTriggered = new Set();

class HealthMonitor {
  constructor() {
    this.timers = new Map();   // projectName -> intervalId
    this.projects = new Map(); // projectName -> project config
  }

  start(project) {
    if (this.timers.has(project.name)) return;
    this.projects.set(project.name, project);

    const timer = setInterval(
      () => this._checkAll(project.name),
      project.health.intervalMs || 2000
    );
    this.timers.set(project.name, timer);
    console.log(`[HealthMonitor] Started for ${project.name}`);
  }

  stop(projectName) {
    const timer = this.timers.get(projectName);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(projectName);
    }
    this.projects.delete(projectName);
    // Clear recovery tracking for this project
    for (const key of recoveryTriggered) {
      if (key.startsWith(`${projectName}:`)) recoveryTriggered.delete(key);
    }
  }

  updateProject(project) {
    this.projects.set(project.name, project);
  }

  async _checkAll(projectName) {
    const project = this.projects.get(projectName);
    if (!project) return;

    // Only check HEALTHY and UNHEALTHY — STARTING is handled by waitForHealthy
    const instances = await Instance.find({
      projectName,
      status: { $in: ['HEALTHY', 'UNHEALTHY'] },
    });

    for (const inst of instances) {
      await this._checkOne(inst, project);
    }
  }

  async _checkOne(inst, project) {
    const healthUrl = `http://localhost:${inst.port}${project.health.endpoint}`;
    let passed = false;

    try {
      const res = await axios.get(healthUrl, {
        timeout: project.health.timeoutMs || 1500,
      });
      passed = res.status === 200;
    } catch (_) {
      passed = false;
    }

    const now = new Date();

    if (passed) {
      // ── Health check PASSED ───────────────────────────────────────────────
      const update = {
        'healthCheck.consecutiveFailures': 0,
        'healthCheck.lastSuccessAt': now,
        'healthCheck.lastCheckedAt': now,
      };

      // Circuit breaker: HALF_OPEN → CLOSED on success
      if (inst.circuitBreaker?.state === 'HALF_OPEN') {
        update['circuitBreaker.state'] = 'CLOSED';
        update['circuitBreaker.failures'] = 0;
        await logEvent(project.name, 'CIRCUIT_BREAKER_CLOSED',
          `Circuit breaker CLOSED for ${inst.instanceId}`, inst.instanceId);
        emit('instanceUpdate', {
          instanceId: inst.instanceId, status: 'HEALTHY',
          port: inst.port, projectName: project.name, circuitBreaker: 'CLOSED',
        });
      }

      if (inst.status !== 'HEALTHY') {
        update.status = 'HEALTHY';
        await logEvent(project.name, 'HEALTH_CHECK_PASSED',
          `Instance ${inst.instanceId} recovered`, inst.instanceId);
        emit('instanceUpdate', {
          instanceId: inst.instanceId, status: 'HEALTHY',
          port: inst.port, projectName: project.name,
        });
      }

      // Clear recovery tracking if it healed
      recoveryTriggered.delete(`${project.name}:${inst.instanceId}`);

      await Instance.findOneAndUpdate({ instanceId: inst.instanceId }, update);
    } else {
      // ── Health check FAILED ───────────────────────────────────────────────
      const newFailures = (inst.healthCheck?.consecutiveFailures || 0) + 1;
      const threshold = project.health.failureThreshold || 3;

      const update = {
        'healthCheck.consecutiveFailures': newFailures,
        'healthCheck.lastCheckedAt': now,
      };

      // HEALTHY → UNHEALTHY after threshold failures
      if (newFailures >= threshold && inst.status === 'HEALTHY') {
        update.status = 'UNHEALTHY';
        await logEvent(project.name, 'INSTANCE_UNHEALTHY',
          `Instance ${inst.instanceId} marked UNHEALTHY after ${newFailures} failures`,
          inst.instanceId);
        emit('instanceUpdate', {
          instanceId: inst.instanceId, status: 'UNHEALTHY',
          port: inst.port, projectName: project.name,
        });
      }

      // Circuit breaker logic
      const cbFailures = (inst.circuitBreaker?.failures || 0) + 1;
      update['circuitBreaker.failures'] = cbFailures;
      update['circuitBreaker.lastFailureAt'] = now;

      if (cbFailures >= CIRCUIT_BREAKER_THRESHOLD && inst.circuitBreaker?.state === 'CLOSED') {
        update['circuitBreaker.state'] = 'OPEN';
        update['circuitBreaker.openedAt'] = now;
        await logEvent(project.name, 'CIRCUIT_BREAKER_OPENED',
          `Circuit breaker OPEN for ${inst.instanceId}`, inst.instanceId);
        emit('instanceUpdate', {
          instanceId: inst.instanceId, status: inst.status,
          port: inst.port, projectName: project.name, circuitBreaker: 'OPEN',
        });
      }

      // OPEN → HALF_OPEN after cooldown
      if (inst.circuitBreaker?.state === 'OPEN') {
        const openedAt = inst.circuitBreaker.openedAt;
        if (openedAt && (Date.now() - new Date(openedAt).getTime()) > CIRCUIT_BREAKER_COOLDOWN_MS) {
          update['circuitBreaker.state'] = 'HALF_OPEN';
          await logEvent(project.name, 'CIRCUIT_BREAKER_HALF_OPEN',
            `Circuit breaker HALF_OPEN for ${inst.instanceId}`, inst.instanceId);
          emit('instanceUpdate', {
            instanceId: inst.instanceId, status: inst.status,
            port: inst.port, projectName: project.name, circuitBreaker: 'HALF_OPEN',
          });
        }
      }

      // UNHEALTHY → FAILED after double threshold: trigger recovery ONCE
      if (newFailures >= threshold * 2 && ['UNHEALTHY', 'STARTING'].includes(inst.status)) {
        const recoveryKey = `${project.name}:${inst.instanceId}`;
        if (!recoveryTriggered.has(recoveryKey)) {
          recoveryTriggered.add(recoveryKey);
          update.status = 'FAILED';
          await logEvent(project.name, 'INSTANCE_FAILED',
            `Instance ${inst.instanceId} FAILED after ${newFailures} consecutive failures`,
            inst.instanceId);
          emit('instanceUpdate', {
            instanceId: inst.instanceId, status: 'FAILED',
            port: inst.port, projectName: project.name,
          });
          // Trigger exactly ONE crash recovery attempt
          emit('instanceCrashed', { instanceId: inst.instanceId, projectName: project.name });
        }
      }

      await Instance.findOneAndUpdate({ instanceId: inst.instanceId }, update);

      if (newFailures === 1) {
        await logEvent(project.name, 'HEALTH_CHECK_FAILED',
          `Health check failed for ${inst.instanceId} (${newFailures}/${threshold})`,
          inst.instanceId);
      }
    }
  }
}

module.exports = new HealthMonitor();
