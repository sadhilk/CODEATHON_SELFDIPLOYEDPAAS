import React, { useState, useEffect } from 'react';
import { CardTitle, Spinner } from '../components/UI';
import * as api from '../api';

export default function DatabasePage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const { data } = await api.getSystemHealth();
      setHealth(data);
    } catch (e) {
      setHealth({ database: 'UNHEALTHY', error: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const iv = setInterval(fetchHealth, 5000);
    return () => clearInterval(iv);
  }, []);

  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const mongoState = health?.mongoState ?? -1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Database</h1>
          <div className="page-sub">MongoDB status and management</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchHealth} disabled={loading}>
          {loading ? <Spinner size={12} /> : '↺'} Refresh
        </button>
      </div>

      <div className="content-area">
        <div className="grid-2">
          {/* Connection Status */}
          <div className="card">
            <CardTitle icon="🗄️">MongoDB Status</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                {
                  label: 'Primary',
                  value: health?.database === 'HEALTHY' ? '● Healthy' : '○ Unhealthy',
                  color: health?.database === 'HEALTHY' ? 'var(--green)' : 'var(--red)',
                },
                {
                  label: 'Connection State',
                  value: mongoState >= 0 ? stateNames[mongoState] || 'unknown' : '…',
                  color: mongoState === 1 ? 'var(--green)' : 'var(--red)',
                },
                {
                  label: 'URI',
                  value: 'mongodb://localhost:27017/resilify',
                  color: 'var(--accent)',
                  mono: true,
                },
                {
                  label: 'Database',
                  value: 'resilify',
                  color: 'var(--text-primary)',
                },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ color: row.color, fontFamily: row.mono ? 'JetBrains Mono' : 'inherit', fontSize: row.mono ? 11 : 13 }}>
                    {loading ? '…' : row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Collections */}
          <div className="card">
            <CardTitle icon="📁">Collections</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: 'projects', desc: 'Project configurations' },
                { name: 'instances', desc: 'Instance registry & metrics' },
                { name: 'events', desc: 'Orchestration event log' },
                { name: 'metrics', desc: 'Time-series traffic snapshots' },
              ].map((col) => (
                <div key={col.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'JetBrains Mono', color: 'var(--accent)' }}>{col.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{col.desc}</div>
                  </div>
                  <span className="badge green">Active</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Replica / Failover — clearly labelled as roadmap */}
        <div className="card mt-4">
          <CardTitle icon="🔄">Replica Set &amp; Failover</CardTitle>
          <div style={{ padding: '14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: 4 }}>⚠ Prototype / Roadmap</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              MongoDB replica-set failover is not active in this MVP. A single primary instance is used.
              The architecture is designed to support replica sets — the connection string can be updated to a replica-set URI.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Primary', status: health?.database === 'HEALTHY' ? '● Healthy' : '○ Checking…', color: health?.database === 'HEALTHY' ? 'var(--green)' : 'var(--text-muted)' },
              { label: 'Replica', status: '⚠ Not configured (Roadmap)', color: 'var(--yellow)' },
              { label: 'Replication', status: '⚠ Not active (Roadmap)', color: 'var(--yellow)' },
              { label: 'Last Backup', status: 'Not configured (Roadmap)', color: 'var(--text-muted)' },
            ].map((item) => (
              <div key={item.label} style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                <div style={{ fontSize: 13, color: item.color, marginTop: 6, fontWeight: 500 }}>{item.status}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <button className="btn btn-ghost btn-sm" disabled title="Roadmap feature">
              💾 Backup Now (Roadmap)
            </button>
            <button className="btn btn-ghost btn-sm" disabled title="Roadmap feature">
              ⚡ Simulate Primary Failure (Roadmap)
            </button>
          </div>
        </div>

        {/* What IS implemented */}
        <div className="card mt-4">
          <CardTitle icon="✅">What MongoDB Powers (MVP)</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[
              'Project configuration persistence (scaling, health, rate limit config)',
              'Instance registry — all real instances tracked with PID, port, status, metrics',
              'Event log — every orchestration action recorded with timestamp',
              'Traffic metrics — availability, latency, request counts',
              'Circuit breaker state per instance',
              'Health check state (consecutive failures, last success)',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2" style={{ padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                <span style={{ color: 'var(--green)' }}>✓</span>
                <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
