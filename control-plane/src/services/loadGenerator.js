const axios = require('axios');
const Instance = require('../models/Instance');
const { emit } = require('./deploymentEngine');

// Generates REAL HTTP traffic through the gateway
class LoadGenerator {
  constructor() {
    this.active = new Map(); // projectName -> { intervalId, rps, requestsSent }
    this.gatewayBase = 'http://localhost:4000';
  }

  start(projectName, rps) {
    this.stop(projectName); // stop any existing

    const intervalMs = 100;
    const batchSize = Math.max(1, Math.round(rps / 10));
    const state = { rps, requestsSent: 0, startedAt: Date.now() };

    const interval = setInterval(() => {
      const url = `${this.gatewayBase}/apps/${projectName}/health`;
      for (let i = 0; i < batchSize; i++) {
        axios.get(url, { timeout: 4000 })
          .then(() => { state.requestsSent++; })
          .catch(() => { state.requestsSent++; });
      }
    }, intervalMs);

    this.active.set(projectName, { intervalId: interval, ...state });
    emit('loadGeneratorStarted', { projectName, rps });
    console.log(`[LoadGenerator] Started ${rps} RPS (batch=${batchSize}/100ms) for ${projectName}`);
  }

  stop(projectName) {
    if (this.active.has(projectName)) {
      clearInterval(this.active.get(projectName).intervalId);
      this.active.delete(projectName);
      emit('loadGeneratorStopped', { projectName });
      console.log(`[LoadGenerator] Stopped for ${projectName}`);
    }
  }

  stopAll() {
    for (const [name] of this.active) {
      this.stop(name);
    }
  }

  getStatus(projectName) {
    return this.active.get(projectName) || null;
  }

  isActive(projectName) {
    return this.active.has(projectName);
  }
}

module.exports = new LoadGenerator();
