const { fork } = require('child_process');
const path = require('path');

/**
 * Owns the pool of running instances for ONE deployed app.
 * Every instance here maps to a real OS child process — nothing here
 * is simulated. Killing an instance really kills the process.
 */
class InstanceManager {
  constructor(config, entryDir) {
    this.config = config;
    this.entryDir = entryDir;
    this.instances = new Map(); // id -> instance record
    this.nextPort = config.port;
    this.nextId = 1;
  }

  spawnInstance() {
    const id = `server-${this.nextId++}`;
    const port = this.nextPort++;
    const entryPath = path.join(this.entryDir, this.config.entry);

    const child = fork(entryPath, [], {
      env: { ...process.env, ...this.config.env, PORT: String(port) },
    });

    const instance = {
      id,
      port,
      pid: child.pid,
      process: child,
      status: 'STARTING',      // STARTING -> HEALTHY -> FAILED
      spawnTime: Date.now(),
      missedHealthChecks: 0,
      requestCount: 0,
      latencies: [],           // rolling window, ms
      requestTimestamps: [],   // used to compute rolling RPS
    };

    child.on('exit', () => {
      instance.status = 'FAILED';
    });

    child.on('error', () => {
      instance.status = 'FAILED';
    });

    this.instances.set(id, instance);
    return instance;
  }

  killInstance(id) {
    const instance = this.instances.get(id);
    if (!instance) return false;
    try {
      instance.process.kill('SIGKILL'); // real kill, not a status flip
    } catch (e) {
      /* already dead */
    }
    instance.status = 'FAILED';
    return true;
  }

  reviveInstance(id) {
    const old = this.instances.get(id);
    if (!old) return false;

    const entryPath = path.join(this.entryDir, this.config.entry);
    const child = fork(entryPath, [], {
      env: { ...process.env, ...this.config.env, PORT: String(old.port) },
    });

    old.process = child;
    old.pid = child.pid;
    old.status = 'STARTING';
    old.spawnTime = Date.now();
    old.missedHealthChecks = 0;

    child.on('exit', () => { old.status = 'FAILED'; });
    child.on('error', () => { old.status = 'FAILED'; });

    return true;
  }

  removeInstance(id) {
    const instance = this.instances.get(id);
    if (instance) {
      try { instance.process.kill('SIGKILL'); } catch (e) {}
    }
    this.instances.delete(id);
  }

  getHealthyInstances() {
    return [...this.instances.values()].filter(i => i.status === 'HEALTHY');
  }

  getAllInstances() {
    return [...this.instances.values()];
  }
}

module.exports = InstanceManager;
