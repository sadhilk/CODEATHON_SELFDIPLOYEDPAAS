const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Loads and normalizes a resilify.config.yaml file.
 * Every field has a sane default so a minimal config still works.
 */
function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(raw);

  if (!config.name || !config.entry || !config.port) {
    throw new Error('Config must specify at least: name, entry, port');
  }

  config.env = config.env || {};

  config.scaling = config.scaling || {};
  config.scaling.minInstances = config.scaling.minInstances ?? 1;
  config.scaling.maxInstances = config.scaling.maxInstances ?? 3;
  config.scaling.requestsPerSecondThreshold =
    config.scaling.requestsPerSecondThreshold ?? 50;

  config.health = config.health || {};
  config.health.endpoint = config.health.endpoint || '/health';
  config.health.intervalMs = config.health.intervalMs ?? 2000;
  config.health.failureThreshold = config.health.failureThreshold ?? 3;

  return config;
}

module.exports = { loadConfig };
