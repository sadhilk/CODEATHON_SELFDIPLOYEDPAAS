const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Resilify Control Plane & Orchestrator API',
    version: '1.0.0',
    description: `
# 🛡️ Resilify REST & Orchestration API

Welcome to the interactive Swagger / OpenAPI 3.0 specification for **Resilify** — the self-hosted, zero-simulation PaaS platform.

### Core Capabilities:
- 🚀 **Projects & Deployments**: Register applications, manage versions, trigger deployments and zero-downtime stops.
- ⚖️ **Load Balancing & Gateway**: Dynamic reverse-proxy gateway routing with round-robin traffic distribution.
- ⚡ **Auto-Scaling & Self-Healing**: Automated health probes, crash detection, sub-second auto-revival, and load-based scaling.
- 💣 **Chaos Engineering**: On-demand instance termination, fault injection, and latency simulation.
- 🛑 **Dynamic Rate Limiting**: In-memory token bucket rate limiting with real-time reconfiguration.
- 📈 **Telemetry & Event Logs**: Real-time process metrics (CPU, memory, RPS, latency) and audit events.
    `,
    contact: {
      name: 'Resilify Codeathon Team',
      url: 'https://github.com/sadhilk/CODEATHON_SELFDIPLOYEDPAAS',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Control Plane Server',
    },
    {
      url: '/',
      description: 'Current Origin Base Path',
    },
  ],
  tags: [
    { name: 'Projects', description: 'Lifecycle management for hosted applications' },
    { name: 'Deployments', description: 'Deployment triggers and multi-instance process spawning' },
    { name: 'Instances', description: 'Instance inspection, process killing, and manual revival' },
    { name: 'Gateway & Traffic', description: 'Reverse proxy gateway, load balancer stats, and reset controls' },
    { name: 'Rate Limiting', description: 'Dynamic token bucket rate limiter rules and stats' },
    { name: 'Load Generator', description: 'Built-in synthetic load testing engine' },
    { name: 'Database & Cloud Backup', description: 'MongoDB stats, document browsing, and cloud backup replication' },
    { name: 'System & Health', description: 'Control plane health checks and LAN IP networking discovery' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System & Health'],
        summary: 'Control plane & database health check',
        description: 'Returns health status of the orchestrator, MongoDB connection state, and timestamp.',
        responses: {
          200: {
            description: 'System is healthy',
            content: {
              'application/json': {
                example: {
                  status: 'OK',
                  controlPlane: 'HEALTHY',
                  database: 'HEALTHY',
                  mongoState: 1,
                  timestamp: '2026-09-26T05:20:00.000Z',
                },
              },
            },
          },
        },
      },
    },
    '/api/system/network': {
      get: {
        tags: ['System & Health'],
        summary: 'LAN IP and gateway discovery',
        description: 'Detects the host machine IPv4 LAN address to allow mobile device testing over WiFi.',
        responses: {
          200: {
            description: 'Network endpoints and URLs',
            content: {
              'application/json': {
                example: {
                  lanIp: '192.168.1.10',
                  port: 4000,
                  dashboardPort: 3001,
                  gatewayUrl: 'http://192.168.1.10:4000/apps/student-portal/',
                  dashboardUrl: 'http://192.168.1.10:3001',
                },
              },
            },
          },
        },
      },
    },
    '/api/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List all projects',
        description: 'Retrieves all registered projects along with active instance details and traffic telemetry.',
        responses: {
          200: {
            description: 'Array of projects',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Project' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Register a new project',
        description: 'Creates a project definition in the database ready for zero-simulation deployment.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProjectCreateInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Project created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Project' },
              },
            },
          },
          400: { description: 'Missing required parameters or entry file not found' },
          409: { description: 'Project name already exists' },
        },
      },
    },
    '/api/projects/{name}': {
      get: {
        tags: ['Projects'],
        summary: 'Get project details',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, example: 'student-portal' },
        ],
        responses: {
          200: {
            description: 'Project details, instance list, load balancer metrics, and recent events',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } },
          },
          404: { description: 'Project not found' },
        },
      },
      put: {
        tags: ['Projects'],
        summary: 'Update project configuration',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProjectUpdateInput' },
            },
          },
        },
        responses: {
          200: { description: 'Project configuration updated' },
          404: { description: 'Project not found' },
        },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete project and terminate all instances',
        description: 'Stops all running child processes, cleans port allocations, and removes database records.',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Project deleted successfully' },
          404: { description: 'Project not found' },
        },
      },
    },
    '/api/projects/{name}/deploy': {
      post: {
        tags: ['Deployments'],
        summary: 'Trigger zero-downtime deployment',
        description: 'Increments the project version, cleans stale records, allocates isolated ports, and spawns real OS child processes.',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Deployment initiated asynchronously' },
          409: { description: 'Deployment already in progress' },
        },
      },
    },
    '/api/projects/{name}/stop': {
      post: {
        tags: ['Deployments'],
        summary: 'Stop all instances of a project',
        description: 'Stops health monitoring and sends SIGTERM/SIGKILL to all running process instances.',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Project stopped successfully' },
        },
      },
    },
    '/api/projects/{name}/instances': {
      get: {
        tags: ['Instances'],
        summary: 'List project instances',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'List of running and stopped instance processes',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Instance' },
                },
              },
            },
          },
        },
      },
    },
    '/api/projects/{name}/instances/{instanceId}/kill': {
      post: {
        tags: ['Instances'],
        summary: 'Chaos engineering: Kill an instance (SIGKILL)',
        description: 'Sends a real OS SIGKILL to the instance child process to test auto-healing and instant recovery.',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'instanceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Instance killed. Self-healing supervisor will spawn a replacement.' },
          404: { description: 'Instance not found' },
        },
      },
    },
    '/api/projects/{name}/instances/{instanceId}/revive': {
      post: {
        tags: ['Instances'],
        summary: 'Manually revive / respawn an instance',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'instanceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Revival process started' },
        },
      },
    },
    '/api/projects/{name}/instances/{instanceId}/drain': {
      post: {
        tags: ['Instances'],
        summary: 'Gracefully drain and stop an instance',
        description: 'Marks instance as DRAINING so gateway stops forwarding new requests, then stops process.',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'instanceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Instance drain started' },
        },
      },
    },
    '/api/projects/{name}/events': {
      get: {
        tags: ['Projects'],
        summary: 'Get project audit and lifecycle event log',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: {
          200: {
            description: 'List of audit events (crashes, scale actions, health changes)',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Event' },
                },
              },
            },
          },
        },
      },
    },
    '/api/gateway/config': {
      get: {
        tags: ['Rate Limiting'],
        summary: 'Get dynamic rate limiter configuration & token stats',
        responses: {
          200: {
            description: 'Rate limit config and active stats',
            content: {
              'application/json': {
                example: {
                  config: { enabled: true, requestsPerSecond: 100, burst: 150, key: 'ip' },
                  stats: { totalRequests: 540, blockedRequests: 12, activeKeys: 3 },
                },
              },
            },
          },
        },
      },
      put: {
        tags: ['Rate Limiting'],
        summary: 'Update rate limiter rules dynamically in real time',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean', example: true },
                  requestsPerSecond: { type: 'number', example: 50 },
                  burst: { type: 'number', example: 100 },
                  key: { type: 'string', example: 'ip' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Rate limit updated and propagated to all workers' },
        },
      },
    },
    '/api/gateway/load-generator/start': {
      post: {
        tags: ['Load Generator'],
        summary: 'Start synthetic load generation against a project',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['projectName', 'rps'],
                properties: {
                  projectName: { type: 'string', example: 'student-portal' },
                  rps: { type: 'integer', example: 10 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Load generator started' },
        },
      },
    },
    '/api/gateway/load-generator/stop': {
      post: {
        tags: ['Load Generator'],
        summary: 'Stop active synthetic load generator',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['projectName'],
                properties: {
                  projectName: { type: 'string', example: 'student-portal' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Load generator stopped' },
        },
      },
    },
    '/apps/{projectName}/{subpath}': {
      get: {
        tags: ['Gateway & Traffic'],
        summary: 'Reverse-proxy gateway route to application instances',
        description: 'Routes incoming client traffic through the load balancer, rate limiter, and round-robin instance dispatcher.',
        parameters: [
          { name: 'projectName', in: 'path', required: true, schema: { type: 'string' }, example: 'student-portal' },
          { name: 'subpath', in: 'path', required: false, schema: { type: 'string' }, example: 'api/health' },
        ],
        responses: {
          200: { description: 'Forwarded response from healthy application instance' },
          429: { description: 'Too Many Requests (Rate limit exceeded)' },
          503: { description: 'No healthy upstream instances available' },
        },
      },
    },
    '/api/database/stats': {
      get: {
        tags: ['Database & Cloud Backup'],
        summary: 'Get database storage statistics and per-collection document counts',
        responses: {
          200: {
            description: 'Database-level and collection-level statistics',
            content: {
              'application/json': {
                example: {
                  database: 'resilify',
                  totalCollections: 4,
                  totalDocuments: 128,
                  dataSize: 65536,
                  storageSize: 131072,
                  indexSize: 32768,
                  collections: [
                    { name: 'events', documentCount: 85, sizeBytes: 32768, avgDocSize: 385, indexes: 2 },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/database/collections/{name}/documents': {
      get: {
        tags: ['Database & Cloud Backup'],
        summary: 'Browse documents in a collection (paginated)',
        parameters: [
          { name: 'name', in: 'path', required: true, schema: { type: 'string' }, example: 'projects' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated document list with total count' },
        },
      },
    },
    '/api/database/backup/status': {
      get: {
        tags: ['Database & Cloud Backup'],
        summary: 'Get cloud backup connection status and last sync details',
        responses: {
          200: { description: 'Current cloud backup configuration and sync status' },
        },
      },
    },
    '/api/database/backup/configure': {
      post: {
        tags: ['Database & Cloud Backup'],
        summary: 'Connect to a cloud MongoDB (Atlas) for backup replication',
        description: 'Paste any MongoDB Atlas or cloud URI. Resilify will establish a separate connection for data replication.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['uri'],
                properties: {
                  uri: { type: 'string', example: 'mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/resilify-backup' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Successfully connected to cloud database' },
          400: { description: 'Invalid MongoDB URI' },
          500: { description: 'Connection failed' },
        },
      },
    },
    '/api/database/backup/sync': {
      post: {
        tags: ['Database & Cloud Backup'],
        summary: 'Replicate all local MongoDB data to the connected cloud database',
        description: 'Copies all documents from every collection to the cloud backup. Existing cloud data is replaced.',
        responses: {
          200: { description: 'Sync started (runs asynchronously)' },
          400: { description: 'Cloud backup not configured' },
          409: { description: 'Sync already in progress' },
        },
      },
    },
    '/api/database/backup/disconnect': {
      post: {
        tags: ['Database & Cloud Backup'],
        summary: 'Disconnect from cloud backup database',
        responses: {
          200: { description: 'Cloud backup disconnected' },
        },
      },
    },
  },
  components: {
    schemas: {
      Project: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'student-portal' },
          status: { type: 'string', enum: ['STOPPED', 'DEPLOYING', 'RUNNING', 'FAILED'], example: 'RUNNING' },
          entryFile: { type: 'string', example: 'server.js' },
          workingDir: { type: 'string', example: 'e:/LPUCODETHON/resilify/sample-apps/student-portal' },
          currentVersion: { type: 'integer', example: 1 },
          scaling: {
            type: 'object',
            properties: {
              minInstances: { type: 'integer', example: 2 },
              maxInstances: { type: 'integer', example: 5 },
              targetCpuPercent: { type: 'integer', example: 70 },
              targetRpsPerInstance: { type: 'integer', example: 50 },
            },
          },
          health: {
            type: 'object',
            properties: {
              path: { type: 'string', example: '/health' },
              intervalSeconds: { type: 'integer', example: 5 },
              timeoutMs: { type: 'integer', example: 2000 },
              unhealthyThreshold: { type: 'integer', example: 3 },
            },
          },
        },
      },
      ProjectCreateInput: {
        type: 'object',
        required: ['name', 'entryFile', 'workingDir'],
        properties: {
          name: { type: 'string', example: 'my-microservice' },
          entryFile: { type: 'string', example: 'server.js' },
          workingDir: { type: 'string', example: 'e:/LPUCODETHON/resilify/sample-app' },
          scaling: {
            type: 'object',
            properties: {
              minInstances: { type: 'integer', default: 1 },
              maxInstances: { type: 'integer', default: 4 },
            },
          },
        },
      },
      ProjectUpdateInput: {
        type: 'object',
        properties: {
          scaling: { type: 'object' },
          health: { type: 'object' },
        },
      },
      Instance: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', example: 'inst-student-portal-1-a8f2' },
          projectName: { type: 'string', example: 'student-portal' },
          port: { type: 'integer', example: 5001 },
          pid: { type: 'integer', example: 14220 },
          status: { type: 'string', enum: ['STARTING', 'HEALTHY', 'UNHEALTHY', 'DRAINING', 'STOPPED', 'FAILED'], example: 'HEALTHY' },
          version: { type: 'integer', example: 1 },
          metrics: {
            type: 'object',
            properties: {
              cpu: { type: 'number', example: 0.8 },
              memory: { type: 'number', example: 42.5 },
              rps: { type: 'number', example: 12.4 },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          projectName: { type: 'string', example: 'student-portal' },
          type: { type: 'string', example: 'INSTANCE_CRASHED' },
          message: { type: 'string', example: 'Instance inst-student-portal-1-a8f2 crashed with code 1' },
          instanceId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
