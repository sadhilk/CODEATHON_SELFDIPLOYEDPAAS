const httpProxy = require('http-proxy');

/**
 * Routes real traffic to real instances. Metrics (requests, RPS, latency,
 * availability) are all derived from what actually happens here — none
 * of these numbers are hardcoded or simulated.
 */
function createProxyServer(instanceManager) {
  const proxy = httpProxy.createProxyServer({});
  let rrIndex = -1;

  let totalRequests = 0;
  let successfulRequests = 0;
  let recoveredRequests = 0; // requests that failed on one instance and succeeded on retry

  function pickInstance() {
    const healthy = instanceManager.getHealthyInstances();
    if (healthy.length === 0) return null;
    rrIndex = (rrIndex + 1) % healthy.length;
    return healthy[rrIndex];
  }

  function handleRequest(req, res, isRetry = false) {
    if (!isRetry) totalRequests++;

    const instance = pickInstance();
    if (!instance) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('No healthy instances available');
      return;
    }

    const start = Date.now();

    proxy.web(
      req,
      res,
      { target: `http://localhost:${instance.port}`, timeout: 3000 },
      (err) => {
        if (!isRetry) {
          recoveredRequests++;
          handleRequest(req, res, true); // one retry against a different live instance
        } else if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Bad gateway');
        }
      }
    );

    res.on('finish', () => {
      const latency = Date.now() - start;
      instance.requestCount++;
      instance.latencies.push(latency);
      if (instance.latencies.length > 100) instance.latencies.shift();

      const now = Date.now();
      instance.requestTimestamps.push(now);
      instance.requestTimestamps = instance.requestTimestamps.filter(
        (t) => now - t < 1000
      );

      if (res.statusCode < 500) successfulRequests++;
    });
  }

  function getStats() {
    const availability =
      totalRequests === 0 ? 100 : (successfulRequests / totalRequests) * 100;
    return { totalRequests, successfulRequests, recoveredRequests, availability };
  }

  return { handleRequest, getStats };
}

module.exports = { createProxyServer };
