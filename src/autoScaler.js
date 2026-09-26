/**
 * Watches real rolling RPS (from proxyServer's per-instance counters)
 * and scales the pool up or down. No fake thresholds — this reads the
 * same requestTimestamps array the dashboard displays.
 */
function startAutoScaler(instanceManager, config, onScaleEvent) {
  setInterval(() => {
    const instances = instanceManager.getHealthyInstances();
    if (instances.length === 0) return;

    const totalRps = instances.reduce(
      (sum, i) => sum + i.requestTimestamps.length,
      0
    );

    if (
      totalRps > config.scaling.requestsPerSecondThreshold &&
      instances.length < config.scaling.maxInstances
    ) {
      const newInstance = instanceManager.spawnInstance();
      onScaleEvent('UP', newInstance, totalRps);
      return;
    }

    if (
      totalRps < config.scaling.requestsPerSecondThreshold * 0.3 &&
      instances.length > config.scaling.minInstances
    ) {
      const mostRecentlySpawned = [...instances].sort(
        (a, b) => b.spawnTime - a.spawnTime
      )[0];
      instanceManager.removeInstance(mostRecentlySpawned.id);
      onScaleEvent('DOWN', mostRecentlySpawned, totalRps);
    }
  }, 5000);
}

module.exports = { startAutoScaler };
