const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  projectName: { type: String, default: '_system' },
  type: {
    type: String,
    enum: [
      'DEPLOYMENT_STARTED', 'DEPLOYMENT_COMPLETED', 'DEPLOYMENT_FAILED',
      'INSTANCE_CREATED', 'INSTANCE_STARTING', 'INSTANCE_HEALTHY', 'INSTANCE_UNHEALTHY',
      'INSTANCE_FAILED', 'INSTANCE_REMOVED', 'INSTANCE_STOPPED', 'INSTANCE_REVIVED',
      'SCALE_UP_TRIGGERED', 'SCALE_DOWN_TRIGGERED', 'TRAFFIC_THRESHOLD_EXCEEDED',
      'HEALTH_CHECK_FAILED', 'HEALTH_CHECK_PASSED',
      'CIRCUIT_BREAKER_OPENED', 'CIRCUIT_BREAKER_CLOSED', 'CIRCUIT_BREAKER_HALF_OPEN',
      'RATE_LIMIT_CHANGED', 'CONFIG_UPDATED',
      'BACKUP_STARTED', 'BACKUP_COMPLETED', 'BACKUP_FAILED',
      'ROLLBACK_STARTED', 'ROLLBACK_COMPLETED',
    ],
    required: true,
  },
  message: { type: String, required: true },
  instanceId: { type: String },
  metadata: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Event', eventSchema);
