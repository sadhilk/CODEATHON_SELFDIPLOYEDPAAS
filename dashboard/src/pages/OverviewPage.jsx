import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatCard, formatNumber, CardTitle, EmptyState } from '../components/UI';
import EventLog from '../components/EventLog';
import * as api from '../api';

export default function OverviewPage() {
  const { projects, metricsMap, eventsMap, instancesMap, rateLimitConfig, rateLimitStats, connected } = useApp();
  const [systemHealth, setSystemHealth] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);

  useEffect(() => {
    api.getSystemHealth().then(({ data }) => setSystemHealth(data)).catch(() => {});
    api.getNetworkInfo().then(({ data }) => setNetworkInfo(data)).catch(() => {});
    const iv = setInterval(() => {
      api.getSystemHealth().then(({ data }) => setSystemHealth(data)).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');
  const totalInstances = Object.values(instancesMap).flat().filter((i) => i.status === 'HEALTHY').length;
  const failedInstances = Object.values(instancesMap).flat().filter((i) => i.status === 'FAILED').length;

  const totalAllowed = Object.values(metricsMap).reduce((s, m) => s + (m?.allowedRequests || 0), 0);
  const totalRateLimited = rateLimitStats?.rateLimited || 0;
  const totalSuccessful = Object.values(metricsMap).reduce((s, m) => s + (m?.successfulRequests || 0), 0);
  const totalFailed = Object.values(metricsMap).reduce((s, m) => s + (m?.failedRequests || 0), 0);
  const totalRecovered = Object.values(metricsMap).reduce((s, m) => s + (m?.recoveredRequests || 0), 0);

  const avgAvailability = runningProjects.length > 0
    ? (runningProjects.reduce((s, p) => s + (metricsMap[p.name]?.availability || 100), 0) / runningProjects.length).toFixed(2)
    : 100;

  // Aggregate all events
  const allEvents = Object.values(eventsMap).flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 30);

  const healthComponents = [
    { label: 'Control Plane', status: connected ? '🟢' : '🔴' },
    { label: 'Gateway', status: runningProjects.length > 0 ? '🟢' : '⚪' },
    { label: 'Load Balancer', status: totalInstances > 0 ? '🟢' : '⚪' },
    { label: 'Application', status: totalInstances > 0 ? '🟢' : failedInstances > 0 ? '🔴' : '⚪' },
    { label: 'Database', status: systemHealth?.database === 'HEALTHY' ? '🟢' : '🔴' },
    { label: 'Rate Limiter', status: rateLimitConfig.enabled ? '🟢' : '⚪' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Overview</h1>
          <div className="page-sub">Real-time orchestration platform status</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            <span className={`status-dot ${connected ? 'green' : 'red'}`} />
            {connected ? 'Live Feed Active' : 'Disconnected'}
          </div>
        </div>
      </div>

      <div className="content-area">
        {/* LAN / Mobile Access Banner */}
        {networkInfo && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.05))',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📱</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>LAN & Mobile Network Access</span>
                <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>Active</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Open this URL in your phone's browser (connected to the same Wi-Fi) to test the Student Portal:
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href={networkInfo.gatewayUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  textDecoration: 'none',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                🎓 Student Portal: {networkInfo.gatewayUrl}
              </a>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }}>
                Dashboard: http://{networkInfo.lanIp}:3001
              </span>
            </div>
          </div>
        )}

        {/* Top stats */}
        <div className="stat-grid mb-4">
          <StatCard label="Running Projects" value={runningProjects.length} sub={`of ${projects.length} total`} accentColor="var(--accent)" icon="◈" />
          <StatCard label="Healthy Instances" value={totalInstances} sub={failedInstances > 0 ? `${failedInstances} failed` : 'All healthy'} accentColor="var(--green)" icon="●" />
          <StatCard label="Availability" value={`${avgAvailability}%`} accentColor="var(--cyan)" icon="↑" />
          <StatCard label="Requests Allowed" value={formatNumber(totalAllowed)} accentColor="var(--green)" icon="✓" />
          <StatCard label="Rate Limited" value={formatNumber(totalRateLimited)} sub="HTTP 429" accentColor="var(--yellow)" icon="⚡" />
          <StatCard label="Recovered" value={formatNumber(totalRecovered)} sub="auto-retried" accentColor="var(--accent-2)" icon="🔄" />
          <StatCard label="Failed" value={formatNumber(totalFailed)} accentColor="var(--red)" icon="✕" />
          <StatCard label="Rate Limit" value={`${rateLimitConfig.requestsPerSecond}/s`} sub={rateLimitConfig.enabled ? 'ACTIVE' : 'DISABLED'} accentColor={rateLimitConfig.enabled ? 'var(--yellow)' : 'var(--text-muted)'} icon="🛡" />
        </div>

        <div className="grid-2">
          {/* System Health */}
          <div className="card">
            <CardTitle icon="💓">System Health</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {healthComponents.map((h) => (
                <div key={h.label} className="flex justify-between items-center" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{h.label}</span>
                  <span style={{ fontSize: 16 }}>{h.status}</span>
                </div>
              ))}
            </div>

            <div className="divider" />

            <div className="flex justify-between" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Active Instances</span>
              <strong style={{ color: 'var(--text-primary)' }}>{totalInstances}</strong>
            </div>
            <div className="flex justify-between mt-2" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Failed Instances</span>
              <strong style={{ color: failedInstances > 0 ? 'var(--red)' : 'var(--green)' }}>{failedInstances}</strong>
            </div>
          </div>

          {/* Traffic summary */}
          <div className="card">
            <CardTitle icon="📊">Traffic Summary</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Received',     value: formatNumber(totalAllowed + totalRateLimited), color: 'var(--text-primary)' },
                { label: 'Allowed',      value: formatNumber(totalAllowed),       color: 'var(--green)' },
                { label: 'Rate Limited', value: formatNumber(totalRateLimited),    color: 'var(--yellow)' },
                { label: 'Successful',   value: formatNumber(totalSuccessful),     color: 'var(--green)' },
                { label: 'Failed',       value: formatNumber(totalFailed),         color: 'var(--red)' },
                { label: 'Recovered',    value: formatNumber(totalRecovered),      color: 'var(--accent-2)' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center" style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <strong style={{ color: row.color, fontFamily: 'JetBrains Mono', fontSize: 14 }}>{row.value}</strong>
                </div>
              ))}

              <div className="flex justify-between items-center" style={{ fontSize: 13, paddingTop: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>Availability</span>
                <strong style={{ color: 'var(--cyan)', fontSize: 16, fontFamily: 'JetBrains Mono' }}>{avgAvailability}%</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Running Projects */}
        {runningProjects.length > 0 && (
          <div className="card mt-4">
            <CardTitle icon="◈">Running Projects</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {runningProjects.map((p) => {
                const instances = instancesMap[p.name] || [];
                const healthy = instances.filter((i) => i.status === 'HEALTHY').length;
                const stats = metricsMap[p.name] || {};
                return (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{healthy}/{instances.length} healthy · v{p.currentVersion || 1}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Availability</div>
                        <div style={{ color: 'var(--cyan)', fontWeight: 700 }}>{stats.availability ?? 100}%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Instances</div>
                        <div style={{ color: 'var(--green)', fontWeight: 700 }}>{healthy}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {projects.length === 0 && (
          <EmptyState icon="🚀" title="No projects yet" sub="Create your first project to start orchestrating" />
        )}

        {/* Event Log */}
        {allEvents.length > 0 && (
          <div className="card mt-4">
            <CardTitle icon="📋">Recent Events</CardTitle>
            <EventLog events={allEvents} maxHeight={250} />
          </div>
        )}
      </div>
    </div>
  );
}
