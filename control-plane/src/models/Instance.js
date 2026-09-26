const mongoose = require('mongoose');

const instanceSchema = new mongoose.Schema({
  instanceId: { type: String, required: true, unique: true },
  projectName: { type: String, required: true },
  pid: { type: Number },
  port: { type: Number, required: true },
  status: {
    type: String,
    enum: ['STARTING', 'HEALTHY', 'DRAINING', 'UNHEALTHY', 'FAILED', 'STOPPING', 'STOPPED'],
    default: 'STARTING',
  },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  stoppedAt: { type: Date },
  metrics: {
    cpu: { type: Number, default: 0 },
    memory: { type: Number, default: 0 },
    requestsServed: { type: Number, default: 0 },
    rps: { type: Number, default: 0 },
    avgLatency: { type: Number, default: 0 },
    failedRequests: { type: Number, default: 0 },
    activeRequests: { type: Number, default: 0 },
  },
  circuitBreaker: {
    state: { type: String, enum: ['CLOSED', 'OPEN', 'HALF_OPEN'], default: 'CLOSED' },
    failures: { type: Number, default: 0 },
    lastFailureAt: { type: Date },
    openedAt: { type: Date },
  },
  healthCheck: {
    consecutiveFailures: { type: Number, default: 0 },
    lastCheckedAt: { type: Date },
    lastSuccessAt: { type: Date },
  },
});

module.exports = mongoose.model('Instance', instanceSchema);
