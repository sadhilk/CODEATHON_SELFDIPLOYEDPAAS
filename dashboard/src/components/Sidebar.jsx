import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const navItems = [
  { to: '/', label: 'Overview', icon: '⬡', section: 'main' },
  { to: '/projects', label: 'Projects', icon: '◈', section: 'main' },
  { to: '/topology', label: 'Live Topology', icon: '⬡', section: 'main' },
  { to: '/instances', label: 'Instances', icon: '◉', section: 'main' },
  { to: '/gateway', label: 'Gateway & Rate Limit', icon: '⬟', section: 'traffic' },
  { to: '/load-gen', label: 'Load Generator', icon: '⚡', section: 'traffic' },
  { to: '/failure-lab', label: 'Failure Lab', icon: '🔥', section: 'testing' },
  { to: '/events', label: 'Event Timeline', icon: '📋', section: 'observability' },
  { to: '/metrics', label: 'Metrics', icon: '📈', section: 'observability' },
  { to: '/database', label: 'Database', icon: '🗄️', section: 'observability' },
];

const sections = {
  main: 'Platform',
  traffic: 'Traffic',
  testing: 'Testing',
  observability: 'Observability',
};

export default function Sidebar() {
  const { connected, projects } = useApp();
  const location = useLocation();

  const grouped = {};
  for (const item of navItems) {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section].push(item);
  }

  const runningProjects = projects.filter((p) => p.status === 'RUNNING').length;

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">⚙</div>
          <div>
            <div className="logo-text">Resilify</div>
            <div className="logo-sub">Orchestration Platform</div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            <span className={`status-dot ${connected ? 'green' : 'red'}`} />
            {connected ? 'Live' : 'Disconnected'}
          </div>
        </div>

        {runningProjects > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {runningProjects} project{runningProjects !== 1 ? 's' : ''} running
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {Object.entries(grouped).map(([section, items]) => (
          <div key={section}>
            <div className="nav-section-label">{sections[section]}</div>
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
        <div>Control Plane: <span style={{ color: 'var(--green)' }}>localhost:4000</span></div>
        <div style={{ marginTop: 4 }}>Gateway: <span style={{ color: 'var(--cyan)' }}>/apps/:project/*</span></div>
        <div style={{ marginTop: 8 }}>
          <a
            href="http://localhost:4000/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#38bdf8',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 12,
              padding: '4px 8px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              borderRadius: 4,
              border: '1px solid rgba(56, 189, 248, 0.25)',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <span>📜</span> Swagger API Docs ↗
          </a>
        </div>
      </div>
    </div>
  );
}
