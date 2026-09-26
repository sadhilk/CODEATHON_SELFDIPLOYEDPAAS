const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  entryFile: { type: String, required: true },
  port: { type: Number, required: true },
  workingDir: { type: String, required: true },
  env: { type: Map, of: String, default: {} },
  scaling: {
    minInstances: { type: Number, default: 1 },
    maxInstances: { type: Number, default: 20 },
    requestsPerSecondThreshold: { type: Number, default: 50 },
    scaleUpSustainSeconds: { type: Number, default: 5 },
    scaleDownCooldownSeconds: { type: Number, default: 30 },
  },
  health: {
    endpoint: { type: String, default: '/health' },
    intervalMs: { type: Number, default: 2000 },
    timeoutMs: { type: Number, default: 1000 },
    failureThreshold: { type: Number, default: 3 },
  },
  rateLimit: {
    enabled: { type: Boolean, default: true },
    requestsPerSecond: { type: Number, default: 100 },
    burst: { type: Number, default: 200 },
    key: { type: String, default: 'ip' },
  },
  status: {
    type: String,
    enum: ['CREATED', 'DEPLOYING', 'RUNNING', 'STOPPED', 'FAILED'],
    default: 'CREATED',
  },
  currentVersion: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

projectSchema.pre('save', async function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Project', projectSchema);
