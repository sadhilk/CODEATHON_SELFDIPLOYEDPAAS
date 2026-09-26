const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'resilify-cluster-jwt-secret-key-2026';

// ── LAN IP Helper ─────────────────────────────────────────────────────────────
function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('169.254.')) {
          return net.address;
        }
        candidates.push(net.address);
      }
    }
  }
  return candidates[0] || 'localhost';
}

const LAN_IP = getLanIp();

// ── Shared User Storage ───────────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'portal_users.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
  }
}

function loadUsers() {
  ensureDataDir();
  if (fs.existsSync(USERS_FILE)) {
    try {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error('[Student Portal] Error reading users file:', e.message);
    }
  }

  // Pre-seed default student account
  const defaultSalt = bcrypt.genSaltSync(10);
  const defaultHash = bcrypt.hashSync('password123', defaultSalt);
  const initialUsers = {
    'student@resilify.edu': {
      id: 'stu-demo-001',
      email: 'student@resilify.edu',
      passwordHash: defaultHash,
      name: 'Alex Rivera',
      studentId: 'STU-2026-9481',
      major: 'Distributed Systems & Cloud Computing',
      gpa: '3.85',
      term: 'Spring 2026',
      role: 'student',
      createdAt: new Date().toISOString(),
    },
  };

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf8');
  } catch (e) {
    console.error('[Student Portal] Could not save initial users file:', e.message);
  }

  return initialUsers;
}

function saveUsers(users) {
  ensureDataDir();
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('[Student Portal] Error saving users file:', e.message);
  }
}

// Initialize users store
let usersDb = loadUsers();

// ── JWT Helper ────────────────────────────────────────────────────────────────
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      studentId: user.studentId,
      major: user.major,
      gpa: user.gpa,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function verifyAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// ── Request Body Parser Helper ────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({ raw: body });
      }
    });
    req.on('error', () => resolve({}));
  });
}

// ── Metrics Tracking ──────────────────────────────────────────────────────────
let requestCount = 0;
const startTime = Date.now();

