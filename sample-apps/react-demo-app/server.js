const http = require('http');
const os = require('os');

const PORT = parseInt(process.env.PORT || '3000', 10);
const startTime = Date.now();
let requestCount = 0;

function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Sample App - Resilify</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background: #0b0f19; color: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .app-card { background: #111827; border: 1px solid #1f2937; border-radius: 20px; max-width: 520px; width: 100%; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); margin-bottom: 16px; }
    .title { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: #fff; }
    .subtitle { font-size: 14px; color: #9ca3af; margin-bottom: 24px; line-height: 1.5; }
    .node-box { background: rgba(15,23,42,0.8); border: 1px solid #1e293b; border-radius: 12px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #38bdf8; margin-bottom: 20px; }
    .btn-row { display: flex; gap: 10px; margin-bottom: 20px; }
    .btn { flex: 1; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform 0.1s; }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-secondary { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; }
    .api-box { background: #090d16; border: 1px solid #1f2937; border-radius: 10px; padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #10b981; max-height: 140px; overflow-y: auto; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel">
    const { useState, useEffect } = React;

    function App() {
      const [count, setCount] = useState(0);
      const [apiResponse, setApiResponse] = useState(null);
      const [loading, setLoading] = useState(false);

      const basePath = window.location.pathname.replace(/\\/+$/, '');

      const fetchApi = async () => {
        setLoading(true);
        try {
          const res = await fetch(basePath + '/api/data');
          const data = await res.json();
          setApiResponse(data);
        } catch (e) {
          setApiResponse({ error: e.message });
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        fetchApi();
      }, []);

      return (
        <div className="app-card">
          <div className="badge">⚛️ React 18 Application</div>
          <h1 className="title">React Sample Project</h1>
          <p className="subtitle">
            Successfully deployed and managed by the <strong>Resilify Orchestrator</strong>.
          </p>

          <div className="node-box">
            <div>🟢 Node Status: HEALTHY</div>
            <div>⚡ Serving Port: :${PORT}</div>
            <div>🆔 Process PID: ${process.pid}</div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6 }}>Interactive React State Counter</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', fontFamily: 'JetBrains Mono' }}>{count}</div>
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => setCount(c => c + 1)}>+ Increment State</button>
            <button className="btn btn-secondary" onClick={() => setCount(0)}>Reset Counter</button>
          </div>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>Dynamic Backend API Test</span>
            <button
              onClick={fetchApi}
              style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}
            >
              {loading ? 'Refreshing…' : '↺ Ping API'}
            </button>
          </div>

          <div className="api-box">
            {apiResponse ? JSON.stringify(apiResponse, null, 2) : 'Loading API response…'}
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  requestCount++;
  const url = req.url;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint (Required by Resilify)
  if (url === '/health' || url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      app: 'react-sample-app',
      pid: process.pid,
      port: PORT,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      requests: requestCount,
    }));
    return;
  }

  // API endpoint
  if (url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Hello from React Sample API!',
      pid: process.pid,
      port: PORT,
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
      requestsHandled: requestCount,
    }));
    return;
  }

  // Default: Serve React App HTML
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(getHtml());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[React Sample App] Running on port ${PORT} (PID: ${process.pid})`);
});

process.on('SIGTERM', () => {
  console.log(`[React Sample App] SIGTERM received on port ${PORT}`);
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
