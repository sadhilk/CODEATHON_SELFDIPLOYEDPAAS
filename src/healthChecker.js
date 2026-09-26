const http = require('http');

/**
 * Pings every instance's health endpoint on a fixed interval.
 * A real network call happens every time — status is never set directly
 * by anything other than this check (or a manual kill).
 */
function startHealthChecks(instanceManager, config, onStatusChange) {
  setInterval(() => {
    for (const instance of instanceManager.getAllInstances()) {
      if (instance.status === 'FAILED' && instance.missedHealthChecks === 0) {
        // already confirmed dead, don't keep hammering it until revived
        continue;
      }

      const req = http.get(
        {
          host: 'localhost',
          port: instance.port,
          path: config.health.endpoint,
          timeout: 1500,
        },
        (res) => {
          res.resume(); // drain response
          if (res.statusCode === 200) {
            markHealthy(instance, onStatusChange);
          } else {
            registerMiss(instance, config, onStatusChange);
          }
        }
      );

      req.on('error', () => registerMiss(instance, config, onStatusChange));
      req.on('timeout', () => {
        req.destroy();
        registerMiss(instance, config, onStatusChange);
      });
    }
  }, config.health.intervalMs);
}

function markHealthy(instance, onStatusChange) {
  const wasUnhealthy = instance.status !== 'HEALTHY';
  instance.status = 'HEALTHY';
  instance.missedHealthChecks = 0;
  if (wasUnhealthy) onStatusChange(instance);
}

function registerMiss(instance, config, onStatusChange) {
  instance.missedHealthChecks++;
  if (
    instance.missedHealthChecks >= config.health.failureThreshold &&
    instance.status !== 'FAILED'
  ) {
    instance.status = 'FAILED';
    onStatusChange(instance);
  }
}

module.exports = { startHealthChecks };