// ── HTML Web App (Responsive Student Portal) ──────────────────────────────────
function getHtmlApp() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Resilify Student Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --card-hover: #1e293b;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --primary-glow: rgba(59, 130, 246, 0.25);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.2);
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
    body { background-color: var(--bg-dark); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }

    /* Top Bar */
    header {
      background: rgba(17, 24, 39, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; letter-spacing: -0.02em; }
    .brand-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px var(--primary-glow);
    }
    .user-pill {
      display: flex; align-items: center; gap: 8px;
      background: rgba(31, 41, 55, 0.6);
      border: 1px solid var(--card-border);
      padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 600;
    }
    .avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 11px; }

    /* Main Container */
    main { flex: 1; max-width: 900px; width: 100%; margin: 0 auto; padding: 16px; }

    /* Card styling */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }

    /* Node Status Banner */
    .node-banner {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.05));
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .node-pulse {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      margin-right: 6px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

    /* Student Profile Header */
    .profile-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .stat-box {
      background: rgba(31, 41, 55, 0.5);
      border: 1px solid rgba(55, 65, 81, 0.5);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; }
    .stat-val { font-size: 15px; font-weight: 700; color: #fff; margin-top: 3px; }

    /* Button Group */
    .btn-group {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 16px;
    }
    .btn {
      appearance: none; border: none; outline: none; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 14px 8px;
      border-radius: 12px;
      font-weight: 700;
      transition: all 0.15s ease;
      touch-action: manipulation;
    }
    .btn:active { transform: scale(0.97); }
    .btn-sub { font-size: 11px; font-weight: 500; opacity: 0.8; margin-top: 4px; }

    .btn-req-1 {
      background: linear-gradient(135deg, #1e293b, #334155);
      color: #93c5fd;
      border: 1px solid #475569;
    }
    .btn-req-10 {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      box-shadow: 0 4px 14px var(--primary-glow);
    }
    .btn-req-50 {
      background: linear-gradient(135deg, #7c3aed, #6d28d9);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
    }
    .btn:disabled { opacity: 0.5; pointer-events: none; }

    /* Progress bar */
    .progress-bar-wrap {
      height: 6px;
      background: #1f2937;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 12px;
      display: none;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #10b981);
      width: 0%;
      transition: width 0.1s ease;
    }

    /* Live Telemetry */
    .telemetry-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 10px;
      margin-top: 16px;
    }
    .tel-card {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px;
      text-align: center;
    }
    .tel-num { font-size: 20px; font-weight: 800; color: #fff; font-family: 'JetBrains Mono', monospace; }
    .tel-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    /* Instance Distribution */
    .dist-container { margin-top: 16px; }
    .dist-row { margin-bottom: 10px; }
    .dist-info { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .dist-bar-wrap { height: 10px; background: #1f2937; border-radius: 5px; overflow: hidden; }
    .dist-bar-fill { height: 100%; border-radius: 5px; transition: width 0.3s ease; }

    /* Stream log */
    .log-box {
      max-height: 220px;
      overflow-y: auto;
      background: #090d16;
      border: 1px solid #1f2937;
      border-radius: 10px;
      padding: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .log-item {
      display: flex;
      justify-content: space-between;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.02);
    }
    .log-ok { color: var(--success); }
    .log-err { color: var(--danger); }

    /* Auth Form Styles */
    .auth-wrap {
      max-width: 420px;
      margin: 40px auto;
      padding: 24px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    }
    .input-grp { margin-bottom: 14px; text-align: left; }
    .input-grp label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
    .input-grp input {
      width: 100%; padding: 12px 14px;
      background: #0d131f; border: 1px solid #1f2937;
      border-radius: 10px; color: #fff; font-size: 14px;
      outline: none; transition: border-color 0.2s;
    }
    .input-grp input:focus { border-color: var(--primary); }

    .submit-btn {
      width: 100%; padding: 14px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff; border: none; border-radius: 12px;
      font-size: 15px; font-weight: 700; cursor: pointer;
      margin-top: 10px; box-shadow: 0 4px 14px var(--primary-glow);
    }
    .quick-btn {
      width: 100%; padding: 12px;
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px; font-size: 13px; font-weight: 600;
      cursor: pointer; margin-bottom: 16px;
    }

    .badge-pill {
      display: inline-flex; align-items: center; gap: 5px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.25);
      color: #93c5fd; font-size: 11px; font-weight: 600;
      padding: 3px 8px; border-radius: 6px;
    }

    .hidden { display: none !important; }
  </style>
</head>
<body>

  <!-- Top Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">🎓</div>
      <span>Resilify Portal</span>
    </div>
    <div id="headerUser" class="user-pill hidden">
      <div class="avatar" id="avatarLetter">A</div>
      <span id="headerName">Alex</span>
      <button onclick="logout()" style="background:none;border:none;color:#9ca3af;margin-left:6px;cursor:pointer;font-size:12px;">Sign Out</button>
    </div>
    <div id="headerGuest" class="badge-pill">
      🔒 bcrypt + JWT
    </div>
  </header>

  <main>
    <!-- LOGIN / REGISTER VIEW -->
    <div id="authSection" class="auth-wrap">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 38px; margin-bottom: 8px;">🎓</div>
        <h2 style="font-size: 20px; font-weight: 800;" id="authTitle">Student Portal Login</h2>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Sign in to access distributed cluster services</p>
      </div>

      <!-- Quick 1-Click Demo Login -->
      <button type="button" class="quick-btn" onclick="demoLogin()">
        ⚡ 1-Click Demo Login (Alex Rivera)
      </button>

      <form id="authForm" onsubmit="handleAuthSubmit(event)">
        <div id="registerFields" class="hidden">
          <div class="input-grp">
            <label>Full Name</label>
            <input type="text" id="regName" placeholder="e.g. Jordan Smith">
          </div>
          <div class="input-grp">
            <label>Student ID</label>
            <input type="text" id="regId" placeholder="e.g. STU-2026-1029">
          </div>
          <div class="input-grp">
            <label>Major / Course</label>
            <input type="text" id="regMajor" placeholder="e.g. Computer Science">
          </div>
        </div>

        <div class="input-grp">
          <label>Email Address</label>
          <input type="email" id="authEmail" required value="student@resilify.edu" placeholder="student@resilify.edu">
        </div>

        <div class="input-grp">
          <label>Password (bcrypt encrypted)</label>
          <input type="password" id="authPass" required value="password123" placeholder="••••••••">
        </div>

        <button type="submit" class="submit-btn" id="authSubmitBtn">Sign In with JWT</button>

        <div style="text-align: center; margin-top: 16px;">
          <a href="#" id="authToggleLink" onclick="toggleAuthMode(event)" style="color: var(--primary); font-size: 13px; text-decoration: none;">
            New student? Create an account
          </a>
        </div>
      </form>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--card-border); font-size: 11px; color: var(--text-dim); text-align: center;">
        📱 LAN Connected: <span id="loginLanIp">${LAN_IP}</span> • Port :${PORT}
      </div>
    </div>

    <!-- AUTHENTICATED DASHBOARD VIEW -->
    <div id="portalSection" class="hidden">

      <!-- Real Cluster Node Banner -->
      <div class="node-banner">
        <div>
          <span class="node-pulse"></span>
          <strong>Served by Worker Node:</strong>
          <span style="font-family:'JetBrains Mono',monospace;color:#93c5fd;font-weight:700;">:${PORT}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:4px;">(PID: ${process.pid})</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge-pill">Gateway Routed</span>
          <span class="badge-pill" style="color:var(--success);border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.1);">LAN: ${LAN_IP}</span>
        </div>
      </div>

      <!-- Student Profile Card -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
          <div>
            <h2 style="font-size: 19px; font-weight: 800;" id="profName">Alex Rivera</h2>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;" id="profId">STU-2026-9481 • Active Enrolled</div>
          </div>
          <span class="badge-pill" style="color:#a78bfa;border-color:rgba(167,139,250,0.3);background:rgba(167,139,250,0.1);">
            JWT Session Active
          </span>
        </div>

        <div class="profile-grid">
          <div class="stat-box">
            <div class="stat-label">Major</div>
            <div class="stat-val" style="font-size:13px;" id="profMajor">Distributed Sys.</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">GPA</div>
            <div class="stat-val" style="color:var(--success);" id="profGpa">3.85</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Term</div>
            <div class="stat-val" style="font-size:13px;">Spring 2026</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Auth</div>
            <div class="stat-val" style="font-size:13px;color:#60a5fa;">bcrypt + JWT</div>
          </div>
        </div>
      </div>

      <!-- Request Triggers (1 Req, 10 Req, 50 Req) -->
      <div class="card">
        <h3 style="font-size: 16px; font-weight: 700;">⚡ Multi-Instance Load Balancer Tester</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
          Tap below to send real HTTP requests through the Gateway. Watch requests distribute across child instances in real time!
        </p>

        <div class="btn-group">
          <button type="button" class="btn btn-req-1" id="btnReq1" onclick="sendBurst(1)">
            <span style="font-size:16px;">1 Req</span>
            <span class="btn-sub">Single Probe</span>
          </button>
          <button type="button" class="btn btn-req-10" id="btnReq10" onclick="sendBurst(10)">
            <span style="font-size:16px;">10 Req</span>
            <span class="btn-sub">Spread Burst</span>
          </button>
          <button type="button" class="btn btn-req-50" id="btnReq50" onclick="sendBurst(50)">
            <span style="font-size:16px;">50 Req</span>
            <span class="btn-sub">Scale Surge</span>
          </button>
        </div>

        <div class="progress-bar-wrap" id="progWrap">
          <div class="progress-bar-fill" id="progFill"></div>
        </div>

        <!-- Real-Time Request Telemetry -->
        <div class="telemetry-row">
          <div class="tel-card">
            <div class="tel-num" id="telTotal">0</div>
            <div class="tel-lbl">Total Requests</div>
          </div>
          <div class="tel-card">
            <div class="tel-num" style="color:var(--success);" id="telSuccess">0</div>
            <div class="tel-lbl">200 OK</div>
          </div>
          <div class="tel-card">
            <div class="tel-num" style="color:#60a5fa;" id="telLatency">0ms</div>
            <div class="tel-lbl">Avg Latency</div>
          </div>
          <div class="tel-card">
            <div class="tel-num" style="color:#a78bfa;" id="telNodes">0</div>
            <div class="tel-lbl">Nodes Hit</div>
          </div>
        </div>

        <!-- Instance Distribution Breakdown -->
        <div class="dist-container">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:13px;font-weight:700;color:var(--text);">Worker Node Traffic Share</span>
            <button onclick="resetStats()" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;">Reset Stats</button>
          </div>
          <div id="distBars">
            <div style="font-size:12px;color:var(--text-dim);text-align:center;padding:12px;">
              No requests sent yet. Click 1, 10, or 50 Req to see load balancing!
            </div>
          </div>
        </div>
      </div>

      <!-- Live Stream Activity Log -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="font-size: 15px; font-weight: 700;">📡 Live Response Log</h3>
          <span style="font-size:11px;color:var(--text-dim);" id="logCount">0 entries</span>
        </div>
        <div class="log-box" id="logBox">
          <div style="color:var(--text-dim);text-align:center;padding:12px;">Responses will appear here live...</div>
        </div>
      </div>

    </div>
  </main>

  <script>
    // Automatically detect basePath whether accessed at / or /apps/student-portal/
    const rawPath = window.location.pathname;
    const basePath = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;

    let authToken = localStorage.getItem('resilify_token');
    let currentUser = null;
    let isRegisterMode = false;

    // Telemetry state
    let totalSent = 0;
    let totalSuccess = 0;
    let latencySamples = [];
    const instanceCounts = {}; // instancePort -> count

    const colors = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4'];

    function toggleAuthMode(e) {
      if (e) e.preventDefault();
      isRegisterMode = !isRegisterMode;
      document.getElementById('registerFields').classList.toggle('hidden', !isRegisterMode);
      document.getElementById('authTitle').innerText = isRegisterMode ? 'Create Student Account' : 'Student Portal Login';
      document.getElementById('authSubmitBtn').innerText = isRegisterMode ? 'Create Account with bcrypt' : 'Sign In with JWT';
      document.getElementById('authToggleLink').innerText = isRegisterMode ? 'Already enrolled? Sign In' : 'New student? Create an account';
    }

    function demoLogin() {
      document.getElementById('authEmail').value = 'student@resilify.edu';
      document.getElementById('authPass').value = 'password123';
      if (isRegisterMode) toggleAuthMode();
      handleAuthSubmit(new Event('submit'));
    }

    async function handleAuthSubmit(e) {
      if (e && e.preventDefault) e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPass').value.trim();

      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
      const payload = { email, password };
      if (isRegisterMode) {
        payload.name = document.getElementById('regName').value.trim() || 'New Student';
        payload.studentId = document.getElementById('regId').value.trim() || 'STU-' + Math.floor(1000 + Math.random() * 9000);
        payload.major = document.getElementById('regMajor').value.trim() || 'Computer Science';
      }

      try {
        const res = await fetch(basePath + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          alert('Auth error: ' + (data.error || 'Authentication failed'));
          return;
        }

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('resilify_token', authToken);
        localStorage.setItem('resilify_user', JSON.stringify(currentUser));
        showDashboard();
      } catch (err) {
        alert('Network/Server error: ' + err.message);
      }
    }

    function showDashboard() {
      if (!currentUser) {
        try { currentUser = JSON.parse(localStorage.getItem('resilify_user')); } catch (e) {}
      }
      if (currentUser) {
        document.getElementById('profName').innerText = currentUser.name || 'Alex Rivera';
        document.getElementById('headerName').innerText = (currentUser.name || 'Alex').split(' ')[0];
        document.getElementById('avatarLetter').innerText = (currentUser.name || 'A')[0].toUpperCase();
        document.getElementById('profId').innerText = (currentUser.studentId || 'STU-2026-9481') + ' • Active Enrolled';
        document.getElementById('profMajor').innerText = currentUser.major || 'Distributed Sys.';
        document.getElementById('profGpa').innerText = currentUser.gpa || '3.85';
      }

      document.getElementById('authSection').classList.add('hidden');
      document.getElementById('portalSection').classList.remove('hidden');
      document.getElementById('headerUser').classList.remove('hidden');
      document.getElementById('headerGuest').classList.add('hidden');
    }

    function logout() {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('resilify_token');
      localStorage.removeItem('resilify_user');
      document.getElementById('authSection').classList.remove('hidden');
      document.getElementById('portalSection').classList.add('hidden');
      document.getElementById('headerUser').classList.add('hidden');
      document.getElementById('headerGuest').classList.remove('hidden');
    }

    // Auto-login if token saved
    if (authToken) {
      showDashboard();
    }

    // Send Burst Requests
    async function sendBurst(count) {
      const btns = [document.getElementById('btnReq1'), document.getElementById('btnReq10'), document.getElementById('btnReq50')];
      btns.forEach(b => b.disabled = true);

      const progWrap = document.getElementById('progWrap');
      const progFill = document.getElementById('progFill');
      progWrap.style.display = 'block';
      progFill.style.width = '0%';

      let completed = 0;
      const promises = [];

      for (let i = 0; i < count; i++) {
        promises.push((async (idx) => {
          const t0 = performance.now();
          try {
            const res = await fetch(basePath + '/api/portal/action', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
              },
              body: JSON.stringify({ reqIndex: idx + 1, timestamp: Date.now() })
            });

            const latency = Math.round(performance.now() - t0);
            const data = await res.json().catch(() => ({}));

            const port = res.headers.get('x-resilify-port') || data.port || '${PORT}';
            const pid = res.headers.get('x-resilify-pid') || data.pid || '${process.pid}';

            completed++;
            progFill.style.width = Math.round((completed / count) * 100) + '%';

            return {
              ok: res.ok,
              status: res.status,
              latency,
              port,
              pid,
              time: new Date().toLocaleTimeString().split(' ')[0]
            };
          } catch (e) {
            completed++;
            progFill.style.width = Math.round((completed / count) * 100) + '%';
            return {
              ok: false,
              status: 0,
              latency: Math.round(performance.now() - t0),
              port: 'ERR',
              pid: '—',
              time: new Date().toLocaleTimeString().split(' ')[0]
            };
          }
        })(i));
      }

      const results = await Promise.all(promises);

      // Process results
      for (const r of results) {
        totalSent++;
        if (r.ok) {
          totalSuccess++;
          instanceCounts[r.port] = (instanceCounts[r.port] || 0) + 1;
        }
        latencySamples.push(r.latency);
        if (latencySamples.length > 50) latencySamples.shift();
        appendLog(r);
      }

      updateTelemetry();
      updateDistBars();

      setTimeout(() => {
        progWrap.style.display = 'none';
        btns.forEach(b => b.disabled = false);
      }, 300);
    }

    function updateTelemetry() {
      document.getElementById('telTotal').innerText = totalSent;
      document.getElementById('telSuccess').innerText = totalSuccess;
      const avgLat = latencySamples.length > 0
        ? Math.round(latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length)
        : 0;
      document.getElementById('telLatency').innerText = avgLat + 'ms';
      document.getElementById('telNodes').innerText = Object.keys(instanceCounts).length;
    }

    function updateDistBars() {
      const container = document.getElementById('distBars');
      const ports = Object.keys(instanceCounts);
      if (ports.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:12px;">No requests sent yet. Click 1, 10, or 50 Req to see load balancing!</div>';
        return;
      }

      let totalPortRequests = ports.reduce((sum, p) => sum + instanceCounts[p], 0) || 1;
      let html = '';

      ports.forEach((p, idx) => {
        const count = instanceCounts[p];
        const pct = Math.round((count / totalPortRequests) * 100);
        const col = colors[idx % colors.length];

        html += \`
          <div class="dist-row">
            <div class="dist-info">
              <span><strong style="color:\${col}">Worker :\${p}</strong></span>
              <span style="font-family:'JetBrains Mono',monospace;">\${count} reqs (\${pct}%)</span>
            </div>
            <div class="dist-bar-wrap">
              <div class="dist-bar-fill" style="width:\${pct}%;background:\${col};"></div>
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;
    }

    function appendLog(item) {
      const box = document.getElementById('logBox');
      if (box.children.length === 1 && box.children[0].innerText.includes('Responses will appear')) {
        box.innerHTML = '';
      }

      const row = document.createElement('div');
      row.className = 'log-item';
      const statusClass = item.ok ? 'log-ok' : 'log-err';
      const statusText = item.status === 200 ? '200 OK' : (item.status === 429 ? '429 RateLimit' : 'ERR');

      row.innerHTML = \`
        <span><strong class="\${statusClass}">\${statusText}</strong> &bull; :\${item.port} (PID \${item.pid})</span>
        <span style="color:var(--text-muted);">\${item.latency}ms &bull; \${item.time}</span>
      \`;

      box.insertBefore(row, box.firstChild);
      while (box.children.length > 25) {
        box.removeChild(box.lastChild);
      }

      document.getElementById('logCount').innerText = box.children.length + ' entries';
    }

    function resetStats() {
      totalSent = 0;
      totalSuccess = 0;
      latencySamples = [];
      for (const k in instanceCounts) delete instanceCounts[k];
      updateTelemetry();
      updateDistBars();
      document.getElementById('logBox').innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:12px;">Responses will appear here live...</div>';
      document.getElementById('logCount').innerText = '0 entries';
    }
  </script>
</body>
</html>`;
}

// ── HTTP Request Router ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  requestCount++;
  const url = req.url;
  const method = req.method;

  // Global CORS and Expose Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'X-Served-By, X-Resilify-Instance, X-Resilify-Port, X-Resilify-Pid');
  res.setHeader('X-Served-By', `Instance :${PORT} (PID ${process.pid})`);

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint (for Resilify healthMonitor)
  if (url === '/health' || url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      pid: process.pid,
      port: PORT,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      requests: requestCount,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    }));
    return;
  }

  // System info endpoint
  if (url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      pid: process.pid,
      port: PORT,
      lanIp: LAN_IP,
      serverTime: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
    }));
    return;
  }

  // ── Auth: Register (bcrypt) ─────────────────────────────────────────────────
  if (url === '/api/auth/register' && method === 'POST') {
    const body = await parseBody(req);
    const { email, password, name, studentId, major } = body;

    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email and password are required' }));
      return;
    }

    const emailKey = email.toLowerCase().trim();
    usersDb = loadUsers(); // reload to get latest across workers

    if (usersDb[emailKey]) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Student email is already registered' }));
      return;
    }

    // Hash password with bcrypt
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = {
      id: 'stu-' + Date.now(),
      email: emailKey,
      passwordHash,
      name: name || 'Student User',
      studentId: studentId || 'STU-' + Math.floor(1000 + Math.random() * 9000),
      major: major || 'Computer Science',
      gpa: '3.90',
      term: 'Spring 2026',
      role: 'student',
      createdAt: new Date().toISOString(),
    };

    usersDb[emailKey] = newUser;
    saveUsers(usersDb);

    const token = generateToken(newUser);
    const { passwordHash: _, ...userSafe } = newUser;

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Registration successful', token, user: userSafe }));
    return;
  }

  // ── Auth: Login (bcrypt + JWT) ──────────────────────────────────────────────
  if (url === '/api/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const { email, password } = body;

    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email and password are required' }));
      return;
    }

    usersDb = loadUsers();
    const emailKey = email.toLowerCase().trim();
    const user = usersDb[emailKey];

    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid student email or password' }));
      return;
    }

    // Verify password with bcrypt
    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid student email or password' }));
      return;
    }

    const token = generateToken(user);
    const { passwordHash: _, ...userSafe } = user;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Login successful', token, user: userSafe }));
    return;
  }

  // ── Auth: Get current student profile (JWT required) ────────────────────────
  if (url === '/api/auth/me' && method === 'GET') {
    const decoded = verifyAuth(req);
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: valid JWT token required' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user: decoded,
      servedBy: { pid: process.pid, port: PORT },
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // ── Portal Action (Authenticated API endpoint for 1, 10, 50 req tests) ──────
  if (url === '/api/portal/action' && method === 'POST') {
    const decoded = verifyAuth(req);
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: valid JWT token required' }));
      return;
    }

    const body = await parseBody(req);

    // Light compute simulation
    let hashCalc = 0;
    for (let i = 0; i < 200; i++) {
      hashCalc += (i * 13) % 7;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Action processed successfully by student ${decoded.name}`,
      reqIndex: body.reqIndex || 1,
      pid: process.pid,
      port: PORT,
      timestamp: new Date().toISOString(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    }));
    return;
  }

  // ── Legacy API endpoints ────────────────────────────────────────────────────
  if (url === '/api/students') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      pid: process.pid,
      students: [
        { id: 1, name: 'Alice Rivera', grade: 'A', course: 'Distributed Systems' },
        { id: 2, name: 'Bob Chen', grade: 'B+', course: 'Cloud Computing' },
        { id: 3, name: 'Carol Danvers', grade: 'A+', course: 'Fault Tolerance' },
      ],
      servedBy: `Instance on port ${PORT}`,
    }));
    return;
  }

  // ── Default: Serve Web Application UI ───────────────────────────────────────
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getHtmlApp());
});

// ── Start listening on 0.0.0.0 (all interfaces for LAN & phone access) ────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Student Portal] Running on port ${PORT} (PID: ${process.pid})`);
  console.log(`[Student Portal] LAN Access: http://${LAN_IP}:${PORT}/`);
});

// ── Graceful shutdown handlers ────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log(`[Student Portal] SIGTERM received on port ${PORT}, shutting down`);
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
