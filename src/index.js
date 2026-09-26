const path = require('path');
const http = require('http');

const { loadConfig } = require('./config');
const InstanceManager = require('./instanceManager');
const { startHealthChecks } = require('./healthChecker');
const { createProxyServer } = require('./proxyServer');
const { startAutoScaler } = require('./autoScaler');
const { createDashboard } = require('./dashboardServer');

const CONFIG_PATH =
  process.argv[2] ||
  path.join(__dirname, '..', 'sample-apps', 'student-portal', 'resilify.config.yaml');

const ENTRY_DIR = path.dirname(CONFIG_PATH);
const PROXY_PORT = 3001;
const DASHBOARD_PORT = 4000;

process.env.PROXY_PORT = String(PROXY_PORT);

const config = loadConfig(CONFIG_PATH);
console.log(`Loaded config for "${config.name}" from ${CONFIG_PATH}`);

const instanceManager = new InstanceManager(config, ENTRY_DIR);

// Spawn the minimum number of instances declared in the config.
for (let i = 0; i < config.scaling.minInstances; i++) {
  instanceManager.spawnInstance();
}

// Start watching every instance's /health endpoint.
startHealthChecks(instanceManager, config, (instance) => {
  console.log(`[health] ${instance.id} -> ${instance.status}`);
});

// Reverse proxy: all real app traffic flows through here.
const proxyController = createProxyServer(instanceManager);
const proxyHttpServer = http.createServer((req, res) =>
  proxyController.handleRequest(req, res)
);
proxyHttpServer.listen(PROXY_PORT, () => {
  console.log(`App traffic proxy listening on http://localhost:${PROXY_PORT}`);
});

// Auto-scale based on real rolling RPS.
startAutoScaler(instanceManager, config, (direction, instance, rps) => {
  console.log(`[autoscale] ${direction} (rps=${rps}) -> ${instance.id}`);
});

// Control-plane dashboard.
createDashboard(instanceManager, proxyController, DASHBOARD_PORT);

console.log('---');
console.log(`Resilify is running for app: ${config.name}`);
console.log(`  App traffic:  http://localhost:${PROXY_PORT}`);
console.log(`  Dashboard:    http://localhost:${DASHBOARD_PORT}`);
console.log('---');
