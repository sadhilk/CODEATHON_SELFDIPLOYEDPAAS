// In-memory registry for live process management
// Maps instanceId -> { process, port, projectName, ... }

class ProcessRegistry {
  constructor() {
    this.processes = new Map(); // instanceId -> child_process
    this.portPool = new Set();  // ports in use
    this.BASE_PORT = 5001;
    this.MAX_PORT = 5099;
  }

  register(instanceId, child) {
    this.processes.set(instanceId, child);
  }

  get(instanceId) {
    return this.processes.get(instanceId);
  }

  remove(instanceId) {
    this.processes.delete(instanceId);
  }

  has(instanceId) {
    return this.processes.has(instanceId);
  }

  allocatePort() {
    for (let p = this.BASE_PORT; p <= this.MAX_PORT; p++) {
      if (!this.portPool.has(p)) {
        this.portPool.add(p);
        return p;
      }
    }
    throw new Error('No available ports in pool');
  }

  releasePort(port) {
    this.portPool.delete(port);
  }

  getAllInstanceIds() {
    return Array.from(this.processes.keys());
  }

  size() {
    return this.processes.size;
  }
}

module.exports = new ProcessRegistry(); // singleton
