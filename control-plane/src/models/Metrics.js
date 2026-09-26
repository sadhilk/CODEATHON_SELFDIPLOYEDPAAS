const mongoose = require('mongoose');

const metricsSchema = new mongoose.Schema({
  projectName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  totalRps: { type: Number, default: 0 },
  totalRequests: { type: Number, default: 0 },
  allowedRequests: { type: Number, default: 0 },
  rateLimitedRequests: { type: Number, default: 0 },
  successfulRequests: { type: Number, default: 0 },
  failedRequests: { type: Number, default: 0 },
  recoveredRequests: { type: Number, default: 0 },
  avgLatency: { type: Number, default: 0 },
  activeInstances: { type: Number, default: 0 },
  availability: { type: Number, default: 100 },
});

metricsSchema.index({ projectName: 1, timestamp: -1 });

module.exports = mongoose.model('Metrics', metricsSchema);
