import React from 'react';
import { useApp } from '../context/AppContext';
import { CardTitle, formatNumber } from '../components/UI';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';

export default function MetricsPage() {
  const { projects, metricsMap, instancesMap, rateLimitStats, rateLimitConfig } = useApp();

  const runningProjects = projects.filter((p) => p.status === 'RUNNING');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Metrics</h1>
        <div className="page-sub">Real measured values — no hardcoded numbers</div>
      </div>

      <div className="content-area">
        {/* Rate Limit Stats */}
        <div className="card mb-4">
          <CardTitle icon="🛡">Rate Limiter Metrics</CardTitle>
          <div className="grid-4" style={{ gap: 12 }}>
            {[
              { label: 'Total Received', value: formatNumber(rateLimitStats?.received ?? 0), color: 'var(--text-primary)' },
              { label: 'Allowed', value: formatNumber(rateLimitStats?.allowed ?? 0), color: 'var(--green)' },
              { label: 'Rate Limited', value: formatNumber(rateLimitStats?.rateLimited ?? 0), color: 'var(--yellow)' },
              { label: 'Limit', value: `${rateLimitConfig.requestsPerSecond}/s`, color: 'var(--accent)' },
            ].map((m) => (
              <div key={m.label} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: m.color, fontFamily: 'JetBrains Mono', marginTop: 6 }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Visual bar */}
          {(rateLimitStats?.received ?? 0) > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="flex justify-between" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>Allowed vs Blocked breakdown</span>
                <span>{(((rateLimitStats?.allowed ?? 0) / (rateLimitStats?.received ?? 1)) * 100).toFixed(1)}% pass-through</span>
              </div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
                <div style={{ height: '100%', background: 'var(--green)', width: `${((rateLimitStats?.allowed ?? 0) / (rateLimitStats?.received ?? 1)) * 100}%`, transition: 'width 0.5s' }} />
                <div style={{ height: '100%', background: 'var(--yellow)', flex: 1 }} />
              </div>
              <div className="flex gap-3 mt-2" style={{ fontSize: 11 }}>
                <span style={{ color: 'var(--green)' }}>■ Allowed</span>
                <span style={{ color: 'var(--yellow)' }}>■ Blocked</span>
              </div>
            </div>
          )}
        </div>

        {runningProjects.map((project) => {
          const instances = (instancesMap[project.name] || []).filter((i) => i.status !== 'STOPPED');
          const stats = metricsMap[project.name] || {};
          const healthyInstances = instances.filter((i) => i.status === 'HEALTHY');

          // Build bar chart data from instances
          const instanceChartData = healthyInstances.map((inst, idx) => ({
            name: `:${inst.port}`,
            cpu: inst.metrics?.cpu ?? 0,
            memory: inst.metrics?.memory ?? 0,
            requests: inst.metrics?.requestsServed ?? 0,
            active: inst.metrics?.activeRequests ?? 0,
          }));

          return (
            <div key={project.name} className="card mb-4">
              <CardTitle icon="📈">{project.name} — Metrics</CardTitle>

              {/* Traffic stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Availability', value: `${stats.availability ?? 100}%`, color: 'var(--cyan)' },
                  { label: 'Avg Latency', value: `${stats.avgLatency ?? 0}ms`, color: 'var(--accent)' },
                  { label: 'Allowed', value: formatNumber(stats.allowedRequests), color: 'var(--green)' },
                  { label: 'Rate Limited', value: formatNumber(stats.rateLimitedRequests), color: 'var(--yellow)' },
                  { label: 'Successful', value: formatNumber(stats.successfulRequests), color: 'var(--green)' },
                  { label: 'Failed', value: formatNumber(stats.failedRequests), color: 'var(--red)' },
                  { label: 'Recovered', value: formatNumber(stats.recoveredRequests), color: 'var(--accent-2)' },
                  { label: 'Instances', value: healthyInstances.length, color: 'var(--text-primary)' },
                ].map((m) => (
                  <div key={m.label} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: m.color, fontFamily: 'JetBrains Mono', marginTop: 4 }}>{m.value ?? '—'}</div>
                  </div>
                ))}
              </div>

              {/* Per-instance chart */}
              {instanceChartData.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Instance CPU & Memory
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={instanceChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(15,23,42,0.08)' }}
                        labelStyle={{ color: '#090d16', fontWeight: 700 }}
                        itemStyle={{ color: '#334155' }}
                      />
                      <Bar dataKey="cpu" name="CPU %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="memory" name="Memory MB" fill="#090d16" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Per-instance table */}
                  <div style={{ marginTop: 16, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono' }}>
                      <thead>
                        <tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {['Instance', 'Port', 'CPU', 'Memory', 'Requests', 'Active', 'Errors'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {instances.filter(i => i.status !== 'STOPPED').map((inst) => (
                          <tr key={inst.instanceId} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{inst.instanceId?.slice(-8)}</td>
                            <td style={{ padding: '8px', color: 'var(--accent)' }}>:{inst.port}</td>
                            <td style={{ padding: '8px', color: (inst.metrics?.cpu ?? 0) > 70 ? 'var(--red)' : 'var(--text-primary)' }}>{inst.metrics?.cpu ?? 0}%</td>
                            <td style={{ padding: '8px' }}>{inst.metrics?.memory ?? 0} MB</td>
                            <td style={{ padding: '8px' }}>{formatNumber(inst.metrics?.requestsServed)}</td>
                            <td style={{ padding: '8px', color: (inst.metrics?.activeRequests ?? 0) > 0 ? 'var(--cyan)' : 'var(--text-muted)' }}>{inst.metrics?.activeRequests ?? 0}</td>
                            <td style={{ padding: '8px', color: (inst.metrics?.failedRequests ?? 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{inst.metrics?.failedRequests ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {runningProjects.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12, color: 'var(--text-secondary)' }}>No running projects</div>
          </div>
        )}
      </div>
    </div>
  );
}
