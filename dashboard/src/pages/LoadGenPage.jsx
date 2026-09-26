import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle, Spinner, formatNumber } from '../components/UI';
import * as api from '../api';

const PRESETS = [
  { label: '10 RPS',   rps: 10,   desc: '1 Instance',      icon: '🐢' },
  { label: '50 RPS',   rps: 50,   desc: '5 Instances',     icon: '🚶' },
  { label: '100 RPS',  rps: 100,  desc: '10 Instances',    icon: '🏃' },
  { label: '200 RPS',  rps: 200,  desc: '20 Instances',    icon: '🚀' },
];

export default function LoadGenPage() {
  const { projects, loadGeneratorActive, setLoadGeneratorActive, rateLimitConfig, rateLimitStats, toast } = useApp();
  const [starting, setStarting] = useState({});
  const [customRps, setCustomRps] = useState(50);

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');

  const start = async (projectName, rps) => {
    setStarting((s) => ({ ...s, [`${projectName}-${rps}`]: true }));
    try {
      await api.startLoadGenerator(projectName, rps);
      setLoadGeneratorActive((prev) => ({ ...prev, [projectName]: rps }));
      toast(`Load generator started: ${rps} RPS through gateway`, 'success');
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to start', 'error');
    } finally {
      setStarting((s) => ({ ...s, [`${projectName}-${rps}`]: false }));
    }
  };

  const stop = async (projectName) => {
    try {
      await api.stopLoadGenerator(projectName);
      setLoadGeneratorActive((prev) => { const n = { ...prev }; delete n[projectName]; return n; });
      toast('Load generator stopped', 'info');
    } catch (e) {
      toast('Failed to stop', 'error');
    }
  };

  if (runningProjects.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Load Generator</h1>
        </div>
        <div className="content-area">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40 }}>⚡</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12, color: 'var(--text-secondary)' }}>No running projects</div>
            <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-muted)' }}>Deploy a project first to generate load</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Load Generator</h1>
          <div className="page-sub">Real HTTP traffic through the gateway → rate limiter → load balancer → app</div>
        </div>
      </div>

      <div className="content-area">
        <div style={{ padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--accent)' }}>ℹ</span>
          <span>
            Traffic flows as <strong style={{ color: 'var(--text-secondary)' }}>real HTTP GET /health</strong> requests through the Resilify gateway.
            The rate limiter intercepts first — above-limit requests return <strong style={{ color: 'var(--yellow)' }}>HTTP 429</strong>.
            Current limit: <strong style={{ color: 'var(--accent)' }}>{rateLimitConfig.requestsPerSecond} req/s</strong>
          </span>
        </div>

        {runningProjects.map((project) => {
          const activeRps = loadGeneratorActive[project.name];
          const isActive = !!activeRps;

          return (
            <div key={project.name} className="card mb-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <CardTitle icon="⚡">{project.name}</CardTitle>
                  {isActive && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span className="status-dot green" />
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>{activeRps} RPS running</span>
                      <span style={{ color: 'var(--text-muted)' }}>→ real HTTP requests flowing</span>
                    </div>
                  )}
                </div>
                {isActive && (
                  <button className="btn btn-danger" onClick={() => stop(project.name)}>
                    ⏹ Stop Load
                  </button>
                )}
              </div>

              {/* Preset buttons */}
              <div className="mb-4">
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                  Presets
                </div>
                <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                  {PRESETS.map((preset) => {
                    const key = `${project.name}-${preset.rps}`;
                    const isThisActive = activeRps === preset.rps;
                    const willExceedRL = preset.rps > rateLimitConfig.requestsPerSecond;
                    return (
                      <button
                        key={preset.rps}
                        className={`btn ${isThisActive ? 'btn-success' : willExceedRL ? 'btn-warning' : 'btn-ghost'}`}
                        style={{ minWidth: 100, flexDirection: 'column', gap: 2, height: 'auto', padding: '10px 14px' }}
                        onClick={() => start(project.name, preset.rps)}
                        disabled={starting[key]}
                      >
                        {starting[key] ? <Spinner size={14} /> : <span style={{ fontSize: 18 }}>{preset.icon}</span>}
                        <span style={{ fontWeight: 700 }}>{preset.label}</span>
                        <span style={{ fontSize: 10, opacity: 0.8 }}>{preset.desc}</span>
                        {willExceedRL && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>EXCEEDS LIMIT</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom RPS */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Custom RPS</div>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max="5000"
                    value={customRps}
                    onChange={(e) => setCustomRps(Number(e.target.value))}
                    style={{ maxWidth: 140 }}
                  />
                </div>
                <button className="btn btn-primary" onClick={() => start(project.name, customRps)}>
                  Start {customRps} RPS
                </button>
              </div>

              {/* Expected behavior */}
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg-base)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Expected behavior:</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: `≤ ${rateLimitConfig.requestsPerSecond} RPS`, result: '→ All allowed', color: 'var(--green)' },
                    { label: `> ${rateLimitConfig.requestsPerSecond} RPS`, result: '→ Excess blocked (429)', color: 'var(--yellow)' },
                    { label: `> ${project.scaling?.requestsPerSecondThreshold ?? 50} RPS sustained`, result: '→ Scale-up triggered', color: 'var(--accent)' },
                  ].map((b) => (
                    <div key={b.label}>
                      <span>{b.label} </span>
                      <span style={{ color: b.color, fontWeight: 600 }}>{b.result}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Rate limit context */}
        <div className="card">
          <CardTitle icon="📊">Live Rate Limit Impact</CardTitle>
          <div className="grid-2">
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--green)', fontFamily: 'JetBrains Mono' }}>
                {formatNumber(rateLimitStats?.allowed ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Requests Allowed Through</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--yellow)', fontFamily: 'JetBrains Mono' }}>
                {formatNumber(rateLimitStats?.rateLimited ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Requests Blocked (HTTP 429)</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="flex justify-between" style={{ fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Traffic allowed vs blocked</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {rateLimitStats?.received ? ((rateLimitStats.allowed / rateLimitStats.received) * 100).toFixed(1) : 100}% pass-through
              </span>
            </div>
            <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
              <div style={{
                height: '100%',
                background: 'var(--green)',
                width: rateLimitStats?.received ? `${(rateLimitStats.allowed / rateLimitStats.received) * 100}%` : '100%',
                transition: 'width 0.5s ease',
              }} />
              <div style={{
                height: '100%',
                background: 'var(--yellow)',
                flex: 1,
              }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
