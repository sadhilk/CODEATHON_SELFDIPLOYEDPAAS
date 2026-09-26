# Resilify 🛡️

> **Self-hosted, zero-simulation application orchestrator and resilience platform**  
> Built for the LPU Codeathon — demonstrating Kubernetes-like orchestration without Kubernetes.

[![GitHub](https://img.shields.io/badge/GitHub-CODEATHON__SELFDEPLOYEDPAAS-blue?logo=github)](https://github.com/sadhilk/CODEATHON_SELFDIPLOYEDPAAS)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](./docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen?logo=node.js)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb)](https://mongodb.com)

Resilify deploys Node.js and web applications as real OS child processes, load balances traffic, auto-scales under real demand, detects instance crashes with zero-downtime failover, and visualizes every event live on a React control-plane dashboard.

---

## 🌟 Table of Contents
1. [Why Resilify?](#why-resilify)
2. [System Architecture](#system-architecture)
3. [Key Features](#key-features)
4. [🐳 Docker Quick Start (Recommended)](#-docker-quick-start-recommended)
5. [Codebase Walkthrough](#codebase-walkthrough)
6. [Libraries & Dependencies Guide](#libraries--dependencies-guide)
7. [Getting Started (Local / Windows)](#getting-started--local-setup)
8. [Testing the Features (Step-by-Step)](#testing-the-features-step-by-step)
   - [Testing Student Portal (Auth, JWT, 1/10/50 Reqs, Phone LAN)](#1-testing-the-student-portal-with-phone--lan-access)
   - [Testing Adding & Removing the React Demo Project](#2-testing-adding--removing-the-react-demo-project)
   - [Testing Chaos Engineering in the Failure Lab](#3-testing-the-failure-lab-chaos-engineering)
   - [Testing Auto-Scaling](#4-testing-dynamic-auto-scaling)

---


## 💡 Why Resilify?

Solo developers, students, and hackathon teams rarely have access to or time to master complex cloud infrastructure (like Kubernetes, AWS ECS, or Consul). 

Resilify provides **core high-availability and site reliability engineering (SRE) concepts** inside a lightweight, self-hosted framework:
- **No Mocking or Simulations**: Every worker instance is an actual Node.js process (`process.pid`) with dedicated memory and ports.
- **Real Reverse Proxy & Load Balancer**: All requests flow through a gateway proxy that streams traffic, tracks latency percentiles, and balances load.
- **Real Process Termination**: Clicking "Kill" executes `process.kill('SIGKILL')` on the operating system process.
- **Cross-Device Mobile Accessibility**: Binds to `0.0.0.0` so you can connect from your phone over Wi-Fi and watch your requests load-balance across backend workers on your computer in real time.

---

## 🏛️ System Architecture

```
                                  ┌────────────────────────────────────────┐
                                  │      Client (Browser / Mobile Phone)   │
                                  └───────────────────┬────────────────────┘
                                                      │ HTTP / LAN (0.0.0.0)
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  RESILIFY CONTROL PLANE & API GATEWAY (Port 4000)                                            │
│                                                                                              │
│   ┌───────────────────────────┐      ┌───────────────────────────┐      ┌─────────────────┐ │
│   │   Token Rate Limiter      │ ───► │  HTTP Reverse Proxy / LB  │ ───► │ Health Monitor  │ │
│   │   (Leaky / Token Bucket)  │      │  (Round Robin / LeastCon) │      │ (Pings /health) │ │
│   └───────────────────────────┘      └─────────────┬─────────────┘      └────────┬────────┘ │
│                                                    │                             │          │
│   ┌───────────────────────────┐                    │                             │          │
│   │    Auto-Scaling Engine    │ ◄──────────────────┼─────────────────────────────┘          │
│   │  (Evaluates rolling RPS)  │                    │                                        │
│   └─────────────┬─────────────┘                    │                                        │
└─────────────────┼──────────────────────────────────┼────────────────────────────────────────┘
                  │ Spawns / Terminates              │ Proxies Request
                  ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  WORKER INSTANCES (Real OS Child Processes via child_process.fork)                           │
│                                                                                              │
│   ┌────────────────────────────┐    ┌────────────────────────────┐    ┌────────────────────┐ │
│   │ Worker Node :5001          │    │ Worker Node :5002          │    │ Worker Node :5003  │ │
│   │ PID: 12480 · /health · API │    │ PID: 19412 · /health · API │    │ PID: 21088 · ...   │ │
│   └────────────────────────────┘    └────────────────────────────┘    └────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                  ▲                                  ▲
                  │ Metrics & Process State          │ Push Events (WebSockets)
                  │                                  │
┌─────────────────┴───────────────────────┐   ┌──────┴─────────────────────────────────────────┐
│ MongoDB Database (Port 27017)           │   │ React Control Plane Dashboard (Port 3001)      │
│ - Projects, Instances, Events, Metrics  │   │ - Live Topology, Chaos Lab, Metrics, Load Gen  │
└─────────────────────────────────────────┘   └────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 1. Zero-Simulation Process Orchestration
Applications run as independent operating system child processes spawned using Node's `child_process.fork()`. Resilify assigns dynamic local ports (`:5001`, `:5002`, ...), sets environment variables, records child PIDs, and continuously tracks per-process CPU percentage and memory consumption via `pidusage`.

### 2. High-Availability API Gateway & Load Balancing
All traffic enters through `http://<host>:4000/apps/<projectName>/*`:
- **Load Balancing Algorithms**: Round Robin, Least Connections, and IP Hash.
- **Request Streaming**: Transparently proxies HTTP methods, headers, and JSON request bodies.
- **Instance Telemetry Injection**: Automatically stamps each response with `X-Served-By`, `X-Resilify-Instance`, `X-Resilify-Port`, and `X-Resilify-Pid`.

### 3. Traffic-Driven Auto-Scaling
Powered by an asynchronous evaluation loop:
- Measures rolling requests per second (RPS) entering the gateway.
- Automatically calculates target instances (`Math.ceil(RPS / 10)`).
- Spawns up to **20 instances** during traffic surges.
- Automatically scales down excess instances once traffic drops (with a 3-second responsive cooldown).

### 4. Self-Healing & Instant Failover
- Background health monitor pings the `/health` endpoint of every child instance every 2–3 seconds.
- If a process fails or is killed, it is immediately marked `FAILED` and removed from the Gateway routing pool within seconds—ensuring incoming traffic experiences zero downtime.
- The engine automatically provisions replacement instances to satisfy the project's `minInstances` policy.

### 5. Chaos Engineering ("Failure Lab")
An interactive chaos testing suite directly inside the dashboard:
- **SIGKILL Real Processes**: Send an OS kill signal to individual workers.
- **Instance Draining**: Gracefully drain traffic from an instance before stopping it.
- **Instant Traffic Surges**: Benchmark scaling behavior with 1-click load presets.

### 6. Multi-Project Management
- **Add Projects**: Register any Node.js application by specifying its working directory and entry file.
- **Deploy / Redeploy**: Spin up fresh instance pools with atomic version upgrades.
- **Stop**: Gracefully kill all worker instances.
- **Remove / Delete**: Completely stop all child processes, purge MongoDB instance documents and event logs, and release reserved ports.

### 7. Student Portal with bcrypt & JWT Auth
Included demo application showcasing enterprise security patterns:
- **Password Hashing**: Passwords encrypted with `bcryptjs` using 10 salt rounds.
- **JWT Authentication**: Authenticated sessions signed with `jsonwebtoken` (24h lifespan).
- **1-Click Demo Login**: Pre-seeded student account (`student@resilify.edu` / `password123`).
- **Interactive Burst Triggers**: Includes **1 Req**, **10 Req**, and **50 Req** buttons.
- **Real-Time Worker Traffic Share**: Colored progress bars visually display which worker instances served each request.

### 8. LAN & Mobile Cross-Device Connectivity
All servers bind to `0.0.0.0` (all IPv4 network interfaces). Open the Student Portal or Dashboard directly on your smartphone (connected to the same Wi-Fi) by navigating to your PC's LAN IP address.

---

## 🐳 Docker Quick Start (Recommended)

The easiest way to run Resilify on **any machine** (Linux, macOS, Windows) — no MongoDB, no Node.js installation required.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### One-Command Launch

```bash
# Clone the repository
git clone https://github.com/sadhilk/CODEATHON_SELFDIPLOYEDPAAS.git
cd CODEATHON_SELFDIPLOYEDPAAS

# Build and start all services (MongoDB + Control Plane + Dashboard)
docker compose up --build
```

> First build takes ~2 minutes (downloads Node 20, nginx, Mongo 7 images). Subsequent starts are instant.

### What Starts

| Service | Container | URL |
| :--- | :--- | :--- |
| **MongoDB** | `resilify-mongo` | `mongodb://localhost:27017` |
| **Control Plane + Gateway** | `resilify-control-plane` | http://localhost:4000 |
| **React Dashboard** | `resilify-dashboard` | **http://localhost:3001** |
| **Student Portal** | (deployed from dashboard) | http://localhost:4000/apps/student-portal/ |

### Stop Everything
```bash
docker compose down
# To also delete saved data:
docker compose down -v
```

### Project Files Created

| File | Purpose |
| :--- | :--- |
| [`Dockerfile`](./Dockerfile) | Control Plane image (Node 20 Alpine + tini) |
| [`Dockerfile.dashboard`](./Dockerfile.dashboard) | Dashboard image (Vite build → nginx) |
| [`docker-compose.yml`](./docker-compose.yml) | Production compose (Mongo + API + Dashboard) |
| [`docker-compose.dev.yml`](./docker-compose.dev.yml) | Dev compose with source volume mounts |
| [`docker/nginx.conf`](./docker/nginx.conf) | nginx proxy config for `/api`, `/apps`, `/socket.io` |

---

## 📂 Codebase Walkthrough

```
resilify/
├── control-plane/             # Orchestrator, Gateway & Background Services
│   ├── server.js              # Express HTTP server, Socket.IO, Gateway router, Startup cleanup
│   └── src/
│       ├── models/            # Mongoose Schemas
│       │   ├── Project.js     # Project config, scaling limits, health check rules
│       │   ├── Instance.js    # Child process records (PID, Port, Status, CPU, Memory)
│       │   └── Event.js       # Audit log for scaling, crashes, deployments
│       ├── routes/            # REST API Handlers
│       │   ├── projects.js    # Create, Deploy, Stop, Delete, and Query projects
│       │   └── gateway.js     # Load balancer config, rate limit config, traffic reset
│       ├── services/          # Core Infrastructure Engines
│       │   ├── deploymentEngine.js  # Spawns Node child processes, port manager, kills
│       │   ├── loadBalancer.js      # Reverse proxy, round-robin, body stream forwarder
│       │   ├── autoScaler.js        # Evaluates RPS demand, triggers scale-up/down
│       │   ├── healthMonitor.js     # Background HTTP /health probe & recovery
│       │   └── rateLimiter.js       # Token-bucket rate limiting with burst allowances
│       └── utils/
│           └── processRegistry.js   # In-memory PID and port pool manager
│
├── dashboard/                 # React Control-Plane Dashboard (Vite SPA)
│   ├── src/
│   │   ├── api.js             # Axios client connecting to Control Plane REST API
│   │   ├── socket.js          # Socket.IO client for live metric streams
│   │   ├── pages/             # Dashboard Views
│   │   │   ├── OverviewPage.jsx     # Global status, availability, LAN network banner
│   │   │   ├── TopologyPage.jsx     # Visual interactive node graph of instances
│   │   │   ├── InstancesPage.jsx    # Live instance table with CPU/RAM and Kill/Revive
│   │   │   ├── ProjectsPage.jsx     # Add project modal, Deploy, Stop, Remove buttons
│   │   │   ├── FailureLabPage.jsx   # Chaos engineering controls (SIGKILL, Drain)
│   │   │   ├── LoadGenPage.jsx      # HTTP load generator with safe presets
│   │   │   ├── GatewayPage.jsx      # Load balancer algorithm & rate limiter settings
│   │   │   ├── MetricsPage.jsx      # Throughput, latency percentiles & system telemetry
│   │   │   ├── EventsPage.jsx       # Chronological audit log
│   │   │   └── DatabasePage.jsx     # MongoDB connection health monitor
│   │   └── components/              # Shared UI components, charts, modals
│   └── vite.config.js         # Configured with host: '0.0.0.0' for LAN access
│
├── sample-app/                # Student Portal Application (Active in cluster)
│   ├── server.js              # Complete Student Portal with bcrypt, JWT, and 1/10/50 Req UI
│   └── package.json           # Declares bcryptjs and jsonwebtoken
│
├── sample-apps/
│   ├── student-portal/        # Standalone backup copy of student-portal
│   └── react-demo-app/        # React 18 Sample Application (for testing project addition)
│       ├── server.js          # Node server with /health and interactive React 18 UI
│       └── package.json       # React demo package definition
│
├── data/
│   ├── db/                    # Local MongoDB storage directory
│   └── portal_users.json      # Shared persistent student user database
│
└── start.bat                  # One-click Windows startup script
```

---

## 📦 Libraries & Dependencies Guide

### Control Plane Backend
| Library | Purpose | Why It Was Chosen |
| :--- | :--- | :--- |
| **`express`** | HTTP Web Framework | Fast, minimalist routing engine for the control plane REST API and Gateway router. |
| **`mongoose`** | MongoDB ODM | Strongly-typed schemas for Projects, Instances, and Events with automatic query optimization. |
| **`socket.io`** | Real-Time WebSockets | Pushes live metrics (RPS, CPU, memory, active instances) to the React dashboard every second. |
| **`pidusage`** | Process Resource Telemetry | Queries OS-level CPU percentage and memory (RAM) usage for any child process PID. |
| **`cors`** | Cross-Origin Resource Sharing | Enables browsers on LAN and mobile devices to interact with the API without CORS blocks. |
| **`dotenv`** | Environment Configuration | Loads environment variables from `.env` files. |
| **`uuid`** | Unique Identifiers | Generates collision-free IDs for projects and child instances (`student-portal-08c01620`). |

### Student Portal & Sample Applications
| Library | Purpose | Why It Was Chosen |
| :--- | :--- | :--- |
| **`bcryptjs`** | Password Hashing | Pure JavaScript implementation of bcrypt. Provides military-grade password hashing with 0 native C++ build dependencies on Windows. |
| **`jsonwebtoken`** | JWT Authentication | Industry-standard stateless token generation and verification (`HMAC-SHA256`). |
| **`http` (Node Built-in)** | Native HTTP Server | High-performance, lightweight server handling requests, streaming proxying, and `/health` checks. |

### Dashboard Frontend
| Library | Purpose | Why It Was Chosen |
| :--- | :--- | :--- |
| **`react` & `react-dom`** | UI Framework | Component-based dynamic user interface for real-time monitoring and controls. |
| **`vite`** | Modern Frontend Tooling | Lightning-fast Hot Module Replacement (HMR) and optimized ES module bundling. |
| **`react-router-dom`** | Client Routing | Seamless SPA navigation between Overview, Topology, Projects, Failure Lab, and Gateway. |
| **`socket.io-client`** | WebSocket Client | Receives real-time metric updates from the control plane without polling. |
| **`recharts`** | Data Visualization | Renders smooth charts for latency distributions, throughput, and CPU usage. |
| **`lucide-react`** | Iconography | Clean, modern icons for navigation, status badges, and action buttons. |
| **`axios`** | HTTP Client | Promise-based HTTP client for calling control plane management endpoints. |

---

## ⚡ Getting Started & Local Setup

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **MongoDB** installed locally (or running on `mongodb://localhost:27017`)

### 1. One-Click Launch
Double-click [`start.bat`](file:///e:/LPUCODETHON/resilify/start.bat) or run from your terminal:
```powershell
.\start.bat
```
This automatically launches:
1. **MongoDB** on port `27017`
2. **Resilify Control Plane** on port `4000` (listening on `0.0.0.0`)
3. **Resilify Dashboard** on port `3001` (listening on `0.0.0.0`)

---

## 🧪 Testing the Features (Step-by-Step)

### 1. Testing the Student Portal (with Phone / LAN Access)
1. Open your browser on your computer:
   - **Student Portal:** `http://localhost:4000/apps/student-portal/`
2. **Test on your Smartphone (over Wi-Fi):**
   - Check the LAN IP address printed in your terminal (e.g. `10.145.57.131`).
   - Open your phone's browser and go to: `http://10.145.57.131:4000/apps/student-portal/`
3. **Log In:**
   - Tap **"⚡ 1-Click Demo Login"** (or use `student@resilify.edu` / `password123`).
   - Notice the status badge confirms **"JWT Session Active"** and **"Served by Worker Node"**.
4. **Trigger Requests:**
   - Tap **`10 Req`** or **`50 Req`**.
   - Watch the **Worker Node Traffic Share** progress bars fill up in real time, displaying the exact number of requests balanced across worker processes!

---

### 2. Testing Adding & Removing the React Demo Project
Resilify includes a dedicated standalone React app in `sample-apps/react-demo-app` to test project creation and deletion.

#### Adding the Project:
1. Open the Dashboard at **`http://localhost:3001`** and navigate to the **Projects** tab.
2. Click the **`+ New Project`** button in the top right.
3. In the modal, fill in:
   - **Project Name:** `react-demo`
   - **Working Directory:** `E:\LPUCODETHON\resilify\sample-apps\react-demo-app`
   - **Entry File:** `server.js`
   - **App Port:** `3000`
4. Click **`✓ Create Project`**.
5. Find the new `react-demo` card and click **`▶ Deploy`**.
6. Once healthy, open `http://localhost:4000/apps/react-demo/` to see the live React 18 application!

#### Removing the Project:
1. On the **Projects** page, locate the `react-demo` card.
2. Click the red **`🗑 Remove`** button.
3. Confirm the prompt: Resilify will automatically stop and kill all running child processes, delete instance records and event logs from MongoDB, release reserved ports, and remove the project from the dashboard.

---

### 3. Testing the Failure Lab (Chaos Engineering)
1. Go to the **Failure Lab** page in the Dashboard (`http://localhost:3001/failure-lab`).
2. Under **Instance Controls**, locate an active healthy instance.
3. Click **`⛔ Kill`**:
   - This sends an actual `SIGKILL` signal to the Node child process.
4. Watch the Dashboard mark the instance as `FAILED` within seconds.
5. Notice that incoming traffic to `http://localhost:4000/apps/student-portal/` continues uninterrupted because the Gateway immediately stopped routing to the killed process and failover took over.
6. The self-healing engine will automatically spawn a replacement instance to restore the configured minimum instances.

---

### 4. Testing Dynamic Auto-Scaling
1. Open the **Load Generator** page (`http://localhost:3001/load-gen`).
2. Click the **`50 RPS`** preset button.
3. Navigate to **Topology** (`http://localhost:3001/topology`) or **Instances**:
   - As traffic sustains, watch Resilify automatically fork new child processes (`:5002`, `:5003`, `:5004`, ...).
4. Return to the Load Generator and click **`⏹ Stop`**.
5. After the 3-second cooldown, watch excess instances cleanly shut down and return to the baseline count.

---

## 📜 License
MIT License. Built for high-availability demonstrations and self-hosted resilience.
