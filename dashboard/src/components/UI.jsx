import React from 'react';

export function getStatusColor(status) {
  switch (status?.toUpperCase()) {
    case 'HEALTHY':     return 'green';
    case 'STARTING':    return 'blue';
    case 'DRAINING':    return 'orange';
    case 'UNHEALTHY':   return 'yellow';
    case 'FAILED':      return 'red';
    case 'STOPPING':    return 'orange';
    case 'STOPPED':     return 'gray';
    case 'RUNNING':     return 'green';
    case 'DEPLOYING':   return 'blue';
    case 'CREATED':     return 'gray';
    default:            return 'gray';
  }
}

export function StatusBadge({ status }) {
  const color = getStatusColor(status);
  return (
    <span className={`badge ${color}`}>
      <span className={`status-dot ${color}`} />
      {status}
    </span>
  );
}

export function MetricBar({ value, max = 100, color = 'var(--accent)' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = pct > 80 ? 'var(--red)' : pct > 60 ? 'var(--yellow)' : color;
  return (
    <div className="progress-bar">
      <div
        className="progress-fill"
        style={{ width: `${pct}%`, '--bar-color': barColor, background: barColor }}
      />
    </div>
  );
}

export function StatCard({ label, value, sub, accentColor, icon }) {
  return (
    <div className="stat-card" style={{ '--accent-color': accentColor || 'var(--accent)' }}>
      <div className="stat-label">{icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

export function EmptyState({ icon = '📭', title, sub, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function CardTitle({ icon, children }) {
  return (
    <div className="card-title">
      {icon && <span className="ct-icon">{icon}</span>}
      {children}
    </div>
  );
}

export function formatUptime(createdAt) {
  if (!createdAt) return '—';
  const ms = Date.now() - new Date(createdAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatNumber(n) {
  if (n === undefined || n === null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function RateMeter({ current, max, label }) {
  const pct = Math.min(100, (current / max) * 100);
  const color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : 'var(--green)';
  return (
    <div>
      <div className="flex justify-between items-center mb-2" style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color, fontWeight: 700, fontFamily: 'JetBrains Mono' }}>
          {Math.round(current)} / {max} req/s
        </span>
      </div>
      <div className="rate-meter">
        <div className="rate-meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children, actions }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        {children}
        {actions && (
          <div className="modal-actions">{actions}</div>
        )}
      </div>
    </div>
  );
}
